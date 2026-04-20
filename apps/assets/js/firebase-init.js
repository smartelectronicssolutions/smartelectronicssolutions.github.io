import { firebaseConfig } from "../../../assets/js/firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, initializeAuth, signOut, createUserWithEmailAndPassword, EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import {
  getDatabase, ref, onValue, set, get, off, remove, runTransaction, push, update, limitToLast, query, child
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL, listAll, uploadBytesResumable, deleteObject, getMetadata, updateMetadata, getBlob, getBytes 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);
const storage = getStorage(app);

export {
  app, database, auth, storage,
  getAuth, onAuthStateChanged, getDatabase, ref, onValue, set, push, get, off, remove, getMetadata,
  runTransaction, update, signOut, createUserWithEmailAndPassword, limitToLast, query, child,
  EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile, updateMetadata,
  getStorage, storageRef, uploadBytes, getDownloadURL, listAll, signInWithEmailAndPassword,
  uploadBytesResumable, deleteObject, getFunctions, httpsCallable, initializeAuth, getBlob, getBytes 
};