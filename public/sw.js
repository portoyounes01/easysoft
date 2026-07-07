// Minimal service worker for the online-required PWA (docs/pwa-plan.md §6).
// It does NOT cache the app (v1 is online-required) — it only: (a) makes the app
// installable, (b) serves a friendly offline fallback for failed navigations instead of
// the browser's blank error page, and (c) is the hook future web push will attach to.
const OFFLINE_URL = '/offline.html';
const CACHE = 'pwa-offline-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  // Network-only, except: a failed page navigation falls back to the offline page.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
  }
});
