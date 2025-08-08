/**
 * Hardware Monitor Manager
 * Spawns platform-specific background processes to monitor hardware changes
 * Provides unified interface for all platforms
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const path = require('path');
const os = require('os');

class HardwareMonitorManager extends EventEmitter {
  constructor() {
    super();
    this.usbMonitor = null;
    this.networkMonitor = null;
    this.running = false;
    this.platform = os.platform();
  }

  async start() {
    if (this.running) return;
    
    console.log(`🔧 Starting hardware monitoring for ${this.platform}...`);
    this.running = true;
    
    try {
      await this.startUSBMonitoring();
      await this.startNetworkMonitoring();
    } catch (error) {
      console.error('Failed to start hardware monitoring:', error);
      this.emit('error', error);
    }
  }

  async startUSBMonitoring() {
    let monitorScript;
    
    switch (this.platform) {
      case 'darwin':
        monitorScript = path.join(__dirname, 'usb-monitor-macos-simple.js');
        break;
      case 'linux':
        monitorScript = path.join(__dirname, 'usb-monitor-linux.js');
        break;
      case 'win32':
        monitorScript = path.join(__dirname, 'usb-monitor-windows.js');
        break;
      default:
        console.warn(`USB monitoring not supported on ${this.platform}`);
        return;
    }

    console.log(`🔌 Starting USB monitor: ${monitorScript}`);
    
    this.usbMonitor = spawn('node', [monitorScript], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });
    
    this.usbMonitor.on('message', (data) => {
      console.log('USB event:', data);
      this.emit('usb-event', data);
      
      // Emit generic hardware change event
      if (data.type === 'usb-connected' || data.type === 'usb-disconnected') {
        this.emit('hardware-change', {
          type: 'usb',
          action: data.type === 'usb-connected' ? 'connected' : 'disconnected',
          device: data.device,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    this.usbMonitor.on('error', (error) => {
      console.error('USB monitor error:', error);
      this.emit('error', { source: 'usb', error });
    });
    
    this.usbMonitor.on('exit', (code) => {
      console.log(`USB monitor exited with code ${code}`);
      if (this.running && code !== 0) {
        // Attempt restart after delay
        setTimeout(() => this.startUSBMonitoring(), 5000);
      }
    });
  }

  async startNetworkMonitoring() {
    console.log('🌐 Starting network monitoring...');
    
    const networkMonitorPath = path.join(__dirname, 'network-monitor.js');
    
    this.networkMonitor = spawn('node', [networkMonitorPath], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });
    
    this.networkMonitor.on('message', (data) => {
      console.log('Network event:', data);
      this.emit('network-event', data);
      
      // For network changes, we should recheck printer connectivity
      if (data.type === 'network-change') {
        this.emit('hardware-change', {
          type: 'network',
          action: 'changed',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    this.networkMonitor.on('error', (error) => {
      console.error('Network monitor error:', error);
      this.emit('error', { source: 'network', error });
    });
    
    this.networkMonitor.on('exit', (code) => {
      console.log(`Network monitor exited with code ${code}`);
      if (this.running && code !== 0) {
        // Attempt restart after delay
        setTimeout(() => this.startNetworkMonitoring(), 5000);
      }
    });
  }

  stop() {
    this.running = false;
    
    if (this.usbMonitor) {
      this.usbMonitor.kill('SIGTERM');
      this.usbMonitor = null;
    }
    
    if (this.networkMonitor) {
      this.networkMonitor.kill('SIGTERM');
      this.networkMonitor = null;
    }
    
    console.log('⏹️ Hardware monitoring stopped');
  }

  getStatus() {
    return {
      platform: this.platform,
      running: this.running,
      monitors: {
        usb: !!this.usbMonitor,
        network: !!this.networkMonitor
      }
    };
  }
}

module.exports = HardwareMonitorManager;
