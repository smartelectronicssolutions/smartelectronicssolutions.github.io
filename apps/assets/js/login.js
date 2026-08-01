// Thin shim — the ONE auth implementation lives in ./auth.js (handles both login templates).
// Kept so existing imports (telaid tools, checklist) keep working; do not add logic here.
export * from "./auth.js";
