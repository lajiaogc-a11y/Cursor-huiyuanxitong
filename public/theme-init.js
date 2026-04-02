/**
 * 首屏阻塞脚本：在 React/CSS 加载前同步应用主题，避免浅色→深色闪烁。
 * 逻辑须与 src/lib/appTheme.ts 的 readInitialAppTheme 保持一致（键名与默认值）。
 */
(function () {
  try {
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (r) {
          r.unregister();
        });
      });
    }
  } catch (e) {}
  try {
    var key = "appTheme";
    var t = localStorage.getItem(key);
    var root = document.documentElement;
    var host = (typeof location !== "undefined" && location.hostname ? location.hostname : "").toLowerCase();
    /** 与 src/routes/siteMode.ts 中 DEFAULT_MEMBER 保持同步（会员专用域名首屏即深海金主题） */
    var MEMBER_HOSTS = ["crm.fastgc.cc", "www.crm.fastgc.cc"];
    var isMemberHost = MEMBER_HOSTS.indexOf(host) >= 0;
    if (isMemberHost) root.classList.add("member-html");
    var isLight = t === "light";
    if (isLight) root.classList.remove("dark");
    else root.classList.add("dark");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      if (isMemberHost && !isLight) meta.setAttribute("content", "#070B14");
      else meta.setAttribute("content", isLight ? "#f4f7fa" : "#161922");
    }
  } catch (e) {
    document.documentElement.classList.add("dark");
  }
})();
