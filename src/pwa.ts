// PWA registration — ONLY on the browser/PWA host (never the Electron till) and only in a
// secure context (HTTPS, or localhost for dev). Registers the minimal online-required
// service worker and captures the install prompt for a future custom "Install" button.
// docs/pwa-plan.md §6.
import { isPwaHost } from './lib/host';

// Stashed so a UI affordance can call prompt() later; browsers fire this when installable.
export let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function registerPwa(): void {
  // The Electron till is a native shell — no manifest/SW/install there.
  if (!isPwaHost) return;
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // suppress the mini-infobar; we can surface our own button later
    deferredInstallPrompt = e as BeforeInstallPromptEvent;
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
