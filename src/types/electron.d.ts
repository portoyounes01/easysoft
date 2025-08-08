interface ConfiguredPrinter {
  name: string;
  status: string;
  device: string;
  type: string;
  role: string;
  isActive: boolean;
  lastConnected: string | null;
  connected: boolean;
  connectionStatus: string;
  lastSeen: string | null;
  hasQueuedJobs?: boolean;
  queueCount?: number;
  isStale?: boolean;
  source?: string;
}

interface ReceiptData {
  header?: string;
  date?: string;
  time?: string;
  items?: Array<{
    name: string;
    quantity: string;
    price: string;
    total: string;
  }>;
  total?: string;
}

interface CashDrawerOptions {
  command?: 'standard' | 'alternative' | 'test';
  reason?: string;
}

interface HardwareStatus {
  initialized: boolean;
  printer: {
    connected: boolean;
    type: 'usb' | 'system' | 'unknown';
    name: string;
  };
  cashDrawer: {
    available: boolean;
    status: 'open' | 'closed' | 'unknown';
  };
}

interface ElectronAPI {
  hardware: {
    init(): Promise<{
      success: boolean;
      mode?: 'usb' | 'system';
      message?: string;
      printer?: string;
      error?: string;
    }>;
    
    printReceipt(receiptData: ReceiptData): Promise<{
      success: boolean;
      method?: 'usb' | 'system';
      jobId?: string;
      error?: string;
    }>;
    
    openCashDrawer(options?: CashDrawerOptions): Promise<{
      success: boolean;
      method?: 'usb' | 'system';
      jobId?: string;
      error?: string;
    }>;
    
    getDrawerStatus(): Promise<{
      success: boolean;
      status: 'open' | 'closed' | 'unknown';
      error?: string;
    }>;
    
    testPrinter(): Promise<{
      success: boolean;
      message?: string;
      method?: 'usb' | 'system';
      error?: string;
    }>;
    
    getHardwareStatus(): Promise<{
      success: boolean;
      status?: HardwareStatus;
      error?: string;
    }>;

    listPrinters(): Promise<{
      success: boolean;
      printers: ConfiguredPrinter[];
      error?: string;
    }>;

    getConfiguredPrinters(): Promise<{
      success: boolean;
      printers: ConfiguredPrinter[];
      count?: number;
      connectedCount?: number;
      error?: string;
    }>;

    setPrinterRole(printerName: string, role: string): Promise<{
      success: boolean;
      message?: string;
      error?: string;
    }>;

    removePrinter(printerName: string): Promise<{
      success: boolean;
      message?: string;
      error?: string;
    }>;

    testPrinterByName(printerName: string, testType?: string): Promise<{
      success: boolean;
      message?: string;
      jobInfo?: string;
      error?: string;
    }>;
  };
  
  // Printer discovery and scanning
  discoverThermalPrinters(): Promise<{
    success: boolean;
    printers: any[];
    recommended?: any;
    error?: string;
  }>;

  connectToNetworkPrinter(ip: string, port: number, printerName?: string): Promise<{
    success: boolean;
    mode?: string;
    message?: string;
    printer?: string;
    details?: any;
    error?: string;
  }>;

  discoverUSBPrinters(): Promise<{
    success: boolean;
    printers: any[];
    message?: string;
    error?: string;
  }>;

  connectToUSBPrinter(uri: string, printerName: string): Promise<{
    success: boolean;
    printerName?: string;
    message?: string;
    details?: any;
    error?: string;
  }>;

  // Real-time monitoring and scanning (simplified)
  checkAllConnections(): Promise<{
    success: boolean;
    changed: ConfiguredPrinter[];
    count?: number;
    error?: string;
  }>;

  scanPrintersProgressively(onProgress?: (data: {
    type: 'start' | 'progress' | 'printer-found' | 'complete';
    stage?: string;
    progress?: number;
    total?: number;
    message?: string;
    printer?: ConfiguredPrinter;
    printers?: ConfiguredPrinter[];
  }) => void): Promise<{
    success: boolean;
    printers: ConfiguredPrinter[];
    count?: number;
    connectedCount?: number;
    error?: string;
  }>;
  
  app: {
    getVersion(): Promise<string>;
    platform: string;
  };
  
  isDev: boolean;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export { ElectronAPI, ReceiptData, CashDrawerOptions, HardwareStatus, ConfiguredPrinter };
