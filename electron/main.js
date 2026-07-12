const { app, BrowserWindow, Menu, ipcMain, dialog, net, protocol, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { resolveRendererConfig } = require('./rendererConfig');
const rendererConfig = resolveRendererConfig({ dirname: __dirname });
const isDev = rendererConfig.mode === 'development';

// Import our hardware controllers
const HardwareController = require('./hardware/hardwareController');
const { registerFiscalSigningIpc } = require('./fiscalSigning');

let mainWindow;
let hardwareController;

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

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
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

  const root = rendererConfig.root;
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
    console.log('Renderer mode:', rendererConfig.mode, 'NODE_ENV:', process.env.NODE_ENV, 'isPackaged:', app.isPackaged);

    if (rendererConfig.mode === 'development') {
      console.log('Loading development URL:', rendererConfig.url);
      await mainWindow.loadURL(rendererConfig.url);
      mainWindow.webContents.openDevTools();
      return;
    }

    if (!fs.existsSync(rendererConfig.file)) {
      const message = `Missing renderer build at ${rendererConfig.file}. Run "npm run build" before launching Electron.`;
      console.error(message);
      dialog.showErrorBox('Renderer build not found', message);
      app.quit();
      return;
    }

    console.log('Loading production URL:', rendererConfig.url, 'from:', rendererConfig.file);
    await mainWindow.loadURL(rendererConfig.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to load renderer:', error);
    dialog.showErrorBox('Unable to load renderer', message);
    app.quit();
  }
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
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../public/favicon.ico'), // Add your app icon
    show: false // Don't show until ready
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

  // Initialize hardware controller
  hardwareController = new HardwareController();
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

// IPC Handlers for hardware control
ipcMain.handle('hardware:init', async () => {
  try {
    return await hardwareController.initialize();
  } catch (error) {
    console.error('Hardware initialization failed:', error);
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
    return await hardwareController.connectToNetworkPrinter(ip, port, printerName);
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
    return await hardwareController.connectToUSBPrinter(uri, printerName);
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
    return await hardwareController.setPrinterRole(printerName, role);
  } catch (error) {
    console.error('Set printer role failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('hardware:remove-printer', async (event, printerName) => {
  try {
    return await hardwareController.removePrinter(printerName);
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

registerFiscalSigningIpc(ipcMain, app);

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  dialog.showErrorBox('Unexpected Error', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
