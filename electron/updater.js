// Auto-update channel (update-policy D10/O2, pulled forward by user decision
// 2026-07-24 — register D-U5).
//
// ⚠️ UNSIGNED (v1 code-signing decision stands): there is no publisher-
// signature verification on downloads; integrity rests on the HTTPS-only feed
// and the sha512 in latest.yml. The feed URL comes from the Stage-0 runtime
// config (`update_feed_url` in userData/config.json) — no URL, no updater,
// fully inert, so shipping this code changes nothing until a till is configured.
//
// Never interrupts selling (§7.2: updates are informational). Install moments,
// in order of preference:
//   1. While the till sits at the BOOT GATE — the natural maintenance window.
//      A kiosk that is powered off at night never fires Electron's 'quit'
//      (Windows shutdown skips it), so quit-time install alone would defer
//      forever; the boot check re-surfaces the cached download at the gate and
//      installs BEFORE selling starts.
//   2. On a real app quit (Alt+F4, gate Restart) via autoInstallOnAppQuit —
//      gate:restart routes through quitAndInstallIfPending() so relaunch and
//      the NSIS installer never race each other.
const { app, Notification } = require('electron');

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const GATE_INSTALL_DELAY_MS = 2000;

let lastStatus = { status: 'disabled', detail: '', at: null };
let updaterRef = null;
let pendingVersion = null;
let installNotified = false;

// OS-level toast while the silent NSIS install runs: from the operator's view
// the app "quits and won't reopen" for ~a minute — without this, that reads as
// a hang and they mash the icon. Best-effort (toasts need an AppUserModelID on
// Windows — main.js sets it; if the OS refuses, nothing breaks).
function notifyInstalling(version, willRelaunch) {
  if (installNotified) return;
  installNotified = true;
  try {
    if (!Notification.isSupported()) return;
    new Notification({
      title: `Installing POS update ${version || ''}`.trim(),
      body: willRelaunch
        ? 'The app will restart by itself in about a minute — no action needed.'
        : 'Installing in the background — you can reopen the app in about a minute.',
      silent: true,
    }).show();
  } catch (error) {
    console.error('[updater] install notification failed:', error.message);
  }
}

function initAutoUpdater({ feedUrl, isDev, getWindow, ipcMain }) {
  registerStatusIpc(ipcMain);

  const disabled = (reason) => {
    lastStatus = { status: 'disabled', detail: reason, at: new Date().toISOString() };
    console.log('[updater] disabled:', reason);
    return { enabled: false, reason };
  };

  if (isDev) return disabled('dev mode');
  if (!feedUrl) return disabled('no update_feed_url in config.json');
  if (process.platform === 'darwin') return disabled('macOS requires signed builds (no macOS tills)');

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (error) {
    return disabled(`electron-updater unavailable: ${error.message}`);
  }
  updaterRef = autoUpdater;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });

  // Alt+F4 with a downloaded update: autoInstallOnAppQuit installs during the
  // quit WITHOUT relaunching — the operator's next click on the icon does
  // nothing until NSIS finishes, which reads as a hang. Toast before exiting.
  // (gate:restart / restart-to-install go through quitAndInstallIfPending,
  // which notifies with the "restarts by itself" wording; installNotified
  // dedupes when both fire.)
  app.on('before-quit', () => {
    if (pendingVersion !== null) notifyInstalling(pendingVersion, false);
  });

  const send = (status, detail) => {
    lastStatus = { status, detail: detail || '', at: new Date().toISOString() };
    console.log('[updater]', status, detail || '');
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('shell:update-status', lastStatus);
    }
  };

  autoUpdater.on('checking-for-update', () => send('checking'));
  autoUpdater.on('update-available', (info) => send('available', info?.version));
  autoUpdater.on('update-not-available', () => send('up-to-date'));
  autoUpdater.on('error', (error) => send('error', error?.message || String(error)));
  autoUpdater.on('update-downloaded', (info) => {
    pendingVersion = info?.version || 'unknown';
    send('downloaded', pendingVersion);
    // Still at the boot gate (boot-time check found a cached/fast download):
    // install NOW, before any selling starts — this is the maintenance window
    // that closes the kiosk power-off lifecycle.
    const win = getWindow();
    if (win && !win.isDestroyed() && win.webContents.getURL().startsWith('app://gate')) {
      console.log('[updater] till is at the gate — installing update', pendingVersion);
      setTimeout(() => quitAndInstallIfPending(), GATE_INSTALL_DELAY_MS);
    }
  });

  const check = () =>
    autoUpdater.checkForUpdates().catch((error) => send('error', error?.message || String(error)));
  lastStatus = { status: 'idle', detail: `feed: ${feedUrl}`, at: new Date().toISOString() };
  check();
  setInterval(check, CHECK_INTERVAL_MS);

  console.log('[updater] enabled, feed:', feedUrl);
  return { enabled: true };
}

// Tri-state: true → a downloaded update is being installed (the app is exiting:
// NSIS runs silently and relaunches the new version). false → nothing pending;
// caller handles its own restart path. 'install-failed' → an update WAS pending
// but the installer did not start (cached file gone, prior call latched, doInstall
// error — electron-updater's quitAndInstall never throws on these; it leaves
// quitAndInstallCalled false and returns). Callers must NOT plain-restart-install
// on 'install-failed' as if the install had begun.
function quitAndInstallIfPending() {
  if (!updaterRef || pendingVersion === null) return false;
  console.log('[updater] quitAndInstall for pending version', pendingVersion);
  notifyInstalling(pendingVersion, true); // this path relaunches after install
  try {
    updaterRef.quitAndInstall(true, true); // silent install, relaunch after
  } catch (error) {
    console.error('[updater] quitAndInstall failed:', error);
    return 'install-failed';
  }
  if (updaterRef.quitAndInstallCalled !== true) {
    console.error('[updater] quitAndInstall did not start the installer (cached file missing or install refused)');
    return 'install-failed';
  }
  return true;
}

let statusIpcRegistered = false;
function registerStatusIpc(ipcMain) {
  if (statusIpcRegistered || !ipcMain) return;
  statusIpcRegistered = true;
  ipcMain.handle('shell:get-update-status', async () => lastStatus);
}

module.exports = { initAutoUpdater, quitAndInstallIfPending };
