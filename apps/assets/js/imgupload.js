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
