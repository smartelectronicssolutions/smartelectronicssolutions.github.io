/* auth.js — shared auth helper for main site pages
   Uses firebase-init.js which pulls from firebase-config.js */

import { auth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from './firebase-init.js';

export { auth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut };

/* Simple auth state helper — call with callbacks */
export function watchAuth(onLogin, onLogout) {
    onAuthStateChanged(auth, user => {
        if (user) onLogin(user);
        else onLogout();
    });
}
