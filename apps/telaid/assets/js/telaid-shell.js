// telaid-shell.js - THE Telaid page header: logo + title, the sign-in form, Logout, and the signed-in line
// (L 2026-10-02: "match the radar app headers, show logged in user" + "the shell (shared header + login)").
// Every page used to carry its own copy of this block; now a page writes ONE line:
//     <header class="top-actions" data-shell="Radar Map">  ...optional extras...  </header>
// and this module fills it in at module-eval time - that is after the document is parsed but BEFORE
// DOMContentLoaded, which is when auth.js (login form / Logout) and sidebar.js (Menu) look for these ids.
// Extras: a child with data-in-login goes INSIDE the login section (the checklist's MS + OneDrive blocks);
// any other child stays in the header after it (the dashboard's MS block). data-logo="no" drops the logo.
// Load it from <head> as <script type="module" src="./assets/js/telaid-shell.js"> next to login.js.
import { auth, onAuthStateChanged, userLine } from "./telaid-data.js?v=1005e";

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
  onAuthStateChanged(auth, u => { const st = (host || header).querySelector("#firebaseStatus"); if (st) st.textContent = userLine(u); if (host) host.classList.toggle("signed-in", !!u); });
  return header;
}
document.querySelectorAll("header[data-shell]").forEach(mountShell);
