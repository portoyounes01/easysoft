export interface BasicPrinterInfo {
  name: string;
  status: string; // 'unknown'
  device: string | null;
  type: string;
  role: string;
  isActive: boolean;
  lastConnected: string | null;
  connected: boolean;
  connectionStatus: string;
  lastSeen: string | null;
}

export interface ListPrintersResult {
  success: boolean;
  printers: BasicPrinterInfo[];
  error?: string;
}
