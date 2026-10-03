// telaid-data.js - THE data layer for the Telaid apps (L 2026-10-02: "what's the best way to structure all the
// Telaid apps?" -> "one data layer, thin pages" -> "start with the data layer"). This is the only file that knows
// the Firebase shape. Pages and modules import it; a path change is one edit here.
//
//   {owner}/tasks/<id>                       the job record (customerName, project, startTime, notes, sensorMeta ...)
//   {owner}/tasks/<id>/sensorMeta/<mark>     {serial, m1 "X ..", m2 "Y ..", m3 "Z ..", labeledAt, runDoneAt, updatedAt}
//   Storage {owner}/tasks/images/<proj>/sensors        <prefix>_<NN>-<serial>[_n].jpg   (device photos, 2 per sensor)
//   Storage {owner}/tasks/images/<proj>/MDF|IDF1..IDF6  site photos        /deliverables, /Materials, /Install ...
//
// owner = the signed-in uid, falling back to the Telaid uid (shared crew data). "public" is the signed-out tree.
// One row per SITE: many job records share a customer+project (one per night); the canonical id is the EARLIEST
// record, picked exactly the way radar-tools' resolveMetaOwnerTaskId() does, so checklist, map and photos agree.
// Migration plan: radarMap.js uses this now; radar-tools / sensor-lookup / dashboard move over a section at a time.
import { auth, database, storage, ref, get, update, storageRef, listAll, uploadBytes, getDownloadURL, onAuthStateChanged }
  from "../../../assets/js/firebase-init.js";

export const TELAID_UID = "SDN0vKPQ1qfN5vxkvhR3auVhDYq1";
export const SENSOR_PHOTOS_REQUIRED = 2;
export const HUBS = ["MDF", "IDF1", "IDF2", "IDF3", "IDF4", "IDF5", "IDF6"];
export const hubLabel = h => h === "MDF" ? "MDF" : "IDF " + h.slice(3);

// ---------- names ----------
export const clean = v => String(v || "").trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");   // = radar-tools sanitize()
export const normKey = s => String(s || "").trim().toLowerCase();
export const bestTime = (task, id) => Math.max(Number(task?.updatedAt) || 0, Number(task?.createdAt) || 0,
  Number(task?.startTime) || 0, Number(task?.timestamp) || 0, Number(id) || 0);
export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// "X 306'-1 1/2\"" / "-117'-4 1/2\"" -> feet (number) ; fmtFt(feet) -> 306'-1.5"
export function feet(s) {
  const t = String(s || "").replace(/^[XYZ]\s*/i, "").trim(); if (!t) return null;
  const neg = t.startsWith("-"), m = t.replace(/^-/, "").match(/(\d+)'\s*-?\s*(\d+)?(?:\s+(\d+)\/(\d+))?/);
  if (!m) return null;
  const v = Number(m[1]) + ((Number(m[2] || 0) + (m[3] ? Number(m[3]) / Number(m[4]) : 0)) / 12);
  return neg ? -v : v;
}
export const fmtFt = v => v == null ? "-" : `${Math.trunc(v)}'-${(Math.abs(v % 1) * 12).toFixed(1).replace(/\.0$/, "")}"`;

// ---------- reads ----------
export async function readOnce(path) { const s = await get(ref(database, path)); return s.exists() ? s.val() : null; }
export const ownersFor = user => [...new Set([user?.uid, TELAID_UID].filter(Boolean))];

/** All job records visible to this user: {owner, tasks} from the first tree that has any. */
export async function loadTasks(user) {
  for (const o of user ? ownersFor(user) : ["public"]) {
    try { const v = await readOnce(`${o}/tasks`); if (v) return { owner: o, tasks: v }; } catch (_) {}
  }
  return { owner: null, tasks: {} };
}

/** One row per site, newest activity first: {id (canonical = earliest record), customer, project, ids, visits,
 *  first, last, hasSensors, label}. Same grouping + canonical rule as radar-tools' populateProjects/resolveMetaOwnerTaskId. */
export function groupSites(tasks) {
  const groups = new Map();
  for (const [id, t] of Object.entries(tasks || {})) {
    if (!t || typeof t !== "object") continue;
    const customer = String(t.customerName || "").trim(), project = String(t.project || "").trim();
    if (!customer && !project) continue;
    const time = bestTime(t, id), key = normKey(customer) + "|" + normKey(project), g = groups.get(key);
    if (!g) { groups.set(key, { id, customer, project, ids: [id], visits: 1, first: time, last: time, hasSensors: !!t.sensorMeta }); continue; }
    g.visits++; g.ids.push(id); g.hasSensors = g.hasSensors || !!t.sensorMeta;
    if (time < g.first) { g.first = time; g.id = id; }
    if (time > g.last) g.last = time;
  }
  const list = [...groups.values()].sort((a, b) => b.last - a.last);
  for (const g of list) g.label = `${g.customer || "(No customer)"} — ${g.project || "(No project)"}${g.visits > 1 ? ` (${g.visits} visits)` : ""}`;
  return list;
}
export const listSites = async user => { const { owner, tasks } = await loadTasks(user); return { owner, sites: groupSites(tasks) }; };
/** The canonical (earliest) record id for whatever job id you were handed - a sibling night resolves to the site. */
export const canonicalId = (sites, id) => (sites.find(g => g.ids.includes(String(id))) || {}).id || String(id);

/** The job record + its sensorMeta, trying each owner tree: {owner, task, meta}. */
export async function loadJob(user, taskId) {
  for (const o of ownersFor(user)) {
    try { const task = await readOnce(`${o}/tasks/${taskId}`); if (task) return { owner: o, task, meta: task.sensorMeta || null }; } catch (_) {}
  }
  return { owner: null, task: null, meta: null };
}

/** sensorMeta rows -> [{m, serial, x, y, z (feet), labeledAt, runDoneAt, updatedAt}] sorted by mark. */
export const sensorRows = meta => Object.entries(meta || {}).map(([k, v]) => ({ m: Number(k), serial: v?.serial || "",
  x: feet(v?.m1), y: feet(v?.m2), z: feet(v?.m3), labeledAt: v?.labeledAt || null, runDoneAt: v?.runDoneAt || null,
  updatedAt: v?.updatedAt || null,
  pos: v?.pos && Number.isFinite(Number(v.pos.x)) && Number.isFinite(Number(v.pos.y)) ? { x: Number(v.pos.x), y: Number(v.pos.y) } : null   // as-built override (map hold-to-move); m1/m2 stay the plan
})).filter(s => s.m).sort((a, b) => a.m - b.m);

// ---------- writes (field-level: update() at the sensorMeta node never clobbers a sibling field) ----------
export const sensorMetaPath = (owner, taskId) => `${owner}/tasks/${taskId}/sensorMeta`;
/** patchSensor(owner, task, 120, {runDoneAt: Date.now()}) - flags: labeledAt / runDoneAt (ms or null), serial, m1-m3 */
export function patchSensor(owner, taskId, mark, fields) {
  const payload = {}; for (const [k, v] of Object.entries(fields)) payload[`${mark}/${k}`] = v;
  return update(ref(database, sensorMetaPath(owner, taskId)), payload);
}

// ---------- photos ----------
export const projectFolder = task => clean(task?.project || task?.customerName || "");
export const photoPrefix = task => clean(task?.customerName || task?.project || "");            // file-name prefix
export const imagesDir = (owner, task, sub) => `${owner}/tasks/images/${projectFolder(task)}/${sub}`;   // "sensors", "MDF", "IDF3", "deliverables"
/** mark number from a sensor photo name, or 0 (exact match - "_10" must not match 100-109) */
export function sensorMarkOf(name, task) {
  const pre = clean(task?.customerName || "");
  const rest = pre && name.startsWith(pre + "_") ? name.slice(pre.length + 1) : null;
  const m = rest !== null ? rest.match(/^(\d{1,4})-/) : name.match(/(?:^|_)(\d{2,4})-/);
  return m ? parseInt(m[1], 10) : 0;
}
/** Storage refs in a job folder (one list call). Throws on a network failure - callers decide how to show it. */
export const listPhotos = async (owner, task, sub) => (await listAll(storageRef(storage, imagesDir(owner, task, sub)))).items;
export const photoUrl = item => getDownloadURL(item);

// PHOTO RULES = onlinejob.html's resizeImg / stampImg (L 2026-10-03: "the banner label is still different, is it resizing
// everything the same, based on onlinejob?"). Resize: cap the width at 2048, JPEG at the browser's default quality.
// Stamp: a strip max(40 px, width/22) under the image, white Arial at 70% of the strip, shrunk until it fits 92% of the
// width, baseline a quarter-strip up from the bottom. Same numbers as the jobs app, so every photo looks the same.
export function resizeImage(file, maxW = 2048) { return new Promise((res, rej) => { const img = new Image(), u = URL.createObjectURL(file);
  img.onload = () => { let w = img.width, h = img.height; if (w > maxW) { h = h * maxW / w; w = maxW; }
    const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(u); c.toBlob(b => b ? res(b) : rej("Resize failed"), "image/jpeg"); };
  img.onerror = () => rej("Invalid image."); img.src = u; }); }
/** the label strip along the bottom - onlinejob's stampImg */
export function addLabelBar(blob, text) { return new Promise((res, rej) => { const img = new Image(), u = URL.createObjectURL(blob);
  img.onload = () => { const strip = Math.max(40, Math.round(img.width / 22)); let font = Math.round(strip * 0.7);
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height + strip; const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    g.fillStyle = "white"; g.textAlign = "center"; g.textBaseline = "alphabetic"; g.font = `${font}px Arial`;
    while (font > 12 && g.measureText(text).width > c.width * 0.92) { font -= 2; g.font = `${font}px Arial`; }
    g.fillText(text, c.width / 2, c.height - Math.round(strip * 0.25));
    URL.revokeObjectURL(u); c.toBlob(b => b ? res(b) : rej("Markup failed"), "image/jpeg"); };
  img.onerror = () => rej("Invalid image."); img.src = u; }); }
export async function uniqueName(dir, name) {
  const dot = name.lastIndexOf("."), b = name.slice(0, dot), ext = name.slice(dot); let n = 0;
  for (;;) { const t = n ? `${b}_${n}${ext}` : name;
    try { await getDownloadURL(storageRef(storage, `${dir}/${t}`)); n++; }
    catch (e) { if (e?.code === "storage/object-not-found") return t; throw e; } }
}
/** Upload one photo the radar-tools way: resize -> label bar -> unique name -> Storage. Returns the new ref. */
export async function uploadPhoto({ owner, task, sub, file, name, label }) {
  let blob = await resizeImage(file, 2048);
  if (label) blob = await addLabelBar(blob, label);
  const dir = imagesDir(owner, task, sub), fn = await uniqueName(dir, name), r = storageRef(storage, `${dir}/${fn}`);
  await uploadBytes(r, blob, { contentType: "image/jpeg" });
  return r;
}
/** A device photo for sensor <mark>: "<prefix>_NN-serial.jpg", bar "<customer> NN - serial". */
export const uploadSensorPhoto = ({ owner, task, mark, serial, file, bar = true }) => { const nn = String(mark).padStart(2, "0");
  return uploadPhoto({ owner, task, sub: "sensors", file, name: `${photoPrefix(task)}_${nn}-${clean(serial)}.jpg`,
    label: bar ? `${String(task?.customerName || task?.project || "").trim()} ${nn} - ${clean(serial)}` : null }); };
/** A site photo for MDF / IDFn: "YYYY_MM_DD_<prefix>_<hub>.jpg", bar "<customer> IDF n". */
export const uploadHubPhoto = ({ owner, task, hub, file, bar = true }) => { const d = new Date(),
  stamp = `${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, "0")}_${String(d.getDate()).padStart(2, "0")}`;
  return uploadPhoto({ owner, task, sub: hub, file, name: `${stamp}_${photoPrefix(task)}_${hub}.jpg`,
    label: bar ? `${String(task?.customerName || task?.project || "").trim()} ${hubLabel(hub)}` : null }); };

// ---------- the SITE PLAN: {owner}/tasks/<canonical>/siteTables = {zones, idf, switches, maxPerSwitch} ----------
// L 2026-10-02: "site tables into Firebase so new sites need no code". A site's plan is read off its task record;
// the table below is only the built-in fallback for Walmart 54 (seeded to Firebase the same day).
//   zones: [[fromMark, toMark, zone], ...]      idf: one digit per mark ("6666...": mark 1 -> IDF 6)
//   switches: {idf: [switch#, switch#, "new"]}  ("new" = a switch still needed)   maxPerSwitch: 18
// Walmart 54 (Springdale AR, PRJTASK33620857): zone + IDF per mark (same tables as sensor-lookup), switch map L gave
// on site 2026-10-02; <= 18 sensors per switch -> IDF 2 and IDF 5 each need a 3rd ("new").
export const SITE_TABLES = {
  "1789898400000": {
    zones: [[1, 10, 1], [11, 75, 2], [76, 141, 3], [142, 203, 4], [204, 241, 5]],
    idf: "6666666666666666665566666555655566611555551111155551111111555551111115555551111115554455441111555544411115555441111144454444441154444444441334441444443334444443334224222333322222222332232222233332222233322222333322222333322233333223322333333",
    switches: { 1: [3, 6, 10], 2: [1, 11, "new"], 3: [5, 9, 15], 4: [4, 7, 13], 5: [8, 12, "new"], 6: [2, 14] },
    maxPerSwitch: 18,
    // cabinet positions in plan feet, read off the key map's blue squares (2026-10-02)
    hubs: { MDF: [314.3, 353.2], IDF1: [117.9, 164.8], IDF2: [36.8, 373.1], IDF3: [211.4, 373.4], IDF4: [36.8, 250.2], IDF5: [199.4, 118.1], IDF6: [36.6, 46.4] },
  },
};
export const siteTables = taskId => SITE_TABLES[String(taskId)] || null;
/** Firebase hands back {1:..,6:..} as a sparse array; make zones/switches plain again and drop empties. */
export function normalizeTables(t) {
  if (!t || typeof t !== "object" || !t.idf) return null;
  const sw = {};
  for (const [k, v] of Object.entries(t.switches || {})) if (v && typeof v === "object") sw[k] = Object.values(v).filter(x => x != null);
  const zones = Object.values(t.zones || {}).filter(z => z && typeof z === "object").map(z => Object.values(z).map(Number));
  const hubs = {}; for (const [k, v] of Object.entries(t.hubs || {})) if (v && typeof v === "object") { const a = Object.values(v).map(Number); if (a.length >= 2 && a.every(Number.isFinite)) hubs[k] = [a[0], a[1]]; }
  return { zones, idf: String(t.idf), switches: sw, maxPerSwitch: Number(t.maxPerSwitch) || 18, hubs: Object.keys(hubs).length ? hubs : null };
}
/** The plan for a job: the task record's siteTables (Firebase) first, the built-in table as fallback. .from says which. */
export function tablesFor(task, taskId) {
  const fb = normalizeTables(task?.siteTables);
  if (fb) return Object.assign(fb, { from: "firebase" });
  const code = siteTables(taskId);
  return code ? Object.assign({ ...code }, { from: "built-in" }) : null;
}
/** Move a cabinet marker (plan feet) - field-level under siteTables/hubs so the rest of the plan stays. */
export const saveHubPos = (owner, taskId, hub, xy) => update(ref(database, `${owner}/tasks/${taskId}/siteTables/hubs`), { [hub]: [Number(xy[0]), Number(xy[1])] });
/** Save a plan onto the task record (field-level, so nothing else on the task moves). */
export const saveSiteTables = (owner, taskId, tables) => update(ref(database, `${owner}/tasks/${taskId}`), { siteTables: tables });
export const zoneOf = (tables, m) => tables ? (tables.zones.find(([a, b]) => m >= a && m <= b) || [])[2] ?? null : null;
export const idfOf = (tables, m) => tables ? Number(tables.idf[m - 1]) || null : null;

// ---------- FLOOR PLAN (L 2026-10-02 "can we put the map floorplan in the map background?") ----------
// {owner}/tasks_plans/<canonical>/floorPlanMeta = {at, w, h, k (px per foot), x0, y0 (plan feet at the image's
// top-left), bytes, src} and .../floorPlan/img = a data URL. Image px (u,v) -> plan feet (x0 + u/k, y0 - v/k).
// It lives OUTSIDE tasks/ so the checklist's site-list read never pulls the image, and in the DATABASE (not Storage)
// because the store Wi-Fi blocks Storage. The image is cached per device (localStorage) by its `at` stamp.
export const planPath = (owner, taskId) => `${owner}/tasks_plans/${taskId}`;
export async function loadFloorPlan(owner, taskId) {
  const meta = await readOnce(`${planPath(owner, taskId)}/floorPlanMeta`); if (!meta || !meta.k) return null;
  const key = `rm-plan-${taskId}`; let img = null;
  try { const c = JSON.parse(localStorage.getItem(key) || "null"); if (c && c.at === meta.at && c.img) img = c.img; } catch (_) {}
  if (!img) { img = await readOnce(`${planPath(owner, taskId)}/floorPlan/img`); if (!img) return null;
    try { localStorage.setItem(key, JSON.stringify({ at: meta.at, img })); } catch (_) {} }
  return { ...meta, img };
}
export const saveFloorPlan = (owner, taskId, meta, img) => update(ref(database, planPath(owner, taskId)), { floorPlanMeta: meta, "floorPlan/img": img });

// ---------- the signed-in user line every Telaid header shows ----------
/** Same text radar-tools puts in #firebaseStatus: the email, or "Sign in to edit". */
export const userLine = user => user ? (user.email || user.displayName || user.uid) : "Sign in to edit";
export { auth, database, storage, ref, get, update, storageRef, listAll, uploadBytes, getDownloadURL, onAuthStateChanged };
