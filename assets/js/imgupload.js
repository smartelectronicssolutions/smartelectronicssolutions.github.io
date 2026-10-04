/**
 * Shared image upload helpers — root-level copy.
 *
 * Same conventions used across every page in this repo:
 *   - Resize: JPEG, max 2048px wide, quality 0.9 (skip if already smaller)
 *   - Filename: {slug}_{YYYY-MM-DD}_{ms-timestamp}.jpg
 *   - Storage path: {basePath}/{YYYY}/{filename}
 *   - Slugify: NFKD → strip diacritics → non-alphanumeric → "_" → trim → 60-char cap
 *
 * Mirror copy at apps/assets/js/imgupload.js so the apps/ tree can be broken
 * off into its own deployment without depending on root assets.
 */
import {
    storage, storageRef, uploadBytes, getDownloadURL, deleteObject,
} from "./firebase-init.js";

/** Resize an image File/Blob to a JPEG with max width capped. Returns {blob, contentType, didResize}. */
export async function fileToJpegMaxWidth(file, maxW = 2048, quality = 0.9) {
    if (!file?.type?.startsWith("image/")) {
        return { blob: file, contentType: file?.type || "application/octet-stream", didResize: false };
    }
    const bmp = await createImageBitmap(file);
    if (bmp.width <= maxW) {
        bmp.close?.();
        return { blob: file, contentType: file.type || "image/*", didResize: false };
    }
    const scale = maxW / bmp.width;
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", quality));
    return { blob, contentType: "image/jpeg", didResize: true };
}

/** Slugify a string for filename use. */
export function slugifyFilename(s) {
    return (
        String(s || "")
            .normalize("NFKD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/[^a-zA-Z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 60) || "item"
    );
}

/** Build the canonical filename for an image upload. */
export function buildImageFilename(name, dateMs = Date.now()) {
    const slug = slugifyFilename(name);
    const dateStr = new Date(dateMs).toISOString().slice(0, 10);
    return `${slug}_${dateStr}_${dateMs}.jpg`;
}

const _locks = new Set();

/**
 * Upload an image File to Firebase Storage.
 *
 * @param {Object} args
 * @param {File} args.file - the image file
 * @param {string} args.basePath - storage path prefix without year, e.g. "{uid}/images/inventory"
 * @param {string} args.name - human-readable name for filename slug
 * @param {string} [args.priorPath] - existing imageStoragePath to delete first (no orphan)
 * @param {string} [args.lockKey] - optional dedupe key
 * @param {number} [args.dateMs] - optional item date; drives {year}/ bucket + filename date.
 *                                  If omitted, uses Date.now(). Use this to keep historical
 *                                  records in their original year folder (e.g. 2024 receipts
 *                                  stay in /2024/ even when uploaded later).
 * @returns {Promise<{url:string, path:string, didResize:boolean}>}
 */
export async function uploadImage({ file, basePath, name, priorPath, lockKey, dateMs }) {
    if (!file) throw new Error("uploadImage: no file");
    if (!basePath) throw new Error("uploadImage: basePath required");
    const key = lockKey || `${basePath}:${name}`;
    if (_locks.has(key)) throw new Error("upload already in progress");
    _locks.add(key);
    try {
        const resized = await fileToJpegMaxWidth(file, 2048, 0.9);
        const ts = Date.now();                         // always-now uniqueness suffix
        const dateForBucket = Number(dateMs) || ts;    // year + date portion in filename
        const year = new Date(dateForBucket).getUTCFullYear();
        const filename = buildImageFilename(name, dateForBucket);
        const path = `${basePath.replace(/\/+$/, "")}/${year}/${filename}`;
        const sref = storageRef(storage, path);
        if (priorPath) {
            try { await deleteObject(storageRef(storage, priorPath)); }
            catch (e) { console.warn("Prior image delete failed (ok if missing):", e?.message || e); }
        }
        await uploadBytes(sref, resized.blob, { contentType: resized.contentType || "image/jpeg" });
        const url = await getDownloadURL(sref);
        return { url, path, didResize: resized.didResize };
    } finally {
        _locks.delete(key);
    }
}

/** Remove an image from Storage by its path. Safe to call when path is missing. */
export async function removeStorageImage(path) {
    if (!path) return;
    try { await deleteObject(storageRef(storage, path)); }
    catch (e) { console.warn("Image delete failed (ok if missing):", e?.message || e); }
}

// ---------------------------------------------------------------------------------------------------------------
// THUMBNAILS (2026-10-04, from the Louverse board): a grid of 2048-px photos is the lag (and froze an iPad). thumbOf(photo, w)
// fetches the file once, downsizes it in the decoder, keeps a small JPEG in the Cache API ("lv-thumbs-v1" - shared with the
// board) and hands back an object URL; 2 in flight on Safari, 4 elsewhere; any failure falls back to the full URL.
const THUMBS = new Map(); let _cacheP = null, _busy = 0; const _waiting = [];
const IS_SAFARI = typeof navigator !== "undefined" && /Safari|iP(hone|ad|od)/.test(navigator.userAgent) && !/Chrome|CriOS|Edg|Firefox/.test(navigator.userAgent);
const _cacheOpen = () => _cacheP ??= (typeof caches !== "undefined" ? caches.open("lv-thumbs-v1").catch(() => null) : Promise.resolve(null));
const _slot = () => _busy < (IS_SAFARI ? 2 : 4) ? (_busy++, Promise.resolve()) : new Promise(r => _waiting.push(r)).then(() => { _busy++; });
const _free = () => { _busy--; const n = _waiting.shift(); if (n) n(); };
export function thumbOf(photo, w = 256) {
    const key = photo?.path || photo?.fullPath || photo?.url; if (!key || !photo?.url) return Promise.resolve(photo?.url || "");
    const k = `${key}@${w}`; if (THUMBS.has(k)) return THUMBS.get(k);
    const p = (async () => {
        const cache = await _cacheOpen(), ck = `https://thumbs.louverse.local/${encodeURIComponent(key)}?w=${w}`;
        let blob = null;
        if (cache) { try { const hit = await cache.match(ck); if (hit) blob = await hit.blob(); } catch (_) {} }
        if (!blob) {
            await _slot();
            try {
                const res = await fetch(photo.url, { mode: "cors" }); if (!res.ok) throw new Error("fetch " + res.status);
                const full = await res.blob(); let bmp;
                try { bmp = await createImageBitmap(full, { resizeWidth: w, resizeQuality: "medium", imageOrientation: "from-image" }); } catch (_) { bmp = await createImageBitmap(full); }
                const tw = Math.min(w, bmp.width) || w, th = Math.max(1, Math.round(bmp.height * tw / bmp.width)) || tw;
                const c = document.createElement("canvas"); c.width = tw; c.height = th; c.getContext("2d").drawImage(bmp, 0, 0, tw, th); bmp.close?.();
                blob = await new Promise((ok, no) => c.toBlob(b => b ? ok(b) : no(new Error("thumb failed")), "image/jpeg", 0.82)); c.width = c.height = 0;
                if (cache) cache.put(ck, new Response(blob, { headers: { "Content-Type": "image/jpeg" } })).catch(() => {});
            } finally { _free(); }
        }
        return URL.createObjectURL(blob);
    })().catch(e => { console.warn("[imgupload] thumb", e?.message || e); return photo.url; });
    THUMBS.set(k, p); return p;
}
export async function forgetThumb(photo) { const key = photo?.path || photo?.fullPath || photo?.url; if (!key) return; for (const k of [...THUMBS.keys()]) if (k.startsWith(key + "@")) THUMBS.delete(k);
    const cache = await _cacheOpen(); if (!cache) return; try { for (const r of await cache.keys()) if (r.url.includes(encodeURIComponent(key))) await cache.delete(r); } catch (_) {} }
