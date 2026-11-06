// 按 JST 时段切换配色。在 head 中同步加载，在绘制前决定颜色，防止颜色闪烁
(function () {
  var SCHEDULE = [
    { from: 5, to: 9, id: "lime", label: "Lime", note: "早晨" },
    { from: 9, to: 13, id: "cobalt", label: "Cobalt", note: "上午" },
    { from: 13, to: 16, id: "berry", label: "Berry", note: "点心时间" },
    { from: 16, to: 19, id: "mono", label: "Mono", note: "傍晚" },
    { from: 19, to: 23, id: "indigo", label: "Indigo", note: "夜晚" },
    { from: 23, to: 5, id: "teal", label: "Teal", note: "深夜" },
  ];

  function slotAt(hour) {
    for (var i = 0; i < SCHEDULE.length; i++) {
      var s = SCHEDULE[i];
      var inSlot = s.from < s.to ? hour >= s.from && hour < s.to : hour >= s.from || hour < s.to;
      if (inSlot) return s;
    }
    return SCHEDULE[0];
  }

  function jstHour() {
    return new Date(Date.now() + 9 * 3600 * 1000).getUTCHours();
  }

  var root = document.documentElement;
  root.classList.add("js");

  var id = slotAt(jstHour()).id;
  if (id !== "indigo") root.dataset.theme = id;

  window.siteTheme = { SCHEDULE: SCHEDULE, slotAt: slotAt, jstHour: jstHour };

  // 重新加载时，总是从页面顶部（首屏）开始显示。
  // 避免因「查看产品」等链接附带的 #products 锚点或浏览器滚动位置恢复而跳到页面中间
  var nav = window.performance && performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;
  if (nav && nav.type === "reload") {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    window.addEventListener("load", function () { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); });
  }
})();
