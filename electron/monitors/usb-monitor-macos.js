#!/usr/bin/env node

/**
 * macOS USB Device Monitor
 * Uses system_profiler and ioreg to detect USB device changes
 * Runs as a background process and reports changes via IPC
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');

class MacUSBMonitor extends EventEmitter {
  constructor() {
    super();
    this.knownDevices = new Set();
    this.monitoring = false;
    this.process = null;
  }

  start() {
    if (this.monitoring) return;
    
    console.log('🔍 Starting macOS USB monitor...');
    this.monitoring = true;
    
    // Initial scan to populate known devices
    this.scanDevices().then(() => {
      // Start continuous monitoring using ioreg
      this.startIORegMonitoring();
    });
  }

  stop() {
    this.monitoring = false;
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    console.log('⏹️ Stopped macOS USB monitor');
  }

  async scanDevices() {
    try {
      // Get current USB devices
      const devices = await this.getCurrentUSBDevices();
      const currentDeviceSet = new Set(devices.map(d => d.id));
      
      // Check for new devices
      for (const device of devices) {
        if (!this.knownDevices.has(device.id)) {
          console.log(`🔌 USB device connected: ${device.name} (${device.vendor})`);
          this.emit('device-connected', device);
        }
      }
      
      // Check for removed devices
      for (const knownId of this.knownDevices) {
        if (!currentDeviceSet.has(knownId)) {
          console.log(`🔌 USB device disconnected: ${knownId}`);
          this.emit('device-disconnected', { id: knownId });
        }
      }
      
      this.knownDevices = currentDeviceSet;
      
    } catch (error) {
      console.error('USB scan error:', error);
    }
  }

  async getCurrentUSBDevices() {
    return new Promise((resolve, reject) => {
      const devices = [];
      
      // Use system_profiler to get USB device info
      const profiler = spawn('system_profiler', ['SPUSBDataType', '-json']);
      let output = '';
      
      profiler.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      profiler.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`system_profiler exited with code ${code}`));
          return;
        }
        
        try {
          const data = JSON.parse(output);
          const usbData = data.SPUSBDataType || [];
          
          // Parse USB devices recursively
          const parseDevices = (items, busName = '') => {
            for (const item of items) {
              if (item._name && item._name.toLowerCase().includes('printer')) {
                devices.push({
                  id: `${item.vendor_id}-${item.product_id}-${item.serial_num || 'no-serial'}`,
                  name: item._name,
                  vendor: item.manufacturer || 'Unknown',
                  vendorId: item.vendor_id,
                  productId: item.product_id,
                  serial: item.serial_num,
                  bus: busName,
                  type: 'printer'
                });
              }
              
              // Recursively check nested devices
              if (item._items) {
                parseDevices(item._items, item._name);
              }
            }
          };
          
          parseDevices(usbData);
          resolve(devices);
          
        } catch (error) {
          reject(error);
        }
      });
      
      profiler.on('error', reject);
    });
  }

  startIORegMonitoring() {
    // Use ioreg to monitor USB device tree changes in real-time
    this.process = spawn('ioreg', ['-p', 'IOUSB', '-w0', '-f'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let buffer = '';
    
    this.process.stdout.on('data', (data) => {
      buffer += data.toString();
      
      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer
      
      for (const line of lines) {
        this.processIORegLine(line);
      }
    });
    
    this.process.on('close', (code) => {
      if (this.monitoring) {
        console.log('ioreg process closed, restarting...');
        setTimeout(() => this.startIORegMonitoring(), 1000);
      }
    });
    
    // Periodic full scan as backup
    this.scanInterval = setInterval(() => {
      if (this.monitoring) {
        this.scanDevices();
      }
    }, 5000);
  }

  processIORegLine(line) {
    // Look for printer-related USB devices in ioreg output
    if (line.includes('IOUSBDevice') && 
        (line.toLowerCase().includes('printer') || 
         line.toLowerCase().includes('hprt') ||
         line.toLowerCase().includes('thermal'))) {
      
      // Trigger a full scan when we detect USB changes
      setTimeout(() => this.scanDevices(), 100);
    }
  }
}

// If running as standalone script
if (require.main === module) {
  const monitor = new MacUSBMonitor();
  
  monitor.on('device-connected', (device) => {
    process.send && process.send({
      type: 'usb-connected',
      device
    });
  });
  
  monitor.on('device-disconnected', (device) => {
    process.send && process.send({
      type: 'usb-disconnected',
      device
    });
  });
  
  monitor.start();
  
  process.on('SIGTERM', () => {
    monitor.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    monitor.stop();
    process.exit(0);
  });
}

module.exports = MacUSBMonitor;
