// visitLogger.js — simplified visit logging (no IP fetch)
import {
    getDatabase,
    get,
    ref,
    set,
    push
} from '../../apps/assets/js/firebase-init-noauth.js';

export async function updateVisitCount() {
    const db = getDatabase();
    const visitCountRef = ref(db, 'public/log/visitCount');
    const visitsLogRef = ref(db, 'public/log/visits');
    const visitTime = new Date().toISOString();
    const visitURL = window.location.href;
    const pageTitle = document.title || 'unknown';

    try {
        // Increment total visit count
        const snapshot = await get(visitCountRef);
        let visitCount = snapshot.exists() ? snapshot.val() : 0;
        visitCount += 1;

        const counterElement = document.getElementById("visit-counter");
        if (counterElement) {
            counterElement.textContent = ` | Visits: ${visitCount}`;
        }

        await set(visitCountRef, visitCount);

        // Log individual visit (no IP, just timestamp + URL + title)
        await push(visitsLogRef, {
            time: visitTime,
            url: visitURL,
            title: pageTitle
        });

    } catch (error) {
        console.error("Error logging visit:", error);
    }
}

// Keep getIP as a no-op for backward compatibility
export function getIP() {
    return Promise.resolve({ ip: 'unknown' });
}
