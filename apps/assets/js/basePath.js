import { auth, onAuthStateChanged } from './firebase-init.js';

export function resolveBasePath(user) {
  return user?.uid ? `${user.uid}` : 'public';
}

export function watchBasePath(onChange) {
  if (typeof onChange !== 'function') {
    throw new Error('watchBasePath requires a callback function');
  }

  return onAuthStateChanged(auth, (user) => {
    onChange(resolveBasePath(user), user);
  });
}

export function atPath(basePath, suffix) {
  const base = String(basePath || 'public').replace(/\/+$/, '');
  const tail = String(suffix || '').replace(/^\/+/, '');
  return tail ? `${base}/${tail}` : base;
}
