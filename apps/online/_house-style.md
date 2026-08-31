# Online Apps — House Style

The shared pattern every app in `apps/online/` follows. **Start a new app by copying `_template.html`** and replacing the title, `<h1>`, the app `<style>`, the `NODE`, and the main content. Don't reinvent the parts below.

## The 4 dimensions (what "consistent" means here)

1. **Auth** — load the shared module `../assets/js/auth.js`. It wires the login button, login box, and logout for the standard markup (`#auth-btn` / `#login-inline` / `#do-login`, or the classic `#login-form` on telaid tools). **Never hand-roll `signInWithEmailAndPassword` / login UI in the page.**
2. **Init** — import Firebase from `../assets/js/firebase-init.js` (a shim that `export *`s the one real init at repo-root `assets/js/firebase-init.js`, which holds the single `firebaseConfig`). **Never inline a `firebaseConfig` or call `initializeApp` in a page.**
3. **Structure** — `../assets/css/online.css` for the shared look, the `ss-theme` light/dark bootstrap in `<head>`, the `.logo-box` home link, and the `#theme-toggle`. App-specific CSS goes in the page `<style>` only.
4. **Data** — `BASE_PATH = user ? user.uid : "public"`; read/write under `${BASE_PATH}/<node>`. Signed-in = your private uid node; signed-out = the shared `public` node (the dual-read convention).

## Skeleton (order matters)

**Head:** `online.css` → favicon → `ss-theme` IIFE → `auth.js` (module) → optional per-app helper → app `<style>`.
**Body:** `<header>` with `.logo-box` + `<h1>` + `.auth-bar` (`#auth-label`/`#auth-btn`) + `#theme-toggle` + `#login-inline` → `<main>` with an app-shell div.
**Script (inline module at end of body):** import from `firebase-init.js` → `BASE_PATH`/`NODE` → `onAuthStateChanged` sets the path + loads → `load`/`save`/`render`.

## Rules of thumb

- **Keep the page's own script inline in the page** — only `auth.js` / `firebase-init.js` / `online.css` (and vetted helpers like `search.js`) are shared files. No per-page file splits.
- `auth.js` handles the login/logout **UI**; the page's own `onAuthStateChanged` handles **data** (set `BASE_PATH`, load). Both listeners coexist — that's expected.
- **Paths from `apps/online/`:** shared assets are `../assets/...` (the `apps/assets/` shims); the home logo + favicon reach the repo root via `../../`.
- **Telaid apps** (`apps/telaid/`) intentionally read/write under the Telaid uid (`SDN0vK…`), not the signed-in user — that's by design, not a deviation.

## Reference apps

`onlinefinancials.html`, `onlineinventory.html`, `onlinelearn.html` are the canonical examples. `_template.html` is the blank starting point distilled from them.
