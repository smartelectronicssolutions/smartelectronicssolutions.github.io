// firebase-auth stand-in for the Pi test copy (Pilet, 2026-10-11).
// Sign-in = the Pi's OWN login: email + Pi password, checked by PocketBase on the Pi (no Google). The PocketBase user
// carries the Firebase uid in `fbuid`, so user.uid (and every app path built from it) matches the copied data.
// Sign-ups, password changes and anonymous sign-in stay with the real Firebase - they reject here with a clear message.
import { pb, api } from './pb.js';

function toUser(rec) {
  if (!rec || !pb.authStore.isValid) return null;
  const token = pb.authStore.token;
  return {
    uid: rec.fbuid || rec.id, email: rec.email || null, emailVerified: !!rec.verified, displayName: rec.name || null,
    photoURL: null, phoneNumber: null, isAnonymous: false, providerId: 'firebase', tenantId: null,
    providerData: [{ providerId: 'password', uid: rec.email, email: rec.email, displayName: rec.name || null }],
    metadata: { creationTime: rec.created || null, lastSignInTime: null },
    getIdToken: async () => pb.authStore.token || token,
    getIdTokenResult: async () => ({ token: pb.authStore.token || token, claims: { user_id: rec.fbuid || rec.id, email: rec.email } }),
    reload: async () => { try { await pb.collection('users').authRefresh(); } catch (_) {} },
    toJSON() { return { uid: this.uid, email: this.email, displayName: this.displayName, emailVerified: this.emailVerified }; },
    delete: async () => { throw authErr('auth/operation-not-allowed', 'Deleting the account is not done on the Pi backup copy'); },
  };
}
function authErr(code, message) { const e = new Error(`Firebase: ${message} (${code}).`); e.code = code; return e; }

let cached = null, cachedTok = null;
function current() {
  if (!pb.authStore.isValid) { cached = null; cachedTok = null; return null; }
  if (cachedTok !== pb.authStore.token) { cached = toUser(pb.authStore.record || pb.authStore.model); cachedTok = pb.authStore.token; }
  return cached;
}

const AUTH = { name: '[DEFAULT]', config: {}, languageCode: null, settings: {}, tenantId: null,
  get currentUser() { return current(); }, get app() { return { name: '[DEFAULT]', options: {} }; },
  onAuthStateChanged: (cb, err) => onAuthStateChanged(AUTH, cb, err), signOut: () => signOut(AUTH),
  authStateReady: () => Promise.resolve(), useDeviceLanguage() {}, setPersistence: () => Promise.resolve() };

export function getAuth() { return AUTH; }
export function initializeAuth() { return AUTH; }
export const browserLocalPersistence = { type: 'LOCAL' }, browserSessionPersistence = { type: 'SESSION' },
  inMemoryPersistence = { type: 'NONE' }, indexedDBLocalPersistence = { type: 'LOCAL' };
export async function setPersistence() {}

function watch(cb) {
  const fire = () => { try { const u = current(); (typeof cb === 'function' ? cb : cb.next).call(null, u); } catch (e) { console.error(e); } };
  Promise.resolve().then(fire);                                   // Firebase reports the current state once, async
  let last = pb.authStore.token;
  return pb.authStore.onChange(() => { if (pb.authStore.token !== last) { last = pb.authStore.token; fire(); } });
}
export function onAuthStateChanged(_auth, cb) { return watch(cb); }
export function onIdTokenChanged(_auth, cb) { return watch(cb); }
export function beforeAuthStateChanged() { return () => {}; }

// The Pi copy's OWN login (L 2026-10-11: "its own login, not Firebase"): email + the Pi password, checked by PocketBase
// on the Pi alone. Set / change that password on /pbshim/account.html.
export async function signInWithEmailAndPassword(_auth, email, password) {
  // backup sign-in = 2 of 3 (Pi password + YubiKey code [+ a Firebase login if one still works]), checked on the Pi
  const totp = (window.prompt('Pi backup sign-in - YubiKey code (6 digits):') || '').trim();
  const { backupSignIn } = await import('../mode.js');
  try { const d = await backupSignIn(String(email || '').trim().toLowerCase(), password, totp); pb.authStore.save(d.token, d.record); }
  catch (e) { throw authErr('auth/invalid-credential', e.message || 'Backup sign-in needs 2 of 3: YubiKey code, Pi password, Firebase login'); }
  syncUid();
  return { user: current(), providerId: 'password', operationType: 'signIn' };
}
// keep the apps' localStorage "currentUserUID" on the Pi login (the pi-hub console on this origin writes SES's)
function syncUid() { try { const u = current(); if (u) localStorage.setItem('currentUserUID', u.uid); else localStorage.removeItem('currentUserUID'); } catch (_) {} }
pb.authStore.onChange(syncUid);
export async function signOut() { pb.authStore.clear(); }
export async function createUserWithEmailAndPassword() { throw authErr('auth/operation-not-allowed', 'Sign-ups stay on the real Firebase - the Pi backup copy only lets existing accounts in'); }
export async function signInAnonymously() { throw authErr('auth/operation-not-allowed', 'Anonymous sign-in is not on the Pi backup copy'); }
export async function sendEmailVerification() {}
export async function sendPasswordResetEmail() { throw authErr('auth/operation-not-allowed', 'Reset your password on the real site - the Pi copy follows it'); }
export async function updatePassword(_user, password) {   // the Pi password (not Firebase's)
  try { const d = await api('POST', '/api/pilocal/password', { password }); pb.authStore.save(d.token, d.record); }
  catch (e) { throw authErr(e.status === 400 ? 'auth/weak-password' : 'auth/requires-recent-login', e.message); }
}
export async function reauthenticateWithCredential(user) { return { user }; }
export async function updateProfile(user, profile = {}) {
  const rec = pb.authStore.record || pb.authStore.model; if (!rec) throw authErr('auth/no-current-user', 'No user signed in');
  const patch = {}; if ('displayName' in profile) patch.name = profile.displayName || '';
  if (Object.keys(patch).length) { const r = await pb.collection('users').update(rec.id, patch); pb.authStore.save(pb.authStore.token, r); }
}
export const EmailAuthProvider = { PROVIDER_ID: 'password', credential: (email, password) => ({ providerId: 'password', email, password }) };
export class GoogleAuthProvider { constructor() { this.providerId = 'google.com'; } addScope() {} setCustomParameters() {} }
export async function signInWithPopup() { throw authErr('auth/operation-not-allowed', 'Use email + password on the Pi backup copy'); }
export async function signInWithRedirect() { throw authErr('auth/operation-not-allowed', 'Use email + password on the Pi backup copy'); }
