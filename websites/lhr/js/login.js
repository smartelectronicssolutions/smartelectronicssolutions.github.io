import { auth, signInWithEmailAndPassword, signOut } from "../../../assets/js/firebase-init.js";

document.getElementById("login-form").addEventListener("submit", function (event) {
    event.preventDefault();
    const email = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    signInWithEmailAndPassword(auth, email, password)
        .then((credentials) => {
            window.location.href = 'index.html';
        })
        .catch((error) => {
            console.error('Login error:', error);
            alert("Error during login: " + error.message);
        });
});

document.getElementById('logoutButton').addEventListener('click', (event) => {
    event.preventDefault();
    
    signOut(auth).then(() => {
        alert("You have been logged out");
        // window.location.href = 'login.html';
    }).catch((error) => {
        console.error("Logout error", error);
    });
});