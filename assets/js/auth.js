import { firebaseConfig } from "./firebase-config.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/9.1.3/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-app.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

let currentUserUID = null;

// 🌐 GLOBAL DOM REFERENCES (KEY FIX)
let authBtn, authLabel, loginBox;
let emailInput, passwordInput, doLogin;

// 🔔 GLOBAL AUTH LISTENERS
window.__authListeners = [];

export function onUserReady(callback) {
  window.__authListeners.push(callback);

  // If already logged in, fire immediately
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

      console.log("Logged in:", user.email);
    } else {
      currentUserUID = null;
      localStorage.removeItem("currentUserUID");

      if (authLabel) authLabel.textContent = "Not signed in";
      if (authBtn) authBtn.textContent = "Sign In";

      window.currentUser = null;

      console.log("No user");
    }

    // 🔥 NEW: notify all listeners
    window.__authListeners.forEach((cb) => cb(user));
  });
}

// 🧠 DOM READY
document.addEventListener("DOMContentLoaded", () => {
  authBtn = document.getElementById("auth-btn");
  authLabel = document.getElementById("auth-label");
  loginBox = document.getElementById("login-inline");

  emailInput = document.getElementById("email-in");
  passwordInput = document.getElementById("pass-in");
  doLogin = document.getElementById("do-login");

  // 🔑 LOGIN
  doLogin?.addEventListener("click", async () => {
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        emailInput.value,
        passwordInput.value,
      );

      currentUserUID = userCredential.user.uid;
      localStorage.setItem("currentUserUID", currentUserUID);

      if (loginBox) loginBox.style.display = "none";
    } catch (error) {
      alert("Invalid login. Please check your email and password.");
      console.log(error);
    }
  });

  // 🔓 LOGIN / LOGOUT BUTTON
  authBtn?.addEventListener("click", () => {
    if (auth.currentUser) {
      signOut(auth);
    } else {
      loginBox.style.display =
        loginBox.style.display === "block" ? "none" : "block";
    }
  });
});

// 🎛️ DEBUG TOGGLE (optional)
document.addEventListener("DOMContentLoaded", () => {
  const headerTitle = document.querySelector("header h1");
  let loginSections = Array.from(document.querySelectorAll(".logins-section"));

  if (!loginSections.length) {
    const legacySection = document.getElementById("login-section");
    if (legacySection) {
      legacySection.classList.add("logins-section");
      loginSections = [legacySection];
    }
  }

  if (!headerTitle || !loginSections.length) return;

  headerTitle.addEventListener("dblclick", () => {
    loginSections.forEach((section) => {
      section.style.display =
        getComputedStyle(section).display === "none" ? "block" : "none";
    });
  });
});

// 📦 EXPORT
export function getCurrentUserUID() {
  return localStorage.getItem("currentUserUID");
}
