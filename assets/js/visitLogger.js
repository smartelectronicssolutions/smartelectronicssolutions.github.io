// Canonical visit logger. One schema, one tree.
//
//   public/log/visitCount            : int (atomic counter)
//   public/log/visits/{sanitizedIp}/ : per-IP aggregate
//       ip, name?, firstSeen, lastSeen, lastPage, count
//       hits/{pushId}: { time, url, page }
//
//   {sanitizedIp} = ip with '.' and ':' replaced by '-'

import {
    getDatabase,
    ref,
    push,
    update,
    runTransaction
} from '../../apps/assets/js/firebase-init.js';

function normalizePage(href) {
    let pathname;
    try { pathname = new URL(href).pathname; } catch { pathname = href || '/'; }
    pathname = pathname.replace(/^\/+/, '');
    pathname = pathname.replace(/^luissolutions\.github\.io\//, '');
    pathname = pathname.replace(/\/index\.html$/, '/');
    return pathname || 'index.html';
}

function sanitizeIp(ip) {
    return (ip || 'unknown').replace(/[.:]/g, '-').replace(/[#$\[\]\/]/g, '_');
}

export async function updateVisitCount(ipAddress) {
    const db   = getDatabase();
    const ip   = ipAddress || 'unknown';
    const sip  = sanitizeIp(ip);
    const now  = new Date().toISOString();
    const url  = window.location.href;
    const page = normalizePage(url);

    try {
        // Atomic global counter
        const txGlobal = await runTransaction(
            ref(db, 'public/log/visitCount'),
            n => (n || 0) + 1
        );

        // Per-IP hit (push so concurrent writers never collide)
        await push(ref(db, `public/log/visits/${sip}/hits`), { time: now, url, page });

        // Aggregate fields on the IP root — use transaction on the wrapper so we set
        // firstSeen once and bump count atomically.
        await runTransaction(ref(db, `public/log/visits/${sip}`), prev => {
            const p = prev || {};
            // Note: ...p already carries `hits` if it exists. Adding an explicit
            // `hits: p.hits` line breaks the transaction on first visits because
            // RTDB rejects returned objects with undefined property values.
            return {
                ...p,
                ip,
                firstSeen: p.firstSeen || now,
                lastSeen:  now,
                lastPage:  page,
                count:     (p.count || 0) + 1,
            };
        });

        const el = document.getElementById('visit-counter');
        if (el && txGlobal.snapshot) el.textContent = ` | Visits: ${txGlobal.snapshot.val()}`;
    } catch (err) {
        console.error('Visit log error:', err);
    }
}

// Contact-form submission: merge name/extra fields onto the same per-IP node.
export async function updateVisitData(ipAddress, name, extra = {}) {
    const db  = getDatabase();
    const ip  = ipAddress || 'unknown';
    const sip = sanitizeIp(ip);
    try {
        const payload = {
            ip,
            ...(name ? { name } : {}),
            ...extra,
            contactedAt: new Date().toISOString()
        };
        await update(ref(db, `public/log/visits/${sip}`), payload);
    } catch (err) {
        console.error('Contact log error:', err);
    }
}

export function getIP() {
    return fetch('https://api.ipify.org?format=json')
        .then(r => r.json())
        .then(d => d.ip)
        .catch(() => 'unknown');
}
