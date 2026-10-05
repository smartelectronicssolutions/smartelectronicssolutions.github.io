// radarMap.js - THE site map for a RADAR job, shared by radar-map.html (the full page) and radar-tools.html (the
// "Site Map" section of the checklist). L 2026-10-02: "since it's 2 things now in sections of the Telaid checklist,
// can it grab the logic from the same place" - so the map, its sensor/IDF cards, photo upload and the run/label
// toggles live ONLY here. mountRadarMap(root, {task, embed}) -> { setTask(id), refit() }.
// Everything it renders is scoped: ids are "rm-*", CSS is under .rmap, so it can sit inside another page.
// DATA comes from telaid-data.js (the one file that knows the Firebase shape) - one read per load, no timers (poll-loop scar).
// Shape, for orientation: {owner}/tasks/<task>/sensorMeta/<mark> = {serial, m1/m2/m3,
// labeledAt, runDoneAt} + Storage {owner}/tasks/images/<project>/sensors (<prefix>_<mark>-<serial>[_n].jpg) and
// /MDF, /IDF1..IDF6 (site photos). History: floor map, photos/add/run complete, wiring view, IDF photos (all 2026-10-02).
import { onAuthStateChanged } from "../../../assets/js/firebase-init.js";
import { auth, HUBS, hubLabel, esc, fmtFt, feet, clean, loadJob, sensorRows, patchSensor, listSites, listPhotos, photoUrl,
  sensorMarkOf, photoPrefix, uploadSensorPhoto, uploadHubPhoto, deletePhoto, watchJob, tablesFor, zoneOf, idfOf, loadFloorPlan, saveHubPos } from "./telaid-data.js?v=1003c";
import { openPhotoViewer } from "../../../assets/js/photoviewer.js?v=20261003a";
import { mountCanvasView } from "../../../assets/js/canvasview.js?v=20261003b";

const CSS = `.rmap .app-shell { max-width: 1100px; margin: auto; padding: 12px; display: grid; gap: 12px; }
.rmap .card { background: var(--cardBackground); border: 1px solid var(--borderColor); border-radius: 12px; padding: 12px; box-shadow: var(--cardShadow); }
.rmap .rm-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.rmap .muted { color: var(--mutedText); font-size: .9rem; }
.rmap #rm-modes button { width: auto !important; margin: 0 !important; box-shadow: none !important; display: inline-block; font-size: .9rem; line-height: 1.2;
padding: 6px 12px; border-radius: 999px; border: 1px solid var(--borderColor); background: transparent; color: var(--textColor); cursor: pointer; }
.rmap #rm-modes button.on { background: var(--primaryColor); border-color: var(--primaryColor); color: #fff; }
.rmap #rm-find { width: 7em !important; margin: 0 !important; font-size: 1rem; padding: 6px 8px; }
.rmap .mapwrap { position: relative; border-radius: 12px; overflow: hidden; border: 1px solid var(--borderColor); background: var(--secondaryBackgroundColor); }
.rmap #rm-map { display: block; width: 100%; height: min(75vh, 720px); touch-action: pan-y; cursor: grab; }
/* L 2026-10-03 (same as the Louverse): on its own page the map uses the most width it can - 12px from each screen edge - and
   grows with the screen height; inside the checklist (.embed) it stays in the section */
.rmap:not(.embed) .mapwrap { margin-inline: calc(50% - 50vw + 12px); }
.rmap:not(.embed) #rm-map { height: min(110vw, 85vh); }
.rmap .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: .85rem; }
.rmap .legend span { display: inline-flex; align-items: center; gap: 6px; }
.rmap .legend i { width: 11px; height: 11px; border-radius: 50%; display: inline-block; }
.rmap #rm-info { min-height: 3em; }
.rmap #rm-info .mk { font-size: 2rem; font-weight: 800; color: var(--primaryColor); line-height: 1; }
.rmap #rm-info .kv { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin-top: 8px; font-size: .95rem; font-variant-numeric: tabular-nums; }
.rmap #rm-info .kv b { color: var(--mutedText); font-weight: 600; }
.rmap .stats { display: flex; flex-wrap: wrap; gap: 6px 18px; font-variant-numeric: tabular-nums; }
.rmap .stats b { color: var(--textColor); }
.rmap #rm-views button { width: auto !important; margin: 0 !important; box-shadow: none !important; display: inline-block; font-size: .9rem; line-height: 1.2;
padding: 6px 12px; border-radius: 8px; border: 1px solid var(--borderColor); background: transparent; color: var(--textColor); cursor: pointer; }
.rmap #rm-views button.on { background: var(--primaryColor); border-color: var(--primaryColor); color: #fff; }
.rmap .photos { display: flex; gap: 8px; overflow-x: auto; margin-top: 10px; padding-bottom: 4px; }
.rmap .photos a { flex: none; cursor: zoom-in; }
.rmap .photos img { height: 110px; width: auto; border-radius: 8px; border: 1px solid var(--borderColor); display: block; background: #0003; }
.rmap .acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.rmap .acts button, .rmap .acts label.btn { width: auto !important; margin: 0 !important; box-shadow: none !important; display: inline-flex; align-items: center; gap: 6px;
font-size: .95rem; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--borderColor); background: transparent; color: var(--textColor); cursor: pointer; }
.rmap .acts .done { background: #16a34a; border-color: #16a34a; color: #fff; }
.rmap .acts .primary { background: var(--primaryColor); border-color: var(--primaryColor); color: #fff; }
.rmap #rm-info .note { font-size: .85rem; color: var(--mutedText); margin-top: 6px; }
.rmap #rm-hubs button { width: auto !important; margin: 0 !important; box-shadow: none !important; display: inline-flex; align-items: center; gap: 6px; font-size: .9rem;
padding: 6px 10px; border-radius: 8px; border: 1px solid var(--borderColor); background: transparent; color: var(--textColor); cursor: pointer; }
.rmap #rm-hubs button i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.rmap #rm-hubs button .n { font-size: .8rem; color: var(--mutedText); }
.rmap #rm-hubs button.has .n { color: #22c55e; font-weight: 700; }
body.rm-embed-page header.top-actions { display: none !important; }
.rmap.embed .app-shell { padding: 0; }
/* LAYOUT (L 2026-10-02 "what's under the view above, and info right underneath"): every control sits ABOVE the map,
   the map, then the info card right under it, then the legend and the hint. Same order everywhere (page + checklist). */
.rmap #rm-jobrow { order: -10; } .rmap #rm-source { order: -9; } .rmap #rm-stats { order: -8; } .rmap #rm-hubs { order: -7; }
.rmap #rm-views { order: -6; } .rmap #rm-modes { order: -5; } .rmap .mapwrap { order: -4; } .rmap #rm-info { order: -3; }
.rmap #rm-legend { order: -2; } .rmap .hint { order: -1; }
.rmap #rm-job { width: 100% !important; max-width: 640px; margin: 0 !important; font-size: 1rem; padding: 8px; }
.rmap.embed #rm-jobrow { display: none !important; }
/* SLIDERS (L 2026-10-02 "maybe have a slider on bottom and right"): a native range along the bottom (left-right) and one
   up the right edge (up-down). One finger on either moves the map, no gesture fight; they mirror pinch/drag, and only
   show once the map is bigger than its box. The vertical one is a horizontal range turned 90 degrees. */
.rmap .mapwrap .rm-sl { position: absolute; margin: 0 !important; padding: 0; height: 16px; box-shadow: none !important; background: transparent; z-index: 2; opacity: .9; touch-action: none; }
.rmap .mapwrap .rm-sl[hidden] { display: none !important; }
.rmap .mapwrap .rm-sl:disabled { opacity: .35; }
/* ZOOM BUTTONS (L 2026-10-03 "add a zoom and unzoom button onscreen"): top-right, clear of the up/down slider strip */
.rmap .rm-zoom { position: absolute; top: 8px; right: 28px; display: grid; gap: 6px; z-index: 3; }
.rmap .rm-zoom button { width: 38px !important; height: 38px; margin: 0 !important; padding: 0; font-size: 1.5rem; line-height: 1; border-radius: 8px;
  border: 1px solid var(--borderColor); background: var(--cardBackground); color: var(--textColor); cursor: pointer; box-shadow: none !important; }
.rmap .mapwrap .rm-slx { left: 8px; bottom: 4px; width: calc(100% - 40px) !important; }
.rmap .mapwrap .rm-sly { top: 8px; left: calc(100% - 6px); width: var(--rm-slh, 300px) !important; transform: rotate(90deg); transform-origin: left top; }
.rmap.embed #rm-map { height: min(62vh, 560px); }`;
function injectCss() {
  if (document.getElementById("rmap-css")) return;
  const st = document.createElement("style"); st.id = "rmap-css"; st.textContent = CSS; document.head.appendChild(st);
}
const TEMPLATE = `<div class="app-shell">
      <div class="rm-row" id="rm-jobrow"><select id="rm-job" aria-label="Job"><option value="">Loading jobs...</option></select></div>
      <div class="muted" id="rm-source">Sign in to load the site.</div>
      <div class="card stats" id="rm-stats"></div>
      <div class="rm-row" id="rm-hubs"></div>
      <div class="rm-row" id="rm-views"><span class="muted">View:</span>
        <button data-v="floor" class="on">Floor</button><button data-v="wiring">Wiring</button>
        <button type="button" id="rm-rot" title="Rotate the floor map 90&deg;">&#8635; Rotate</button>
        <button type="button" id="rm-plan" title="Floor plan under the dots" hidden>&#128506; Plan: dim</button></div>
      <div class="rm-row modes" id="rm-modes">
        <span class="muted">Color by:</span>
        <button data-m="idf" class="on">IDF</button>
        <button data-m="photos">Photos</button>
        <button data-m="labeled">Labeled</button>
        <button data-m="height">Height</button>
        <button data-m="switch">Switch</button>
        <button data-m="runs">Runs</button>
        <span style="flex:1"></span>
        <input id="rm-find" type="text" inputmode="numeric" placeholder="Sensor #" autocomplete="off" />
      </div>
      <div class="mapwrap"><canvas id="rm-map" aria-label="Floor map of every sensor"></canvas>
        <div class="rm-zoom"><button type="button" id="rm-zin" aria-label="Zoom in" title="Zoom in">+</button><button type="button" id="rm-zout" aria-label="Zoom out" title="Zoom out">&minus;</button></div>
        <input type="range" id="rm-slx" class="rm-sl rm-slx" min="0" max="1000" value="0" aria-label="Move the map left or right" hidden />
        <input type="range" id="rm-sly" class="rm-sl rm-sly" min="0" max="1000" value="0" aria-label="Move the map up or down" hidden /></div>
      <div class="legend" id="rm-legend"></div>
      <div class="muted hint">Pinch, or Shift + scroll, to zoom · one finger scrolls the page; to move the map: hold half a second on empty floor then drag, two fingers, the edge sliders, or a mouse drag · tap a sensor or cabinet for its photos · hold one ~half a second, then drag, to move it · double-tap to reset the view. Numbers appear as you zoom in.</div>
      <div class="card" id="rm-info"><span class="muted">Tap a sensor to see its details.</span></div>
    </div>`;

export function mountRadarMap(root, opts = {}) {
    injectCss(); root.classList.add("rmap"); root.innerHTML = TEMPLATE;
    const LAST_SITE = (() => { try { return JSON.parse(localStorage.getItem("sensorTask")) || null; } catch (_) { return null; } })();
    let TASK = "", TABLES = null, SWITCHES = {};   // TABLES = this site's plan (task.siteTables in Firebase, or the built-in WM54 table)
    const setTaskId = t => { TASK = String(t); TABLES = null; SWITCHES = {}; };   // the plan arrives with the job in load()
    const EMBED = !!opts.embed;
    if (!EMBED) document.body.style.overflowX = "clip";   // the full-width map box bleeds past the 1100px column; never a sideways scroll
    // Embedded in the checklist the map follows ONLY the site the checklist opens - no remembered site, no default
    // (L 2026-10-02: "the map is loading the Walmart one even when I haven't selected anything yet").
    setTaskId(opts.task || (!EMBED && LAST_SITE && LAST_SITE.task) || (!EMBED && "1789898400000") || "");
    if (EMBED) root.classList.add("embed");
    const HUBPH = {};   // "MDF"/"IDF3" -> [storage refs]
    let selHub = null, HL = new Set();   // HL = sensors matching what's typed in the Sensor # box (live)
    let loadGen = 0, PHOTOS = "loading";  // photos arrive after the map; "loading" | "ok" | "failed" (can't reach Storage)
    let stopWatch = null;   // LIVE: the RTDB listeners for the open site (watchJob) - stopped on every site switch
    // FLOOR PLAN under the dots (L 2026-10-02): the key-map drawing, fitted to the sensor coordinates (telaid-data
    // loadFloorPlan). Light theme = the drawing multiplied over the map; dark theme = an inverted copy screened on.
    let PLAN = null, planImg = null, planDark = null, planMode = "dim";
    try { planMode = localStorage.getItem("rm-plan-mode") || "dim"; } catch (_) {}
    const $ = id => root.querySelector("#rm-" + id);

    let S = [];            // {m, serial, x, y, z, idf, zone, photos, items, labeledAt, runDoneAt, sw, port, wx, wy}
    let mode = "idf", sel = -1, layout = "floor";
    let OWNER = null, TASKREC = {};      // set by load(); used by the card's actions
    const RO = () => OWNER === "share";   // a shared copy (share/tasks/<id>): look, don't touch
    function renderHubs() {
      $("hubs").innerHTML = '<span class="muted">Photos:</span>' + HUBS.map(h => { const n = (HUBPH[h] || []).length,
        c = h === "MDF" ? "#475569" : (IDF_COL[h.slice(3)] || "#64748b");
        return `<button type="button" data-h="${h}" class="${n ? "has" : ""}"><i style="background:${c}"></i>${hubLabel(h)} <span class="n">${n ? "&#128247; " + n : PHOTOS === "ok" ? "none" : PHOTOS === "loading" ? "\u2026" : "?"}</span></button>`; }).join("");
    }

    function assignSwitches() {   // balanced split by sensor # inside each IDF (same as the port-plan CSV)
      for (const [idf, sws] of Object.entries(SWITCHES)) {
        const rs = S.filter(s => s.idf === Number(idf)).sort((a, b) => a.m - b.m), k = sws.length;
        let i = 0;
        sws.forEach((sw, j) => { const size = Math.floor(rs.length / k) + (j < rs.length % k ? 1 : 0);
          rs.slice(i, i + size).forEach((s, p) => { s.sw = sw; s.port = p + 1; }); i += size; });
      }
    }

    async function load(user) {
      if (!user) { $("source").textContent = "Sign in to load the site."; return; }
      if (!TASK) { $("source").textContent = "Open a site above and its map shows here."; $("stats").innerHTML = ""; $("hubs").innerHTML = ""; return; }
      S = []; sel = -1; selHub = null; B = null; for (const k in HUBPH) delete HUBPH[k]; PHOTOS = "loading";
      PLAN = null; planImg = null; planDark = null; planFast = null; $("plan").hidden = true;
      $("source").textContent = "Loading...";
      const { owner, task, meta } = await loadJob(user, TASK);
      if (!meta) { $("source").textContent = "No sensor data found for this job."; return; }
      TABLES = tablesFor(task, TASK); SWITCHES = TABLES ? TABLES.switches : {};
      if (!TABLES && layout === "wiring") { layout = "floor"; root.querySelectorAll("#rm-views button").forEach(x => x.classList.toggle("on", x.dataset.v === "floor")); }
      S = sensorRows(meta).map(s => ({ ...s, plan: [s.x, s.y], idf: idfOf(TABLES, s.m), zone: zoneOf(TABLES, s.m), photos: 0, items: [] }))
        .filter(s => s.x != null && s.y != null);
      S.forEach(s => { if (s.pos) { s.x = s.pos.x; s.y = s.pos.y; } });   // hold-to-move override (as built) wins over the plan
      if (TABLES) { assignSwitches(); wiringLayout(); }
      OWNER = owner; TASKREC = task;
      const line = `${task.customerName || "Job " + TASK} \u00b7 ${S.length} sensors \u00b7 loaded ${new Date().toLocaleTimeString()}${TABLES ? ` \u00b7 site plan: ${TABLES.from}` : ""}${RO() ? ` \u00b7 shared copy by ${task.sharedByName || "?"} (read-only)` : ""}`;
      $("source").textContent = line + " \u00b7 photos loading\u2026";
      renderHubs(); renderStats(); fit(false);
      // PHOTOS IN THE BACKGROUND (L 2026-10-03, "did you freeze?": on a network that could not resolve
      // firebasestorage.googleapis.com, listAll retried for ~2 min before failing and the whole map waited on it).
      // The map draws first; photo counts/rings fill in when Storage answers, or the source line says it couldn't.
      const gen = ++loadGen; PHOTOS = "loading";
      // LIVE (L 2026-10-03 "I have to refresh the page to get any new pictures"): every upload - from this map, another
      // device or the checklist - stamps tasks/<id>/photosAt; sensorMeta edits (run complete, labeled, serial, moves) arrive
      // the same way. Re-list only the folder that changed and merge the meta in place, so the view never jumps.
      if (stopWatch) stopWatch();
      stopWatch = watchJob(owner, TASK, { onPhotos: v => { if (gen === loadGen) refreshPhotos(v.sub); },
        onMeta: meta => { if (gen === loadGen) mergeMeta(meta); } });
      loadFloorPlan(owner, TASK).then(p => { if (gen !== loadGen || !p) return; PLAN = p;
        const im = new Image(); im.onload = () => { planImg = im; planDark = null; $("plan").hidden = false; planLabel(); draw(); }; im.src = p.img; }).catch(() => {});
      const sensorsP = listPhotos(owner, task, "sensors").then(items => { if (gen !== loadGen) return;
        for (const it of items) { const s = S.find(x => x.m === sensorMarkOf(it.name, task)); if (s) { s.photos++; s.items.push(it); } } });
      const hubsP = Promise.all(HUBS.map(async h => { const items = await listPhotos(owner, task, h); if (gen === loadGen) HUBPH[h] = items; }));
      Promise.allSettled([sensorsP, hubsP]).then(rs => { if (gen !== loadGen) return;
        PHOTOS = rs.some(r => r.status === "rejected") ? "failed" : "ok";
        $("source").textContent = line + (PHOTOS === "failed" ? " \u00b7 photos unavailable (this network can't reach Storage)" : "");
        renderHubs(); renderStats(); draw();
        if (sel >= 0) show(sel); else if (selHub) showHub(selHub); });
    }

    async function refreshPhotos(sub) {   // one folder re-listed after a photosAt stamp (sensors, or MDF / IDFn)
      const gen = loadGen;
      try {
        if (sub === "sensors") { const items = await listPhotos(OWNER, TASKREC, "sensors"); if (gen !== loadGen) return;
          S.forEach(s => { s.photos = 0; s.items = []; });
          for (const it of items) { const s = S.find(x => x.m === sensorMarkOf(it.name, TASKREC)); if (s) { s.photos++; s.items.push(it); } }
          PHOTOS = "ok"; renderStats(); draw(); if (sel >= 0) show(sel); }
        else if (HUBS.includes(sub)) { const items = await listPhotos(OWNER, TASKREC, sub); if (gen !== loadGen) return;
          HUBPH[sub] = items; renderHubs(); if (selHub === sub) showHub(sub); }
      } catch (_) {}
    }
    function mergeMeta(meta) {   // sensorMeta changed somewhere: update the rows in place (flags, serial, as-built spot)
      if (cvw.held) return;   // mid-drag here - the next change re-syncs
      let n = 0;
      for (const r of sensorRows(meta)) { const s = S.find(x => x.m === r.m); if (!s) continue; n++;
        Object.assign(s, { serial: r.serial, labeledAt: r.labeledAt, runDoneAt: r.runDoneAt, updatedAt: r.updatedAt, pos: r.pos, plan: [r.x, r.y] });
        s.x = r.pos ? r.pos.x : r.x; s.y = r.pos ? r.pos.y : r.y; }
      if (!n) return; renderStats(); draw(); if (sel >= 0) show(sel); else if (selHub) showHub(selHub);
    }
    function renderStats() {
      const lab = S.filter(s => s.labeledAt).length, ph2 = S.filter(s => s.photos >= 2).length, ph0 = S.filter(s => !s.photos).length,
        runs = S.filter(s => s.runDoneAt).length;
      // L 2026-10-02 "0 with both photos - this isn't true": never print a photo count we have not actually fetched
      const photoBits = PHOTOS === "ok" ? `<span><b>${ph2}</b> with both photos</span><span><b>${ph0}</b> with no photos</span>`
        : PHOTOS === "loading" ? `<span class="muted">photos loading\u2026</span>` : `<span class="muted">photos: can't reach Storage on this network</span>`;
      $("stats").innerHTML = `<span><b>${S.length}</b> sensors</span><span><b>${runs}</b> runs complete</span><span><b>${lab}</b> labeled</span>${photoBits}`;
    }

    // ---------- drawing ----------
    const cv = $("map"), cx = cv.getContext("2d");
    const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const IDF_COL = { 1: "#e8742c", 2: "#3b82f6", 3: "#22c55e", 4: "#eab308", 5: "#a855f7", 6: "#ec4899" };
    function colorOf(s) {
      if (mode === "idf") return IDF_COL[s.idf] || "#94a3b8";
      if (mode === "photos") return s.photos >= 2 ? "#22c55e" : s.photos === 1 ? "#f59e0b" : "#ef4444";
      if (mode === "labeled") return s.labeledAt ? "#22c55e" : "#ef4444";
      if (mode === "height") { const t = Math.max(0, Math.min(1, ((s.z ?? 12) - 7) / 10)); return `hsl(${220 - t * 200},75%,55%)`; }
      if (mode === "switch") return s.sw === "new" ? "#ef4444" : `hsl(${((Number(s.sw) || 0) * 47) % 360},70%,58%)`;
      if (mode === "runs") return s.runDoneAt ? "#22c55e" : "#ef4444";
    }
    function legend() {
      const L = {
        idf: Object.entries(IDF_COL).map(([k, c]) => [c, "IDF " + k]),
        photos: [["#22c55e", "2+ photos"], ["#f59e0b", "1 photo"], ["#ef4444", "none"]],
        labeled: [["#22c55e", "labeled"], ["#ef4444", "not yet"]],
        height: [["hsl(220,75%,55%)", "7 ft"], ["hsl(120,75%,55%)", "12 ft"], ["hsl(20,75%,55%)", "17 ft"]],
        switch: [["#ef4444", "needs the 3rd switch (IDF 2 / 5)"], ["#94a3b8", "each color = one switch #"]],
        runs: [["#22c55e", "run complete"], ["#ef4444", "not yet"]],
      }[mode];
      $("legend").innerHTML = L.map(([c, t]) => `<span><i style="background:${c}"></i>${esc(t)}</span>`).join("")
        + '<span><i style="background:transparent;border:2px solid #fff;width:9px;height:9px"></i>white ring = has photos</span>';
    }
    // WIRING view: MDF in the middle, the 6 IDFs on a ring, each IDF's switches around it, each switch's sensors
    // around the switch (one dot per port). Units are "feet" like the floor plan so zoom/pan/tap all just work.
    const HUB = {};   // "idf" / "idf-sw" -> [x, y] centres, for the lines and labels
    function wiringLayout() {
      HUB.mdf = [0, 0];
      const idfs = Object.keys(SWITCHES).map(Number);
      idfs.forEach((idf, a) => {
        const A = -Math.PI / 2 + a / idfs.length * 2 * Math.PI, ix = 150 * Math.cos(A), iy = 150 * Math.sin(A);
        HUB[idf] = [ix, iy];
        const sws = SWITCHES[idf];
        sws.forEach((sw, b) => {
          const Bn = A + (b - (sws.length - 1) / 2) * 0.95, sx = ix + 52 * Math.cos(Bn), sy = iy + 52 * Math.sin(Bn);
          HUB[idf + "-" + sw] = [sx, sy];
          const mine = S.filter(t => t.idf === idf && t.sw === sw).sort((p, q) => p.port - q.port);
          mine.forEach((t, k) => { const C = k / Math.max(1, mine.length) * 2 * Math.PI; t.wx = sx + 17 * Math.cos(C); t.wy = sy + 17 * Math.sin(C); });
        });
      });
      S.forEach(t => { if (t.wx == null) { t.wx = 0; t.wy = -20; } });
    }
    // ROTATE (L 2026-10-02 "can the map rotate?"): the floor plan turns in 90-degree steps so the store's long side can
    // match the phone. Only the drawing turns - the card still shows the real plan X/Y. Remembered on this device.
    let ROT = 0; try { ROT = Number(localStorage.getItem("rm-rot")) || 0; } catch (_) {}
    const rotXY = (x, y) => ROT === 90 ? [-y, x] : ROT === 180 ? [-x, -y] : ROT === 270 ? [y, -x] : [x, y];
    const X = s => layout === "wiring" ? s.wx : rotXY(s.x, s.y)[0], Y = s => layout === "wiring" ? s.wy : rotXY(s.x, s.y)[1];
    // THE VIEWPORT + INPUT = apps/assets/js/canvasview.js, one engine shared with the Spending Galaxy and the Louverse
    // code map (L 2026-10-03: "a lot of code that is similar"). This map only says what its world is (B = the sensor
    // extent, plan y grows UP), what is under the finger, what a hold means, how to draw. Smoothness rules live there too:
    // one draw per frame, labels + the full-res plan wait until the fingers lift (cvw.moving).
    let B = null;
    const cvw = mountCanvasView(cv, {
      world: () => { if (!S.length) return (B = null); const xs = S.map(X), ys = S.map(Y);
        return (B = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }); },
      flipY: true, pad: 24, minZoom: 0.7, maxZoom: 30, sliders: { x: $("slx"), y: $("sly") }, slVar: "--rm-slh", slExtent: slExt,
      draw: () => draw(),
      hit: (mx, my) => { const hh = hubAt(mx, my); if (hh) return { kind: "hub", h: hh };
        let best = -1, bd = (22 * view.dpr) ** 2; S.forEach((s, i) => { const [x, y] = P(s), d = (x - mx) ** 2 + (y - my) ** 2; if (d < bd) { bd = d; best = i; } });
        return best >= 0 ? { kind: "sensor", i: best } : null; },
      // HOLD-TO-MOVE (L 2026-10-02 "hold 'em and move each object around"): hold a sensor / cabinet ~0.5 s = drag it (floor
      // view only; the new spot is saved as sensorMeta/<mark>/pos or siteTables/hubs); hold empty floor = pan the map.
      hold: (t, e) => e.button !== 0 ? null : !t ? "pan" : layout === "floor" && !RO() ? "drag" : null,
      onDrag: (t, fx, fy) => { const [ux, uy] = unrot(fx, fy);   // screen delta -> plan feet, through the inverse of the rotate
        if (t.kind === "sensor") { S[t.i].x += ux; S[t.i].y += uy; } else { TABLES.hubs[t.h][0] += ux; TABLES.hubs[t.h][1] += uy; } },
      onDragEnd: t => endMove(t),
      onTap: t => { if (!t) return; if (t.kind === "hub") showHub(t.h); else show(t.i); } });   // no page jump on tap
    const view = cvw.view, base = cvw.base, requestDraw = cvw.requestDraw, fit = cvw.fit;
    let planFast = null;   // {light, c}
    // plan Y grows upward; the screen grows downward, so flip it
    const P = s => [view.ox + (X(s) - B.x0) * view.s, view.oy + (B.y1 - Y(s)) * view.s];
    const PP = ([x, y]) => [view.ox + (x - B.x0) * view.s, view.oy + (B.y1 - y) * view.s];
    function draw() {
      cx.fillStyle = css("--secondaryBackgroundColor") || "#0f172a"; cx.fillRect(0, 0, cv.width, cv.height);
      if (!S.length || !B) return;
      const dpr = view.dpr, zoom = view.s / base.s, r = Math.min(9, 3.2 * Math.sqrt(zoom)) * dpr;
      if (layout === "floor" && planImg && planMode !== "off") drawPlan();
      if (layout === "floor") drawHubsFloor(dpr);
      if (layout === "wiring") drawWiring(dpr, r);
      // 10 ft grid so distances read like a floor plan
      cx.strokeStyle = layout === "wiring" ? "rgba(0,0,0,0)" : "rgba(148,163,184,.10)"; cx.lineWidth = 1;
      const step = zoom > 3 ? 10 : 50;
      cx.beginPath();
      for (let gx = Math.ceil(B.x0 / step) * step; gx <= B.x1; gx += step) { const X = view.ox + (gx - B.x0) * view.s; cx.moveTo(X, 0); cx.lineTo(X, cv.height); }
      for (let gy = Math.ceil(B.y0 / step) * step; gy <= B.y1; gy += step) { const Y = view.oy + (B.y1 - gy) * view.s; cx.moveTo(0, Y); cx.lineTo(cv.width, Y); }
      cx.stroke();
      for (const s of S) { const [x, y] = P(s); if (x < -20 || y < -20 || x > cv.width + 20 || y > cv.height + 20) continue;
        cx.fillStyle = colorOf(s); cx.beginPath(); cx.arc(x, y, r, 0, 6.283); cx.fill();
        if (s.photos) { cx.strokeStyle = "#ffffff"; cx.lineWidth = 1.6 * dpr; cx.beginPath(); cx.arc(x, y, r + 2.5 * dpr, 0, 6.283); cx.stroke(); } }
      if (zoom >= 2.2 && !cvw.moving) {   // number labels wait until the move ends (fillText x241 is what the iPad trips on)
        cx.font = `600 ${11 * dpr}px system-ui, sans-serif`; cx.fillStyle = css("--textColor") || "#e5e7eb";
        for (const s of S) { const [x, y] = P(s); if (x > 0 && y > 0 && x < cv.width && y < cv.height) cx.fillText(String(s.m), x + r + 2 * dpr, y + 4 * dpr); }
      }
      if (HL.size) { cx.strokeStyle = "#facc15"; cx.lineWidth = 2.5 * dpr;
        for (const i of HL) { const [x, y] = P(S[i]); cx.beginPath(); cx.arc(x, y, r + 4 * dpr, 0, 6.283); cx.stroke(); } }
      if (sel >= 0) { const s = S[sel], [x, y] = P(s); cx.strokeStyle = css("--textColor") || "#fff"; cx.lineWidth = 2.5 * dpr;
        cx.beginPath(); cx.arc(x, y, r + 5 * dpr, 0, 6.283); cx.stroke(); }
      cvw.syncSliders();
      if (layout === "wiring") return;
      // scale bar
      const ft = zoom > 3 ? 10 : 50, w = ft * view.s;
      cx.fillStyle = css("--mutedText") || "#94a3b8"; cx.fillRect(14 * dpr, cv.height - 18 * dpr, w, 3 * dpr);
      cx.font = `${11 * dpr}px system-ui, sans-serif`; cx.fillText(ft + " ft", 14 * dpr, cv.height - 24 * dpr);
    }
    // CABINETS ON THE FLOOR (L 2026-10-02 "can I have the IDFs and MDF showing on the map"): squares at the plan positions
    // from siteTables.hubs, same colours as the chips, white ring when the cabinet has photos, tap = its card.
    const hubXY = h => (TABLES && TABLES.hubs && TABLES.hubs[h]) || null;
    function drawHubsFloor(dpr) {
      if (!TABLES || !TABLES.hubs) return;
      const half = Math.max(7, Math.min(16, 4.5 * view.s)) * dpr;   // ~9 ft square, clamped
      cx.textAlign = "center";
      for (const h of HUBS) { const xy = hubXY(h); if (!xy) continue;
        const [x, y] = PP(rotXY(xy[0], xy[1])); if (x < -40 || y < -40 || x > cv.width + 40 || y > cv.height + 40) continue;
        cx.fillStyle = h === "MDF" ? "#475569" : (IDF_COL[h.slice(3)] || "#64748b"); cx.fillRect(x - half, y - half, 2 * half, 2 * half);
        cx.lineWidth = (selHub === h ? 3 : 1.5) * dpr; cx.strokeStyle = selHub === h ? "#facc15" : "rgba(255,255,255,.9)"; cx.strokeRect(x - half, y - half, 2 * half, 2 * half);
        if ((HUBPH[h] || []).length) { cx.strokeStyle = "#ffffff"; cx.lineWidth = 1.6 * dpr; cx.beginPath(); cx.arc(x, y, half * 1.5, 0, 6.283); cx.stroke(); }
        cx.fillStyle = "#fff"; cx.font = `700 ${Math.max(9, Math.min(12, half / dpr * .9)) * dpr}px system-ui, sans-serif`; cx.fillText(h === "MDF" ? "MDF" : h.slice(3), x, y + 4 * dpr);
        cx.fillStyle = css("--textColor") || "#e5e7eb"; cx.font = `600 ${10 * dpr}px system-ui, sans-serif`; cx.fillText(hubLabel(h), x, y - half - 4 * dpr); }
      cx.textAlign = "start";
    }
    // the sliders cover EVERYTHING drawn - sensors, cabinets and the floor-plan sheet (L 2026-10-03: the store is tall, so
    // the left/right one never showed until a deep zoom even though the plan had more to see left and right)
    function slExt() {
      if (!B) return null; const E = { x0: B.x0, x1: B.x1, y0: B.y0, y1: B.y1 }, add = (x, y) => { E.x0 = Math.min(E.x0, x); E.x1 = Math.max(E.x1, x); E.y0 = Math.min(E.y0, y); E.y1 = Math.max(E.y1, y); };
      if (layout === "floor" && PLAN && planMode !== "off") for (const [u, v] of [[0, 0], [PLAN.w, 0], [0, PLAN.h], [PLAN.w, PLAN.h]]) { const [x, y] = rotXY(PLAN.x0 + u / PLAN.k, PLAN.y0 - v / PLAN.k); add(x, y); }
      if (layout === "floor" && TABLES && TABLES.hubs) for (const xy of Object.values(TABLES.hubs)) { const [x, y] = rotXY(xy[0], xy[1]); add(x, y); }
      return E;
    }
    function drawPlan() {
      const p = PLAN, light = document.documentElement.classList.contains("light");
      const sc = (u, v) => { const [rx, ry] = rotXY(p.x0 + u / p.k, p.y0 - v / p.k); return [view.ox + (rx - B.x0) * view.s, view.oy + (B.y1 - ry) * view.s]; };
      const [ax, ay] = sc(0, 0), [bx, by] = sc(p.w, 0), [cx2, cy2] = sc(0, p.h);
      let im = planImg;
      if (!light) {   // dark map: invert once (white sheet -> black, lines -> light) so it can be screened on
        if (!planDark) { const o = document.createElement("canvas"); o.width = planImg.naturalWidth; o.height = planImg.naturalHeight; const g = o.getContext("2d");
          g.drawImage(planImg, 0, 0); const d = g.getImageData(0, 0, o.width, o.height), a = d.data; for (let i = 0; i < a.length; i += 4) { a[i] = 255 - a[i]; a[i + 1] = 255 - a[i + 1]; a[i + 2] = 255 - a[i + 2]; }
          g.putImageData(d, 0, 0); planDark = o; }
        im = planDark; }
      if (cvw.moving) {   // moving: draw a small cached copy (long side 1400 px) instead of the full 1800x2366 sheet
        if (!planFast || planFast.light !== light) { const k = 1400 / Math.max(im.width || im.naturalWidth, im.height || im.naturalHeight), o = document.createElement("canvas");
          o.width = Math.round((im.width || im.naturalWidth) * k); o.height = Math.round((im.height || im.naturalHeight) * k); o.getContext("2d").drawImage(im, 0, 0, o.width, o.height); planFast = { light, c: o }; }
        im = planFast.c; }
      const W = im.width || im.naturalWidth, H = im.height || im.naturalHeight;
      // ONLY THE VISIBLE PIECE (the "won't load" / "stuttery" freeze, 2026-10-02): drawing the whole sheet through a big
      // zoom transform made the browser rasterize the entire scaled image (hundreds of megapixels at 6x) and hang the
      // tab for a minute. Invert the transform, find which part of the image covers the canvas, and draw just that.
      const a = (bx - ax) / W, b = (by - ay) / W, c = (cx2 - ax) / H, d = (cy2 - ay) / H, e = ax, f = ay, det = a * d - b * c;
      if (!det) return;
      const inv = (X, Y) => [(d * (X - e) - c * (Y - f)) / det, (a * (Y - f) - b * (X - e)) / det];
      const cs = [inv(0, 0), inv(cv.width, 0), inv(0, cv.height), inv(cv.width, cv.height)];
      let su = Math.min(...cs.map(q => q[0])), sv = Math.min(...cs.map(q => q[1])), eu = Math.max(...cs.map(q => q[0])), ev = Math.max(...cs.map(q => q[1]));
      su = Math.max(0, Math.floor(su) - 2); sv = Math.max(0, Math.floor(sv) - 2); eu = Math.min(W, Math.ceil(eu) + 2); ev = Math.min(H, Math.ceil(ev) + 2);
      if (eu <= su || ev <= sv) return;
      cx.save(); cx.globalAlpha = planMode === "full" ? (light ? 0.95 : 0.85) : (light ? 0.45 : 0.4); cx.globalCompositeOperation = light ? "multiply" : "screen";
      cx.setTransform(a, b, c, d, e, f); cx.drawImage(im, su, sv, eu - su, ev - sv, su, sv, eu - su, ev - sv); cx.restore();
      cx.setTransform(1, 0, 0, 1, 0, 0);
    }
    function planLabel() { $("plan").innerHTML = "&#128506; Plan: " + planMode; }
    function drawWiring(dpr, r) {
      const fg = css("--textColor") || "#e5e7eb", mut = css("--mutedText") || "#94a3b8";
      cx.lineWidth = 1 * dpr; cx.strokeStyle = "rgba(148,163,184,.28)"; cx.beginPath();
      for (const s of S) { if (!s.sw) continue; const a = P(s), b = PP(HUB[s.idf + "-" + s.sw]); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); }
      cx.stroke();
      cx.lineWidth = 2.5 * dpr; cx.strokeStyle = "rgba(148,163,184,.45)"; cx.beginPath();
      for (const idf of Object.keys(SWITCHES)) { const c = PP(HUB[idf]), m = PP(HUB.mdf); cx.moveTo(m[0], m[1]); cx.lineTo(c[0], c[1]);
        for (const sw of SWITCHES[idf]) { const w = PP(HUB[idf + "-" + sw]); cx.moveTo(c[0], c[1]); cx.lineTo(w[0], w[1]); } }
      cx.stroke();
      cx.textAlign = "center";
      const node = (pt, rad, fill, label, sub) => { const [x, y] = PP(pt); cx.fillStyle = fill; cx.beginPath(); cx.arc(x, y, rad * dpr, 0, 6.283); cx.fill();
        cx.fillStyle = "#fff"; cx.font = `700 ${11 * dpr}px system-ui, sans-serif`; cx.fillText(label, x, y + 4 * dpr);
        if (sub) { cx.fillStyle = mut; cx.font = `600 ${10 * dpr}px system-ui, sans-serif`; cx.fillText(sub, x, y + (rad + 13) * dpr); } };
      const ring = (pt, rad, n, on) => { const [x, y] = PP(pt);
        if (n) { cx.strokeStyle = "#ffffff"; cx.lineWidth = 2 * dpr; cx.beginPath(); cx.arc(x, y, (rad + 4) * dpr, 0, 6.283); cx.stroke();
          cx.fillStyle = "#ffffff"; cx.font = `700 ${10 * dpr}px system-ui, sans-serif`; cx.fillText("\u{1F4F7} " + n, x, y - (rad + 8) * dpr); }
        if (on) { cx.strokeStyle = "#facc15"; cx.lineWidth = 3 * dpr; cx.beginPath(); cx.arc(x, y, (rad + 8) * dpr, 0, 6.283); cx.stroke(); } };
      node(HUB.mdf, 18, "#475569", "MDF"); ring(HUB.mdf, 18, (HUBPH.MDF || []).length, selHub === "MDF");
      for (const idf of Object.keys(SWITCHES)) {
        const rs = S.filter(s => s.idf === Number(idf)), done = rs.filter(s => s.runDoneAt).length;
        node(HUB[idf], 16, IDF_COL[idf] || "#64748b", "IDF " + idf, `${done}/${rs.length} runs`);
        ring(HUB[idf], 16, (HUBPH["IDF" + idf] || []).length, selHub === "IDF" + idf);
        for (const sw of SWITCHES[idf]) { const n = S.filter(s => s.idf === Number(idf) && s.sw === sw).length;
          node(HUB[idf + "-" + sw], 11, sw === "new" ? "#ef4444" : "#334155", sw === "new" ? "new" : "#" + sw, `${n} / 18`); }
      }
      cx.textAlign = "start";
    }
    // ---------- the sensor card: photos, add photo, run complete, labeled ----------
    // THE PHOTO POP-UP (L 2026-10-03 "have the images pop up, the same way the checklist does for devices"): tap a thumb
    // -> the shared viewer (apps/assets/js/photoviewer.js): Previous / Next / Download / Delete / Close, swipe, arrow keys.
    // Delete removes the Storage object and drops it from this card's list; the sensor's photo count and the stats follow.
    // `s` = a sensor row (its .items) or a hub's ref array.
    async function thumbs(s) {
      const box = $("photos"), items = Array.isArray(s) ? s : s.items; if (!box) return;
      if (!items.length) { box.innerHTML = `<span class="muted">${PHOTOS === "loading" ? "Photos loading\u2026" : PHOTOS === "failed" ? "Photos unavailable \u2013 this network can't reach Storage." : "No photos yet."}</span>`; return; }
      box.innerHTML = items.map(() => '<a href="#" role="button"><img alt="" /></a>').join("");
      const links = box.querySelectorAll("a"), urls = new Array(items.length);
      links.forEach((a, k) => a.onclick = e => { e.preventDefault();
        openPhotoViewer(items.map((it, j) => ({ name: it.name, url: urls[j] || (() => photoUrl(it)), ref: it })), k, { onDelete: async v => {
          await deletePhoto(v.ref); const j = items.indexOf(v.ref); if (j >= 0) items.splice(j, 1);
          if (!Array.isArray(s)) { s.photos = items.length; renderStats(); if (S[sel] === s) show(sel); }
          else { renderHubs(); if (selHub && HUBPH[selHub] === items) showHub(selHub); } } }); });
      await Promise.all(items.map(async (it, k) => { try { const u = urls[k] = await photoUrl(it); links[k].firstChild.src = u; links[k].firstChild.alt = it.name; } catch (_) {} }));
    }
    function readOnlyCard() {   // a shared copy: drop the actions, say why
      $("info").querySelector(".acts")?.remove(); const n = $("info").querySelector(".note");
      if (n) n.textContent = `Shared copy (read-only) - photos and flags are the sharer's, as of ${TASKREC.sharedAt ? new Date(TASKREC.sharedAt).toLocaleString() : "the last share"}.`;
    }
    async function setFlag(field, on) {
      const s = S[sel]; if (!s || !OWNER || RO()) return;
      const ts = on ? Date.now() : null, btn = $(field === "runDoneAt" ? "runBtn" : "labBtn"); if (btn) btn.disabled = true;
      try { await patchSensor(OWNER, TASK, s.m, { [field]: ts }); s[field] = ts; renderStats(); show(sel); }
      catch (e) { alert("Couldn't save: " + (e.code || e.message || e)); if (btn) btn.disabled = false; }
    }
    // PHOTO RULES = the checklist's uploadSensor (L 2026-10-03 "make it all the same as the checklist"): camera-or-library
    // picker (no capture=), 2048 px JPEG, "<customer> NN - serial" bar unless unticked, <prefix>_NN-serial.jpg into the
    // job's sensors folder, a confirm once the sensor already has its 2 photos.
    async function addPhoto(file) {
      const s = S[sel]; if (!s || !file || !OWNER || RO()) return;
      if (s.photos >= 2 && !confirm(`Sensor ${String(s.m).padStart(2, "0")} already has ${s.photos} photos. Upload another?`)) { if ($("addPhoto")) $("addPhoto").value = ""; return; }
      let serial = clean(s.serial);
      if (!serial) { serial = clean(prompt(`Sensor #${s.m} has no serial yet. Serial number:`) || ""); if (!serial) return;
        await patchSensor(OWNER, TASK, s.m, { serial, updatedAt: Date.now() }).catch(() => {}); s.serial = serial; }
      const st = $("upState"), inp = $("addPhoto"); if (st) st.textContent = "Uploading..."; if (inp) inp.disabled = true;   // one at a time (sensor-83 scar)
      try {
        s.items.push(await uploadSensorPhoto({ owner: OWNER, task: TASKREC, id: TASK, mark: s.m, serial, file, bar: !$("mark") || $("mark").checked })); s.photos++;
        renderStats(); show(sel);
      } catch (e) { if (st) st.textContent = ""; if (inp) { inp.disabled = false; inp.value = ""; } alert("Upload failed: " + (e.code || e.message || e)); }
    }
    function showHub(h) {
      selHub = h; sel = -1; const items = HUBPH[h] || [], idf = h === "MDF" ? null : Number(h.slice(3));
      const rs = idf ? S.filter(s => s.idf === idf) : S, runs = rs.filter(s => s.runDoneAt).length, ph = rs.filter(s => s.photos >= 2).length;
      $("info").innerHTML = `<div class="mk">${hubLabel(h)}</div><div class="kv">
        <b>Sensors</b><span>${rs.length}</span>
        <b>Runs complete</b><span>${runs} / ${rs.length}</span>
        <b>Sensor photos</b><span>${PHOTOS === "ok" ? `${ph} / ${rs.length} with both` : PHOTOS === "loading" ? "loading\u2026" : "can't reach Storage"}</span>
        ${idf && TABLES && SWITCHES[idf] ? `<b>Switches</b><span>${SWITCHES[idf].map(w => w === "new" ? "3rd needed" : "#" + w).join(", ")}</span>` : ""}
        <b>Photos</b><span>${items.length || PHOTOS === "ok" ? items.length : PHOTOS === "loading" ? "loading\u2026" : "can't reach Storage"}</span></div>
        <div class="photos" id="rm-photos"></div>
        <div class="acts">
          <label class="btn primary">&#128247; Take / choose ${hubLabel(h)} photo<input type="file" id="rm-addHubPhoto" accept="image/*" hidden /></label>
          <label class="muted"><input type="checkbox" id="rm-mark" checked /> label bar</label>
          <span class="muted" id="rm-upState"></span>
        </div>
        <div class="note">Saved to the job's ${h} folder with a "${esc(String(TASKREC.customerName || "").trim())} ${hubLabel(h)}" bar.</div>`;
      if (RO()) readOnlyCard(); else $("addHubPhoto").onchange = e => addHubPhoto(h, e.target.files[0]);
      thumbs(items); draw();
    }
    async function addHubPhoto(h, file) {
      if (!file || !OWNER || RO()) return;
      const st = $("upState"), inp = $("addHubPhoto"); if (st) st.textContent = "Uploading..."; if (inp) inp.disabled = true;
      try {
        (HUBPH[h] = HUBPH[h] || []).push(await uploadHubPhoto({ owner: OWNER, task: TASKREC, id: TASK, hub: h, file, bar: !$("mark") || $("mark").checked }));
        renderHubs(); showHub(h);
      } catch (e) { if (st) st.textContent = ""; if (inp) { inp.disabled = false; inp.value = ""; } alert("Upload failed: " + (e.code || e.message || e)); }
    }
    function show(i) {
      sel = i; selHub = null; const s = S[i];
      $("info").innerHTML = `<div class="mk">#${s.m}</div><div class="kv">
        <b>Serial</b><span>${esc(s.serial) || "-"}</span>
        <b>Position</b><span>X ${fmtFt(s.x)} · Y ${fmtFt(s.y)}</span>
        <b>Height</b><span>${fmtFt(s.z)}</span>
        ${s.idf ? `<b>IDF / zone</b><span>IDF ${s.idf} · zone ${s.zone}</span>` : ""}
        ${s.sw ? `<b>Switch</b><span>${s.sw === "new" ? "3rd switch needed (not on site yet)" : "#" + s.sw}${s.port ? " · port " + s.port : ""} (planned)</span>` : ""}
        <b>Run</b><span>${s.runDoneAt ? "complete, " + new Date(s.runDoneAt).toLocaleString() : "not yet"}</span>
        <b>Labeled</b><span>${s.labeledAt ? "yes, " + new Date(s.labeledAt).toLocaleString() : "not yet"}</span>
        <b>Photos</b><span>${s.photos || PHOTOS === "ok" ? `${s.photos} of 2` : PHOTOS === "loading" ? "loading\u2026" : "can't reach Storage on this network"}</span></div>
        <form id="rm-measure" class="kv" hidden style="margin:8px 0;align-items:center">
          <b>X</b><input name="x" value="${esc(ftIn(s.x))}" inputmode="text" autocomplete="off" placeholder="e.g. -2'-4&quot;" />
          <b>Y</b><input name="y" value="${esc(ftIn(s.y))}" inputmode="text" autocomplete="off" placeholder="e.g. 198'-5 1/2&quot;" />
          <b>Z</b><input name="z" value="${esc(ftIn(s.z))}" inputmode="text" autocomplete="off" placeholder="e.g. 12'-11&quot;" />
          <span></span><span><button type="submit" class="primary">Save measurements</button> <button type="button" id="rm-measureCancel">Cancel</button> <span class="muted" id="rm-measureState"></span></span>
        </form>
        <div class="photos" id="rm-photos"></div>
        <div class="acts">
          <label class="btn primary">&#128247; Take / choose photo<input type="file" id="rm-addPhoto" accept="image/*" hidden /></label>
          <label class="muted"><input type="checkbox" id="rm-mark" checked /> label bar</label>
          <button type="button" id="rm-runBtn" class="${s.runDoneAt ? "done" : ""}">${s.runDoneAt ? "&#10003; Run complete" : "Mark run complete"}</button>
          <button type="button" id="rm-labBtn" class="${s.labeledAt ? "done" : ""}">${s.labeledAt ? "&#10003; Labeled" : "Mark labeled"}</button>
          <button type="button" id="rm-editMeasure">&#9998; Measurements</button>
          <span class="muted" id="rm-upState"></span>
        </div>
        <div class="note">Photos save like radar-tools: "${esc(photoPrefix(TASKREC))}_${String(s.m).padStart(2, "0")}-${esc(s.serial || "serial")}.jpg" with the label bar.</div>`;
      if (RO()) readOnlyCard(); else {
        $("addPhoto").onchange = e => addPhoto(e.target.files[0]);
        $("runBtn").onclick = () => setFlag("runDoneAt", !s.runDoneAt);
        $("labBtn").onclick = () => setFlag("labeledAt", !s.labeledAt);
        if ($("resetPos")) $("resetPos").onclick = () => resetPos(i);
        $("editMeasure").onclick = () => { const fm = $("measure"); fm.hidden = !fm.hidden; if (!fm.hidden) fm.x.focus(); };
        $("measureCancel").onclick = () => { $("measure").hidden = true; };
        $("measure").onsubmit = e => { e.preventDefault(); saveMeasure(i, e.target); };
      }
      thumbs(s);
      draw();
    }

    function hubAt(mx, my) {   // which cabinet marker is under the finger, in either view
      for (const h of HUBS) { let pt = null;
        if (layout === "wiring") pt = h === "MDF" ? HUB.mdf : HUB[h.slice(3)]; else { const xy = hubXY(h); pt = xy ? rotXY(xy[0], xy[1]) : null; }
        if (!pt) continue; const [x, y] = PP(pt); if ((x - mx) ** 2 + (y - my) ** 2 < (24 * view.dpr) ** 2) return h; }
      return null;
    }
    // ---------- zoom / pan / tap ----------
    // HOLD-TO-MOVE (L 2026-10-02 "a way to move these sensors around, like hold 'em and move each object around"):
    // hold a sensor or cabinet ~0.5 s without moving, then drag it. Floor view only. A sensor's new spot is saved as
    // straight into the measurements m1/m2 (2026-10-04: the measurement IS the spot - no separate as-built pos). A cabinet's spot
    // saves to siteTables/hubs. Screen delta -> plan feet goes through the inverse of the rotate.
    const unrot = (dx, dy) => ROT === 90 ? [dy, -dx] : ROT === 180 ? [-dx, -dy] : ROT === 270 ? [-dy, dx] : [dx, dy];
    async function endMove(m) {   // the engine's onDragEnd: save the moved sensor / cabinet
      if (!m || !OWNER) return;
      try {
        if (m.kind === "sensor") { const s = S[m.i]; s.pos = { x: Math.round(s.x * 100) / 100, y: Math.round(s.y * 100) / 100 }; s.x = s.pos.x; s.y = s.pos.y;
          s.pos = null; s.plan = [s.x, s.y];   // the new spot IS the measurement (L 2026-10-04 "just enter what it is")
          await patchSensor(OWNER, TASK, s.m, { m1: "X " + ftIn(s.x), m2: "Y " + ftIn(s.y), pos: null, posAt: null, updatedAt: Date.now() }); if (sel === m.i) show(m.i); }
        else { const xy = TABLES.hubs[m.h]; xy[0] = Math.round(xy[0] * 10) / 10; xy[1] = Math.round(xy[1] * 10) / 10; await saveHubPos(OWNER, TASK, m.h, xy); }
      } catch (e) { alert("Couldn't save the new spot: " + (e.code || e.message || e)); }
      draw();
    }
    // EDIT MEASUREMENTS (L 2026-10-04 "in the map I need to be able to edit the measurements"): X / Y / Z in feet-inches
    // (-2'-4", 198'-5 1/2", 12'-11"; a bare number = feet) -> m1/m2/m3 as "X ...", "Y ...", "Z ..." (the sheet's own format).
    // A blank box clears that measurement; anything unreadable stops the save and says which box.
    function ftIn(v) {
      if (v == null || !Number.isFinite(v)) return "";
      const neg = v < 0, t = Math.round(Math.abs(v) * 12 * 8) / 8; let ft = Math.floor(t / 12), inch = t - ft * 12;
      const whole = Math.floor(inch), frac = inch - whole, fr = frac ? ` ${frac * 8 % 2 ? frac * 8 + "/8" : frac * 4 % 2 ? frac * 4 + "/4" : "1/2"}` : "";
      return `${neg ? "-" : ""}${ft}'-${whole}${fr}"`;
    }
    const readFt = t => { t = String(t || "").trim(); if (!t) return { v: null, txt: "" };
      if (/^-?\d+(\.\d+)?$/.test(t)) { const v = Number(t); return { v, txt: ftIn(v) }; }
      const v = feet(t); return v == null ? null : { v, txt: t.replace(/^[XYZ]\s*/i, "") }; };
    async function saveMeasure(i, fm) {
      const s = S[i]; if (!s || !OWNER) return; const st = $("measureState");
      const vals = {}; for (const k of ["x", "y", "z"]) { const r = readFt(fm[k].value); if (r === null) { st.textContent = `${k.toUpperCase()} isn't a measurement - use 12'-6" or 12.5`; fm[k].focus(); return; } vals[k] = r; }
      st.textContent = "saving\u2026";
      try {
        await patchSensor(OWNER, TASK, s.m, { m1: vals.x.txt ? "X " + vals.x.txt : "", m2: vals.y.txt ? "Y " + vals.y.txt : "", m3: vals.z.txt ? "Z " + vals.z.txt : "", pos: null, posAt: null, updatedAt: Date.now() });
        s.pos = null; s.plan = [vals.x.v, vals.y.v]; s.z = vals.z.v; s.x = vals.x.v; s.y = vals.y.v;   // the measurement is the spot
        show(i); renderStats();
      } catch (e) { st.textContent = "not saved: " + (e.code || e.message || e); }
    }
    async function resetPos(i) {
      const s = S[i]; if (!s || !OWNER) return;
      try { await patchSensor(OWNER, TASK, s.m, { pos: null, posAt: null }); s.pos = null; s.x = s.plan[0]; s.y = s.plan[1]; show(i); }
      catch (e) { alert("Couldn't reset: " + (e.code || e.message || e)); }
    }
    $("modes").addEventListener("click", e => { const b = e.target.closest("button[data-m]"); if (!b) return;
      mode = b.dataset.m; root.querySelectorAll("#rm-modes button").forEach(x => x.classList.toggle("on", x === b)); legend(); draw(); });
    // LIVE FIND (L 2026-10-02: "when I type a radar number have it highlight in real time"): every keystroke rings the
    // sensors whose number starts with what's typed (yellow); an exact number also flies there and opens its card.
    const centerOn = (i, minZoom) => { const s = S[i]; cvw.centerOn(X(s), Y(s), minZoom); };
    $("find").addEventListener("input", e => {
      const t = e.target.value.replace(/\D/g, ""); HL = new Set();
      if (!t || !cvw.fitted) { draw(); return; }
      S.forEach((s, i) => { if (String(s.m).startsWith(t)) HL.add(i); });
      const i = S.findIndex(s => s.m === Number(t));
      if (i >= 0 && (HL.size === 1 || t.length >= 3)) { centerOn(i, 4); show(i); } else draw();
    });
    $("find").addEventListener("change", e => { const i = S.findIndex(s => s.m === Number(e.target.value)); if (i < 0) return; centerOn(i, 4); show(i); });
    // ZOOM BUTTONS (L 2026-10-03 "add a zoom and unzoom button onscreen"): 1.6x per tap, about the centre of the view
    $("zin").addEventListener("click", () => cvw.zoomAt(cv.width / 2, cv.height / 2, 1.6));
    $("zout").addEventListener("click", () => cvw.zoomAt(cv.width / 2, cv.height / 2, 1 / 1.6));
    $("rot").addEventListener("click", () => { ROT = (ROT + 90) % 360; try { localStorage.setItem("rm-rot", String(ROT)); } catch (_) {}
      $("rot").title = `Rotated ${ROT}° - tap to turn again`; if (layout === "floor") fit(false); });
    $("plan").addEventListener("click", () => { planMode = planMode === "dim" ? "full" : planMode === "full" ? "off" : "dim";
      try { localStorage.setItem("rm-plan-mode", planMode); } catch (_) {} planLabel(); draw(); });
    $("hubs").addEventListener("click", e => { const b = e.target.closest("button[data-h]"); if (b) showHub(b.dataset.h); });
    $("views").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (!b) return;
      if (b.dataset.v === "wiring" && !TABLES) { alert("The wiring view needs a site plan (zones, IDF per sensor, switches) on this job's record - this site has none yet."); return; }
      layout = b.dataset.v; root.querySelectorAll("#rm-views button").forEach(x => x.classList.toggle("on", x === b)); fit(false); });
    async function loadJobs(user) {   // same one-row-per-site list as the checklist (telaid-data groupSites)
      const selEl = $("job"); if (EMBED || !user || !selEl) return;
      const { sites } = await listSites(user);
      if (!sites.length) { selEl.innerHTML = '<option value="">No jobs found</option>'; return; }
      const cur = sites.find(g => g.ids.includes(TASK));
      selEl.innerHTML = sites.map(g => `<option value="${g.id}"${cur === g ? " selected" : ""}>${g.hasSensors ? "" : "(no sensors) "}${esc(g.label)}</option>`).join("");
      if (cur && cur.id !== TASK) setTaskId(cur.id);   // a sibling-night id -> the site's canonical record
    }
    $("job").addEventListener("change", e => { const t = e.target.value; if (!t) return;
      try { localStorage.setItem("sensorTask", JSON.stringify({ task: t, name: e.target.selectedOptions[0].text, at: Date.now() })); } catch (_) {}
      try { const u = new URL(location.href); u.searchParams.set("task", t); history.replaceState(null, "", u); } catch (_) {}
      setTaskId(t); HL = new Set(); $("find").value = ""; $("info").innerHTML = '<span class="muted">Tap a sensor to see its details.</span>';
      load(auth.currentUser); });
    legend(); fit();
    onAuthStateChanged(auth, async u => { await loadJobs(u); load(u); });   // jobs first: a sibling-night id gets swapped for the canonical one before the data read
    return {
      setTask(t) { if (!t || String(t) === TASK) return; setTaskId(t); $("info").innerHTML = '<span class="muted">Tap a sensor to see its details.</span>'; load(auth.currentUser); },
      refit: fit,
    };
  
}
