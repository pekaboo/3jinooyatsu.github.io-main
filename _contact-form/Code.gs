/**
 * @OnlyCurrentDoc
 *
 * 3時のおやつ 网站联系表单（开发・招聘・公司、各应用支持页）的接收端。
 * 把网站提交的内容记录到此表格、发送邮件通知、并通知到 Slack。
 *
 * 放置位置：粘贴到记录用表格的「扩展功能 → Apps Script」，并发布为 Web 应用（步骤见 README.md）。
 * 配置（Apps Script 的「项目设置 → 脚本属性」。修改后立即生效，无需重新部署）：
 *   SLACK_WEBHOOK_URL            Slack 的 Incoming Webhook URL（未设置时不发送 Slack）
 *   SLACK_WEBHOOK_URL_RECRUIT    仅招聘发送到其他频道时（_DEVELOPMENT / _COMPANY / _APP 同理）
 *   MAIL_TO                      通知邮件的收件地址（未设置时为 info@3jino-oyatsu.com）
 *   MAIL_TO_RECRUIT              仅招聘发送到其他地址时（_DEVELOPMENT / _COMPANY / _APP 同理）
 */

const DEFAULT_MAIL_TO = "info@3jino-oyatsu.com";
const TIME_ZONE = "Asia/Tokyo";

// 网站表单（data-form-type）→ 记录用工作表名与通知中的称呼
const FORMS = {
  development: { sheet: "开发咨询", label: "开发咨询" },
  recruit: { sheet: "招聘", label: "应聘・面谈" },
  company: { sheet: "咨询公司事宜", label: "咨询公司事宜" },
  // 各应用的支持页（具体应用记录在「应用」列中）
  app: { sheet: "应用咨询", label: "应用咨询" },
};

// 工作表最左侧固定放置的列。「处理状态」由团队自行更新
const BASE_COLUMNS = ["接收时间", "处理状态"];

// 自动提交持续不断时停止接收的阈值（10 分钟内可接收的条数）
const LIMIT_PER_10MIN = 30;

// 在浏览器打开 URL 时的动作确认用
function doGet() {
  return json_({ ok: true, service: "3jino-oyatsu contact form" });
}

function doPost(e) {
  try {
    const data = JSON.parse((e && e.parameter && e.parameter.payload) || "{}");
    // 人眼不可见的输入框（website）被填写即视为自动提交。假装接收并丢弃
    if (data.website) return json_({ ok: true });
    const entry = parse_(data);

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (overLimit_()) return json_({ ok: false, error: "busy" });
      // 即使记录或 Slack 失败，只要邮件送达即视为接收成功
      try {
        record_(entry);
      } catch (err) {
        console.error("记录到表格失败", err);
      }
    } finally {
      lock.releaseLock();
    }

    sendMail_(entry);
    try {
      notifySlack_(entry);
    } catch (err) {
      console.error("通知到 Slack 失败", err);
    }
    return json_({ ok: true });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: "failed" });
  }
}

// ---------- 校验接收到的内容 ----------
function parse_(data) {
  const type = String(data.form || "");
  if (!Object.prototype.hasOwnProperty.call(FORMS, type)) throw new Error(`未知表单：${type}`);
  // 姓名在应用支持表单中为选填。回复用的邮箱地址为必填
  const name = text_(data.name, 100);
  const email = text_(data.email, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("邮箱地址不正确");

  const fields = (Array.isArray(data.fields) ? data.fields : [])
    .slice(0, 40)
    .filter((f) => f && typeof f === "object")
    .map((f) => ({ label: text_(f.label, 60), value: text_(f.value, f.long ? 5000 : 500, Boolean(f.long)), long: Boolean(f.long) }))
    .filter((f) => f.label);
  const subject = text_(data.subject, 200) || `【${FORMS[type].label}】${name || email}`;
  return { type, name, email, subject, fields, at: new Date() };
}

// 转为字符串并去除首尾空白，限制长度。单行项目同时压掉换行
function text_(value, max, multiline) {
  let s = String(value == null ? "" : value).replace(/\r\n?/g, "\n").trim();
  if (!multiline) s = s.replace(/\s+/g, " ");
  return s.slice(0, max);
}

function overLimit_() {
  const cache = CacheService.getScriptCache();
  const count = Number(cache.get("recent") || 0) + 1;
  cache.put("recent", String(count), 600);
  return count > LIMIT_PER_10MIN;
}

// ---------- 向表格追加一行（每个表单一个工作表。项目增加时列也随之增加） ----------
function record_(entry) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const name = FORMS[entry.type].sheet;
  const sheet = book.getSheetByName(name) || book.insertSheet(name);

  const width = sheet.getLastColumn();
  const header = width ? sheet.getRange(1, 1, 1, width).getValues()[0].map(String) : [];
  const before = header.length;
  [...BASE_COLUMNS, ...entry.fields.map((f) => f.label)].forEach((label) => {
    if (!header.includes(label)) header.push(label);
  });
  if (header.length !== before) {
    sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  const values = { 接收时间: entry.at, 处理状态: "待处理" };
  // 前置「'」作为文本写入（避免以「=」开头的输入被当作公式・保留电话号码开头的 0）
  entry.fields.forEach((f) => {
    values[f.label] = f.value ? `'${f.value}` : "";
  });
  sheet.appendRow(header.map((label) => (label in values ? values[label] : "")));
}

// ---------- 邮件通知（直接回复即可送达咨询者） ----------
function sendMail_(entry) {
  const lines = [];
  entry.fields.forEach((f) => {
    if (f.long) lines.push("", `${f.label}：`, f.value || "-", "");
    else lines.push(`${f.label}：${f.value || "-"}`);
  });
  const body = [
    `此邮件来自网站的「${FORMS[entry.type].label}」表单。`,
    `回复此邮件，将发送给${entry.name ? `${entry.name}（${entry.email}）` : `${entry.email} `}。`,
    "",
    "――――――――――――――――",
    ...lines,
    "――――――――――――――――",
    `接收时间：${formatDate_(entry.at)}`,
  ].join("\n");

  MailApp.sendEmail({
    to: setting_("MAIL_TO", entry.type) || DEFAULT_MAIL_TO,
    subject: entry.subject,
    body,
    replyTo: entry.email,
    name: "3時のおやつ 联系表单",
  });
}

// ---------- 通知到 Slack ----------
function notifySlack_(entry) {
  const url = setting_("SLACK_WEBHOOK_URL", entry.type);
  if (!url) return;

  const filled = entry.fields.filter((f) => f.value);
  const short = filled.filter((f) => !f.long);
  const long = filled.filter((f) => f.long);
  const blocks = [{ type: "header", text: { type: "plain_text", text: clip_(entry.subject, 150) } }];
  for (let i = 0; i < short.length; i += 10) {
    blocks.push({
      type: "section",
      fields: short.slice(i, i + 10).map((f) => ({ type: "mrkdwn", text: `*${slack_(f.label)}*\n${clip_(slack_(f.value), 1900)}` })),
    });
  }
  long.forEach((f) => {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${slack_(f.label)}*\n${clip_(slack_(f.value), 2800)}` } });
  });
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `${formatDate_(entry.at)} 接收　<${sheetUrl_(entry)}|在表格中查看>` }],
  });

  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ text: `${FORMS[entry.type].label}：${entry.subject}`, blocks }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error(`Slack ${res.getResponseCode()}：${res.getContentText()}`);
}

function sheetUrl_(entry) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = book.getSheetByName(FORMS[entry.type].sheet);
  return book.getUrl() + (sheet ? `#gid=${sheet.getSheetId()}` : "");
}

// ---------- 工具函数 ----------
// 脚本属性。若存在 MAIL_TO_RECRUIT 这类按表单区分的值，则优先使用
function setting_(key, type) {
  const props = PropertiesService.getScriptProperties();
  return (props.getProperty(`${key}_${type.toUpperCase()}`) || props.getProperty(key) || "").trim();
}

function formatDate_(date) {
  return Utilities.formatDate(date, TIME_ZONE, "yyyy/MM/dd HH:mm");
}

function clip_(s, max) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// 还原 Slack 格式中有特殊含义的符号（避免 <!channel> 等触发全员通知）
function slack_(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
