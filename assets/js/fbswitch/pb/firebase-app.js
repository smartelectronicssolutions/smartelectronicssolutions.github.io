// firebase-app stand-in for the Pi test copy (Pilet, 2026-10-11): apps keep calling initializeApp(config); nothing
// here talks to Google - the data lives in PocketBase on the Pi.
const apps = new Map();
export const SDK_VERSION = 'pi-pocketbase';
export function initializeApp(options = {}, name = '[DEFAULT]') {
  if (typeof name === 'object' && name) name = name.name || '[DEFAULT]';
  if (!apps.has(name)) apps.set(name, { name, options, automaticDataCollectionEnabled: false });
  return apps.get(name);
}
export function getApps() { return [...apps.values()]; }
export function getApp(name = '[DEFAULT]') {
  if (!apps.has(name)) { const e = new Error(`Firebase: No Firebase App '${name}' has been created (app/no-app).`); e.code = 'app/no-app'; throw e; }
  return apps.get(name);
}
export async function deleteApp(app) { if (app) apps.delete(app.name); }
export function registerVersion() {}
export function setLogLevel() {}
