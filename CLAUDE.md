# smartelectronicssolutions.github.io

Public site + apps for Smart Electronics Solutions. The local docker `site` container
serves this working copy live at :8081 / luissolutions.us — edits are visible before
any commit. **Do not `git push` unless asked.**

## Building or editing apps in `apps/online/`

Read the **House Style journal** FIRST — Firebase `journalArticles/1788865988976` (private, uid
`7cIh8…`; Droplet reads it via the recall mirror, CompMan via `get_journal`). It defines the shared
auth/init/css/data pattern every app follows. Start a new app by copying `_meta/_template.html`
into `apps/online/<name>.html` — it must land in `apps/online/` for its `../assets/…` paths to resolve.
(The house-style doc + template moved out of `apps/online/` 2026-09-08 so that folder holds only real apps.)

Non-negotiables (details in the house-style journal):
- Never inline a `firebaseConfig` or hand-roll login UI — shared `auth.js` + `firebase-init.js` only.
- Keep each page's own script inline in the page — no per-page file splits.
- Data path: `BASE_PATH = user ? user.uid : "public"`.
- `apps/telaid/` apps intentionally use the Telaid uid, not the signed-in user.

## Other conventions

- `websites/kh/` = Kame House household hub (has its own shared header/auth pattern — see its files).
- `hub.html` / `workspace.html` are L's personal dashboards (Firebase-backed; the hub hosts the Droplet Console).
- Journal articles render via `apps/assets/js/onlinejournal.js`; article schema and link rules live with the journal app.
