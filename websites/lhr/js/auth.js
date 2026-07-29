import { auth, signOut, onAuthStateChanged } from "../../../assets/js/firebase-init.js";

// Check the auth state immediately
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = 'login.html';
  } else {
    console.log(`Logged in as: ${user.email}`);
  }
});

document.getElementById('logoutButton').addEventListener('click', () => {
  signOut(auth).then(() => {
    console.log("You have been logged out");
    // window.location.href = 'login.html';
  }).catch((error) => {
    console.error("Logout error", error);
  });
});