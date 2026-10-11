// firebase-functions stand-in (Pilet, 2026-10-11): Cloud Functions run on Google, not on the Pi test copy.
export function getFunctions() { return {}; }
export function connectFunctionsEmulator() {}
export function httpsCallable(_fns, name) {
  return async () => { const e = new Error(`Cloud function "${name}" is not on the Pi test copy (it runs on the real Firebase).`); e.code = 'functions/unavailable'; throw e; };
}
