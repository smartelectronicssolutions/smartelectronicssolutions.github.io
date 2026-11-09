// ytg handler — REST-only, no Firebase SDK and no second project (playground-e3690 retired 2026-08-01): login checks
// the main site's Firebase Auth accounts through the Identity Toolkit REST API; registrations forward to the contact
// pipeline — no passwords stored anywhere. The signed-in marker is the Identity Toolkit idToken + expiry (real session since 2026-11-08).

const AUTH_KEY = "AIzaSyCv2cQGWeXS-w7psrQiZD8dn4R7hStmY1o"; // persinfo-df93f public web key
const CONTACT_URL = "https://persinfo-df93f-default-rtdb.firebaseio.com/public/contactSubmissions.json";

export function initializeFirebase() { /* no-op — nothing to init without the SDK; firebase-init.js (initializeAuth) and index.js still call it */ }

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
        .then((j) => {
            // 2026-11-08 (audit fix #8): keep the REAL Identity Toolkit session (idToken + its expiry), not a constant marker.
            const expirationTime = new Date().getTime() + (Number(j.expiresIn || 3600) * 1000);
            const tokenData = { idToken: j.idToken, email: j.email || username, expiresAt: expirationTime };
            localStorage.setItem("sToken", JSON.stringify(tokenData));

            const delay = expirationTime - new Date().getTime();
            setTimeout(() => localStorage.removeItem("sToken"), delay);
            alert("Login Successful.");
            window.location.href = "index.html";
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
function registerNewUser(name, email, phone) {
    return fetch(CONTACT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone: phone || "", message: "YTG site registration request", timestamp: Date.now() })
    }).then(res => {
        if (!res.ok) throw new Error("submit failed");
    });
}

export { registerNewUser };

export function attachFirebaseEventListeners() {
    attachLoginEventListener();
    attachRegisterEventListener();
}
