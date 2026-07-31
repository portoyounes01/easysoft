/**
 * Electron Hardware Service
 * Replaces webSerialPrinter.ts for native hardware control
 */

import type { ReceiptData, CashDrawerOptions } from '../types/electron';

class ElectronHardwareService {
  private isElectron: boolean;
  private isInitialized = false;

  constructor() {
    this.isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;
  }

  /**
   * Check if running in Electron environment
   */
  isElectronEnvironment(): boolean {
    return this.isElectron;
  }

  /**
   * Initialize hardware connection
   */
  async initialize(): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!this.isElectron) {
      return { 
        success: false, 
        error: 'Not running in Electron environment' 
      };
    }

    try {
      const result = await window.electronAPI.hardware.init();
      // Never downgrade: this service is a module singleton shared by the POS
      // and the Settings test card, so one failed probe used to flip the flag
      // false and locally refuse every later command app-wide.
      if (result.success) this.isInitialized = true;
      return result;
    } catch (error) {
      console.error('Hardware initialization failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Print a receipt
   */
  async printReceipt(receiptData: ReceiptData): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!this.isElectron) {
      return {
        success: false,
        error: 'Hardware control not available in web environment'
      };
    }

    // Main process owns readiness (see openCashDrawer) — a local gate here only
    // blocked receipts that the configured queue would have printed fine.

    try {
      const result = await window.electronAPI.hardware.printReceipt(receiptData);
      return {
        success: result.success,
        message: result.success ? `Receipt printed via ${result.method}` : undefined,
        error: result.error
      };
    } catch (error) {
      console.error('Print receipt failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Print failed' 
      };
    }
  }

  /**
   * Open cash drawer
   */
  async openCashDrawer(options: CashDrawerOptions = {}): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!this.isElectron) {
      return {
        success: false,
        error: 'Hardware control not available in web environment'
      };
    }

    // No local readiness gate: the main process owns hardware state (it restores
    // the configured printer at boot and self-heals in ensureReady). Refusing
    // here meant a cold renderer never sent the IPC at all, so a till with a
    // perfectly good configured queue could not open its drawer until someone
    // visited the Settings hardware page.

    try {
      const result = await window.electronAPI.hardware.openCashDrawer(options);
      return {
        success: result.success,
        message: result.success ? `Cash drawer opened via ${result.method}` : undefined,
        error: result.error
      };
    } catch (error) {
      console.error('Open cash drawer failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to open cash drawer' 
      };
    }
  }

  /**
   * Get cash drawer status
   */
  async getDrawerStatus(): Promise<{
    success: boolean;
    status: 'open' | 'closed' | 'unknown';
    signal?: 'high' | 'low';
    rawStatus?: number;
    method?: 'usb' | 'network';
    error?: string;
  }> {
    if (!this.isElectron) {
      return { 
        success: false, 
        status: 'unknown',
        error: 'Hardware control not available in web environment' 
      };
    }

    if (!this.isInitialized) {
      return { 
        success: false, 
        status: 'unknown',
        error: 'Hardware not initialized. Call initialize() first.' 
      };
    }

    try {
      const result = await window.electronAPI.hardware.getDrawerStatus();
      return result;
    } catch (error) {
      console.error('Get drawer status failed:', error);
      return { 
        success: false, 
        status: 'unknown',
        error: error instanceof Error ? error.message : 'Failed to get drawer status' 
      };
    }
  }

  /**
   * Test printer functionality
   */
  async testPrinter(): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!this.isElectron) {
      return { 
        success: false, 
        error: 'Hardware control not available in web environment' 
      };
    }

    if (!this.isInitialized) {
      return { 
        success: false, 
        error: 'Hardware not initialized. Call initialize() first.' 
      };
    }

    try {
      const result = await window.electronAPI.hardware.testPrinter();
      return result;
    } catch (error) {
      console.error('Test printer failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Printer test failed' 
      };
    }
  }

  /**
   * Get overall hardware status
   */
  async getHardwareStatus() {
    if (!this.isElectron) {
      return { 
        success: false, 
        error: 'Hardware control not available in web environment' 
      };
    }

    try {
      const result = await window.electronAPI.hardware.getHardwareStatus();
      return result;
    } catch (error) {
      console.error('Get hardware status failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get hardware status' 
      };
    }
  }

  /**
   * Print a transaction receipt
   */
  async printTransaction(transaction: any): Promise<{ success: boolean; message?: string; error?: string }> {
    const receiptData: ReceiptData = {
      header: 'COMPREHENSIVE POS',
      date: new Date(transaction.created_at || Date.now()).toLocaleDateString(),
      time: new Date(transaction.created_at || Date.now()).toLocaleTimeString(),
      items: transaction.items?.map((item: any) => ({
        name: item.product_name || item.name || 'Unknown Item',
        quantity: item.quantity?.toString() || '1',
        price: `€${(item.price || 0).toFixed(2)}`,
        total: `€${((item.price || 0) * (item.quantity || 1)).toFixed(2)}`
      })) || [],
      total: `€${(transaction.total_amount || 0).toFixed(2)}`
    };

    return this.printReceipt(receiptData);
  }

  /**
   * Create test receipt data
   */
  createTestReceipt(): ReceiptData {
    return {
      header: 'TEST RECEIPT',
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      items: [
        { name: 'Test Item 1', quantity: '1', price: '€5.00', total: '€5.00' },
        { name: 'Test Item 2', quantity: '2', price: '€3.50', total: '€7.00' },
        { name: 'Test Item 3', quantity: '1', price: '€2.00', total: '€2.00' }
      ],
      total: '€14.00'
    };
  }
}

// Create singleton instance
const electronHardwareService = new ElectronHardwareService();

export default electronHardwareService;
export { ElectronHardwareService };
