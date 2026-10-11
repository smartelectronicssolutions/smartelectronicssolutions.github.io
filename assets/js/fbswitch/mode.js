// Firebase first, the Pi's PocketBase as the backup (2026-10-11, L: "it hits Firebase first and that's the working copy,
// but backs up to Pocket; if Firebase is down for some reason I use Pocket").
//
// Every /apps/ page loads Firebase through assets/js/fbswitch/firebase-*.js; each of those asks this file which side to use:
//   "fb" (normal)  - the real Firebase SDK, exactly as before. Nothing waits on a check.
//   "pb" (backup)  - the PocketBase stand-ins, reading the Pi's copy of Firebase (pilet-mirror on the Pi keeps it fresh every
//                    10 min) through https://pi.luissolutions.us/pb (the pi-hub's PocketBase door).
// Backup is chosen only by the "fbBackup" flag, set from the banner when Firebase stops answering; pages outside /apps/
// (hub, workspace) always stay on Firebase. In backup, every save is also queued and sent to Firebase on the first live
// page load after Firebase is back. While live, the owner's Firebase sign-in is quietly linked to the Pi so backup mode
// opens already signed in.
export const GS = 'https://www.gstatic.com/firebasejs/9.15.0/';
const PI = 'https://pi.luissolutions.us/pb';
const RTDB = 'https://persinfo-df93f-default-rtdb.firebaseio.com/.json?shallow=true';
const QK = 'fbBackup:pendingWrites', FK = 'fbBackup';
const ls = { get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } },
             set: (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} } };
const inApps = location.pathname.startsWith('/apps/');
export const MODE = inApps && ls.get(FK) === '1' ? 'pb' : 'fb';
window.__fbMode = MODE;

export function queueWrite(op, p, v) {
  try { const q = JSON.parse(ls.get(QK) || '[]'); q.push({ op, p, v: v === undefined ? null : v, t: Date.now() }); ls.set(QK, JSON.stringify(q)); } catch (_) {}
}
const pending = () => { try { return JSON.parse(ls.get(QK) || '[]').length; } catch (_) { return 0; } };

async function reachable(url, ms = 4000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { await fetch(url, { signal: c.signal, cache: 'no-store', credentials: 'omit' }); return true; } catch (_) { return false; } finally { clearTimeout(t); }
}

// ---------- the small banner (bottom-left) ----------
let bar = null;
function banner(html, btn, onClick, tone) {
  const put = () => {
    if (!bar) {
      bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;max-width:calc(100vw - 16px);display:flex;gap:8px;align-items:center;' +
        'font:600 12px/1.3 system-ui,sans-serif;padding:7px 10px;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.45);color:#1a1206';
      document.body.appendChild(bar);
    }
    bar.style.background = tone === 'live' ? '#7fc97f' : '#f2a541';
    bar.innerHTML = '<span>' + html + '</span>' + (btn ? '<button style="font:inherit;border:0;border-radius:8px;padding:4px 9px;background:#1a1206;color:#f2a541;cursor:pointer">' + btn + '</button>' : '');
    const b = bar.querySelector('button'); if (b) b.onclick = onClick;
  };
  document.body ? put() : document.addEventListener('DOMContentLoaded', put);
}
const hm = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const toBackup = () => { ls.set(FK, '1'); location.reload(); };
const toLive = () => { ls.set(FK, null); location.reload(); };

if (MODE === 'pb') {
  // backup: say so, show how fresh the Pi copy is, and offer the way back once Firebase answers again
  (async () => {
    let asOf = '';
    try {
      const a = JSON.parse(ls.get('pocketbase_auth') || 'null');
      const r = await fetch(PI + '/api/rtdb/get?path=_pimirror', { headers: a && a.token ? { Authorization: a.token } : {}, credentials: 'omit' });
      const v = r.ok ? (await r.json()).v : null; if (v && v.lastCheck) asOf = ' · as of ' + hm(v.lastCheck);
    } catch (_) {}
    const say = () => '📦 Pi backup' + asOf + (pending() ? ' · ' + pending() + ' save' + (pending() > 1 ? 's' : '') + ' waiting' : '');
    banner(say(), 'Back to live', toLive);
    const t = setInterval(async () => { if (await reachable(RTDB)) { clearInterval(t); banner('☁️ Firebase is back' + (pending() ? ' - your ' + pending() + ' backup save' + (pending() > 1 ? 's' : '') + ' will be sent' : ''), 'Switch back', toLive, 'live'); } }, 60000);
  })();
} else if (inApps) {
  // live: send any backup-mode saves, link the owner's sign-in to the Pi, and watch for Firebase going quiet
  (async () => {
    const [A, U] = await Promise.all([import(GS + 'firebase-app.js'), import(GS + 'firebase-auth.js')]);
    let app = null, user = null;
    for (let i = 0; i < 60 && !user; i++) {
      app = A.getApps().find(a => a.name === '[DEFAULT]');
      user = app && U.getAuth(app).currentUser;
      if (!user) await new Promise(r => setTimeout(r, 1000));
    }
    if (!user) return;
    if (pending()) {
      const D = await import(GS + 'firebase-database.js'), db = D.getDatabase(app), q = JSON.parse(ls.get(QK) || '[]');
      let done = 0;
      for (const w of q) {
        try { if (w.op === 'update') await D.update(D.ref(db, w.p), w.v || {}); else await D.set(D.ref(db, w.p), w.v); done++; }
        catch (e) { console.warn('[backup] save not sent yet:', w.p, e && e.code); break; }
      }
      ls.set(QK, JSON.stringify(JSON.parse(ls.get(QK) || '[]').slice(done)));
      if (done) banner('☁️ Sent ' + done + ' save' + (done > 1 ? 's' : '') + ' made in backup mode', 'OK', () => { bar.remove(); bar = null; }, 'live');
    }
    // link: a PocketBase sign-in for backup mode, refreshed at most once a day (only the owner account is accepted)
    try {
      const a = JSON.parse(ls.get('pocketbase_auth') || 'null'), last = Number(ls.get('fbBackup:linkedAt') || 0);
      if (!a || !a.token || Date.now() - last > 86400000) {
        const r = await fetch(PI + '/api/fbbridge/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
          body: JSON.stringify({ idToken: await user.getIdToken() }) });
        if (r.ok) { const d = await r.json(); ls.set('pocketbase_auth', JSON.stringify({ token: d.token, record: d.record, model: d.record })); ls.set('fbBackup:linkedAt', String(Date.now())); }
      }
    } catch (_) {}
  })();
  // watchdog: Firebase not answering (twice, 8 s apart) while the Pi is reachable -> offer the backup
  (async () => {
    if (navigator.onLine === false || await reachable(RTDB)) return;
    await new Promise(r => setTimeout(r, 8000));
    if (await reachable(RTDB)) return;
    if (await reachable(PI + '/api/rtdb/get?path=public')) banner('Firebase isn\'t answering.', 'Use the Pi backup', toBackup);
  })();
}
