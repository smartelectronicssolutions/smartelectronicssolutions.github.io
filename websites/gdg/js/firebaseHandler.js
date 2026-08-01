// gdg handler — SAME exports as before, but no Firebase SDK and no second project.
// (playground-e3690 retired 2026-08-01. Login now checks the main site's accounts;
//  registrations forward to the contact pipeline; gallery serves local images.)

const AUTH_KEY = "AIzaSyCv2cQGWeXS-w7psrQiZD8dn4R7hStmY1o"; // persinfo-df93f public web key
const CONTACT_URL = "https://persinfo-df93f-default-rtdb.firebaseio.com/public/contactSubmissions.json";

export function initializeFirebase() { /* no-op — kept for API compatibility */ }

// Sign in against the main site's Firebase Auth (username field takes the account email).
function loginUser(email, password) {
    return fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${AUTH_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true })
    }).then(r => r.json()).then(j => {
        if (j.error) throw new Error("Invalid username or password.");
        return j;
    });
}

function handleLoginFormSubmission(event) {
    event.preventDefault();

    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;

    loginUser(username, password)
        .then(() => {
            const sToken = "7777777";
            const expirationMinutes = 480;
            const expirationTime = new Date().getTime() + (expirationMinutes * 60 * 1000);
            const tokenData = { sToken, expiresAt: expirationTime };
            localStorage.setItem("sToken", JSON.stringify(tokenData));

            const delay = expirationTime - new Date().getTime();
            setTimeout(() => localStorage.removeItem("sToken"), delay);
            alert("Login Successful.");
            window.location.href = "full.html";
        })
        .catch(() => {
            alert("Invalid username or password. Please try again.");
        });
}

function handleRegisterFormSubmission(event) {
    event.preventDefault();

    const username = document.getElementById("reg-username").value;
    const email = document.getElementById("reg-email").value;
    const password = document.getElementById("reg-password").value;
    const confirmPassword = document.getElementById("reg-confirm-password").value;

    if (password !== confirmPassword) {
        alert("Passwords do not match. Please try again.");
        return;
    }

    registerNewUser(username, email, "")
        .then(() => {
            alert("Registration received — we'll be in touch.");
            document.getElementById("register-form").reset();
        })
        .catch(() => {
            alert("Failed to submit registration. Please try again.");
        });
}

function attachLoginEventListener() {
    const loginForm = document.getElementById("login-form");
    if (loginForm) {
        loginForm.addEventListener("submit", handleLoginFormSubmission);
    }
}

function attachRegisterEventListener() {
    const registerForm = document.getElementById("register-form");
    if (registerForm) {
        registerForm.addEventListener("submit", handleRegisterFormSubmission);
    }
}

// Forwards to the site's contact pipeline (Telegram + email) — no passwords stored anywhere.
async function registerNewUser(name, email, phone) {
    const res = await fetch(CONTACT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone: phone || "", message: "GDG site registration request", timestamp: Date.now() })
    });
    if (!res.ok) throw new Error("submit failed");
}

export { registerNewUser };

// Local gallery — images live in the repo, no remote fetch.
const GALLERY_FILES = [
    "0", "00012-732299314.png", "01.png", "02.png", "03.png", "04.png",
    "1", "2", "3", "4", "5", "6"
];

export function fetchGalleryImages() {
    return Promise.resolve(GALLERY_FILES.map(f => new URL("../img/gallery/" + f, import.meta.url).href));
}

export function attachFirebaseEventListeners() {
    attachLoginEventListener();
    attachRegisterEventListener();
}
