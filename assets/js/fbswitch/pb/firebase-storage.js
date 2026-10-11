// firebase-storage stand-in for the Pi test copy (Pilet, 2026-10-11): one `files` record per object path in
// PocketBase, the bytes in its file field. Download URLs go through the pi-panel proxy (/pb/api/files/...).
import { pb } from './pb.js';

const clean = p => String(p ?? '').split('/').filter(Boolean).join('/');
const STORAGE = { app: { name: '[DEFAULT]' }, maxUploadRetryTime: 0, maxOperationRetryTime: 0 };
export function getStorage() { return STORAGE; }
export function connectStorageEmulator() {}

function sref(path) {
  path = clean(path); const segs = path ? path.split('/') : [];
  return { fullPath: path, name: segs.length ? segs[segs.length - 1] : '', bucket: 'pi-pocketbase', storage: STORAGE,
    get parent() { return segs.length ? sref(segs.slice(0, -1).join('/')) : null; }, get root() { return sref(''); },
    toString() { return 'gs://pi-pocketbase/' + path; } };
}
export function ref(base, path) {
  if (base && typeof base === 'object' && 'fullPath' in base) return sref(base.fullPath + '/' + (path || ''));
  return sref(path || '');
}
function err(code, msg) { const e = new Error(`Firebase Storage: ${msg} (${code})`); e.code = code; return e; }
async function find(r) {
  try { return await pb.collection('files').getFirstListItem(pb.filter('path = {:p}', { p: r.fullPath })); }
  catch (e) { if (e.status === 404) return null; throw e; }
}
async function must(r) { const rec = await find(r); if (!rec) throw err('storage/object-not-found', `Object '${r.fullPath}' does not exist.`); return rec; }
function meta(r, rec) {
  return { bucket: 'pi-pocketbase', fullPath: r.fullPath, name: r.name, size: (rec.meta && rec.meta.size) || 0,
    contentType: rec.contentType || null, timeCreated: rec.created, updated: rec.updated,
    customMetadata: (rec.meta && rec.meta.custom) || {}, ref: r };
}
function toBlob(data, type) {
  if (data instanceof Blob) return data;
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return new Blob([data], { type: type || 'application/octet-stream' });
  return new Blob([String(data)], { type: type || 'text/plain' });
}
async function put(r, data, md = {}) {
  const blob = toBlob(data, md.contentType);
  const fd = new FormData();
  fd.append('path', r.fullPath);
  fd.append('contentType', md.contentType || blob.type || 'application/octet-stream');
  fd.append('meta', JSON.stringify({ size: blob.size, custom: md.customMetadata || {} }));
  fd.append('file', blob, r.name || 'file');
  const old = await find(r);
  const rec = old ? await pb.collection('files').update(old.id, fd) : await pb.collection('files').create(fd);
  return { ref: r, metadata: meta(r, rec), bytesTransferred: blob.size, totalBytes: blob.size, state: 'success' };
}
export async function uploadBytes(r, data, md) { return put(r, data, md); }
export async function uploadString(r, value, format, md) {
  if (format === 'data_url') { const b = await (await fetch(value)).blob(); return put(r, b, md); }
  if (format === 'base64') { const bin = atob(value); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return put(r, u, md); }
  return put(r, value, md);
}
export function uploadBytesResumable(r, data, md) {
  const total = (toBlob(data, md && md.contentType)).size;
  const snap = { bytesTransferred: 0, totalBytes: total, state: 'running', ref: r, metadata: null, task: null };
  const obs = [];
  const p = put(r, data, md);
  const task = {
    snapshot: snap,
    on(_ev, next, error, complete) {
      const o = typeof next === 'object' && next ? next : { next, error, complete };
      obs.push(o); Promise.resolve().then(() => o.next && o.next({ ...snap }));
      p.then(res => { Object.assign(snap, res); o.next && o.next({ ...snap }); o.complete && o.complete(); }, e => o.error && o.error(e));
      return () => {};
    },
    then: (a, b) => p.then(res => { Object.assign(snap, res); return { ...snap }; }).then(a, b),
    catch: b => p.catch(b), cancel: () => false, pause: () => false, resume: () => false,
  };
  snap.task = task;
  return task;
}
export async function getDownloadURL(r) { const rec = await must(r); return pb.files.getURL(rec, rec.file); }
export async function getMetadata(r) { return meta(r, await must(r)); }
export async function updateMetadata(r, md = {}) {
  const rec = await must(r); const m = rec.meta || {};
  const upd = { meta: { ...m, custom: { ...(m.custom || {}), ...(md.customMetadata || {}) } } };
  if (md.contentType) upd.contentType = md.contentType;
  return meta(r, await pb.collection('files').update(rec.id, upd));
}
export async function deleteObject(r) { const rec = await must(r); await pb.collection('files').delete(rec.id); }
export async function getBlob(r) { return (await fetch(await getDownloadURL(r))).blob(); }
export async function getBytes(r) { return (await getBlob(r)).arrayBuffer(); }
export async function listAll(r) {
  const p = r.fullPath, lo = p ? p + '/' : '', hi = p ? p + '0' : '￿';
  const recs = await pb.collection('files').getFullList({ filter: pb.filter('path >= {:lo} && path < {:hi}', { lo, hi }), fields: 'path' });
  const items = [], prefixes = new Set();
  for (const x of recs) {
    const rest = x.path.slice(lo.length);
    if (rest.includes('/')) prefixes.add(lo + rest.split('/')[0]); else items.push(sref(x.path));
  }
  return { items, prefixes: [...prefixes].sort().map(sref) };
}
export async function list(r, opts = {}) { const all = await listAll(r); const n = opts.maxResults || 1000; return { ...all, items: all.items.slice(0, n), nextPageToken: undefined }; }
