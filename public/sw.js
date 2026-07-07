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

// ===================================================================
// Web Push (P3b — docs/pwa-notifications-plan.md). The SW has NO Supabase session, so it
// can never write push_subscriptions (RLS = authenticated) — the app reconciles on open.
// ===================================================================
const ICON = '/icon-192.png';

self.addEventListener('push', (event) => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; } catch (_) { p = {}; }
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const focused = wins.find((c) => c.focused || c.visibilityState === 'visible');
    const data = { url: p.url || `/alerts?event=${p.event_id || ''}`, event_id: p.event_id, tenant_id: p.tenant_id };
    if (focused) {
      // App open + focused: let the in-app bell own it. userVisibleOnly forbids showing
      // nothing, so post to the page and show a minimal, silent, non-escalating notice.
      focused.postMessage({ type: 'notif', event: p });
      return self.registration.showNotification(p.title || 'Alert', {
        body: p.body || '', icon: ICON, badge: ICON, tag: p.event_id, renotify: false, silent: true, data,
      });
    }
    // App closed/background: full escalation (critical stays up until acted on).
    return self.registration.showNotification(p.title || 'Alert', {
      body: p.body || '', icon: ICON, badge: ICON, tag: p.event_id, renotify: true,
      requireInteraction: p.severity === 'critical', data,
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/alerts';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
      const w = ws.find((c) => c.url.startsWith(self.location.origin));
      if (w) return w.focus().then(() => ('navigate' in w ? w.navigate(url) : null));
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // Best-effort re-subscribe with the SAME app server key; cache the new endpoint for the
  // app to reconcile (write to push_subscriptions) on its next authenticated open.
  event.waitUntil((async () => {
    try {
      const key = await idbGet('app_server_key');
      if (!key) return;
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await idbSet('rotated_endpoint', sub.toJSON());
    } catch (_) { /* reconciled on next app-open */ }
  })());
});

// --- tiny IndexedDB kv (SW + client share DB 'pwa-push', store 'kv') ---
function idbOpen() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('pwa-push', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly').objectStore('kv').get(key);
    tx.onsuccess = () => resolve(tx.result);
    tx.onerror = () => reject(tx.error);
  });
}
async function idbSet(key, val) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
