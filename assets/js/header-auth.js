import { auth } from "./firebase-init.js";
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

export function init() {
    const header  = document.getElementById("site-header");
    const panel   = document.getElementById("header-auth-panel");
    const out     = document.getElementById("header-auth-loggedout");
    const inEl    = document.getElementById("header-auth-loggedin");
    const emailEl = document.getElementById("hdr-email");
    const passEl  = document.getElementById("hdr-password");
    const loginBtn  = document.getElementById("hdr-login-btn");
    const logoutBtn = document.getElementById("hdr-logout-btn");
    const errEl   = document.getElementById("hdr-auth-error");
    const userEl  = document.getElementById("hdr-user-email");

    if (!header || !panel) return;

    const accountLink = document.getElementById("hdr-account-link");

    function togglePanel() {
        const open = panel.style.display === "block";
        panel.style.display = open ? "none" : "block";
        if (!open) emailEl?.focus();
    }

    // Visible Account link (works on mobile + desktop)
    accountLink?.addEventListener("click", (e) => {
        e.preventDefault();
        togglePanel();
    });

    // Desktop power-user shortcut: double-click site name
    const siteName = header.querySelector(".site-name");
    if (siteName) siteName.style.cursor = "default";
    (siteName || header).addEventListener("dblclick", (e) => {
        if (panel.contains(e.target)) return;
        togglePanel();
    });

    // Close when clicking outside
    document.addEventListener("click", (e) => {
        if (panel.style.display === "block" && !header.contains(e.target)) {
            panel.style.display = "none";
        }
    });

    // Sign in
    loginBtn.addEventListener("click", async () => {
        errEl.style.display = "none";
        try {
            await signInWithEmailAndPassword(auth, emailEl.value.trim(), passEl.value);
            panel.style.display = "none";
            passEl.value = "";
        } catch (err) {
            errEl.textContent = "Invalid email or password.";
            errEl.style.display = "block";
        }
    });

    // Sign in on Enter key
    passEl.addEventListener("keydown", (e) => { if (e.key === "Enter") loginBtn.click(); });

    // Sign out
    logoutBtn.addEventListener("click", () => {
        signOut(auth);
        panel.style.display = "none";
    });

    // Auth state
    onAuthStateChanged(auth, (user) => {
        if (user) {
            out.style.display  = "none";
            inEl.style.display = "block";
            userEl.textContent = user.email;
            if (accountLink) accountLink.textContent = "Account";
        } else {
            out.style.display  = "block";
            inEl.style.display = "none";
            userEl.textContent = "";
            if (accountLink) accountLink.textContent = "Sign In";
        }
    });
}
