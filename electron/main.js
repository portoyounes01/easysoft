const { app, BrowserWindow, Menu, ipcMain, dialog, net, protocol, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { loadRuntimeConfig } = require('./runtimeConfig');
const { resolveRendererConfig } = require('./rendererConfig');
const { runPreflight } = require('./gatePreflight');
const { HARDWARE_API_VERSION } = require('./shellContract');

// Stage-0 runtime config (userData/config.json) — invalid values surface as a
// blocking red on the boot gate rather than being silently ignored.
const runtimeConfig = loadRuntimeConfig({ userDataPath: app.getPath('userData') });
if (runtimeConfig.issues.length > 0) {
  console.warn('runtime config issues (gate will block):', runtimeConfig.issues);
}
const rendererConfig = resolveRendererConfig({ dirname: __dirname, runtime: runtimeConfig });
const isDev = rendererConfig.mode === 'development';

// Import our hardware controllers
const HardwareController = require('./hardware/hardwareController');
const { registerFiscalSigningIpc } = require('./fiscalSigning');
const { registerScaleIpc } = require('./scaleIpc');
const { registerDeviceStoreIpc } = require('./deviceStore');
const { initAutoUpdater, quitAndInstallIfPending } = require('./updater');

let mainWindow;
let hardwareController;
let scaleController;

// Windows toast notifications (the updater's "installing…" toast) only display
// when the process carries the shortcut's AppUserModelID — electron-builder
// stamps build.appId on the NSIS shortcuts.
app.setAppUserModelId('com.pos.comprehensive-pos-system');

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function buildContentSecurityPolicy() {
  const devOrigin = isDev ? new URL(rendererConfig.url).origin : null;
  const devWsOrigin = devOrigin?.replace(/^http/, 'ws');
  const scriptSources = ["'self'", ...(isDev ? ["'unsafe-inline'"] : [])];
  const connectSources = [
    "'self'",
    'https:',
    'wss:',
    ...(devOrigin ? [devOrigin] : []),
    ...(devWsOrigin ? [devWsOrigin] : []),
  ];

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: file:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

function registerContentSecurityPolicy() {
  const csp = buildContentSecurityPolicy();

  // Dev-server exception: a plain-http ui_origin (the config layer allows http only
  // on private/LAN hosts) serves a VITE DEV build, whose HMR/react-refresh preamble
  // is an inline script — stamping the strict CSP over it blanks the page
  // ("Refused to execute inline script"). The dev server governs its own responses;
  // the bundled app:// build and every https origin keep the strict policy.
  const devHttpOrigin = rendererConfig.runtime && typeof rendererConfig.runtime.uiOrigin === 'string'
    && rendererConfig.runtime.uiOrigin.startsWith('http://')
    ? rendererConfig.runtime.uiOrigin
    : null;

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    if (devHttpOrigin && (details.url === devHttpOrigin || details.url.startsWith(`${devHttpOrigin}/`))) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

function resolveAppProtocolPath(requestUrl) {
  const url = new URL(requestUrl);
  let pathname = decodeURIComponent(url.pathname);

  if (!pathname || pathname === '/' || !path.extname(pathname)) {
    pathname = '/index.html';
  }

  // Host routing: app://gate/* serves the installer-local readiness gate
  // (electron/gate — must render with no network and no dist/); every other
  // host (app://pos/*) serves the bundled web build.
  const root = url.host === 'gate' ? rendererConfig.gateRoot : rendererConfig.root;
  const filePath = path.normalize(path.join(root, pathname));
  const rootWithSeparator = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

  if (filePath !== root && !filePath.startsWith(rootWithSeparator)) {
    return null;
  }

  return filePath;
}

function registerProductionProtocol() {
  if (rendererConfig.mode !== 'production') {
    return;
  }

  const csp = buildContentSecurityPolicy();

  protocol.handle('app', async (request) => {
    const filePath = resolveAppProtocolPath(request.url);

    if (!filePath || !fs.existsSync(filePath)) {
      return new Response('Not found', { status: 404 });
    }

    const response = await net.fetch(pathToFileURL(filePath).toString());
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', csp);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });
}

async function loadRenderer() {
  try {
    console.log('Renderer mode:', rendererConfig.mode, 'source:', rendererConfig.source, 'NODE_ENV:', process.env.NODE_ENV, 'isPackaged:', app.isPackaged);

    if (rendererConfig.mode === 'development') {
      console.log('Loading development URL:', rendererConfig.url);
      await mainWindow.loadURL(rendererConfig.url);
      mainWindow.webContents.openDevTools();
      return;
    }

    // Production always boots to the readiness gate (§10 Stage 1: gate before
    // repoint). The gate blocks handoff on red preconditions — including a
    // missing dist/ build, which used to be a dialog-then-quit dead end.
    console.log('Loading readiness gate:', rendererConfig.gateUrl, '→ UI:', rendererConfig.url);
    await mainWindow.loadURL(rendererConfig.gateUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to load renderer:', error);
    dialog.showErrorBox('Unable to load renderer', message);
    app.quit();
  }
}

// Auto-handoff damping (§7.4): after 3 handoff failures inside 5 minutes the
// gate stops auto-proceeding (manual Continue only) so a flapping UI origin
// cannot bounce the till in a loop.
let handoffFailures = [];
function recordHandoffFailure() {
  const now = Date.now();
  // A rejected loadURL and its did-fail-load event report the SAME failure —
  // collapse anything inside 1s so damping trips at 3 real failures, not 2.
  if (handoffFailures.length > 0 && now - handoffFailures[handoffFailures.length - 1] < 1000) {
    return;
  }
  handoffFailures.push(now);
}
function autoProceedAllowed() {
  const cutoff = Date.now() - 5 * 60 * 1000;
  handoffFailures = handoffFailures.filter((at) => at > cutoff);
  return handoffFailures.length < 3;
}

// Deploy-skew watchdog (network mode only): index.html can load fine while its
// hashed chunks are gone (CDN skew / rollback purge — the SPA rewrite even
// serves HTML for missing chunks), leaving a "successfully loaded" blank page
// did-fail-load never sees. 20s after handoff, probe whether the app painted
// (#root has children) and bounce back to the diagnostic gate if not (§7.1).
let blankUiWatchdog = null;
function scheduleBlankUiWatchdog() {
  if (rendererConfig.source !== 'network') return;
  clearTimeout(blankUiWatchdog);
  blankUiWatchdog = setTimeout(async () => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (!mainWindow.webContents.getURL().startsWith(runtimeConfig.uiOrigin)) return;
      const painted = await mainWindow.webContents.executeJavaScript(
        "Boolean(document.getElementById('root') && document.getElementById('root').children.length)",
      );
      if (!painted) {
        console.error('Network UI loaded but never rendered — returning to gate');
        recordHandoffFailure();
        const query = `?reason=load-failed&detail=${encodeURIComponent('UI loaded but never rendered (deploy skew?)')}`;
        await mainWindow.loadURL(rendererConfig.gateUrl + query);
      }
    } catch (error) {
      console.error('Blank-UI watchdog error:', error);
    }
  }, 20000);
}

async function getGateState() {
  const state = await runPreflight({
    rendererConfig,
    hardwareController,
    shellVersion: app.getVersion(),
  });
  state.autoProceed = autoProceedAllowed();
  return state;
}

async function createWindow() {
  // No application menu = no File/Edit/View bar and nothing for Alt to reveal. Kept on
  // macOS, where the menu carries Cmd+Q and clipboard shortcuts needed for local dev.
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }

  // Packaged tills run as a kiosk: fullscreen over the taskbar, no window buttons.
  // Dev keeps a normal window so the machine stays usable. The kiosk/fullscreen keys
  // must be ABSENT (not false) outside kiosk mode: an explicit `fullscreen: false`
  // permanently disables the macOS green-button fullscreen (it only zooms).
  const kiosk = !isDev;

  // Stage-0 subset the renderer is allowed to see (anon key is public by design;
  // the service key never exists on a till). Delivered synchronously via argv so
  // src/lib/supabase.ts can prefer it over Vite-baked env at module load.
  // Dev deliberately gets NONE of it: a leftover config.json must not silently
  // repoint a dev machine away from its .env.
  const rendererRuntimeConfig = isDev ? {} : {
    supabaseUrl: runtimeConfig.supabaseUrl || undefined,
    supabaseAnonKey: runtimeConfig.supabaseAnonKey || undefined,
    environment: runtimeConfig.environment || undefined,
  };

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    ...(kiosk ? { kiosk: true, fullscreen: true } : {}),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [
        `--pos-shell-version=${app.getVersion()}`,
        `--pos-hardware-api-version=${HARDWARE_API_VERSION}`,
        `--pos-runtime-config=${Buffer.from(JSON.stringify(rendererRuntimeConfig)).toString('base64')}`,
      ],
    },
    icon: path.join(__dirname, '../public/favicon.ico'), // Add your app icon
    show: false // Don't show until ready
  });

  // Stage-2 origin allowlist: the window may only navigate between the gate,
  // the bundled UI, and (in network mode) the locked ui_origin. Fetch/XHR are
  // governed by CSP; this guards top-level navigation AND server redirects.
  // app:// must be matched by protocol+host: it is a non-special scheme in
  // Node's URL, so its .origin serializes to the literal string 'null'.
  const allowedWebOrigins = new Set();
  if (isDev) {
    allowedWebOrigins.add(new URL(rendererConfig.url).origin);
  }
  if (rendererConfig.source === 'network') {
    allowedWebOrigins.add(runtimeConfig.uiOrigin);
  }
  const isNavigationAllowed = (targetUrl) => {
    let url;
    try {
      url = new URL(targetUrl);
    } catch {
      return false;
    }
    if (url.protocol === 'app:') {
      return url.host === 'pos' || url.host === 'gate';
    }
    return allowedWebOrigins.has(url.origin);
  };
  const blockDisallowed = (label) => (event, targetUrl) => {
    if (!isNavigationAllowed(targetUrl)) {
      console.error(`Blocked ${label} outside allowed origins:`, targetUrl);
      event.preventDefault();
    }
  };
  mainWindow.webContents.on('will-navigate', blockDisallowed('navigation'));
  mainWindow.webContents.on('will-redirect', blockDisallowed('redirect'));

  // Fail-loud fallback (§7.1): if the real UI ever fails to load (network drop,
  // bad deploy), return to the diagnostic gate instead of Electron's blank
  // error page. ERR_ABORTED (-3) is a superseded navigation, not a failure.
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || isDev || errorCode === -3) return;
    if (validatedURL.startsWith('app://gate')) return;
    console.error('Renderer failed to load, returning to gate:', errorCode, errorDescription, validatedURL);
    recordHandoffFailure();
    const query = `?reason=load-failed&detail=${encodeURIComponent(`${errorCode} ${errorDescription}`)}`;
    mainWindow.loadURL(rendererConfig.gateUrl + query).catch((gateError) => {
      console.error('Failed to load gate after renderer failure:', gateError);
    });
  });

  // The menu's accelerators died with the menu, so devtools gets a manual binding.
  // ⚠️ Deliberately left active in production for now (owner's call, 2026-07-12) —
  // remove before tills ship to real stores.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const comboI = (input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i';
    if (input.key === 'F12' || comboI) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Initialize hardware controller (userData access → persisted printer roles)
  hardwareController = new HardwareController({ getUserDataDir: () => app.getPath('userData') });
  console.log('🛠️ hardwareController methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(hardwareController)));

  registerContentSecurityPolicy();

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (hardwareController) {
      hardwareController.cleanup();
    }
    if (scaleController) {
      scaleController.cleanup();
    }
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await loadRenderer();
}

// App event handlers
app.whenReady().then(async () => {
  registerProductionProtocol();
  await createWindow();

  // Auto-update channel (D-U5): inert without update_feed_url in config.json;
  // downloads in background, installs on quit — never interrupts selling.
  initAutoUpdater({
    feedUrl: runtimeConfig.updateFeedUrl,
    isDev,
    getWindow: () => mainWindow,
    ipcMain,
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('second-instance', () => {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });
});

// Push the app-wide printer-config snapshot to the renderer whenever it may
// have changed (role assigned, printer removed, init resolved a transport) —
// every usePrinterConfig subscriber updates without re-scanning.
function broadcastPrinterConfig() {
  try {
    if (mainWindow && !mainWindow.isDestroyed() && hardwareController) {
      mainWindow.webContents.send('hardware:printer-config-changed', hardwareController.getPrinterConfigSnapshot());
    }
  } catch (error) {
    console.error('Printer-config broadcast failed:', error.message);
  }
}

// IPC Handlers for hardware control
ipcMain.handle('hardware:init', async () => {
  try {
    const result = await hardwareController.initialize();
    broadcastPrinterConfig();
    return result;
  } catch (error) {
    console.error('Hardware initialization failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('hardware:get-printer-config', async () => {
  try {
    return { success: true, config: hardwareController.getPrinterConfigSnapshot() };
  } catch (error) {
    console.error('Get printer config failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('hardware:print-receipt', async (event, receiptData) => {
  try {
    return await hardwareController.printReceipt(receiptData);
  } catch (error) {
    console.error('Print receipt failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('hardware:open-cash-drawer', async (event, options = {}) => {
  try {
    return await hardwareController.openCashDrawer(options);
  } catch (error) {
    console.error('Open cash drawer failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('hardware:get-drawer-status', async () => {
  try {
    return await hardwareController.getDrawerStatus();
  } catch (error) {
    console.error('Get drawer status failed:', error);
    return { success: false, status: 'unknown', error: error.message };
  }
});

ipcMain.handle('hardware:test-printer', async () => {
  try {
    return await hardwareController.testPrinter();
  } catch (error) {
    console.error('Test printer failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('hardware:get-hardware-status', async () => {
  try {
    return await hardwareController.getHardwareStatus();
  } catch (error) {
    console.error('Get hardware status failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('hardware:discover-thermal-printers', async () => {
  try {
    return await hardwareController.discoverThermalPrinters();
  } catch (error) {
    console.error('Discover thermal printers failed:', error);
    return { success: false, error: error.message, printers: [] };
  }
});

ipcMain.handle('hardware:connect-network-printer', async (event, ip, port, printerName) => {
  try {
    const result = await hardwareController.connectToNetworkPrinter(ip, port, printerName);
    broadcastPrinterConfig();
    return result;
  } catch (error) {
    console.error('Connect to network printer failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('hardware:discover-usb-printers', async () => {
  try {
    return await hardwareController.discoverUSBPrinters();
  } catch (error) {
    console.error('USB printer discovery failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('hardware:connect-usb-printer', async (event, uri, printerName) => {
  try {
    const result = await hardwareController.connectToUSBPrinter(uri, printerName);
    broadcastPrinterConfig();
    return result;
  } catch (error) {
    console.error('Connect to USB printer failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('hardware:get-configured-printers', async () => {
  try {
    return await hardwareController.getConfiguredPrinters();
  } catch (error) {
    console.error('Get configured printers failed:', error);
    return { success: false, error: error.message };
  }
});

// Quick list of printer names without status checks
ipcMain.handle('hardware:list-printers', async () => {
  try {
    const printers = await hardwareController.listPrinters();
    return { success: true, printers };
  } catch (error) {
    console.error('List printers failed:', error);
    return { success: false, error: error.message, printers: [] };
  }
});

// Instant list of printers from cache - truly instant
ipcMain.handle('hardware:instant-list-printers', async () => {
  try {
    const printers = hardwareController.getInstantPrinterList();
    return { success: true, printers };
  } catch (error) {
    console.error('Instant list printers failed:', error);
    return { success: false, error: error.message, printers: [] };
  }
});

// Fast list of printers without connectivity checks
ipcMain.handle('hardware:quick-list-printers', async () => {
  try {
    // First try instant cache
    const instantPrinters = hardwareController.getInstantPrinterList();
    if (instantPrinters.length > 0) {
      // Return cached instantly, but also update in background
      hardwareController.quickListPrinters().catch(console.error);
      return { success: true, printers: instantPrinters };
    }
    
    // No cache, do full scan
    const printers = await hardwareController.quickListPrinters();
    return { success: true, printers };
  } catch (error) {
    console.error('Quick list printers failed:', error);
    return { success: false, error: error.message, printers: [] };
  }
});

// Enhanced quick list with optional connectivity check
ipcMain.handle('hardware:quick-list-printers-with-status', async (event, checkConnectivity = false) => {
  try {
    const printers = await hardwareController.quickListPrintersWithStatus(checkConnectivity);
    return { success: true, printers };
  } catch (error) {
    console.error('Quick list printers with status failed:', error);
    return { success: false, error: error.message, printers: [] };
  }
});

ipcMain.handle('hardware:set-printer-role', async (event, printerName, role) => {
  try {
    const result = await hardwareController.setPrinterRole(printerName, role);
    broadcastPrinterConfig();
    return result;
  } catch (error) {
    console.error('Set printer role failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('hardware:remove-printer', async (event, printerName) => {
  try {
    const result = await hardwareController.removePrinter(printerName);
    broadcastPrinterConfig();
    return result;
  } catch (error) {
    console.error('Remove printer failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('hardware:test-printer-by-name', async (event, printerName, testType) => {
  try {
    return await hardwareController.testPrinterByName(printerName, testType);
  } catch (error) {
    console.error('Test printer failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('hardware:scan-printers-progressively', async (event) => {
  try {
    console.log('📡 IPC: Starting progressive scan...');
    return await hardwareController.scanPrintersProgressively((updateData) => {
      // Send progress updates to the renderer process
      console.log('📡 IPC: Sending update to renderer:', updateData.type, updateData.stage);
      event.sender.send('printer-scan-progress', updateData);
    });
  } catch (error) {
    console.error('Progressive printer scan failed:', error);
    return { success: false, error: error.message };
  }
});

// Real-time monitoring IPC handlers
ipcMain.handle('hardware:start-monitoring', async (event, interval = 10000) => {
  try {
    console.log('� Starting real-time hardware monitoring...');
    
    // Set up hardware change callback
    hardwareController.setHardwareChangeCallback(async (changeEvent) => {
      console.log('📊 Hardware change detected, notifying renderer');
      
      // For USB printer changes, provide additional context
      if (changeEvent.type === 'usb' && changeEvent.device) {
        const deviceName = changeEvent.device.name;
        const isLikelyPrinter = deviceName.toLowerCase().includes('printer') || 
                               deviceName.toLowerCase().includes('thermal') ||
                               deviceName.toLowerCase().includes('receipt') ||
                               deviceName.toLowerCase().includes('tp80k') ||
                               changeEvent.device.manufacturer?.toLowerCase().includes('hprt');
        
        changeEvent.isLikelyPrinter = isLikelyPrinter;
        
        if (isLikelyPrinter) {
          console.log(`🖨️ Printer device ${changeEvent.action}: ${deviceName}`);
        }
      }
      
      // Send hardware change event to renderer
      event.sender.send('hardware-change', changeEvent);
    });
    
    await hardwareController.startRealtimeMonitoring();
    return { success: true, message: 'Real-time monitoring started' };
  } catch (error) {
    console.error('Start monitoring failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('hardware:stop-monitoring', async () => {
  try {
    console.log('⏹️ Stopping real-time hardware monitoring...');
    await hardwareController.stopRealtimeMonitoring();
    return { success: true, message: 'Real-time monitoring stopped' };
  } catch (error) {
    console.error('Stop monitoring failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('hardware:get-monitoring-status', async () => {
  try {
    return hardwareController.getMonitoringStatus();
  } catch (error) {
    console.error('Get monitoring status failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('hardware:check-all-connections', async () => {
  try {
    const changedPrinters = await hardwareController.checkAllPrinterConnections();
    return { 
      success: true, 
      changed: changedPrinters,
      count: changedPrinters.length
    };
  } catch (error) {
    console.error('Check all connections failed:', error);
    return { success: false, error: error.message, changed: [] };
  }
});

ipcMain.handle('app:get-version', async () => {
  return app.getVersion();
});

ipcMain.handle('shell:get-info', async () => ({
  shellVersion: app.getVersion(),
  hardwareApiVersion: HARDWARE_API_VERSION,
  platform: process.platform,
}));

ipcMain.handle('gate:get-state', async () => getGateState());

// Handoff out of the gate. Fail-closed enforcement lives HERE: only the gate
// page may ask, and the blocking set is re-validated in main immediately before
// navigation — gate-page JS cannot skip a red precondition.
let proceedInFlight = false;
ipcMain.handle('gate:proceed', async (event) => {
  if (isDev) return { ok: false, error: 'gate-disabled-in-dev' };
  if (!event.sender.getURL().startsWith('app://gate')) {
    return { ok: false, error: 'not-at-gate' };
  }
  // Manual Continue and the 5s auto-proceed can race; a second loadURL would
  // abort a good handoff and log a phantom failure. First caller wins.
  if (proceedInFlight) return { ok: false, error: 'busy' };
  proceedInFlight = true;

  try {
    const state = await getGateState();
    if (!state.allBlockingGreen) {
      return { ok: false, error: 'blocking-preconditions-red', state };
    }

    try {
      await mainWindow.loadURL(rendererConfig.url);
      scheduleBlankUiWatchdog();
      return { ok: true };
    } catch (error) {
      recordHandoffFailure();
      const message = error instanceof Error ? error.message : String(error);
      console.error('Gate handoff failed:', message);
      const query = `?reason=load-failed&detail=${encodeURIComponent(message)}`;
      await mainWindow.loadURL(rendererConfig.gateUrl + query).catch(() => {});
      return { ok: false, error: message };
    }
  } finally {
    proceedInFlight = false;
  }
});

// Operator restart from the gate — config.json is read once at process start,
// so "fix the config" recovery needs a real relaunch, not a recheck.
ipcMain.handle('gate:restart', async (event) => {
  if (!event.sender.getURL().startsWith('app://gate')) {
    return { ok: false, error: 'not-at-gate' };
  }
  // A pending downloaded update must go through the updater's own exit path:
  // app.exit() would fire 'quit' → autoInstallOnAppQuit spawns the installer
  // WHILE app.relaunch() starts the old version — two instances racing.
  // ('install-failed' = pending but the installer refused to start — the gate
  // restart still restarts plainly; the boot-time check re-downloads.)
  if (quitAndInstallIfPending() === true) {
    return { ok: true };
  }
  app.relaunch();
  app.exit(0);
  return { ok: true };
});

// Trusted-UI check for module-level IPC: mirrors createWindow's navigation
// allowlist. app:// is a non-special scheme (its URL .origin serializes to the
// literal 'null'), so it must be matched by protocol+host.
function isMainWindowUrlTrusted(targetUrl) {
  let url;
  try {
    url = new URL(targetUrl);
  } catch {
    return false;
  }
  if (url.protocol === 'app:') {
    return url.host === 'pos' || url.host === 'gate';
  }
  if (isDev && rendererConfig.url) {
    try {
      if (new URL(rendererConfig.url).origin === url.origin) return true;
    } catch { /* ignore */ }
  }
  return runtimeConfig.uiOrigin != null && url.origin === runtimeConfig.uiOrigin;
}

// Operator-initiated "restart to install" from the POS UI (Settings → Updates).
// Same updater-owned exit path as gate:restart (never app.exit() with a pending
// download — NSIS and the relaunch would race). Trusted-origin gated: the POS UI
// is the caller, whatever origin it legitimately runs on (app://pos, the network
// ui_origin) — the gate origin keeps its own handler.
ipcMain.handle('shell:restart-to-install', async (event) => {
  const senderUrl = event.sender.getURL();
  const fromGate = senderUrl.startsWith('app://gate');
  if (!fromGate && !isMainWindowUrlTrusted(senderUrl)) {
    return { ok: false, error: 'untrusted-origin' };
  }
  const pendingResult = quitAndInstallIfPending();
  if (pendingResult === true) {
    return { ok: true, installing: true };
  }
  if (pendingResult === 'install-failed') {
    // The operator clicked "Restart and install now" — if the installer refused
    // to start, surface it instead of pretending; the panel resets and shows it.
    return { ok: false, error: 'install-failed' };
  }
  app.relaunch();
  app.exit(0);
  return { ok: true, installing: false };
});

registerFiscalSigningIpc(ipcMain, app);

registerDeviceStoreIpc(ipcMain, app);

scaleController = registerScaleIpc(ipcMain, app);

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  dialog.showErrorBox('Unexpected Error', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
