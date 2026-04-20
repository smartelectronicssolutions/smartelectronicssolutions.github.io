import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase, ref, onValue, set, get, off, remove, runTransaction, push, update, limitToLast, query } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, listAll, uploadBytesResumable, deleteObject } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyBUq3vdvQFgyW_Py6r6zCgQyeIzfZq-ZUU",
  authDomain: "playground-e3690.firebaseapp.com",
  databaseURL: "https://playground-e3690-default-rtdb.firebaseio.com",
  projectId: "playground-e3690",
  storageBucket: "playground-e3690.appspot.com",
  messagingSenderId: "803825556227",
  appId: "1:803825556227:web:556a3db8526287763aa736"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

function initializeAuth(app) {
  app.initializeFirebase();
}

export {
  app, database, auth, getAuth, onAuthStateChanged, getDatabase, ref, onValue, set, push, get, off, remove, runTransaction, update, signOut, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, limitToLast, query, EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile, initializeAuth, getStorage, storageRef, uploadBytes, getDownloadURL, listAll,
  uploadBytesResumable, deleteObject, getFunctions, httpsCallable 
};