// Shared auth UI for kh pages — replaces the old prompt()-based login.
// Pattern matches the main site's components/header.html + header-auth.js.
//
// Expects the header.html markup to include:
//   #kh-account-link (the Sign In / Account toggle)
//   #kh-auth-panel    (the dropdown panel)
//   #kh-auth-loggedout / #kh-auth-loggedin (state containers)
//   #kh-email / #kh-password / #kh-login-btn / #kh-auth-error
//   #kh-user-email / #kh-logout-btn

import { auth } from '../../../../assets/js/firebase-init.js';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';

await window.khHeaderReady;

const link     = document.getElementById('kh-account-link');
const panel    = document.getElementById('kh-auth-panel');
const out      = document.getElementById('kh-auth-loggedout');
const inEl     = document.getElementById('kh-auth-loggedin');
const emailEl  = document.getElementById('kh-email');
const passEl   = document.getElementById('kh-password');
const loginBtn = document.getElementById('kh-login-btn');
const logoutBtn = document.getElementById('kh-logout-btn');
const errEl   = document.getElementById('kh-auth-error');
const userEl  = document.getElementById('kh-user-email');

if (link && panel) {
  // Toggle on click
  link.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const opening = !panel.classList.contains('open');
    panel.classList.toggle('open');
    if (opening && emailEl && out.style.display !== 'none') emailEl.focus();
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && e.target !== link) {
      panel.classList.remove('open');
    }
  });

  // Sign in
  loginBtn?.addEventListener('click', async () => {
    if (errEl) errEl.style.display = 'none';
    try {
      await signInWithEmailAndPassword(auth, emailEl.value.trim(), passEl.value);
      panel.classList.remove('open');
      if (passEl) passEl.value = '';
    } catch (err) {
      if (errEl) {
        errEl.textContent = 'Invalid email or password.';
        errEl.style.display = 'block';
      }
    }
  });

  // Sign in on Enter from password field
  passEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loginBtn?.click();
    }
  });

  // Sign out
  logoutBtn?.addEventListener('click', () => {
    signOut(auth);
    panel.classList.remove('open');
  });

  // Auth state → swap which sub-panel shows + link label
  onAuthStateChanged(auth, (user) => {
    if (user) {
      if (out)  out.style.display  = 'none';
      if (inEl) inEl.style.display = 'block';
      if (userEl) userEl.textContent = user.email;
      if (link) link.textContent = 'Account';
    } else {
      if (out)  out.style.display  = 'block';
      if (inEl) inEl.style.display = 'none';
      if (userEl) userEl.textContent = '';
      if (link) link.textContent = 'Sign In';
    }
  });
}
