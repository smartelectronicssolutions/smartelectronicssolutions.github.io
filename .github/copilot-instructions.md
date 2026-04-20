# Copilot Instructions for Smart Solutions Platform

## Big Picture
This is a **unified static HTML/CSS/JS platform** — not React, not a framework. One site, five navigation sections (Home · Electronics · Workspace · Shop · Contact). All pages share a single master.css file and component-based header/footer.

**Architecture Philosophy:** Right-sized tech for the problem. Clean, maintainable vanilla JS with modern patterns (event delegation, CSS variables, semantic HTML). No build step, no bundler, no framework bloat.

---

## Repository Structure (v4.1 — April 2026)

### Root Pages (5 Main Sections)
```
smartelectronicssolutions.github.io/
├── index.html          ← Home (hero, divisions, updates, CTA)
├── electronics.html    ← Low voltage, tech support, repair calculator
├── workspace.html      ← Portfolio sites/apps, iframe viewer, auth
├── shop.html          ← The Emporium (tools/gear for pros)
├── contact.html       ← Contact form with FormSubmit
├── connect.html       ← Remote support landing
├── repair.html        ← Legacy redirect (if exists)
```

### Shared Components
```
components/
├── header.html        ← Shared nav with auto-active state + theme toggle
└── footer.html        ← Shared footer links
```

### Assets (Unified)
```
assets/
├── css/
│   └── master.css     ← v4.1 unified stylesheet (dark/light + 6 themes)
├── js/
│   ├── main.js                  ← Header/footer loading, nav toggle
│   ├── firebase-config.js       ← Centralized Firebase config
│   ├── firebase-init.js         ← Firebase init with auth
│   ├── firebase-init-noauth.js  ← Alias for no-auth imports
│   ├── auth.js                  ← Re-exports from firebase-init
│   ├── visitLogger.js           ← Visit tracking
│   ├── contact.js               ← Email copy helper
│   ├── cpr.js                   ← Repair calculator
│   ├── catalog.js               ← Catalog functionality
│   └── projects.js              ← Projects data
└── img/                 ← Unified image directory
    ├── ai/
    ├── database/
    ├── cpr/
    ├── ses/
    └── [various shared images]
```

### Apps (Separate Repository)
The `apps/` folder still exists but is treated as a **separate repository/project**. It's linked from workspace.html but maintained independently. Do not modify `apps/` structure unless explicitly requested.

---

## CSS Architecture — master.css v4.1

### Theme System
**Base Themes:**
- Dark (default) — `--bg: #0d1b2a`
- Light (via `html.light` class) — `--bg: #f5f5f5`

**Section Themes (6):**
Applied via `html.theme-[name]` class:
1. `theme-electronics` — brown/tan (`--primary: #b87c4a`)
2. `theme-web` — green (`--primary: #3a9a5c`)
3. `theme-apps` — teal (`--primary: #2a9d8f`)
4. `theme-contacts` — purple (`--primary: #9b59b6`)
5. `theme-security` — red (`--primary: #c0392b`)
6. `theme-finance` — gold (`--primary: #d4af37`)

**CSS Variables (Custom Properties):**
```css
:root {
  --bg, --surface, --surface2, --border
  --text, --muted, --primary, --plight, --accent
  --radius, --gap, --max, --nav-h, --font, --sm
}
```

### Typography
- Font: Poiret One (Google Fonts)
- Base size: 1.05rem
- Line height: 1.7
- Headings: clamp() for fluid responsive sizing

### Components Defined in master.css
- `.btn`, `.btn-outline`, `.btn-danger`
- `.card` — standard card with hover effects
- `.modal-overlay`, `.modal-box`, `.modal-close`
- `table`, `th`, `td` — styled tables
- `.guide-card`, `.guide-grid` — guide/tutorial cards
- `.wrap` — max-width container (1100px)
- `.label` — small uppercase label

### Responsive Breakpoint
- Mobile: `@media (max-width: 768px)`
- Hamburger nav appears below 768px
- Grids adapt to screen size via `auto-fit`/`auto-fill`

---

## JavaScript Architecture

### Code Quality Standards
✅ **Event delegation pattern** — no inline onclick handlers  
✅ **No dead code** — every file serves a purpose  
✅ **Modular imports** — proper ES6 module structure  
✅ **Single source of truth** — Firebase config centralized  

### Active JS Files

**1. main.js**
- Loads `components/header.html` and `components/footer.html`
- Handles hamburger nav toggle (event delegation)
- Populates project/app thumbnails where needed
- Core function: `fetchWithFallback(targetId, primaryPath, fallbackPath)`

**2. firebase-config.js**
```javascript
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "playground-e3690.firebaseapp.com",
  databaseURL: "https://playground-e3690-default-rtdb.firebaseio.com",
  projectId: "playground-e3690",
  // ...
};
```
**Rule:** This is the ONLY place Firebase config lives. All other files import from here.

**3. firebase-init.js**
- Initializes Firebase app and services
- Exports: `auth`, `database`, all Firebase functions
- Used by pages/apps that need authentication

**4. firebase-init-noauth.js**
- Simple re-export alias for `firebase-init.js`
- Used by apps that only need database access

**5. auth.js**
- Re-exports Firebase auth from `firebase-init.js`
- Keeps imports clean

**6. visitLogger.js**
- Logs visits to Firebase: timestamp, URL, page title
- **No external API calls** (removed ipify dependency)
- Import path: `'./firebase-init-noauth.js'` (not relative to apps/)

**7. contact.js**
- Email copy-on-click helper for contact page
- Minimal, focused functionality

**8. cpr.js**
- Cell Phone Repair calculator logic
- Brand/model selection, pricing calculation

**9. catalog.js**
- Catalog/inventory management
- Used by shop.html

**10. projects.js**
- Projects data array
- Used for portfolio display

---

## Firebase Integration

### Database: playground-e3690
**Config Location:** `assets/js/firebase-config.js`

**Data Structure:**
```
playground-e3690/
├── public/
│   ├── log/
│   │   ├── visitCount       ← incremented on each visit
│   │   └── visits/          ← individual visit logs
│   └── inventory/           ← shop products (public view)
└── [user-id]/
    └── inventory/           ← user-specific workspace view
```

**Usage:**
- `visitLogger.js` → writes to `public/log/`
- `shop.html` → reads from `inventory/`
- `workspace.html` → auth-gated features

**Rules:**
- Do NOT rename keys or restructure without explicit instruction
- Assume frontend depends on exact key names
- Prefer adding new fields over modifying existing ones

---

## Component System

### Header (components/header.html)
**Features:**
- Logo box with link to `index.html`
- Site name display
- Hamburger menu (mobile toggle)
- Nav links with auto-active state detection
- Theme toggle button (☀️/🌙)

**JavaScript (inline):**
- Auto-detects current page, adds `.active` class
- Theme toggle with localStorage persistence
- Respects system preference on first visit

**Rule:** The hamburger click handler is in `main.js`, NOT in header.html

### Footer (components/footer.html)
**Features:**
- Copyright notice
- Quick links to all sections
- Minimal, clean design

**Rule:** Keep footer simple, no JS needed

---

## Page-Specific Patterns

### electronics.html
**Features:**
- Tab navigation (Low Voltage, Tech Support, Repair Calculator)
- Service cards with modal popups (`.scard[data-modal]`)
- Image sliders with prev/next controls
- Repair calculator (loaded via `cpr.js`)

**JavaScript Pattern:**
```javascript
// Tab switching via event delegation
document.querySelector('.tabs').addEventListener('click', e => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  // switch logic
});

// Slider controls
document.addEventListener('click', e => {
  const btn = e.target.closest('.sbtn');
  if (!btn) return;
  const sliderId = btn.dataset.slider;
  const dir = parseInt(btn.dataset.dir);
  // slide logic
});
```

### workspace.html
**Features:**
- Sidebar navigation (sticky, responsive)
- Dynamic content loading from external JSON files:
  - `https://luissolutions.github.io/websites/sites.json`
  - `https://luissolutions.github.io/apps/apps.json`
- Filter pills (All, Sites, Apps, Client / Finance, Jobs, etc.)
- Iframe viewer for embedded apps
- Auth integration for sync features

**Data Pattern:**
```javascript
async function fetchSites() {
  const res = await fetch('https://luissolutions.github.io/websites/sites.json');
  return await res.json();
}
```

**Rule:** These external JSON files are managed separately. Do not assume they're in this repo.

### shop.html
**Features:**
- Firebase inventory integration
- View toggle (public/workspace)
- Featured products grid (randomized)
- Amazon Associates affiliate links

**Firebase Pattern:**
```javascript
const inventoryRef = ref(database, 'public/inventory');
onValue(inventoryRef, (snapshot) => {
  const data = snapshot.val();
  // render products
});
```

### contact.html
**Features:**
- Contact form with FormSubmit integration
- Email copy helper (via `contact.js`)
- Success/error states

**FormSubmit URL:** `https://formsubmit.co/ajax/luis@smartelectronicssolutions.com`

---

## How to Make Changes

### Step 1: Identify the Scope
Ask yourself:
- Is this a change to **shared components** (header/footer)?
- Is this a change to **master.css** (affects all pages)?
- Is this a change to **one specific page**?
- Is this a change to **Firebase data structure**?

### Step 2: Locate the Relevant Files
- Shared nav/footer → `components/header.html` or `components/footer.html`
- Styles → `assets/css/master.css`
- Page-specific JS → `<script>` block in that page or relevant `assets/js/` file
- Firebase config → `assets/js/firebase-config.js` ONLY

### Step 3: Make the Edit
- **Prefer editing existing files** over creating new ones
- **Keep changes scoped** to the relevant area
- **Preserve existing patterns** (event delegation, CSS variables, etc.)
- **Test across pages** if changing shared components

### Step 4: Verify
- Check that the change works on all affected pages
- Verify responsive behavior (mobile/desktop)
- Test theme toggle if CSS was changed

---

## What NOT to Do

❌ **Do NOT:**
- Add a framework (React, Vue, etc.)
- Add a build step or bundler
- Create duplicate CSS files
- Add inline onclick handlers
- Modify Firebase data structure without approval
- Break existing relative paths
- Over-engineer solutions

✅ **Do:**
- Use vanilla JS with modern patterns
- Keep event handlers in `<script>` blocks or `.js` files
- Use event delegation for dynamic content
- Maintain the CSS variable system
- Keep code clean and readable

---

## Editing Rules

### CSS Changes
- Always use CSS variables (`var(--primary)` not `#4a7ab5`)
- Test in both dark and light modes
- Verify all 6 section themes still work
- Check mobile responsiveness

### JavaScript Changes
- Use event delegation when possible
- No inline onclick/onload/etc. attributes
- Proper error handling for async operations
- Console.log cleanup before commit

### HTML Changes
- Maintain semantic structure (header, main, footer, section, nav)
- Include alt text on all images
- Use proper heading hierarchy (h1 → h2 → h3)
- Keep accessibility in mind (ARIA labels where needed)

### Firebase Changes
- Never modify `firebase-config.js` without explicit instruction
- Test database reads/writes in development first
- Preserve existing data structure
- Add new fields, don't rename existing ones

---

## Important File Relationships

### Header/Footer Loading
```
index.html → main.js → fetchWithFallback() → components/header.html
```

### Firebase Initialization Chain
```
firebase-config.js → firebase-init.js → auth.js
                                      → firebase-init-noauth.js
```

### Theme System
```
components/header.html → theme toggle JS → html.light class → master.css
```

---

## Common Tasks

### Adding a New Page
1. Create `[name].html` in root
2. Add nav link to `components/header.html`
3. Include theme class if needed: `<html class="theme-[section]">`
4. Link to `assets/css/master.css`
5. Add header/footer placeholders + `assets/js/main.js`

### Updating Shared Navigation
1. Edit `components/header.html`
2. Verify auto-active state logic handles new link
3. Test on all 5 main pages

### Changing Theme Colors
1. Edit color values in `master.css` under appropriate theme selector
2. Test in both dark and light modes
3. Verify contrast ratios for accessibility

### Adding a Firebase Feature
1. Verify `firebase-config.js` has correct config
2. Import from `firebase-init.js` or `firebase-init-noauth.js`
3. Structure data writes to match existing patterns
4. Test with actual Firebase database

---

## Code Quality Standards

### Must Have
✅ Clean, readable code  
✅ Consistent indentation (2 spaces)  
✅ Meaningful variable/function names  
✅ Comments for complex logic only  
✅ Error handling on async operations  

### Must Avoid
❌ Dead code  
❌ Console.log statements in production  
❌ Inline event handlers  
❌ Magic numbers (use CSS variables)  
❌ Overly complex solutions  

---

## Testing Checklist

Before considering any change complete:

- [ ] Works on Chrome (desktop)
- [ ] Works on Firefox (desktop)
- [ ] Works on Safari (desktop)
- [ ] Works on Chrome (mobile)
- [ ] Works on Safari (iOS)
- [ ] Theme toggle works (dark ↔ light)
- [ ] Hamburger menu works (mobile)
- [ ] Active nav state is correct
- [ ] No console errors
- [ ] Responsive at 768px breakpoint

---

## Platform State (April 2026)

**Version:** 4.1  
**Status:** Production-ready  
**Firebase:** playground-e3690  
**Pages:** 5 main sections + support pages  
**Components:** Shared header/footer  
**CSS:** Unified master.css with 6 themes  
**JS:** 10 active files, zero dead code  

**Code Quality:**
- Zero inline event handlers
- No dead files
- Event delegation pattern throughout
- Proper separation of concerns
- CSP-ready

---

## Final Principle

This platform prioritizes **maintainability** and **performance** over complexity. 

Every line of code should be:
- Necessary
- Understandable
- Maintainable by anyone

If a change makes the codebase harder to understand, reconsider the approach.

---

*Last Updated: April 20, 2026*  
*Platform Version: 4.1*
