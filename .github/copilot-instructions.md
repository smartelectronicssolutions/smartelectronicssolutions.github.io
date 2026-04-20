# Copilot Instructions for this repository

## Big picture
- This repository is a static multi-site HTML/CSS/JS codebase, not a React/Vite/Next app.
- The repo has a root portfolio/hub site (`index.html`, `apps.html`, `websites.html`, `contact.html`) plus multiple self-contained app/site areas under `apps/` and `websites/`.
- Prefer small, local edits within the relevant subsite instead of broad repo-wide refactors.

---

## Repo structure

- Root pages (`index.html`, `apps.html`, `websites.html`, `contact.html`, `404.html`) are the main portfolio/navigation surface.
- `assets/` contains shared root-level CSS, JS, and images used by the main site.
- `components/header.html` and `components/footer.html` are shared HTML fragments at the root level.

### apps/ (Primary app system)

All apps now live under `apps/`, organized by type:


apps/
├── online/ # hosted / production-style apps (formerly "live")
├── local/ # local-only tools or dev utilities
└── telaid/ # migrated from /app


- Each area may contain its own assets (`css`, `js`, `img`)
- Apps are no longer assumed to be flat under `apps/`

### app/ (Deprecated)

- The `app/` folder is deprecated
- It now only exists as a redirect to `apps/telaid/`
- Do not add new files or features here

---

### websites/

- `websites/` contains separate project sites, each with its own folder, assets, and page structure  
  (examples: `websites/aa`, `websites/bma`, `websites/cpr`, `websites/crypto`, `websites/game`, etc.)

---

## How to make changes

- First identify the owning area before editing:
  - Root site
  - `apps/online`
  - `apps/local`
  - `apps/telaid`
  - A specific folder under `websites/`

- Keep changes scoped to that area’s local CSS/JS/assets unless the change is intentionally shared.

- Do not introduce a framework, bundler, or build step unless explicitly requested.

- Preserve existing relative paths; this repo relies heavily on folder-relative asset references.

---

## Project patterns

- Many sections are manually structured HTML pages, so repeated UI may need to be updated in more than one file.
- Some areas use local shared partials like `header.html`, `footer.html`, `nav.html`, or `sidebar.html` inside that project folder.
- Several apps rely on JSON-backed content or configuration files in nearby `assets/js/` folders.
- Firebase/auth-related logic appears in multiple areas; keep auth changes local to the relevant subsite unless clearly duplicated intentionally.

---

## Important examples

- Root shared scripts/styles: `assets/js/main.js`, `assets/js/projects.js`, `assets/css/styles.css`
- Root shared fragments: `components/header.html`, `components/footer.html`
- App areas:
  - `apps/online/`
  - `apps/local/`
  - `apps/telaid/`
- Site-specific apps: `websites/cpr/`, `websites/crypto/`, `websites/game/`, `websites/honeydo/`

---

## Editing rules

- Prefer editing existing files over creating parallel replacements.
- Keep file naming and structure consistent with the surrounding folder.
- When adding a new page, place its CSS/JS/images in the nearest existing asset structure for that section.
- When updating navigation or shared UI, check whether the same header/footer/nav is duplicated in sibling pages.
- Be careful with `.htaccess`, manifests, sitemap files, and auth scripts; only change them when the task specifically requires it.

---

## What not to assume

- Do not assume there is a package manager, build pipeline, component framework, or centralized app architecture.
- Do not move shared assets between root, `apps/`, and `websites/*` unless the repo already uses that pattern in the target area.

---

## Firebase / Data Architecture

- This repo uses Firebase Realtime Database as a backend for multiple independent systems.
- Data is structured and shared across apps; do not change structure unless explicitly required.

### Budget system
- Path: `budgetPlan/{year}`
- Structure:
  - `actuals[month][category] = number`
  - `categories[]` defines monthly targets
  - `_nameMap` maps category display names
  - `incomeYear` and `syncTotals` are aggregate values
- Categories often use emoji keys (e.g. 🍽️, 🏠, ⛽); preserve exact keys.

### Game system (websites/game)
- Path: `gameData`
- Includes:
  - `rooms`, `interactables`, `player`, `roomItems`
- Room layouts and coordinates are critical; do not modify structure.

### Quiz / progress system
- Path: `gameData/progress`

### General Firebase rules
- Do not rename keys or restructure data without explicit instruction.
- Assume frontend code depends on exact key names and nesting.
- Prefer adding new fields rather than modifying existing ones.
- Keep reads/writes scoped to the relevant app.