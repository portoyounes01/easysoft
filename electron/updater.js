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
//
// A visible splash (updaterWindow.js) brackets the gate-moment install so the
// window does not simply vanish for a minute. It is injected as a sink so this
// module keeps knowing nothing about window management, and every state it can
// reach self-expires — the splash never becomes a reason a till cannot sell.
const { app, Notification } = require('electron');
const { writePendingMarker, clearMarker } = require('./updateMarker');

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
// 2s was chosen when nothing was drawn during it; a message nobody can read
// from across a counter is the same as no message.
const GATE_INSTALL_DELAY_MS = 4000;
// Ceiling on the handoff hold — must stay above the delay above, and is the
// only thing about this feature that can ever postpone selling.
const GATE_INSTALL_HOLD_MS = 6000;
const PROGRESS_THROTTLE_MS = 250; // download-progress fires ~5×/s

let lastStatus = { status: 'disabled', detail: '', at: null };
let updaterRef = null;
let pendingVersion = null;
let installNotified = false;
// A timestamp, not a boolean+timer: it expires on its own even if whatever was
// supposed to clear it never runs.
let installHoldUntil = 0;
let suppressedVersion = null;
let lastProgressSentAt = 0;
// Display only, and deliberately NOT pendingVersion: that one means "an
// installer is on disk and may be launched", and setting it at update-available
// would make an Alt+F4 mid-download write a marker and toast an install for a
// version that was never fully downloaded.
let downloadingVersion = null;
let splash = { set() {}, close() {}, isOpen: () => false };

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

function initAutoUpdater({ feedUrl, isDev, getWindow, ipcMain, splash: splashSink, suppressVersion }) {
  registerStatusIpc(ipcMain);
  // Assigned before the disabled() early-returns so a disabled updater still
  // leaves a working (no-op) sink behind rather than a half-wired one.
  splash = splashSink || splash;
  suppressedVersion = suppressVersion || null;

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
    if (pendingVersion !== null) {
      // Idempotent (keeps attempts/startedAt): this quit-time install is just
      // as invisible to the next boot as the gate-moment one.
      writePendingMarker(pendingVersion, app.getVersion());
      notifyInstalling(pendingVersion, false);
    }
  });

  const isAtGate = () => {
    const win = getWindow();
    return Boolean(win && !win.isDestroyed() && win.webContents.getURL().startsWith('app://gate'));
  };

  const send = (status, detail) => {
    lastStatus = { status, detail: detail || '', at: new Date().toISOString() };
    console.log('[updater]', status, detail || '');
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('shell:update-status', lastStatus);
    }
  };

  autoUpdater.on('checking-for-update', () => send('checking'));
  autoUpdater.on('update-available', (info) => {
    // autoDownload is on, so this event IS "download started" — and it is the
    // only place the version is known while download-progress is firing.
    downloadingVersion = info?.version || null;
    send('available', info?.version);
  });
  autoUpdater.on('update-not-available', () => send('up-to-date'));
  autoUpdater.on('error', (error) => {
    send('error', error?.message || String(error));
    // Never OPENS the splash: an offline till already shows `internet` red on
    // the gate with its own fix text, and a panel over that would obscure the
    // one diagnosis the operator can act on.
    if (splash.isOpen()) splash.set('failed', { version: pendingVersion || '' });
  });

  // Nothing subscribed to this before, so "downloading" had no data source.
  autoUpdater.on('download-progress', (progress) => {
    const now = Date.now();
    if (now - lastProgressSentAt < PROGRESS_THROTTLE_MS) return;
    lastProgressSentAt = now;
    if (!isAtGate()) return; // mid-session the till is selling; §7.2 says stay quiet
    splash.set('downloading', {
      version: downloadingVersion || '',
      percent: typeof progress?.percent === 'number'
        ? Math.max(0, Math.min(100, progress.percent))
        : null,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    pendingVersion = info?.version || 'unknown';
    send('downloaded', pendingVersion);
    // Still at the boot gate (boot-time check found a cached/fast download):
    // install NOW, before any selling starts — this is the maintenance window
    // that closes the kiosk power-off lifecycle.
    if (!isAtGate()) return;
    if (suppressedVersion === pendingVersion) {
      console.warn('[updater] auto-install suppressed for', pendingVersion,
        '— repeated install failures; operator can retry with the gate Restart button');
      return;
    }
    console.log('[updater] till is at the gate — installing update', pendingVersion);
    // Shown for the WHOLE delay, not from inside quitAndInstall: that runs one
    // tick before app.quit(), so a splash raised there would be on screen for
    // roughly 0ms and the delay would buy nothing.
    splash.set('installing', { version: pendingVersion });
    installHoldUntil = Date.now() + GATE_INSTALL_HOLD_MS;
    setTimeout(() => {
      // The gate can auto-proceed inside this window (it rechecks every 5s).
      // Re-check rather than quitting the app mid-load — skipping the install
      // is always the safe direction; the next quit or boot picks it up.
      if (!isAtGate()) {
        installHoldUntil = 0;
        console.log('[updater] left the gate before the install window closed — deferring to quit');
        splash.close('left-gate');
        return;
      }
      const result = quitAndInstallIfPending();
      if (result !== true) {
        installHoldUntil = 0;
        splash.set('failed', { version: pendingVersion });
      }
    }, GATE_INSTALL_DELAY_MS);
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
//
// A marker is written first and cleared on both failure branches: it exists to
// catch the failures that are INVISIBLE in-process (silent NSIS failure, power
// cut), and a failure the caller can already see must not also burn one of the
// boot-time attempts that eventually suppress auto-install.
function quitAndInstallIfPending() {
  if (!updaterRef || pendingVersion === null) return false;
  console.log('[updater] quitAndInstall for pending version', pendingVersion);
  writePendingMarker(pendingVersion, app.getVersion());
  try {
    updaterRef.quitAndInstall(true, true); // silent install, relaunch after
  } catch (error) {
    console.error('[updater] quitAndInstall failed:', error);
    clearMarker();
    return 'install-failed';
  }
  if (updaterRef.quitAndInstallCalled !== true) {
    console.error('[updater] quitAndInstall did not start the installer (cached file missing or install refused)');
    clearMarker();
    return 'install-failed';
  }
  // Only now: the installer is spawned and app.quit() is merely queued on
  // setImmediate, so this still runs. Toasting before the check announced
  // installs that never started.
  notifyInstalling(pendingVersion, true); // this path relaunches after install
  return true;
}

// True while the gate-moment install is seconds from taking the process down.
// Timestamp-based, so it can only ever REFUSE a handoff, never permit one.
function isGateInstallHeld() {
  return Date.now() < installHoldUntil;
}

let statusIpcRegistered = false;
function registerStatusIpc(ipcMain) {
  if (statusIpcRegistered || !ipcMain) return;
  statusIpcRegistered = true;
  ipcMain.handle('shell:get-update-status', async () => lastStatus);
}

module.exports = { initAutoUpdater, quitAndInstallIfPending, isGateInstallHeld };
