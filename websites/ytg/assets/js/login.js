// ytg's own copy (2026-10-03, L: every site under websites/ carries its own files) of apps/assets/js/login.js.
// Thin shim — the ONE auth implementation lives in ./auth.js (handles both login templates).
// Kept so existing imports (telaid tools, checklist) keep working; do not add logic here.
export * from "./auth.js";
