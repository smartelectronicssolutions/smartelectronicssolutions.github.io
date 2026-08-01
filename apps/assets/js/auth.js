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
