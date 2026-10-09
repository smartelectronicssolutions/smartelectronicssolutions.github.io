// theme-toggle.js - the ☀️/🌙 header button, ONE copy for every app page (2026-10-09: jscpd found the same IIFE pasted
// into 24 pages in three spellings). Load it right after the button, as a plain script:
//   <button id="theme-toggle" title="Toggle theme">☀️</button>
//   <script src="../assets/js/theme-toggle.js"></script>
// The early "ss-theme" read that sets html.light before paint stays inline in each page's <head>.
(function () {
  var btn = document.getElementById("theme-toggle"), html = document.documentElement;
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = "1";
  btn.textContent = html.classList.contains("light") ? "🌙" : "☀️";
  btn.addEventListener("click", function () {
    var next = html.classList.contains("light") ? "dark" : "light";
    html.classList.toggle("light", next === "light");
    localStorage.setItem("ss-theme", next);
    btn.textContent = next === "light" ? "🌙" : "☀️";
  });
})();
