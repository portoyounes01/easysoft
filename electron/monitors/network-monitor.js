#!/usr/bin/env node

/**
 * Cross-platform Network Interface Monitor
 * Monitors network interface changes that might affect printer connectivity
 */

const { EventEmitter } = require('events');
const os = require('os');

class NetworkMonitor extends EventEmitter {
  constructor() {
    super();
    this.knownInterfaces = new Map();
    this.monitoring = false;
    this.scanInterval = null;
  }

  start() {
    if (this.monitoring) return;
    
    console.log('🌐 Starting network interface monitor...');
    this.monitoring = true;
    
    // Initial scan
    this.scanInterfaces();
    
    // Monitor for changes
    this.scanInterval = setInterval(() => {
      if (this.monitoring) {
        this.scanInterfaces();
      }
    }, 2000); // Check every 2 seconds
  }

  stop() {
    this.monitoring = false;
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    console.log('⏹️ Stopped network interface monitor');
  }

  scanInterfaces() {
    try {
      const interfaces = os.networkInterfaces();
      const currentState = new Map();
      
      // Process current interfaces
      for (const [name, addresses] of Object.entries(interfaces)) {
        if (addresses) {
          const activeAddresses = addresses.filter(addr => 
            !addr.internal && 
            (addr.family === 'IPv4' || addr.family === 4)
          );
          
          if (activeAddresses.length > 0) {
            const interfaceInfo = {
              name,
              addresses: activeAddresses.map(addr => ({
                address: addr.address,
                netmask: addr.netmask,
                family: addr.family
              })),
              status: 'up'
            };
            
            currentState.set(name, interfaceInfo);
          }
        }
      }
      
      // Check for changes
      this.compareInterfaces(currentState);
      
      // Update known state
      this.knownInterfaces = currentState;
      
    } catch (error) {
      console.error('Network scan error:', error);
    }
  }

  compareInterfaces(currentState) {
    // Check for new/changed interfaces
    for (const [name, current] of currentState) {
      const known = this.knownInterfaces.get(name);
      
      if (!known) {
        console.log(`🌐 Network interface up: ${name} (${current.addresses[0]?.address})`);
        this.emit('interface-up', current);
        this.notifyPrinterRecheck();
      } else {
        // Check if addresses changed
        const currentAddrs = current.addresses.map(a => a.address).sort();
        const knownAddrs = known.addresses.map(a => a.address).sort();
        
        if (JSON.stringify(currentAddrs) !== JSON.stringify(knownAddrs)) {
          console.log(`🌐 Network interface changed: ${name}`);
          this.emit('interface-changed', { previous: known, current });
          this.notifyPrinterRecheck();
        }
      }
    }
    
    // Check for removed interfaces
    for (const [name, known] of this.knownInterfaces) {
      if (!currentState.has(name)) {
        console.log(`🌐 Network interface down: ${name}`);
        this.emit('interface-down', known);
        this.notifyPrinterRecheck();
      }
    }
  }

  notifyPrinterRecheck() {
    // Emit event to trigger printer connectivity recheck
    this.emit('network-change', {
      timestamp: new Date().toISOString(),
      interfaces: Array.from(this.knownInterfaces.keys())
    });
  }
}

// If running as standalone script
if (require.main === module) {
  const monitor = new NetworkMonitor();
  
  monitor.on('interface-up', (interface) => {
    process.send && process.send({
      type: 'network-interface-up',
      interface
    });
  });
  
  monitor.on('interface-down', (interface) => {
    process.send && process.send({
      type: 'network-interface-down',
      interface
    });
  });
  
  monitor.on('interface-changed', (data) => {
    process.send && process.send({
      type: 'network-interface-changed',
      data
    });
  });
  
  monitor.on('network-change', (data) => {
    process.send && process.send({
      type: 'network-change',
      data
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

module.exports = NetworkMonitor;
