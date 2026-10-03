// photoviewer.js - THE photo pop-up (L 2026-10-03: "have the images pop up, the same way the checklist does it for
// devices" -> "one viewer, every app uses it"). openPhotoViewer(items, index, {onDelete}) shows one overlay with the
// picture, its name, Previous / Next, Download, Delete (only when onDelete is given) and Close. Keys: left / right / Esc;
// swipe left / right on a phone; tap the dark backdrop to close. items = [{url, name}] where url may be a string, a
// Promise, or a function returning one, so a page can list Storage refs first and fetch download URLs lazily.
// Styles are injected once, scoped under #pv-modal, in the page's own tokens (var(--borderColor) etc.) with dark
// fallbacks, so it fits every app's theme. The checklist's #modal and Details' own modal are the older copies of this.
let el = null, items = [], idx = 0, opts = {};
const CSS = `#pv-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:1000;padding:16px;align-items:center;justify-content:center}
#pv-modal.open{display:flex}
#pv-modal .pv-box{width:min(1000px,100%);max-height:95vh;overflow:auto;background:var(--cardBackground,var(--surface,#0f1419));border:1px solid var(--borderColor,var(--border,#334));border-radius:18px;padding:14px;box-shadow:0 20px 60px #0008;color:var(--textColor,var(--text,#e6e6e6))}
#pv-modal img{width:100%;max-height:72vh;object-fit:contain;border-radius:12px;background:#000;display:block}
#pv-modal .pv-name{margin:10px 0 0;font-size:.9rem;word-break:break-all;color:var(--mutedText,var(--muted,#9aa))}
#pv-modal .pv-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
#pv-modal .pv-row button{width:auto;margin:0;flex:none;font-size:.95rem;line-height:1.2;padding:8px 14px;border-radius:8px;border:1px solid var(--borderColor,var(--border,#334));background:transparent;color:inherit;cursor:pointer;box-shadow:none}
#pv-modal .pv-row button.pv-del{border-color:#b91c1c;color:#f87171}
#pv-modal .pv-row button:disabled{opacity:.5;cursor:default}
#pv-modal .pv-count{font-variant-numeric:tabular-nums;color:var(--mutedText,var(--muted,#9aa));font-size:.9rem}`;

function build() {
  if (el) return el;
  const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  el = document.createElement("div"); el.id = "pv-modal"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
  el.innerHTML = `<div class="pv-box"><img id="pv-img" alt="" /><p class="pv-name" id="pv-name"></p>
    <div class="pv-row"><button type="button" id="pv-prev">&#9664; Previous</button><button type="button" id="pv-next">Next &#9654;</button><span class="pv-count" id="pv-count"></span></div>
    <div class="pv-row"><button type="button" id="pv-dl">Download</button><button type="button" id="pv-del" class="pv-del">Delete</button><button type="button" id="pv-close">Close</button></div></div>`;
  document.body.appendChild(el);
  const q = id => el.querySelector("#pv-" + id);
  q("prev").onclick = () => showAt(idx - 1); q("next").onclick = () => showAt(idx + 1); q("close").onclick = close;
  q("dl").onclick = download; q("del").onclick = del;
  el.addEventListener("click", e => { if (e.target === el) close(); });
  document.addEventListener("keydown", e => {
    if (!el.classList.contains("open")) return;
    if (e.key === "Escape") close(); else if (e.key === "ArrowLeft") showAt(idx - 1); else if (e.key === "ArrowRight") showAt(idx + 1);
  });
  let tx = null; const img = q("img");   // swipe = previous / next
  img.addEventListener("touchstart", e => { tx = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  img.addEventListener("touchend", e => { if (tx === null) return; const dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 50) showAt(idx + (dx < 0 ? 1 : -1)); }, { passive: true });
  return el;
}
const urlOf = async it => typeof it.url === "function" ? it.url() : await it.url;

async function showAt(i) {
  if (!items.length) return;
  idx = (i + items.length) % items.length;
  const it = items[idx], q = id => el.querySelector("#pv-" + id);
  q("name").textContent = it.name || ""; q("count").textContent = `${idx + 1} / ${items.length}`;
  q("prev").disabled = q("next").disabled = items.length < 2;
  q("del").style.display = opts.onDelete ? "" : "none";
  q("img").removeAttribute("src"); q("img").alt = it.name || "";
  try { const u = await urlOf(it); if (items[idx] === it) q("img").src = u; }   // still on this one?
  catch (_) { q("name").textContent = (it.name || "") + " – couldn't load"; }
}
async function download() {
  const it = items[idx]; if (!it) return;
  let u; try { u = await urlOf(it); } catch (_) { return; }
  try {   // fetch -> blob -> save under its real name (the Storage bucket allows GET from anywhere)
    const b = await (await fetch(u)).blob(), o = URL.createObjectURL(b), a = document.createElement("a");
    a.href = o; a.download = it.name || "photo.jpg"; a.click(); setTimeout(() => URL.revokeObjectURL(o), 10000);
  } catch (_) { window.open(u, "_blank", "noopener"); }   // CORS said no - open it instead
}
async function del() {
  const it = items[idx]; if (!it || !opts.onDelete) return;
  if (!confirm(`Delete ${it.name || "this photo"}? This can't be undone.`)) return;
  const b = el.querySelector("#pv-del"); b.disabled = true;
  try { await opts.onDelete(it, idx); items.splice(idx, 1); if (!items.length) close(); else showAt(Math.min(idx, items.length - 1)); }
  catch (e) { alert("Delete failed: " + (e?.code || e?.message || e)); }
  finally { b.disabled = false; }
}
function close() { if (!el) return; el.classList.remove("open"); el.querySelector("#pv-img").removeAttribute("src"); }

/** Open the viewer on list[index]. options.onDelete(item, index) = async delete hook; omit it for a read-only viewer. */
export function openPhotoViewer(list, index = 0, options = {}) { build(); items = list.slice(); opts = options || {}; el.classList.add("open"); showAt(index); }
export function closePhotoViewer() { close(); }
