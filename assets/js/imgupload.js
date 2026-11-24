/**
 * Shared image upload helpers — root-level copy.
 *
 * Mirror copy at apps/assets/js/imgupload.js, kept separate so the apps/ tree can
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
    const rawBlob = await new Promise(r => canvas.toBlob(r, "image/jpeg", quality));
    const meta = await readPhotoMeta(file);
    const blob = await injectExif(rawBlob, meta);
    return { blob, contentType: "image/jpeg", didResize: true, meta };
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
export async function uploadImage({ file, basePath, name, priorPath, lockKey, dateMs, maxW, quality }) {
    if (!file) throw new Error("uploadImage: no file");
    if (!basePath) throw new Error("uploadImage: basePath required");
    const key = lockKey || `${basePath}:${name}`;
    if (_locks.has(key)) throw new Error("upload already in progress");
    _locks.add(key);
    try {
        const resized = await fileToJpegMaxWidth(file, maxW || 2048, quality || 0.9);   // 2026-11-08: callers may pass a bigger cap (console full-size toggle for readable card codes); default unchanged
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
        const photoMeta = resized.meta || (file?.type?.startsWith("image/") ? await readPhotoMeta(file) : null);
        const upMeta = photoMeta ? { ...photoUploadMeta(photoMeta), contentType: resized.contentType || "image/jpeg" } : { contentType: resized.contentType || "image/jpeg" };
        await uploadBytes(sref, resized.blob, upMeta);
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

export async function resizeImg(file, maxW = 2048, meta = null) {
    const m = meta || await readPhotoMeta(file);
    const img = await loadImg(file);
    let w = img.width, h = img.height;
    if (w > maxW) { h = h * maxW / w; w = maxW; }
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    return injectExif(await toJpeg(c, "Resize"), m);
}

export async function stampImg(blob, text, meta = null) {
    const m = meta || await readPhotoMeta(blob);
    const img = await loadImg(blob), strip = stripHeight(img.width);
    let font = Math.round(strip * 0.7);
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height + strip;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    g.fillStyle = "white"; g.textAlign = "center"; g.textBaseline = "alphabetic"; g.font = `${font}px Arial`;
    while (font > 12 && g.measureText(text).width > c.width * 0.92) { font -= 2; g.font = `${font}px Arial`; }
    g.fillText(text, c.width / 2, c.height - Math.round(strip * 0.25));
    return injectExif(await toJpeg(c, "Markup"), m);
}

export async function unstampImg(blob, meta = null) {
    const m = meta || await readPhotoMeta(blob);
    const img = await loadImg(blob), strip = stripHeight(img.width);
    const c = document.createElement("canvas"); c.width = img.width; c.height = Math.max(1, img.height - strip);
    c.getContext("2d").drawImage(img, 0, 0);   // top-left aligned; the bottom strip falls off
    return injectExif(await toJpeg(c, "Crop"), m);
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
// ---------------------------------------------------------------------------------------------------------------
// PHOTO CAPTURE TIME + GPS EXIF & NAMING (2026-11-24, L: MMDDYY_HHMM_ prefix on loose/daily, _MMDDYY_HHMM suffix
// on device/sensor photos, EXIF re-embed after canvas resize/stamp, plus Firebase Storage customMetadata).
// Zero external dependencies; parses JPEG APP1 (II and MM byte order), falls back to file.lastModified / now.
const _pad2 = n => String(n).padStart(2, "0");

function _metaFromParts(Y, M, D, h, m, s, source, tzOff = "") {
    const dt = new Date(Y, M - 1, D, h, m, s || 0);
    const takenStamp = `${_pad2(M)}${_pad2(D)}${_pad2(Y % 100)}_${_pad2(h)}${_pad2(m)}`;
    const takenExif = `${String(Y).padStart(4, "0")}:${_pad2(M)}:${_pad2(D)} ${_pad2(h)}:${_pad2(m)}:${_pad2(s || 0)}`;
    const offMin = -dt.getTimezoneOffset();
    const offStr = tzOff || `${offMin >= 0 ? "+" : "-"}${_pad2(Math.floor(Math.abs(offMin) / 60))}:${_pad2(Math.abs(offMin) % 60)}`;
    const takenAt = `${String(Y).padStart(4, "0")}-${_pad2(M)}-${_pad2(D)}T${_pad2(h)}:${_pad2(m)}:${_pad2(s || 0)}${offStr}`;
    return { takenAt, takenMs: dt.getTime(), takenExif, takenStamp, takenSource: source, lat: null, lng: null, alt: null };
}

function _metaFromDate(ms, source) {
    const dt = new Date(Number.isFinite(ms) && ms > 0 ? ms : Date.now());
    return _metaFromParts(dt.getFullYear(), dt.getMonth() + 1, dt.getDate(), dt.getHours(), dt.getMinutes(), dt.getSeconds(), source);
}

function _parseExifDateStr(str) {
    const m = String(str || "").trim().match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    const Y = +m[1], Mo = +m[2], D = +m[3], h = +m[4], mi = +m[5], s = +m[6];
    if (Y < 1970 || Y > 2100 || Mo < 1 || Mo > 12 || D < 1 || D > 31) return null;
    return { Y, M: Mo, D, h, m: mi, s };
}

export function parseExifBytes(bytes) {
    if (!bytes || bytes.length < 12 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let pos = 2;
    while (pos + 4 <= bytes.length) {
        if (bytes[pos] !== 0xFF) break;
        while (pos < bytes.length && bytes[pos] === 0xFF) pos++;
        if (pos >= bytes.length) break;
        const marker = bytes[pos++];
        if (marker === 0xD9 || marker === 0xDA) break;
        if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) continue;
        if (pos + 2 > bytes.length) break;
        const segLen = dv.getUint16(pos, false);
        if (segLen < 2 || pos + segLen > bytes.length) break;
        if (marker === 0xE1 && segLen >= 16 &&
            bytes[pos + 2] === 0x45 && bytes[pos + 3] === 0x78 && bytes[pos + 4] === 0x69 &&
            bytes[pos + 5] === 0x66 && bytes[pos + 6] === 0x00 && bytes[pos + 7] === 0x00) {
            const tiff = pos + 8, end = pos + segLen;
            const le = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
            const be = bytes[tiff] === 0x4D && bytes[tiff + 1] === 0x4D;
            if (!le && !be) return null;
            if (dv.getUint16(tiff + 2, le) !== 0x002A) return null;
            const ifd0Off = dv.getUint32(tiff + 4, le);
            const readStr = (off, count) => {
                if (off < 0 || off + count > end) return "";
                let s = "";
                for (let i = 0; i < count; i++) { const c = bytes[off + i]; if (c === 0) break; s += String.fromCharCode(c); }
                return s.trim();
            };
            const readRat = (off) => {
                if (off < 0 || off + 8 > end) return NaN;
                const num = dv.getUint32(off, le), den = dv.getUint32(off + 4, le);
                return den ? num / den : NaN;
            };
            const readIfd = (relOff) => {
                const base = tiff + relOff;
                if (relOff <= 0 || base + 2 > end) return {};
                const cnt = dv.getUint16(base, le), out = {};
                for (let i = 0; i < cnt; i++) {
                    const e = base + 2 + i * 12;
                    if (e + 12 > end) break;
                    const tag = dv.getUint16(e, le), type = dv.getUint16(e + 2, le), count = dv.getUint32(e + 4, le), valOff = e + 8;
                    const typeSize = type === 1 || type === 2 || type === 7 ? 1 : type === 3 ? 2 : type === 4 || type === 9 ? 4 : type === 5 || type === 10 ? 8 : 0;
                    const dataOff = typeSize * count <= 4 ? valOff : tiff + dv.getUint32(valOff, le);
                    if (type === 2) out[tag] = readStr(dataOff, count);
                    else if (type === 3 && count === 1) out[tag] = dv.getUint16(valOff, le);
                    else if (type === 4 && count === 1) out[tag] = dv.getUint32(valOff, le);
                    else if (type === 1 && count === 1) out[tag] = bytes[valOff];
                    else if (type === 5) {
                        const arr = [];
                        for (let k = 0; k < count; k++) arr.push(readRat(dataOff + k * 8));
                        out[tag] = count === 1 ? arr[0] : arr;
                    }
                }
                return out;
            };
            const ifd0 = readIfd(ifd0Off);
            const exifIfd = ifd0[0x8769] ? readIfd(ifd0[0x8769]) : {};
            const gpsIfd = ifd0[0x8825] ? readIfd(ifd0[0x8825]) : {};
            const dateParts = _parseExifDateStr(exifIfd[0x9003] || exifIfd[0x9004] || ifd0[0x0132] || "");
            const tzRaw = String(exifIfd[0x9011] || exifIfd[0x9010] || "").trim();
            const tzOff = /^[+-]\d{2}:\d{2}$/.test(tzRaw) ? tzRaw : "";
            let lat = null, lng = null, alt = null;
            if (Array.isArray(gpsIfd[2]) && gpsIfd[2].length === 3 && gpsIfd[2].every(Number.isFinite)) {
                lat = gpsIfd[2][0] + gpsIfd[2][1] / 60 + gpsIfd[2][2] / 3600;
                if (String(gpsIfd[1] || "").toUpperCase() === "S") lat = -lat;
            }
            if (Array.isArray(gpsIfd[4]) && gpsIfd[4].length === 3 && gpsIfd[4].every(Number.isFinite)) {
                lng = gpsIfd[4][0] + gpsIfd[4][1] / 60 + gpsIfd[4][2] / 3600;
                if (String(gpsIfd[3] || "").toUpperCase() === "W") lng = -lng;
            }
            if (Number.isFinite(gpsIfd[6])) alt = gpsIfd[5] === 1 ? -gpsIfd[6] : gpsIfd[6];
            return { dateParts, tzOff, lat, lng, alt, orientation: ifd0[0x0112] || 1 };
        }
        pos += segLen;
    }
    return null;
}

function _buildExifApp1(meta) {
    const dtStr = (meta?.takenExif && _parseExifDateStr(meta.takenExif))
        ? meta.takenExif
        : _metaFromDate(meta?.takenMs || Date.now(), "upload").takenExif;
    const hasGps = Number.isFinite(meta?.lat) && Number.isFinite(meta?.lng);
    const hasAlt = hasGps && Number.isFinite(meta?.alt);
    const buf = [];
    const pushU8 = v => buf.push(v & 0xFF);
    const pushU16 = v => { buf.push((v >> 8) & 0xFF, v & 0xFF); };
    const pushU32 = v => { buf.push((v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF); };
    const setU32 = (off, v) => { buf[off] = (v >>> 24) & 0xFF; buf[off + 1] = (v >>> 16) & 0xFF; buf[off + 2] = (v >>> 8) & 0xFF; buf[off + 3] = v & 0xFF; };
    const pushAscii = s => { for (let i = 0; i < s.length; i++) pushU8(s.charCodeAt(i)); pushU8(0); };
    const pushDms = degVal => {
        const a = Math.abs(degVal), d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), s10000 = Math.round((mf - m) * 60 * 10000);
        pushU32(d); pushU32(1); pushU32(m); pushU32(1); pushU32(s10000); pushU32(10000);
    };
    pushU8(0x4D); pushU8(0x4D); pushU16(0x002A); pushU32(8);
    const writeIfd = entries => {
        const start = buf.length;
        entries.sort((a, b) => a.tag - b.tag);
        pushU16(entries.length);
        const patchList = [];
        for (const e of entries) {
            pushU16(e.tag); pushU16(e.type); pushU32(e.count);
            const valPos = buf.length;
            if (e.inline !== undefined) { for (let i = 0; i < 4; i++) pushU8(e.inline[i] || 0); }
            else { pushU32(0); patchList.push({ valPos, write: e.write }); }
        }
        pushU32(0);
        for (const p of patchList) { setU32(p.valPos, buf.length); p.write(); if (buf.length % 2 === 1) pushU8(0); }
        return start;
    };
    let exifPtrPos = -1, gpsPtrPos = -1;
    const ifd0Entries = [
        { tag: 0x0112, type: 3, count: 1, inline: [0, 1, 0, 0] },
        { tag: 0x0132, type: 2, count: dtStr.length + 1, write: () => pushAscii(dtStr) },
        { tag: 0x8769, type: 4, count: 1, inline: [0, 0, 0, 0], _ptr: "exif" },
    ];
    if (hasGps) ifd0Entries.push({ tag: 0x8825, type: 4, count: 1, inline: [0, 0, 0, 0], _ptr: "gps" });
    ifd0Entries.sort((a, b) => a.tag - b.tag);
    pushU16(ifd0Entries.length);
    const ifd0Patch = [];
    for (const e of ifd0Entries) {
        pushU16(e.tag); pushU16(e.type); pushU32(e.count);
        const valPos = buf.length;
        if (e._ptr === "exif") { exifPtrPos = valPos; pushU32(0); }
        else if (e._ptr === "gps") { gpsPtrPos = valPos; pushU32(0); }
        else if (e.inline !== undefined) { for (let i = 0; i < 4; i++) pushU8(e.inline[i] || 0); }
        else { pushU32(0); ifd0Patch.push({ valPos, write: e.write }); }
    }
    pushU32(0);
    for (const p of ifd0Patch) { setU32(p.valPos, buf.length); p.write(); if (buf.length % 2 === 1) pushU8(0); }
    const exifOff = writeIfd([
        { tag: 0x9000, type: 7, count: 4, inline: [0x30, 0x32, 0x33, 0x32] },
        { tag: 0x9003, type: 2, count: dtStr.length + 1, write: () => pushAscii(dtStr) },
        { tag: 0x9004, type: 2, count: dtStr.length + 1, write: () => pushAscii(dtStr) },
    ]);
    setU32(exifPtrPos, exifOff);
    if (hasGps) {
        const latRef = meta.lat < 0 ? "S" : "N", lngRef = meta.lng < 0 ? "W" : "E";
        const gpsEntries = [
            { tag: 0x0000, type: 1, count: 4, inline: [2, 3, 0, 0] },
            { tag: 0x0001, type: 2, count: 2, inline: [latRef.charCodeAt(0), 0, 0, 0] },
            { tag: 0x0002, type: 5, count: 3, write: () => pushDms(meta.lat) },
            { tag: 0x0003, type: 2, count: 2, inline: [lngRef.charCodeAt(0), 0, 0, 0] },
            { tag: 0x0004, type: 5, count: 3, write: () => pushDms(meta.lng) },
        ];
        if (hasAlt) {
            gpsEntries.push({ tag: 0x0005, type: 1, count: 1, inline: [meta.alt < 0 ? 1 : 0, 0, 0, 0] });
            gpsEntries.push({ tag: 0x0006, type: 5, count: 1, write: () => { pushU32(Math.round(Math.abs(meta.alt) * 100)); pushU32(100); } });
        }
        setU32(gpsPtrPos, writeIfd(gpsEntries));
    }
    const payloadLen = 2 + 6 + buf.length;
    const out = new Uint8Array(2 + payloadLen);
    out[0] = 0xFF; out[1] = 0xE1;
    out[2] = (payloadLen >> 8) & 0xFF; out[3] = payloadLen & 0xFF;
    out[4] = 0x45; out[5] = 0x78; out[6] = 0x69; out[7] = 0x66; out[8] = 0x00; out[9] = 0x00;
    out.set(buf, 10);
    return out;
}

export function injectExifBytes(jpegBytes, meta) {
    if (!jpegBytes || jpegBytes.length < 4 || jpegBytes[0] !== 0xFF || jpegBytes[1] !== 0xD8 || !meta) return jpegBytes;
    const app1 = _buildExifApp1(meta);
    const chunks = [jpegBytes.subarray(0, 2)];
    let pos = 2, inserted = false;
    while (pos + 4 <= jpegBytes.length && jpegBytes[pos] === 0xFF) {
        const marker = jpegBytes[pos + 1];
        if (marker === 0xDA || marker === 0xD9) break;
        const segLen = (jpegBytes[pos + 2] << 8) | jpegBytes[pos + 3];
        if (segLen < 2 || pos + 2 + segLen > jpegBytes.length) break;
        const isExifApp1 = marker === 0xE1 && segLen >= 8 &&
            jpegBytes[pos + 4] === 0x45 && jpegBytes[pos + 5] === 0x78 && jpegBytes[pos + 6] === 0x69 &&
            jpegBytes[pos + 7] === 0x66 && jpegBytes[pos + 8] === 0x00 && jpegBytes[pos + 9] === 0x00;
        if (marker === 0xE0) {
            chunks.push(jpegBytes.subarray(pos, pos + 2 + segLen));
            if (!inserted) { chunks.push(app1); inserted = true; }
        } else if (!isExifApp1) {
            if (!inserted) { chunks.push(app1); inserted = true; }
            chunks.push(jpegBytes.subarray(pos, pos + 2 + segLen));
        }
        pos += 2 + segLen;
    }
    if (!inserted) chunks.push(app1);
    chunks.push(jpegBytes.subarray(pos));
    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    const merged = new Uint8Array(totalLen);
    let o = 0;
    for (const c of chunks) { merged.set(c, o); o += c.length; }
    return merged;
}

export async function readPhotoMeta(file) {
    try {
        if (file && typeof file.arrayBuffer === "function") {
            const head = file.slice ? file.slice(0, 262144) : file;
            const ex = parseExifBytes(new Uint8Array(await head.arrayBuffer()));
            if (ex) {
                const base = ex.dateParts
                    ? _metaFromParts(ex.dateParts.Y, ex.dateParts.M, ex.dateParts.D, ex.dateParts.h, ex.dateParts.m, ex.dateParts.s, "exif", ex.tzOff)
                    : (file.lastModified ? _metaFromDate(file.lastModified, "file") : _metaFromDate(Date.now(), "upload"));
                base.lat = ex.lat; base.lng = ex.lng; base.alt = ex.alt;
                return base;
            }
        }
    } catch (_) {}
    if (file && Number.isFinite(file.lastModified) && file.lastModified > 0) return _metaFromDate(file.lastModified, "file");
    return _metaFromDate(Date.now(), "upload");
}

export async function injectExif(jpegBlob, meta) {
    if (!jpegBlob || !meta) return jpegBlob;
    try {
        const out = injectExifBytes(new Uint8Array(await jpegBlob.arrayBuffer()), meta);
        return new Blob([out], { type: "image/jpeg" });
    } catch (_) { return jpegBlob; }
}

export function formatTakenStamp(meta) {
    return (meta && meta.takenStamp) || _metaFromDate(Date.now(), "upload").takenStamp;
}

export function prefixTakenName(base, meta) {
    const clean = String(base || "image").replace(/^_+|_+$/g, "") || "image";
    if (/^\d{6}_\d{4}_/.test(clean)) return clean;
    return `${formatTakenStamp(meta)}_${clean}`;
}

export function suffixTakenName(base, meta) {
    const clean = String(base || "image").replace(/^_+|_+$/g, "") || "image";
    if (/_\d{6}_\d{4}$/.test(clean)) return clean;
    return `${clean}_${formatTakenStamp(meta)}`;
}

export function photoUploadMeta(meta, existingCustom = {}) {
    const cm = { ...(existingCustom || {}) };
    if (meta) {
        if (meta.takenAt) cm.takenAt = String(meta.takenAt);
        if (meta.takenStamp) cm.takenStamp = String(meta.takenStamp);
        if (meta.takenSource) cm.takenSource = String(meta.takenSource);
        if (Number.isFinite(meta.lat) && Number.isFinite(meta.lng)) {
            cm.lat = meta.lat.toFixed(6);
            cm.lng = meta.lng.toFixed(6);
        }
        if (Number.isFinite(meta.alt)) cm.alt = String(Math.round(meta.alt * 10) / 10);
    }
    return { contentType: "image/jpeg", customMetadata: cm };
}

export function photoRecordMeta(meta) {
    if (!meta) return {};
    const out = {};
    if (meta.takenAt) out.takenAt = meta.takenAt;
    if (Number.isFinite(meta.lat) && Number.isFinite(meta.lng)) {
        out.lat = Number(meta.lat.toFixed(6));
        out.lng = Number(meta.lng.toFixed(6));
    }
    return out;
}
