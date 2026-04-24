import { useState } from 'react';
import i18n from '../i18n';

// Web Serial API types
interface SerialPort {
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  writable: WritableStream;
  readable: ReadableStream;
  getInfo(): SerialPortInfo;
}

interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialOptions {
  baudRate: number;
  dataBits?: number;
  parity?: 'none' | 'even' | 'odd';
  stopBits?: number;
  flowControl?: 'none' | 'hardware';
}

interface SerialPortFilter {
  usbVendorId?: number;
  usbProductId?: number;
}

declare global {
  interface Navigator {
    serial: {
      requestPort(options?: { filters?: SerialPortFilter[] }): Promise<SerialPort>;
      getPorts(): Promise<SerialPort[]>;
    };
  }
}

// Web Serial API for direct hardware control
// This works in Chrome/Edge browsers with user permission
class WebSerialPrinter {
  private port: SerialPort | null = null;

  async connect(showAllDevices: boolean = false): Promise<boolean> {
    try {
      let requestOptions: { filters?: SerialPortFilter[] } | undefined;

      if (!showAllDevices) {
        // Common thermal printer USB vendor/product IDs
        const printerFilters = [
          // Epson printers
          { usbVendorId: 0x04b8 },
          // Star Micronics printers
          { usbVendorId: 0x0519 },
          // Bixolon printers
          { usbVendorId: 0x1504 },
          // Citizen printers
          { usbVendorId: 0x1CB0 },
          // HPRT printers (POS80K/TP80K series) - CORRECT IDs
          { usbVendorId: 0x2aaf, usbProductId: 0x6004 }, // TP80K/POS80K
          { usbVendorId: 0x2aaf }, // All HPRT devices
          // HPRT printers (alternative/older IDs)
          { usbVendorId: 0x0DD4 },
          { usbVendorId: 0x2ECF },
          // HPRT POS80K alternative (ELATEC GmbH chipset)
          { usbVendorId: 0x09d8, usbProductId: 0x0406 },
          { usbVendorId: 0x09d8 }, // All ELATEC devices
          // Custom printers
          { usbVendorId: 0x0483 },
          // Generic USB-to-Serial adapters
          { usbVendorId: 0x067B }, // Prolific
          { usbVendorId: 0x10C4 }, // Silicon Labs
          { usbVendorId: 0x1A86 }, // QinHeng Electronics
          { usbVendorId: 0x0403 }, // FTDI
          { usbVendorId: 0x2341 }, // Arduino (sometimes used for printer interfaces)
        ];

        requestOptions = { filters: printerFilters };
      }

      // Request access to serial port with or without filters
      this.port = await navigator.serial.requestPort(requestOptions);
      
      // Log device info for debugging
      const info = this.port.getInfo();
      console.log('Connected to device:', {
        usbVendorId: info.usbVendorId ? `0x${info.usbVendorId.toString(16).toUpperCase()}` : 'Unknown',
        usbProductId: info.usbProductId ? `0x${info.usbProductId.toString(16).toUpperCase()}` : 'Unknown'
      });
      
      // Open the port with printer settings
      await this.port.open({ 
        baudRate: 9600,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        flowControl: 'none'
      });
      
      return true;
    } catch (error) {
      console.error('Failed to connect to printer:', error);
      return false;
    }
  }

  async sendCommands(commands: number[]): Promise<void> {
    if (!this.port) {
      throw new Error('Not connected to printer');
    }

    const writer = this.port.writable.getWriter();
    
    try {
      // Convert command array to Uint8Array
      const data = new Uint8Array(commands);
      await writer.write(data);
      console.log('Commands sent successfully');
    } catch (error) {
      console.error('Failed to send commands:', error);
      throw error;
    } finally {
      writer.releaseLock();
    }
  }

  async disconnect(): Promise<void> {
    if (this.port) {
      await this.port.close();
      this.port = null;
    }
  }

  isConnected(): boolean {
    return this.port !== null;
  }
}

// React hook for Web Serial printer
export const useWebSerialPrinter = () => {
  const [printer] = useState(() => new WebSerialPrinter());
  const [isConnected, setIsConnected] = useState(false);

  const connectPrinter = async (showAllDevices: boolean = false): Promise<boolean> => {
    if ('serial' in navigator) {
      const connected = await printer.connect(showAllDevices);
      setIsConnected(connected);
      return connected;
    } else {
      alert(i18n.t('hardwareTesting.webSerialUnsupported'));
      return false;
    }
  };

  const connectToAnyDevice = async (): Promise<boolean> => {
    return connectPrinter(true);
  };

  const sendToPrinter = async (commands: number[]): Promise<boolean> => {
    try {
      await printer.sendCommands(commands);
      return true;
    } catch (error) {
      console.error('Print failed:', error);
      return false;
    }
  };

  const disconnectPrinter = async (): Promise<void> => {
    await printer.disconnect();
    setIsConnected(false);
  };

  return { 
    connectPrinter, 
    connectToAnyDevice,
    sendToPrinter, 
    disconnectPrinter, 
    isConnected,
    isSupported: 'serial' in navigator 
  };
};
