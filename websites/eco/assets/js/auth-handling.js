import { auth, database, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, ref, set } from "../../../../assets/js/firebase-init.js";

const loginForm = document.getElementById("login-form");
if (loginForm) {
    loginForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        signInWithEmailAndPassword(auth, email, password)
            .then(() => {
                window.location.href = 'index.html';
            })
            .catch((error) => {
                console.error('Login error:', error);
                alert("Error during login: " + error.message);
            });
    });
}

const registrationForm = document.getElementById("registration-form");
if (registrationForm) {
    registrationForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;
        const confirmPassword = document.getElementById('reg-confirm-password').value;

        if (password !== confirmPassword) {
            alert("Passwords do not match. Please try again.");
            return;
        }

        const ipAddress = await getIP();

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await saveUserData(userCredential.user.uid, email, ipAddress);
            alert("Registration Successful");
            registrationForm.reset();
        } catch (error) {
            if (error.code === "auth/email-already-in-use") {
                try {
                    const userCredential = await signInWithEmailAndPassword(auth, email, password);
                    await saveUserData(userCredential.user.uid, email, ipAddress);
                    alert("Account already existed — profile updated.");
                    registrationForm.reset();
                } catch (loginError) {
                    alert("Error: " + loginError.message);
                }
            } else {
                alert("Registration failed: " + error.message);
            }
        }
    });
}

async function saveUserData(userId, email, ipAddress) {
    await set(ref(database, `${userId}/info`), { email, ipAddress });
}

async function getIP() {
    try {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        return data.ip;
    } catch {
        return "Unknown";
    }
}

const toggleRegisterLink = document.getElementById('toggle-register');
const toggleLoginLink = document.getElementById('toggle-login');

if (toggleRegisterLink && toggleLoginLink) {
    toggleRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelector('.login-container').style.display = 'none';
        document.querySelector('.register-container').style.display = 'block';
    });

    toggleLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelector('.register-container').style.display = 'none';
        document.querySelector('.login-container').style.display = 'block';
    });
}

document.addEventListener("componentLoaded:nav", () => {
    const authLink = document.getElementById('authLink');

    if (authLink) {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                authLink.textContent = 'Logout';
                authLink.href = '#';
                authLink.onclick = (e) => {
                    e.preventDefault();
                    signOut(auth)
                        .then(() => { window.location.href = 'index.html'; })
                        .catch((error) => { console.error('Error signing out:', error); });
                };
            } else {
                authLink.textContent = 'Login';
                authLink.href = 'login.html';
                authLink.onclick = null;
            }
        });
    }
});
