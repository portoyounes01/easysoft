#!/usr/bin/env node

/**
 * Linux USB Device Monitor
 * Uses udev events and /sys/bus/usb to detect USB device changes
 * Runs as a background process and reports changes via IPC
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');

class LinuxUSBMonitor extends EventEmitter {
  constructor() {
    super();
    this.knownDevices = new Set();
    this.monitoring = false;
    this.udevProcess = null;
  }

  start() {
    if (this.monitoring) return;
    
    console.log('🔍 Starting Linux USB monitor...');
    this.monitoring = true;
    
    // Initial scan
    this.scanDevices().then(() => {
      // Start udev monitoring for real-time events
      this.startUdevMonitoring();
    });
  }

  stop() {
    this.monitoring = false;
    if (this.udevProcess) {
      this.udevProcess.kill();
      this.udevProcess = null;
    }
    console.log('⏹️ Stopped Linux USB monitor');
  }

  async scanDevices() {
    try {
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
    const devices = [];
    
    try {
      // Use lsusb command
      const lsusbDevices = await this.getLsusbDevices();
      
      // Filter for printer devices
      for (const device of lsusbDevices) {
        if (device.name.toLowerCase().includes('printer') ||
            device.name.toLowerCase().includes('thermal') ||
            device.vendor.toLowerCase().includes('hprt')) {
          devices.push(device);
        }
      }
      
    } catch (error) {
      console.warn('lsusb failed, trying sysfs:', error.message);
      
      // Fallback to sysfs
      try {
        const sysfsDevices = await this.getSysfsDevices();
        devices.push(...sysfsDevices);
      } catch (sysError) {
        console.error('sysfs scan also failed:', sysError.message);
      }
    }
    
    return devices;
  }

  async getLsusbDevices() {
    return new Promise((resolve, reject) => {
      const devices = [];
      const lsusb = spawn('lsusb', ['-v']);
      let output = '';
      
      lsusb.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      lsusb.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`lsusb exited with code ${code}`));
          return;
        }
        
        // Parse lsusb output
        const lines = output.split('\n');
        let currentDevice = null;
        
        for (const line of lines) {
          const busMatch = line.match(/Bus (\d+) Device (\d+): ID ([0-9a-f]{4}):([0-9a-f]{4}) (.+)/);
          if (busMatch) {
            if (currentDevice) {
              devices.push(currentDevice);
            }
            
            currentDevice = {
              id: `${busMatch[3]}-${busMatch[4]}-${busMatch[1]}-${busMatch[2]}`,
              name: busMatch[5].trim(),
              vendor: '',
              vendorId: busMatch[3],
              productId: busMatch[4],
              bus: busMatch[1],
              device: busMatch[2],
              type: 'usb'
            };
          }
          
          if (currentDevice && line.includes('iManufacturer')) {
            const vendorMatch = line.match(/iManufacturer\s+\d+\s+(.+)/);
            if (vendorMatch) {
              currentDevice.vendor = vendorMatch[1].trim();
            }
          }
        }
        
        if (currentDevice) {
          devices.push(currentDevice);
        }
        
        resolve(devices);
      });
      
      lsusb.on('error', reject);
    });
  }

  async getSysfsDevices() {
    const devices = [];
    const usbDevicesPath = '/sys/bus/usb/devices';
    
    try {
      const entries = await fs.readdir(usbDevicesPath);
      
      for (const entry of entries) {
        if (entry.match(/^\d+-\d+/)) { // USB device pattern
          try {
            const devicePath = path.join(usbDevicesPath, entry);
            const vendor = await this.readSysfsFile(path.join(devicePath, 'idVendor'));
            const product = await this.readSysfsFile(path.join(devicePath, 'idProduct'));
            const manufacturer = await this.readSysfsFile(path.join(devicePath, 'manufacturer'));
            const productName = await this.readSysfsFile(path.join(devicePath, 'product'));
            
            if (vendor && product) {
              devices.push({
                id: `${vendor}-${product}-${entry}`,
                name: productName || 'Unknown Device',
                vendor: manufacturer || 'Unknown',
                vendorId: vendor,
                productId: product,
                device: entry,
                type: 'usb'
              });
            }
          } catch (error) {
            // Skip devices we can't read
          }
        }
      }
    } catch (error) {
      throw error;
    }
    
    return devices;
  }

  async readSysfsFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return content.trim();
    } catch (error) {
      return null;
    }
  }

  startUdevMonitoring() {
    // Monitor udev events for USB subsystem
    this.udevProcess = spawn('udevadm', ['monitor', '--subsystem-match=usb'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    this.udevProcess.stdout.on('data', (data) => {
      const output = data.toString();
      
      // Look for add/remove events
      if (output.includes('KERNEL[') && (output.includes(' add ') || output.includes(' remove '))) {
        console.log('🔍 USB event detected:', output.trim());
        
        // Trigger scan after brief delay to allow system to settle
        setTimeout(() => this.scanDevices(), 500);
      }
    });
    
    this.udevProcess.on('close', (code) => {
      if (this.monitoring) {
        console.log('udevadm process closed, restarting...');
        setTimeout(() => this.startUdevMonitoring(), 1000);
      }
    });
    
    this.udevProcess.on('error', (error) => {
      console.error('udevadm error:', error);
      // Fallback to periodic scanning
      this.startFallbackScanning();
    });
  }

  startFallbackScanning() {
    console.log('Starting fallback periodic scanning...');
    this.scanInterval = setInterval(() => {
      if (this.monitoring) {
        this.scanDevices();
      }
    }, 3000);
  }
}

// If running as standalone script
if (require.main === module) {
  const monitor = new LinuxUSBMonitor();
  
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

module.exports = LinuxUSBMonitor;
