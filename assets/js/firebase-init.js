import { firebaseConfig } from "./firebase-config.js";

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase, ref, onValue, set, get, off, remove, runTransaction, push, update, limitToLast, query, child } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
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

export {
  app, database, auth, storage, getAuth, onAuthStateChanged, getDatabase, ref, onValue, set, push, get, off, remove, runTransaction, update, signOut, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, limitToLast, query, child, EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile, initializeAuth, getStorage, storageRef, uploadBytes, getDownloadURL, listAll,
  uploadBytesResumable, deleteObject, getMetadata, updateMetadata, getFunctions, httpsCallable, signInAnonymously, getBlob, getBytes
};

// BASE OVERRIDE (2026-10-04): the Louverse board can open an app on the tree it is reading (?base=<uid>) - e.g. the Telaid tree
// while signed in as Luis. Only the signed-in rules decide whether that tree is readable; signed out, the override is ignored.
export const BASE_OVERRIDE = (() => { try { return /^[A-Za-z0-9_-]{6,64}$/.test(new URLSearchParams(location.search).get("base") || "") ? new URLSearchParams(location.search).get("base") : ""; } catch (_) { return ""; } })();
// + ACCOUNT PICK (2026-10-11): signed in as Luis, the apps/ Account dropdown (auth.js) keeps a pick in localStorage "lsAccount"
export const basePathFor = user => { if (user && BASE_OVERRIDE) return BASE_OVERRIDE; if (!user) return "public";
  if (user.uid === "7cIh8rrhVNOjjj5CBDgb3IlqzEh2") { try { const v = localStorage.getItem("lsAccount") || ""; if (/^[A-Za-z0-9_-]{6,64}$/.test(v)) return v; } catch (_) {} }
  return user.uid; };

// SITE SWITCH (2026-10-20, L: "switch my site off with a sort of under construction page, with some message I put in").
// The hub's Site switch card writes public/site/maintenance {on, message, at} (rules: public read, owner write). Every page
// that imports this file checks it once on load: visitors get a full-screen under-construction layer with L's message;
// signed in as Luis the page works and shows a thin "site is OFF" strip. hub.html and console.html never gate (that is
// where the switch and the login live). ?switchtest=1 previews the layer without flipping the flag. Identical block in the
// root file and in every self-contained site copy (websites/*/assets/js) - edit all of them together.
(async () => {
  try {
    const here = location.pathname.toLowerCase();
    if (here.endsWith("/hub.html") || here.endsWith("/console.html") || here.endsWith("/websites/index.html")) return;
    const test = new URLSearchParams(location.search).get("switchtest") === "1";
    // PER-SITE TOGGLES (2026-10-21): key = the websites/<name>/ folder this page lives in, "ses" for the root pages
    const km = here.match(/^\/websites\/([^\/]+)\//); const siteKey = km ? km[1] : "ses";
    // NO FLASH (2026-10-22, L: "when I turn off a site I get the page for a split second before the under construction
    // screen"): the layer used to wait for the flag fetch AND up to 2.5 s for sign-in. Now (1) this device's last known
    // state for the site shows the layer at once, before any fetch, (2) a fresh "off" shows it the moment the flag
    // arrives, and (3) sign-in only runs afterwards - the owner's device (remembered) never sees the layer, and an owner
    // who signs in has it swapped for the strip.
    const esc = s => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const whenBody = fn => (document.body ? fn() : document.addEventListener("DOMContentLoaded", fn));
    const LS = { get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} } };
    const CK = "ss_state_" + siteKey, wasOwner = LS.get("ss_owner") === "1";
    const showLayer = msg => whenBody(() => {
      let o = document.getElementById("site-switch-layer");
      if (!o) {
        o = document.createElement("div"); o.id = "site-switch-layer";
        o.setAttribute("style", "position:fixed;inset:0;z-index:2147483647;background:#0f1419;color:#e8e6e3;font:16px/1.6 system-ui,Segoe UI,Arial;display:grid;place-items:center;padding:24px;box-sizing:border-box;overflow:auto");
        document.body.appendChild(o); document.documentElement.style.overflow = "hidden"; document.title = "Under construction";
      }
      o.innerHTML = `<div style="max-width:560px;text-align:center"><span style="display:inline-block;width:64px;height:6px;border-radius:3px;background:#7a1f2b;margin-bottom:20px"></span>
<h1 style="font-size:1.6rem;margin:0 0 12px;color:#fff">Under construction</h1>
<p style="margin:0 0 18px;white-space:pre-wrap">${esc(msg || "We're working on the site. Back soon.")}</p>
<small style="color:#9aa0a6">luissolutions.us</small></div>`;
    });
    const hideLayer = () => { const o = document.getElementById("site-switch-layer"); if (o) { o.remove(); document.documentElement.style.overflow = ""; } };
    let cached = null; try { cached = JSON.parse(LS.get(CK) || "null"); } catch (_) {}
    if (!test && !wasOwner && cached && cached.on) showLayer(cached.message);   // instant, from this device's last look
    let m = null;
    if (!test) {
      const r = await fetch(`${firebaseConfig.databaseURL}/public/site.json`, { cache: "no-store" });
      const site = (await r.json()) || {};
      const all = site.maintenance || {}, mine = (site.sites || {})[siteKey] || {};
      if (!all.on && !mine.on) { LS.set(CK, JSON.stringify({ on: 0 })); hideLayer(); return; }
      m = { on: true, message: (mine.on && mine.message) || all.message || "", at: mine.on ? mine.at : all.at, scope: all.on ? "everything" : siteKey };
    } else { m = { on: true, message: "Preview of the under-construction page (?switchtest=1).", scope: "preview" }; }
    if (!test) LS.set(CK, JSON.stringify({ on: 1, message: m.message || "" }));
    if (!wasOwner || test) showLayer(m.message);   // straight away - no waiting on sign-in
    const owner = test ? false : await new Promise(res => {
      const t = setTimeout(() => res(false), 2500);
      onAuthStateChanged(auth, u => { clearTimeout(t); res(!!u && u.uid === "7cIh8rrhVNOjjj5CBDgb3IlqzEh2"); });
    });
    if (!test) LS.set("ss_owner", owner ? "1" : "0");
    if (owner) {
      hideLayer();
      whenBody(() => {
        const b = document.createElement("div");
        b.setAttribute("style", "position:fixed;top:0;left:0;right:0;z-index:2147483646;background:#7a1f2b;color:#fff;font:600 13px/1.4 system-ui,Segoe UI,Arial;padding:6px 12px;text-align:center");
        b.innerHTML = `${m.scope === "everything" ? "ALL SITES ARE" : "THIS SITE IS"} OFF for visitors &middot; "${esc(m.message || "")}" &middot; <a href="/websites/index.html" style="color:#ffd6dc">websites &rarr; toggles</a>`;
        document.body.prepend(b);
      });
      return;
    }
    showLayer(m.message);
  } catch (_) { /* never block a page over the switch */ }
})();
