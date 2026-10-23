// SITE SWITCH for sites that do not load Firebase (2026-10-22, L: "a couple of my sites on the website page that I can't
// turn off still"): lhr, ytg, gdg. Same flag and the same look as the gate block in assets/js/firebase-init.js - reads
// public/site.json over REST; off when "everything" (maintenance.on) or this site (sites/<key>.on) is off. No Firebase
// SDK here, so the owner is recognised by the device flag the Firebase pages set on sign-in (localStorage ss_owner=1):
// that device gets the red strip instead of the layer. ?switchtest=1 previews. Identical copy in each of these sites.
(async () => {
  try {
    const here = location.pathname.toLowerCase();
    const test = new URLSearchParams(location.search).get("switchtest") === "1";
    const km = here.match(/^\/websites\/([^\/]+)\//); const siteKey = km ? km[1] : "ses";
    const esc = s => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const whenBody = fn => (document.body ? fn() : document.addEventListener("DOMContentLoaded", fn));
    const LS = { get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} } };
    const CK = "ss_state_" + siteKey, owner = !test && LS.get("ss_owner") === "1";
    const showLayer = msg => whenBody(() => {
      let o = document.getElementById("site-switch-layer");
      if (!o) {
        o = document.createElement("div"); o.id = "site-switch-layer";
        o.setAttribute("style", "position:fixed;inset:0;z-index:2147483647;background:#0f1419;color:#e8e6e3;font:16px/1.6 system-ui,Segoe UI,Arial;display:grid;place-items:center;padding:24px;box-sizing:border-box;overflow:auto");
        document.body.appendChild(o); document.documentElement.style.overflow = "hidden"; document.title = "Under construction";
      }
      o.innerHTML = `<div style="max-width:560px;text-align:center"><span style="display:inline-block;width:64px;height:6px;border-radius:3px;background:#7a1f2b;margin-bottom:20px"></span>
<h1 style="font-size:1.6rem;margin:0 0 12px;color:#fff">Under construction</h1>
<p style="margin:0 0 18px;white-space:pre-wrap">${esc(msg || "We're working on the site. Back soon.")}</p>
<small style="color:#9aa0a6">luissolutions.us</small></div>`;
    });
    const hideLayer = () => { const o = document.getElementById("site-switch-layer"); if (o) { o.remove(); document.documentElement.style.overflow = ""; } };
    let cached = null; try { cached = JSON.parse(LS.get(CK) || "null"); } catch (_) {}
    if (!test && !owner && cached && cached.on) showLayer(cached.message);   // instant, from this device's last look
    let m;
    if (!test) {
      const r = await fetch("https://persinfo-df93f-default-rtdb.firebaseio.com/public/site.json", { cache: "no-store" });
      const site = (await r.json()) || {};
      const all = site.maintenance || {}, mine = (site.sites || {})[siteKey] || {};
      if (!all.on && !mine.on) { LS.set(CK, JSON.stringify({ on: 0 })); hideLayer(); return; }
      m = { message: (mine.on && mine.message) || all.message || "", scope: all.on ? "everything" : siteKey };
      LS.set(CK, JSON.stringify({ on: 1, message: m.message }));
    } else { m = { message: "Preview of the under-construction page (?switchtest=1).", scope: "preview" }; }
    if (!owner) { showLayer(m.message); return; }
    whenBody(() => {
      const b = document.createElement("div");
      b.setAttribute("style", "position:fixed;top:0;left:0;right:0;z-index:2147483646;background:#7a1f2b;color:#fff;font:600 13px/1.4 system-ui,Segoe UI,Arial;padding:6px 12px;text-align:center");
      b.innerHTML = `${m.scope === "everything" ? "ALL SITES ARE" : "THIS SITE IS"} OFF for visitors &middot; "${esc(m.message)}" &middot; <a href="/websites/index.html" style="color:#ffd6dc">websites &rarr; toggles</a>`;
      document.body.prepend(b);
    });
  } catch (_) { /* never block a page over the switch */ }
})();
