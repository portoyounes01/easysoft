#!/usr/bin/env node

/**
 * Simplified macOS USB Monitor
 * Uses system_profiler for reliable USB device detection
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');

class MacUSBMonitor extends EventEmitter {
  constructor() {
    super();
    this.monitoring = false;
    this.knownDevices = new Map();
    this.scanInterval = null;
  }

  start() {
    if (this.monitoring) return;
    
    console.log('🔍 Starting simplified macOS USB monitor...');
    this.monitoring = true;
    
    // Initial scan
    this.scanDevices();
    
    // Poll every 2 seconds for USB changes
    this.scanInterval = setInterval(() => {
      if (this.monitoring) {
        this.scanDevices();
      }
    }, 2000);
  }

  stop() {
    console.log('⏹️ Stopped macOS USB monitor');
    this.monitoring = false;
    
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
  }

  async scanDevices() {
    try {
      const devices = await this.getCurrentUSBDevices();
      this.compareDevices(devices);
    } catch (error) {
      console.error('USB scan error:', error);
    }
  }

  getCurrentUSBDevices() {
    return new Promise((resolve, reject) => {
      const process = spawn('system_profiler', ['SPUSBDataType', '-json'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      process.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`system_profiler failed: ${errorOutput}`));
          return;
        }

        try {
          const data = JSON.parse(output);
          const devices = this.extractUSBDevices(data);
          resolve(devices);
        } catch (error) {
          reject(new Error(`Failed to parse USB data: ${error.message}`));
        }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        process.kill();
        reject(new Error('USB scan timeout'));
      }, 10000);
    });
  }

  extractUSBDevices(data) {
    const devices = new Map();
    
    const processUSBBus = (bus) => {
      if (bus._items) {
        bus._items.forEach(device => {
          const deviceInfo = {
            name: device._name || 'Unknown Device',
            productId: device.product_id || '',
            vendorId: device.vendor_id || '',
            manufacturer: device.manufacturer || '',
            locationId: device.location_id || '',
            serialNumber: device.serial_num || ''
          };
          
          const deviceKey = `${deviceInfo.vendorId}:${deviceInfo.productId}:${deviceInfo.locationId}`;
          devices.set(deviceKey, deviceInfo);
          
          // Check for nested devices
          if (device._items) {
            device._items.forEach(subDevice => {
              const subDeviceInfo = {
                name: subDevice._name || 'Unknown Device',
                productId: subDevice.product_id || '',
                vendorId: subDevice.vendor_id || '',
                manufacturer: subDevice.manufacturer || '',
                locationId: subDevice.location_id || '',
                serialNumber: subDevice.serial_num || ''
              };
              
              const subDeviceKey = `${subDeviceInfo.vendorId}:${subDeviceInfo.productId}:${subDeviceInfo.locationId}`;
              devices.set(subDeviceKey, subDeviceInfo);
            });
          }
        });
      }
    };

    if (data.SPUSBDataType) {
      data.SPUSBDataType.forEach(processUSBBus);
    }

    return devices;
  }

  compareDevices(currentDevices) {
    // Check for new devices
    for (const [key, device] of currentDevices) {
      if (!this.knownDevices.has(key)) {
        console.log(`🔌 USB device connected: ${device.name} (${device.vendorId}:${device.productId})`);
        this.emit('usb-connected', { device });
        
        // Check if it might be a printer
        if (this.isPrinterDevice(device)) {
          this.emit('printer-connected', { device });
        }
      }
    }

    // Check for removed devices
    for (const [key, device] of this.knownDevices) {
      if (!currentDevices.has(key)) {
        console.log(`🔌 USB device disconnected: ${device.name} (${device.vendorId}:${device.productId})`);
        this.emit('usb-disconnected', { device });
        
        if (this.isPrinterDevice(device)) {
          this.emit('printer-disconnected', { device });
        }
      }
    }

    // Update known devices
    this.knownDevices = currentDevices;
  }

  isPrinterDevice(device) {
    const name = device.name.toLowerCase();
    const manufacturer = device.manufacturer.toLowerCase();
    
    return name.includes('printer') || 
           name.includes('thermal') ||
           name.includes('receipt') ||
           name.includes('pos') ||
           manufacturer.includes('printer') ||
           manufacturer.includes('thermal');
  }
}

// If running as standalone script
if (require.main === module) {
  const monitor = new MacUSBMonitor();
  
  monitor.on('usb-connected', (data) => {
    process.send && process.send({
      type: 'usb-connected',
      device: data.device
    });
  });
  
  monitor.on('usb-disconnected', (data) => {
    process.send && process.send({
      type: 'usb-disconnected',
      device: data.device
    });
  });
  
  monitor.on('printer-connected', (data) => {
    process.send && process.send({
      type: 'printer-connected',
      device: data.device
    });
  });
  
  monitor.on('printer-disconnected', (data) => {
    process.send && process.send({
      type: 'printer-disconnected',
      device: data.device
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
