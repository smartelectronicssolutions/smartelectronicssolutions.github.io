// game's own login (2026-10-16, L: "add login info to game site same shape as the others") - same flow as
// websites/eco/assets/js/auth-handling.js: login.html = Login / Register toggle, and every page's nav carries an
// #authLink that reads "Login" (-> login.html) or "Logout" when signed in.
import { auth, database, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, ref, set } from "./firebase-init.js";

const $ = id => document.getElementById(id);
const back = () => new URLSearchParams(location.search).get("next") || "index.html";

const loginForm = $("login-form");
if (loginForm) {
    loginForm.addEventListener("submit", e => {
        e.preventDefault();
        signInWithEmailAndPassword(auth, $("login-email").value.trim(), $("login-password").value)
            .then(() => { location.href = back(); })
            .catch(err => { console.error("Login error:", err); alert("Error during login: " + err.message); });
    });
}

const registrationForm = $("registration-form");
if (registrationForm) {
    registrationForm.addEventListener("submit", async e => {
        e.preventDefault();
        const email = $("reg-email").value.trim(), password = $("reg-password").value;
        if (password !== $("reg-confirm-password").value) { alert("Passwords do not match. Please try again."); return; }
        try {
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            await set(ref(database, `${cred.user.uid}/profile`), { email });
            alert("Registration Successful");
            registrationForm.reset();
            location.href = back();
        } catch (err) {
            alert("Registration failed: " + err.message);
        }
    });
}

const toReg = $("toggle-register"), toLogin = $("toggle-login");
if (toReg && toLogin) {
    toReg.addEventListener("click", e => { e.preventDefault(); document.querySelector(".login-container").style.display = "none"; document.querySelector(".register-container").style.display = "block"; });
    toLogin.addEventListener("click", e => { e.preventDefault(); document.querySelector(".register-container").style.display = "none"; document.querySelector(".login-container").style.display = "block"; });
}

const logout = () => signOut(auth).then(() => { location.href = "index.html"; }).catch(err => console.error("Error signing out:", err));
if ($("logout-button")) $("logout-button").onclick = logout;

onAuthStateChanged(auth, user => {
    const a = $("authLink");
    if (a) {
        if (user) {
            a.textContent = "Logout"; a.title = user.email || ""; a.href = "#";
            a.onclick = e => { e.preventDefault(); logout(); };
        } else {
            a.textContent = "Login"; a.title = "";
            a.href = "login.html" + (location.pathname.endsWith("login.html") ? "" : "?next=" + encodeURIComponent(location.pathname.split("/").pop() || "index.html"));
            a.onclick = null;
        }
    }
    // on login.html: signed in -> show who + Logout instead of the forms
    if ($("signed-in")) {
        $("signed-in").style.display = user ? "block" : "none";
        document.querySelector(".login-container").style.display = user ? "none" : "block";
        if (user) { document.querySelector(".register-container").style.display = "none"; $("signed-in-as").textContent = user.email || "Signed in"; }
    }
});
