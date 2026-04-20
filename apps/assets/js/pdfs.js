import {
    auth,
    onAuthStateChanged,
    storage,
    storageRef as sRef,
    listAll,
    getMetadata,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from './firebase-init.js';

let handlersBound = false;

function getUserPdfFolderPath() {
    const user = auth.currentUser;
    return user ? `share/pdfs` : null;
}

// Re-query DOM elements each time to avoid stale/null refs
function els() {
    return {
        section: document.getElementById('savedPdfsSection'),
        fileInput: document.getElementById('pdfFileInput'),
        uploadBtn: document.getElementById('uploadPdfBtn'),
        refreshBtn: document.getElementById('refreshPdfListBtn'),
        listEl: document.getElementById('pdfList'),
    };
}

function ensureHandlers() {
    if (handlersBound) return;
    const { uploadBtn, refreshBtn } = els();
    if (uploadBtn) uploadBtn.addEventListener('click', handleUpload);
    if (refreshBtn) refreshBtn.addEventListener('click', renderList);
    handlersBound = true;
}

async function handleUpload() {
    const { fileInput } = els();
    try {
        const folder = getUserPdfFolderPath();
        if (!folder) { alert('You must be logged in to upload PDFs.'); return; }
        if (!fileInput) return; // section not in DOM yet

        const file = fileInput.files?.[0];
        if (!file) { alert('Select a PDF file first.'); return; }
        if (file.type !== 'application/pdf') { alert('Only PDF files are allowed.'); return; }

        const safeName = file.name.replace(/\s+/g, '_');
        const objectPath = `${folder}/${Date.now()}_${safeName}`;
        const fileRef = sRef(storage, objectPath);

        const metadata = {
            contentType: 'application/pdf',
            cacheControl: 'public,max-age=86400'
        };

        await uploadBytes(fileRef, file, metadata);
        fileInput.value = '';
        await renderList();
        alert('PDF uploaded.');
    } catch (err) {
        console.error(err);
        alert('Upload failed: ' + err.message);
    }
}

function formatSize(bytes) {
    if (!Number.isFinite(bytes)) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = bytes, i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

async function renderList() {
    const { listEl } = els();
    if (!listEl) return; // section not in DOM; safely no-op

    const folder = getUserPdfFolderPath();
    if (!folder) { listEl.textContent = 'Log in to view saved PDFs.'; return; }

    listEl.textContent = 'Loading...';

    try {
        const folderRef = sRef(storage, folder);
        const { items } = await listAll(folderRef);

        if (!items.length) { listEl.textContent = 'No PDFs yet.'; return; }

        // Newest first (timestamp prefix)
        items.sort((a, b) => b.name.localeCompare(a.name));

        const frag = document.createDocumentFragment();

        for (const item of items) {
            let size = '', uploadedAt = '';
            try {
                const meta = await getMetadata(item);
                size = formatSize(meta.size);
                if (meta.timeCreated) uploadedAt = new Date(meta.timeCreated).toLocaleString();
            } catch (e) {
                console.warn('getMetadata failed:', e);
            }

            const row = document.createElement('div');
            row.className = 'pdf-item';
            row.style.alignItems = 'center';
            row.style.gap = '8px';
            row.style.margin = '6px 0';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = prettifyName(item.name);

            const info = document.createElement('small');
            info.style.opacity = '.8';
            info.textContent = [size && ` Size: ${size}`]
                .filter(Boolean).join('  •  ');

            const openBtn = document.createElement('button');
            openBtn.textContent = 'Open';
            openBtn.addEventListener('click', async () => {
                try {
                    const url = await getDownloadURL(item); // on-demand
                    window.open(url, '_blank', 'noopener');
                } catch (err) {
                    alert('Failed to open file: ' + err.message);
                }
            });

            const delBtn = document.createElement('button');
            delBtn.textContent = 'Delete';
            delBtn.addEventListener('click', async () => {
                if (!confirm(`Delete "${nameSpan.textContent}"?`)) return;
                try {
                    await deleteObject(item);
                    await renderList();
                } catch (err) {
                    alert('Delete failed: ' + err.message);
                }
            });

            const left = document.createElement('div');
            left.style.flexDirection = 'column';
            left.appendChild(nameSpan);
            if (info.textContent) left.appendChild(info);

            const right = document.createElement('div');
            right.style.gap = '8px';
            right.appendChild(openBtn);
            right.appendChild(delBtn);

            row.appendChild(left);
            row.appendChild(right);
            frag.appendChild(row);
        }

        listEl.innerHTML = '';
        listEl.appendChild(frag);
    } catch (err) {
        console.error(err);
        const { listEl: again } = els();
        if (again) again.textContent = 'Failed to load PDFs.';
    }
}

function prettifyName(storedName) {
    const idx = storedName.indexOf('_');
    if (idx === -1) return storedName;
    const ts = storedName.slice(0, idx);
    const rest = storedName.slice(idx + 1);
    return Number.isNaN(Number(ts)) ? storedName : rest;
}

// Ensure DOM is ready before we touch elements/classes
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        const { section, listEl } = els();

        if (user) {
            section?.classList.remove('pdf-hidden');
            ensureHandlers();
            renderList();
        } else {
            section?.classList.add('pdf-hidden');
            if (listEl) listEl.textContent = 'Log in to view saved PDFs.';
        }
    });
});
