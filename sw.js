// sw.js - the Droplet Console's service worker (2026-10-21, L: "push notifications: the console on your home screen gets
// real pushes"). It does ONE thing: receive a Web Push from se (ops\notify\notify.py sends through the browser's push
// service with the VAPID key) and show it as a notification; a tap opens or focuses the console. No caching, no offline
// page - the console stays a live page. Scope = the site root, so it serves console.html and the hub.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
    let d = {};
    try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : "" }; }
    const title = d.title || "Droplet";
    const opts = {
        body: d.body || "",
        tag: d.tag || undefined,            // same tag = the newer one replaces the older (no pile-ups)
        renotify: !!d.tag,
        icon: d.icon || "/assets/img/console-app-192.png",
        badge: "/assets/img/console-app-192.png",
        data: { url: d.url || "/console.html" },
        timestamp: d.at || Date.now()
    };
    e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener("notificationclick", e => {
    e.notification.close();
    const url = new URL((e.notification.data && e.notification.data.url) || "/console.html", self.location.origin).href;
    e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
        for (const c of list) { if (c.url.split("#")[0] === url.split("#")[0] && "focus" in c) return c.focus(); }
        return self.clients.openWindow(url);
    }));
});

// the push service may rotate a subscription; tell the page so it re-saves (the page listens for this message)
self.addEventListener("pushsubscriptionchange", e => {
    e.waitUntil(self.clients.matchAll({ type: "window" }).then(list => list.forEach(c => c.postMessage({ type: "resubscribe" }))));
});
