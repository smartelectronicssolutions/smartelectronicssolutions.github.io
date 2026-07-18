import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCv2cQGWeXS-w7psrQiZD8dn4R7hStmY1o",
    authDomain: "persinfo-df93f.firebaseapp.com",
    databaseURL: "https://persinfo-df93f-default-rtdb.firebaseio.com",
    projectId: "persinfo-df93f",
    storageBucket: "persinfo-df93f.appspot.com",
    messagingSenderId: "218680336647",
    appId: "1:218680336647:web:7786091136b9e6b28565a2"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const authSection = document.getElementById('auth-section');
  const appsSection = document.getElementById('apps-section');
  const userInfo = document.getElementById('user-info');
  const logoutButton = document.getElementById('logout-button');

  // Auth UI not present on this page — skip
  if (!userInfo) return;

  onAuthStateChanged(auth, (user) => {
    if (user) {
      displayUserInfo(user);
      displayApps(true); // User is logged in
    } else {
      displayAuthForms();
      displayApps(false); // User is not logged in
    }
  });

  function displayUserInfo(user) {
    userInfo.textContent = `Logged in as: ${user.email}`;
    logoutButton.style.display = 'inline-block';
    logoutButton.addEventListener('click', () => {
      signOut(auth).catch((error) => {
        console.error("Error signing out:", error);
      });
    });
  }

  function displayApps(userLoggedIn) {
    authSection.style.display = userLoggedIn ? 'none' : 'block';
    appsSection.style.display = 'block';
    populateThumbnails(apps, 'apps-container', userLoggedIn);
  }

  function displayAuthForms() {
    authSection.style.display = 'block';
    appsSection.style.display = 'block'; // Keep apps section visible
    userInfo.textContent = ''; // Clear user info
    logoutButton.style.display = 'none'; // Hide logout button

    authSection.innerHTML = `
      <div id="log-reg">
        <section>
          <!-- Login Form -->
          <div class="login-container">
            <h1>Login</h1>
            <form id="login-form">
              <label for="login-email">Email:</label>
              <input type="email" id="login-email" name="email" required>
              <label for="login-password">Password:</label>
              <input type="password" id="login-password" name="password" required>
              <button id="login-button" type="submit">Login</button>
            </form>
            <p>Don't have an account? <br><a href="#" id="toggle-register">Register here</a></p>
          </div>

          <!-- Register Form -->
          <div class="register-container" style="display: none;">
            <h1>Register</h1>
            <form id="registration-form">
              <label for="reg-email">Email:</label>
              <input type="email" id="reg-email" name="email" required>
              <label for="reg-password">Password:</label>
              <input type="password" id="reg-password" name="password" required>
              <label for="reg-confirm-password">Confirm Password:</label>
              <input type="password" id="reg-confirm-password" name="confirm-password" required>
              <label for="agree-terms">
                <input type="checkbox" id="agree-terms" name="agree-terms" required>
                Agree to <a href="terms.html" target="_blank">Terms and Conditions</a>
              </label>
              <button id="register-button" type="submit">Register</button>
            </form>
            <p>Already have an account? <br><a href="#" id="toggle-login">Login here</a></p>
          </div>
        </section>
      </div>
    `;

    // Attach event listeners
    document.getElementById('login-form').addEventListener('submit', loginUser);
    document.getElementById('registration-form').addEventListener('submit', registerUser);
    document.getElementById('toggle-register').addEventListener('click', showRegisterForm);
    document.getElementById('toggle-login').addEventListener('click', showLoginForm);

    // Populate thumbnails with userLoggedIn = false
    populateThumbnails(apps, 'apps-container', false);
  }

  function loginUser(event) {
    event.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();

    signInWithEmailAndPassword(auth, email, password)
      .catch((error) => {
        console.error('Login error:', error);
        alert("Error during login: " + error.message);
      });
  }

  function registerUser(event) {
    event.preventDefault();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value.trim();
    const confirmPassword = document.getElementById('reg-confirm-password').value.trim();

    if (password !== confirmPassword) {
      alert("Passwords do not match. Please try again.");
      return;
    }

    createUserWithEmailAndPassword(auth, email, password)
      .then(() => {
        alert("Registration successful! Please log in.");
        showLoginForm();
      })
      .catch((error) => {
        console.error('Error registering user:', error);
        alert("Registration failed: " + error.message);
      });

    document.getElementById("registration-form").reset();
  }

  function showRegisterForm(event) {
    event.preventDefault();
    document.querySelector('.login-container').style.display = 'none';
    document.querySelector('.register-container').style.display = 'block';
  }

  function showLoginForm(event) {
    event.preventDefault();
    document.querySelector('.register-container').style.display = 'none';
    document.querySelector('.login-container').style.display = 'block';
  }
});
