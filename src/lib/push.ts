// Web Push opt-in / disable / reconcile for the installed PWA (docs/pwa-notifications-plan.md P3b Step 4).
// PWA host + membership only. Feature-detect FIRST, distinguish denied vs default, and rotate the
// browser subscription when a different user owned it on this physical device (shared-device re-own).
import { supabase } from './supabase';
import { isPwaHost } from './host';

export type AlertsState = 'unsupported' | 'needs-install' | 'blocked' | 'default' | 'granted';

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function isIos(): boolean {
  return /iP(hone|ad|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS masquerades as Mac
}
function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
}
function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// --- IndexedDB kv shared with the SW (DB 'pwa-push', store 'kv') ---
function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('pwa-push', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const req = db.transaction('kv', 'readonly').objectStore('kv').get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key: string, val: unknown): Promise<void> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Static capability (no side effects) — drives the Settings toggle's copy.
export function alertsCapability(): AlertsState {
  if (!supported() || !VAPID_PUBLIC) return 'unsupported';
  if (isIos() && !isStandalone()) return 'needs-install'; // iOS push needs an installed PWA (16.4+)
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission === 'granted') return 'granted';
  return 'default';
}

export async function currentSubscriptionState(): Promise<{ capability: AlertsState; subscribed: boolean }> {
  const capability = alertsCapability();
  let subscribed = false;
  if (isPwaHost && supported() && capability !== 'unsupported' && capability !== 'needs-install') {
    try {
      const reg = await navigator.serviceWorker.ready;
      subscribed = !!(await reg.pushManager.getSubscription());
    } catch { /* ignore */ }
  }
  return { capability, subscribed };
}

async function upsertSubscription(sub: PushSubscription, userId: string, tenantId: string): Promise<void> {
  const json = sub.toJSON();
  const keys = json.keys ?? {};
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth,
      tenant_id: tenantId, user_id: userId, user_agent: navigator.userAgent,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,tenant_id,endpoint' }, // composite; RLS WITH CHECK re-verifies tenant/user
  );
  if (error) console.warn('[push] subscription upsert failed:', error.message);
  await idbSet('push_owner', { user_id: userId });
}

// Opt in. MUST be invoked from a user gesture (Notification.requestPermission).
export async function enableAlerts(userId: string, tenantId: string): Promise<AlertsState> {
  if (!isPwaHost || !supported() || !VAPID_PUBLIC) return 'unsupported';
  if (isIos() && !isStandalone()) return 'needs-install';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return perm === 'denied' ? 'blocked' : 'default';
  }
  const reg = await navigator.serviceWorker.ready;
  const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC);
  await idbSet('app_server_key', appServerKey); // SW re-subscribes with this on pushsubscriptionchange
  let sub = await reg.pushManager.getSubscription();
  const cachedOwner = await idbGet<{ user_id: string }>('push_owner');
  if (sub && cachedOwner && cachedOwner.user_id !== userId) { await sub.unsubscribe(); sub = null; } // re-own device
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey });
  await upsertSubscription(sub, userId, tenantId);
  return 'granted';
}

export async function disableAlerts(userId: string, tenantId: string): Promise<void> {
  if (!supported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.toJSON().endpoint;
    await sub.unsubscribe();
    if (endpoint) {
      await supabase.from('push_subscriptions').delete()
        .eq('user_id', userId).eq('tenant_id', tenantId).eq('endpoint', endpoint);
    }
  } catch (e) { console.warn('[push] disable failed:', e); }
}

// Silent reconcile on SIGNED_IN / app-open / switch-tenant. NEVER prompts (only acts if already
// granted + subscribed). Repairs a subscription the SW rotated while the app was closed, and
// writes a row for the newly-active tenant (composite key keeps prior-tenant rows if still a member).
export async function reconcileAlerts(userId: string, tenantId: string): Promise<void> {
  if (!isPwaHost || !supported() || !VAPID_PUBLIC || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await idbSet('rotated_endpoint', null); // clear any stale SW-cached rotation marker
    let sub = await reg.pushManager.getSubscription();
    const cachedOwner = await idbGet<{ user_id: string }>('push_owner');
    if (sub && cachedOwner && cachedOwner.user_id !== userId) { await sub.unsubscribe(); sub = null; }
    if (!sub) return; // not opted in on this device — do nothing, never prompt
    await upsertSubscription(sub, userId, tenantId);
  } catch { /* best-effort */ }
}
