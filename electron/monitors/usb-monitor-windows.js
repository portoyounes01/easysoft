#!/usr/bin/env node

/**
 * Windows USB Device Monitor
 * Uses WMI events to detect USB device changes
 * Runs as a background process and reports changes via IPC
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');

class WindowsUSBMonitor extends EventEmitter {
  constructor() {
    super();
    this.knownDevices = new Set();
    this.monitoring = false;
    this.wmiProcess = null;
  }

  start() {
    if (this.monitoring) return;
    
    console.log('🔍 Starting Windows USB monitor...');
    this.monitoring = true;
    
    // Initial scan
    this.scanDevices().then(() => {
      // Start WMI event monitoring
      this.startWMIMonitoring();
    });
  }

  stop() {
    this.monitoring = false;
    if (this.wmiProcess) {
      this.wmiProcess.kill();
      this.wmiProcess = null;
    }
    console.log('⏹️ Stopped Windows USB monitor');
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
    return new Promise((resolve, reject) => {
      const devices = [];
      
      // Query WMI for USB devices
      const wmic = spawn('wmic', [
        'path', 'Win32_PnPEntity',
        'where', '"DeviceID like \'USB%\' and (Name like \'%printer%\' or Name like \'%thermal%\' or Manufacturer like \'%HPRT%\')"',
        'get', 'DeviceID,Name,Manufacturer',
        '/format:csv'
      ]);
      
      let output = '';
      
      wmic.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      wmic.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`wmic exited with code ${code}`));
          return;
        }
        
        try {
          const lines = output.split('\n').filter(line => line.trim() && !line.startsWith('Node'));
          
          for (const line of lines) {
            const parts = line.split(',');
            if (parts.length >= 4) {
              const deviceId = parts[1] ? parts[1].trim() : '';
              const manufacturer = parts[2] ? parts[2].trim() : 'Unknown';
              const name = parts[3] ? parts[3].trim() : 'Unknown Device';
              
              if (deviceId && deviceId.startsWith('USB')) {
                // Extract VID and PID from device ID
                const vidMatch = deviceId.match(/VID_([0-9A-F]{4})/i);
                const pidMatch = deviceId.match(/PID_([0-9A-F]{4})/i);
                
                devices.push({
                  id: deviceId,
                  name,
                  vendor: manufacturer,
                  vendorId: vidMatch ? vidMatch[1] : 'unknown',
                  productId: pidMatch ? pidMatch[1] : 'unknown',
                  deviceId,
                  type: 'usb'
                });
              }
            }
          }
          
          resolve(devices);
          
        } catch (error) {
          reject(error);
        }
      });
      
      wmic.on('error', reject);
    });
  }

  startWMIMonitoring() {
    // Use PowerShell to monitor WMI events for USB device changes
    const psScript = `
      Register-WmiEvent -Query "SELECT * FROM Win32_VolumeChangeEvent WHERE EventType = 2 OR EventType = 3"
      Register-WmiEvent -Query "SELECT * FROM __InstanceCreationEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_PnPEntity' AND TargetInstance.DeviceID LIKE 'USB%'"
      Register-WmiEvent -Query "SELECT * FROM __InstanceDeletionEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_PnPEntity' AND TargetInstance.DeviceID LIKE 'USB%'"
      
      try {
        while ($true) {
          $event = Wait-Event -Timeout 5
          if ($event) {
            Write-Host "USB_EVENT_DETECTED"
            Remove-Event -EventIdentifier $event.EventIdentifier
          }
        }
      } finally {
        Get-EventSubscriber | Unregister-Event
      }
    `;
    
    this.wmiProcess = spawn('powershell', ['-Command', psScript], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    this.wmiProcess.stdout.on('data', (data) => {
      const output = data.toString();
      
      if (output.includes('USB_EVENT_DETECTED')) {
        console.log('🔍 USB event detected via WMI');
        
        // Trigger scan after brief delay
        setTimeout(() => this.scanDevices(), 1000);
      }
    });
    
    this.wmiProcess.on('close', (code) => {
      if (this.monitoring) {
        console.log('PowerShell WMI process closed, restarting...');
        setTimeout(() => this.startWMIMonitoring(), 2000);
      }
    });
    
    this.wmiProcess.on('error', (error) => {
      console.error('PowerShell WMI error:', error);
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
    }, 5000);
  }
}

// If running as standalone script
if (require.main === module) {
  const monitor = new WindowsUSBMonitor();
  
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

module.exports = WindowsUSBMonitor;
