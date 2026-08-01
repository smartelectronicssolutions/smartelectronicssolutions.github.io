import { firebaseConfig } from "./firebase-config.js";

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase, ref, onValue, set, get, off, remove, runTransaction, push, update, limitToLast, query, child } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, listAll, uploadBytesResumable, deleteObject, getMetadata, updateMetadata, getBlob, getBytes } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);
const storage = getStorage(app);

function initializeAuth(appInstance) {
  document.getElementById('login-form').addEventListener('submit', function (event) {
    event.preventDefault();
    const email = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    signInWithEmailAndPassword(auth, email, password)
      .then((cred) => {
        if (!cred.user.emailVerified) {
          const resend = confirm(
            "Your email isn't verified yet. Please click the verification link we emailed you before logging in.\n\n" +
            "OK = resend the verification email.  Cancel = close.");
          if (resend) {
            sendEmailVerification(cred.user)
              .then(() => alert('Verification email re-sent. Check your inbox (and spam).'))
              .catch((e) => alert("Couldn't resend: " + e.message));
          }
          signOut(auth);
          return;
        }
        appInstance.isAuthenticated = true;
        appInstance.initializeFirebase();
      })
      .catch((error) => {
        console.error('Login error:', error.message);
        alert('Login failed. Please check your credentials and try again.');
      });
  });

  document.getElementById('logout').addEventListener('click', () => {
    signOut(auth).then(() => {
      appInstance.isAuthenticated = false;
      appInstance.loadLocalData();
    }).catch((error) => {
      console.error('Logout error:', error.message);
      alert('Logout failed. Please try again.');
    });
  });

  onAuthStateChanged(auth, (user) => {
    if (user && user.emailVerified) {
      document.getElementById('login-section').style.display = 'none';
      document.getElementById('logout').style.display = 'block';
      appInstance.isAuthenticated = true;
      appInstance.initializeFirebase();
    } else {
      document.getElementById('login-section').style.display = 'block';
      document.getElementById('logout').style.display = 'none';
      appInstance.isAuthenticated = false;
      appInstance.loadLocalData();
    }
  });
}

export {
  app, database, auth, storage, getAuth, onAuthStateChanged, getDatabase, ref, onValue, set, push, get, off, remove, runTransaction, update, signOut, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, limitToLast, query, child, EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile, initializeAuth, getStorage, storageRef, uploadBytes, getDownloadURL, listAll,
  uploadBytesResumable, deleteObject, getMetadata, updateMetadata, getFunctions, httpsCallable, signInAnonymously, getBlob, getBytes
};