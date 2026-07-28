// Visible update splash (register D-U5).
//
// ⚠️ READ THIS BEFORE CHANGING ANY TIMER HERE.
//
// The splash is an INDICATOR. It never gates selling: the only hold it
// participates in is the gate-moment install delay, which already existed as an
// unconditional 2s and self-expires on a timestamp the updater owns. Every
// phase arms a destroy timer when it is entered — there is NO state that waits
// on an external event without one, because the worst outcome of this whole
// feature must stay "a few seconds of delay and a window that closes itself".
//
// It also cannot cover the install. Verified in the installed dependency
// (node_modules/electron-updater/out/BaseUpdater.js:13-26 → NsisUpdater.js):
// quitAndInstall spawns the NSIS exe detached and then app.quit()s on the very
// next tick, so the ~1 minute NSIS actually runs happens with no app on screen.
// This window brackets that blackout — last thing before the process dies, first
// thing after --force-run brings the new version back. The minute in between
// stays covered by the updater's best-effort Windows toast.
const path = require('path');
const { BrowserWindow, ipcMain } = require('electron');

const WIDTH = 520;
const HEIGHT = 176;
const BOTTOM_MARGIN = 40;

const PHASE_TIMEOUT_MS = {
  downloading: 15 * 60 * 1000, // an indicator, not a process — it outlives nothing
  installing: 90 * 1000, // should be gone in <5s; if not, do not park the till behind it
  failed: 12 * 1000,
  updated: 5 * 1000,
};
// No download-progress for this long: say the connection dropped rather than
// leaving a frozen percentage that reads as a hung till.
const STALL_MS = 60 * 1000;

let config = null;
let splashWindow = null;
let hookedParent = null;
let splashLoaded = false;
let currentState = null;
let phaseTimer = null;
let stallTimer = null;
let dismissIpcRegistered = false;

function clearAllTimers() {
  clearTimeout(phaseTimer);
  clearTimeout(stallTimer);
  phaseTimer = null;
  stallTimer = null;
}

function configureUpdaterSplash(options) {
  config = options;
  if (dismissIpcRegistered) return;
  dismissIpcRegistered = true;
  ipcMain.on('updater-splash:dismiss', (event) => {
    // Identity check, not an origin string: nothing else in the app may close
    // this window by guessing a channel name.
    if (splashWindow && !splashWindow.isDestroyed() && event.sender === splashWindow.webContents) {
      closeSplash('dismissed');
    }
  });
}

function isSplashOpen() {
  return Boolean(splashWindow && !splashWindow.isDestroyed());
}

function closeSplash(reason) {
  clearAllTimers();
  currentState = null;
  splashLoaded = false;
  if (!splashWindow) return;
  const win = splashWindow;
  splashWindow = null;
  try {
    console.log('[updater-splash] close:', reason);
    if (!win.isDestroyed()) win.destroy();
  } catch (error) {
    console.error('[updater-splash] close failed:', error.message);
  }
}

function sendState() {
  if (!splashLoaded || !currentState || !isSplashOpen()) return;
  splashWindow.webContents.send('updater-splash:state', currentState);
}

function createSplash(parent) {
  const bounds = parent.getBounds();
  splashLoaded = false;
  // ⚠️ `parent:` does NOT destroy this window with the main one — measured on
  // darwin: after mainWindow.destroy() the splash was still alive 2s later.
  // Since a stranded splash would keep window-all-closed → app.quit() from
  // firing (and that quit is what autoInstallOnAppQuit hangs the install off),
  // the close is wired explicitly instead of assumed. main.js does the same on
  // its side; this one makes the module safe on its own.
  if (hookedParent !== parent) {
    hookedParent = parent;
    parent.once('closed', () => {
      hookedParent = null;
      closeSplash('main-window-closed');
    });
  }

  splashWindow = new BrowserWindow({
    // Kept for stacking order only (always above the main window), not for
    // lifetime — see above.
    parent,
    width: WIDTH,
    height: HEIGHT,
    // Bottom-anchored rather than centred: the gate card is vertically centred,
    // so this can only ever overlap its footer line, whose content is repeated
    // in the checks list. A red precondition stays readable underneath.
    x: Math.round(bounds.x + (bounds.width - WIDTH) / 2),
    y: Math.round(bounds.y + bounds.height - HEIGHT - BOTTOM_MARGIN),
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#0f1420', // gate.css body colour — no white flash
    webPreferences: {
      preload: path.join(__dirname, 'updaterPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    splashWindow.setAlwaysOnTop(true, 'screen-saver');
  } catch {
    splashWindow.setAlwaysOnTop(true);
  }

  // showInactive, never show()/focus(): on a touch kiosk the gate's Continue
  // button must stay live while this is on screen. Stealing focus from an
  // operator mid-handoff is interference with selling.
  splashWindow.once('ready-to-show', () => {
    if (isSplashOpen()) splashWindow.showInactive();
  });

  splashWindow.webContents.on('did-finish-load', () => {
    splashLoaded = true;
    sendState(); // the phase may have moved on between create and load
  });

  splashWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  splashWindow.webContents.on('will-redirect', (event) => event.preventDefault());
  splashWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  splashWindow.webContents.on('render-process-gone', () => closeSplash('render-gone'));
  splashWindow.webContents.on('did-fail-load', () => closeSplash('load-failed'));
  splashWindow.on('closed', () => {
    splashWindow = null;
    clearAllTimers();
  });

  // app:// is unregistered outside production (main.js registerProductionProtocol),
  // so dev loads the same files straight off disk. The path is resolved from
  // __dirname here rather than rendererConfig: its dev branch carries no roots.
  if (config.useAppProtocol) {
    splashWindow.loadURL('app://updater/index.html');
  } else {
    splashWindow.loadFile(path.join(__dirname, 'updater-window', 'index.html'));
  }
}

function showSplashState(phase, payload = {}) {
  if (!config) return;
  const parent = config.getMainWindow();
  // Hard precondition: no parent, no splash. This single rule is what makes
  // "the app can never quit because a splash is open" structurally impossible.
  if (!parent || parent.isDestroyed()) {
    closeSplash('no-main-window');
    return;
  }

  if (!isSplashOpen()) createSplash(parent);

  currentState = {
    phase,
    version: payload.version || '',
    currentVersion: config.getCurrentVersion(),
    percent: typeof payload.percent === 'number' ? payload.percent : null,
    stalled: Boolean(payload.stalled),
  };
  sendState();

  clearTimeout(phaseTimer);
  phaseTimer = setTimeout(() => {
    if (phase === 'installing') {
      console.warn('[updater-splash] still installing after 90s — the process did not exit');
    }
    closeSplash(`timeout:${phase}`);
  }, PHASE_TIMEOUT_MS[phase] || PHASE_TIMEOUT_MS.failed);

  clearTimeout(stallTimer);
  if (phase === 'downloading') {
    // Flips the copy in place — deliberately NOT a re-entrant showSplashState
    // call, which would re-arm the phase cap and let a dead download hold the
    // window open past its 15 minutes.
    stallTimer = setTimeout(() => {
      if (!currentState || currentState.phase !== 'downloading') return;
      currentState = { ...currentState, stalled: true };
      sendState();
    }, STALL_MS);
  }
}

module.exports = { configureUpdaterSplash, showSplashState, closeSplash, isSplashOpen };
