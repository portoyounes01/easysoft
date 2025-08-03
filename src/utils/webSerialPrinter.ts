import { useState } from 'react';

// Web Serial API types
interface SerialPort {
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  writable: WritableStream;
  readable: ReadableStream;
}

interface SerialOptions {
  baudRate: number;
  dataBits?: number;
  parity?: 'none' | 'even' | 'odd';
  stopBits?: number;
  flowControl?: 'none' | 'hardware';
}

declare global {
  interface Navigator {
    serial: {
      requestPort(): Promise<SerialPort>;
      getPorts(): Promise<SerialPort[]>;
    };
  }
}

// Web Serial API for direct hardware control
// This works in Chrome/Edge browsers with user permission
class WebSerialPrinter {
  private port: SerialPort | null = null;

  async connect(): Promise<boolean> {
    try {
      // Request access to serial port
      this.port = await navigator.serial.requestPort();
      
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

  const connectPrinter = async (): Promise<boolean> => {
    if ('serial' in navigator) {
      const connected = await printer.connect();
      setIsConnected(connected);
      return connected;
    } else {
      alert('Web Serial API not supported. Use Chrome or Edge browser.');
      return false;
    }
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
    sendToPrinter, 
    disconnectPrinter, 
    isConnected,
    isSupported: 'serial' in navigator 
  };
};
