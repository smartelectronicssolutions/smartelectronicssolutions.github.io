// Shared PocketBase client for the apps' BACKUP mode (2026-10-11): the Pi's PocketBase copy of Firebase, reached through
// the pi-hub's PocketBase door (pi-panel pbdoor_ext: site origins + app data routes only).
// One client per page; its auth lives in localStorage (pocketbase_auth), shared by every app on this origin.
import PocketBase from './pocketbase.es.mjs';
import { PI } from '../mode.js';   // the Pi door: pi.luissolutions.us, or the Pi's home address on se's home address
export { PI };

export const pb = globalThis.__piPB || (globalThis.__piPB = new PocketBase(PI));
pb.autoCancellation(false);

// plain JSON call to the custom /api routes (rtdb, fbbridge) with the current auth
export async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (pb.authStore.token) headers.Authorization = pb.authStore.token;
  const r = await fetch(PI + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'omit' });
  let data = null; try { data = await r.json(); } catch (_) {}
  if (!r.ok) { const e = new Error((data && data.message) || ('HTTP ' + r.status)); e.status = r.status; e.code = r.status === 401 || r.status === 403 ? 'PERMISSION_DENIED' : 'pb/' + r.status; throw e; }
  return data;
}
