import { auth, createUserWithEmailAndPassword } from "../../../assets/js/firebase-init.js";

const regForm = document.getElementById('reg-form');
const regEmail = document.getElementById('reg-email');
const regPass = document.getElementById('reg-password');
const regConfirmPass = document.getElementById('reg-confirm-password');

regForm.addEventListener('submit', function (evt) {
  evt.preventDefault();
  console.log('Form submitted'); // Add this line for debugging

  if (regPass.value !== regConfirmPass.value) {
    alert('Passwords do not match. Please try again.');
    return;
  }

  // Check if a user is logged in
  if (auth.currentUser) {
    // Proceed with registration
    createUserWithEmailAndPassword(auth, regEmail.value, regPass.value)
      .then((credentials) => {
        console.log('User created:', credentials.user);
        alert('User Created');
      })
      .catch((error) => {
        console.error('Registration error:', error);
      });
  } else {
    alert('You need to log in before you can register.');
  }
});