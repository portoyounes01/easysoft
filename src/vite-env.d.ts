/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** PKCS#8/PKCS#1 PEM when Electron secure key is not used; inlined at build — avoid real secrets in client bundles */
    readonly VITE_FISCAL_RSA_PRIVATE_KEY_PEM?: string;
    /** AT product certification phrase (e.g. n/AT) — not stored in app settings */
    readonly VITE_FISCAL_CERTIFICATION_NUMBER?: string;
    /** AT software certification number — not stored in app settings */
    readonly VITE_FISCAL_SOFTWARE_CERT_NUMBER?: string;
    /** HashControl version for new fiscal documents — not stored in app settings */
    readonly VITE_FISCAL_HASH_CONTROL_VERSION?: string;
    /** Comma-separated employee_number values treated as system administrator (Definições sensíveis). Default: SYS001 */
    readonly VITE_SYSTEM_ADMIN_EMPLOYEE_NUMBERS?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

interface ListPrintersResult {
  success: boolean;
  printers: Array<{
    name: string;
    status: string;
    device: string | null;
    type: string;
    role: string;
    isActive: boolean;
    lastConnected: string | null;
    connected: boolean;
    connectionStatus: string;
    lastSeen: string | null;
  }>;
  error?: string;
}

interface ElectronAPI {
  hardware: {
    init: () => Promise<any>;
    printReceipt: (receiptData: any) => Promise<any>;
    openCashDrawer: (options?: any) => Promise<any>;
    getDrawerStatus: () => Promise<any>;
    testPrinter: () => Promise<any>;
    getHardwareStatus: () => Promise<any>;
    getConfiguredPrinters: () => Promise<{
      success: boolean;
      printers: Array<{
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
      }>;
      count: number;
      connectedCount: number;
      error?: string;
    }>;
    listPrinters: () => Promise<ListPrintersResult>;
    setPrinterRole: (printerName: string, role: string) => Promise<{
      success: boolean;
      message?: string;
      error?: string;
    }>;
    removePrinter: (printerName: string) => Promise<{
      success: boolean;
      message?: string;
      error?: string;
    }>;
    testPrinterByName: (printerName: string, testType?: string) => Promise<{
      success: boolean;
      message?: string;
      jobInfo?: string;
      error?: string;
    }>;
  };
  discoverThermalPrinters: () => Promise<{
    success: boolean;
    printers?: Array<{
      ip: string;
      port: number;
      confidence: number;
      isThermal: boolean;
      brand?: string;
      identification?: string;
      recommended: boolean;
    }>;
    recommended?: {
      ip: string;
      port: number;
      confidence: number;
      isThermal: boolean;
      brand?: string;
      identification?: string;
      recommended: boolean;
    };
    error?: string;
  }>;
  connectToNetworkPrinter: (ip: string, port: number, printerName?: string) => Promise<{
    success: boolean;
    mode?: string;
    message?: string;
    printer?: string;
    details?: any;
    error?: string;
  }>;
  discoverUSBPrinters: () => Promise<{
    success: boolean;
    printers?: Array<{
      type: 'usb';
      brand: string;
      model: string;
      serial: string;
      uri: string;
      isThermal: boolean;
      recommended: boolean;
      confidence: number;
    }>;
    message?: string;
    error?: string;
  }>;
  connectToUSBPrinter: (uri: string, printerName?: string) => Promise<{
    success: boolean;
    printerName?: string;
    message?: string;
    details?: {
      brand: string;
      model: string;
      serial: string;
      uri: string;
      isThermal: boolean;
    };
    error?: string;
  }>;
  scanPrintersProgressively: (onProgress?: (data: {
    type: 'start' | 'progress' | 'printer-found' | 'complete';
    stage?: 'usb' | 'network' | 'system';
    printer?: {
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
    };
    printers?: Array<any>;
    progress?: number;
    total?: number;
    message?: string;
  }) => void) => Promise<{
    success: boolean;
    printers?: Array<any>;
    error?: string;
  }>;
  app: {
    getVersion: () => Promise<string>;
    platform: string;
  };
  /** Present in Electron build: PEM in `safeStorage`, sign in main via IPC */
  fiscal?: {
    hasSecureKey: () => Promise<boolean>;
    storePrivateKeyPem: (pem: string) => Promise<{ success: boolean; error?: string }>;
    clearSecureKey: () => Promise<{ success: boolean; error?: string }>;
    signHashPlaintext: (
      plaintext: string
    ) => Promise<{ success: boolean; hashBase64?: string; error?: string }>;
  };
  /** Versioned UI↔shell contract (update-policy §8); absent on legacy shells */
  shell?: {
    version: string;
    hardwareApiVersion: number;
    getInfo: () => Promise<{ shellVersion: string; hardwareApiVersion: number; platform: string }>;
    getUpdateStatus: () => Promise<{ status: string; detail: string; at: string | null }>;
    onUpdateStatus: (callback: (status: { status: string; detail: string; at: string | null }) => void) => () => void;
  };
  /** Boot readiness gate bridge (shell-local gate page only) */
  gate?: {
    getState: () => Promise<unknown>;
    proceed: () => Promise<{ ok: boolean; error?: string }>;
    restart: () => Promise<{ ok: boolean; error?: string }>;
  };
  /** Shell device store — carries pairing/session across origin flips; absent on old shells */
  deviceStore?: {
    snapshot: Record<string, string> | null;
    storeExists: boolean;
    set: (key: string, value: string) => Promise<{ success: boolean; error?: string }>;
    remove: (key: string) => Promise<{ success: boolean; error?: string }>;
  };
  isDev: boolean;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    /** Stage-0 runtime config from the till shell's preload; absent in browsers */
    __RUNTIME_CONFIG__?: {
      supabaseUrl?: string;
      supabaseAnonKey?: string;
      environment?: string;
    };
  }
}

export {};