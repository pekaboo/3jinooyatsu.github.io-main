(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SVG_NS = "http://www.w3.org/2000/svg";

  // ---------- 按时段切换配色（分配见 theme.js） ----------
  const { slotAt, jstHour } = window.siteTheme;
  let currentTheme = root.dataset.theme || "indigo";
  let shiftTimer;

  const setTheme = (id) => {
    if (id === currentTheme) return;
    if (!reduceMotion) {
      root.classList.add("is-theme-shifting");
      clearTimeout(shiftTimer);
      shiftTimer = setTimeout(() => root.classList.remove("is-theme-shifting"), 1300);
    }
    if (id === "indigo") delete root.dataset.theme;
    else root.dataset.theme = id;
    currentTheme = id;
  };
  setInterval(() => setTheme(slotAt(jstHour()).id), 30 * 1000);

  // ---------- Hero：逐字拆分 ----------
  let i = 0;
  document.querySelectorAll("[data-split] .hero-line").forEach((line) => {
    const text = line.textContent.trim();
    line.textContent = "";
    for (const ch of text) {
      const span = document.createElement("span");
      span.className = "ch";
      span.style.setProperty("--i", i++);
      span.textContent = ch;
      line.appendChild(span);
    }
  });

  const ready = () => root.classList.add("is-ready");
  if (document.fonts && document.fonts.ready) {
    Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 500))]).then(ready);
  } else {
    ready();
  }

  // ---------- 表盘：生成刻度・数字・弧线 ----------
  const nums = document.querySelector("[data-dial-nums]");

  document.querySelectorAll("[data-dial-ticks]").forEach((ticks) => {
    for (let t = 0; t < 60; t++) {
      const major = t % 5 === 0;
      const a = (t * 6 * Math.PI) / 180;
      const r1 = 300;
      const r2 = major ? 276 : 288;
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", (Math.sin(a) * r1).toFixed(2));
      line.setAttribute("y1", (-Math.cos(a) * r1).toFixed(2));
      line.setAttribute("x2", (Math.sin(a) * r2).toFixed(2));
      line.setAttribute("y2", (-Math.cos(a) * r2).toFixed(2));
      if (major) line.classList.add("is-major");
      ticks.appendChild(line);
    }
  });

  if (nums) {
    for (let h = 1; h <= 12; h++) {
      if (h === 3) continue; // 3 点的位置是「15:00」标签
      const a = (h * 30 * Math.PI) / 180;
      const text = document.createElementNS(SVG_NS, "text");
      text.setAttribute("x", (Math.sin(a) * 252).toFixed(2));
      text.setAttribute("y", (-Math.cos(a) * 252).toFixed(2));
      text.textContent = String(h).padStart(2, "0");
      nums.appendChild(text);
    }
  }

  // 用弧线标出 14:00〜15:00（点心前的一小时）
  const arcPoint = (deg) => {
    const a = (deg * Math.PI) / 180;
    return `${(Math.sin(a) * 300).toFixed(2)} ${(-Math.cos(a) * 300).toFixed(2)}`;
  };
  document.querySelectorAll("[data-dial-arc]").forEach((arc) => {
    arc.setAttribute("d", `M ${arcPoint(60)} A 300 300 0 0 1 ${arcPoint(90)}`);
  });

  // ---------- 时刻（JST） ----------
  const hands = {
    h: document.querySelector('[data-hand="h"]'),
    m: document.querySelector('[data-hand="m"]'),
    s: document.querySelector('[data-hand="s"]'),
  };
  const clockEls = document.querySelectorAll("[data-clock]");
  const countdownEls = document.querySelectorAll("[data-countdown]");
  const clockSmallEl = document.querySelector("[data-clock-small]");
  const pad = (n) => String(n).padStart(2, "0");
  const JST_OFFSET = 9 * 3600 * 1000;

  let lastSecond = -1;

  const tick = () => {
    const now = Date.now();
    const jst = new Date(now + JST_OFFSET);
    const h = jst.getUTCHours();
    const m = jst.getUTCMinutes();
    const s = jst.getUTCSeconds();
    const ms = jst.getUTCMilliseconds();

    const sec = reduceMotion ? s : s + ms / 1000;
    if (hands.s) hands.s.setAttribute("transform", `rotate(${(sec * 6).toFixed(3)})`);
    if (hands.m) hands.m.setAttribute("transform", `rotate(${((m + sec / 60) * 6).toFixed(3)})`);
    if (hands.h) hands.h.setAttribute("transform", `rotate(${(((h % 12) + m / 60 + sec / 3600) * 30).toFixed(3)})`);

    if (s !== lastSecond) {
      lastSecond = s;
      const time = `${pad(h)}:${pad(m)}:${pad(s)}`;
      clockEls.forEach((el) => (el.textContent = time));
      if (clockSmallEl) clockSmallEl.textContent = `日本时间 ${pad(h)}:${pad(m)}`;

      let countdown;
      const minutesOfDay = h * 60 + m;
      if (minutesOfDay >= 15 * 60 && minutesOfDay < 15 * 60 + 15) {
        countdown = "现在是下午 3 点，休息一下吧。";
      } else {
        let diff = 15 * 3600 - (h * 3600 + m * 60 + s);
        if (diff <= 0) diff += 24 * 3600;
        countdown = `距离 15:00 还有 ${pad(Math.floor(diff / 3600))}:${pad(Math.floor((diff % 3600) / 60))}:${pad(diff % 60)}`;
      }
      countdownEls.forEach((el) => (el.textContent = countdown));
    }

    if (reduceMotion) {
      setTimeout(tick, 1000 - ms);
    } else {
      requestAnimationFrame(tick);
    }
  };
  tick();

  // ---------- Hero：朝向现在是 15 点时段的城市 ----------
  // 世界时区横跨 UTC-12〜+14，任何时刻总有城市处于 15 点时段
  const globe = document.querySelector("[data-globe]");
  if (globe && window.GLOBE_LAND) {
    const canvas = globe.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const pin = globe.querySelector("[data-globe-pin]");
    const pinName = globe.querySelector("[data-globe-name]");
    const pinCountry = globe.querySelector("[data-globe-country]");
    const pinCountryEn = globe.querySelector("[data-globe-country-en]");
    const pinNameRow = globe.querySelector(".globe-pin-name");
    const pinCountryRow = globe.querySelector(".globe-pin-country");
    const placeEl = globe.querySelector("[data-globe-place]");
    const timeEl = globe.querySelector("[data-globe-time]");
    const ringSvg = globe.querySelector(".globe-ring");
    const arcTop = globe.querySelector('[data-globe-arc="top"]');
    const arcBottom = globe.querySelector('[data-globe-arc="bottom"]');
    const RAD = Math.PI / 180;

    // 陆地点：保存经度和纬度的 sin・cos
    const bin = Uint8Array.from(atob(window.GLOBE_LAND), (c) => c.charCodeAt(0));
    const view = new DataView(bin.buffer);
    const count = bin.length / 4;
    const dotLon = new Float32Array(count);
    const dotSin = new Float32Array(count);
    const dotCos = new Float32Array(count);
    const dotZone = new Int8Array(count);
    for (let k = 0; k < count; k++) {
      const lat = (view.getInt16(k * 4 + 2, true) / 10) * RAD;
      const lon = view.getInt16(k * 4, true) / 10;
      dotLon[k] = lon * RAD;
      dotZone[k] = Math.round(lon / 15);
      dotSin[k] = Math.sin(lat);
      dotCos[k] = Math.cos(lat);
    }

    // 也包含不实行夏令时的城市，保证任何时间都能找到 15 点时段的城市
    const CITIES = [
      ["东京", "Tokyo", "日本", "Japan", "Asia/Tokyo", 139.69, 35.69],
      ["巴黎", "Paris", "法国", "France", "Europe/Paris", 2.35, 48.86],
      ["纽约", "New York", "美国", "USA", "America/New_York", -74.01, 40.71],
      ["伦敦", "London", "英国", "UK", "Europe/London", -0.13, 51.51],
      ["首尔", "Seoul", "韩国", "South Korea", "Asia/Seoul", 126.98, 37.57],
      ["新加坡", "Singapore", "新加坡", "Singapore", "Asia/Singapore", 103.82, 1.35],
      ["曼谷", "Bangkok", "泰国", "Thailand", "Asia/Bangkok", 100.5, 13.76],
      ["迪拜", "Dubai", "阿联酋", "UAE", "Asia/Dubai", 55.27, 25.2],
      ["伊斯坦布尔", "Istanbul", "土耳其", "Türkiye", "Europe/Istanbul", 28.98, 41.01],
      ["开罗", "Cairo", "埃及", "Egypt", "Africa/Cairo", 31.24, 30.04],
      ["罗马", "Rome", "意大利", "Italy", "Europe/Rome", 12.5, 41.9],
      ["柏林", "Berlin", "德国", "Germany", "Europe/Berlin", 13.4, 52.52],
      ["洛杉矶", "Los Angeles", "美国", "USA", "America/Los_Angeles", -118.24, 34.05],
      ["悉尼", "Sydney", "澳大利亚", "Australia", "Australia/Sydney", 151.21, -33.87],
      ["台北", "Taipei", "中国台湾", "Taiwan", "Asia/Taipei", 121.56, 25.03],
      ["上海", "Shanghai", "中国", "China", "Asia/Shanghai", 121.47, 31.23],
      ["德里", "Delhi", "印度", "India", "Asia/Kolkata", 77.21, 28.61],
      ["檀香山", "Honolulu", "美国夏威夷州", "USA", "Pacific/Honolulu", -157.86, 21.31],
      ["圣保罗", "São Paulo", "巴西", "Brazil", "America/Sao_Paulo", -46.63, -23.55],
      ["墨西哥城", "Mexico City", "墨西哥", "Mexico", "America/Mexico_City", -99.13, 19.43],
      ["奥克兰", "Auckland", "新西兰", "New Zealand", "Pacific/Auckland", 174.76, -36.85],
      ["芝加哥", "Chicago", "美国", "USA", "America/Chicago", -87.63, 41.88],
      ["里斯本", "Lisbon", "葡萄牙", "Portugal", "Europe/Lisbon", -9.14, 38.72],
      ["莫斯科", "Moscow", "俄罗斯", "Russia", "Europe/Moscow", 37.62, 55.76],
      ["内罗毕", "Nairobi", "肯尼亚", "Kenya", "Africa/Nairobi", 36.82, -1.29],
      ["约翰内斯堡", "Johannesburg", "南非", "South Africa", "Africa/Johannesburg", 28.05, -26.2],
      ["拉各斯", "Lagos", "尼日利亚", "Nigeria", "Africa/Lagos", 3.38, 6.52],
      ["雅典", "Athens", "希腊", "Greece", "Europe/Athens", 23.73, 37.98],
      ["雅加达", "Jakarta", "印度尼西亚", "Indonesia", "Asia/Jakarta", 106.85, -6.21],
      ["达卡", "Dhaka", "孟加拉国", "Bangladesh", "Asia/Dhaka", 90.41, 23.81],
      ["加德满都", "Kathmandu", "尼泊尔", "Nepal", "Asia/Kathmandu", 85.32, 27.72],
      ["卡拉奇", "Karachi", "巴基斯坦", "Pakistan", "Asia/Karachi", 67.01, 24.86],
      ["塔什干", "Tashkent", "乌兹别克斯坦", "Uzbekistan", "Asia/Tashkent", 69.24, 41.3],
      ["德黑兰", "Tehran", "伊朗", "Iran", "Asia/Tehran", 51.39, 35.69],
      ["珀斯", "Perth", "澳大利亚", "Australia", "Australia/Perth", 115.86, -31.95],
      ["布里斯班", "Brisbane", "澳大利亚", "Australia", "Australia/Brisbane", 153.03, -27.47],
      ["关岛", "Guam", "美属关岛", "Guam", "Pacific/Guam", 144.79, 13.44],
      ["努美阿", "Nouméa", "新喀里多尼亚", "New Caledonia", "Pacific/Noumea", 166.46, -22.26],
      ["苏瓦", "Suva", "斐济", "Fiji", "Pacific/Fiji", 178.44, -18.14],
      ["努库阿洛法", "Nukuʻalofa", "汤加", "Tonga", "Pacific/Tongatapu", -175.2, -21.14],
      ["阿皮亚", "Apia", "萨摩亚", "Samoa", "Pacific/Apia", -171.76, -13.83],
      ["基里蒂马蒂", "Kiritimati", "基里巴斯", "Kiribati", "Pacific/Kiritimati", -157.36, 1.87],
      ["帕果帕果", "Pago Pago", "美属萨摩亚", "American Samoa", "Pacific/Pago_Pago", -170.7, -14.28],
      ["安克雷奇", "Anchorage", "美国阿拉斯加州", "USA", "America/Anchorage", -149.9, 61.22],
      ["甘比尔群岛", "Gambier", "法属波利尼西亚", "French Polynesia", "Pacific/Gambier", -134.97, -23.12],
      ["皮特凯恩群岛", "Pitcairn", "英属皮特凯恩群岛", "Pitcairn Islands", "Pacific/Pitcairn", -130.1, -25.07],
      ["温哥华", "Vancouver", "加拿大", "Canada", "America/Vancouver", -123.12, 49.28],
      ["菲尼克斯", "Phoenix", "美国", "USA", "America/Phoenix", -112.07, 33.45],
      ["丹佛", "Denver", "美国", "USA", "America/Denver", -104.99, 39.74],
      ["利马", "Lima", "秘鲁", "Peru", "America/Lima", -77.04, -12.05],
      ["多伦多", "Toronto", "加拿大", "Canada", "America/Toronto", -79.38, 43.65],
      ["加拉加斯", "Caracas", "委内瑞拉", "Venezuela", "America/Caracas", -66.9, 10.48],
      ["圣地亚哥", "Santiago", "智利", "Chile", "America/Santiago", -70.67, -33.45],
      ["布宜诺斯艾利斯", "Buenos Aires", "阿根廷", "Argentina", "America/Argentina/Buenos_Aires", -58.38, -34.6],
      ["费尔南多·迪诺罗尼亚", "Noronha", "巴西", "Brazil", "America/Noronha", -32.42, -3.85],
      ["普拉亚", "Praia", "佛得角", "Cape Verde", "Atlantic/Cape_Verde", -23.51, 14.93],
      ["亚速尔群岛", "Azores", "葡萄牙", "Portugal", "Atlantic/Azores", -25.67, 37.74],
      ["雷克雅未克", "Reykjavík", "冰岛", "Iceland", "Atlantic/Reykjavik", -21.94, 64.15],
    ].map(([ja, en, country, countryEn, tz, lon, lat]) => {
      let fmt = null;
      try {
        fmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      } catch (e) {}
      return { ja, en, country, countryEn, lon, lat, fmt };
    });

    const localTime = (city, now) => {
      const parts = city.fmt.formatToParts(now);
      const get = (type) => Number(parts.find((p) => p.type === type).value);
      return { h: get("hour"), m: get("minute") };
    };
    const citiesAt3 = (now) => CITIES.filter((c) => c.fmt && localTime(c, now).h === 15);

    // 视角（中心的经度・纬度）。以城市稍偏南的位置为中心，让城市出现在地球中间偏上
    const viewFor = (city) => ({ lon: city.lon, lat: Math.max(-40, Math.min(45, city.lat * 0.85)) });
    const wrap180 = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;
    // 部分 canvas 浏览器不支持 color-mix()，所以自行混合十六进制颜色
    const toRgb = (hex) => {
      const h = hex.replace("#", "");
      const full = h.length === 3 ? h.replace(/./g, "$&$&") : h;
      const n = parseInt(full.slice(0, 6), 16);
      return Number.isNaN(n) ? [255, 255, 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const mix = (a, b, t) => {
      const x = toRgb(a);
      const y = toRgb(b);
      return `rgb(${x.map((v, i) => Math.round(v * t + y[i] * (1 - t))).join(",")})`;
    };
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    // 点的颜色：该地当地时刻所属时段的颜色（与 site.css 各主题的 --signal 同色）
    const SLOT_COLORS = { lime: "#3D7A00", cobalt: "#155EEF", berry: "#D1246E", mono: "#FF5A1F", indigo: "#4F46F0", teal: "#0E8C86" };

    let size = 0;
    let dpr = 1;
    let geo = { R: 0, ring: 0 };
    let colors = {};
    let current = null;
    let cur = { lon: 139.69, lat: 15 };
    let drag = { lon: 0, lat: 0 };
    let anim = null;
    let frame = 0;

    const readColors = () => {
      const cs = getComputedStyle(globe);
      colors = {
        ink: cs.getPropertyValue("--ink").trim(),
        line: cs.getPropertyValue("--line-strong").trim(),
        paper: cs.getPropertyValue("--paper").trim(),
      };
    };

    const draw = () => {
      if (!size) return;
      const now = new Date();
      const W = size;
      const cx = W / 2;
      const cy = W / 2;
      const R = geo.R;
      const lon0 = (cur.lon + drag.lon) * RAD;
      const lat0 = Math.max(-60, Math.min(60, cur.lat + drag.lat)) * RAD;
      const sin0 = Math.sin(lat0);
      const cos0 = Math.cos(lat0);

      // 太阳直射点（用于区分昼夜边界）
      const ut = now.getUTCHours() + now.getUTCMinutes() / 60;
      const dayOfYear = Math.floor((now - Date.UTC(now.getUTCFullYear(), 0, 0)) / 864e5);
      const sunLon = wrap180((12 - ut) * 15) * RAD;
      const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10)) * RAD;
      const sunSin = Math.sin(decl);
      const sunCos = Math.cos(decl);

      // 插针城市周围的点，稍大稍浓
      const focus = current;
      const fLon = focus ? focus.lon * RAD : 0;
      const fSin = focus ? Math.sin(focus.lat * RAD) : 0;
      const fCos = focus ? Math.cos(focus.lat * RAD) : 0;
      const glowEdge = Math.cos(34 * RAD);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, W);

      // 球体：微微着色的表面和轮廓线
      const fill = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      fill.addColorStop(0, colors.paper);
      fill.addColorStop(1, mix(colors.ink, colors.paper, 0.04));
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = colors.line;
      ctx.stroke();

      // 外圈环
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(cx, cy, geo.ring, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // 每 15 度一条经线（一小时时差），淡淡地画出
      ctx.strokeStyle = colors.ink;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.07;
      for (let m = -180; m < 180; m += 15) {
        const dl = m * RAD - lon0;
        ctx.beginPath();
        let open = false;
        for (let p = -90; p <= 90; p += 4) {
          const phi = p * RAD;
          const sp = Math.sin(phi);
          const cp = Math.cos(phi);
          const cosc = sin0 * sp + cos0 * cp * Math.cos(dl);
          if (cosc < 0) {
            open = false;
            continue;
          }
          const x = cx + R * cp * Math.sin(dl);
          const y = cy - R * (cos0 * sp - sin0 * cp * Math.cos(dl));
          if (open) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
          open = true;
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 把城市标记（HTML）放到地球上方对应位置。
      // 挖空标签文字下方的点，让文字在彩色点上也可读
      const holes = [];
      if (focus) {
        const dl = fLon - lon0;
        const cosc = sin0 * fSin + cos0 * fCos * Math.cos(dl);
        const x = cx + R * fCos * Math.sin(dl);
        const y = cy - R * (cos0 * fSin - sin0 * fCos * Math.cos(dl));
        pin.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        pin.classList.toggle("is-left", x > cx + R * 0.2);
        pin.classList.toggle("is-down", y < cy - R * 0.15);
        pin.classList.toggle("is-on", cosc > 0.15 && !anim?.hidePin);
        if (pin.classList.contains("is-on") && pin.classList.contains("is-drawn")) {
          const base = canvas.getBoundingClientRect();
          [pinNameRow, pinCountryRow].forEach((el) => {
            const b = el.getBoundingClientRect();
            holes.push([b.left - base.left - 4, b.top - base.top - 2, b.right - base.left + 4, b.bottom - base.top + 2]);
          });
        }
      }

      // 各时区的颜色（时差 -12〜+12 小时）
      const zoneColor = [];
      for (let z = -12; z <= 12; z++) {
        const hour = Math.floor((((ut + z) % 24) + 24) % 24);
        zoneColor.push(SLOT_COLORS[slotAt(hour).id]);
      }

      // 陆地点：远处更小，夜侧更淡
      const dotR = Math.max(1, R / 115);
      for (let k = 0; k < count; k++) {
        const dl = dotLon[k] - lon0;
        const cdl = Math.cos(dl);
        const cosc = sin0 * dotSin[k] + cos0 * dotCos[k] * cdl;
        if (cosc <= 0.02) continue;
        const x = cx + R * dotCos[k] * Math.sin(dl);
        const y = cy - R * (cos0 * dotSin[k] - sin0 * dotCos[k] * cdl);
        const sun = dotSin[k] * sunSin + dotCos[k] * sunCos * Math.cos(dotLon[k] - sunLon);
        const day = Math.max(0, Math.min(1, (sun + 0.08) / 0.2));
        const depth = 0.35 + 0.65 * cosc;
        let r = dotR * (0.5 + 0.5 * cosc);
        let alpha = (0.34 + 0.56 * day) * depth;

        if (focus) {
          const near = fSin * dotSin[k] + fCos * dotCos[k] * Math.cos(dotLon[k] - fLon);
          if (near > glowEdge) {
            const g = Math.pow((near - glowEdge) / (1 - glowEdge), 1.2);
            r *= 1 + 0.45 * g;
            alpha = Math.min(1, alpha + 0.25 * g);
          }
        }

        for (const [left, top, right, bottom] of holes) {
          const gap = Math.hypot(Math.max(left - x, 0, x - right), Math.max(top - y, 0, y - bottom));
          if (gap < 10) alpha *= 0.04 + 0.96 * (gap / 10);
        }

        ctx.globalAlpha = alpha;
        ctx.fillStyle = zoneColor[dotZone[k] + 12];
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

    };

    const loop = (t) => {
      frame = 0;
      if (anim) {
        const p = Math.min(1, (t - anim.start) / anim.duration);
        const e = ease(p);
        cur = { lon: anim.from.lon + (anim.to.lon - anim.from.lon) * e, lat: anim.from.lat + (anim.to.lat - anim.from.lat) * e };
        if (anim.dragFrom) drag = { lon: anim.dragFrom.lon * (1 - e), lat: anim.dragFrom.lat * (1 - e) };
        if (p >= 1) {
          cur = { lon: wrap180(anim.to.lon), lat: anim.to.lat };
          anim = null;
        }
      }
      draw();
      if (anim) frame = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (!frame) frame = requestAnimationFrame(loop);
    };

    // 转向。westward: true 时，沿地球自转方向（向西）旋转
    const turnTo = (target, duration, opts = {}) => {
      if (reduceMotion || !duration) {
        cur = { lon: target.lon, lat: target.lat };
        drag = { lon: 0, lat: 0 };
        anim = null;
        kick();
        return;
      }
      let delta = wrap180(target.lon - cur.lon);
      if (opts.westward) delta = -((((cur.lon - target.lon) % 360) + 360) % 360);
      anim = {
        start: performance.now(),
        duration,
        from: { ...cur },
        to: { lon: cur.lon + delta, lat: target.lat },
        hidePin: !!opts.hidePin,
        dragFrom: opts.dragFrom,
      };
      kick();
    };

    // 城市名称像机场出发信息板一样，翻牌滚动后停下
    const FLAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let flapFrame = 0;
    const flapTo = (el, text) => {
      cancelAnimationFrame(flapFrame);
      el.style.width = "";
      el.textContent = text;
      if (reduceMotion) return;
      el.style.width = `${el.getBoundingClientRect().width}px`;
      const start = performance.now();
      const step = (t) => {
        const p = (t - start) / 700;
        let out = "";
        for (let i = 0; i < text.length; i++) {
          const settled = p >= 0.35 + (0.65 * i) / text.length;
          out += settled || text[i] === " " ? text[i] : FLAP[Math.floor(Math.random() * FLAP.length)];
        }
        el.textContent = out;
        if (p < 1) flapFrame = requestAnimationFrame(step);
        else el.style.width = "";
      };
      flapFrame = requestAnimationFrame(step);
    };

    // 标签：从点伸出引线，依次出现城市名（翻牌）和国家名
    const showLabel = (city) => {
      pin.classList.remove("is-drawn");
      pinCountryEn.textContent = city.countryEn.toUpperCase();
      pinCountry.textContent = city.country;
      flapTo(pinName, city.en.toUpperCase());
      pin.style.setProperty("--lw", `${Math.max(pinNameRow.offsetWidth, pinCountryRow.offsetWidth) + 4}px`);
      void pin.offsetWidth;
      pin.classList.add("is-drawn");
      kick();
    };

    // 选择要展示的城市。如有多座城市处于 15 点时段，则轮流切换
    let pickIndex = 0;
    const updateReadout = () => {
      if (!current) return;
      const { h, m } = localTime(current, new Date());
      const time = `${pad(h)}:${pad(m)}`;
      timeEl.textContent = time;
      placeEl.textContent = `现在，${current.country}的${current.ja}是${time}。世界的某个角落，总是「3時のおやつ」。`;
    };
    const choose = (opts) => {
      if (dragStart) return;
      const list = citiesAt3(new Date());
      if (!list.length) return;
      const next = list[pickIndex % list.length];
      pickIndex++;
      const changed = next !== current;
      current = next;
      if (changed) {
        const city = current;
        // 初次旋转期间隐藏标签，停下后再显示
        if (opts?.hidePin && !reduceMotion) setTimeout(() => showLabel(city), opts.duration);
        else showLabel(city);
      }
      updateReadout();
      if (changed || opts) turnTo(viewFor(current), opts?.duration ?? 1800, opts);
    };

    const resize = () => {
      const w = Math.round(globe.clientWidth);
      if (!w) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = w;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(w * dpr);

      // 先留出外圈文字带的空间，再决定环和地球的大小
      const fs = Math.max(9, Math.min(13, w * 0.026));
      const c = w / 2;
      const ring = c - 1 - fs * 1.25 - 6;
      geo = { R: ring - Math.max(6, w * 0.025), ring };
      const rTop = ring + 7;
      const rBottom = ring + 7 + fs * 0.78;
      ringSvg.setAttribute("viewBox", `0 0 ${w} ${w}`);
      ringSvg.style.fontSize = `${fs}px`;
      arcTop.setAttribute("d", `M ${c - rTop} ${c} A ${rTop} ${rTop} 0 0 1 ${c + rTop} ${c}`);
      arcBottom.setAttribute("d", `M ${c - rBottom} ${c} A ${rBottom} ${rBottom} 0 0 0 ${c + rBottom} ${c}`);
      kick();
    };

    // 东京与 15 点时段城市接近时（日本是白天的时间段），从稍偏东的位置开始旋转
    const first = citiesAt3(new Date())[0];
    if (first && (((cur.lon - first.lon) % 360) + 360) % 360 < 60) cur.lon = first.lon + 100;

    readColors();
    resize();
    new ResizeObserver(resize).observe(globe);
    new MutationObserver(() => {
      readColors();
      kick();
    }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    // 最初从日本（东京）出发，向西绕一圈转到现在 15 点时段的城市
    setTimeout(() => choose({ duration: 2800, westward: true, hidePin: true }), reduceMotion ? 0 : 450);
    setInterval(() => choose(), 8000);
    setInterval(() => {
      updateReadout();
      kick();
    }, 5000);

    // 可拖动旋转。松手后，缓缓回到现在 15 点时段的城市
    let dragStart = null;
    canvas.addEventListener("pointerdown", (e) => {
      dragStart = { x: e.clientX, y: e.clientY, lon: drag.lon, lat: drag.lat };
      anim = null;
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add("is-dragging");
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragStart) return;
      const k = 180 / (Math.PI * geo.R);
      drag = {
        lon: dragStart.lon - (e.clientX - dragStart.x) * k,
        lat: Math.max(-40, Math.min(40, dragStart.lat + (e.clientY - dragStart.y) * k)),
      };
      kick();
    });
    const release = () => {
      if (!dragStart) return;
      dragStart = null;
      canvas.classList.remove("is-dragging");
      if (current) turnTo(viewFor(current), 1400, { dragFrom: { ...drag } });
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
  }

  // ---------- About：2 点→3 点（分针转一周）的动画 ----------
  const animDial = document.querySelector("[data-dial-animate]");
  if (animDial && !reduceMotion && "IntersectionObserver" in window) {
    const hourHand = animDial.querySelector('[data-hand-static="h"]');
    const minuteHand = animDial.querySelector('[data-hand-static="m"]');
    const arc = animDial.querySelector("[data-dial-arc]");
    const now = animDial.querySelector("[data-dial-now]");
    const arcLength = arc.getTotalLength();
    arc.style.strokeDasharray = arcLength;

    const render = (p) => {
      hourHand.setAttribute("transform", `rotate(${60 + 30 * p})`);
      minuteHand.setAttribute("transform", `rotate(${360 * p})`);
      arc.style.strokeDashoffset = arcLength * (1 - p);
      now.textContent = p >= 1 ? "15:00" : `14:${pad(Math.floor(60 * p))}`;
    };
    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    render(0);
    animDial.classList.add("is-waiting");

    const play = () => {
      const start = performance.now();
      const duration = 2800;
      const step = (time) => {
        const t = Math.min((time - start) / duration, 1);
        render(easeInOut(t));
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          animDial.classList.remove("is-waiting");
          animDial.classList.add("is-three");
        }
      };
      requestAnimationFrame(step);
    };

    const dialObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          dialObserver.disconnect();
          setTimeout(play, 500);
        }
      },
      { threshold: 0.6 }
    );
    dialObserver.observe(animDial);
  }

  // ---------- 联系页：选择咨询类型（开发・招聘・公司）后，打开对应的专属表单 ----------
  const contactPick = document.querySelector("[data-contact-pick]");
  if (contactPick) {
    const cards = [...contactPick.querySelectorAll("[data-contact-to]")];
    const panels = new Map(cards.map((card) => [card.dataset.contactTo, document.getElementById(card.getAttribute("aria-controls"))]));
    const openPanel = (type) => {
      contactPick.classList.add("is-picked");
      cards.forEach((card) => {
        if (card.dataset.contactTo === type) card.setAttribute("aria-current", "true");
        else card.removeAttribute("aria-current");
      });
      panels.forEach((panel, key) => { panel.hidden = key !== type; });
    };
    document.addEventListener("click", (e) => {
      const link = e.target.closest("[data-contact-to]");
      if (!link || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      const type = link.dataset.contactTo;
      openPanel(type);
      history.replaceState(null, "", `?type=${type}`);
      contactPick.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });

    // 通过 ?type= 决定打开的表单，并用其他参数预先选好选项
    // （兼容旧版 ?type=product / other、?role=职位名、?topic=轻松面谈 的链接）
    const params = new URLSearchParams(location.search);
    const legacyTopic = { product: "product", other: "other" }[params.get("type")];
    const type = (legacyTopic || params.get("type") === "general") ? "company" : params.get("type");
    if (panels.has(type)) {
      openPanel(type);
      const form = panels.get(type).querySelector("form");
      const check = (name, value) => {
        const input = value && form.querySelector(`input[name="${name}"][value="${CSS.escape(value)}"]`);
        if (input) input.checked = true;
      };
      if (type === "development") check("kind", params.get("kind"));
      if (type === "company") check("topic", params.get("topic") || legacyTopic);
      if (type === "recruit") {
        const role = params.get("role");
        const option = role && [...form.elements.role.options].find((o) => o.value === role || o.text.startsWith(role));
        if (option) form.elements.role.value = option.value;
        // 兼容旧版日文链接参数 ?topic=カジュアル面談
        check("entry", params.get("kind") || (params.get("topic") === "カジュアル面談" ? "casual" : role ? "apply" : ""));
      }
      // 从其他页面按钮跳转过来时，跳过页面顶部，从「请选择咨询类型」开始显示
      // （加载途中高度未定会导致滚动不到位，因此等图片和文字加载完成后再滚动）
      const pickHead = document.querySelector(".cpick-head") || contactPick;
      const toForm = () => document.fonts.ready.then(() => pickHead.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }));
      if (document.readyState === "complete") toForm();
      else window.addEventListener("load", toForm, { once: true });
    }
  }

  // ---------- 联系表单（联系页・各应用支持页）：就地发送 ----------
  // 发送目标是 Google Apps Script 的 Web 应用（_contact-form/README.md）。清空或发送失败时改用邮件应用打开
  const CONTACT_ENDPOINT = "https://script.google.com/macros/s/AKfycbxfIG0UFjsjybp7tcpYAvUzTce7l6b8mqKfjP7VCSA6XNmIiM1Sf9R_3A2wkZZuhERaJQ/exec";
  // 单选・多选取选中的 data-label，下拉取显示名，其余取输入值
  const fieldValue = (field) => {
    if (field.tagName === "FIELDSET") return [...field.querySelectorAll("input:checked")].map((input) => input.dataset.label || input.value).join("、");
    if (field.tagName === "SELECT") return field.value ? field.selectedOptions[0].text : "";
    return field.value.trim();
  };
  const isActive = (field) => !field.disabled && !field.closest("[data-when][hidden]");

  document.querySelectorAll("[data-contact-form]").forEach((form) => {
    const status = form.querySelector("[data-form-status]");
    const button = form.querySelector('[type="submit"]');
    const done = form.querySelector("[data-form-done]");

    // 防自动提交：人眼不可见的输入框。若被填写，接收端（Apps Script）会丢弃
    const trap = document.createElement("div");
    trap.className = "cform-trap";
    trap.setAttribute("aria-hidden", "true");
    trap.innerHTML = '<label>请将此栏留空<input type="text" name="website" tabindex="-1" autocomplete="off" /></label>';
    form.append(trap);

    // 发送中，按钮变为旋转标记和「正在发送…」（宽度保持不变。失败后恢复原文字）
    const idleLabel = [...button.childNodes];
    const setSending = (on) => {
      button.disabled = on;
      button.classList.toggle("is-sending", on);
      if (on) {
        button.style.minWidth = `${button.offsetWidth}px`;
        const spinner = document.createElement("span");
        spinner.className = "btn-spinner";
        spinner.setAttribute("aria-hidden", "true");
        button.replaceChildren(spinner, "正在发送…");
      } else {
        button.replaceChildren(...idleLabel);
        button.style.minWidth = "";
      }
    };

    // data-when="name:值,值" 的项目，仅在对应单选被选中时显示（隐藏期间不参与必填・提交）
    const conditionals = [...form.querySelectorAll("[data-when]")];
    const syncConditionals = () => {
      conditionals.forEach((el) => {
        const [name, values] = el.dataset.when.split(":");
        const current = form.querySelector(`input[name="${name}"]:checked`)?.value ?? "";
        const on = values.split(",").includes(current);
        el.hidden = !on;
        el.querySelectorAll("input, select, textarea").forEach((field) => { field.disabled = !on; });
      });
    };
    form.addEventListener("change", syncConditionals);
    syncConditionals();

    // 把带 data-mail-label 的项目按顺序汇总。主题形如【开发咨询】LINE 应用｜姓名，拼接 data-subject-part 的值
    // （姓名为选填且为空时，不加「｜姓名」）
    const collect = () => {
      const fields = [...form.querySelectorAll("[data-mail-label]")].filter(isActive).map((field) => ({
        label: field.dataset.mailLabel,
        value: fieldValue(field),
        long: field.tagName === "TEXTAREA",
      }));
      const parts = [...form.querySelectorAll("[data-subject-part]")].filter(isActive).map(fieldValue).filter(Boolean);
      const name = form.elements.name.value.trim();
      return { subject: `${form.dataset.subject}${parts.join("・")}${name ? `｜${name}` : ""}`, name, fields };
    };
    const mailtoOf = ({ subject, fields }) => {
      const lines = [];
      fields.forEach(({ label, value, long }) => {
        if (long) lines.push("", `${label}：`, value || "-", "");
        else lines.push(`${label}：${value || "-"}`);
      });
      return `mailto:${form.dataset.to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
    };
    const say = (state, ...content) => {
      status.dataset.state = state;
      status.replaceChildren(...content);
    };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (button.disabled) return;
      if (!form.checkValidity()) {
        say("error", "存在未填写的必填项。");
        form.reportValidity();
        return;
      }
      const mail = collect();
      if (!CONTACT_ENDPOINT) {
        window.location.href = mailtoOf(mail);
        say("info", `将打开邮件应用，请确认内容后发送。如未打开，请直接联系 ${form.dataset.to}。`);
        return;
      }

      setSending(true);
      form.setAttribute("aria-busy", "true");
      say("info", "可能需要几秒钟，请稍候。");
      try {
        const res = await fetch(CONTACT_ENDPOINT, {
          method: "POST",
          // 以表单格式发送，避免对 Apps Script 触发预检请求
          body: new URLSearchParams({
            payload: JSON.stringify({
              form: form.dataset.formType,
              email: form.elements.email.value.trim(),
              website: form.elements.website.value,
              ...mail,
            }),
          }),
          signal: AbortSignal.timeout?.(30000),
        });
        const result = await res.json();
        if (!result.ok) throw new Error(result.error);
        say("info");
        form.classList.add("is-sent");
        done.hidden = false;
        form.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        done.focus({ preventScroll: true });
      } catch {
        const fallback = document.createElement("a");
        fallback.href = mailtoOf(mail);
        fallback.textContent = "通过邮件应用发送";
        say("error", "发送失败。请稍后重试，或", fallback, "。");
        setSending(false);
      } finally {
        form.removeAttribute("aria-busy");
      }
    });
  });

  // ---------- 招聘：寄语文字随滚动逐渐加深 ----------
  const fillTexts = [...document.querySelectorAll("[data-fill-text]")];
  if (fillTexts.length && !reduceMotion) {
    const chars = new Map();
    fillTexts.forEach((el) => {
      const frag = document.createDocumentFragment();
      el.childNodes.forEach((node) => {
        if (node.nodeType !== Node.TEXT_NODE) {
          frag.appendChild(node.cloneNode(true));
          return;
        }
        for (const ch of node.textContent) {
          const span = document.createElement("span");
          span.className = "fc";
          span.textContent = ch;
          frag.appendChild(span);
        }
      });
      el.replaceChildren(frag);
      el.classList.add("is-split");
      chars.set(el, [...el.querySelectorAll(".fc")]);
    });

    const paint = () => {
      const start = innerHeight * 0.85;
      const end = innerHeight * 0.45;
      chars.forEach((list, el) => {
        const r = el.getBoundingClientRect();
        const p = Math.min(Math.max((start - r.top) / (r.height + start - end), 0), 1);
        const lit = Math.round(p * list.length);
        list.forEach((c, i) => c.classList.toggle("is-lit", i < lit));
      });
    };
    let queued = false;
    window.addEventListener(
      "scroll",
      () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          paint();
          queued = false;
        });
      },
      { passive: true }
    );
    paint();
  }

  // ---------- 招聘：想和这样的人一起工作。行滚到画面中部时，逐行浮现对焦 ----------
  const wantItems = document.querySelectorAll("[data-want] li");
  if (wantItems.length && "IntersectionObserver" in window && !reduceMotion) {
    const wantObserver = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.target.classList.toggle("is-on", e.isIntersecting || e.boundingClientRect.top < 0)),
      { rootMargin: "0px 0px -45% 0px" }
    );
    wantItems.forEach((li) => wantObserver.observe(li));
  } else {
    wantItems.forEach((li) => li.classList.add("is-on"));
  }

  // ---------- 招聘：照片细带与当前章节序号的显示 ----------
  const slits = reduceMotion ? [] : [...document.querySelectorAll("[data-slit]")];
  const counter = document.querySelector("[data-rcounter]");
  const chapters = [...document.querySelectorAll("[data-chapter]")];

  const paintSlits = () => {
    const vh = innerHeight;
    slits.forEach((s) => {
      const r = s.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      // 细带上缘到达屏幕下方 60% 高度前，从闭合的线到完全展开
      const t = Math.min(Math.max((vh - r.top) / (vh * 0.6), 0), 1);
      const open = 1 - (1 - t) * (1 - t);
      const travel = (r.top + r.height / 2 - vh / 2) / vh;
      s.style.setProperty("--slit-cut", `${((1 - open) * 50).toFixed(2)}%`);
      s.style.setProperty("--slit-y", `${(-travel * r.height * 0.4).toFixed(1)}px`);
    });
  };

  let currentChapter = -1;
  const paintCounter = () => {
    if (!counter || !chapters.length) return;
    const line = innerHeight * 0.5;
    let idx = -1;
    chapters.forEach((c, i) => {
      if (c.getBoundingClientRect().top <= line) idx = i;
    });
    const first = chapters[0].getBoundingClientRect().top;
    const last = chapters[chapters.length - 1].getBoundingClientRect().top;
    // 位于首屏时，以及最后的应募章节出现时隐藏（避免与应募按钮重叠）
    counter.classList.toggle("is-on", idx >= 0 && last > innerHeight * 0.85);
    counter.style.setProperty("--p", Math.min(Math.max((line - first) / (last - first), 0), 1).toFixed(3));
    if (idx < 0 || idx === currentChapter) return;
    currentChapter = idx;
    const name = counter.querySelector("[data-rcounter-name]");
    counter.querySelector("[data-rcounter-no]").textContent = pad(idx + 1);
    name.textContent = chapters[idx].dataset.chapter;
    const next = chapters[idx + 1];
    if (next) counter.querySelector("[data-rcounter-next]").setAttribute("aria-label", `前往下一章节（${next.dataset.chapter}）`);
    if (!reduceMotion) name.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 450, easing: "cubic-bezier(.2,.7,.2,1)" });
  };

  if (slits.length || counter) {
    slits.forEach((s) => s.classList.add("is-live"));
    counter?.querySelector("[data-rcounter-next]").addEventListener("click", () => {
      chapters[currentChapter + 1]?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    });
    let queued = false;
    const paintAll = () => {
      paintSlits();
      paintCounter();
      queued = false;
    };
    window.addEventListener(
      "scroll",
      () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(paintAll);
      },
      { passive: true }
    );
    window.addEventListener("resize", paintAll);
    paintAll();
  }

  // ---------- 招聘：职位筛选 ----------
  const filterButtons = document.querySelectorAll("[data-filter]");
  const positionCards = document.querySelectorAll(".pos-card");
  // 职位数量从列表统计，小字附在各按钮旁
  const countPositions = (filter) =>
    [...positionCards].filter((card) => card.dataset.cat !== "open" && (filter === "all" || card.dataset.cat === filter)).length;
  filterButtons.forEach((button) => {
    const num = document.createElement("span");
    num.className = "filter-num";
    num.textContent = countPositions(button.dataset.filter);
    button.append(num);
    button.addEventListener("click", () => {
      const filter = button.dataset.filter;
      filterButtons.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      positionCards.forEach((card) => {
        card.hidden = !(filter === "all" || card.dataset.cat === filter);
      });
      // 筛选后数量少，全部显示；切回「全部」时折叠为前 3 项
      setPositionsCollapsed(filter === "all");
    });
  });

  // ---------- 招聘：手机端先显示前 3 项，其余通过「查看全部职位」展开（CSS 仅在手机端生效） ----------
  const positionList = document.querySelector(".pos-rows");
  const positionMore = document.querySelector("[data-pos-more]");
  const POSITION_PREVIEW = 3;
  function setPositionsCollapsed(collapsed) {
    if (!positionList || !positionMore) return;
    const rest = positionCards.length - POSITION_PREVIEW;
    positionList.classList.toggle("is-collapsed", collapsed && rest > 0);
    positionList.classList.remove("is-opened");
    positionMore.hidden = !collapsed || rest <= 0;
    positionMore.setAttribute("aria-expanded", "false");
    positionMore.querySelector(".pos-more-label").textContent = "查看全部职位";
    positionMore.querySelector("[data-pos-more-count]").textContent = `还有 ${rest} 个`;
  }
  if (positionList && positionMore) {
    setPositionsCollapsed(true);
    positionMore.addEventListener("click", () => {
      const open = positionMore.getAttribute("aria-expanded") !== "true";
      positionList.classList.toggle("is-collapsed", !open);
      positionList.classList.toggle("is-opened", open);
      positionMore.setAttribute("aria-expanded", String(open));
      positionMore.querySelector(".pos-more-label").textContent = open ? "收起" : "查看全部职位";
      positionMore.querySelector("[data-pos-more-count]").textContent = open ? "" : `还有 ${positionCards.length - POSITION_PREVIEW} 个`;
    });
  }

  // ---------- 案例：把卡片配图也放到详情弹窗标题下方 ----------
  document.querySelectorAll(".case").forEach((card) => {
    const shot = card.querySelector(".case-shot");
    const id = card.querySelector("[data-open-dialog]")?.dataset.openDialog;
    const title = id && document.querySelector(`#dlg-${id} .rdlg-title`);
    if (shot && title) title.after(shot.cloneNode(true));
  });

  // ---------- 招聘：职位详情弹窗（#ios 等 URL 锚点也能打开） ----------
  const openRole = (id, updateHash) => {
    const dialog = document.getElementById(`dlg-${id}`);
    if (!dialog || dialog.open) return;
    dialog.showModal();
    if (updateHash) history.replaceState(null, "", `#${id}`);
  };
  document.querySelectorAll("[data-open-dialog]").forEach((button) => {
    button.addEventListener("click", () => openRole(button.dataset.openDialog, true));
  });
  document.querySelectorAll("dialog.rdlg").forEach((dialog) => {
    dialog.querySelector("[data-dialog-close]").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      if (location.hash === `#${dialog.dataset.role}`) {
        history.replaceState(null, "", location.pathname + location.search);
      }
    });
  });
  const openRoleFromHash = () => openRole(location.hash.slice(1), false);
  openRoleFromHash();
  window.addEventListener("hashchange", openRoleFromHash);

  // ---------- 文档页：由标题生成目录 ----------
  const docToc = document.querySelector("[data-doc-toc]");
  const docHeads = [...document.querySelectorAll(".doc-body h2")];
  if (docToc && docHeads.length) {
    const list = document.createElement("ol");
    docHeads.forEach((h, n) => {
      if (!h.id) h.id = `sec-${n + 1}`;
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `#${h.id}`;
      a.textContent = h.textContent;
      li.appendChild(a);
      list.appendChild(li);
    });
    docToc.appendChild(list);
    const tocLinks = [...list.querySelectorAll("a")];
    const markActive = () => {
      let current = docHeads[0];
      docHeads.forEach((h) => {
        if (h.getBoundingClientRect().top < innerHeight * 0.3) current = h;
      });
      tocLinks.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === `#${current.id}`));
    };
    window.addEventListener("scroll", markActive, { passive: true });
    markActive();
  }

  // ---------- 截图横向滚动按钮 ----------
  document.querySelectorAll("[data-shots]").forEach((shots) => {
    const track = shots.querySelector("[data-shots-track]");
    shots.querySelectorAll("[data-shots-dir]").forEach((button) => {
      button.addEventListener("click", () => {
        track.scrollBy({ left: Number(button.dataset.shotsDir) * track.clientWidth * 0.8, behavior: reduceMotion ? "auto" : "smooth" });
      });
    });
  });

  // ---------- Products：卡片的出现动效与对光标的响应 ----------
  const pcards = document.querySelectorAll("[data-pcard]");

  if ("IntersectionObserver" in window && !reduceMotion) {
    const cardObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("is-shown");
          cardObserver.unobserve(e.target);
        });
      },
      { rootMargin: "0px 0px -15% 0px", threshold: 0.2 }
    );
    pcards.forEach((card) => cardObserver.observe(card));
  } else {
    pcards.forEach((card) => card.classList.add("is-shown"));
  }

  // 仅鼠标设备：在光标位置投下柔光（卡片和图片不移动）
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches && !reduceMotion) {
    pcards.forEach((card) => {
      let frame;
      card.addEventListener("pointermove", (e) => {
        const rect = card.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          card.style.setProperty("--mx", `${x.toFixed(1)}%`);
          card.style.setProperty("--my", `${y.toFixed(1)}%`);
        });
      });
    });
  }

  // ---------- 滚动出现 ----------
  const revealTargets = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window && !reduceMotion) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 }
    );
    revealTargets.forEach((el) => io.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add("is-in"));
  }

  // ---------- Header ----------
  const header = document.querySelector("[data-gh]");
  const toggle = document.querySelector("[data-gh-toggle]");

  const inner = header.querySelector(".gh-inner");
  const nav = header.querySelector(".gh-nav");
  const cta = header.querySelector(".gh-cta");
  const desktop = window.matchMedia("(min-width: 961px)");

  // 桌面端：滚动后收拢为右上角的小胶囊。
  // 白色胶囊在收起时只包住「Menu」，展开时从菜单首项到「Close」都包住
  const setPill = (left, right, instant) => {
    header.classList.toggle("no-pill-anim", !!instant);
    const base = inner.getBoundingClientRect().left;
    inner.style.setProperty("--pill-x", `${left - base}px`);
    inner.style.setProperty("--pill-w", `${right - left}px`);
  };
  const navLeft = () => nav.getBoundingClientRect().left - 24;
  const placePill = () => {
    if (!header.classList.contains("is-compact")) return;
    const t = toggle.getBoundingClientRect();
    setPill(header.classList.contains("is-expanded") ? navLeft() : t.left - 6, t.right + 6);
  };
  let expandedAt = 0;
  const setExpanded = (open) => {
    header.classList.toggle("is-expanded", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "关闭菜单" : "打开菜单");
    expandedAt = window.scrollY;
    placePill();
  };

  // 收拢为胶囊时：先以当前菜单宽度显示胶囊，边吸入菜单边收缩到「Menu」的大小。
  // 恢复时：先把胶囊扩展到菜单宽度，再消失
  let releaseTimer = 0;
  const setCompact = (on) => {
    clearTimeout(releaseTimer);
    if (on) {
      header.classList.remove("is-releasing");
      header.classList.add("is-compact");
      if (!reduceMotion) setPill(navLeft(), toggle.getBoundingClientRect().right + 6, true);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        header.classList.remove("no-pill-anim");
        placePill();
      }));
    } else {
      if (header.classList.contains("is-expanded")) setExpanded(false);
      header.classList.remove("is-compact");
      header.classList.add("is-releasing");
      setPill(navLeft(), cta.getBoundingClientRect().right + 6);
      releaseTimer = setTimeout(() => header.classList.remove("is-releasing"), 450);
    }
  };

  const darkZones = [...document.querySelectorAll(".sec--dark, .gf, .rhero, .rentry, .rtone-ink")];
  const onScroll = () => {
    const compact = desktop.matches && window.scrollY > 120;
    if (compact !== header.classList.contains("is-compact")) setCompact(compact);
    // 展开后继续滚动一段距离，则重新收拢为胶囊
    if (header.classList.contains("is-expanded") && Math.abs(window.scrollY - expandedAt) > 160) setExpanded(false);

    const probe = header.offsetHeight / 2;
    const overDark = darkZones.some((el) => {
      const r = el.getBoundingClientRect();
      return r.top <= probe && r.bottom >= probe;
    });
    header.classList.toggle("is-dark", overDark);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  desktop.addEventListener("change", onScroll);
  window.addEventListener("resize", placePill);

  const setMenu = (open) => {
    header.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "关闭菜单" : "打开菜单");
    document.body.style.overflow = open ? "hidden" : "";
  };
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    if (desktop.matches) setExpanded(open);
    else setMenu(open);
  });
  header.querySelectorAll(".gh-nav a").forEach((a) =>
    a.addEventListener("click", () => {
      setMenu(false);
      setExpanded(false);
    }),
  );
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    setMenu(false);
    setExpanded(false);
  });
})();
