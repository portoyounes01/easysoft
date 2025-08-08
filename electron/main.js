const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

// Import our hardware controllers
const HardwareController = require('./hardware/hardwareController');

let mainWindow;
let hardwareController;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../public/favicon.ico'), // Add your app icon
    show: false // Don't show until ready
  });

  // Initialize hardware controller
  hardwareController = new HardwareController();
  console.log('🛠️ hardwareController methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(hardwareController)));

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

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
}

// App event handlers
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
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

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  dialog.showErrorBox('Unexpected Error', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
