// telaid-shell.js - THE Telaid page header: logo + title, the sign-in form, Logout, and the signed-in line
// (L 2026-10-02: "match the radar app headers, show logged in user" + "the shell (shared header + login)").
// Every page used to carry its own copy of this block; now a page writes ONE line:
//     <header class="top-actions" data-shell="Radar Map">  ...optional extras...  </header>
// and this module fills it in at module-eval time - that is after the document is parsed but BEFORE
// DOMContentLoaded, which is when auth.js (login form / Logout) and sidebar.js (Menu) look for these ids.
// Extras: a child with data-in-login goes INSIDE the login section (the checklist's MS + OneDrive blocks);
// any other child stays in the header after it (the dashboard's MS block). data-logo="no" drops the logo.
// Load it from <head> as <script type="module" src="./assets/js/telaid-shell.js"> next to login.js.
import { auth, onAuthStateChanged, userLine, ACCOUNTS, LUIS_UID, pickedOwner, treeFor } from "./telaid-data.js?v=20261005h";

const LOGO = "./assets/img/telaid_logo.png";
export function mountShell(header) {
  const title = header.dataset.shell || document.title || "Telaid";
  const extras = [...header.children];
  const inLogin = extras.filter(e => e.hasAttribute("data-in-login")), after = extras.filter(e => !e.hasAttribute("data-in-login"));
  header.innerHTML = `<h1>${header.dataset.logo === "no" ? "" : `<a href="./index.html" class="logo-link" aria-label="Telaid tools index" style="display:inline-flex;line-height:0;text-decoration:none"><img src="${LOGO}" alt="" /></a> `}${title}</h1>
    <section id="login-section" class="logins-section">
      <form id="login-form" class="center">
        <label for="username">Email:</label>
        <input type="email" id="username" required />
        <label for="password">Password:</label>
        <input type="password" id="password" required />
        <button type="submit">Sign in</button>
      </form>
      <div class="auth-row">
        <button id="logout" style="display: none">Logout</button>
        <span id="firebaseStatus" class="status-text"></span>
      </div>
    </section>`;
  const sec = header.querySelector("#login-section");
  inLogin.forEach(e => sec.appendChild(e));
  // data-login-in="#sel" (L 2026-10-05 "can the telaid tools page have the login in the body"): the sign-in block moves
  // out of the header into that element on the page - same ids, so auth.js / sidebar.js find it as before
  const host = header.dataset.loginIn && document.querySelector(header.dataset.loginIn);
  if (host) { host.appendChild(sec); host.classList.add("has-login"); }
  after.forEach(e => header.appendChild(e));
  onAuthStateChanged(auth, u => { const st = (host || header).querySelector("#firebaseStatus"); if (st) st.textContent = userLine(u); if (host) host.classList.toggle("signed-in", !!u);
    // ACCOUNT dropdown - Luis only: whose tree these pages open (telaid-data pickedOwner). A change reloads the page on it.
    let sel = header.querySelector("#telaidAcct") || (host && host.querySelector("#telaidAcct"));
    if (u && u.uid === LUIS_UID) {
      if (!sel) { sel = document.createElement("select"); sel.id = "telaidAcct"; sel.title = "Whose data the Telaid apps open (Luis only)"; sel.setAttribute("aria-label", "Account");
        sel.style.cssText = "width:auto;max-width:100%;margin:0;padding:4px 8px;font-size:14px;border-radius:8px";
        // ONE control (L 2026-10-05 "combine them, it will show who's logged in in the dropdown anyway"): the signed-in line is
        // replaced by the dropdown, whose first choice is you (your email)
        sel.innerHTML = ACCOUNTS.map(([id, label]) => `<option value="${id}">${id === LUIS_UID ? (u.email || "Luis") + " (signed in)" : "Viewing: " + label}</option>`).join("");
        sel.addEventListener("change", () => { try { localStorage.setItem("telaidOwner", sel.value); } catch (_) {} location.reload(); });
        // in the sign-in block next to Logout (L 2026-10-05 "put it in the login section")
        const row = (host || header).querySelector(".auth-row") || header; row.appendChild(sel); }
      sel.value = pickedOwner(u); if (st) st.style.display = "none";
    } else { if (sel) sel.remove(); if (st) st.style.display = ""; }
  });
  return header;
}
window.telaidTreeFor = treeFor;   // the inline pages (checklist, dashboard, scanner) read their tree through this
document.querySelectorAll("header[data-shell]").forEach(mountShell);
