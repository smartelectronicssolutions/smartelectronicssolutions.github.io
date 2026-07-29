import { auth, onAuthStateChanged, signOut } from './firebase-init-noauth.js';

document.addEventListener("DOMContentLoaded", () => {
    const authLink = document.getElementById('authLink');

    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is logged in, change link to "Logout"
            authLink.textContent = 'Logout';
            authLink.href = '#'; // Prevent default navigation
            authLink.onclick = (e) => {
                e.preventDefault();
                signOut(auth)
                    .then(() => {
                        window.location.href = 'index.html'; // Redirect to home after logout
                    })
                    .catch((error) => {
                        console.error('Error signing out:', error);
                    });
            };
        } else {
            // No user is logged in, change link to "Login"
            authLink.textContent = 'Login';
            authLink.href = 'login.html';
            authLink.onclick = null; // Remove any logout functionality
        }
    });
});
