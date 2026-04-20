// assets/js/catalog.js
// Catalog logic for Smart Solutions
import { app, auth, database, ref, onValue, get, off, onAuthStateChanged } from "./firebase-init.js";

const grid = document.getElementById("catalogGrid");
const emptyState = document.getElementById("emptyState");
const catSel = document.getElementById("categoryFilter");
const compSel = document.getElementById("componentFilter");
const searchBox = document.getElementById("searchBox");
const includeNoLink = document.getElementById("includeNoLink");

let BASE = null;
let inventoryRefLive = null;
let affiliateTag = "";
let signedInUID = null;
let allItems = [];

const join = (...parts) => parts.filter(Boolean).map(String).join("/").replace(/\/+/g, "/");
const dbRef = (...p) => ref(database, join(BASE, ...p));

onAuthStateChanged(auth, (user) => {
    signedInUID = user ? user.uid : null;
    setBase("public");
});

function setBase(newBase) {
    const needRebind = BASE !== newBase || !inventoryRefLive;
    BASE = newBase;
    if (!needRebind) return;
    if (inventoryRefLive) off(inventoryRefLive);
    inventoryRefLive = dbRef("inventory");
    onValue(inventoryRefLive, (snap) => {
        const data = snap.val() || {};
        const { items, categories, components } = normalize(data);
        allItems = items;
        renderFilters(categories, components);
        render();
    }, (err) => console.error("Inventory load failed:", err));
    get(dbRef("settings/affiliateTag"))
        .then(s => { affiliateTag = s.val() || ""; render(); })
        .catch(() => { affiliateTag = ""; });
}

function normalize(data) {
    const items = [];
    const catSet = new Set();
    const compSet = new Set();
    for (const category in data) {
        for (const component in data[category]) {
            for (const partKey in data[category][component]) {
                const e = data[category][component][partKey] || {};
                const displayName = (e.part && String(e.part).trim()) || partKey;
                catSet.add(category);
                compSet.add(component);
                items.push({
                    name: displayName,
                    rawKey: partKey,
                    category,
                    component,
                    description: e.description || "",
                    price: e.price,
                    affiliateUrl: e.affiliateUrl || "",
                    asin: e.asin || "",
                    imageUrl: (e.imageUrl && e.imageUrl.trim()) ? e.imageUrl : `assets/img/database/${encodeURIComponent(displayName)}.png`,
                    tags: Array.isArray(e.tags) ? e.tags : (e.tags ? [e.tags] : [])
                });
            }
        }
    }
    return {
        items,
        categories: [...catSet].sort(),
        components: [...compSet].sort()
    };
}

function renderFilters(categories, components) {
    catSel.innerHTML = '<option value="">All Categories</option>' +
        categories.map(c => `<option>${escapeHtml(c)}</option>`).join("");
    compSel.innerHTML = '<option value="">All Sub-Categories</option>' +
        components.map(c => `<option>${escapeHtml(c)}</option>`).join("");
}

catSel.addEventListener("change", render);
compSel.addEventListener("change", render);
searchBox.addEventListener("input", render);
includeNoLink?.addEventListener('change', render);

function render() {
    const cat = catSel.value;
    const comp = compSel.value;
    const q = (searchBox.value || "").trim().toLowerCase();
    const showNoLink = includeNoLink?.checked;
    const filtered = allItems.filter(it => {
        if (!showNoLink && !it.affiliateUrl) return false;
        const hitCat = !cat || it.category === cat;
        const hitComp = !comp || it.component === comp;
        const hay = `${it.name} ${it.rawKey || ""} ${it.category} ${it.component} ${it.description} ${(it.tags || []).join(" ")}`.toLowerCase();
        const hitQ = !q || hay.includes(q);
        return hitCat && hitComp && hitQ;
    });
    grid.innerHTML = "";
    if (!filtered.length) {
        emptyState.style.display = "block";
        return;
    }
    emptyState.style.display = "none";
    filtered.forEach(p => {
        const price = parseFloat(p.price);
        const priceText = isNaN(price) ? "" : `$${price.toFixed(2)}`;
        const linkHtml = p.affiliateUrl
            ? `<a class="cta-button" href="${escapeAttr(ensureAffiliateTag(p.affiliateUrl, affiliateTag || 'YOURTAG-20'))}" target="_blank" rel="sponsored nofollow noopener" data-asin="${escapeAttr(p.asin)}">Link to Product</a>`
            : `<span class="cta-button" style="opacity:.6;pointer-events:none;">No link yet</span>`;
        const el = document.createElement("div");
        el.className = "product-item";
        el.innerHTML = `
            <img src="${escapeAttr(p.imageUrl)}" alt="${escapeAttr(p.name)}" loading="lazy">
            <h3>${escapeHtml(p.name)}</h3>
            <p class="meta">${escapeHtml(p.category)} • ${escapeHtml(p.component)}</p>
            ${priceText ? `<p class="our-price">Our listed price: ${priceText}</p>` : ""}
            ${linkHtml}
        `;
        grid.appendChild(el);
    });
}

function ensureAffiliateTag(url, tag) {
    try {
        const u = new URL(url, window.location.origin);
        if (tag) u.searchParams.set("tag", tag);
        return u.toString();
    } catch {
        return url;
    }
}
function escapeHtml(s = "") {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s = "") { return escapeHtml(String(s)); }

// Initial bind
setBase("public");
