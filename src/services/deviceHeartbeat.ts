// Till presence heartbeat (P3c — docs/pwa-notifications-plan.md P3c Step 4).
// A ~60s liveness ping so the server-side sweep can detect an offline till. STRICTLY the
// Electron till + a device session (app_role==='device'); a human/PWA never heartbeats.
// SEPARATE from the 5s ping() connectivity singleton — this writes devices.last_seen_at and
// must stay well below the smallest grace_seconds (60s ≪ 300s default) so a token refresh or a
// brief hiccup never trips a false OFFLINE.
import { supabase } from '../lib/supabase';
import { isTillHost } from '../lib/host';
import type { Session } from '@supabase/supabase-js';

const INTERVAL_MS = 60_000;
let timer: ReturnType<typeof setInterval> | null = null;
let onlineHandler: (() => void) | null = null;

function isDeviceSession(session: Session | null): boolean {
  return session?.user?.app_metadata?.app_role === 'device';
}

async function beat(): Promise<void> {
  try {
    // getSession() OUTSIDE an auth callback is safe (no auth-lock deadlock).
    const { data: { session } } = await supabase.auth.getSession();
    if (!isDeviceSession(session)) return;
    await supabase.rpc('device_heartbeat'); // self-scoped + device-gated server-side
  } catch { /* best-effort; connectivity/readiness is handled elsewhere */ }
}

function start(): void {
  if (timer) return;
  void beat(); // fire immediately so a fresh enrollment flips unknown->online at once
  timer = setInterval(() => void beat(), INTERVAL_MS);
  onlineHandler = () => void beat(); // reconnect: prove liveness without waiting for the next tick
  window.addEventListener('online', onlineHandler);
}

function stop(): void {
  if (timer) { clearInterval(timer); timer = null; }
  if (onlineHandler) { window.removeEventListener('online', onlineHandler); onlineHandler = null; }
}

// Call once at till boot. Starts/stops with the presence of a device session.
export function initDeviceHeartbeat(): void {
  if (!isTillHost) return;
  supabase.auth.onAuthStateChange((_event, session) => {
    if (isDeviceSession(session)) start();
    else stop();
  });
  void supabase.auth.getSession().then(({ data: { session } }) => {
    if (isDeviceSession(session)) start();
  });
}
