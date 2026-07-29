import {
  auth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "./firebase-init.js";

let currentUserUID = null;

// 🌐 GLOBAL DOM REFERENCES
let authBtn, authLabel, loginBox;
let emailInput, passwordInput, doLogin;

// 🔔 GLOBAL AUTH LISTENERS
window.__authListeners = [];

export function onUserReady(callback) {
  window.__authListeners.push(callback);
  if (window.currentUser !== undefined) {
    callback(window.currentUser);
  }
}

// 🔐 AUTH STATE LISTENER
if (!window.authListenerAttached) {
  window.authListenerAttached = true;

  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUserUID = user.uid;
      localStorage.setItem("currentUserUID", currentUserUID);
      if (authLabel) authLabel.textContent = user.email;
      if (authBtn) authBtn.textContent = "Logout";
      if (loginBox) loginBox.style.display = "none";
      window.currentUser = user;
    } else {
      currentUserUID = null;
      localStorage.removeItem("currentUserUID");
      if (authLabel) authLabel.textContent = "Not signed in";
      if (authBtn) authBtn.textContent = "Sign In";
      window.currentUser = null;
    }
    window.__authListeners.forEach((cb) => cb(user));
  });
}

// 🧠 DOM READY
document.addEventListener("DOMContentLoaded", () => {
  authBtn  = document.getElementById("auth-btn");
  authLabel = document.getElementById("auth-label");
  loginBox  = document.getElementById("login-inline");
  emailInput    = document.getElementById("email-in");
  passwordInput = document.getElementById("pass-in");
  doLogin       = document.getElementById("do-login");

  doLogin?.addEventListener("click", async () => {
    try {
      const cred = await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
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
    } else {
      loginBox.style.display = loginBox.style.display === "block" ? "none" : "block";
    }
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
