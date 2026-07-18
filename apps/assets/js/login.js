import { firebaseConfig } from "../../../assets/js/firebase-config.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-app.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
let currentUserUID = null;

if (!window.authListenerAttached) {
    window.authListenerAttached = true;

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUserUID = user.uid;
            localStorage.setItem("currentUserUID", currentUserUID);
            document.getElementById('login-form').style.display = 'none';
            document.getElementById('logout').style.display = 'flex';

            console.log("Logged in as user:", user.email);
        } else {
            currentUserUID = null;
            localStorage.removeItem("currentUserUID");
            document.getElementById('login-form').style.display = 'flex';
            document.getElementById('logout').style.display = 'none';

            console.log("No user is logged in.");
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const logoutButton = document.getElementById('logout');
    const emailInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = emailInput.value;
        const password = passwordInput.value;

        signInWithEmailAndPassword(auth, username, password)
            .then((userCredential) => {
                currentUserUID = userCredential.user.uid;
                localStorage.setItem("currentUserUID", currentUserUID);
                loginForm.style.display = 'none';
                logoutButton.style.display = 'flex';
                window.location.reload();
            })
            .catch((error) => {
                alert("Invalid login. Please check your email and password.");
                console.log(`Error [${error.code}]: ${error.message}`);
            });
    });

    logoutButton.addEventListener('click', () => {
        signOut(auth)
            .then(() => {
                currentUserUID = null;
                localStorage.removeItem("currentUserUID");
                loginForm.style.display = 'flex';
                logoutButton.style.display = 'none';
                window.location.reload();
            })
            .catch((error) => {
                console.log(`Error [${error.code}]: ${error.message}`);
            });
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const headerTitle = document.querySelector('header h1');
    let loginSections = Array.from(document.querySelectorAll('.logins-section'));

    if (!loginSections.length) {
        const legacySection = document.getElementById('login-section');
        if (legacySection) {
            legacySection.classList.add('logins-section');
            loginSections = [legacySection];
        }
    }

    if (!headerTitle || !loginSections.length) return;

    const toggleLoginSections = () => {
        loginSections.forEach((section) => {
            section.style.display =
                section.style.display === 'none' || getComputedStyle(section).display === 'none'
                    ? 'block'
                    : 'none';
        });
    };

    headerTitle.addEventListener('dblclick', toggleLoginSections);
});

export function getCurrentUserUID() {
    return localStorage.getItem("currentUserUID");
}