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
  listPrinters: () => ipcRenderer.invoke('hardware:list-printers'),
  // Instant list from cache - truly instant
  instantListPrinters: () => ipcRenderer.invoke('hardware:instant-list-printers'),
  // Fast list of printers without connectivity checks
  quickListPrinters: () => ipcRenderer.invoke('hardware:quick-list-printers'),
  // Enhanced quick list with optional connectivity check
  quickListPrintersWithStatus: (checkConnectivity) => ipcRenderer.invoke('hardware:quick-list-printers-with-status', checkConnectivity)
  },

  // Printer discovery methods
  discoverThermalPrinters: () => ipcRenderer.invoke('hardware:discover-thermal-printers'),
  connectToNetworkPrinter: (ip, port, printerName) => ipcRenderer.invoke('hardware:connect-network-printer', ip, port, printerName),
  discoverUSBPrinters: () => ipcRenderer.invoke('hardware:discover-usb-printers'),
  connectToUSBPrinter: (uri, printerName) => ipcRenderer.invoke('hardware:connect-usb-printer', uri, printerName),
  
  // Real-time monitoring
  startMonitoring: (interval) => ipcRenderer.invoke('hardware:start-monitoring', interval),
  stopMonitoring: () => ipcRenderer.invoke('hardware:stop-monitoring'),
  getMonitoringStatus: () => ipcRenderer.invoke('hardware:get-monitoring-status'),
  checkAllConnections: () => ipcRenderer.invoke('hardware:check-all-connections'),
  onStatusChange: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('printer-status-change', handler);
    return () => ipcRenderer.removeListener('printer-status-change', handler);
  },
  onHardwareChange: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('hardware-change', handler);
    return () => ipcRenderer.removeListener('hardware-change', handler);
  },
  
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

  fiscal: {
    hasSecureKey: () => ipcRenderer.invoke('fiscal:has-secure-key'),
    storePrivateKeyPem: (pem) => ipcRenderer.invoke('fiscal:store-private-key-pem', pem),
    clearSecureKey: () => ipcRenderer.invoke('fiscal:clear-secure-key'),
    signHashPlaintext: (plaintext) => ipcRenderer.invoke('fiscal:sign-hash-plaintext', plaintext),
  },

  // Weighing scale (CAS PR-II over RS-232)
  scale: {
    getStatus: () => ipcRenderer.invoke('scale:get-status'),
    getConfig: () => ipcRenderer.invoke('scale:get-config'),
    setConfig: (config) => ipcRenderer.invoke('scale:set-config', config),
    listPorts: () => ipcRenderer.invoke('scale:list-ports'),
    detect: () => ipcRenderer.invoke('scale:detect'),
    readOnce: () => ipcRenderer.invoke('scale:read-once'),
    start: () => ipcRenderer.invoke('scale:start'),
    stop: () => ipcRenderer.invoke('scale:stop'),
    onReading: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('scale-reading', handler);
      return () => ipcRenderer.removeListener('scale-reading', handler);
    },
    onStatusChange: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('scale-status-change', handler);
      return () => ipcRenderer.removeListener('scale-status-change', handler);
    },
  },

  // Development helpers
  isDev: process.env.NODE_ENV === 'development'
});
