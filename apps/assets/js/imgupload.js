/**
 * Shared image upload helpers — apps-tree copy.
 *
 * Mirror of /assets/js/imgupload.js, kept separate so the apps/ tree can
 * be broken off into its own deployment without depending on root assets.
 * Imports from THIS tree's firebase-init.js relay.
 *
 * Same conventions used across every page in this repo:
 *   - Resize: JPEG, max 2048px wide, quality 0.9 (skip if already smaller)
 *   - Filename: {slug}_{YYYY-MM-DD}_{ms-timestamp}.jpg
 *   - Storage path: {basePath}/{YYYY}/{filename}
 *   - Slugify: NFKD → strip diacritics → non-alphanumeric → "_" → trim → 60-char cap
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
    // 2026-09-18: only JPEG/PNG/GIF pass through untouched. WebP/HEIC/AVIF are re-encoded even when small - an older
    // iPad Safari cannot draw WebP, and the file lands under a .jpg name anyway.
    const passthrough = /^image\/(jpeg|png|gif)$/.test(file.type || "");
    if (bmp.width <= maxW && passthrough) {
        bmp.close?.();
        return { blob: file, contentType: file.type || "image/*", didResize: false };
    }
    const scale = Math.min(1, maxW / bmp.width);
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
// PHOTO RULES - THE ONE COPY (L 2026-10-03: "can all this code be placed in one place? ideally the Telaid apps just
// pull the logic"). These were onlinejob.html's resizeImg / stampImg / unstampImg, numbers unchanged. The jobs app,
// Details, Gallery, the Telaid checklist + its image module and the Telaid data layer (radar map) all import them, so
// a photo looks the same no matter which app took it, and a bar stamped in one app crops cleanly in another.
//   resizeImg : width capped (2048 by default), re-encoded as JPEG at the browser's default quality
//   stampImg  : a strip max(40, round(width/22)) px under the image (black - JPEG has no alpha), white Arial at 70%
//               of the strip, shrunk until the text fits 92% of the width (min 12 px), baseline a quarter-strip up
//   unstampImg: crops that same strip back off - stamp -> unstamp is a clean round trip
// Each takes a File or Blob and resolves to a JPEG Blob; a bad image rejects (callers alert from their catch).
const loadImg = blob => new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(blob);
    img.onload = () => { URL.revokeObjectURL(u); res(img); };
    img.onerror = () => { URL.revokeObjectURL(u); rej(new Error("Invalid image")); };
    img.src = u;
});
const toJpeg = (c, what) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error(what + " failed")), "image/jpeg"));
/** Height of the label strip for an image this wide - the number stamp and unstamp share. */
export const stripHeight = w => Math.max(40, Math.round(w / 22));

export async function resizeImg(file, maxW = 2048) {
    const img = await loadImg(file);
    let w = img.width, h = img.height;
    if (w > maxW) { h = h * maxW / w; w = maxW; }
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    return toJpeg(c, "Resize");
}

export async function stampImg(blob, text) {
    const img = await loadImg(blob), strip = stripHeight(img.width);
    let font = Math.round(strip * 0.7);
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height + strip;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    g.fillStyle = "white"; g.textAlign = "center"; g.textBaseline = "alphabetic"; g.font = `${font}px Arial`;
    while (font > 12 && g.measureText(text).width > c.width * 0.92) { font -= 2; g.font = `${font}px Arial`; }
    g.fillText(text, c.width / 2, c.height - Math.round(strip * 0.25));
    return toJpeg(c, "Markup");
}

export async function unstampImg(blob) {
    const img = await loadImg(blob), strip = stripHeight(img.width);
    const c = document.createElement("canvas"); c.width = img.width; c.height = Math.max(1, img.height - strip);
    c.getContext("2d").drawImage(img, 0, 0);   // top-left aligned; the bottom strip falls off
    return toJpeg(c, "Crop");
}
