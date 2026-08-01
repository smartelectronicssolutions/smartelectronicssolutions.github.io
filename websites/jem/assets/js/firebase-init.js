// Thin shim — makes websites/jem path-compatible with the je-auto deploy repo.
// Here it re-exports the ONE real init at the repo root; in je-auto the same
// path is a real bundled file. So jem pages import "./assets/js/firebase-init.js"
// in BOTH repos and a plain file copy deploys cleanly. Do not add logic here.
export * from "../../../../assets/js/firebase-init.js";
