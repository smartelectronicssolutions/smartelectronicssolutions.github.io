// firebase-database stand-in for the Pi test copy (Pilet, 2026-10-11).
// Same modular API the apps already call (ref/get/set/update/push/remove/onValue/query/...), backed by PocketBase:
//   reads  -> GET  /pb/api/rtdb/get?path=      (server assembles the subtree from its leaf records)
//   writes -> POST /pb/api/rtdb/set | update   (server diffs, so only changed leaves are touched)
//   live   -> PocketBase realtime on the `rtdb` leaf table, filtered to the listener's path; any change re-reads
//             the subtree (debounced) and calls back only when the value really changed.
// Queries (orderBy*/startAt/endAt/equalTo/limitTo*) run in the browser on the fetched node - fine for test data.
import { pb, api } from './pb.js';

const DB = { app: { name: '[DEFAULT]' }, type: 'database' };
export function getDatabase() { return DB; }
export function connectDatabaseEmulator() {}
export function goOffline() {} export function goOnline() {} export function enableLogging() {}

// ---------- paths + refs ----------
const clean = p => String(p ?? '').split('/').filter(Boolean).join('/');
function makeRef(path, cons = []) {
  path = clean(path);
  const segs = path ? path.split('/') : [];
  const r = {
    _path: path, _cons: cons, key: segs.length ? segs[segs.length - 1] : null,
    get parent() { return segs.length ? makeRef(segs.slice(0, -1).join('/')) : null; },
    get root() { return makeRef(''); },
    get ref() { return makeRef(path); },
    toString() { return location.origin + '/pb/rtdb/' + path; }, toJSON() { return this.toString(); },
    isEqual(o) { return !!o && o._path === path && JSON.stringify(o._cons) === JSON.stringify(cons); },
  };
  return r;
}
export function ref(_db, path) { return makeRef(path || ''); }
export function refFromURL(_db, url) { return makeRef(String(url).split('/pb/rtdb/')[1] || ''); }
export function child(parent, path) { return makeRef(parent._path + '/' + path); }

// ---------- push ids (Firebase's own scheme: time-sortable, 20 chars) ----------
const PUSH = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
let lastPush = 0, lastRand = [];
function pushId() {
  let now = Date.now(); const dup = now === lastPush; lastPush = now;
  const t = new Array(8); for (let i = 7; i >= 0; i--) { t[i] = PUSH.charAt(now % 64); now = Math.floor(now / 64); }
  if (!dup) { lastRand = []; for (let i = 0; i < 12; i++) lastRand[i] = Math.floor(Math.random() * 64); }
  else { let i = 11; for (; i >= 0 && lastRand[i] === 63; i--) lastRand[i] = 0; if (i >= 0) lastRand[i]++; }
  return t.join('') + lastRand.map(n => PUSH.charAt(n)).join('');
}

// ---------- query constraints ----------
const C = (type, a, b) => ({ type, a, b });
export const orderByKey = () => C('orderByKey'), orderByValue = () => C('orderByValue'), orderByPriority = () => C('orderByKey');
export const orderByChild = p => C('orderByChild', clean(p));
export const startAt = (v, k) => C('startAt', v, k), startAfter = (v, k) => C('startAfter', v, k);
export const endAt = (v, k) => C('endAt', v, k), endBefore = (v, k) => C('endBefore', v, k);
export const equalTo = (v, k) => C('equalTo', v, k);
export const limitToFirst = n => C('limitToFirst', n), limitToLast = n => C('limitToLast', n);
export function query(r, ...cons) { return makeRef(r._path, [...(r._cons || []), ...cons]); }

// Firebase ordering: null < false < true < numbers < strings < objects; keys: integers (numeric) then strings
const isIntKey = k => /^(0|-?[1-9]\d{0,9})$/.test(k);
function cmpKey(a, b) {
  const ia = isIntKey(a), ib = isIntKey(b);
  if (ia && ib) return Number(a) - Number(b); if (ia) return -1; if (ib) return 1; return a < b ? -1 : a > b ? 1 : 0;
}
const rank = v => v === null || v === undefined ? 0 : v === false ? 1 : v === true ? 2 : typeof v === 'number' ? 3 : typeof v === 'string' ? 4 : 5;
function cmpVal(a, b) {
  const ra = rank(a), rb = rank(b); if (ra !== rb) return ra - rb;
  if (ra === 3) return a - b; if (ra === 4) return a < b ? -1 : a > b ? 1 : 0; return 0;
}
const childAt = (v, p) => { if (!p) return v; for (const s of p.split('/')) { if (v === null || typeof v !== 'object') return null; v = v[s]; } return v ?? null; };

function applyQuery(value, cons) {   // -> { value, order: [keys] }
  if (value === null || typeof value !== 'object') return { value, order: null };
  let keys = Object.keys(value);
  if (!cons || !cons.length) return { value, order: keys.sort(cmpKey) };
  const ob = cons.find(c => c.type.startsWith('orderBy')) || C('orderByKey');
  const sortVal = k => ob.type === 'orderByKey' ? k : ob.type === 'orderByValue' ? value[k] : childAt(value[k], ob.a);
  const cmp = (x, y) => ob.type === 'orderByKey' ? cmpKey(x, y) : (cmpVal(sortVal(x), sortVal(y)) || cmpKey(x, y));
  keys.sort(cmp);
  const cmpTo = (k, v, kk) => { const d = ob.type === 'orderByKey' ? cmpKey(k, String(v)) : cmpVal(sortVal(k), v); return d !== 0 || kk === undefined ? d : cmpKey(k, kk); };
  for (const c of cons) {
    if (c.type === 'startAt') keys = keys.filter(k => cmpTo(k, c.a, c.b) >= 0);
    else if (c.type === 'startAfter') keys = keys.filter(k => cmpTo(k, c.a, c.b) > 0);
    else if (c.type === 'endAt') keys = keys.filter(k => cmpTo(k, c.a, c.b) <= 0);
    else if (c.type === 'endBefore') keys = keys.filter(k => cmpTo(k, c.a, c.b) < 0);
    else if (c.type === 'equalTo') keys = keys.filter(k => cmpTo(k, c.a, c.b) === 0);
  }
  const lf = cons.find(c => c.type === 'limitToFirst'), ll = cons.find(c => c.type === 'limitToLast');
  if (lf) keys = keys.slice(0, lf.a); if (ll) keys = keys.slice(Math.max(0, keys.length - ll.a));
  const out = {}; for (const k of keys) out[k] = value[k];
  return { value: keys.length ? out : null, order: keys };
}

// ---------- snapshots ----------
class DataSnapshot {
  constructor(r, value, order) { this.ref = r; this.key = r.key; this._v = value === undefined ? null : value; this._o = order; }
  val() { return this._v === null ? null : JSON.parse(JSON.stringify(this._v)); }
  exportVal() { return this.val(); } toJSON() { return this.val(); }
  exists() { return this._v !== null; }
  get size() { return this._v && typeof this._v === 'object' ? Object.keys(this._v).length : 0; }
  numChildren() { return this.size; }
  hasChildren() { return this.size > 0; }
  hasChild(p) { return childAt(this._v, clean(p)) !== null; }
  child(p) { p = clean(p); const v = childAt(this._v, p); return new DataSnapshot(makeRef(this.ref._path + '/' + p), v, v && typeof v === 'object' ? Object.keys(v).sort(cmpKey) : null); }
  forEach(fn) {
    if (!this._v || typeof this._v !== 'object') return false;
    for (const k of (this._o || Object.keys(this._v).sort(cmpKey))) if (fn(this.child(k)) === true) return true;
    return false;
  }
  get priority() { return null; }
}

// ---------- reads ----------
async function fetchNode(path) { return (await api('GET', '/api/rtdb/get?path=' + encodeURIComponent(path))).v ?? null; }
function snapOf(r, raw) { const q = applyQuery(raw, r._cons); return new DataSnapshot(makeRef(r._path), q.value, q.order); }
export async function get(r) { return snapOf(r, await fetchNode(r._path)); }

// ---------- writes ----------
const kick = path => { for (const l of LISTENERS) if (overlaps(l.r._path, path)) l.soon(); };   // local listeners hear it at once
export async function set(r, value) { await api('POST', '/api/rtdb/set', { path: r._path, v: value === undefined ? null : value }); kick(r._path); }
export async function remove(r) { return set(r, null); }
export async function update(r, values) {
  await api('POST', '/api/rtdb/update', { path: r._path, values: values || {} });
  kick(r._path);
}
export function push(parent, value) {
  const r = makeRef(parent._path + '/' + pushId());
  const p = value === undefined ? Promise.resolve() : set(r, value);
  const thenable = Object.create(r);
  Object.defineProperty(thenable, 'key', { value: r.key });
  thenable.then = (a, b) => p.then(() => r).then(a, b); thenable.catch = b => p.then(() => r).catch(b);
  return thenable;
}
export async function setWithPriority(r, v) { return set(r, v); }
export async function setPriority() {}
export async function runTransaction(r, fn) {
  const cur = await fetchNode(r._path);
  const next = fn(cur === null ? null : JSON.parse(JSON.stringify(cur)));
  if (next === undefined) return { committed: false, snapshot: new DataSnapshot(r, cur) };
  await set(r, next);
  return { committed: true, snapshot: new DataSnapshot(makeRef(r._path), next) };
}
export const increment = n => ({ '.sv': { increment: n } });
export const serverTimestamp = () => ({ '.sv': 'timestamp' });
export function onDisconnect() { const noop = async () => {}; return { set: noop, update: noop, remove: noop, cancel: noop, setWithPriority: noop }; }

// ---------- live listeners ----------
const LISTENERS = new Set();
const overlaps = (a, b) => !a || !b || a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
const rangeFilter = p => p ? pb.filter('path = {:p} || (path >= {:lo} && path < {:hi})', { p, lo: p + '/', hi: p + '0' }) : '';

export function onValue(r, cb, cancelCb, opts) {
  if (cancelCb && typeof cancelCb === 'object') { opts = cancelCb; cancelCb = undefined; }
  const once = !!(opts && opts.onlyOnce);
  const l = { r, cb, last: undefined, timer: null, unsub: null, dead: false };
  const deliver = async () => {
    if (l.dead) return;
    try {
      const raw = await fetchNode(r._path);
      const sig = JSON.stringify(raw);
      if (sig === l.last) return; l.last = sig;
      cb(snapOf(r, raw));
      if (once) stop();
    } catch (e) { if (cancelCb) cancelCb(e); else console.warn('onValue', r._path, e.message); }
  };
  l.soon = () => { clearTimeout(l.timer); l.timer = setTimeout(deliver, 60); };
  const subscribe = async () => {
    try { if (l.unsub) { await l.unsub(); l.unsub = null; } } catch (_) {}
    if (l.dead || once) return;
    try { l.unsub = await pb.collection('rtdb').subscribe('*', () => l.soon(), rangeFilter(r._path) ? { filter: rangeFilter(r._path) } : {}); }
    catch (e) { console.warn('realtime', r._path, e.message); }
  };
  const offAuth = pb.authStore.onChange(() => { l.last = undefined; subscribe(); l.soon(); });   // signed in/out: re-read + re-subscribe
  function stop() { l.dead = true; LISTENERS.delete(l); clearTimeout(l.timer); offAuth(); if (l.unsub) l.unsub().catch(() => {}); }
  l.stop = stop;
  LISTENERS.add(l);
  deliver(); subscribe();
  return stop;
}
export function off(r) {
  for (const l of [...LISTENERS]) if (!r || (l.r._path === r._path)) l.stop();
}
// child events are not used by the apps; mapped onto onValue so nothing crashes if one appears
const viaValue = (r, cb) => onValue(r, s => s.forEach(c => { cb(c); }));
export const onChildAdded = viaValue, onChildChanged = () => () => {}, onChildRemoved = () => () => {}, onChildMoved = () => () => {};
