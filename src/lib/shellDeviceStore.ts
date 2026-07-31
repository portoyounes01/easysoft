// Renderer side of the shell device store (update-policy §6.2 / register D-U4).
//
// MUST be the first import of the till entrypoint: at module-eval time it
// hydrates localStorage from the shell's safeStorage snapshot so everything
// that reads identity synchronously (route guards, the Supabase client's
// session recovery) sees device-owned state — regardless of which web origin
// (app://pos or the network ui_origin) this renderer happens to be.
//
// Old shells (no deviceStore in the preload) and browser hosts no-op: behavior
// is exactly the pre-existing per-origin localStorage.

// Identity keys the device owns: the pairing scope and the Supabase auth
// session (`sb-<project-ref>-auth-token`, plus supabase-js's variants).
// Mirrored in electron/deviceStore.js isAllowedKey — keep in sync.
const isMirroredKey = (key: string): boolean =>
  key === 'pos_device_pairing_scope' || (key.startsWith('sb-') && key.includes('-auth-token'));

type DeviceStoreBridge = {
  snapshot: Record<string, string> | null;
  storeExists?: boolean;
  set(key: string, value: string): Promise<{ success: boolean; error?: string }>;
  remove(key: string): Promise<{ success: boolean; error?: string }>;
};

function bridge(): DeviceStoreBridge | null {
  if (typeof window === 'undefined') return null;
  const store = (window.electronAPI as { deviceStore?: DeviceStoreBridge } | undefined)?.deviceStore;
  return store && typeof store.set === 'function' ? store : null;
}

// Fail-loud (P3): a resolved {success:false} is a REAL persistence failure
// (safeStorage unavailable, store full, disk error) — the exact silent-void
// that would strand identity at the next origin flip. Surface it hard.
function reportMirrorFailure(key: string, error: string): void {
  console.error(
    `⚠️ deviceStore mirror FAILED for ${key}: ${error} — pairing/session will NOT survive a renderer_source flip until this is fixed`,
  );
}

/** Write-through: keep the shell copy of a device-owned key current. */
export function mirrorToShell(key: string, value: string | null): void {
  const store = bridge();
  if (!store || !isMirroredKey(key)) return;
  const call = value === null ? store.remove(key) : store.set(key, value);
  call
    .then((result) => {
      if (!result?.success) reportMirrorFailure(key, result?.error ?? 'unknown error');
      // One active Supabase project per till: writing a session purges any
      // other project's stale auth-token from the device store.
      if (result?.success && value !== null && key.startsWith('sb-')) {
        purgeOtherAuthTokens(store, key);
      }
    })
    .catch((error) => reportMirrorFailure(key, String(error)));
}

function purgeOtherAuthTokens(store: DeviceStoreBridge, activeKey: string): void {
  const snapshot = store.snapshot;
  if (!snapshot) return;
  for (const key of Object.keys(snapshot)) {
    if (key !== activeKey && key.startsWith('sb-') && key.includes('-auth-token')) {
      store.remove(key).catch(() => undefined);
      delete snapshot[key];
    }
  }
}

// Freshness comparison for conflicting copies of the same key: prefer the
// Supabase session with the later expires_at / the pairing scope with the
// later pairedAt. Unparseable → 0, so a parseable copy always wins over junk.
function freshness(key: string, raw: string): number {
  try {
    const parsed = JSON.parse(raw) as { expires_at?: number; pairedAt?: string };
    if (key.startsWith('sb-') && typeof parsed.expires_at === 'number') return parsed.expires_at * 1000;
    if (typeof parsed.pairedAt === 'string') return Date.parse(parsed.pairedAt) || 0;
    return 0;
  } catch {
    return 0;
  }
}

function hydrate(): void {
  const store = bridge();
  if (!store) return;
  const snapshot = store.snapshot;

  // Shell → localStorage: carries pairing + session across an origin flip.
  // When BOTH sides hold the key, the fresher copy wins — a session refreshed
  // locally after a failed mirror must not be clobbered by a stale shell copy.
  if (snapshot && typeof snapshot === 'object') {
    for (const [key, value] of Object.entries(snapshot)) {
      if (!isMirroredKey(key) || typeof value !== 'string') continue;
      try {
        const local = localStorage.getItem(key);
        if (local !== null && local !== value && freshness(key, local) > freshness(key, value)) {
          mirrorToShell(key, local); // repair the shell instead
          continue;
        }
        localStorage.setItem(key, value);
      } catch (error) {
        console.error('deviceStore hydrate failed:', key, error);
      }
    }
  }

  // localStorage → shell adoption, ONLY on a never-written store (first boot
  // on a store-capable shell): a store that exists but lacks a key may lack it
  // because it was deliberately removed (sign-out) — re-planting a leftover
  // copy from an inactive origin would resurrect a revoked identity.
  if (store.storeExists) return;
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !isMirroredKey(key)) continue;
    if (snapshot && typeof snapshot[key] === 'string') continue;
    const value = localStorage.getItem(key);
    if (value !== null) mirrorToShell(key, value);
  }
}

hydrate();
