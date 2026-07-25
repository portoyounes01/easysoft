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

interface ScaleReading {
  weight: number;
  unit: string | null;
  stable: boolean;
  status: 'stable' | 'unstable' | 'unknown';
  raw: string;
  timestamp: string;
}

type ScaleState = 'idle' | 'detecting' | 'connected' | 'disconnected' | 'error';

interface ScaleStatusInfo {
  state: ScaleState;
  polling: boolean;
  port: string | null;
  baud: number | null;
  mock: boolean;
  lastReading: ScaleReading | null;
  lastError: string | null;
}

interface ScaleConfig {
  enabled: boolean;
  port: string; // 'auto' or an explicit port path like 'COM1'
  baud: number;
  lastGoodPort: string | null;
  lastGoodBaud: number | null;
}

interface ScalePortInfo {
  path: string;
  manufacturer: string | null;
  vendorId: string | null;
  productId: string | null;
}

interface ScaleProbeResult {
  port: string;
  baud: number;
  outcome: 'answered' | 'silent' | 'busy' | 'error';
  detail?: string;
  reply?: string;
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

    instantListPrinters(): Promise<{
      success: boolean;
      printers: ConfiguredPrinter[];
      error?: string;
    }>;

    quickListPrinters(): Promise<{
      success: boolean;
      printers: ConfiguredPrinter[];
      error?: string;
    }>;

    quickListPrintersWithStatus(checkConnectivity?: boolean): Promise<{
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

  // Real-time monitoring and scanning
  startMonitoring(interval?: number): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;

  stopMonitoring(): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;

  getMonitoringStatus(): Promise<{
    isMonitoring: boolean;
    status: any;
  }>;

  checkAllConnections(): Promise<{
    success: boolean;
    changed: ConfiguredPrinter[];
    count?: number;
    error?: string;
  }>;

  onStatusChange(callback: (data: {
    type: 'status-change';
    printer: ConfiguredPrinter;
    previousStatus?: ConfiguredPrinter;
    timestamp: string;
  }) => void): () => void;

  onHardwareChange(callback: (data: {
    type: 'usb' | 'network';
    action: 'connected' | 'disconnected' | 'changed';
    device?: any;
    timestamp: string;
    isLikelyPrinter?: boolean;
    isDelayedVerification?: boolean;
  }) => void): () => void;

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

  fiscal?: {
    hasSecureKey(): Promise<boolean>;
    storePrivateKeyPem(pem: string): Promise<{ success: boolean; error?: string }>;
    clearSecureKey(): Promise<{ success: boolean; error?: string }>;
    signHashPlaintext(plaintext: string): Promise<{
      success: boolean;
      hashBase64?: string;
      error?: string;
    }>;
  };

  // Optional: older packaged shells predate the scale IPC surface, so the
  // renderer must feature-detect and fall back to manual weight entry.
  scale?: {
    getStatus(): Promise<{ success: boolean; status?: ScaleStatusInfo; error?: string }>;
    getConfig(): Promise<{ success: boolean; config?: ScaleConfig; error?: string }>;
    setConfig(config: Partial<Pick<ScaleConfig, 'enabled' | 'port' | 'baud'>>): Promise<{
      success: boolean;
      config?: ScaleConfig;
      error?: string;
    }>;
    listPorts(): Promise<{ success: boolean; ports: ScalePortInfo[]; error?: string }>;
    detect(): Promise<{
      success: boolean;
      found?: boolean;
      port?: string;
      baud?: number;
      results: ScaleProbeResult[];
      error?: string;
    }>;
    readOnce(): Promise<{ success: boolean; reading?: ScaleReading; error?: string }>;
    start(): Promise<{ success: boolean; alreadyRunning?: boolean; error?: string }>;
    stop(): Promise<{ success: boolean; error?: string }>;
    onReading(callback: (reading: ScaleReading) => void): () => void;
    onStatusChange(callback: (status: ScaleStatusInfo) => void): () => void;
  };

  // Versioned UI↔shell contract (update-policy §8). Optional: shells older
  // than the Stage-1/3 work predate it — treated as version 0.0.0 by
  // src/lib/shellContract.ts (fail closed).
  shell?: {
    version: string;
    hardwareApiVersion: number;
    getInfo(): Promise<{ shellVersion: string; hardwareApiVersion: number; platform: string }>;
    getUpdateStatus(): Promise<ShellUpdateStatus>;
    onUpdateStatus(callback: (status: ShellUpdateStatus) => void): () => void;
    /** Added 0.1.2 — feature-detect: older shells expose `shell` without it. */
    restartToInstall?(): Promise<{ ok: boolean; installing?: boolean; error?: string }>;
  };

  // Boot readiness gate bridge — consumed by the shell-local gate page
  // (electron/gate/), not by the React app.
  gate?: {
    getState(): Promise<GatePreflightState>;
    proceed(): Promise<{ ok: boolean; error?: string; state?: GatePreflightState }>;
    restart(): Promise<{ ok: boolean; error?: string }>;
  };

  // Shell-owned device identity store (§6.2/D-U4) — carries pairing + session
  // across renderer_source origin flips. Absent on shells older than this API.
  deviceStore?: {
    snapshot: Record<string, string> | null;
    storeExists: boolean;
    set(key: string, value: string): Promise<{ success: boolean; error?: string }>;
    remove(key: string): Promise<{ success: boolean; error?: string }>;
  };

  isDev: boolean;
}

interface ShellUpdateStatus {
  status: 'disabled' | 'idle' | 'checking' | 'available' | 'downloaded' | 'up-to-date' | 'error';
  detail: string;
  at: string | null;
}

interface GatePreflightCheck {
  id: string;
  class: 'blocking' | 'degraded' | 'info';
  status: 'green' | 'yellow' | 'red';
  label: string;
  detail: string;
  fix: string;
}

interface GatePreflightState {
  checks: GatePreflightCheck[];
  allBlockingGreen: boolean;
  autoProceed: boolean;
  shellVersion: string;
  hardwareApiVersion: number;
  source: 'bundled' | 'network' | 'dev-server';
  uiUrl: string;
  environment: string | null;
  configPath: string;
  ranAt: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    // Stage-0 runtime config subset exposed by the till shell's preload;
    // absent on browser hosts (PWA) and on legacy shells.
    __RUNTIME_CONFIG__?: {
      supabaseUrl?: string;
      supabaseAnonKey?: string;
      environment?: string;
    };
  }
}

export {
  ElectronAPI,
  ReceiptData,
  CashDrawerOptions,
  HardwareStatus,
  ConfiguredPrinter,
  ScaleReading,
  ScaleState,
  ScaleStatusInfo,
  ScaleConfig,
  ScalePortInfo,
  ScaleProbeResult,
  ShellUpdateStatus,
};
