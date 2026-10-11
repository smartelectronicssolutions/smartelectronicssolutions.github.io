// ONE auth module for all apps/ pages. Handles both login templates:
//   A) inline panel:  #auth-btn / #auth-label / #login-inline / #email-in / #pass-in / #do-login
//   B) classic form:  #login-form / #logout / #username / #password   (telaid tools, checklist)
// All DOM lookups are null-safe; a page only needs the template it actually has.
// login.js is a shim re-exporting this file — import either path, same module.
import {
  auth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  database,
  ref,
  get,
} from "./firebase-init.js";
import { sendEmailVerification } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

let currentUserUID = null;

// 🔔 GLOBAL AUTH LISTENERS
window.__authListeners = window.__authListeners || [];

export function onUserReady(callback) {
  window.__authListeners.push(callback);
  if (window.currentUser !== undefined) {
    callback(window.currentUser);
  }
}

// Shared login-time verification gate (new signups must verify; existing users are grandfathered).
// Deliberately NOT enforced on cached sessions so field tools never kick an active user.
async function gateUnverified(cred) {
  if (cred.user.emailVerified) return true;
  const resend = confirm(
    "Your email isn't verified yet. Please click the verification link we emailed you before logging in.\n\n" +
    "OK = resend the verification email.  Cancel = close.");
  if (resend) {
    try { await sendEmailVerification(cred.user); alert("Verification email re-sent. Check your inbox (and spam)."); }
    catch (e) { alert("Couldn't resend: " + e.message); }
  }
  await signOut(auth);
  return false;
}

// 🔐 AUTH STATE LISTENER (single, updates whichever template is present)
if (!window.authListenerAttached) {
  window.authListenerAttached = true;

  onAuthStateChanged(auth, (user) => {
    const authBtn = document.getElementById("auth-btn");
    const authLabel = document.getElementById("auth-label");
    const loginBox = document.getElementById("login-inline");
    const loginForm = document.getElementById("login-form");
    const logoutBtn = document.getElementById("logout");

    if (user) {
      currentUserUID = user.uid;
      localStorage.setItem("currentUserUID", currentUserUID);
      if (authLabel) authLabel.textContent = user.email;
      if (authBtn) authBtn.textContent = "Logout";
      if (loginBox) loginBox.style.display = "none";
      if (loginForm) loginForm.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "flex";
      window.currentUser = user;
      try { mountAccountPicker(user); } catch (e) { console.warn("account picker:", e); }
    } else {
      currentUserUID = null;
      localStorage.removeItem("currentUserUID");
      if (authLabel) authLabel.textContent = "Not signed in";
      if (authBtn) authBtn.textContent = "Sign In";
      if (loginForm) loginForm.style.display = "flex";
      if (logoutBtn) logoutBtn.style.display = "none";
      window.currentUser = null;
    }
    window.__authListeners.forEach((cb) => cb(user));
  });
}

// 🧠 DOM READY — wire whichever template exists
document.addEventListener("DOMContentLoaded", () => {
  // Template A: inline panel
  const authBtn = document.getElementById("auth-btn");
  const loginBox = document.getElementById("login-inline");
  const emailIn = document.getElementById("email-in");
  const passIn = document.getElementById("pass-in");
  const doLogin = document.getElementById("do-login");

  doLogin?.addEventListener("click", async () => {
    try {
      const cred = await signInWithEmailAndPassword(auth, emailIn.value, passIn.value);
      if (!(await gateUnverified(cred))) return;
      currentUserUID = cred.user.uid;
      localStorage.setItem("currentUserUID", currentUserUID);
      if (loginBox) loginBox.style.display = "none";
    } catch {
      alert("Invalid login. Please check your email and password.");
    }
  });

  authBtn?.addEventListener("click", () => {
    if (auth.currentUser) {
      signOut(auth);
    } else if (loginBox) {
      loginBox.style.display = loginBox.style.display === "block" ? "none" : "block";
    }
  });

  // Template B: classic form (telaid tools) — preserves reload-after-login behavior
  const loginForm = document.getElementById("login-form");
  const logoutBtn = document.getElementById("logout");
  const userIn = document.getElementById("username");
  const pwIn = document.getElementById("password");

  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const cred = await signInWithEmailAndPassword(auth, userIn.value, pwIn.value);
      if (!(await gateUnverified(cred))) return;
      currentUserUID = cred.user.uid;
      localStorage.setItem("currentUserUID", currentUserUID);
      loginForm.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "flex";
      window.location.reload();
    } catch (error) {
      alert("Invalid login. Please check your email and password.");
      console.log(`Error [${error.code}]: ${error.message}`);
    }
  });

  logoutBtn?.addEventListener("click", () => {
    signOut(auth)
      .then(() => {
        currentUserUID = null;
        localStorage.removeItem("currentUserUID");
        if (loginForm) loginForm.style.display = "flex";
        logoutBtn.style.display = "none";
        window.location.reload();
      })
      .catch((error) => {
        console.log(`Error [${error.code}]: ${error.message}`);
      });
  });
});

// 🎛️ DEBUG — double-click header h1 to reveal login section
document.addEventListener("DOMContentLoaded", () => {
  const headerTitle = document.querySelector("header h1");
  let loginSections = Array.from(document.querySelectorAll(".logins-section"));
  if (!loginSections.length) {
    const legacy = document.getElementById("login-section");
    if (legacy) {
      legacy.classList.add("logins-section");
      loginSections = [legacy];
    }
  }
  if (!headerTitle || !loginSections.length) return;
  headerTitle.addEventListener("dblclick", () => {
    loginSections.forEach((s) => {
      s.style.display = getComputedStyle(s).display === "none" ? "block" : "none";
    });
  });
});

export function getCurrentUserUID() {
  return localStorage.getItem("currentUserUID");
}

import('../../../assets/js/visitLogger.js')
  .then(m => m.getIP().then(ip => m.updateVisitCount(ip)))
  .catch(() => {});


// ACCOUNT PICKER (2026-10-11, L: "for all the apps that use uid for my main account add the account selector like in
// telaid apps and louverse ... if logged in as me to choose what account to be lead"). Signed in as Luis, every apps/
// page gets an "Account" dropdown (names from share/directory); the pick is kept per browser in localStorage
// "lsAccount" and the page reloads into that account's tree - apps read it through window.lsBasePath(user) /
// their basePathFor(u). Anyone else never sees it and always reads their own tree. The Telaid pages keep their own
// dropdown (they have data-shell headers), so it is not added twice there.
const MAIN_UID = "7cIh8rrhVNOjjj5CBDgb3IlqzEh2", ACCOUNT_KEY = "lsAccount";
export function pickedAccount(user) {
  if (!user || user.uid !== MAIN_UID) return "";
  try { const v = localStorage.getItem(ACCOUNT_KEY) || ""; return /^[A-Za-z0-9_-]{6,64}$/.test(v) ? v : ""; } catch (_) { return ""; }
}
window.lsBasePath = window.lsBasePath || (u => {
  let b = ""; try { b = new URLSearchParams(location.search).get("base") || ""; } catch (_) {}
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(b)) b = pickedAccount(u);
  return u ? (b || u.uid) : "public";
});
let pickerMounted = false;
async function mountAccountPicker(user) {
  if (pickerMounted || !user || user.uid !== MAIN_UID) return;
  if (document.querySelector("[data-shell]") || document.getElementById("telaidAccount")) return;   // Telaid pages: own dropdown
  pickerMounted = true;
  let dir = {};
  try { dir = (await get(ref(database, "share/directory"))).val() || {}; } catch (_) {}
  const cur = pickedAccount(user) || MAIN_UID;
  const opts = [[MAIN_UID, "Luis (me)"], ...Object.entries(dir).filter(([u]) => u !== MAIN_UID).map(([u, d]) => [u, (d && d.name) || u.slice(0, 6)])]
    .sort((a, b) => (a[0] === MAIN_UID ? -1 : b[0] === MAIN_UID ? 1 : String(a[1]).localeCompare(String(b[1]))));
  const wrap = document.createElement("label");
  wrap.id = "lsAccountPicker";
  wrap.title = "Whose data this page reads and writes (only you see this)";
  wrap.style.cssText = "display:inline-flex;align-items:center;gap:6px;font-size:12px;margin:0 8px;white-space:nowrap" +
    (cur !== MAIN_UID ? ";padding:2px 8px;border-radius:999px;background:#7a1f3d;color:#fff" : "");
  wrap.innerHTML = `<span>${cur !== MAIN_UID ? "Viewing" : "Account"}</span>`;
  const sel = document.createElement("select");
  sel.style.cssText = "font-size:12px;max-width:170px";
  for (const [u, n] of opts) { const o = document.createElement("option"); o.value = u; o.textContent = n; if (u === cur) o.selected = true; sel.appendChild(o); }
  sel.onchange = () => { try { sel.value === MAIN_UID ? localStorage.removeItem(ACCOUNT_KEY) : localStorage.setItem(ACCOUNT_KEY, sel.value); } catch (_) {} location.reload(); };
  wrap.appendChild(sel);
  const anchor = document.getElementById("auth-label") || document.getElementById("logout") || document.getElementById("auth-btn");
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(wrap, anchor);
  else { wrap.style.cssText += ";position:fixed;top:8px;right:8px;z-index:9999;background:var(--bg,#111);padding:4px 8px;border-radius:8px"; document.body.appendChild(wrap); }
}
