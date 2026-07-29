import { ref, database, onValue, set, get, remove } from "../../../assets/js/firebase-init.js";

// New schema: share/devices/{brand}/{model}: { img: "filename.png", repairs: [{name, price}, ...] }
// (was: share/devices/Phones/{brand}/{model}/{repair}: scalar price — flat tree)

const inputFieldEl = document.getElementById("input-field");
const repairFieldEl = document.getElementById("repair-field");
const categoryRadios = document.querySelectorAll('input[name="category"]');
const addButtonEl = document.getElementById("add-button");
const phonesListEl = document.getElementById("phones-list");
const phoneNameEl = document.getElementById("phone-name-input");
const imageFieldEl = document.getElementById("image-field");
const searchInputEl = document.getElementById('search-input');
const exportButtonEl = document.getElementById("export-button");

let selectedCategory = localStorage.getItem("selectedCategory") || "Apple";

const brandPath = (brand) => `share/devices/${brand}`;
const modelPath = (brand, model) => `share/devices/${brand}/${model}`;

// ─── input sanitization ───
const FORBIDDEN = ['$', '#', '[', ']', '/'];
function sanitizeInput(input) {
  let v = input;
  for (const c of FORBIDDEN) v = v.split(c).join('');
  return v;
}
document.addEventListener('input', (e) => {
  if (e.target.tagName?.toLowerCase() === 'input') {
    const sanitized = sanitizeInput(e.target.value);
    if (e.target.value !== sanitized) e.target.value = sanitized;
  }
});
document.addEventListener('paste', (e) => {
  if (e.target.tagName?.toLowerCase() === 'input') {
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    const sanitized = sanitizeInput(text);
    if (text !== sanitized) {
      e.preventDefault();
      e.target.value += sanitized;
    }
  }
});

// ─── category change ───
categoryRadios.forEach((radio) => {
  radio.addEventListener("change", function () {
    selectedCategory = this.value;
    localStorage.setItem("selectedCategory", selectedCategory);
    updateCategoryRadios();
    renderList();
  });
});
function updateCategoryRadios() {
  categoryRadios.forEach((r) => { r.checked = r.value === selectedCategory; });
}

// ─── search ───
searchInputEl.addEventListener("input", renderList);

// ─── add a repair (creates the model if it doesn't exist) ───
addButtonEl.addEventListener("click", async () => {
  const model = phoneNameEl.value.trim();
  const repairName = repairFieldEl.value.trim();
  const priceStr = inputFieldEl.value.trim();
  const img = imageFieldEl?.value.trim() || "";
  if (!model || !repairName || !priceStr) {
    alert("Please fill in all fields before adding data.");
    return;
  }
  const price = parseFloat(priceStr);
  if (Number.isNaN(price)) { alert("Price must be a number."); return; }
  try {
    await addRepair(selectedCategory, model, repairName, price, img);
    inputFieldEl.value = "";
    repairFieldEl.value = "";
    phoneNameEl.value = "";
    if (imageFieldEl) imageFieldEl.value = "";
  } catch (e) {
    console.error("add error:", e);
    alert("Error adding repair: " + e.message);
  }
});

async function addRepair(brand, model, repairName, price, img = "") {
  const modelRef = ref(database, modelPath(brand, model));
  const snap = await get(modelRef);
  const entry = snap.val() || { img: "", repairs: [] };
  if (!Array.isArray(entry.repairs)) entry.repairs = [];
  // Only overwrite img when caller provided one — preserves existing img on edits.
  if (img) entry.img = img;
  const idx = entry.repairs.findIndex(r => (r?.name || "").toLowerCase() === repairName.toLowerCase());
  if (idx >= 0) entry.repairs[idx] = { name: repairName, price };
  else entry.repairs.push({ name: repairName, price });
  await set(modelRef, entry);
}

// ─── live-subscribed table render ───
let unsubscribeBrand = null;

function renderList() {
  if (unsubscribeBrand) { unsubscribeBrand(); unsubscribeBrand = null; }
  const brandRef = ref(database, brandPath(selectedCategory));
  unsubscribeBrand = onValue(brandRef, (snap) => {
    const data = snap.val() || {};
    drawTable(data, searchInputEl.value.trim().toLowerCase());
  });
}

function drawTable(brandData, search) {
  phonesListEl.innerHTML = "";
  const models = Object.keys(brandData).sort();
  for (const model of models) {
    const entry = brandData[model] || {};
    const repairs = Array.isArray(entry.repairs) ? entry.repairs : [];
    const img = entry.img || "";
    const modelMatch = !search || model.toLowerCase().includes(search);
    for (let i = 0; i < repairs.length; i++) {
      const r = repairs[i] || {};
      const name = r.name || "";
      const price = r.price ?? "";
      const repairMatch = !search
        || name.toLowerCase().includes(search)
        || String(price).toLowerCase().includes(search);
      if (!modelMatch && !repairMatch) continue;
      appendRow(model, i, name, price, img);
    }
  }
}

function appendRow(model, repairIndex, repairName, price, img) {
  const row = phonesListEl.insertRow();
  const modelInput  = makeCellInput(row, model);
  // Image cell — all rows of the same model show the same img; Update on any row
  // writes back the model's img. Edits propagate to every row after the next render.
  const imageInput  = makeCellInput(row, img);
  const repairInput = makeCellInput(row, repairName);
  const priceInput  = makeCellInput(row, price);
  const actionCell  = row.insertCell();

  // Update — handles model rename + repair rename + price change + img change
  const updateBtn = document.createElement("button");
  updateBtn.textContent = "Update";
  updateBtn.addEventListener("click", async () => {
    const newModel = modelInput.value.trim();
    const newImg = imageInput.value.trim();
    const newRepairName = repairInput.value.trim();
    const newPriceStr = priceInput.value.trim();
    if (!newModel || !newRepairName || !newPriceStr) {
      alert("Fill in all fields before updating.");
      return;
    }
    if (FORBIDDEN.some(c => (newModel + newRepairName + newPriceStr).includes(c))) {
      alert("Contains forbidden characters. Remove '$', '#', '[', ']', '/'.");
      return;
    }
    const newPrice = parseFloat(newPriceStr);
    if (Number.isNaN(newPrice)) { alert("Price must be a number."); return; }
    try {
      await updateRow(selectedCategory, model, repairIndex, repairName, newModel, newRepairName, newPrice, newImg);
    } catch (e) {
      console.error("update error:", e);
      alert("Error updating: " + e.message);
    }
  });
  actionCell.appendChild(updateBtn);

  // Delete — removes just this repair from the model's repairs[] array
  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", async () => {
    if (!confirm(`Delete "${repairName}" from ${model}?`)) return;
    try {
      await deleteRepair(selectedCategory, model, repairIndex, repairName);
    } catch (e) {
      console.error("delete error:", e);
      alert("Error deleting: " + e.message);
    }
  });
  actionCell.appendChild(deleteBtn);
}

function makeCellInput(row, value) {
  const cell = row.insertCell();
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  cell.appendChild(input);
  return input;
}

async function updateRow(brand, oldModel, oldIndex, oldRepairName, newModel, newRepairName, newPrice, newImg) {
  const newRepair = { name: newRepairName, price: newPrice };
  if (oldModel === newModel) {
    // In-place: same model, swap the repair entry + maybe update img
    const modelRef = ref(database, modelPath(brand, oldModel));
    const entry = (await get(modelRef)).val() || { img: "", repairs: [] };
    if (!Array.isArray(entry.repairs)) entry.repairs = [];
    // Resolve target index — index first, fall back to name (array may have shifted)
    let idx = oldIndex;
    if ((entry.repairs[idx]?.name || "") !== oldRepairName) {
      idx = entry.repairs.findIndex(r => (r?.name || "") === oldRepairName);
    }
    if (idx >= 0) entry.repairs[idx] = newRepair;
    else entry.repairs.push(newRepair);
    // Always set img to whatever the row had — empty clears the field intentionally.
    entry.img = newImg || "";
    await set(modelRef, entry);
  } else {
    // Renamed model → remove repair from old, add to new (carry img to the new entry)
    const oldRef = ref(database, modelPath(brand, oldModel));
    const oldEntry = (await get(oldRef)).val() || { img: "", repairs: [] };
    const oldRepairs = Array.isArray(oldEntry.repairs) ? oldEntry.repairs : [];
    const remaining = oldRepairs.filter((r, i) => !(i === oldIndex && (r?.name || "") === oldRepairName));
    if (remaining.length === 0 && !oldEntry.img) {
      await remove(oldRef);
    } else {
      await set(oldRef, { ...oldEntry, repairs: remaining });
    }

    const newRef = ref(database, modelPath(brand, newModel));
    const newEntry = (await get(newRef)).val() || { img: "", repairs: [] };
    if (!Array.isArray(newEntry.repairs)) newEntry.repairs = [];
    const idx = newEntry.repairs.findIndex(r => (r?.name || "").toLowerCase() === newRepairName.toLowerCase());
    if (idx >= 0) newEntry.repairs[idx] = newRepair;
    else newEntry.repairs.push(newRepair);
    newEntry.img = newImg || newEntry.img || "";
    await set(newRef, newEntry);
  }
}

async function deleteRepair(brand, model, repairIndex, repairName) {
  const modelRef = ref(database, modelPath(brand, model));
  const entry = (await get(modelRef)).val();
  if (!entry) return;
  const repairs = Array.isArray(entry.repairs) ? entry.repairs : [];
  let idx = repairIndex;
  if ((repairs[idx]?.name || "") !== repairName) {
    idx = repairs.findIndex(r => (r?.name || "") === repairName);
  }
  if (idx < 0) return;
  repairs.splice(idx, 1);
  if (repairs.length === 0 && !entry.img) {
    await remove(modelRef);
  } else {
    await set(modelRef, { ...entry, repairs });
  }
}

// ─── CSV export of the current brand ───
exportButtonEl.addEventListener("click", async () => {
  try {
    const snap = await get(ref(database, brandPath(selectedCategory)));
    const data = snap.val() || {};
    let csv = "Phone Model,Repair Type,Price\n";
    const models = Object.keys(data).sort();
    for (const model of models) {
      const repairs = Array.isArray(data[model]?.repairs) ? data[model].repairs : [];
      for (const r of repairs) {
        const name = (r?.name || "").replace(/"/g, '""');
        const price = r?.price ?? "";
        csv += `"${model}","${name}","${price}"\n`;
      }
    }
    const link = document.createElement('a');
    link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    link.download = `lhr-pricing-${selectedCategory}.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (e) {
    console.error("export error:", e);
    alert("Export failed: " + e.message);
  }
});

// ─── initial render ───
updateCategoryRadios();
renderList();
