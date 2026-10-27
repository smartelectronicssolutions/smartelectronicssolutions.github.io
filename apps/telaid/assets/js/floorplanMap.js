// floorplanMap.js (was radarMap.js, renamed 2026-10-27) - THE map app for every Telaid job (radar sensors + device lists), floorplan.html (the full page) and radar-tools.html (the
// "Site Map" section of the checklist). L 2026-10-02: "since it's 2 things now in sections of the Telaid checklist,
// can it grab the logic from the same place" - so the map, its sensor/IDF cards, photo upload and the run/label
// toggles live ONLY here. mountRadarMap(root, {task, embed}) -> { setTask(id), refit() }.
// Everything it renders is scoped: ids are "rm-*", CSS is under .rmap, so it can sit inside another page.
// DATA comes from telaid-data.js (the one file that knows the Firebase shape) - one read per load, no timers (poll-loop scar).
// Shape, for orientation: {owner}/tasks/<task>/sensorMeta/<mark> = {serial, m1/m2/m3,
// labeledAt, runDoneAt} + Storage {owner}/tasks/images/<project>/sensors (<prefix>_<mark>-<serial>[_n].jpg) and
// /MDF, /IDF1..IDF6 (site photos). History: floor map, photos/add/run complete, wiring view, IDF photos (all 2026-10-02).
import { onAuthStateChanged, database, ref, onValue, update, set } from "../../../assets/js/firebase-init.js";
import { auth, HUBS, hubLabel, esc, fmtFt, feet, clean, loadJob, sensorRows, patchSensor, listSites, listPhotos, photoUrl,
  sensorMarkOf, photoPrefix, uploadSensorPhoto, uploadHubPhoto, deletePhoto, watchJob, tablesFor, zoneOf, idfOf, loadFloorPlan, saveFloorPlan, loadExtraPlans, loadExtraPlanImg, resizeImage, saveHubPos, gridRef, saveSiteTables, saveSiteOptions, saveSiteSwitches,
  isSensorsList, uploadPhoto, imagesDir, storage, storageRef, uploadBytes, getDownloadURL } from "./telaid-data.js?v=20261013a";
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
.rmap #rm-views button[hidden], .rmap #rm-views select[hidden] { display: none !important; }
.rmap #rm-views select { width: auto !important; margin: 0 !important; font-size: 16px; padding: 6px 8px; border-radius: 8px; max-width: 70vw; }   /* the display rule above beat the hidden attribute: "Plan" showed on jobs with no plan */
/* UNDO / REDO MOVE (L 2026-10-07 "an undo for the last move..." + "And a redo, no text needed on buttons"): icon-only, a 44px phone hit */
.rmap #rm-views #rm-undo, .rmap #rm-views #rm-redo { min-width: 44px; min-height: 44px; padding: 4px 10px; font-size: 1.3rem; line-height: 1; font-weight: 600; text-align: center; }
.rmap #rm-views #rm-undo:disabled, .rmap #rm-views #rm-redo:disabled { opacity: .5; cursor: default; }
.rmap #rm-undoState { font-size: .85rem; }
.rmap #rm-map:focus:not(:focus-visible) { outline: none; }
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
.rmap #rm-jobq { width: 100% !important; max-width: 640px; margin: 0 !important; font-size: 16px; padding: 8px; box-sizing: border-box; }   /* job search (L 2026-10-05) - 16px: no iOS zoom */
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
.rmap.embed #rm-map { height: min(62vh, 560px); }
/* the Take / choose photo inputs: visually hidden but RENDERED - iOS (Safari AND Chrome, both WebKit) will not open the camera
   for a display:none / [hidden] file input (L 2026-10-05 "take picture not working in Chrome mobile"; same scar as 2026-09-22) */
.rmap label.btn { position: relative; }
.rmap .mapwrap .rm-pulse { position: absolute; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%; pointer-events: none; z-index: 1;
  border: 3px solid #facc15; box-shadow: 0 0 10px 3px rgba(250, 204, 21, .85); animation: rmPulse 1.3s ease-out infinite; }
@keyframes rmPulse { 0% { transform: scale(.9); opacity: 1; } 70% { transform: scale(2.6); opacity: 0; } 100% { transform: scale(2.6); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .rmap .mapwrap .rm-pulse { animation: none; transform: scale(1.6); } }
.rmap #rm-info .mk .rm-nav { width: 34px !important; height: 30px; margin: 0 !important; padding: 0; font-size: 1.3rem; line-height: 1; border-radius: 8px; border: 1px solid var(--borderColor); background: var(--cardBackground); color: var(--textColor); box-shadow: none !important; vertical-align: middle; }
.rmap #rm-info .mk .rm-nav:disabled { opacity: .3; }
.rmap #rm-info { touch-action: pan-y; }   /* the card keeps vertical scroll; horizontal swipes are ours */
/* SET PLAN (L 2026-10-05 "1 and 2"): a site image becomes the floor plan - pick it, tap two sensors on it, save */
.rmap .rm-sp { position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,.6); display: grid; place-items: center; padding: 12px; }
.rmap .rm-sp[hidden] { display: none !important; }
.rmap .rm-sp .box { background: var(--cardBackground); color: var(--textColor); border: 1px solid var(--borderColor); border-radius: 12px; padding: 12px;
  width: min(980px, 100%); max-height: 94vh; overflow: auto; display: grid; gap: 10px; }
.rmap .rm-sp .thumbs { display: flex; gap: 8px; overflow-x: auto; }
.rmap .rm-sp .thumbs img { height: 90px; width: auto; border-radius: 6px; border: 2px solid var(--borderColor); cursor: pointer; background: #0003; }
.rmap .rm-sp .thumbs img.on { border-color: var(--primaryColor); }
.rmap .rm-sp .stage { overflow: auto; max-height: 62vh; border: 1px solid var(--borderColor); border-radius: 8px; }
.rmap .rm-sp .spwrap { position: relative; }   /* pins live in the IMAGE box, not the scroller (L 2026-10-05 "it puts them elsewhere") */
.rmap .rm-sp .stage img { display: block; width: 100%; height: auto; cursor: crosshair; touch-action: pan-x pan-y; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
.rmap .rm-sp .pin { position: absolute; width: 24px; height: 24px; margin: -12px 0 0 -12px; z-index: 2; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 0 2px #000; pointer-events: none;
  display: grid; place-items: center; font: 700 10px system-ui; color: #fff; }
.rmap .rm-sp .pin.a { background: #dc2626; } .rmap .rm-sp .pin.b { background: #2563eb; }
.rmap .rm-sp input[type=number] { width: 90px !important; margin: 0 !important; }
.rmap .rm-sp button { width: auto !important; margin: 0 !important; }
.rmap .rm-sp .tgt.on { outline: 2px solid var(--primaryColor); }
/* SELECTORS (L 2026-10-07): IDF / zone / switch / port on the sensor card - 16px (no iOS zoom), 40px targets */
.rmap #rm-info .rm-asg { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.rmap #rm-info .rm-asg select, .rmap #rm-info .rm-asg input { width: auto !important; min-width: 5.5em; max-width: 100%; margin: 0 !important; font-size: 16px; min-height: 40px; padding: 4px 8px; box-sizing: border-box; }
.rmap #rm-info .rm-asg input { width: 6.5em !important; min-width: 0; }
.rmap #rm-info .rm-asg button { width: auto !important; min-width: 40px; min-height: 40px; margin: 0 !important; padding: 0 8px; font-size: 1.1rem; line-height: 1; border-radius: 8px;
  border: 1px solid var(--borderColor); background: transparent; color: var(--textColor); box-shadow: none !important; cursor: pointer; }
.rmap #rm-info .rm-asg .ok { background: var(--primaryColor); border-color: var(--primaryColor); color: #fff; }
.rmap #rm-info .rm-asg [hidden] { display: none !important; }
.rmap #rm-info .rm-asg .rm-asgMsg { font-size: .85rem; color: var(--mutedText); }
/* DEVICES (L 2026-10-27 "one map app ... jobs with multiple maps ... the camera one would put the cams in"): any job's device
   lists (cameras, speakers, alarm points) on the same map as the radar sensors - each device sits on the map it was placed on */
.rmap #rm-devbar { order: -7; }
.rmap #rm-devbar[hidden] { display: none !important; }
.rmap #rm-devbar .chip, .rmap #rm-devbar button, .rmap #rm-devbar label.btn { width: auto !important; margin: 0 !important; box-shadow: none !important; display: inline-flex; align-items: center; gap: 6px;
  font-size: .9rem; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--borderColor); background: transparent; color: var(--textColor); cursor: pointer; }
.rmap #rm-devbar .chip.off { opacity: .45; }
.rmap #rm-devbar .chip i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.rmap #rm-devbar .chip small { color: var(--mutedText); }
.rmap #rm-devhint { font-size: .9rem; color: #facc15; font-weight: 600; }
.rmap #rm-info textarea { width: 100%; min-height: 54px; box-sizing: border-box; margin-top: 8px; font-size: 16px; }
.rmap #rm-dd .row { display: flex; align-items: center; gap: 8px; padding: 8px 4px; border-bottom: 1px solid var(--borderColor); cursor: pointer; }
.rmap #rm-dd .row i { width: 10px; height: 10px; border-radius: 2px; flex: none; }
.rmap #rm-dd .row small { color: var(--mutedText); margin-left: auto; }
.rmap #rm-dd input, .rmap #rm-dd select { width: auto !important; margin: 0 !important; font-size: 16px; }`;
function injectCss() {
  if (document.getElementById("rmap-css")) return;
  const st = document.createElement("style"); st.id = "rmap-css"; st.textContent = CSS; document.head.appendChild(st);
}
const TEMPLATE = `<div class="app-shell">
      <div class="rm-row" id="rm-jobrow"><input type="search" id="rm-jobq" placeholder="Search jobs (store #, customer, PRJTASK, WO)" autocomplete="off" aria-label="Search jobs" /><select id="rm-job" aria-label="Job"><option value="">Loading jobs...</option></select></div>
      <div class="muted" id="rm-source">Sign in to load the site.</div>
      <div class="card stats" id="rm-stats"></div>
      <div class="rm-row" id="rm-hubs"></div>
      <div class="rm-row" id="rm-devbar" hidden></div>
      <div class="rm-sp" id="rm-dd" hidden><div class="box" id="rm-ddbox"></div></div>
      <div class="rm-row" id="rm-views"><span class="muted">View:</span>
        <button data-v="floor" class="on">Floor</button><button data-v="wiring">Wiring</button>
        <button type="button" id="rm-rot" title="Rotate the floor map 90&deg;">&#8635; Rotate</button>
        <button type="button" id="rm-plan" title="Floor plan under the dots" hidden>&#128506; Plan: dim</button>
        <select id="rm-planpick" title="Which map is showing (key map, heat map, camera / CX / alarm sheets)" aria-label="Map" hidden></select>
        <button type="button" id="rm-setplan" title="Use a site image (or a file) as the floor plan under the dots">&#128444; Set plan</button>
        <button type="button" id="rm-undo" title="Undo the last move" aria-label="Undo the last move" hidden>&#8630;</button>
        <button type="button" id="rm-redo" title="Redo the last move" aria-label="Redo the last move" hidden>&#8631;</button>
        <span class="muted" id="rm-undoState" role="status" aria-live="polite"></span></div>
      <div class="rm-sp" id="rm-sp" hidden><div class="box">
        <div class="rm-row"><b>Floor plan from a site image</b><span style="flex:1"></span><button type="button" id="rm-spclose">Close</button></div>
        <div class="muted" id="rm-spmsg">1. Pick one of this job's Site Images, or a file.</div>
        <div class="thumbs" id="rm-spthumbs"></div>
        <div class="rm-row"><input type="file" id="rm-spfile" accept="image/*" /></div>
        <div id="rm-spfit" hidden>
          <div class="muted">2. Type a device # in A, tap where that device is on the drawing; same for B. Pick two far apart (opposite corners is best).</div>
          <div class="rm-row">
            <button type="button" class="tgt on" data-t="a">A &#9679;</button> device # <input type="number" id="rm-spa" min="1" />
            <button type="button" class="tgt" data-t="b">B &#9679;</button> device # <input type="number" id="rm-spb" min="1" />
            <span class="muted" id="rm-spcalc"></span><span style="flex:1"></span>
            <button type="button" id="rm-spsave" disabled>Save as the floor plan</button></div>
          <div class="stage"><div class="spwrap" id="rm-spstage"><img id="rm-spimg" alt="the drawing" /></div></div>
        </div>
      </div></div>
      <div class="rm-row modes" id="rm-modes">
        <span class="muted">Color by:</span>
        <button data-m="status">Status</button>
        <button data-m="idf" class="on">IDF</button>
        <button data-m="photos">Photos</button>
        <button data-m="labeled">Labeled</button>
        <button data-m="height">Height</button>
        <button data-m="switch">Switch</button>
        <button data-m="runs">Runs</button>
        <span style="flex:1"></span>
        <input id="rm-find" type="text" inputmode="text" placeholder="Find #" autocomplete="off" autocapitalize="off" spellcheck="false" />
      </div>
      <div class="mapwrap"><canvas id="rm-map" tabindex="0" aria-label="Floor map of every device"></canvas>
        <div class="rm-zoom"><button type="button" id="rm-zin" aria-label="Zoom in" title="Zoom in">+</button><button type="button" id="rm-zout" aria-label="Zoom out" title="Zoom out">&minus;</button></div>
        <input type="range" id="rm-slx" class="rm-sl rm-slx" min="0" max="1000" value="0" aria-label="Move the map left or right" hidden />
        <input type="range" id="rm-sly" class="rm-sl rm-sly" min="0" max="1000" value="0" aria-label="Move the map up or down" hidden /></div>
      <div class="legend" id="rm-legend"></div>
      <div class="muted hint">Pinch, or Shift + scroll, to zoom · one finger scrolls the page; to move the map: hold half a second on empty floor then drag, two fingers, the edge sliders, or a mouse drag · tap a device or cabinet for its photos · hold one ~half a second, then drag, to move it · double-tap to reset the view, triple-tap to rotate · &#8630; (or Ctrl+Z on the map) puts the last moved device or cabinet (or its IDF / zone / switch pick) back, &#8631; (Ctrl+Shift+Z / Ctrl+Y) moves it again.</div>
      <div class="card" id="rm-info"><span class="muted">Tap a device to see its details.</span></div>
    </div>`;

// ---- ASSIGN HELPERS (pure) ---- the sensor card's IDF / zone / switch / port selectors (L 2026-10-07). A sensor's own
// value lives on its row (idf, zone, sw, port); absent = the site plan's value. Values: idf = 1..n or "MDF",
// zone / port = a number, sw = a number, "new" (a switch still needed) or a name.
const idfVal = v => { if (v == null) return null; const t = String(v).trim(); if (!t) return null; if (/^mdf$/i.test(t)) return "MDF";
  const m = t.match(/^(?:idf\s*)?(\d{1,3})$/i); return m && Number(m[1]) > 0 ? Number(m[1]) : null; };
const numVal = v => { if (v == null || String(v).trim() === "") return null; const n = Number(String(v).trim().replace(/^#/, "")); return Number.isInteger(n) && n > 0 ? n : null; };
const swVal = v => { if (v == null) return null; const t = String(v).trim().replace(/^#\s*/, ""); if (!t) return null;
  return /^\d+$/.test(t) ? (Number(t) || null) : /^new$/i.test(t) ? "new" : t.slice(0, 20); };
const idfName = v => v === "MDF" ? "MDF" : "IDF " + v;
const swName = v => v === "new" ? "new (needed)" : /^\d+$/.test(String(v)) ? "#" + v : String(v);
const sameVal = (a, b) => a != null && b != null && String(a) === String(b);
/** a pick-list: the stored/base values, then anything in use that the list lacks - each once, in order */
function optList(...lists) { const out = [], seen = new Set();
  for (const l of lists) for (const v of l || []) { if (v == null || v === "") continue; const k = String(v); if (!seen.has(k)) { seen.add(k); out.push(v); } }
  return out; }
/** a new switch for an IDF: fills the first "new" placeholder (the 3rd switch that was still needed), else goes on the end */
function addSwitch(list, v) { const l = [...(list || [])]; if (l.some(x => sameVal(x, v))) return l;
  const i = l.findIndex(x => x === "new"); if (i >= 0 && v !== "new") l[i] = v; else l.push(v); return l; }
/** what a pick writes on the row: the plan's own value = null (the row follows the plan again) */
const storeVal = (picked, plan) => picked == null || sameVal(picked, plan) ? null : picked;
// ---- end ASSIGN HELPERS ----

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
    // PLAN PICKER (L 2026-10-13): the key map + any extra sheet (Jason's ceiling heat map) - one shows at a time
    let PLANS = [], planPick = "main";
    try { planPick = localStorage.getItem("rm-plan-pick") || "main"; } catch (_) {}
    const $ = id => root.querySelector("#rm-" + id);

    let S = [];            // {m, serial, x, y, z, idf, zone, photos, items, labeledAt, runDoneAt, sw, port, wx, wy}
    // DEVICES: every non-Sensors device list on the job (cameras, CX speakers, burg points ...). A device's spot comes from its
    // data: row.map {plan, x, y} (0..1 on the device plan it was placed on) or row.ft {x, y} / m1 m2 in feet on a scaled plan.
    // Device plans live at tasks/<id>/devicePlans/<key> {name, url, path, w, h, cal?}; an unscaled one gets a stand-in scale
    // (the sheet = 200 units wide) so the map engine can draw it - sensors hide on those (their feet don't apply).
    let LISTS = {}, DPLANS = {}, DEV = [], selDev = null, placing = null, scaling = null, stopDev = null;
    const hideLists = new Set();
    let HLD = new Set();   // devices ringed by the Find box
    const LIST_RESERVED = new Set(["_name", "createdAt", "meta", "items"]);
    let mode = "idf", sel = -1, layout = "floor";
    let OWNER = null, TASKREC = {};      // set by load(); used by the card's actions
    const RO = () => OWNER === "share";   // a shared copy (share/tasks/<id>): look, don't touch
    // UNDO MOVE (L 2026-10-07): RAW = each sensor's stored fields as last read ({mark: {m1, m2, pos, posAt, updatedAt, ...}}),
    // so a move can remember exactly what it overwrote. dragSnap = the before-values, taken on the drag's first step.
    // UNDO = [{kind: "sensor"|"hub", id, owner, task, prev, after, at}] for the open job, newest last; the last few are
    // kept on this device per job (localStorage) so a reload still offers one undo.
    let RAW = {}, dragSnap = null, UNDO = [], REDO = [], undoBusy = false, toastT = 0;
    const UNDO_MAX = 20, UNDO_KEEP = 5, MOVE_KEYS = ["m1", "m2", "pos", "posAt", "updatedAt"];
    // a selector change is undoable the same way (kind "assign"): its before/after = these row fields (null = absent)
    const ASSIGN_KEYS = ["idf", "zone", "sw", "port", "updatedAt"], ASSIGN_CMP = ["idf", "zone", "sw", "port"];
    function renderHubs() {
      $("hubs").innerHTML = '<span class="muted">Photos:</span>' + HUBS.map(h => { const n = (HUBPH[h] || []).length,
        c = h === "MDF" ? "#475569" : (IDF_COL[h.slice(3)] || "#64748b");
        return `<button type="button" data-h="${h}" class="${n ? "has" : ""}"><i style="background:${c}"></i>${hubLabel(h)} <span class="n">${n ? "&#128247; " + n : PHOTOS === "ok" ? "none" : PHOTOS === "loading" ? "\u2026" : "?"}</span></button>`; }).join("");
    }

    function assignSwitches() {   // balanced split by sensor # inside each IDF (same as the port-plan CSV)
      for (const [idf, sws] of Object.entries(SWITCHES)) {
        const rs = S.filter(s => String(s.idf) === String(idf)).sort((a, b) => a.m - b.m), k = sws.length; if (!k) continue;
        let i = 0;
        sws.forEach((sw, j) => { const size = Math.floor(rs.length / k) + (j < rs.length % k ? 1 : 0);
          rs.slice(i, i + size).forEach((s, p) => { s.sw = sw; s.port = p + 1; }); i += size; });
      }
    }
    // EVERY sensor's IDF / zone / switch / port: the plan (siteTables), then its own row values on top (the card's selectors).
    // The planned switch split follows the sensor's IDF as it is now. Re-run after any change (here, live, undo).
    function assignAll() {
      for (const s of S) { const r = RAW[s.m] || {};
        s.planIdf = idfOf(TABLES, s.m); s.planZone = zoneOf(TABLES, s.m);
        s.idf = idfVal(r.idf) ?? s.planIdf; s.zone = numVal(r.zone) ?? s.planZone; s.sw = s.port = null; s.wx = s.wy = null; }
      if (TABLES) assignSwitches();
      for (const s of S) { const r = RAW[s.m] || {}; s.planSw = s.sw; s.planPort = s.port;
        const w = swVal(r.sw), p = numVal(r.port); if (w != null) s.sw = w; if (p != null) s.port = p; }
      if (TABLES) wiringLayout();
    }

    async function load(user) {
      if (!user) { $("source").textContent = "Sign in to load the site."; return; }
      if (!TASK) { $("source").textContent = "Open a site above and its map shows here."; $("stats").innerHTML = ""; $("hubs").innerHTML = ""; return; }
      S = []; sel = -1; selHub = null; B = null; RAW = {}; dragSnap = null; UNDO = []; REDO = []; renderUndo(); for (const k in HUBPH) delete HUBPH[k]; PHOTOS = "loading";
      PLAN = null; planImg = null; planDark = null; planFast = null; $("plan").hidden = true; PLANS = []; $("planpick").hidden = true;
      $("source").textContent = "Loading...";
      const { owner, task, meta } = await loadJob(user, TASK);
      LISTS = (task && task.lists) || {}; DPLANS = (task && task.devicePlans) || {}; selDev = null; placing = null; scaling = null; devHint("");
      const hasDev = devListIds().length > 0 || Object.keys(DPLANS).length > 0;
      // nothing to show for this job (or this account can't see it): CLEAR the map - it used to keep the last job's drawing
      // and dots, which read as "the map didn't change" (L 2026-10-05)
      if (!meta && !hasDev) { DEV = []; OWNER = owner; TASKREC = task || {}; renderDevBar(); $("source").textContent = "No devices found for this job" + (task ? "." : " in this account - pick the account that has it (Account, in the sign-in section).");
        $("stats").innerHTML = ""; renderHubs(); draw(); return; }
      RAW = rawOf(meta || {});
      TABLES = tablesFor(task, TASK); SWITCHES = TABLES ? TABLES.switches : {};
      if (!TABLES && layout === "wiring") { layout = "floor"; root.querySelectorAll("#rm-views button").forEach(x => x.classList.toggle("on", x.dataset.v === "floor")); }
      S = sensorRows(meta).map(s => ({ ...s, plan: [s.x, s.y], idf: null, zone: null, photos: 0, items: [] }))
        .filter(s => (s.x != null && s.y != null) || s.pos);   // a sensor placed on the drawing shows even without readable m1/m2
      S.forEach(s => { if (s.pos) { s.x = s.pos.x; s.y = s.pos.y; } });   // hold-to-move override (as built) wins over the plan
      assignAll();
      OWNER = owner; TASKREC = task; loadUndo();
      // older jobs (Old Navy) measured each sensor off a building grid line ("J - 47' 8\"") - without the grid's own
      // positions the dots are offsets, not a true floor layout; say so instead of pretending (L 2026-10-05)
      // ...unless the sensors have been placed on the drawing (pos on most of them) - then the layout is real
      const placed = S.filter(s => s.pos).length, refs = placed * 2 >= S.length ? [] : [...new Set(Object.values(meta || {}).flatMap(v => [gridRef(v?.m1), gridRef(v?.m2)]).filter(Boolean))].sort();
      if (!S.length && hasDev && mode === "idf") { mode = "status"; root.querySelectorAll("#rm-modes button").forEach(x => x.classList.toggle("on", x.dataset.m === "status")); legend(); }
      buildDev();
      const line = `${task.customerName || "Job " + TASK} \u00b7 ${S.length ? S.length + " radar devices" : ""}${S.length && DEV.length ? " \u00b7 " : ""}${DEV.length ? DEV.length + " devices" : ""}${S.length && placed * 2 >= S.length ? " · placed on the drawing" : ""}${refs.length ? ` \u00b7 measured off grid lines ${refs.join(", ")} - positions are offsets, approximate` : ""} \u00b7 loaded ${new Date().toLocaleTimeString()}${TABLES ? ` \u00b7 site plan: ${TABLES.from}` : ""}${RO() ? ` \u00b7 shared copy by ${task.sharedByName || "?"} (read-only)` : ""}`;
      $("source").textContent = line + " \u00b7 photos loading\u2026";
      renderHubs(); renderDevBar(); renderStats(); fit(false);
      // PHOTOS IN THE BACKGROUND (L 2026-10-03, "did you freeze?": on a network that could not resolve
      // firebasestorage.googleapis.com, listAll retried for ~2 min before failing and the whole map waited on it).
      // The map draws first; photo counts/rings fill in when Storage answers, or the source line says it couldn't.
      const gen = ++loadGen; PHOTOS = "loading";
      // LIVE device lists + device plans (push, not polling): a place / status / photo from any device shows here
      if (stopDev) stopDev();
      { const u1 = onValue(ref(database, `${owner}/tasks/${TASK}/lists`), sn => { if (gen !== loadGen) return; LISTS = sn.val() || {}; devChanged(); });
        const u2 = onValue(ref(database, `${owner}/tasks/${TASK}/devicePlans`), sn => { if (gen !== loadGen) return; DPLANS = sn.val() || {};
          PLANS = PLANS.filter(e => !e.dev).concat(devPlanEntries(owner)); if (PLANS.length) usePlan(planPick); renderDevBar(); });
        stopDev = () => { u1(); u2(); }; }
      // LIVE (L 2026-10-03 "I have to refresh the page to get any new pictures"): every upload - from this map, another
      // device or the checklist - stamps tasks/<id>/photosAt; sensorMeta edits (run complete, labeled, serial, moves) arrive
      // the same way. Re-list only the folder that changed and merge the meta in place, so the view never jumps.
      if (stopWatch) stopWatch();
      stopWatch = watchJob(owner, TASK, { onPhotos: v => { if (gen === loadGen) refreshPhotos(v.sub); },
        onMeta: meta => { if (gen === loadGen) mergeMeta(meta); } });
      Promise.all([loadFloorPlan(owner, TASK).catch(() => null), loadExtraPlans(owner, TASK).catch(() => ({}))]).then(([p, ex]) => { if (gen !== loadGen) return;
        if (p) PLANS.push({ key: "main", label: "Key map", meta: p, src: p.img, owner });
        for (const [key, m] of Object.entries(ex)) if (m && m.k) PLANS.push({ key, label: m.label || key, meta: m, owner });
        PLANS = PLANS.filter(e => !e.dev).concat(devPlanEntries(owner));
        if (PLANS.length) usePlan(planPick); });
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
      RAW = rawOf(meta);
      if (cvw.held) return;   // mid-drag here - the next change re-syncs
      let n = 0;
      for (const r of sensorRows(meta)) { const s = S.find(x => x.m === r.m); if (!s) continue; n++;
        Object.assign(s, { serial: r.serial, labeledAt: r.labeledAt, runDoneAt: r.runDoneAt, updatedAt: r.updatedAt, pos: r.pos, plan: [r.x, r.y] });
        s.x = r.pos ? r.pos.x : r.x; s.y = r.pos ? r.pos.y : r.y; }
      if (!n) return; assignAll(); legend(); renderStats(); draw(); if (sel >= 0) show(sel); else if (selHub) showHub(selHub);
    }
    function renderStats() {
      const lab = S.filter(s => s.labeledAt).length, ph2 = S.filter(s => s.photos >= 4).length, ph0 = S.filter(s => !s.photos).length,
        runs = S.filter(s => s.runDoneAt).length;
      // L 2026-10-02 "0 with both photos - this isn't true": never print a photo count we have not actually fetched
      const photoBits = PHOTOS === "ok" ? `<span><b>${ph2}</b> with all 4 photos</span><span><b>${ph0}</b> with no photos</span>`
        : PHOTOS === "loading" ? `<span class="muted">photos loading\u2026</span>` : `<span class="muted">photos: can't reach Storage on this network</span>`;
      const D = DEV, dc = k => D.filter(d => d.r.punch === k).length;
      const devBits = D.length ? `<span><b>${D.length}</b> devices</span><span>&#9989; <b>${dc("ok")}</b></span><span>&#9888; <b>${dc("punch")}</b></span><span>&#10060; <b>${dc("missing")}</b></span><span><b>${D.filter(d => d.r.labeledAt).length}</b> labeled</span>` : "";
      $("stats").innerHTML = (S.length ? `<span><b>${S.length}</b> radar devices</span><span><b>${runs}</b> runs complete</span><span><b>${lab}</b> labeled</span>${photoBits}` : "") + devBits;
    }

    // ---------- drawing ----------
    const cv = $("map"), cx = cv.getContext("2d");
    const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const IDF_COL = { 1: "#e8742c", 2: "#3b82f6", 3: "#22c55e", 4: "#eab308", 5: "#a855f7", 6: "#ec4899" }, MDF_COL = "#475569";
    const ST_COL = { ok: "#2b8a3e", punch: "#f08c00", missing: "#e03131" };
    const statusCol = r => ST_COL[r.punch] || (r.labeledAt && r.runDoneAt ? "#74c0fc" : "#94a3b8");
    function colorOf(s) {
      if (mode === "status") return statusCol(RAW[s.m] || s);
      if (mode === "idf") return IDF_COL[s.idf] || (s.idf === "MDF" ? MDF_COL : "#94a3b8");
      if (mode === "photos") return s.photos >= 4 ? "#22c55e" : s.photos ? "#f59e0b" : "#ef4444";
      if (mode === "labeled") return s.labeledAt ? "#22c55e" : "#ef4444";
      if (mode === "height") { const t = Math.max(0, Math.min(1, ((s.z ?? 12) - 7) / 10)); return `hsl(${220 - t * 200},75%,55%)`; }
      if (mode === "switch") return s.sw === "new" ? "#ef4444" : `hsl(${((Number(s.sw) || 0) * 47) % 360},70%,58%)`;
      if (mode === "runs") return s.runDoneAt ? "#22c55e" : "#ef4444";
    }
    function legend() {
      const L = {
        idf: [...Object.entries(IDF_COL).map(([k, c]) => [c, "IDF " + k]), ...(S.some(s => s.idf === "MDF") ? [[MDF_COL, "MDF"]] : []),
          ...optList(S.map(s => s.idf).filter(v => v != null && v !== "MDF" && !IDF_COL[v])).map(v => ["#94a3b8", idfName(v)])],
        photos: [["#22c55e", "all 4 photos"], ["#f59e0b", "1-3 photos"], ["#ef4444", "none"]],
        labeled: [["#22c55e", "labeled"], ["#ef4444", "not yet"]],
        height: [["hsl(220,75%,55%)", "7 ft"], ["hsl(120,75%,55%)", "12 ft"], ["hsl(20,75%,55%)", "17 ft"]],
        switch: [["#ef4444", "needs the 3rd switch (IDF 2 / 5)"], ["#94a3b8", "each color = one switch #"]],
        runs: [["#22c55e", "run complete"], ["#ef4444", "not yet"]],
        status: [["#2b8a3e", "OK"], ["#f08c00", "punch"], ["#e03131", "missing"], ["#74c0fc", "labeled + run complete"], ["#94a3b8", "not checked"]],
      }[mode];
      $("legend").innerHTML = L.map(([c, t]) => `<span><i style="background:${c}"></i>${esc(t)}</span>`).join("")
        + '<span><i style="background:transparent;border:2px solid #fff;width:9px;height:9px"></i>white ring = has photos</span>';
    }
    // WIRING view (star, when the job has no IDF 1 - see CHAIN below): MDF in the middle, the 6 IDFs on a ring, each IDF's switches around it, each switch's sensors
    // around the switch (one dot per port). Units are "feet" like the floor plan so zoom/pan/tap all just work.
    const HUB = {};   // "idf" / "idf-sw" -> [x, y] centres, for the lines and labels
    const wIdfs = () => Object.keys(SWITCHES).filter(k => /^\d+$/.test(k));   // the ring: numbered IDFs (MDF sits in the middle)
    // CHAIN (L 2026-10-10 "every IDF goes to IDF 1 and then 1 to MDF"): with an IDF 1 on the job the backbone is
    // MDF -> IDF 1 -> each other IDF, laid out left to right: MDF, IDF 1, the rest on an arc to the right of IDF 1.
    // IDF 1's own switches sit above / below it (the gaps between the MDF line and the arc). No IDF 1 = the old star.
    const wChain = () => wIdfs().includes("1");
    function wiringLayout() {
      const idfs = wIdfs().map(Number), chain = wChain();
      const place = (idf, ix, iy, swAng) => {
        HUB[idf] = [ix, iy];
        const sws = SWITCHES[idf] || [];
        sws.forEach((sw, b) => {
          const Bn = swAng(b, sws.length), sx = ix + 52 * Math.cos(Bn), sy = iy + 52 * Math.sin(Bn);
          HUB[idf + "-" + sw] = [sx, sy];
          const mine = S.filter(t => t.idf === idf && sameVal(t.sw, sw)).sort((p, q) => (p.port || 0) - (q.port || 0));
          mine.forEach((t, k) => { const C = k / Math.max(1, mine.length) * 2 * Math.PI; t.wx = sx + 17 * Math.cos(C); t.wy = sy + 17 * Math.sin(C); });
        });
      };
      const fan = A => (b, n) => A + (b - (n - 1) / 2) * 0.95;   // a switch fan pointing away along A
      if (chain) {
        HUB.mdf = [-190, 0];
        place(1, 0, 0, (b, n) => { const up = b % 2 === 0, k = Math.floor(b / 2), m = up ? Math.ceil(n / 2) : Math.floor(n / 2);
          return (up ? -1 : 1) * (Math.PI * 0.72) + (k - (m - 1) / 2) * 0.7 * (up ? 1 : -1); });   // above + below IDF 1
        const rest = idfs.filter(i => i !== 1), span = Math.PI * 0.9;
        rest.forEach((idf, a) => { const A = rest.length > 1 ? -span / 2 + a / (rest.length - 1) * span : 0;
          place(idf, 170 * Math.cos(A), 170 * Math.sin(A), fan(A)); });
      } else {
        HUB.mdf = [0, 0];
        idfs.forEach((idf, a) => { const A = -Math.PI / 2 + a / idfs.length * 2 * Math.PI; place(idf, 150 * Math.cos(A), 150 * Math.sin(A), fan(A)); });
      }
      S.forEach(t => { if (t.wx == null) { t.wx = HUB.mdf[0]; t.wy = HUB.mdf[1] - 20; } });
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
      world: () => { const xs = [], ys = [];
        if (SV()) for (const s of S) { xs.push(X(s)); ys.push(Y(s)); }
        if (layout === "floor") for (const d of devShown()) { const [a, b] = rotXY(d.x, d.y); xs.push(a); ys.push(b); }
        if (layout === "wiring" && HUB.mdf && xs.length) { xs.push(HUB.mdf[0] - 20, HUB.mdf[0] + 20); ys.push(HUB.mdf[1] - 20, HUB.mdf[1] + 20); }   // the MDF has no sensors - keep it in frame
        if (!xs.length && layout === "floor" && PLAN) for (const [u, v] of [[0, 0], [PLAN.w, 0], [0, PLAN.h], [PLAN.w, PLAN.h]]) { const [a, b] = rotXY(PLAN.x0 + u / PLAN.k, PLAN.y0 - v / PLAN.k); xs.push(a); ys.push(b); }   // an empty plan still shows
        if (!xs.length) return (B = null);
        return (B = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }); },
      flipY: true, pad: 24, minZoom: 0.7, maxZoom: 30, sliders: { x: $("slx"), y: $("sly") }, slVar: "--rm-slh", slExtent: slExt,
      draw: () => draw(),
      hit: (mx, my) => { const hh = hubAt(mx, my); if (hh) return { kind: "hub", h: hh };
        let best = -1, bd = (22 * view.dpr) ** 2, bestDev = null;
        if (SV()) S.forEach((s, i) => { const [x, y] = P(s), d = (x - mx) ** 2 + (y - my) ** 2; if (d < bd) { bd = d; best = i; } });
        if (layout === "floor") for (const dv of devShown()) { const [x, y] = PP(rotXY(dv.x, dv.y)), d = (x - mx) ** 2 + (y - my) ** 2; if (d < bd) { bd = d; bestDev = dv; } }
        return bestDev ? { kind: "dev", d: bestDev } : best >= 0 ? { kind: "sensor", i: best } : null; },
      // HOLD-TO-MOVE (L 2026-10-02 "hold 'em and move each object around"): hold a sensor / cabinet ~0.5 s = drag it (floor
      // view only; the new spot is saved as sensorMeta/<mark>/pos or siteTables/hubs); hold empty floor = pan the map.
      hold: (t, e) => e.button !== 0 ? null : !t ? "pan" : layout === "floor" && !RO() ? "drag" : null,
      onDrag: (t, fx, fy) => { const [ux, uy] = unrot(fx, fy);   // screen delta -> plan feet, through the inverse of the rotate
        if (!dragSnap) dragSnap = snapOf(t);   // first step of this drag: remember what the move will overwrite (undo)
        if (t.kind === "sensor") { S[t.i].x += ux; S[t.i].y += uy; } else if (t.kind === "dev") { t.d.x += ux; t.d.y += uy; } else { TABLES.hubs[t.h][0] += ux; TABLES.hubs[t.h][1] += uy; } },
      onDragEnd: t => endMove(t),
      onTap: t => { if (!t || placing || scaling) return; if (t.kind === "hub") showHub(t.h); else if (t.kind === "dev") showDev(t.d); else show(t.i); } });   // no page jump on tap
    const view = cvw.view, base = cvw.base, requestDraw = cvw.requestDraw, fit = cvw.fit;
    let planFast = null;   // {light, c}
    // plan Y grows upward; the screen grows downward, so flip it
    const P = s => [view.ox + (X(s) - B.x0) * view.s, view.oy + (B.y1 - Y(s)) * view.s];
    const PP = ([x, y]) => [view.ox + (x - B.x0) * view.s, view.oy + (B.y1 - y) * view.s];
    // PULSE on the picked sensor (L 2026-10-05 "the currently selected sensor, can it glow or pulse to help find it when
    // glancing"): a CSS-animated halo laid over the canvas at the sensor's spot - the canvas itself is NOT redrawn per frame
    // (the iPad's fillText budget), the halo just follows every draw.
    let pulseEl = null;
    function placePulse(dpr) {
      if (!pulseEl) { pulseEl = document.createElement("div"); pulseEl.className = "rm-pulse"; pulseEl.setAttribute("aria-hidden", "true"); cv.parentElement.appendChild(pulseEl); }
      if (sel < 0 || !S[sel] || selHub) { pulseEl.style.display = "none"; return; }
      const [x, y] = P(S[sel]), cx0 = x / dpr + cv.offsetLeft, cy0 = y / dpr + cv.offsetTop;
      if (x < 0 || y < 0 || x > cv.width || y > cv.height) { pulseEl.style.display = "none"; return; }
      pulseEl.style.display = ""; pulseEl.style.left = cx0 + "px"; pulseEl.style.top = cy0 + "px";
    }
    function draw() {
      cx.fillStyle = css("--secondaryBackgroundColor") || "#0f172a"; cx.fillRect(0, 0, cv.width, cv.height);
      if (!B) return;
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
      if (SV()) for (const s of S) { const [x, y] = P(s); if (x < -20 || y < -20 || x > cv.width + 20 || y > cv.height + 20) continue;
        cx.fillStyle = colorOf(s); cx.beginPath(); cx.arc(x, y, r, 0, 6.283); cx.fill();
        if (s.photos) { cx.strokeStyle = "#ffffff"; cx.lineWidth = 1.6 * dpr; cx.beginPath(); cx.arc(x, y, r + 2.5 * dpr, 0, 6.283); cx.stroke(); } }
      if (layout === "floor") drawDevices(dpr, r);
      if (!cvw.moving) {   // number labels wait until the move ends (fillText x241 is what the iPad trips on)
        // clear of the rings (photo ring r+2.5, highlight r+4, selection beyond) and outlined in the background colour, so a
        // number never sits on a white ring (L 2026-10-05 "the numbers are sometimes hard to see next to the white circle").
        // ALWAYS ON now (L 2026-10-05 "I need to see the number even zoomed out" - they used to wait for 2.2x): smaller when
        // zoomed out (9 px floor), and a label that would land on one already drawn is skipped - zoom in and it appears.
        const fs = Math.max(9, Math.min(11, 9 + (zoom - 1) * 1.6)) * dpr, gap = (zoom < 2.2 ? 4 : 8) * dpr;
        cx.font = `700 ${fs}px system-ui, sans-serif`; cx.fillStyle = css("--textColor") || "#e5e7eb";
        cx.strokeStyle = css("--secondaryBackgroundColor") || "#0f172a"; cx.lineWidth = 3 * dpr; cx.lineJoin = "round";
        const boxes = [], order = !SV() ? [] : sel >= 0 ? [S[sel], ...S.filter((_, i) => i !== sel)] : S;   // the picked sensor's number always wins
        for (const s of order) { const [x, y] = P(s); if (!(x > 0 && y > 0 && x < cv.width && y < cv.height)) continue;
          const t = String(s.m), tx = x + r + gap, ty = y + fs * 0.35, w = cx.measureText(t).width, bx = [tx - 2 * dpr, ty - fs, tx + w + 2 * dpr, ty + 2 * dpr];
          if (boxes.some(o => bx[0] < o[2] && o[0] < bx[2] && bx[1] < o[3] && o[1] < bx[3])) continue;
          boxes.push(bx); cx.strokeText(t, tx, ty); cx.fillText(t, tx, ty); }
        if (layout === "floor") for (const d of devShown()) { const [x, y] = PP(rotXY(d.x, d.y)); if (!(x > 0 && y > 0 && x < cv.width && y < cv.height)) continue;
          const t = devId(d.r), tx = x + r + gap, ty = y + fs * 0.35, w = cx.measureText(t).width, bx = [tx - 2 * dpr, ty - fs, tx + w + 2 * dpr, ty + 2 * dpr];
          if (boxes.some(o => bx[0] < o[2] && o[0] < bx[2] && bx[1] < o[3] && o[1] < bx[3])) continue;
          boxes.push(bx); cx.strokeText(t, tx, ty); cx.fillText(t, tx, ty); }
      }
      if (HLD.size && layout === "floor") { cx.strokeStyle = "#facc15"; cx.lineWidth = 2.5 * dpr;
        for (const d of devShown()) { if (!HLD.has(d.listId + "/" + d.rowId)) continue; const [x, y] = PP(rotXY(d.x, d.y)); cx.beginPath(); cx.arc(x, y, r * 1.7 + 4 * dpr, 0, 6.283); cx.stroke(); } }
      if (HL.size) { cx.strokeStyle = "#facc15"; cx.lineWidth = 2.5 * dpr;
        for (const i of HL) { const [x, y] = P(S[i]); cx.beginPath(); cx.arc(x, y, r + 4 * dpr, 0, 6.283); cx.stroke(); } }
      if (sel >= 0) { const s = S[sel], [x, y] = P(s); cx.strokeStyle = css("--textColor") || "#fff"; cx.lineWidth = 2.5 * dpr;
        cx.beginPath(); cx.arc(x, y, r + 5 * dpr, 0, 6.283); cx.stroke(); }
      placePulse(dpr);
      cvw.syncSliders();
      if (layout === "wiring" || (PLAN && PLAN.synthetic)) return;   // an unscaled sheet has no feet to show
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
    function usePlan(key) {
      const e = PLANS.find(p => p.key === key) || PLANS[0], g = loadGen; if (!e) return;
      planPick = e.key; try { localStorage.setItem("rm-plan-pick", planPick); } catch (_) {}
      $("planpick").innerHTML = PLANS.map(q => `<option value="${esc(q.key)}"${q.key === e.key ? " selected" : ""}>${esc(q.label)}</option>`).join(""); $("planpick").hidden = PLANS.length < 2;
      const show = im => { if (g !== loadGen || planPick !== e.key) return; PLAN = e.meta; planImg = im; planDark = null; planFast = null; $("plan").hidden = false; planLabel();
        const hadB = !!B; buildDev(); renderDevBar(); renderStats(); if (!hadB || e.dev) fit(false); else draw(); if (selDev) { const d = DEV.find(x => x.listId === selDev.listId && x.rowId === selDev.rowId); if (d) showDev(d); } };
      if (e.im) return show(e.im);
      (e.src ? Promise.resolve(e.src) : loadExtraPlanImg(e.owner, TASK, e.key, e.meta)).then(src => { if (!src) return;
        const im = new Image(); if (e.dev) im.crossOrigin = "anonymous"; im.onload = () => { e.im = im; show(im); }; im.src = src; }).catch(() => {});
    }
    // ---------- DEVICES on the map ----------
    const SV = () => !(layout === "floor" && PLAN && PLAN.synthetic);   // sensors' feet mean nothing on an unscaled device sheet
    const DCOL = ["#2f81f7", "#d9480f", "#2b8a3e", "#ae3ec9", "#e8590c", "#0c8599", "#c2255c", "#5c940d", "#364fc7", "#a61e4d"];
    const devListIds = () => Object.keys(LISTS).filter(id => LISTS[id] && typeof LISTS[id] === "object" && !isSensorsList(LISTS[id]))
      .sort((a, b) => String(LISTS[a]._name || a).localeCompare(String(LISTS[b]._name || b)));
    const listCol = id => DCOL[Math.max(0, devListIds().indexOf(id)) % DCOL.length];
    const devId = r => String(r.id ?? r.mark ?? r.label ?? "?");
    const devShown = () => DEV.filter(d => d.x != null && d.y != null && !hideLists.has(d.listId));
    const curDevPlan = () => { const e = PLANS.find(q => q.key === planPick); return e && e.dev ? e.dev : null; };
    function devFeet(r) {   // where this device sits on the map that is showing (feet), or null = not on this map
      const dp = curDevPlan();
      if (r.map && dp && r.map.plan === dp && PLAN) return [PLAN.x0 + Number(r.map.x) * PLAN.w / PLAN.k, PLAN.y0 - Number(r.map.y) * PLAN.h / PLAN.k];
      if (PLAN && PLAN.synthetic) return null;
      if (r.map && r.map.plan && r.map.plan !== dp && !r.ft) return null;   // placed on another sheet only
      if (r.ft && Number.isFinite(+r.ft.x) && Number.isFinite(+r.ft.y)) return [+r.ft.x, +r.ft.y];
      const fx = feet(r.m1), fy = feet(r.m2); return fx != null && fy != null ? [fx, fy] : null;
    }
    function buildDev() {
      DEV = [];
      for (const id of devListIds()) { const l = LISTS[id];
        for (const [rowId, r] of Object.entries(l)) { if (LIST_RESERVED.has(rowId) || !r || typeof r !== "object") continue;
          const f = devFeet(r); DEV.push({ listId: id, rowId, r, list: String(l._name || id), x: f ? f[0] : null, y: f ? f[1] : null }); } }
      DEV.sort((a, b) => a.list.localeCompare(b.list) || devId(a.r).localeCompare(devId(b.r), undefined, { numeric: true }));
    }
    function devChanged() {
      buildDev(); renderDevBar(); renderStats();
      if (!B && devShown().length) fit(false); else draw();
      if (selDev) { const d = DEV.find(x => x.listId === selDev.listId && x.rowId === selDev.rowId);
        if (d && !(document.activeElement && document.activeElement.id === "rm-dnote")) showDev(d); }
      if (!$("dd").hidden && $("dd").dataset.view === "list") renderDrawer();
    }
    function devPlanEntries(owner) {
      return Object.entries(DPLANS).filter(([, v]) => v && v.url).sort((a, b) => (a[1].addedAt || 0) - (b[1].addedAt || 0)).map(([k, v]) => {
        const w = Number(v.w) || 3000, h = Number(v.h) || 2000, c = v.cal && v.cal.k ? v.cal : null;
        const meta = c ? { w, h, k: c.k, x0: c.x0, y0: c.y0 } : { w, h, k: w / 200, x0: 0, y0: 200 * h / w, synthetic: true };
        return { key: "d:" + k, dev: k, label: v.name || k, meta: { ...meta, label: v.name || k }, src: v.url, owner }; });
    }
    function drawDevices(dpr, r) {
      const h = r * 1.05;
      for (const d of devShown()) { const [x, y] = PP(rotXY(d.x, d.y)); if (x < -20 || y < -20 || x > cv.width + 20 || y > cv.height + 20) continue;
        cx.fillStyle = mode === "status" || d.r.punch ? statusCol(d.r) : listCol(d.listId); cx.fillRect(x - h, y - h, 2 * h, 2 * h);
        cx.lineWidth = 2 * dpr; cx.strokeStyle = listCol(d.listId); cx.strokeRect(x - h, y - h, 2 * h, 2 * h);
        if ((d.r.images || []).length) { cx.strokeStyle = "#ffffff"; cx.lineWidth = 1.6 * dpr; cx.beginPath(); cx.arc(x, y, h * 1.6 + 2 * dpr, 0, 6.283); cx.stroke(); }
        if (selDev && selDev.listId === d.listId && selDev.rowId === d.rowId) { cx.strokeStyle = css("--textColor") || "#fff"; cx.lineWidth = 2.5 * dpr; cx.beginPath(); cx.arc(x, y, h * 1.6 + 5 * dpr, 0, 6.283); cx.stroke(); } }
    }
    const devPath = (listId, rowId) => `${OWNER}/tasks/${TASK}/lists/${listId}/${rowId}`;
    const devWrite = (d, f) => update(ref(database, devPath(d.listId, d.rowId)), { ...f, updatedAt: Date.now() });
    async function saveDevAt(listId, rowId, x, y) {   // a placed / dragged device: its spot on the sheet showing (+ feet when the sheet has a real scale)
      if (!OWNER || RO()) return; const f = {}, dp = curDevPlan();
      if (PLAN && dp) f.map = { plan: dp, x: +((x - PLAN.x0) * PLAN.k / PLAN.w).toFixed(5), y: +((PLAN.y0 - y) * PLAN.k / PLAN.h).toFixed(5) };
      if (PLAN && !PLAN.synthetic) f.ft = { x: +x.toFixed(2), y: +y.toFixed(2) };
      try { await devWrite({ listId, rowId }, f); return f; } catch (e) { alert("Couldn't save the spot: " + (e.code || e.message || e)); return null; }
    }
    // UNDO for devices (L 2026-10-27 "so I can move an item then if I press that button it puts it back?"): a move / place keeps the
    // row's map + ft from before, so the same undo / redo arrows as the sensors put it back (kind "dev", id "<list>/<row>").
    const devSnap = (listId, rowId) => { const r = (LISTS[listId] || {})[rowId] || {}; return { kind: "dev", id: listId + "/" + rowId, prev: { map: r.map ?? null, ft: r.ft ?? null } }; };
    async function moveDev(listId, rowId, x, y, snap) {
      snap = snap || devSnap(listId, rowId); const f = await saveDevAt(listId, rowId, x, y); if (!f) return;
      pushUndo(snap, { map: "map" in f ? f.map : snap.prev.map, ft: "ft" in f ? f.ft : snap.prev.ft });
    }
    function devHint(t) { const h = $("devhint"); if (h) h.textContent = t || ""; }
    function renderDevBar() {
      const bar = $("devbar"); if (!bar) return; const ids = devListIds();
      bar.hidden = !OWNER || EMBED && !ids.length;
      const plain = (id, txt) => `<button type="button" id="rm-${id}">${txt}</button>`;
      bar.innerHTML = '<span class="muted">Devices:</span>' + ids.map(id => { const all = DEV.filter(d => d.listId === id), on = all.filter(d => d.x != null).length;
          return `<span class="chip${hideLists.has(id) ? " off" : ""}" data-layer="${esc(id)}" title="show / hide on the map"><i style="background:${listCol(id)}"></i>${esc(LISTS[id]._name || id)} <small>${on}/${all.length}</small></span>`; }).join("")
        + (RO() ? "" : plain("dplace", "&#128205; Place / add") + `<label class="btn" title="add a map image (camera / CX / alarm sheet, heat map ...)">&#43; Map<input type="file" id="rm-dplanfile" accept="image/*" class="file-input" /></label>`
          + plain("dscale", "&#128207; Scale"))
        + '<span id="rm-devhint"></span>';
      const pf = $("dplanfile"); if (pf) pf.onchange = e => { const f = e.target.files[0]; e.target.value = ""; addDevPlan(f); };
    }
    async function addDevPlan(file) {
      if (!file || !OWNER || RO()) return; devHint("Uploading map\u2026");
      try {
        const blob = await resizeImage(file, 3000), name = (file.name || "map").replace(/\.[^.]+$/, ""), key = "p" + Date.now();
        const path = `${imagesDir(OWNER, TASKREC, "plans")}/${clean(name) || key}_${key}.jpg`;
        await uploadBytes(storageRef(storage, path), blob, { contentType: "image/jpeg" });
        const url = await getDownloadURL(storageRef(storage, path));
        const dim = await new Promise(ok => { const i = new Image(); i.onload = () => ok([i.naturalWidth, i.naturalHeight]); i.onerror = () => ok([0, 0]); i.src = url; });
        planPick = "d:" + key;
        await set(ref(database, `${OWNER}/tasks/${TASK}/devicePlans/${key}`), { name, url, path, w: dim[0], h: dim[1], addedAt: Date.now() });
        devHint("Map added - pick devices with \u{1F4CD} Place / add");
      } catch (e) { devHint("Map upload failed: " + (e.code || e.message || e)); }
    }
    // the device card: status, labeled / run complete, punch note, photos on the row (same array the Jobs app shows)
    function showDev(d) {
      selDev = { listId: d.listId, rowId: d.rowId }; sel = -1; selHub = null; const r = d.r, ro = RO();
      const info = ["type", "model", "location", "ip", "mac", "serial", "status"].filter(k => r[k]).map(k => `<b>${esc(k)}</b><span>${esc(r[k])}</span>`).join("");
      const when = t => t ? new Date(t).toLocaleString() : "";
      $("info").innerHTML = `<div class="mk" style="font-size:1.6rem"><i style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${listCol(d.listId)}"></i> ${esc(d.list)} \u00b7 ${esc(devId(r))}</div>
        <div class="kv">${info}${d.x != null && PLAN && !PLAN.synthetic ? `<b>Position</b><span>X ${ftIn(d.x)} \u00b7 Y ${ftIn(d.y)}</span>` : ""}
          <b>Status</b><span>${r.punch ? { ok: "&#9989; OK", punch: "&#9888; Punch", missing: "&#10060; Missing" }[r.punch] + " \u00b7 " + when(r.punchAt) : "not checked"}</span>
          <b>Run</b><span>${r.runDoneAt ? "complete, " + when(r.runDoneAt) : "not yet"}</span>
          <b>Labeled</b><span>${r.labeledAt ? "yes, " + when(r.labeledAt) : "not yet"}</span>
          <b>Map</b><span>${d.x != null ? "on this map" : r.map || r.ft ? "on another map" : "not placed yet"}</span></div>
        ${ro ? "" : `<div class="acts">${[["ok", "&#9989; OK"], ["punch", "&#9888; Punch"], ["missing", "&#10060; Missing"]].map(([k, t]) => `<button type="button" data-st="${k}" class="${r.punch === k ? "done" : ""}">${t}</button>`).join("")}<button type="button" data-st="">Clear</button></div>`}
        <textarea id="rm-dnote" placeholder="punch note / what's wrong"${ro ? " readonly" : ""}>${esc(r.punchNote || "")}</textarea>
        <div class="photos" id="rm-photos"></div>
        ${ro ? "" : `<div class="acts">
          <label class="btn primary">&#128247; Take / choose photo<input type="file" id="rm-addDevPhoto" accept="image/*" class="file-input" /></label>
          <button type="button" data-fl="runDoneAt" class="${r.runDoneAt ? "done" : ""}">${r.runDoneAt ? "&#10003; Run complete" : "Mark run complete"}</button>
          <button type="button" data-fl="labeledAt" class="${r.labeledAt ? "done" : ""}">${r.labeledAt ? "&#10003; Labeled" : "Mark labeled"}</button>
          <button type="button" data-da="move">&#128205; ${d.x != null ? "Move" : "Place on this map"}</button>
          ${d.x != null ? '<button type="button" data-da="unplace">Remove from this map</button>' : ""}
          <span class="muted" id="rm-upState"></span></div>`}`;
      const box = $("photos"), imgs = (r.images || []).filter(im => im && im.url);
      box.innerHTML = imgs.length ? imgs.map((im, k) => `<a href="#" role="button" data-k="${k}"><img alt="" src="${esc(im.url)}" /></a>`).join("") : '<span class="muted">No photos yet.</span>';
      box.onclick = e => { const a = e.target.closest("a[data-k]"); if (!a) return; e.preventDefault();
        openPhotoViewer(imgs.map(im => ({ name: String(im.path || "").split("/").pop() || "photo", url: im.url })), Number(a.dataset.k), {}); };
      if (!ro) {
        const fi = $("addDevPhoto"); if (fi) fi.onchange = e => addDevPhoto(d, e.target.files[0]);
        $("dnote").onchange = e => devWrite(d, { punchNote: e.target.value.trim() || null });
      }
      draw();
    }
    $("info").addEventListener("click", async e => {
      if (!selDev || RO()) return; const d = DEV.find(x => x.listId === selDev.listId && x.rowId === selDev.rowId); if (!d) return;
      const st = e.target.closest("[data-st]"), fl = e.target.closest("[data-fl]"), da = e.target.closest("[data-da]");
      try {
        if (st) { const v = st.dataset.st; await devWrite(d, { punch: v || null, punchAt: v ? Date.now() : null }); }
        else if (fl) { const k = fl.dataset.fl; await devWrite(d, { [k]: d.r[k] ? null : Date.now() }); }
        else if (da && da.dataset.da === "move") startPlace(d.listId, d.rowId);
        else if (da && da.dataset.da === "unplace") { const dp = curDevPlan(); await devWrite(d, dp ? { map: null } : { ft: null }); }
      } catch (err) { alert("Couldn't save: " + (err.code || err.message || err)); }
    });
    async function addDevPhoto(d, file) {
      if (!file || !OWNER || RO()) return; const r = d.r, id = devId(r), st = $("upState"); if (st) st.textContent = "Uploading...";
      try {
        const it = await uploadPhoto({ owner: OWNER, task: TASKREC, sub: clean(d.list), file, name: `${clean(TASKREC.customerName || "job")}_${clean(d.list)}_${clean(id)}.jpg`,
          label: `${String(TASKREC.customerName || "").trim()} ${d.list} ${id}`.trim(), id: TASK });
        const url = await getDownloadURL(it);
        await set(ref(database, devPath(d.listId, d.rowId) + "/images"), [...(r.images || []), { url, path: it.fullPath, note: "" }]);
      } catch (e) { if (st) st.textContent = ""; alert("Upload failed: " + (e.code || e.message || e)); }
    }
    // PLACE: pick a device (drawer, or Move on its card), then tap its spot on the map showing
    function startPlace(listId, rowId) {
      if (layout !== "floor") { alert("Switch to the Floor view to place devices."); return; }
      if (!PLANS.length && !B) { alert("Add a map first (+ Map)."); return; }
      placing = { listId, rowId }; scaling = null; $("dd").hidden = true;
      const r = (LISTS[listId] || {})[rowId] || {}; devHint(`Tap the map where ${LISTS[listId]?._name || listId} ${devId(r)} goes \u00b7 Esc cancels`);
    }
    const unrotP = (a, b) => ROT === 90 ? [b, -a] : ROT === 180 ? [-a, -b] : ROT === 270 ? [-b, a] : [a, b];
    function screenFeet(e) { if (!B) return null; const rc = cv.getBoundingClientRect(), px = (e.clientX - rc.left) * cv.width / rc.width, py = (e.clientY - rc.top) * cv.height / rc.height;
      return unrotP(B.x0 + (px - view.ox) / view.s, B.y1 - (py - view.oy) / view.s); }
    let pdown = null;
    cv.addEventListener("pointerdown", e => { pdown = { x: e.clientX, y: e.clientY, t: e.timeStamp }; });
    cv.addEventListener("pointerup", async e => {
      if (!placing && !scaling) return; const dn = pdown; pdown = null;
      if (!dn || Math.hypot(e.clientX - dn.x, e.clientY - dn.y) > 10 || e.timeStamp - dn.t > 450) return;   // a pan, not a tap
      const f = screenFeet(e); if (!f) return;
      if (placing) { const p = placing; placing = null; devHint(""); await moveDev(p.listId, p.rowId, f[0], f[1]);
        selDev = { listId: p.listId, rowId: p.rowId }; return; }
      if (scaling) { scaling.pts.push(f);
        if (scaling.pts.length === 1) { devHint("Scale: now tap the SECOND point"); return; }
        devHint(""); openScaleBox(); }
    });
    window.addEventListener("keydown", e => { if (e.key === "Escape" && (placing || scaling)) { placing = null; scaling = null; devHint(""); } });
    // SCALE (an added map): tap two points, type the real distance -> devicePlans/<key>/cal {k px/ft, x0, y0}, first tap = 0,0 (Y up,
    // the radar way). From then on that map shows feet and the devices placed on it also keep their feet (row.ft).
    function startScale() {
      const dp = curDevPlan(); if (!dp) { alert("Scale works on a map you added (+ Map). Radar maps are fitted with Set plan."); return; }
      placing = null; scaling = { dp, pts: [] }; devHint("Scale: tap the FIRST point of a known distance \u00b7 Esc cancels");
    }
    function openScaleBox() {
      $("dd").dataset.view = "scale"; $("dd").hidden = false;
      $("ddbox").innerHTML = `<div class="rm-row"><b>&#128207; Scale this map</b><span style="flex:1"></span><button type="button" data-ddx="1">Close</button></div>
        <div class="muted">Real distance between the two points you tapped:</div>
        <div class="rm-row"><input id="rm-scft" placeholder="feet - 50 or 12'6&quot;" inputmode="text" /> <button type="button" id="rm-scsave" class="primary">Save scale</button></div>`;
      $("scsave").onclick = async () => {
        const r = readFt($("scft").value), sc = scaling; if (!r || !r.v || r.v <= 0 || !sc || !PLAN) { $("scft").focus(); return; }
        const uv = f => [(f[0] - PLAN.x0) * PLAN.k, (PLAN.y0 - f[1]) * PLAN.k], [a, b] = sc.pts.map(uv), px = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (px < 5) { alert("Those two taps are too close - try again."); return; }
        const k = px / Math.abs(r.v), cal = { k: +k.toFixed(5), x0: +(-a[0] / k).toFixed(3), y0: +(a[1] / k).toFixed(3), at: Date.now() };
        try { await update(ref(database, `${OWNER}/tasks/${TASK}/devicePlans/${sc.dp}`), { cal }); scaling = null; $("dd").hidden = true; devHint(`Scale saved (${r.txt})`); }
        catch (e) { alert("Couldn't save: " + (e.code || e.message || e)); }
      };
    }
    // the PLACE / ADD drawer: every device of every list (not placed first), search, and a new device / new list
    function renderDrawer() {
      const dd = $("dd"), q = (dd.dataset.find || "").toLowerCase(), ids = devListIds(); dd.dataset.view = "list";
      let html = `<div class="rm-row"><b>&#128205; Place / add devices</b><span style="flex:1"></span><button type="button" data-ddx="1">Close</button></div>
        <div class="rm-row"><select id="rm-newlist">${ids.map(id => `<option value="${esc(id)}">${esc(LISTS[id]._name || id)}</option>`).join("")}<option value="__new">+ new list\u2026</option></select>
          <input id="rm-newname" placeholder="new list name (CCTV / CX / Burg)" style="display:none" /><input id="rm-newid" placeholder="device id" style="width:8em" />
          <button type="button" id="rm-newgo">New device</button></div>
        <input id="rm-dfind" placeholder="search devices" value="${esc(dd.dataset.find || "")}" style="width:100%" />`;
      for (const id of ids) {
        const rows = DEV.filter(d => d.listId === id && (!q || `${devId(d.r)} ${d.r.location || ""} ${d.r.type || ""} ${d.r.model || ""}`.toLowerCase().includes(q)))
          .sort((a, b) => (a.x != null) - (b.x != null) || devId(a.r).localeCompare(devId(b.r), undefined, { numeric: true }));
        if (!rows.length) continue;
        html += `<div class="muted" style="margin-top:8px;text-transform:uppercase;font-size:.8rem">${esc(LISTS[id]._name || id)}</div>` + rows.map(d =>
          `<div class="row" data-pl="${esc(d.listId)}" data-pr="${esc(d.rowId)}"><i style="background:${listCol(id)}"></i><b>${esc(devId(d.r))}</b> ${esc(d.r.location || d.r.type || "")}<small>${d.x != null ? "on this map \u00b7 move" : d.r.map || d.r.ft ? "on another map" : "not placed"}</small></div>`).join("");
      }
      $("ddbox").innerHTML = html; dd.hidden = false;
      $("newlist").onchange = e => { $("newname").style.display = e.target.value === "__new" ? "" : "none"; };
      $("dfind").oninput = e => { dd.dataset.find = e.target.value; const pos = e.target.selectionStart; renderDrawer(); const n = $("dfind"); n.focus(); n.setSelectionRange(pos, pos); };
      $("newgo").onclick = async () => {
        const did = $("newid").value.trim(); if (!did) { $("newid").focus(); return; }
        let listId = $("newlist").value;
        try {
          if (listId === "__new" || !listId) { const nm = $("newname").value.trim(); if (!nm) { $("newname").style.display = ""; $("newname").focus(); return; }
            listId = clean(nm).toLowerCase() || "list" + Date.now(); await update(ref(database, `${OWNER}/tasks/${TASK}/lists/${listId}`), { _name: nm, createdAt: Date.now() }); }
          const rowId = clean(did) || String(Date.now());
          if (!(LISTS[listId] || {})[rowId]) await set(ref(database, devPath(listId, rowId)), { id: did, notes: "", createdAt: Date.now() });
          startPlace(listId, rowId);
        } catch (e) { alert("Couldn't add: " + (e.code || e.message || e)); }
      };
    }
    $("dd").addEventListener("click", e => {
      if (e.target === $("dd") || e.target.closest("[data-ddx]")) { $("dd").hidden = true; if (scaling) { scaling = null; devHint(""); } return; }
      const r = e.target.closest("[data-pl]"); if (r) startPlace(r.dataset.pl, r.dataset.pr);
    });
    $("devbar").addEventListener("click", e => {
      const c = e.target.closest("[data-layer]");
      if (c) { const id = c.dataset.layer; hideLists.has(id) ? hideLists.delete(id) : hideLists.add(id); renderDevBar(); draw(); return; }
      if (e.target.closest("#rm-dplace")) { if (!OWNER) return; $("dd").dataset.find = ""; renderDrawer(); return; }
      if (e.target.closest("#rm-dscale")) startScale();
    });
    function drawPlan() {
      const p = PLAN, light = document.documentElement.classList.contains("light");
      const sc = (u, v) => { const [rx, ry] = rotXY(p.x0 + u / p.k, p.y0 - v / p.k); return [view.ox + (rx - B.x0) * view.s, view.oy + (B.y1 - ry) * view.s]; };
      const [ax, ay] = sc(0, 0), [bx, by] = sc(p.w, 0), [cx2, cy2] = sc(0, p.h);
      let im = planImg;
      if (!light && !p.color) {   // dark map: invert once (white sheet -> black, lines -> light) so it can be screened on
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
      cx.save(); cx.globalAlpha = planMode === "full" ? (light ? 0.95 : 0.85) : (light ? 0.45 : 0.4); cx.globalCompositeOperation = light ? "multiply" : p.color ? "source-over" : "screen";
      cx.setTransform(a, b, c, d, e, f); cx.drawImage(im, su, sv, eu - su, ev - sv, su, sv, eu - su, ev - sv); cx.restore();
      cx.setTransform(1, 0, 0, 1, 0, 0);
    }
    function planLabel() { $("plan").innerHTML = "&#128506; Plan: " + planMode; }
    function drawWiring(dpr, r) {
      const fg = css("--textColor") || "#e5e7eb", mut = css("--mutedText") || "#94a3b8";
      cx.lineWidth = 1 * dpr; cx.strokeStyle = "rgba(148,163,184,.28)"; cx.beginPath();
      for (const s of S) { const h = s.sw != null && HUB[s.idf + "-" + s.sw]; if (!h) continue; const a = P(s), b = PP(h); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); }
      cx.stroke();
      cx.lineWidth = 2.5 * dpr; cx.strokeStyle = "rgba(148,163,184,.45)"; cx.beginPath();
      for (const idf of wIdfs()) { const c = PP(HUB[idf]), m = PP(wChain() && idf !== "1" ? HUB[1] : HUB.mdf); cx.moveTo(m[0], m[1]); cx.lineTo(c[0], c[1]);
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
      for (const idf of wIdfs()) {
        const rs = S.filter(s => s.idf === Number(idf)), done = rs.filter(s => s.runDoneAt).length;
        node(HUB[idf], 16, IDF_COL[idf] || "#64748b", "IDF " + idf, `${done}/${rs.length} runs`);
        ring(HUB[idf], 16, (HUBPH["IDF" + idf] || []).length, selHub === "IDF" + idf);
        for (const sw of SWITCHES[idf]) { const n = S.filter(s => s.idf === Number(idf) && sameVal(s.sw, sw)).length;
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
    // job's sensors folder, a confirm once the sensor already has its 4 photos.
    async function addPhoto(file) {
      const s = S[sel]; if (!s || !file || !OWNER || RO()) return;
      if (s.photos >= 4 && !confirm(`Device ${String(s.m).padStart(2, "0")} already has ${s.photos} photos. Upload another?`)) { if ($("addPhoto")) $("addPhoto").value = ""; return; }
      let serial = clean(s.serial);
      if (!serial) { serial = clean(prompt(`Device #${s.m} has no serial yet. Serial number:`) || ""); if (!serial) return;
        await patchSensor(OWNER, TASK, s.m, { serial, updatedAt: Date.now() }).catch(() => {}); s.serial = serial; }
      const st = $("upState"), inp = $("addPhoto"); if (st) st.textContent = "Uploading..."; if (inp) inp.disabled = true;   // one at a time (sensor-83 scar)
      try {
        // the live refresh (photosAt watch) may already have listed the new file - only add it if it isn't there yet
        // (L 2026-10-06 "I have 4 images when I've only taken 3": the photo was counted twice when the refresh won the race)
        const it = await uploadSensorPhoto({ owner: OWNER, task: TASKREC, id: TASK, mark: s.m, serial, file, bar: !$("mark") || $("mark").checked });
        if (!s.items.some(x => (x.name || x.fullPath) === (it.name || it.fullPath))) { s.items.push(it); s.photos = s.items.length; }
        renderStats(); show(sel);
      } catch (e) { if (st) st.textContent = ""; if (inp) { inp.disabled = false; inp.value = ""; } alert("Upload failed: " + (e.code || e.message || e)); }
    }
    function showHub(h) {
      selHub = h; sel = -1; selDev = null; const items = HUBPH[h] || [], idf = h === "MDF" ? null : Number(h.slice(3));
      const rs = idf ? S.filter(s => s.idf === idf) : S, runs = rs.filter(s => s.runDoneAt).length, ph = rs.filter(s => s.photos >= 4).length;
      $("info").innerHTML = `<div class="mk">${hubLabel(h)}</div><div class="kv">
        <b>Devices</b><span>${rs.length}</span>
        <b>Runs complete</b><span>${runs} / ${rs.length}</span>
        <b>Device photos</b><span>${PHOTOS === "ok" ? `${ph} / ${rs.length} with all 4` : PHOTOS === "loading" ? "loading\u2026" : "can't reach Storage"}</span>
        ${idf && TABLES && SWITCHES[idf] ? `<b>Switches</b><span>${SWITCHES[idf].map(w => w === "new" ? "3rd needed" : "#" + w).join(", ")}</span>` : ""}
        <b>Photos</b><span>${items.length || PHOTOS === "ok" ? items.length : PHOTOS === "loading" ? "loading\u2026" : "can't reach Storage"}</span></div>
        <div class="photos" id="rm-photos"></div>
        <div class="acts">
          <label class="btn primary">&#128247; Take / choose ${hubLabel(h)} photo<input type="file" id="rm-addHubPhoto" accept="image/*" class="file-input" /></label>
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
        { const it = await uploadHubPhoto({ owner: OWNER, task: TASKREC, id: TASK, hub: h, file, bar: !$("mark") || $("mark").checked }), arr = (HUBPH[h] = HUBPH[h] || []);
          if (!arr.some(x => (x.name || x.fullPath) === (it.name || it.fullPath))) arr.push(it); }   // the live refresh may have listed it already
        renderHubs(); showHub(h);
      } catch (e) { if (st) st.textContent = ""; if (inp) { inp.disabled = false; inp.value = ""; } alert("Upload failed: " + (e.code || e.message || e)); }
    }
    function show(i) {
      sel = i; selHub = null; selDev = null; const s = S[i];
      $("info").innerHTML = `<div class="mk"><button type="button" class="rm-nav" data-nav="-1" aria-label="Previous device" title="Previous device (or swipe right)"${i > 0 ? "" : " disabled"}>&#8249;</button> #${s.m} <button type="button" class="rm-nav" data-nav="1" aria-label="Next device" title="Next device (or swipe left)"${i < S.length - 1 ? "" : " disabled"}>&#8250;</button></div><div class="kv">
        <b>Serial</b><span>${esc(s.serial) || "-"}</span>
        <b>Position</b><span>X <input name="x" value="${esc(ftIn(s.x))}" form="rm-measure" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:7.5em" /> · Y <input name="y" value="${esc(ftIn(s.y))}" form="rm-measure" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:7.5em" /></span>
        <b>Height</b><span><input name="z" value="${esc(ftIn(s.z))}" form="rm-measure" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:7.5em" /> <button type="submit" form="rm-measure" id="rm-measureSave" class="primary" hidden>Save</button> <span class="muted" id="rm-measureState"></span></span>
        ${asgRows(s)}
        <b>Run</b><span>${s.runDoneAt ? "complete, " + new Date(s.runDoneAt).toLocaleString() : "not yet"}</span>
        <b>Labeled</b><span>${s.labeledAt ? "yes, " + new Date(s.labeledAt).toLocaleString() : "not yet"}</span>
        <b>Photos</b><span>${s.photos || PHOTOS === "ok" ? `${s.photos} of 4` : PHOTOS === "loading" ? "loading\u2026" : "can't reach Storage on this network"}</span></div>
        <form id="rm-measure"></form>
        <div class="photos" id="rm-photos"></div>
        <div class="acts">
          <label class="btn primary">&#128247; Take / choose photo<input type="file" id="rm-addPhoto" accept="image/*" class="file-input" /></label>
          <label class="muted"><input type="checkbox" id="rm-mark" checked /> label bar</label>
          <button type="button" id="rm-runBtn" class="${s.runDoneAt ? "done" : ""}">${s.runDoneAt ? "&#10003; Run complete" : "Mark run complete"}</button>
          <button type="button" id="rm-labBtn" class="${s.labeledAt ? "done" : ""}">${s.labeledAt ? "&#10003; Labeled" : "Mark labeled"}</button>
          <span class="muted" id="rm-upState"></span>
        </div>
        <div class="note">Photos save like radar-tools: "${esc(photoPrefix(TASKREC))}_${String(s.m).padStart(2, "0")}-${esc(s.serial || "serial")}.jpg" with the label bar.</div>`;
      if (RO()) { readOnlyCard(); root.querySelectorAll('[form="rm-measure"]').forEach(x => { x.readOnly = true; if (x.tagName === "BUTTON") x.remove(); }); } else {
        $("addPhoto").onchange = e => addPhoto(e.target.files[0]);
        $("runBtn").onclick = () => setFlag("runDoneAt", !s.runDoneAt);
        $("labBtn").onclick = () => setFlag("labeledAt", !s.labeledAt);
        if ($("resetPos")) $("resetPos").onclick = () => resetPos(i);
        wireAsg(i);
        // the boxes ARE the measurements: Save shows once one changes; Enter in a box saves too
        const fm = $("measure"); $("info").oninput = e => { if (e.target.form !== fm) return; $("measureSave").hidden = false; $("measureState").textContent = ""; };   // the boxes sit in the card, not inside the form - their events bubble to the card
        fm.onsubmit = e => { e.preventDefault(); saveMeasure(i, fm); };
      }
      thumbs(s);
      draw();
    }

    // ---------- SELECTORS (L 2026-10-07 "a selector for the IDF, zones, switches and whatnot to change or add things") ----------
    // One <select> per field on the sensor card. Picking writes the sensor's row through patchSensor (the same save as a move
    // or a flag); picking the plan's own value clears the field so the row follows the plan again. "+ new..." opens a small
    // box: the new IDF / zone goes into siteTables/options, a new switch into siteTables/switches/<IDF> (filling a "new"
    // placeholder first), and the sensor gets it. Changing the IDF clears the switch + port (they belong to the old IDF).
    const ASG = ["idf", "zone", "sw", "port"], ASG_LABEL = { idf: "IDF", zone: "Zone", sw: "Switch", port: "Port" };
    const DEF_IDFS = [1, 2, 3, 4, 5, 6, "MDF"];
    function asgOpts(f, s) {
      const O = (TABLES && TABLES.options) || {};
      if (f === "idf") return optList(O.idfs && O.idfs.length ? O.idfs.map(idfVal) : DEF_IDFS, Object.keys(SWITCHES).map(idfVal), S.map(x => x.idf));
      if (f === "zone") return optList(O.zones && O.zones.length ? O.zones : (TABLES && TABLES.zones.length ? TABLES.zones.map(z => z[2]) : [1, 2, 3, 4, 5]), S.map(x => x.zone))
        .map(Number).sort((a, b) => a - b);
      if (f === "sw") return s.idf == null ? [] : optList(SWITCHES[s.idf], [s.sw]);
      return optList(Array.from({ length: 24 }, (_, k) => k + 1), [s.port]).map(Number).sort((a, b) => a - b);
    }
    const asgPlan = (f, s) => f === "idf" ? s.planIdf : f === "zone" ? s.planZone : f === "sw" ? s.planSw : s.planPort;
    const asgName = (f, v) => f === "idf" ? idfName(v) : f === "sw" ? swName(v) : String(v);
    function asgRows(s) {
      return ASG.map(f => { const cur = s[f], plan = asgPlan(f, s), list = asgOpts(f, s);
        const o = [`<option value=""${cur == null ? " selected" : ""}>\u2014</option>`]
          .concat(list.map(v => `<option value="${esc(v)}"${sameVal(v, cur) ? " selected" : ""}>${esc(asgName(f, v))}${sameVal(v, plan) ? " \u00b7 plan" : ""}</option>`));
        if (f !== "sw" || s.idf != null) o.push('<option value="__new">+ new\u2026</option>');
        return `<b>${ASG_LABEL[f]}</b><span class="rm-asg"><select data-f="${f}" aria-label="${ASG_LABEL[f]}"${RO() ? " disabled" : ""}>${o.join("")}</select>`
          + `<span class="rm-new" data-f="${f}" hidden><input type="text" ${f === "sw" ? 'inputmode="text"' : 'inputmode="numeric"'} autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="New ${ASG_LABEL[f]}" placeholder="${f === "idf" ? "7 / MDF" : f === "sw" ? "16" : "#"}" />`
          + `<button type="button" class="ok" aria-label="Add">&#10003;</button><button type="button" class="no" aria-label="Cancel">&#10005;</button></span>`
          + `<span class="rm-asgMsg" data-f="${f}"></span></span>`; }).join("");
    }
    function wireAsg(i) {
      const s = S[i]; if (!s || RO()) return;
      for (const f of ASG) {
        const sel = root.querySelector(`#rm-info select[data-f="${f}"]`), box = root.querySelector(`#rm-info .rm-new[data-f="${f}"]`); if (!sel || !box) continue;
        const inp = box.querySelector("input"), msg = root.querySelector(`#rm-info .rm-asgMsg[data-f="${f}"]`);
        const close = () => { box.hidden = true; inp.value = ""; sel.hidden = false; };
        sel.onchange = () => { msg.textContent = "";
          if (sel.value === "__new") { sel.hidden = true; box.hidden = false; try { inp.focus(); } catch (_) {} return; }
          const parse = f === "idf" ? idfVal : f === "sw" ? swVal : numVal;
          saveAsg(i, f, sel.value === "" ? null : parse(sel.value)); };
        const add = () => { const parse = f === "idf" ? idfVal : f === "sw" ? swVal : numVal, v = parse(inp.value);
          if (v == null) { msg.textContent = f === "idf" ? "a number, or MDF" : f === "sw" ? "a switch #" : "a number"; try { inp.focus(); } catch (_) {} return; }
          msg.textContent = ""; addAsg(i, f, v); };
        box.querySelector(".ok").onclick = add; box.querySelector(".no").onclick = () => { close(); show(i); };
        inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); add(); } else if (e.key === "Escape") { close(); show(i); } };
      }
    }
    // the plan into Firebase before its first edit: the built-in WM54 table (or no table) lives only in code until then
    async function ensureTables() {
      if (TABLES && TABLES.from === "firebase") return;
      if (TABLES) { const { zones, idf, switches, maxPerSwitch, hubs } = TABLES;
        await saveSiteTables(OWNER, TASK, { zones, idf, switches, maxPerSwitch, ...(hubs ? { hubs } : {}) }); TABLES.from = "firebase"; return; }
      TABLES = { zones: [], idf: "", switches: {}, maxPerSwitch: 18, hubs: null, options: {}, from: "firebase" }; SWITCHES = TABLES.switches;
    }
    async function addAsg(i, f, v) {   // "+ new": into the site's list (not for a port - any number is a port), then onto the sensor
      const s = S[i]; if (!s || !OWNER || RO()) return; const msg = root.querySelector(`#rm-info .rm-asgMsg[data-f="${f}"]`);
      try {
        if (f !== "port") await ensureTables();
        if (f === "idf" || f === "zone") { const key = f === "idf" ? "idfs" : "zones", list = optList(asgOpts(f, s), [v]);
          await saveSiteOptions(OWNER, TASK, { [key]: list }); TABLES.options = { ...(TABLES.options || {}), [key]: list }; }
        if (f === "sw") { const k = String(s.idf), list = addSwitch(SWITCHES[k], v);
          await saveSiteSwitches(OWNER, TASK, k, list); SWITCHES[k] = list; assignAll(); }
      } catch (e) { if (msg) msg.textContent = "not saved: " + (e.code || e.message || e); return; }
      await saveAsg(i, f, v);
    }
    const asgSnap = m => { const r = RAW[m] || {}, o = {}; for (const k of ASSIGN_KEYS) o[k] = r[k] === undefined ? null : r[k]; return o; };
    async function saveAsg(i, f, v) {
      const s = S[i]; if (!s || !OWNER || RO()) return; const msg = root.querySelector(`#rm-info .rm-asgMsg[data-f="${f}"]`);
      const prev = asgSnap(s.m), fields = { [f]: storeVal(v, asgPlan(f, s)), updatedAt: Date.now() };
      if (f === "idf") { fields.sw = null; fields.port = null; }   // the old IDF's switch + port do not carry over
      if (msg) msg.textContent = "saving\u2026";
      try { await writeSpot("assign", s.m, { ...prev, ...fields }); }
      catch (e) { if (msg) msg.textContent = "not saved: " + (e.code || e.message || e); return; }
      pushUndo({ kind: "assign", id: s.m, prev }, asgSnap(s.m));
      legend(); renderStats(); draw(); if (sel === i) show(i);
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
      const snap = dragSnap; dragSnap = null;
      if (!m || !OWNER) return;
      try {
        if (m.kind === "dev") { await moveDev(m.d.listId, m.d.rowId, m.d.x, m.d.y, snap && snap.kind === "dev" ? snap : null); draw(); return; }
        if (m.kind === "sensor") { const s = S[m.i]; s.pos = { x: Math.round(s.x * 100) / 100, y: Math.round(s.y * 100) / 100 }; s.x = s.pos.x; s.y = s.pos.y;
          s.pos = null; s.plan = [s.x, s.y];   // the new spot IS the measurement (L 2026-10-04 "just enter what it is")
          const fields = { m1: "X " + ftIn(s.x), m2: "Y " + ftIn(s.y), pos: null, posAt: null, updatedAt: Date.now() };
          await patchSensor(OWNER, TASK, s.m, fields); if (sel === m.i) show(m.i);
          if (snap && snap.kind === "sensor" && snap.id === s.m) pushUndo(snap, { m1: fields.m1, m2: fields.m2 }); }
        else { const xy = TABLES.hubs[m.h]; xy[0] = Math.round(xy[0] * 10) / 10; xy[1] = Math.round(xy[1] * 10) / 10; await saveHubPos(OWNER, TASK, m.h, xy);
          if (snap && snap.kind === "hub" && snap.id === m.h) pushUndo(snap, [xy[0], xy[1]]); }
      } catch (e) { alert("Couldn't save the new spot: " + (e.code || e.message || e)); }
      draw();
    }
    // ---------- UNDO MOVE (L 2026-10-07 "an undo for the last move I may have done on the map like a sensor or IDF") ----------
    // A move writes, for a sensor: m1 / m2 / pos / posAt / updatedAt on its row (patchSensor); for a cabinet: its [x, y] under
    // siteTables/hubs (saveHubPos). Undo writes the before-values back through the SAME two calls (a field that was absent
    // goes back as null = deleted), so the live watch, the list row and every other page see it exactly like a move.
    function rawOf(meta) { const o = {}; for (const [k, v] of Object.entries(meta || {})) if (v && typeof v === "object") o[Number(k)] = v; return o; }
    function snapOf(t) {
      if (!t) return null;
      if (t.kind === "dev") return devSnap(t.d.listId, t.d.rowId);
      if (t.kind === "sensor") { const s = S[t.i]; if (!s) return null; const r = RAW[s.m] || {}, prev = {};
        for (const k of MOVE_KEYS) prev[k] = r[k] === undefined ? null : r[k]; return { kind: "sensor", id: s.m, prev }; }
      const xy = hubXY(t.h); return xy ? { kind: "hub", id: t.h, prev: [xy[0], xy[1]] } : null;
    }
    const undoName = u => u.kind === "hub" ? hubLabel(u.id) : u.kind === "dev" ? (() => { const [l, rw] = String(u.id).split("/"); const r = (LISTS[l] || {})[rw]; return `${(LISTS[l] || {})._name || l} ${r ? devId(r) : rw}`; })() : `device ${u.id}`;
    const devSame = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const sameMove = (u, after) => u.kind === "dev" ? devSame(u.prev.map, after.map) && devSame(u.prev.ft, after.ft) : u.kind === "assign" ? !ASSIGN_CMP.some(k => String(u.prev[k] ?? "") !== String(after[k] ?? "")) : u.kind === "sensor"
      ? (u.prev.m1 ?? "") === after.m1 && (u.prev.m2 ?? "") === after.m2 && u.prev.pos == null && u.prev.posAt == null
      : u.prev[0] === after[0] && u.prev[1] === after[1];
    // REDO (L 2026-10-07 "And a redo"): an entry is {kind, id, owner, task, prev, after}; Undo writes prev and puts the
    // values it replaced on REDO as {prev: what undo wrote, after: what it replaced}; Redo writes that after and puts the
    // values IT replaced back on UNDO. A new move clears REDO (a new branch). Both stacks: last 5 per job on this device.
    function curOf(kind, id) {   // the spot right now, in an entry's shape (sensor: every MOVE_KEYS field, null = absent)
      if (kind === "dev") { const [l, rw] = String(id).split("/"); return devSnap(l, rw).prev; }
      if (kind === "sensor") { const r = RAW[id] || {}, o = {}; for (const k of MOVE_KEYS) o[k] = r[k] === undefined ? null : r[k]; return o; }
      if (kind === "assign") return asgSnap(id);
      const xy = hubXY(id); return xy ? [xy[0], xy[1]] : null;
    }
    const differs = (kind, cur, exp) => kind === "dev" ? !(devSame((cur || {}).map, exp.map) && devSame((cur || {}).ft, exp.ft)) : kind === "assign" ? ASSIGN_CMP.some(k => String((cur || {})[k] ?? "") !== String(exp[k] ?? "")) : kind === "sensor"
      ? (cur && cur.m1 != null ? cur.m1 : "") !== (exp.m1 ?? "") || (cur && cur.m2 != null ? cur.m2 : "") !== (exp.m2 ?? "")
      : !cur || cur[0] !== exp[0] || cur[1] !== exp[1];
    function pushUndo(snap, after) {
      if (sameMove(snap, after)) return;   // held, then put down on the same spot: nothing to undo
      UNDO.push({ ...snap, after, owner: OWNER, task: TASK, at: Date.now() }); if (UNDO.length > UNDO_MAX) UNDO.splice(0, UNDO.length - UNDO_MAX);
      REDO = [];   // a new move: nothing left to redo
      saveUndo(); renderUndo();
    }
    const histKey = w => "rm-" + w + "-" + TASK;   // rm-undo-<task> (unchanged) + rm-redo-<task>
    function saveUndo() { try { localStorage.setItem(histKey("undo"), JSON.stringify(UNDO.slice(-UNDO_KEEP)));
      localStorage.setItem(histKey("redo"), JSON.stringify(REDO.slice(-UNDO_KEEP))); } catch (_) {} }
    function loadUndo() {
      const rd = w => { let a = []; try { a = JSON.parse(localStorage.getItem(histKey(w))) || []; } catch (_) {}
        return Array.isArray(a) ? a.filter(u => u && u.owner === OWNER && u.task === TASK && (u.kind === "sensor" || u.kind === "hub" || u.kind === "assign" || u.kind === "dev") && u.prev && u.after) : []; };
      UNDO = rd("undo"); REDO = rd("redo"); renderUndo();
    }
    function renderUndo() {   // icon-only buttons; the words live in title + aria-label; hidden when there is nothing to step
      for (const [id, st, w] of [["undo", UNDO, "Undo"], ["redo", REDO, "Redo"]]) {
        const b = $(id); if (!b) continue; const u = st[st.length - 1];
        b.hidden = !u || RO(); b.disabled = undoBusy;
        const t = u ? `${w}: ${undoName(u)} ${u.kind === "assign" ? "IDF / zone / switch change" : "move"}` : `${w} the last move`; b.title = t; b.setAttribute("aria-label", t);
      }
    }
    function undoToast(t) { const el = $("undoState"); if (!el) return; el.textContent = t; clearTimeout(toastT); toastT = setTimeout(() => { el.textContent = ""; }, 5000); }
    async function writeSpot(kind, id, v) {   // the SAME two save calls a move uses, then the local copy to match
      if (kind === "dev") { const [l, rw] = String(id).split("/"); await devWrite({ listId: l, rowId: rw }, { map: v.map ?? null, ft: v.ft ?? null }); return; }
      if (kind === "assign") {   // a selector change: the row's idf / zone / sw / port (+ updatedAt), then re-plan everyone
        const f = {}; for (const k of ASSIGN_KEYS) f[k] = v[k] === undefined ? null : v[k];
        await patchSensor(OWNER, TASK, id, f);
        const r0 = { ...(RAW[id] || {}) }; for (const [k, x] of Object.entries(f)) { if (x == null) delete r0[k]; else r0[k] = x; } RAW[id] = r0;
        assignAll(); legend(); return;
      }
      if (kind === "sensor") {
        const f = {}; for (const k of MOVE_KEYS) f[k] = v[k] === undefined ? null : v[k];
        await patchSensor(OWNER, TASK, id, f);
        const r0 = { ...(RAW[id] || {}) }; for (const [k, x] of Object.entries(f)) { if (x == null) delete r0[k]; else r0[k] = x; } RAW[id] = r0;
        const s = S.find(x => x.m === id), r = sensorRows({ [id]: r0 })[0];
        if (s && r) { s.pos = r.pos; s.plan = [r.x, r.y]; s.x = r.pos ? r.pos.x : r.x; s.y = r.pos ? r.pos.y : r.y; }
      } else {
        await saveHubPos(OWNER, TASK, id, v);
        if (TABLES) { TABLES.hubs = TABLES.hubs || {}; const xy = TABLES.hubs[id]; if (xy) { xy[0] = v[0]; xy[1] = v[1]; } else TABLES.hubs[id] = [v[0], v[1]]; }
      }
    }
    async function stepMove(redo) {
      const from = redo ? REDO : UNDO, u = from[from.length - 1]; if (!u || undoBusy || !OWNER || RO()) return;
      if (u.owner !== OWNER || u.task !== TASK) { from.pop(); saveUndo(); renderUndo(); return; }
      const want = redo ? u.after : u.prev, expect = redo ? u.prev : u.after, cur = curOf(u.kind, u.id);
      // changed since (another device, the card's X/Y boxes): ask before writing over it
      if (differs(u.kind, cur, expect) && !confirm(redo ? `${undoName(u)} has changed since the undo. Move it again anyway?`
        : `${undoName(u)} has changed since that move. Put it back where it was before the move anyway?`)) return;
      undoBusy = true; renderUndo();
      try {
        await writeSpot(u.kind, u.id, want);
        if (from !== (redo ? REDO : UNDO)) return;   // the job reloaded mid-save: its own stacks are already loaded
        from.pop();
        const was = cur || expect, to = redo ? UNDO : REDO;   // the values this step replaced: step back to them from the other side
        to.push({ kind: u.kind, id: u.id, owner: OWNER, task: TASK, at: Date.now(), prev: redo ? was : want, after: redo ? want : was });
        if (to.length > UNDO_MAX) to.splice(0, to.length - UNDO_MAX);
        if (u.kind === "assign") { const s = S.find(x => x.m === u.id);
          undoToast(`${redo ? "\u21b7" : "\u21b6"} ${undoName(u)}: ${s ? [s.idf != null ? idfName(s.idf) : "", s.zone != null ? "zone " + s.zone : "", s.sw != null ? swName(s.sw) : "", s.port != null ? "port " + s.port : ""].filter(Boolean).join(" \u00b7 ") : "back"}`); }
        else undoToast(redo ? `\u21b7 ${undoName(u)} is back where you moved it.` : `\u21b6 ${undoName(u)} is back where it was.`);
        saveUndo();
        draw(); if (sel >= 0) show(sel); else if (selHub) showHub(selHub);
      } catch (e) { undoToast(`Couldn't ${redo ? "redo" : "undo"}: ` + (e.code || e.message || e)); }
      finally { undoBusy = false; renderUndo(); }
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
    // FORGIVING (L 2026-10-04 "can the input box not be so picky"): the iPhone keyboard turns ' and " into curly quotes,
    // which the strict sheet parser refused. Takes 12'-6", 12'6, 12' 6", 12 6, 12-6, 12ft 6in, 12', 6", 7.8", 12'-6 1/2",
    // 12 6 1/2, -2'-4", 12.5 (feet) - with straight or curly quotes. Saves the canonical form (12'-6 1/2") so the sheet stays uniform.
    const parseLen = raw => {
      let t = String(raw || "").replace(/[\u2018\u2019\u2032\u00B4`]/g, "'").replace(/[\u201C\u201D\u2033]/g, '"').replace(/''/g, '"')
        .replace(/^\s*[XYZ]\s*[:=]?\s*/i, "").replace(/\s*(feet|foot|ft)\.?/gi, "'").replace(/\s*(inches|inch|in)\.?/gi, '"').trim();
      if (!t) return { v: null };
      const neg = /^[-\u2212\u2013]/.test(t); t = t.replace(/^[-\u2212\u2013]\s*/, "");
      const num = "(\\d+(?:\\.\\d+)?)", frac = "(?:\\s*(\\d+)\\s*/\\s*(\\d+))?";
      let m, ft = 0, inch = 0;
      if ((m = t.match(new RegExp("^" + num + "$")))) ft = Number(m[1]);                                                   // 12.5 = feet
      else if ((m = t.match(new RegExp("^" + num + frac + '\\s*"$')))) inch = Number(m[1]) + (m[2] ? m[2] / m[3] : 0);       // 6" / 7.8" / 6 1/2"
      else if ((m = t.match(new RegExp("^" + num + "\\s*'?\\s*[-\\s]?\\s*(?:" + num + frac + '\\s*"?)?$')))) {           // 12'-6 1/2" / 12 6 / 12-6 / 12'
        ft = Number(m[1]); inch = (m[2] ? Number(m[2]) : 0) + (m[3] ? m[3] / m[4] : 0);
        if (!/'/.test(t) && m[2] == null) return null;   // "12 " with nothing after - ambiguous, not a length
      } else return null;
      if (!Number.isFinite(ft) || !Number.isFinite(inch) || inch >= 12 && /'/.test(t)) return null;
      const v = (ft + inch / 12) * (neg ? -1 : 1); return { v };
    };
    const readFt = t => { const r = parseLen(t); if (r === null) return null; return r.v == null ? { v: null, txt: "" } : { v: r.v, txt: ftIn(r.v) }; };
    async function saveMeasure(i, fm) {
      const s = S[i]; if (!s || !OWNER) return; const st = $("measureState");
      const vals = {}; for (const k of ["x", "y", "z"]) { const r = readFt(fm[k].value); if (r === null) { st.textContent = `Couldn't read ${k.toUpperCase()} "${fm[k].value}" - try 12'6, 12 6, 12'-6 1/2" or 12.5 (feet)`; fm[k].focus(); return; } vals[k] = r; }
      st.textContent = "saving\u2026";
      try {
        await patchSensor(OWNER, TASK, s.m, { m1: vals.x.txt ? "X " + vals.x.txt : "", m2: vals.y.txt ? "Y " + vals.y.txt : "", m3: vals.z.txt ? "Z " + vals.z.txt : "", pos: null, posAt: null, updatedAt: Date.now() });
        s.pos = null; s.plan = [vals.x.v, vals.y.v]; s.z = vals.z.v; s.x = vals.x.v; s.y = vals.y.v;   // the measurement is the spot
        show(i); renderStats();
      } catch (e) { st.textContent = "not saved: " + (e.code || e.message || e); }
    }
    async function resetPos(i) {
      const s = S[i]; if (!s || !OWNER) return;
      if (s.plan[0] == null || s.plan[1] == null) { alert("This device has no readable plan X/Y to go back to - its spot comes from the drawing."); return; }
      try { await patchSensor(OWNER, TASK, s.m, { pos: null, posAt: null }); s.pos = null; s.x = s.plan[0]; s.y = s.plan[1]; show(i); }
      catch (e) { alert("Couldn't reset: " + (e.code || e.message || e)); }
    }
    $("undo").addEventListener("click", () => stepMove(false));
    $("redo").addEventListener("click", () => stepMove(true));
    // Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl+Y = redo, with the map focused (a click on the map focuses it); a text box keeps its own
    cv.addEventListener("pointerdown", () => { try { cv.focus({ preventScroll: true }); } catch (_) {} });
    root.addEventListener("keydown", e => { const k = String(e.key).toLowerCase();
      if (!(e.ctrlKey || e.metaKey) || e.altKey || !(k === "z" || (k === "y" && !e.shiftKey))) return;
      if (e.target !== cv && !(e.target.closest && e.target.closest(".mapwrap"))) return;
      if (e.target.closest && e.target.closest("input,textarea,select,[contenteditable]")) return;
      e.preventDefault(); stepMove(k === "y" || e.shiftKey); });
    $("modes").addEventListener("click", e => { const b = e.target.closest("button[data-m]"); if (!b) return;
      mode = b.dataset.m; root.querySelectorAll("#rm-modes button").forEach(x => x.classList.toggle("on", x === b)); legend(); draw(); });
    // LIVE FIND (L 2026-10-02: "when I type a radar number have it highlight in real time"): every keystroke rings the
    // sensors whose number starts with what's typed (yellow); an exact number also flies there and opens its card.
    const centerOn = (i, minZoom) => { const s = S[i]; cvw.centerOn(X(s), Y(s), minZoom); };
    // FIND ANY DEVICE (L 2026-10-27 "can the search represent the device in the open map not just sensors"): the same box rings the
    // devices on the map showing whose id starts with what's typed (cameras 142, speakers SP-11, burg points); one match / an exact
    // id flies there and opens its card. Sensors keep their number search below.
    const findKey = v => String(v || "").toLowerCase().replace(/[\s#-]/g, "");
    $("find").addEventListener("input", e => {
      const q = findKey(e.target.value); HLD = new Set();
      if (q && cvw.fitted && layout === "floor") {
        const hits = devShown().filter(d => findKey(devId(d.r)).startsWith(q)); hits.forEach(d => HLD.add(d.listId + "/" + d.rowId));
        const exact = hits.find(d => findKey(devId(d.r)) === q);
        const one = exact && (hits.length === 1 || q.length >= 3) ? exact : hits.length === 1 ? hits[0] : null;
        if (one) { cvw.centerOn(...rotXY(one.x, one.y), 4); showDev(one); }
        if (hits.length && !/^\d+$/.test(q)) { HL = new Set(); draw(); return; }   // letters = a device id, not a sensor #
      }
      const t = e.target.value.replace(/\D/g, ""); HL = new Set();
      if (!t || !cvw.fitted) { draw(); return; }
      S.forEach((s, i) => { if (String(s.m).startsWith(t)) HL.add(i); });
      const i = S.findIndex(s => s.m === Number(t));
      if (i >= 0 && (HL.size === 1 || t.length >= 3)) { centerOn(i, 4); show(i); } else draw();
    });
    // NEXT / PREVIOUS SENSOR from the card (L 2026-10-05 "on mobile a left and right swipe that takes me to the next or previous
    // sensor"): swipe the card left = next, right = previous (by sensor #); the ‹ › buttons do the same on a desktop. A swipe
    // that starts on a field, button or the photo strip is left alone (typing, tapping, scrolling photos).
    const goSensor = d => { if (sel < 0 || selHub) return; const i = sel + d; if (i < 0 || i >= S.length) return; centerOn(i); show(i); };
    $("info").addEventListener("click", e => { const b = e.target.closest(".rm-nav"); if (b) goSensor(Number(b.dataset.nav)); });
    let swipe = null;
    $("info").addEventListener("touchstart", e => { swipe = null; if (sel < 0 || selHub || e.touches.length !== 1 || e.target.closest("input,textarea,select,button,.photos")) return;
      swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
    $("info").addEventListener("touchend", e => { if (!swipe) return; const c = e.changedTouches[0], dx = c.clientX - swipe.x, dy = c.clientY - swipe.y; swipe = null;
      if (Math.abs(dx) >= 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) goSensor(dx < 0 ? 1 : -1); }, { passive: true });
    $("find").addEventListener("change", e => { const i = S.findIndex(s => s.m === Number(e.target.value)); if (i < 0) return; centerOn(i, 4); show(i); });
    // ZOOM BUTTONS (L 2026-10-03 "add a zoom and unzoom button onscreen"): 1.6x per tap, about the centre of the view
    $("zin").addEventListener("click", () => cvw.zoomAt(cv.width / 2, cv.height / 2, 1.6));
    $("zout").addEventListener("click", () => cvw.zoomAt(cv.width / 2, cv.height / 2, 1 / 1.6));
    // TRIPLE TAP / TRIPLE CLICK = rotate 90 deg (L 2026-10-06 "can I have a triple click rotate the map"): three quick taps
    // close together on the map; counted by hand so it works on phones too (tap counts in event.detail are unreliable there)
    let taps = [];
    cv.addEventListener("pointerup", e => { const now = e.timeStamp;
      taps = taps.filter(t => now - t.t < 600 && Math.hypot(t.x - e.clientX, t.y - e.clientY) < 30); taps.push({ t: now, x: e.clientX, y: e.clientY });
      if (taps.length >= 3) { taps = []; $("rot").click(); } });
    $("rot").addEventListener("click", () => { ROT = (ROT + 90) % 360; try { localStorage.setItem("rm-rot", String(ROT)); } catch (_) {}
      $("rot").title = `Rotated ${ROT}° - tap to turn again`; if (layout === "floor") fit(false); });
    $("planpick").addEventListener("change", e => usePlan(e.target.value));   // a dropdown (L 2026-10-27 "where it says key map that should be a dropdown")
    $("plan").addEventListener("click", () => { planMode = planMode === "dim" ? "full" : planMode === "full" ? "off" : "dim";
      try { localStorage.setItem("rm-plan-mode", planMode); } catch (_) {} planLabel(); draw(); });
    // ---------- SET PLAN (L 2026-10-05 "1 and 2"): any Site Image (or a file) becomes this job's floor plan ----------
    // Same storage + model as the Walmart 54 key map (telaid-data saveFloorPlan: tasks_plans/<record>/floorPlan, plan
    // feet = (x0 + u/k, y0 - v/k)). The fit comes from two sensors tapped on the drawing, against their plan X/Y
    // (m1/m2) - no rotation, one scale: drawings are square to the building.
    const SP = { img: null, w: 0, h: 0, name: "", a: null, b: null, t: "a", fit: null };
    const spMsg = t => { $("spmsg").textContent = t; };
    async function spUse(blob, name) {
      spMsg("Preparing the drawing\u2026");
      const small = await resizeImage(blob, 2400);   // the plan lives in the database - keep it ~1 MB
      const url = await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(small); });
      const im = new Image(); await new Promise((ok, no) => { im.onload = ok; im.onerror = no; im.src = url; });
      Object.assign(SP, { img: url, w: im.naturalWidth, h: im.naturalHeight, name, a: null, b: null, t: "a", fit: null });
      $("spimg").src = url; $("spfit").hidden = false; spPins(); spCalc();
      spMsg(`${name} \u00b7 ${SP.w}\u00d7${SP.h} px`);
    }
    function spPins() {
      $("spstage").querySelectorAll(".pin").forEach(x => x.remove());
      for (const t of ["a", "b"]) { const p = SP[t]; if (!p) continue; const d = document.createElement("i"); d.className = "pin " + t; d.textContent = t.toUpperCase();
        d.style.left = (p.u / SP.w * 100) + "%"; d.style.top = (p.v / SP.h * 100) + "%"; $("spstage").appendChild(d); }
      root.querySelectorAll("#rm-sp .tgt").forEach(x => x.classList.toggle("on", x.dataset.t === SP.t));
    }
    function spCalc() {
      SP.fit = null; $("spsave").disabled = true;
      const ma = Number($("spa").value), mb = Number($("spb").value);
      const A = S.find(s => s.m === ma), B2 = S.find(s => s.m === mb);
      if (!SP.a || !SP.b || !A || !B2 || ma === mb) { $("spcalc").textContent = (ma && !A) || (mb && !B2) ? "that device # has no plan X/Y" : ""; return; }
      const [XA, YA] = A.plan, [XB, YB] = B2.plan;
      const dpx = Math.hypot(SP.b.u - SP.a.u, SP.b.v - SP.a.v), dft = Math.hypot(XB - XA, YB - YA);
      if (dpx < 20 || dft < 5) { $("spcalc").textContent = "pick two devices further apart"; return; }
      const k = dpx / dft;
      const x0 = ((XA - SP.a.u / k) + (XB - SP.b.u / k)) / 2, y0 = ((YA + SP.a.v / k) + (YB + SP.b.v / k)) / 2;
      // how square the drawing is to the plan: compare the tap direction with the plan direction
      const ang = Math.abs(Math.atan2(-(SP.b.v - SP.a.v), SP.b.u - SP.a.u) - Math.atan2(YB - YA, XB - XA)) * 180 / Math.PI;
      const off = Math.min(ang, 360 - ang);
      SP.fit = { k: +k.toFixed(5), x0: +x0.toFixed(2), y0: +y0.toFixed(2), ma, mb };
      $("spcalc").textContent = `${k.toFixed(2)} px/ft` + (off > 4 ? ` \u00b7 \u26a0 ${off.toFixed(0)}\u00b0 off square - check the two taps` : " \u00b7 square \u2713");
      $("spsave").disabled = false;
    }
    $("setplan").addEventListener("click", async () => {
      if (!OWNER || RO()) { alert(RO() ? "This is a shared (read-only) copy - the floor plan is set from the sharer's account." : "Open a site first."); return; }
      $("sp").hidden = false; $("spfit").hidden = true; $("spthumbs").innerHTML = '<span class="muted">loading site images\u2026</span>';
      spMsg("1. Pick one of this job's Site Images, or a file.");
      try {
        const items = (await listPhotos(OWNER, TASKREC, "siteImages")).filter(it => /\.(png|jpe?g|webp)$/i.test(it.name));
        if (!items.length) { $("spthumbs").innerHTML = '<span class="muted">This job has no Site Images (onlinedetails \u2192 Site Images) - choose a file instead.</span>'; return; }
        const urls = await Promise.all(items.map(photoUrl));
        $("spthumbs").innerHTML = urls.map((u, i) => `<img src="${esc(u)}" data-i="${i}" title="${esc(items[i].name)}" alt="">`).join("");
        $("spthumbs").onclick = async e => { const t = e.target.closest("img[data-i]"); if (!t) return;
          $("spthumbs").querySelectorAll("img").forEach(x => x.classList.toggle("on", x === t));
          try { await spUse(await (await fetch(urls[+t.dataset.i])).blob(), items[+t.dataset.i].name); } catch (err) { spMsg("Could not load that image: " + (err.message || err)); } };
      } catch (err) { $("spthumbs").innerHTML = `<span class="muted">Could not list Site Images (${esc(err.code || err.message || err)}) - choose a file instead.</span>`; }
    });
    $("spclose").addEventListener("click", () => { $("sp").hidden = true; });
    $("spfile").addEventListener("change", e => { const f = e.target.files[0]; if (f) spUse(f, f.name).catch(err => spMsg("Could not read that file: " + (err.message || err))); });
    root.querySelectorAll("#rm-sp .tgt").forEach(b => { const pick = e => { e.preventDefault(); SP.t = b.dataset.t; SP.picked = true; spPins(); spMsg(`${SP.name} \u00b7 tap the drawing to place ${SP.t.toUpperCase()}`); };
      b.addEventListener("pointerup", pick); b.addEventListener("click", pick); });
    $("spa").addEventListener("input", spCalc); $("spb").addEventListener("input", spCalc);
    // TAP = pointerdown + pointerup within 10 px (L 2026-10-05 "when I tap to place the a and b it doesn't work": the
    // click event never reached the image on his device). A drag still scrolls the drawing.
    let spDown = null;
    $("spimg").addEventListener("pointerdown", e => { spDown = { x: e.clientX, y: e.clientY }; });
    $("spimg").addEventListener("pointerup", e => { if (!spDown || Math.hypot(e.clientX - spDown.x, e.clientY - spDown.y) > 10) { spDown = null; return; } spDown = null;
      const r = $("spimg").getBoundingClientRect(); if (!r.width || !SP.w) return;
      // both pins down: the tap moves whichever pin is NEARER (L 2026-10-05 "after A is placed I can't go back to move it")
      if (SP.a && SP.b && !SP.picked) { const d = q => Math.hypot(r.left + q.u / SP.w * r.width - e.clientX, r.top + q.v / SP.h * r.height - e.clientY); SP.t = d(SP.a) <= d(SP.b) ? "a" : "b"; }
      SP[SP.t] = { u: Math.max(0, Math.min(SP.w, (e.clientX - r.left) / r.width * SP.w)), v: Math.max(0, Math.min(SP.h, (e.clientY - r.top) / r.height * SP.h)) };
      const placed = SP.t.toUpperCase(); SP.picked = false; if (SP.t === "a" && !SP.b) SP.t = "b"; spPins(); spCalc();
      spMsg(`${SP.name} \u00b7 ${placed} placed${SP.a && SP.b ? " - both set; tap near a pin to move it (or pick A / B first)" : " - now tap where device B is"}`); });
    $("spimg").addEventListener("dragstart", e => e.preventDefault());
    $("spsave").addEventListener("click", async () => {
      if (!SP.fit || !SP.img) return;
      if (PLAN && !confirm("This job already has a floor plan. Replace it?")) return;
      $("spsave").disabled = true; spMsg("Saving\u2026");
      const meta = { at: Date.now(), w: SP.w, h: SP.h, k: SP.fit.k, x0: SP.fit.x0, y0: SP.fit.y0, bytes: SP.img.length,
        src: `${SP.name}, fitted on marks ${SP.fit.ma},${SP.fit.mb} (set in the Radar Map)` };
      try { await saveFloorPlan(OWNER, TASK, meta, SP.img); $("sp").hidden = true; planMode = "dim"; planPick = "main"; load(auth.currentUser); }
      catch (err) { spMsg("Save failed: " + (err.code || err.message || err)); $("spsave").disabled = false; }
    });
    $("hubs").addEventListener("click", e => { const b = e.target.closest("button[data-h]"); if (b) showHub(b.dataset.h); });
    $("views").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (!b) return;
      if (b.dataset.v === "wiring" && !TABLES) { alert("The wiring view needs a site plan (zones, IDF per device, switches) on this job's record - this site has none yet."); return; }
      layout = b.dataset.v; root.querySelectorAll("#rm-views button").forEach(x => x.classList.toggle("on", x === b)); fit(false); });
    async function loadJobs(user) {   // same one-row-per-site list as the checklist (telaid-data groupSites)
      const selEl = $("job"); if (EMBED || !user || !selEl) return;
      const { sites } = await listSites(user);
      if (!sites.length) { selEl.innerHTML = '<option value="">No jobs found</option>'; return; }
      let cur = sites.find(g => g.ids.includes(TASK));
      // the remembered job isn't in this account's list (Account dropdown switched trees): open its first job with sensors
      if (!cur) { cur = sites.find(g => g.hasSensors) || sites[0]; if (cur) setTaskId(cur.id); }
      JOBS = sites; renderJobs();
      if (cur && cur.id !== TASK) setTaskId(cur.id);   // a sibling-night id -> the site's canonical record
    }
    // JOB SEARCH (L 2026-10-05 "add search filter for map job select dropdown"): every word typed must appear in the row
    // (customer, project, the visit count). The open job stays in the list even when it doesn't match, so the select never
    // jumps; one match while typing opens it.
    let JOBS = [];
    function renderJobs() {
      const selEl = $("job"); if (!selEl) return;
      const words = ($("jobq").value || "").toLowerCase().split(/\s+/).filter(Boolean);
      const cur = JOBS.find(g => g.ids.includes(TASK));
      const hits = JOBS.filter(g => g === cur || words.every(w => `${g.label}`.toLowerCase().includes(w)));
      const n = hits.filter(g => g !== cur).length;
      selEl.innerHTML = (words.length ? `<option value="" disabled>${n} match${n === 1 ? "" : "es"} for "${esc(words.join(" "))}"</option>` : "")
        + hits.map(g => `<option value="${g.id}"${cur === g ? " selected" : ""}>${esc(g.label)}</option>`).join("");
      return hits.filter(g => g !== cur);
    }
    $("jobq").addEventListener("input", () => { const only = renderJobs();
      if (only && only.length === 1 && $("jobq").value.trim().length >= 2) { $("job").value = only[0].id; $("job").dispatchEvent(new Event("change")); } });
    $("job").addEventListener("change", e => { const t = e.target.value; if (!t) return;
      try { localStorage.setItem("sensorTask", JSON.stringify({ task: t, name: e.target.selectedOptions[0].text, at: Date.now() })); } catch (_) {}
      try { const u = new URL(location.href); u.searchParams.set("task", t); history.replaceState(null, "", u); } catch (_) {}
      setTaskId(t); HL = new Set(); $("find").value = ""; $("info").innerHTML = '<span class="muted">Tap a device to see its details.</span>';
      load(auth.currentUser); });
    legend(); fit();
    onAuthStateChanged(auth, async u => { await loadJobs(u); load(u); });   // jobs first: a sibling-night id gets swapped for the canonical one before the data read
    return {
      setTask(t) { if (!t || String(t) === TASK) return; setTaskId(t); $("info").innerHTML = '<span class="muted">Tap a device to see its details.</span>'; load(auth.currentUser); },
      refit: fit,
    };
  
}
