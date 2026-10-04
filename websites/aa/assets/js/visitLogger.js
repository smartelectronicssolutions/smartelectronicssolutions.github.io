// aa's own copy (2026-10-03, L: every site under websites/ carries its own files) of assets/js/visitLogger.js.
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
    runTransaction,
    set
} from './firebase-init.js';
// increment() is a write-only counter - the per-IP node is NOT readable by visitors any more (2026-09-27, see below)
import { increment } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js';

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

        // Aggregate fields WITHOUT reading (2026-09-27, Firebase egress fix 3): the old transaction on the IP root
        // downloaded that visitor's whole hit history on every page view, and the log was world-readable (IPs).
        // Now: write-only fields + a server-side increment; firstSeen is write-once in the rules (set fails quietly
        // after the first visit). The log is readable by L only; the hub reads the rollup the daemon builds.
        await update(ref(db, `public/log/visits/${sip}`), { ip, lastSeen: now, lastPage: page, count: increment(1) });
        // firstSeen is write-once in the rules, so a repeat visit is DENIED by design - and the SDK prints every denial as a
        // FIREBASE WARNING (L saw it in the console 2026-10-04). Remember "already set from this browser" so only the first
        // visit from a browser tries; a denial means the IP already has one, so that is remembered too.
        const seenKey = `vl_first_${sip}`; let seen = false; try { seen = !!localStorage.getItem(seenKey); } catch (_) {}
        if (!seen) { const mark = () => { try { localStorage.setItem(seenKey, '1'); } catch (_) {} }; set(ref(db, `public/log/visits/${sip}/firstSeen`), now).then(mark, mark); }

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
