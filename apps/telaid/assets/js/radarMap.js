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
import { auth, HUBS, hubLabel, esc, fmtFt, clean, loadJob, sensorRows, patchSensor, listSites, listPhotos, photoUrl,
  sensorMarkOf, photoPrefix, uploadSensorPhoto, uploadHubPhoto, tablesFor, zoneOf, idfOf, loadFloorPlan, saveHubPos } from "./telaid-data.js?v=1002o";

const CSS = `.rmap .app-shell { max-width: 1100px; margin: auto; padding: 12px; display: grid; gap: 12px; }
.rmap .card { background: var(--cardBackground); border: 1px solid var(--borderColor); border-radius: 12px; padding: 12px; box-shadow: var(--cardShadow); }
.rmap .rm-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.rmap .muted { color: var(--mutedText); font-size: .9rem; }
.rmap #rm-modes button { width: auto !important; margin: 0 !important; box-shadow: none !important; display: inline-block; font-size: .9rem; line-height: 1.2;
padding: 6px 12px; border-radius: 999px; border: 1px solid var(--borderColor); background: transparent; color: var(--textColor); cursor: pointer; }
.rmap #rm-modes button.on { background: var(--primaryColor); border-color: var(--primaryColor); color: #fff; }
.rmap #rm-find { width: 7em !important; margin: 0 !important; font-size: 1rem; padding: 6px 8px; }
.rmap .mapwrap { position: relative; border-radius: 12px; overflow: hidden; border: 1px solid var(--borderColor); background: var(--secondaryBackgroundColor); }
.rmap #rm-map { display: block; width: 100%; height: min(75vh, 720px); touch-action: none; cursor: grab; }
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
.rmap .photos a { flex: none; }
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
        <input type="range" id="rm-slx" class="rm-sl rm-slx" min="0" max="1000" value="0" aria-label="Move the map left or right" hidden />
        <input type="range" id="rm-sly" class="rm-sl rm-sly" min="0" max="1000" value="0" aria-label="Move the map up or down" hidden /></div>
      <div class="legend" id="rm-legend"></div>
      <div class="muted hint">Pinch, or Shift + scroll, to zoom · two fingers (any direction), the edge sliders, or a mouse drag move the map; one finger on the map scrolls the page · tap a sensor or cabinet for its photos · hold one ~half a second, then drag, to move it · double-tap to reset the view. Numbers appear as you zoom in.</div>
      <div class="card" id="rm-info"><span class="muted">Tap a sensor to see its details.</span></div>
    </div>`;

export function mountRadarMap(root, opts = {}) {
    injectCss(); root.classList.add("rmap"); root.innerHTML = TEMPLATE;
    const LAST_SITE = (() => { try { return JSON.parse(localStorage.getItem("sensorTask")) || null; } catch (_) { return null; } })();
    let TASK = "", TABLES = null, SWITCHES = {};   // TABLES = this site's plan (task.siteTables in Firebase, or the built-in WM54 table)
    const setTaskId = t => { TASK = String(t); TABLES = null; SWITCHES = {}; };   // the plan arrives with the job in load()
    const EMBED = !!opts.embed;
    // Embedded in the checklist the map follows ONLY the site the checklist opens - no remembered site, no default
    // (L 2026-10-02: "the map is loading the Walmart one even when I haven't selected anything yet").
    setTaskId(opts.task || (!EMBED && LAST_SITE && LAST_SITE.task) || (!EMBED && "1789898400000") || "");
    if (EMBED) root.classList.add("embed");
    const HUBPH = {};   // "MDF"/"IDF3" -> [storage refs]
    let selHub = null, HL = new Set();   // HL = sensors matching what's typed in the Sensor # box (live)
    let loadGen = 0, PHOTOS = "loading";  // photos arrive after the map; "loading" | "ok" | "failed" (can't reach Storage)
    // FLOOR PLAN under the dots (L 2026-10-02): the key-map drawing, fitted to the sensor coordinates (telaid-data
    // loadFloorPlan). Light theme = the drawing multiplied over the map; dark theme = an inverted copy screened on.
    let PLAN = null, planImg = null, planDark = null, planMode = "dim";
    try { planMode = localStorage.getItem("rm-plan-mode") || "dim"; } catch (_) {}
    const $ = id => root.querySelector("#rm-" + id);

    let S = [];            // {m, serial, x, y, z, idf, zone, photos, items, labeledAt, runDoneAt, sw, port, wx, wy}
    let mode = "idf", sel = -1, layout = "floor";
    let OWNER = null, TASKREC = {};      // set by load(); used by the card's actions
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
      const line = `${task.customerName || "Job " + TASK} \u00b7 ${S.length} sensors \u00b7 loaded ${new Date().toLocaleTimeString()}${TABLES ? ` \u00b7 site plan: ${TABLES.from}` : ""}`;
      $("source").textContent = line + " \u00b7 photos loading\u2026";
      renderHubs(); renderStats(); fit(false);
      // PHOTOS IN THE BACKGROUND (L 2026-10-03, "did you freeze?": on a network that could not resolve
      // firebasestorage.googleapis.com, listAll retried for ~2 min before failing and the whole map waited on it).
      // The map draws first; photo counts/rings fill in when Storage answers, or the source line says it couldn't.
      const gen = ++loadGen; PHOTOS = "loading";
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
    let view = { s: 1, ox: 0, oy: 0, dpr: 1 }, base = null, B = null;
    // SMOOTH (L 2026-10-02 "it's very stuttery now"): pointer events arrive faster than the iPad can paint the floor plan,
    // so moves only ASK for a frame (one draw per animation frame), the plan is drawn from a small cached copy while a
    // finger is down (full-res again on release), and the 241 number labels wait until the move ends.
    let raf = 0; const requestDraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
    let scrollAcc = 0, scrollRaf = 0; const scrollPage = dy => { scrollAcc += dy; if (!scrollRaf) scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; window.scrollBy(0, scrollAcc); scrollAcc = 0; }); };
    let planFast = null;   // {light, c}
    // fit(keep): size the canvas and compute the fitted "base" view. keep = true (resizes) holds the current zoom and the
    // world point under the canvas centre - L 2026-10-03 "it snaps back to unzoomed sometimes when I scroll the page":
    // on the iPad the toolbar collapsing while you scroll fires resize + a canvas height change, which used to reset the view.
    function fit(keep = true) {
      const prev = keep && base && B && S.length && view.s > base.s * 1.01
        ? { zoom: view.s / base.s, cx: B.x0 + (cv.width / 2 - view.ox) / view.s, cy: B.y1 - (cv.height / 2 - view.oy) / view.s } : null;
      const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      $("sly").style.setProperty("--rm-slh", Math.max(60, r.height - 40) + "px");
      if (!S.length) return draw();
      const xs = S.map(X), ys = S.map(Y);
      B = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
      const pad = 24 * dpr, s = Math.min((cv.width - 2 * pad) / (B.x1 - B.x0 || 1), (cv.height - 2 * pad) / (B.y1 - B.y0 || 1));
      view = { s, dpr, ox: (cv.width - (B.x1 - B.x0) * s) / 2, oy: (cv.height - (B.y1 - B.y0) * s) / 2 }; base = Object.assign({}, view);
      if (prev) { view.s = base.s * prev.zoom; view.ox = cv.width / 2 - (prev.cx - B.x0) * view.s; view.oy = cv.height / 2 - (B.y1 - prev.cy) * view.s; }
      draw();
    }
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
      if (zoom >= 2.2 && !ptr.size) {   // number labels wait until the move ends (fillText x241 is what the iPad trips on)
        cx.font = `600 ${11 * dpr}px system-ui, sans-serif`; cx.fillStyle = css("--textColor") || "#e5e7eb";
        for (const s of S) { const [x, y] = P(s); if (x > 0 && y > 0 && x < cv.width && y < cv.height) cx.fillText(String(s.m), x + r + 2 * dpr, y + 4 * dpr); }
      }
      if (HL.size) { cx.strokeStyle = "#facc15"; cx.lineWidth = 2.5 * dpr;
        for (const i of HL) { const [x, y] = P(S[i]); cx.beginPath(); cx.arc(x, y, r + 4 * dpr, 0, 6.283); cx.stroke(); } }
      if (sel >= 0) { const s = S[sel], [x, y] = P(s); cx.strokeStyle = css("--textColor") || "#fff"; cx.lineWidth = 2.5 * dpr;
        cx.beginPath(); cx.arc(x, y, r + 5 * dpr, 0, 6.283); cx.stroke(); }
      syncSliders();
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
    // sliders <-> view. t = 0: the map's left (top) edge at the box edge; t = 1: its right (bottom) edge there.
    let slHeld = null;
    function slExtent() { return B ? [(B.x1 - B.x0) * view.s - cv.width, (B.y1 - B.y0) * view.s - cv.height] : [0, 0]; }
    function syncSliders() {
      if (!B || !base) return; const [ex, ey] = slExtent(), sx = $("slx"), sy = $("sly");
      sx.hidden = ex <= 1; sy.hidden = ey <= 1;
      if (ex > 1 && slHeld !== "x") sx.value = Math.round(Math.max(0, Math.min(1, -view.ox / ex)) * 1000);
      if (ey > 1 && slHeld !== "y") sy.value = Math.round(Math.max(0, Math.min(1, -view.oy / ey)) * 1000);
    }
    for (const [id, axis] of [["slx", "x"], ["sly", "y"]]) { const el = $(id);
      el.addEventListener("pointerdown", () => { slHeld = axis; }); el.addEventListener("pointerup", () => { slHeld = null; }); el.addEventListener("pointercancel", () => { slHeld = null; });
      el.addEventListener("input", () => { const [ex, ey] = slExtent(), t = Number(el.value) / 1000;
        if (axis === "x") { if (ex > 1) view.ox = -t * ex; } else { if (ey > 1) view.oy = -t * ey; } requestDraw(); }); }
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
      if (ptr.size) {   // moving: draw a small cached copy (long side 1400 px) instead of the full 1800x2366 sheet
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
    async function thumbs(s) {
      const box = $("photos"), items = Array.isArray(s) ? s : s.items; if (!box) return;
      if (!items.length) { box.innerHTML = `<span class="muted">${PHOTOS === "loading" ? "Photos loading\u2026" : PHOTOS === "failed" ? "Photos unavailable \u2013 this network can't reach Storage." : "No photos yet."}</span>`; return; }
      box.innerHTML = items.map(() => '<a><img alt="" /></a>').join("");
      const links = box.querySelectorAll("a");
      await Promise.all(items.map(async (it, k) => { try { const u = await photoUrl(it);
        links[k].href = u; links[k].target = "_blank"; links[k].rel = "noopener"; links[k].firstChild.src = u; links[k].firstChild.alt = it.name; } catch (_) {} }));
    }
    async function setFlag(field, on) {
      const s = S[sel]; if (!s || !OWNER) return;
      const ts = on ? Date.now() : null, btn = $(field === "runDoneAt" ? "runBtn" : "labBtn"); if (btn) btn.disabled = true;
      try { await patchSensor(OWNER, TASK, s.m, { [field]: ts }); s[field] = ts; renderStats(); show(sel); }
      catch (e) { alert("Couldn't save: " + (e.code || e.message || e)); if (btn) btn.disabled = false; }
    }
    async function addPhoto(file) {
      const s = S[sel]; if (!s || !file || !OWNER) return;
      let serial = clean(s.serial);
      if (!serial) { serial = clean(prompt(`Sensor #${s.m} has no serial yet. Serial number:`) || ""); if (!serial) return;
        await patchSensor(OWNER, TASK, s.m, { serial, updatedAt: Date.now() }).catch(() => {}); s.serial = serial; }
      const st = $("upState"); if (st) st.textContent = "Uploading...";
      try {
        s.items.push(await uploadSensorPhoto({ owner: OWNER, task: TASKREC, mark: s.m, serial, file })); s.photos++;
        renderStats(); show(sel);
      } catch (e) { if (st) st.textContent = ""; alert("Upload failed: " + (e.code || e.message || e)); }
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
          <label class="btn primary">&#128247; Add ${hubLabel(h)} photo<input type="file" id="rm-addHubPhoto" accept="image/*" capture="environment" hidden /></label>
          <span class="muted" id="rm-upState"></span>
        </div>
        <div class="note">Saved to the job's ${h} folder with a "${esc(String(TASKREC.customerName || "").trim())} ${hubLabel(h)}" bar.</div>`;
      $("addHubPhoto").onchange = e => addHubPhoto(h, e.target.files[0]);
      thumbs(items); draw();
    }
    async function addHubPhoto(h, file) {
      if (!file || !OWNER) return;
      const st = $("upState"); if (st) st.textContent = "Uploading...";
      try {
        (HUBPH[h] = HUBPH[h] || []).push(await uploadHubPhoto({ owner: OWNER, task: TASKREC, hub: h, file }));
        renderHubs(); showHub(h);
      } catch (e) { if (st) st.textContent = ""; alert("Upload failed: " + (e.code || e.message || e)); }
    }
    function show(i) {
      sel = i; selHub = null; const s = S[i];
      $("info").innerHTML = `<div class="mk">#${s.m}</div><div class="kv">
        <b>Serial</b><span>${esc(s.serial) || "-"}</span>
        <b>Position</b><span>X ${fmtFt(s.x)} · Y ${fmtFt(s.y)}${s.pos ? ` <span class="muted">(moved ${Math.hypot(s.x - s.plan[0], s.y - s.plan[1]).toFixed(1)} ft from plan X ${fmtFt(s.plan[0])} · Y ${fmtFt(s.plan[1])})</span>` : ""}</span>
        <b>Height</b><span>${fmtFt(s.z)}</span>
        ${s.idf ? `<b>IDF / zone</b><span>IDF ${s.idf} · zone ${s.zone}</span>` : ""}
        ${s.sw ? `<b>Switch</b><span>${s.sw === "new" ? "3rd switch needed (not on site yet)" : "#" + s.sw}${s.port ? " · port " + s.port : ""} (planned)</span>` : ""}
        <b>Run</b><span>${s.runDoneAt ? "complete, " + new Date(s.runDoneAt).toLocaleString() : "not yet"}</span>
        <b>Labeled</b><span>${s.labeledAt ? "yes, " + new Date(s.labeledAt).toLocaleString() : "not yet"}</span>
        <b>Photos</b><span>${s.photos || PHOTOS === "ok" ? `${s.photos} of 2` : PHOTOS === "loading" ? "loading\u2026" : "can't reach Storage on this network"}</span></div>
        <div class="photos" id="rm-photos"></div>
        <div class="acts">
          <label class="btn primary">&#128247; Add photo<input type="file" id="rm-addPhoto" accept="image/*" capture="environment" hidden /></label>
          <button type="button" id="rm-runBtn" class="${s.runDoneAt ? "done" : ""}">${s.runDoneAt ? "&#10003; Run complete" : "Mark run complete"}</button>
          <button type="button" id="rm-labBtn" class="${s.labeledAt ? "done" : ""}">${s.labeledAt ? "&#10003; Labeled" : "Mark labeled"}</button>
          ${s.pos ? '<button type="button" id="rm-resetPos">Back to plan spot</button>' : ""}
          <span class="muted" id="rm-upState"></span>
        </div>
        <div class="note">Photos save like radar-tools: "${esc(photoPrefix(TASKREC))}_${String(s.m).padStart(2, "0")}-${esc(s.serial || "serial")}.jpg" with the label bar.</div>`;
      $("addPhoto").onchange = e => addPhoto(e.target.files[0]);
      $("runBtn").onclick = () => setFlag("runDoneAt", !s.runDoneAt);
      $("labBtn").onclick = () => setFlag("labeledAt", !s.labeledAt);
      if ($("resetPos")) $("resetPos").onclick = () => resetPos(i);
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
    const ptr = new Map(); let drag = null, pinch = null, moved = false;
    // HOLD-TO-MOVE (L 2026-10-02 "a way to move these sensors around, like hold 'em and move each object around"):
    // hold a sensor or cabinet ~0.5 s without moving, then drag it. Floor view only. A sensor's new spot is saved as
    // sensorMeta/<mark>/pos (as built) - m1/m2 keep the plan - and its card offers "Back to plan". A cabinet's spot
    // saves to siteTables/hubs. Screen delta -> plan feet goes through the inverse of the rotate.
    let press = null, mov = null;   // mov = {kind:"sensor", i} | {kind:"hub", h}
    const unrot = (dx, dy) => ROT === 90 ? [dy, -dx] : ROT === 180 ? [-dx, -dy] : ROT === 270 ? [-dy, dx] : [dx, dy];
    async function endMove() {
      const m = mov; mov = null; cv.style.cursor = ""; if (!m || !OWNER) return;
      try {
        if (m.kind === "sensor") { const s = S[m.i]; s.pos = { x: Math.round(s.x * 100) / 100, y: Math.round(s.y * 100) / 100 }; s.x = s.pos.x; s.y = s.pos.y;
          await patchSensor(OWNER, TASK, s.m, { pos: s.pos, posAt: Date.now() }); if (sel === m.i) show(m.i); }
        else { const xy = TABLES.hubs[m.h]; xy[0] = Math.round(xy[0] * 10) / 10; xy[1] = Math.round(xy[1] * 10) / 10; await saveHubPos(OWNER, TASK, m.h, xy); }
      } catch (e) { alert("Couldn't save the new spot: " + (e.code || e.message || e)); }
      draw();
    }
    async function resetPos(i) {
      const s = S[i]; if (!s || !OWNER) return;
      try { await patchSensor(OWNER, TASK, s.m, { pos: null, posAt: null }); s.pos = null; s.x = s.plan[0]; s.y = s.plan[1]; show(i); }
      catch (e) { alert("Couldn't reset: " + (e.code || e.message || e)); }
    }
    const toC = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * view.dpr, (e.clientY - r.top) * view.dpr]; };
    function zoomAt(px, py, f) { if (!base) return; const ns = Math.max(base.s * .7, Math.min(base.s * 30, view.s * f)); f = ns / view.s;
      view.ox = px - (px - view.ox) * f; view.oy = py - (py - view.oy) * f; view.s = ns; requestDraw(); }
    // L 2026-10-02: a plain wheel scrolls the PAGE; Shift + wheel (or Ctrl, i.e. trackpad pinch) zooms the map.
    cv.addEventListener("wheel", e => { if (!e.shiftKey && !e.ctrlKey) return; e.preventDefault(); const [x, y] = toC(e);
      zoomAt(x, y, Math.exp(-(e.deltaY || e.deltaX) * 0.0015)); }, { passive: false });
    // ONE FINGER SCROLLS THE PAGE, TWO MOVE THE MAP (L 2026-10-02): touch-action is NONE - on the iPad, touch-action pan-y
    // let Safari treat a two-finger drag as a native page pan (pinch reached us, moving did not). So the browser gets no
    // gesture at all; one finger scrolls the page BY HAND (scrollBy + a glide), two fingers pan/zoom the map, a hold then
    // drag moves an object. Mouse drag still pans.
    // one-finger page scroll done by hand (touch-action none): follow the finger, then a short glide on release
    const fling = { v: 0, t: 0, id: 0 };
    function glide() { const id = ++fling.id; let v = fling.v, last = performance.now();
      const step = now => { if (id !== fling.id) return; const dt = now - last; last = now; window.scrollBy(0, v * dt); v *= Math.pow(0.94, dt / 16); if (Math.abs(v) > 0.02) requestAnimationFrame(step); };
      if (Math.abs(v) > 0.25) requestAnimationFrame(step); }
    cv.addEventListener("pointerdown", e => { try { cv.setPointerCapture(e.pointerId); } catch (_) {} ptr.set(e.pointerId, toC(e)); moved = false;
      if (ptr.size === 1) { drag = toC(e); clearTimeout(press); press = null; mov = null;
        if (layout === "floor" && e.button === 0 && !e.shiftKey) { const [mx, my] = drag, hh = hubAt(mx, my);
          let best = -1; if (!hh) { let bd = (22 * view.dpr) ** 2; S.forEach((s, i) => { const [x, y] = P(s), d = (x - mx) ** 2 + (y - my) ** 2; if (d < bd) { bd = d; best = i; } }); }
          if (hh || best >= 0) press = setTimeout(() => { press = null; if (moved) return; mov = hh ? { kind: "hub", h: hh } : { kind: "sensor", i: best };
            moved = true; cv.style.cursor = "grabbing"; if (navigator.vibrate) try { navigator.vibrate(15); } catch (_) {} draw(); }, 480); } }
      if (ptr.size === 2) { clearTimeout(press); press = null; mov = null; const [a, b] = [...ptr.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
    cv.addEventListener("pointermove", e => { if (!ptr.has(e.pointerId)) return; const p = toC(e); ptr.set(e.pointerId, p);
      if (ptr.size === 2 && pinch) { const [a, b] = [...ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch); pinch = d; moved = true; }
      else if (drag) { const dx = p[0] - drag[0], dy = p[1] - drag[1];
        if (e.pointerType === "touch" && !mov) {   // one finger = scroll the page, never the map (and never start a grab)
          if (Math.abs(dx) + Math.abs(dy) > 6) { moved = true; clearTimeout(press); press = null; }
          const d = view.dpr || 1, now = performance.now(); scrollPage(-dy / d); fling.v = (-dy / d) / Math.max(1, now - fling.t); fling.t = now; drag = p; return; }
        if (mov) { const [fx, fy] = unrot(dx / view.s, -dy / view.s);   // screen y down -> plan y up
          if (mov.kind === "sensor") { S[mov.i].x += fx; S[mov.i].y += fy; } else { TABLES.hubs[mov.h][0] += fx; TABLES.hubs[mov.h][1] += fy; }
          drag = p; requestDraw(); return; }
        if (Math.abs(dx) + Math.abs(dy) > 6) { moved = true; clearTimeout(press); press = null; }
        view.ox += dx; view.oy += dy; drag = p; requestDraw(); } });
    const up = e => { ptr.delete(e.pointerId); clearTimeout(press); press = null; if (ptr.size < 2) pinch = null;
      if (!ptr.size) { drag = null; if (mov) endMove(); else if (e.pointerType === "touch" && moved && performance.now() - fling.t < 80) glide(); requestDraw(); } };   // full-quality frame once the fingers lift
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    cv.addEventListener("dblclick", () => { if (base) { view = Object.assign({}, base); draw(); } });
    cv.addEventListener("click", e => { if (moved) { moved = false; return; }
      const [mx, my] = toC(e);
      const hh = hubAt(mx, my); if (hh) return showHub(hh);
      let best = -1, bd = (22 * view.dpr) ** 2;
      S.forEach((s, i) => { const [x, y] = P(s), d = (x - mx) ** 2 + (y - my) ** 2; if (d < bd) { bd = d; best = i; } });
      if (best >= 0) show(best); });   // no page jump on tap (L 2026-10-02: "we don't need it to snap to the bottom when I click an object")
    $("modes").addEventListener("click", e => { const b = e.target.closest("button[data-m]"); if (!b) return;
      mode = b.dataset.m; root.querySelectorAll("#rm-modes button").forEach(x => x.classList.toggle("on", x === b)); legend(); draw(); });
    // LIVE FIND (L 2026-10-02: "when I type a radar number have it highlight in real time"): every keystroke rings the
    // sensors whose number starts with what's typed (yellow); an exact number also flies there and opens its card.
    function centerOn(i, minZoom) { const s = S[i]; view.s = Math.max(view.s, base.s * minZoom);
      view.ox = cv.width / 2 - (X(s) - B.x0) * view.s; view.oy = cv.height / 2 - (B.y1 - Y(s)) * view.s; }
    $("find").addEventListener("input", e => {
      const t = e.target.value.replace(/\D/g, ""); HL = new Set();
      if (!t || !base) { draw(); return; }
      S.forEach((s, i) => { if (String(s.m).startsWith(t)) HL.add(i); });
      const i = S.findIndex(s => s.m === Number(t));
      if (i >= 0 && (HL.size === 1 || t.length >= 3)) { centerOn(i, 4); show(i); } else draw();
    });
    $("find").addEventListener("change", e => { const i = S.findIndex(s => s.m === Number(e.target.value)); if (i < 0) return; centerOn(i, 4); show(i); });
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
    addEventListener("resize", () => fit(true));
    // a section that was collapsed (display:none) when we mounted gives a 0-wide canvas; re-fit when it gets real size
    let lastW = 0, lastH = 0; new ResizeObserver(() => { const r = cv.getBoundingClientRect(); if (r.width && (r.width !== lastW || r.height !== lastH)) { lastW = r.width; lastH = r.height; fit(true); } }).observe(cv);
    legend(); fit();
    onAuthStateChanged(auth, async u => { await loadJobs(u); load(u); });   // jobs first: a sibling-night id gets swapped for the canonical one before the data read
    return {
      setTask(t) { if (!t || String(t) === TASK) return; setTaskId(t); $("info").innerHTML = '<span class="muted">Tap a sensor to see its details.</span>'; load(auth.currentUser); },
      refit: fit,
    };
  
}
