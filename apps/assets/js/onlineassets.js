import {
    auth, onAuthStateChanged,
    storage, storageRef, uploadBytesResumable, deleteObject, getDownloadURL,
    database, ref, set, remove, update, get, onValue, runTransaction
} from "./firebase-init.js";

let createListenerRegistry = () => {
    const cleanups = new Set();
    return {
        track(unsubscribe) {
            if (typeof unsubscribe === 'function') cleanups.add(unsubscribe);
            return unsubscribe;
        },
        clearAll() {
            for (const unsubscribe of cleanups) {
                try { unsubscribe(); } catch { }
            }
            cleanups.clear();
        }
    };
};

import('./listeners.js')
    .then((mod) => {
        if (typeof mod.createListenerRegistry === 'function') {
            createListenerRegistry = mod.createListenerRegistry;
        }
    })
    .catch(() => {
        console.warn('listeners helper missing; using local fallback in liveassets.');
    });

let DATABASE_BASE_PATH = 'public';
let inventoryEntries = {};
let lastFilteredEntries = {};
const listeners = createListenerRegistry();

const imageCache = {};

function byId(id) {
    return document.getElementById(id);
}

function rowPath(row) {
    const category = row.dataset.category;
    const component = row.dataset.component;
    const uniqueKey = row.dataset.uniqueKey;
    return `${DATABASE_BASE_PATH}/inventory/${category}/${component}/${uniqueKey}`;
}

function smartName(data = {}) {
    const first =
        (data.part && String(data.part).trim()) ||
        (data.name && String(data.name).trim()) ||
        (data.title && String(data.title).trim()) ||
        (data.displayName && String(data.displayName).trim());

    if (first) return first;

    const url = (data.affiliateUrl || "").trim();
    if (url) {
        const slug = decodeURIComponent((url.split("?")[0] || "").split("/").filter(Boolean).pop() || "")
            .replace(/[-_]+/g, " ").trim();
        if (slug) return slug;
    }
    return "Unnamed Item";
}

function textEscape(value) {
    return String(value ?? '').replace(/"/g, '&quot;');
}

function updateCategoryFilter(entries) {
    const categoryFilter = byId('category-filter');
    categoryFilter.innerHTML = '<option value="">All</option>';
    Object.keys(entries).forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.innerText = category;
        categoryFilter.appendChild(option);
    });
}

function saveColumnVisibility() {
    const checkboxStates = {};
    document.querySelectorAll('.toggle-column').forEach(checkbox => {
        checkboxStates[checkbox.value] = checkbox.checked;
    });
    localStorage.setItem('inventoryColumnVisibility', JSON.stringify(checkboxStates));
}

function loadColumnVisibility() {
    const savedStates = JSON.parse(localStorage.getItem('inventoryColumnVisibility'));
    if (savedStates) {
        document.querySelectorAll('.toggle-column').forEach(checkbox => {
            checkbox.checked = savedStates[checkbox.value] !== undefined ? savedStates[checkbox.value] : checkbox.checked;
        });
    }
}

function applyColumnVisibility() {
    document.querySelectorAll('.toggle-column').forEach(checkbox => {
        const columnClass = checkbox.value;
        document.querySelectorAll(`.${columnClass}`).forEach(cell => {
            cell.style.display = checkbox.checked ? '' : 'none';
        });
    });
}

function toggleColumnControlsVisibility(mode) {
    const columnControls = document.querySelector('.checkbox');
    if (!columnControls) return;
    columnControls.style.display = (mode === 'edit') ? 'block' : 'none';
}

function showDetailsModal(data, category, component, partName, imageUrl) {
    const modal = byId('modal');
    modal.style.display = 'flex';

    byId('part-image').src = imageUrl;
    byId('modal-title').innerText = smartName(data);
    byId('modal-category').innerText = category ?? 'Unknown Category';
    byId('modal-component').innerText = component ?? 'Unknown Sub-Category';
    byId('modal-price').innerText = (data.price ?? '0').toString();
    byId('modal-cost').innerText = (data.actualPrice ?? '0').toString();
    byId('modal-quantity').innerText = (data.quantity ?? '0').toString();

    const link = data.affiliateUrl?.trim() || '';
    const linkEl = byId('modal-link');
    linkEl.textContent = link || '—';
    linkEl.href = link || '#';

    byId('modal-description').innerText = data.description?.trim() || 'No description available';
}

function displayEntries(entries) {
    const container = byId('entries-container');
    const mode = byId('viewToggle').value;

    container.innerHTML = '';

    if (mode === 'view') {
        renderViewMode(entries, container);
    } else {
        renderEditMode(entries, container);
    }
}

function filterEntries() {
    const selectedCategory = byId('category-filter').value;
    const searchTerm = byId('search-input').value.toLowerCase();

    const filteredEntries = {};

    Object.entries(inventoryEntries).forEach(([category, components]) => {
        if (selectedCategory && category !== selectedCategory) return;

        Object.entries(components).forEach(([component, items]) => {
            Object.entries(items).forEach(([uniqueKey, data]) => {
                const nameBlob = smartName(data).toLowerCase();
                const descBlob = (data.description || '').toLowerCase();
                const linkBlob = (data.affiliateUrl || '').toLowerCase();
                const searchBlob = `${nameBlob} ${descBlob} ${linkBlob}`;

                if (searchTerm && !searchBlob.includes(searchTerm)) return;

                if (!filteredEntries[category]) filteredEntries[category] = {};
                if (!filteredEntries[category][component]) filteredEntries[category][component] = {};
                filteredEntries[category][component][uniqueKey] = data;
            });
        });
    });

    lastFilteredEntries = filteredEntries;
    displayEntries(filteredEntries);
}

async function fetchImageForPart(category, component, partName, row) {
    const sanitizedPartName = partName.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const storagePathBase = `${DATABASE_BASE_PATH}/inventory/${category}/${component}/${sanitizedPartName}`;

    if (imageCache[storagePathBase]) {
        row.querySelector('img').src = imageCache[storagePathBase];
        return;
    }

    const possibleExtensions = ['png', 'jpg', 'jpeg', 'webp'];

    for (const ext of possibleExtensions) {
        const storagePath = `${storagePathBase}.${ext}`;
        const fileReference = storageRef(storage, storagePath);

        try {
            const downloadURL = await getDownloadURL(fileReference);
            imageCache[storagePathBase] = downloadURL;
            row.querySelector('img').src = downloadURL;
            return;
        } catch (error) {
            if (error.code !== 'storage/object-not-found') {
                console.error(`Error fetching image for ${sanitizedPartName}:`, error);
            }
        }
    }

    imageCache[storagePathBase] = './assets/img/default.png';
    row.querySelector('img').src = './assets/img/default.png';
}

async function adjustQuantity(row, delta) {
    const qRef = ref(database, `${rowPath(row)}/quantity`);
    try {
        await runTransaction(qRef, (cur) => {
            const n = parseInt(cur || 0, 10) || 0;
            return n + delta;
        });
    } catch (e) {
        alert('Adjust failed: ' + (e?.message || e));
    }
}

async function setExactQuantity(row, val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return alert('Enter a valid number to Set.');
    const qRef = ref(database, `${rowPath(row)}/quantity`);
    try {
        await runTransaction(qRef, () => n);
    } catch (e) {
        alert('Set failed: ' + (e?.message || e));
    }
}

function updateInventoryField(event, row) {
    const key = event.target.dataset.key;
    const newValue = event.target.innerText.trim();

    if (key === 'quantity') {
        setExactQuantity(row, newValue);
        return;
    }

    const selectedCategory = byId('category-filter').value;
    const searchTerm = byId('search-input').value.toLowerCase();

    const originalValue = event.target.getAttribute('data-original');
    if (newValue === originalValue) return;

    update(ref(database, rowPath(row)), { [key]: newValue })
        .then(() => {
            event.target.setAttribute('data-original', newValue);
            setTimeout(() => {
                byId('category-filter').value = selectedCategory;
                byId('search-input').value = searchTerm;
                filterEntries();
            }, 50);
        })
        .catch(error => console.error('Error updating entry:', error));
}

async function deletePreviousImage(category, component, partName) {
    const storagePathBase = `${DATABASE_BASE_PATH}/inventory/${category}/${component}/${partName}`;
    const exts = ['png', 'jpg', 'jpeg', 'webp'];
    for (const ext of exts) {
        const fullPath = `${storagePathBase}.${ext}`;
        const fileRef = storageRef(storage, fullPath);
        try {
            await deleteObject(fileRef);
            break;
        } catch (err) {
            if (err.code !== 'storage/object-not-found') {
                console.error(`Error deleting ${fullPath}:`, err);
                return;
            }
        }
    }
}

async function deleteEntry(row) {
    const category = row.dataset.category;
    const component = row.dataset.component;
    const uniqueKey = row.dataset.uniqueKey;
    const partName = row.dataset.part;

    const confirmation = confirm(`Delete "${partName}"? This action cannot be undone.`);
    if (!confirmation) return;

    await deletePreviousImage(category, component, partName);

    remove(ref(database, `${DATABASE_BASE_PATH}/inventory/${category}/${component}/${uniqueKey}`))
        .then(() => row.remove())
        .catch(error => console.error('Error deleting entry:', error));
}

async function uploadImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    const row = event.target.closest('tr');
    const category = row.dataset.category;
    const component = row.dataset.component;
    const uniqueKey = row.dataset.uniqueKey;
    const partName = row.dataset.part.trim().replace(/[^a-zA-Z0-9_-]/g, '_');

    if (!category || !component || !partName) {
        alert('Error: Missing entry information for image upload.');
        return;
    }

    const storagePath = `${DATABASE_BASE_PATH}/inventory/${category}/${component}/${partName}.png`;
    const fileReference = storageRef(storage, storagePath);

    try {
        await deletePreviousImage(category, component, partName);

        const uploadTask = await uploadBytesResumable(fileReference, file);
        const imageUrl = await getDownloadURL(uploadTask.ref);

        await update(ref(database, `${DATABASE_BASE_PATH}/inventory/${category}/${component}/${uniqueKey}`), {
            imageUrl: imageUrl
        });

        row.querySelector('img').src = imageUrl;
    } catch (error) {
        console.error('Error uploading image:', error);
    }
    filterEntries();
}

async function uploadImageForNewEntry(file, category, component, partNameSanitized) {
    const storagePath = `${DATABASE_BASE_PATH}/inventory/${category}/${component}/${partNameSanitized}.png`;
    const fileReference = storageRef(storage, storagePath);

    await deletePreviousImage(category, component, partNameSanitized);
    const uploadTask = await uploadBytesResumable(fileReference, file);
    const imageUrl = await getDownloadURL(uploadTask.ref);
    return imageUrl;
}

function renderViewMode(entries, container) {
    const selectedCategory = byId('category-filter').value;
    const searchTerm = byId('search-input').value.toLowerCase();

    container.innerHTML = '';
    container.style.display = 'flex';
    container.style.flexWrap = 'wrap';
    container.style.gap = '16px';
    container.style.justifyContent = 'center';

    Object.entries(entries).forEach(([category, components]) => {
        Object.entries(components).forEach(([component, items]) => {
            Object.entries(items).forEach(([uniqueKey, data]) => {
                const displayName = smartName(data);
                const imageUrl = data.imageUrl || './assets/img/default.png';

                const matchesCategory = selectedCategory === '' || category === selectedCategory;
                const blob = `${displayName} ${(data.description || '')} ${(data.affiliateUrl || '')}`.toLowerCase();
                const matchesSearch = searchTerm === '' || blob.includes(searchTerm);
                if (!(matchesCategory && matchesSearch)) return;

                const partName = displayName.replace(/[^a-zA-Z0-9_-]/g, '_');

                const card = document.createElement('div');
                card.className = 'item-card';
                card.dataset.category = category;
                card.dataset.component = component;
                card.dataset.uniqueKey = uniqueKey;
                card.dataset.part = partName;

                card.innerHTML = `
            <img src="${imageUrl}" alt="${partName}">
            <p>${displayName}</p>
            <p class="muted">${category} / ${component}</p>
          `;

                card.addEventListener('click', () => {
                    showDetailsModal(data, category, component, partName, imageUrl);
                });

                container.appendChild(card);
            });
        });
    });
}

function renderEditMode(entries, container) {
    container.style.display = 'block';
    container.innerHTML = `<table id="inventory-table">
        <thead>
            <tr>
                <th class="category-column">Category</th>
                <th class="component-column">Sub-Category</th>
                <th class="item-column">Item Name</th>
                <th class="price-column">Price</th>
                <th class="cost-column">Cost</th>
                <th class="quantity-column">Quantity</th>
                <th class="link-column">Link</th>
                <th class="description-column">Description</th>
                <th class="image-column">Image</th>
                <th class="actions-column">Actions</th>
            </tr>
        </thead>
        <tbody id="inventory-body"></tbody>
    </table>`;

    const tbody = byId('inventory-body');

    Object.entries(entries).forEach(([category, components]) => {
        Object.entries(components).forEach(([component, items]) => {
            Object.entries(items).forEach(([uniqueKey, data]) => {
                const nameForAttr = (data.part || '').replace(/[^a-zA-Z0-9_-]/g, '_');
                const imageUrl = data.imageUrl ? data.imageUrl : './assets/img/default.png';

                const row = document.createElement('tr');
                row.dataset.uniqueKey = uniqueKey;
                row.dataset.category = category;
                row.dataset.component = component;
                row.dataset.part = nameForAttr;

                row.innerHTML = `
              <td class="category-column">${category}</td>
              <td class="component-column">${component}</td>
              <td class="item-column" contenteditable="true" data-key="part" data-original="${textEscape(data.part || '')}">${data.part || ''}</td>
              <td class="price-column" contenteditable="true" data-key="price" data-original="${data.price || 0}">${data.price || 0}</td>
              <td class="cost-column" contenteditable="true" data-key="actualPrice" data-original="${data.actualPrice || 0}">${data.actualPrice || 0}</td>
              <td class="quantity-column">
                  <div contenteditable="true" data-key="quantity" data-original="${data.quantity || 0}" style="display:inline-block; min-width:44px; border-bottom:1px dotted #bbb;">${data.quantity || 0}</div>
                  <div class="qty-controls">
                      <button type="button" class="dec-btn">−1</button>
                      <button type="button" class="inc-btn">+1</button>
                      <input type="number" class="set-qty-input" placeholder="Set…">
                      <button type="button" class="set-qty-btn">Set</button>
                  </div>
              </td>
              <td class="link-column" contenteditable="true" data-key="affiliateUrl" data-original="${textEscape(data.affiliateUrl || '')}">${data.affiliateUrl || ''}</td>
              <td class="description-column" contenteditable="true" data-key="description" data-original="${textEscape(data.description || '')}">${data.description || ''}</td>
              <td class="image-column">
                  <img src="${imageUrl}" width="50" height="50" style="cursor: pointer;" data-part="${nameForAttr}">
                  <input type="file" class="image-upload" accept="image/*">
              </td>
              <td class="actions-column">
                  <button class="delete-button clear-button" type="button">Delete</button>
              </td>
          `;
                tbody.appendChild(row);
                fetchImageForPart(category, component, nameForAttr, row);
            });
        });
    });
}

function loadDatabaseEntries() {
    const inventoryRef = ref(database, `${DATABASE_BASE_PATH}/inventory`);
    const mode = byId('viewToggle').value;
    toggleColumnControlsVisibility(mode);

    listeners.track(onValue(inventoryRef, (snapshot) => {
        inventoryEntries = snapshot.val() || {};
        updateCategoryFilter(inventoryEntries);
        filterEntries();
        loadColumnVisibility();
        applyColumnVisibility();
    }));
}

async function handleSaveNewItem(event) {
    event.preventDefault();

    const category = byId('category').value.trim();
    const component = byId('component').value.trim();
    const partNameRaw = byId('part').value || '';
    const partName = partNameRaw.trim();
    if (!category || !component || !partName) {
        alert('Category, Sub-Category, and Item are required.');
        return;
    }

    const price = parseFloat(byId('price').value) || 0;
    const actualPrice = parseFloat(byId('actualPrice').value) || 0;
    const quantity = parseInt(byId('quantity').value) || 0;
    const description = byId('description').value.trim();
    const affiliateUrl = byId('affiliateUrl').value.trim();
    const imageFile = byId('imageInput').files[0];

    const uniqueKey = Date.now().toString();
    const inventoryRef = ref(database, `${DATABASE_BASE_PATH}/inventory/${category}/${component}/${uniqueKey}`);

    let imageUrl = null;

    if (imageFile) {
        try {
            const sanitizedPartForFile = partName.replace(/[^a-zA-Z0-9_-]/g, '_');
            imageUrl = await uploadImageForNewEntry(imageFile, category, component, sanitizedPartForFile);
        } catch (error) {
            console.error('Image upload failed:', error);
            alert('Failed to upload image. Try again.');
            return;
        }
    }

    const itemData = {
        part: partName,
        price,
        actualPrice,
        quantity,
        description,
        affiliateUrl: affiliateUrl || '',
        imageUrl
    };

    set(inventoryRef, itemData)
        .then(() => {
            byId('create-form').reset();
            loadDatabaseEntries();
        })
        .catch(error => console.error('Error saving item:', error));
}

function exportCsv() {
    const rows = [["Category", "Sub-Category", "Item", "Quantity", "Price", "Cost", "Link", "Description", "ImageURL", "Key"]];
    Object.entries(lastFilteredEntries).forEach(([category, components]) => {
        Object.entries(components).forEach(([component, items]) => {
            Object.entries(items).forEach(([uniqueKey, data]) => {
                rows.push([
                    category,
                    component,
                    smartName(data),
                    String(data.quantity ?? 0),
                    String(data.price ?? ''),
                    String(data.actualPrice ?? ''),
                    String(data.affiliateUrl ?? ''),
                    (data.description || '').replace(/\r?\n/g, ' ').trim(),
                    String(data.imageUrl ?? ''),
                    uniqueKey
                ]);
            });
        });
    });

    const csv = rows.map(r =>
        r.map(field => {
            const s = String(field ?? '');
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(',')
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

async function autoNameFromNode() {
    try {
        const dryRun = byId('dryRunNode')?.checked ?? true;

        const rootRef = ref(database, `${DATABASE_BASE_PATH}/inventory`);
        const snap = await get(rootRef);
        const inv = snap.val() || {};

        const updates = {};
        const preview = [];

        for (const [category, components] of Object.entries(inv)) {
            for (const [component, items] of Object.entries(components || {})) {
                for (const [uniqueKey, data] of Object.entries(items || {})) {
                    const currentName = String(data?.part || '').trim();
                    if (currentName) continue;

                    const candidate = String(uniqueKey);

                    const path = `${DATABASE_BASE_PATH}/inventory/${category}/${component}/${uniqueKey}/part`;
                    updates[path] = candidate;
                    preview.push({ category, component, uniqueKey, name: candidate });
                }
            }
        }

        if (preview.length === 0) {
            alert('No unnamed items found.');
            return;
        }

        if (dryRun) {
            console.table(preview);
            alert(`Preview: ${preview.length} items would be named from their node key. Open the console for details. Uncheck "Preview only" to apply.`);
            return;
        }

        await update(ref(database), updates);
        alert(`Named ${preview.length} items from their node key.`);
        filterEntries();
    } catch (err) {
        console.error('Auto-name from node failed:', err);
        alert(`Auto-name from node failed: ${err?.message || err}`);
    }
}

function onEntriesContainerClick(event) {
    const deleteButton = event.target.closest('.delete-button');
    if (deleteButton) {
        const row = deleteButton.closest('tr');
        if (row) deleteEntry(row);
        return;
    }

    const incBtn = event.target.closest('.inc-btn');
    if (incBtn) {
        const row = incBtn.closest('tr');
        if (row) adjustQuantity(row, +1);
        return;
    }

    const decBtn = event.target.closest('.dec-btn');
    if (decBtn) {
        const row = decBtn.closest('tr');
        if (row) adjustQuantity(row, -1);
        return;
    }

    const setQtyBtn = event.target.closest('.set-qty-btn');
    if (setQtyBtn) {
        const tr = setQtyBtn.closest('tr');
        if (!tr) return;
        const input = tr.querySelector('.set-qty-input');
        setExactQuantity(tr, input?.value);
        return;
    }

    const editImage = event.target.closest('#inventory-body img');
    if (editImage) {
        const modal = byId('modal');
        const modalImg = byId('part-image');
        modal.style.display = 'flex';
        modalImg.src = editImage.src;
    }
}

function onEntriesContainerChange(event) {
    if (event.target.matches('.image-upload')) {
        uploadImage(event);
    }
}

function onEntriesContainerBlur(event) {
    const editable = event.target.closest('[contenteditable="true"]');
    if (!editable) return;
    const row = editable.closest('tr');
    if (!row) return;
    updateInventoryField({ target: editable }, row);
}

function wireUiEvents() {
    byId('save-data-button').addEventListener('click', handleSaveNewItem);
    byId('category-filter').addEventListener('change', filterEntries);
    byId('search-input').addEventListener('input', filterEntries);
    byId('viewToggle').addEventListener('change', loadDatabaseEntries);
    byId('exportCsvBtn').addEventListener('click', exportCsv);
    byId('autoNameFromNodeBtn').addEventListener('click', autoNameFromNode);

    byId('closeModal').addEventListener('click', () => {
        byId('modal').style.display = 'none';
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            byId('modal').style.display = 'none';
        }
    });

    byId('modal').addEventListener('click', function (event) {
        if (event.target === this) {
            this.style.display = 'none';
        }
    });

    document.querySelectorAll('.toggle-column').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            saveColumnVisibility();
            applyColumnVisibility();
        });
    });

    const container = byId('entries-container');
    container.addEventListener('click', onEntriesContainerClick);
    container.addEventListener('change', onEntriesContainerChange);
    container.addEventListener('blur', onEntriesContainerBlur, true);
}

export function init(options = {}) {
    const { forcePublic = false } = options;
    wireUiEvents();

    if (forcePublic) {
        DATABASE_BASE_PATH = 'public';
        listeners.clearAll();
        loadDatabaseEntries();
        return;
    }

    onAuthStateChanged(auth, (user) => {
        DATABASE_BASE_PATH = user ? `${user.uid}` : 'public';
        listeners.clearAll();
        loadDatabaseEntries();
    });
}
