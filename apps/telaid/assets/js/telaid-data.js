// telaid-data.js - THE data layer for the Telaid apps (L 2026-10-02: "what's the best way to structure all the
// Telaid apps?" -> "one data layer, thin pages" -> "start with the data layer"). This is the only file that knows
// the Firebase shape. Pages and modules import it; a path change is one edit here.
//
//   {owner}/tasks/<id>                       the job record (customerName, project, startTime, notes, sensorMeta ...)
//   {owner}/tasks/<id>/lists/<listId>        a device list named "Sensors" (2026-10-04): row = {id: "<mark>", mark, serial,
//                                            m1 "X ..", m2 "Y ..", m3 "Z ..", notes, images[], counted, labeledAt?, runDoneAt?, pos?, posAt?, updatedAt?}
//   {owner}/tasks/<id>/sensorMeta/<mark>     the LEGACY sheet {serial, m1, m2, m3, labeledAt, runDoneAt, updatedAt} - read when a task has
//                                            no Sensors list, and MIRRORED on every write while the SES apps still read it
//   Storage {owner}/tasks/images/<proj>/sensors        <prefix>_<NN>-<serial>[_n].jpg   (device photos, 2 per sensor)
//   Storage {owner}/tasks/images/<proj>/MDF|IDF1..IDF6  site photos        /deliverables, /Materials, /Install ...
//
// owner = the signed-in uid, falling back to the Telaid uid (shared crew data). "public" is the signed-out tree.
// One row per SITE: many job records share a customer+project (one per night); the canonical id is the EARLIEST
// record, picked exactly the way radar-tools' resolveMetaOwnerTaskId() does, so checklist, map and photos agree.
// Migration plan: radarMap.js uses this now; radar-tools / sensor-lookup / dashboard move over a section at a time.
import { auth, database, storage, ref, get, set, update, onValue, storageRef, listAll, uploadBytes, getDownloadURL, deleteObject, onAuthStateChanged }
  from "../../../assets/js/firebase-init.js";
import { resizeImg, stampImg } from "../../../assets/js/imgupload.js?v=20261003a";

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
  // forgiving (L 2026-10-05 "can I load old radar jobs like the old navy"): the Old Navy sheets wrote 37’1” (curly),
  // 12.3 / 42.10 (feet.inches), 11' / 13’ (feet only) and "J - 47' 8"" (measured off grid line J - the letter is kept by
  // gridRef(), the number is the offset). Walmart 54's X 85'-10 1/2" form reads as before.
  let t = String(s || "").replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"').replace(/^[XYZ]\s*/i, "").trim();
  t = t.replace(/^[A-Z]{1,2}\s*[-:]?\s*(?=-?\d)/i, "").trim(); if (!t) return null;
  const neg = t.startsWith("-"); t = t.replace(/^-/, "");
  let v = null, m = t.match(/(\d+)'\s*-?\s*(\d+)?(?:\s+(\d+)\/(\d+))?/);
  if (m) v = Number(m[1]) + ((Number(m[2] || 0) + (m[3] ? Number(m[3]) / Number(m[4]) : 0)) / 12);
  else if ((m = t.match(/^(\d+)\.(\d{1,2})$/)) && Number(m[2]) <= 11) v = Number(m[1]) + Number(m[2]) / 12;   // 42.10 = 42'10"
  else if ((m = t.match(/^(\d+(?:\.\d+)?)$/))) v = Number(m[1]);
  return v == null ? null : neg ? -v : v;
}
export const gridRef = s => { const m = String(s || "").trim().match(/^([A-Z]{1,2})\s*[-:]?\s*(?=-?\d)/i); return m && !/^[XYZ]$/i.test(m[1]) ? m[1].toUpperCase() : null; };
export const fmtFt = v => v == null ? "-" : `${Math.trunc(v)}'-${(Math.abs(v % 1) * 12).toFixed(1).replace(/\.0$/, "")}"`;

// ---------- reads ----------
export async function readOnce(path) { const s = await get(ref(database, path)); return s.exists() ? s.val() : null; }
// SHARE (L 2026-10-03 "when I press share I just want a mirror of what's there, to the share branch"): the Jobs app's
// Share button mirrors a job into share/tasks/<id> (origin shape + sharedBy/sharedByName/sharedAt), share/tasks_plans/<id>
// and share/photos/<project>/<sub> = [{name, url}] download links. Any signed-in account reads share/*, so it is the LAST
// tree these tools look in - ?task=<id> then works for anyone. A shared copy is read-only here (no uploads, flags, moves).
export const SHARE_ROOT = "share";
export const isShared = owner => owner === SHARE_ROOT;
// ACCOUNT PICKER (L 2026-10-05 "the map opens the telaid firebase node, can I get a dropdown to select user, would only work
// with luis account" / "for all Telaid apps"): signed in as Luis, the header's Account dropdown picks whose tree every Telaid
// page reads + writes (rules let Luis into every uid). Anyone else: their own tree as before. Kept per device.
export const LUIS_UID = "7cIh8rrhVNOjjj5CBDgb3IlqzEh2", TECH_UID = "YHIJWVQOmefgigMVCcvueIZidze2";
export const ACCOUNTS = [[LUIS_UID, "Luis (signed in)"], [TELAID_UID, "Telaid - lcurbelo"], [TECH_UID, "Telaid - tech (telaid@telaid.com)"]];
export function pickedOwner(user) {
  if (!user || user.uid !== LUIS_UID) return null;
  // no "default" (L 2026-10-05): nothing picked = the account you are signed in as; the browser keeps the last pick
  try { const v = localStorage.getItem("telaidOwner"); return ACCOUNTS.some(a => a[0] === v) ? v : LUIS_UID; } catch (_) { return LUIS_UID; }
}
export const treeFor = user => pickedOwner(user) || (user ? user.uid : "public");
export const ownersFor = user => { const p = pickedOwner(user); return p ? [p, SHARE_ROOT] : [...new Set([user?.uid, TELAID_UID, SHARE_ROOT].filter(Boolean))]; };

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
  function metaRank(t) { return (t && (t.sensorMeta || t.lists || t.qcData_radar || t.qcData_remote)) ? 0 : 1e15; }   // the record holding the data wins over an empty night, whatever the edit times (2026-10-05)
  const groups = new Map();
  for (const [id, t] of Object.entries(tasks || {})) {
    if (!t || typeof t !== "object") continue;
    const customer = String(t.customerName || "").trim(), project = String(t.project || "").trim();
    if (!customer && !project) continue;
    const time = bestTime(t, id), key = normKey(customer) + "|" + normKey(project), g = groups.get(key);
    const own = time + metaRank(t);
    if (!g) { groups.set(key, { id, customer, project, ids: [id], visits: 1, first: time, last: time, own, hasSensors: !!t.sensorMeta || !!sensorsListOf(t) }); continue; }
    g.visits++; g.ids.push(id); g.hasSensors = g.hasSensors || !!t.sensorMeta || !!sensorsListOf(t);
    if (time < g.first) g.first = time;
    if (own < g.own) { g.own = own; g.id = id; }
    if (time > g.last) g.last = time;
  }
  const list = [...groups.values()].sort((a, b) => b.last - a.last);
  for (const g of list) g.label = `${g.customer || "(No customer)"} — ${g.project || "(No project)"}${g.visits > 1 ? ` (${g.visits} visits)` : ""}`;
  return list;
}
export const listSites = async user => { const { owner, tasks } = await loadTasks(user); return { owner, sites: groupSites(tasks) }; };
/** The canonical (earliest) record id for whatever job id you were handed - a sibling night resolves to the site. */
export const canonicalId = (sites, id) => (sites.find(g => g.ids.includes(String(id))) || {}).id || String(id);

// ---------- THE SENSORS LIST (L 2026-10-04 "direct device data to the current lists") ----------
// The rows live in a device list named "Sensors" on the canonical task, in the Jobs app's row shape, so sensors are
// devices like any other (notes, photos on the row, counted). sensorMetaOf() hands the list back in the sensorMeta
// shape every reader already knows ({mark: {serial, m1, m2, m3, labeledAt, runDoneAt, pos, posAt, updatedAt, _row}});
// a task without a list still reads its sensorMeta sheet. Writes go to the row only (sheet retired 2026-10-05); a task
// with no list still writes its sheet.
const LIST_RESERVED = new Set(["_name", "createdAt", "meta", "items"]);
export const isSensorsList = l => String(l?._name || "").trim().toLowerCase() === "sensors";
export function sensorsListOf(task) { for (const [listId, l] of Object.entries(task?.lists || {})) if (l && typeof l === "object" && isSensorsList(l)) return { listId, list: l }; return null; }
export const markOf = r => Number(r?.mark ?? r?.id ?? r?.label) || 0;
export function sensorMetaOf(task) {
  const sl = sensorsListOf(task); if (!sl) return task?.sensorMeta || null;
  const meta = {};
  for (const [rowId, r] of Object.entries(sl.list)) { if (LIST_RESERVED.has(rowId) || !r || typeof r !== "object") continue; const m = markOf(r); if (m) meta[m] = { ...r, _row: rowId }; }
  return meta;
}
const rowIndex = new Map();   // `${owner}/${taskId}` -> {listId, rows: {mark: rowId}} | null (no list)
export function indexSensors(owner, taskId, task) {
  const sl = sensorsListOf(task), key = `${owner}/${taskId}`;
  if (!sl) { rowIndex.set(key, null); return null; }
  const rows = {}; for (const [rowId, r] of Object.entries(sl.list)) { if (LIST_RESERVED.has(rowId) || !r || typeof r !== "object") continue; const m = markOf(r); if (m) rows[m] = rowId; }
  const ix = { listId: sl.listId, rows }; rowIndex.set(key, ix); return ix;
}
export async function sensorIndex(owner, taskId) { const key = `${owner}/${taskId}`; if (!rowIndex.has(key)) indexSensors(owner, taskId, await readOnce(`${owner}/tasks/${taskId}`)); return rowIndex.get(key); }
export const sensorRowPath = (owner, taskId, ix, rowId) => `${owner}/tasks/${taskId}/lists/${ix.listId}/${rowId}`;
/** The job record + its sensors (list first, sheet as fallback), trying each owner tree: {owner, task, meta, index}. */
export async function loadJob(user, taskId) {
  for (const o of ownersFor(user)) {
    try { const task = await readOnce(`${o}/tasks/${taskId}`); if (task) return { owner: o, task, meta: sensorMetaOf(task), index: indexSensors(o, taskId, task) }; } catch (_) {}
  }
  return { owner: null, task: null, meta: null, index: null };
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
export async function patchSensor(owner, taskId, mark, fields) {
  if (isShared(owner)) throw new Error("Shared copy - read-only.");
  const ix = await sensorIndex(owner, taskId), writes = [];
  if (ix) {   // the Sensors list row (made on the spot for a mark the list does not have yet)
    let rowId = ix.rows[mark];
    if (!rowId) { rowId = String(Date.now()); await set(ref(database, sensorRowPath(owner, taskId, ix, rowId)), { id: String(mark), mark: Number(mark), serial: "", m1: "", m2: "", m3: "", notes: "", images: [], counted: false }); ix.rows[mark] = rowId; }
    writes.push(update(ref(database, sensorRowPath(owner, taskId, ix, rowId)), fields));
  }
  // THE SHEET IS RETIRED (L 2026-10-05 "step 5, go"): a job with a Sensors list saves to the list ONLY - every reader is
  // list-first now and all 28 sheets were checked into their lists the same day (sheets stay as a frozen backup). A job
  // with no list yet (e.g. a brand-new site record) still keeps its data in its sheet, so nothing is ever written nowhere.
  if (!ix) { const payload = {}; for (const [k, v] of Object.entries(fields)) payload[`${mark}/${k}`] = v;
    writes.push(update(ref(database, sensorMetaPath(owner, taskId)), payload)); }
  await Promise.all(writes);
}
/** A photo onto the sensor's row (images[] entry the Jobs app / Details / Gallery understand) - no-op without a list. */
export async function linkSensorPhoto(owner, taskId, mark, entry) {
  const ix = await sensorIndex(owner, taskId); if (!ix) return false;
  const rowId = ix.rows[mark]; if (!rowId) return false;
  const p = `${sensorRowPath(owner, taskId, ix, rowId)}/images`, cur = await readOnce(p), arr = Array.isArray(cur) ? cur : Object.values(cur || {});
  if (arr.some(im => im && (im.path === entry.path || im.url === entry.url))) return true;
  await set(ref(database, p), [...arr, entry]); return true;
}
/** The sensor photos off the Sensors list - each row's images[] (L 2026-10-04 "the radar tool uses the lists instead of the
 *  images section, based on the details app"). [{name, fullPath, url, mark, rowId, note}], or null when the job has no list
 *  (the caller falls back to the folder). The files stay where they are; the row holds their path + download link. */
export function sensorListPhotos(task) {
  const sl = sensorsListOf(task); if (!sl) return null; const out = [];
  for (const [rowId, r] of Object.entries(sl.list)) { if (LIST_RESERVED.has(rowId) || !r || typeof r !== "object") continue; const m = markOf(r); if (!m) continue;
    for (const im of (Array.isArray(r.images) ? r.images : Object.values(r.images || {}))) if (im && im.url)
      out.push({ name: String(im.path || "").split("/").pop() || `sensor ${m}`, fullPath: im.path || im.url, url: im.url, mark: m, rowId, note: im.note || "" }); }
  return out;
}
/** Take a photo off its sensor row (by path or url) - the delete-where-added half; the caller deletes the file. */
export async function unlinkSensorPhoto(owner, taskId, mark, pathOrUrl) {
  const ix = await sensorIndex(owner, taskId), rowId = ix?.rows[mark]; if (!rowId) return false;
  const p = `${sensorRowPath(owner, taskId, ix, rowId)}/images`, cur = await readOnce(p), arr = Array.isArray(cur) ? cur : Object.values(cur || {});
  await set(ref(database, p), arr.filter(im => im && im.path !== pathOrUrl && im.url !== pathOrUrl)); return true;
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
export const listPhotos = async (owner, task, sub) => isShared(owner)
  ? Object.values((await readOnce(`${SHARE_ROOT}/photos/${projectFolder(task)}/${sub}`)) || {}).filter(x => x && x.url).map(x => ({ name: x.name, url: x.url, shared: true }))   // the mirror's links
  : (await listAll(storageRef(storage, imagesDir(owner, task, sub)))).items;
export const photoUrl = item => item.url ? Promise.resolve(item.url) : getDownloadURL(item);

// PHOTO RULES live in ONE place now: apps/assets/js/imgupload.js (resizeImg / stampImg / unstampImg - the jobs app's
// numbers: 2048 wide, JPEG, strip max(40, width/22)). L 2026-10-03: "can all this code be placed in one place? ideally
// the Telaid apps just pull the logic". The old names stay for the callers.
export const resizeImage = resizeImg, addLabelBar = stampImg;
export async function uniqueName(dir, name) {
  const dot = name.lastIndexOf("."), b = name.slice(0, dot), ext = name.slice(dot); let n = 0;
  for (;;) { const t = n ? `${b}_${n}${ext}` : name;
    try { await getDownloadURL(storageRef(storage, `${dir}/${t}`)); n++; }
    catch (e) { if (e?.code === "storage/object-not-found") return t; throw e; } }
}
/** Upload one photo the radar-tools way: resize -> label bar -> unique name -> Storage. Returns the new ref.
 *  ONE AT A TIME PER FOLDER (sensor 83, 2026-10-03: the second shot started while the first was still uploading, both
 *  asked for a free name, both got the base name, the second overwrote the first). Resize + stamp run at once; the
 *  name check + upload wait for the folder's previous upload to land. */
const uploadQueue = {};
export async function uploadPhoto({ owner, task, sub, file, name, label, id }) {
  if (isShared(owner)) throw new Error("This is a shared copy (read-only).");
  let blob = await resizeImage(file, 2048);
  if (label) blob = await addLabelBar(blob, label);
  const dir = imagesDir(owner, task, sub);
  const turn = (uploadQueue[dir] || Promise.resolve()).then(async () => {
    const fn = await uniqueName(dir, name), r = storageRef(storage, `${dir}/${fn}`);
    await uploadBytes(r, blob, { contentType: "image/jpeg" });
    if (id) set(ref(database, photosAtPath(owner, id)), { at: Date.now(), sub, name: fn }).catch(() => {});   // LIVE marker - see watchJob
    return r;
  });
  uploadQueue[dir] = turn.catch(() => {});
  return turn;
}
/** Delete a photo by its Storage ref (the viewer's Delete button). */
export const deletePhoto = item => item.shared ? Promise.reject(new Error("Shared copy - read-only.")) : deleteObject(item);
// LIVE (L 2026-10-03: "can the reading of info that's been modified in the map be immediate? I have to refresh the page
// to get any new pictures"): Storage has no change feed, so every upload (map, checklist, any device) stamps
// {owner}/tasks/<id>/photosAt = {at, sub, name}; sensorMeta edits (run complete, labeled, serial, moves) are RTDB already.
// watchJob() subscribes to both - push, not polling (the poll-loop scar) - and hands back a stop() for the next site
// switch. The first value of each listener is history, not news, so it is skipped.
export const photosAtPath = (owner, taskId) => `${owner}/tasks/${taskId}/photosAt`;
export function watchJob(owner, taskId, { onPhotos, onMeta } = {}) {
  let firstP = true, firstM = true;
  const u1 = onValue(ref(database, photosAtPath(owner, taskId)), snap => { if (firstP) { firstP = false; return; } const v = snap.val(); if (v && onPhotos) onPhotos(v); }, () => {});
  const ix = rowIndex.get(`${owner}/${taskId}`);   // the list when the job has one (loadJob indexed it), the sheet otherwise
  const u2 = ix
    ? onValue(ref(database, `${owner}/tasks/${taskId}/lists/${ix.listId}`), snap => { if (firstM) { firstM = false; return; } const l = snap.val() || {}; if (onMeta) onMeta(sensorMetaOf({ lists: { [ix.listId]: { _name: "Sensors", ...l } } }) || {}); }, () => {})
    : onValue(ref(database, sensorMetaPath(owner, taskId)), snap => { if (firstM) { firstM = false; return; } if (onMeta) onMeta(snap.val() || {}); }, () => {});
  return () => { u1(); u2(); };
}
/** A device photo for sensor <mark>: "<prefix>_NN-serial.jpg", bar "<customer> NN - serial". */
export const uploadSensorPhoto = async ({ owner, task, mark, serial, file, bar = true, id }) => { const nn = String(mark).padStart(2, "0");
  const label = bar ? `${String(task?.customerName || task?.project || "").trim()} ${nn} - ${clean(serial)}` : null;
  const r = await uploadPhoto({ owner, task, id, sub: "sensors", file, name: `${photoPrefix(task)}_${nn}-${clean(serial)}.jpg`, label });
  if (id) { try { await linkSensorPhoto(owner, id, Number(mark), { url: await getDownloadURL(r), path: r.fullPath, note: "", markup: label || "" }); } catch (e) { console.warn("[telaid-data] photo not linked to the row", e?.code || e); } }
  return r; };
/** A site photo for MDF / IDFn: "YYYY_MM_DD_<prefix>_<hub>.jpg", bar "<customer> IDF n". */
export const uploadHubPhoto = ({ owner, task, hub, file, bar = true, id }) => { const d = new Date(),
  stamp = `${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, "0")}_${String(d.getDate()).padStart(2, "0")}`;
  return uploadPhoto({ owner, task, id, sub: hub, file, name: `${stamp}_${photoPrefix(task)}_${hub}.jpg`,
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
export { auth, database, storage, ref, get, update, storageRef, listAll, uploadBytes, getDownloadURL, deleteObject, onAuthStateChanged };
