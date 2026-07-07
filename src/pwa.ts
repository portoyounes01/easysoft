// PWA registration + install control — ONLY on the browser/PWA host (never the Electron
// till) and only in a secure context (HTTPS, or localhost for dev). Registers the minimal
// online-required service worker and captures the install prompt so the app can surface
// its own "Install" button. docs/pwa-plan.md §6.
import { isPwaHost } from './lib/host';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Stashed when the browser says the app is installable (Chrome/Android/desktop). iOS Safari
// never fires this — install there is manual (Share -> Add to Home Screen), handled in the UI.
let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

// UI subscribes to this to re-render its install affordance.
export const PWA_INSTALL_EVENT = 'pwa:installstatechange';

export function canInstall(): boolean {
  return deferredInstallPrompt !== null;
}

// Trigger the native install dialog. Returns the outcome (or 'unavailable' if the browser
// hasn't offered install — e.g. iOS, already installed, or criteria unmet).
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredInstallPrompt) return 'unavailable';
  await deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null; // a prompt can only be used once
  window.dispatchEvent(new Event(PWA_INSTALL_EVENT));
  return outcome;
}

export function registerPwa(): void {
  // The Electron till is a native shell — no manifest/SW/install there.
  if (!isPwaHost || typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // suppress the mini-infobar; we surface our own button
    deferredInstallPrompt = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event(PWA_INSTALL_EVENT));
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    window.dispatchEvent(new Event(PWA_INSTALL_EVENT));
  });

  // Service workers require a secure context: HTTPS in production, or localhost in dev.
  // On plain HTTP (a non-localhost dev host) they are unavailable — skip quietly.
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}
