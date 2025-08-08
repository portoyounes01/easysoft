const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Hardware control methods
  hardware: {
    init: () => ipcRenderer.invoke('hardware:init'),
    printReceipt: (receiptData) => ipcRenderer.invoke('hardware:print-receipt', receiptData),
    openCashDrawer: (options) => ipcRenderer.invoke('hardware:open-cash-drawer', options),
    getDrawerStatus: () => ipcRenderer.invoke('hardware:get-drawer-status'),
    testPrinter: () => ipcRenderer.invoke('hardware:test-printer'),
    getHardwareStatus: () => ipcRenderer.invoke('hardware:get-hardware-status'),
    getConfiguredPrinters: () => ipcRenderer.invoke('hardware:get-configured-printers'),
    setPrinterRole: (printerName, role) => ipcRenderer.invoke('hardware:set-printer-role', printerName, role),
    removePrinter: (printerName) => ipcRenderer.invoke('hardware:remove-printer', printerName),
  testPrinterByName: (printerName, testType) => ipcRenderer.invoke('hardware:test-printer-by-name', printerName, testType),
  // Quick list of printers without status checks
  listPrinters: () => ipcRenderer.invoke('hardware:list-printers')
  },

  // Printer discovery methods
  discoverThermalPrinters: () => ipcRenderer.invoke('hardware:discover-thermal-printers'),
  connectToNetworkPrinter: (ip, port, printerName) => ipcRenderer.invoke('hardware:connect-network-printer', ip, port, printerName),
  discoverUSBPrinters: () => ipcRenderer.invoke('hardware:discover-usb-printers'),
  connectToUSBPrinter: (uri, printerName) => ipcRenderer.invoke('hardware:connect-usb-printer', uri, printerName),
  
  // Real-time monitoring (simplified)
  checkAllConnections: () => ipcRenderer.invoke('hardware:check-all-connections'),
  
  scanPrintersProgressively: (onProgress) => {
    console.log('📦 Preload: Setting up progressive scan listener');
    
    // Set up listener for progress updates
    if (onProgress) {
      const handler = (event, data) => {
        console.log('📦 Preload: Received IPC event:', data.type, data.stage);
        onProgress(data);
      };
      
      // Add the listener
      ipcRenderer.on('printer-scan-progress', handler);
      
      // Return a promise that cleans up the listener when done
      return ipcRenderer.invoke('hardware:scan-printers-progressively').finally(() => {
        console.log('📦 Preload: Cleaning up listener');
        ipcRenderer.removeListener('printer-scan-progress', handler);
      });
    }
    
    return ipcRenderer.invoke('hardware:scan-printers-progressively');
  },

  // App information
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    platform: process.platform
  },

  // Development helpers
  isDev: process.env.NODE_ENV === 'development'
});

// Add type definitions for TypeScript
window.electronAPI = {
  hardware: {
    init: () => Promise,
    printReceipt: (receiptData) => Promise,
    openCashDrawer: (options) => Promise,
    getDrawerStatus: () => Promise,
    testPrinter: () => Promise,
    getHardwareStatus: () => Promise,
    getConfiguredPrinters: () => Promise,
    setPrinterRole: (printerName, role) => Promise,
    removePrinter: (printerName) => Promise,
    testPrinterByName: (printerName, testType) => Promise
  },
  discoverThermalPrinters: () => Promise,
  connectToNetworkPrinter: (ip, port, printerName) => Promise,
  discoverUSBPrinters: () => Promise,
  connectToUSBPrinter: (uri, printerName) => Promise,
  scanPrintersProgressively: (onProgress) => Promise,
  app: {
    getVersion: () => Promise,
    platform: string
  },
  isDev: boolean
};
