// ytg's own copy (2026-10-03, L: every site under websites/ carries its own files) of assets/js/firebase-init.js.
import { firebaseConfig } from "./firebase-config.js";

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase, ref, onValue, set as _rawSet, get, off, remove as _rawRemove, runTransaction, push as _rawPush, update as _rawUpdate, limitToLast, query, child } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, listAll, uploadBytesResumable, deleteObject, getMetadata, updateMetadata, getBlob, getBytes } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);
const storage = getStorage(app);

function initializeAuth(appInstance) {
  document.getElementById('login-form').addEventListener('submit', function (event) {
    event.preventDefault();
    const email = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    signInWithEmailAndPassword(auth, email, password)
      .then((cred) => {
        if (!cred.user.emailVerified) {
          const resend = confirm(
            "Your email isn't verified yet. Please click the verification link we emailed you before logging in.\n\n" +
            "OK = resend the verification email.  Cancel = close.");
          if (resend) {
            sendEmailVerification(cred.user)
              .then(() => alert('Verification email re-sent. Check your inbox (and spam).'))
              .catch((e) => alert("Couldn't resend: " + e.message));
          }
          signOut(auth);
          return;
        }
        appInstance.isAuthenticated = true;
        appInstance.initializeFirebase();
      })
      .catch((error) => {
        console.error('Login error:', error.message);
        alert('Login failed. Please check your credentials and try again.');
      });
  });

  document.getElementById('logout').addEventListener('click', () => {
    signOut(auth).then(() => {
      appInstance.isAuthenticated = false;
      appInstance.loadLocalData();
    }).catch((error) => {
      console.error('Logout error:', error.message);
      alert('Logout failed. Please try again.');
    });
  });

  onAuthStateChanged(auth, (user) => {
    if (user && user.emailVerified) {
      document.getElementById('login-section').style.display = 'none';
      document.getElementById('logout').style.display = 'block';
      appInstance.isAuthenticated = true;
      appInstance.initializeFirebase();
    } else {
      document.getElementById('login-section').style.display = 'block';
      document.getElementById('logout').style.display = 'none';
      appInstance.isAuthenticated = false;
      appInstance.loadLocalData();
    }
  });
}

// PUBLIC 50/DAY DEMO QUOTA (2026-11-28, L: "Keep anonymous demo writes open on public/, but add a 50/day RTDB quota"):
// Signed-in writes go straight to the SDK untouched. Signed-out writes under public/<node> (except public/log/*)
// atomically bump public/_dailyQuota {day, count} (1..50 per UTC day) in the same multi-path update.
let _pubSrvOff = 0;
onValue(ref(database, ".info/serverTimeOffset"), s => { _pubSrvOff = Number(s.val() || 0); }, () => {});
const _pubSub = r => {
  try {
    const p = decodeURIComponent(new URL(r.toString()).pathname).replace(/^\/+|\/+$/g, "");
    if (p === "public") return "";
    if (!p.startsWith("public/")) return null;
    const s = p.slice(7);
    return /^(log|_dailyQuota)(\/|$)/.test(s) ? null : s;
  } catch (_) { return null; }
};
async function _pubQuotaPatch(relMap) {
  for (let i = 0; i < 3; i++) {
    const q = (await get(ref(database, "public/_dailyQuota"))).val();
    const day = Math.floor((Date.now() + _pubSrvOff) / 86400000);
    const count = (q && q.day === day ? Number(q.count || 0) : 0) + 1;
    if (count > 50) throw new Error("Public demo daily write limit (50/day) reached.");
    try { return await _rawUpdate(ref(database, "public"), { ...relMap, _dailyQuota: { day, count } }); }
    catch (e) { if (i === 2 || !/permission_denied|permission-denied/i.test(String((e && (e.code || e.message)) || ""))) throw e; }
  }
}
function set(r, v) {
  const sub = !auth.currentUser ? _pubSub(r) : null;
  return sub ? _pubQuotaPatch({ [sub]: v }) : _rawSet(r, v);
}
function remove(r) {
  const sub = !auth.currentUser ? _pubSub(r) : null;
  return sub ? _pubQuotaPatch({ [sub]: null }) : _rawRemove(r);
}
function update(r, vals) {
  if (!auth.currentUser && vals && typeof vals === "object") {
    const sub = _pubSub(r);
    if (sub !== null) {
      const m = {};
      for (const [k, v] of Object.entries(vals)) {
        const rel = (sub ? sub + "/" : "") + k.replace(/^\/+/, "");
        if (/^(log|_dailyQuota)(\/|$)/.test(rel)) return _rawUpdate(r, vals);
        m[rel] = v;
      }
      return _pubQuotaPatch(m);
    }
    try {
      const rootP = decodeURIComponent(new URL(r.toString()).pathname).replace(/^\/+|\/+$/g, "");
      const entries = Object.entries(vals);
      if (!rootP && entries.length && entries.every(([k]) => /^\/?public\/(?!log(\/|$)|_dailyQuota(\/|$)).+/.test(k))) {
        const m = {};
        for (const [k, v] of entries) m[k.replace(/^\/?public\//, "")] = v;
        return _pubQuotaPatch(m);
      }
    } catch (_) {}
  }
  return _rawUpdate(r, vals);
}
function push(r, v) {
  const sub = v !== undefined && !auth.currentUser ? _pubSub(r) : null;
  if (!sub) return _rawPush(r, v);
  const c = _rawPush(r);
  const p = _pubQuotaPatch({ [`${sub}/${c.key}`]: v }).then(() => c);
  c.then = p.then.bind(p);
  c.catch = p.catch.bind(p);
  return c;
}

export {
  app, database, auth, storage, getAuth, onAuthStateChanged, getDatabase, ref, onValue, set, push, get, off, remove, runTransaction, update, signOut, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, limitToLast, query, child, EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile, initializeAuth, getStorage, storageRef, uploadBytes, getDownloadURL, listAll,
  uploadBytesResumable, deleteObject, getMetadata, updateMetadata, getFunctions, httpsCallable, signInAnonymously, getBlob, getBytes
};