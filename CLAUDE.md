# smartelectronicssolutions.github.io

Public site + apps for Smart Electronics Solutions. The local docker `site` container
serves this working copy live at :8081 / luissolutions.us — edits are visible before
any commit. **Do not `git push` unless asked.**

## Building or editing apps in `apps/online/`

Read `apps/online/_house-style.md` FIRST — it defines the shared auth/init/css/data
pattern every app follows. Start new apps by copying `apps/online/_template.html`
**in place** (its relative paths only resolve from that directory).

Non-negotiables (details in the house-style doc):
- Never inline a `firebaseConfig` or hand-roll login UI — shared `auth.js` + `firebase-init.js` only.
- Keep each page's own script inline in the page — no per-page file splits.
- Data path: `BASE_PATH = user ? user.uid : "public"`.
- `apps/telaid/` apps intentionally use the Telaid uid, not the signed-in user.

## Other conventions

- `websites/kh/` = Kame House household hub (has its own shared header/auth pattern — see its files).
- `hub.html` / `workspace.html` are L's personal dashboards (Firebase-backed; the hub hosts the Droplet Console).
- Journal articles render via `apps/assets/js/onlinejournal.js`; article schema and link rules live with the journal app.
