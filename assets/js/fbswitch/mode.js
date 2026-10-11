// Firebase first, the Pi's PocketBase as the backup (2026-10-11, L: "it hits Firebase first and that's the working copy,
// but backs up to Pocket; if Firebase is down for some reason I use Pocket").
//
// Every /apps/ page loads Firebase through assets/js/fbswitch/firebase-*.js; each of those asks this file which side to use:
//   "fb" (normal)  - the real Firebase SDK, exactly as before. Nothing waits on a check.
//   "pb" (backup)  - the PocketBase stand-ins, reading the Pi's copy of Firebase (pilet-mirror keeps it fresh every 10 min)
//                    through the pi-hub's PocketBase door: https://pi.luissolutions.us/pb, or - on se's home address
//                    http://192.168.50.10:8081 (house internet down) - straight to the Pi at http://192.168.50.149:8090/pb.
// Backup is chosen by the "fbBackup" flag: set from the banner when Firebase stops answering, or automatically when the
// Firebase SDK itself cannot load (no internet). Pages outside /apps/ (hub, workspace) always stay on Firebase.
// Backup SIGN-IN = 2 of 3 (L: "yubikey, password and/or firebase"): Pi password + pi-hub YubiKey code (+ a Firebase login if
// one still works) -> /pb/api/pilocal/login on the Pi. Backup saves are queued and sent to Firebase on the first live load.
export const GS = 'https://www.gstatic.com/firebasejs/9.15.0/';
const HOME = location.hostname === '192.168.50.10';
export const PI = HOME ? 'http://192.168.50.149:8090/pb' : 'https://pi.luissolutions.us/pb';
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

// the real Firebase SDK could not load (no internet): on an app page go straight to the backup, elsewhere fail as before
export function sdkFailed(err) {
  if (!inApps) throw err;
  ls.set(FK, '1'); location.reload();
  return new Promise(() => {});   // the page is reloading - never resolve
}

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
      bar.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;max-width:calc(100vw - 16px);display:flex;flex-wrap:wrap;gap:8px;align-items:center;' +
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
const pbToken = () => { try { const a = JSON.parse(ls.get('pocketbase_auth') || 'null'); return a && a.token || ''; } catch (_) { return ''; } };

// a Firebase login that still works counts as one of the 3 (only reachable when Google is)
async function firebaseIdToken() {
  try {
    const go = Promise.all([import(GS + 'firebase-app.js'), import(GS + 'firebase-auth.js')]).then(async ([A, U]) => {
      const app = A.getApps().find(a => a.name === '[DEFAULT]'); const u = app && U.getAuth(app).currentUser; return u ? u.getIdToken() : '';
    });
    return await Promise.race([go, new Promise(r => setTimeout(() => r(''), 3000))]);
  } catch (_) { return ''; }
}

// backup sign-in: email + Pi password + YubiKey code -> the Pi checks 2 of 3
export async function backupSignIn(email, password, totp) {
  const idToken = await firebaseIdToken();
  const r = await fetch(PI + '/api/pilocal/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
    body: JSON.stringify({ email, password, totp, idToken }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.token) throw new Error(d.message || 'Backup sign-in needs 2 of 3: YubiKey code, Pi password, Firebase login');
  ls.set('pocketbase_auth', JSON.stringify({ token: d.token, record: d.record, model: d.record }));
  return d;
}

function signInForm(asOf) {
  const put = () => {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px';
    box.innerHTML = '<form style="background:#141a21;color:#d6dde5;border:1px solid #2a323c;border-radius:14px;padding:18px;width:100%;max-width:360px;font:14px system-ui,sans-serif">' +
      '<div style="font-weight:700;color:#f2a541;margin-bottom:6px">📦 Pi backup sign-in</div>' +
      '<div style="font-size:12px;color:#8b95a1;margin-bottom:10px">Firebase is down, so the apps are reading the Pi\'s copy' + asOf + '. Sign in with 2 of 3: Pi password + YubiKey code.</div>' +
      ['email|email|username', 'password|Pi password|current-password', 'text|YubiKey code (6 digits)|one-time-code'].map((s, i) => { const [t, ph, ac] = s.split('|');
        return '<input name="f' + i + '" type="' + t + '" placeholder="' + ph + '" autocomplete="' + ac + '"' + (i === 2 ? ' inputmode="numeric"' : '') +
          ' style="width:100%;box-sizing:border-box;margin:5px 0;padding:10px;border-radius:8px;border:1px solid #2a323c;background:#0c0f13;color:#d6dde5;font:inherit">'; }).join('') +
      '<button style="width:100%;margin-top:6px;padding:10px;border:0;border-radius:8px;background:#f2a541;color:#1a1206;font:700 14px system-ui">Sign in</button>' +
      '<div class="m" style="font-size:12px;color:#ff9b8a;margin-top:8px"></div>' +
      '<div style="font-size:12px;margin-top:8px"><a href="#" class="live" style="color:#8b95a1">back to live (Firebase)</a></div></form>';
    document.body.appendChild(box);
    const f = box.querySelector('form'), m = box.querySelector('.m');
    try { f.f0.value = ls.get('fbBackup:email') || ''; } catch (_) {}
    box.querySelector('.live').onclick = e => { e.preventDefault(); toLive(); };
    f.onsubmit = async e => {
      e.preventDefault(); m.textContent = '…';
      try { await backupSignIn(f.f0.value.trim(), f.f1.value, f.f2.value.trim()); ls.set('fbBackup:email', f.f0.value.trim()); location.reload(); }
      catch (x) { m.textContent = x.message; f.f2.value = ''; }
    };
  };
  document.body ? put() : document.addEventListener('DOMContentLoaded', put);
}

if (MODE === 'pb') {
  // backup: how fresh is the Pi copy, are we signed in to it, and offer the way back once Firebase answers again
  (async () => {
    let asOf = '', signedIn = false;
    try {
      const t = pbToken();
      const r = await fetch(PI + '/api/rtdb/get?path=_pimirror', { headers: t ? { Authorization: t } : {}, credentials: 'omit' });
      signedIn = r.ok;
      const v = r.ok ? (await r.json()).v : null; if (v && v.lastCheck) asOf = ' · as of ' + hm(v.lastCheck);
    } catch (_) {}
    if (!signedIn) { ls.set('pocketbase_auth', null); signInForm(asOf); }
    const say = () => '📦 Pi backup' + asOf + (pending() ? ' · ' + pending() + ' save' + (pending() > 1 ? 's' : '') + ' waiting' : '');
    banner(say(), 'Back to live', toLive);
    const t = setInterval(async () => { if (await reachable(RTDB)) { clearInterval(t); banner('☁️ Firebase is back' + (pending() ? ' - your ' + pending() + ' backup save' + (pending() > 1 ? 's' : '') + ' will be sent' : ''), 'Switch back', toLive, 'live'); } }, 60000);
  })();
} else if (inApps) {
  // live: send any backup-mode saves once a Firebase user is signed in
  if (pending()) (async () => {
    const [A, U] = await Promise.all([import(GS + 'firebase-app.js'), import(GS + 'firebase-auth.js')]);
    let app = null, user = null;
    for (let i = 0; i < 60 && !user; i++) {
      app = A.getApps().find(a => a.name === '[DEFAULT]');
      user = app && U.getAuth(app).currentUser;
      if (!user) await new Promise(r => setTimeout(r, 1000));
    }
    if (!user) return;
    const D = await import(GS + 'firebase-database.js'), db = D.getDatabase(app), q = JSON.parse(ls.get(QK) || '[]');
    let done = 0;
    for (const w of q) {
      try { if (w.op === 'update') await D.update(D.ref(db, w.p), w.v || {}); else await D.set(D.ref(db, w.p), w.v); done++; }
      catch (e) { console.warn('[backup] save not sent yet:', w.p, e && e.code); break; }
    }
    ls.set(QK, JSON.stringify(JSON.parse(ls.get(QK) || '[]').slice(done)));
    if (done) banner('☁️ Sent ' + done + ' save' + (done > 1 ? 's' : '') + ' made in backup mode', 'OK', () => { bar.remove(); bar = null; }, 'live');
  })();
  // watchdog: Firebase not answering (twice, 8 s apart) while the Pi is reachable -> offer the backup
  (async () => {
    if (navigator.onLine === false || await reachable(RTDB)) return;
    await new Promise(r => setTimeout(r, 8000));
    if (await reachable(RTDB)) return;
    if (await reachable(PI + '/api/rtdb/get?path=public')) banner('Firebase isn\'t answering.', 'Use the Pi backup', toBackup);
  })();
}
