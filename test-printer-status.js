#!/usr/bin/env node

const { performance } = require('perf_hooks');

async function main() {
  const HardwareController = require('./electron/hardware/hardwareController');
  const controller = new HardwareController();

  // 1. Quick list (instant)
  console.log('--- QUICK SYSTEM PRINTER LIST ---');
  const t1 = performance.now();
  const quickPrinters = await controller.quickListPrinters();
  const t2 = performance.now();
  console.log(`Quick list time: ${(t2-t1).toFixed(2)}ms`);
  quickPrinters.forEach((p, i) => {
    console.log(`${i+1}. ${p.name} [${p.type}] - Status: ${p.status} (Connected: ${p.connected})`);
  });

  // 2. Scan for connected/offline (should be fast, not complex)
  console.log('\n--- CONNECTIVITY STATUS SCAN ---');
  const t3 = performance.now();
  const statusResults = await Promise.all(
    quickPrinters.map(async (printer) => {
      // Only check connectivity for USB/network printers
      let connected = false;
      let status = 'unknown';
      
      if (printer.type === 'usb') {
        // Check if USB device is actually physically connected using serial number
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        try {
          if (printer.device && printer.device.startsWith('usb://')) {
            // Extract serial number from URI (more reliable than vendor name)
            const serialMatch = printer.device.match(/serial=([^&]+)/);
            if (serialMatch) {
              const expectedSerial = serialMatch[1];
              
              // Get all USB devices and look for matching serial
              const { stdout } = await execAsync('system_profiler SPUSBDataType -json');
              const usbData = JSON.parse(stdout);
              
              const findBySerial = (items, targetSerial) => {
                if (!items) return false;
                return items.some(item => {
                  if (item.serial_num && item.serial_num === targetSerial) {
                    return true;
                  }
                  return findBySerial(item._items, targetSerial);
                });
              };
              
              connected = findBySerial(usbData.SPUSBDataType, expectedSerial);
              status = connected ? 'connected' : 'offline';
            } else {
              // Fallback to vendor-based check if no serial
              const { stdout } = await execAsync('system_profiler SPUSBDataType -json');
              const usbData = JSON.parse(stdout);
              
              const findUSBDevice = (items, vendorName) => {
                if (!items) return false;
                return items.some(item => {
                  if (item._name && item._name.toLowerCase().includes(vendorName.toLowerCase())) {
                    return true;
                  }
                  if (item.manufacturer && item.manufacturer.toLowerCase().includes(vendorName.toLowerCase())) {
                    return true;
                  }
                  return findUSBDevice(item._items, vendorName);
                });
              };
              
              const vendorMatch = printer.device.match(/usb:\/\/([^\/]+)/);
              if (vendorMatch) {
                const vendor = vendorMatch[1];
                connected = findUSBDevice(usbData.SPUSBDataType, vendor);
                status = connected ? 'connected' : 'offline';
              } else {
                status = 'unknown';
              }
            }
          } else {
            status = 'unknown';
          }
        } catch (error) {
          status = 'error';
          connected = false;
        }
        
      } else if (printer.type === 'network') {
        // Try to open a socket (simulate fast check)
        const net = require('net');
        const match = printer.device.match(/(\d+\.\d+\.\d+\.\d+):(\d+)/);
        if (match) {
          const [_, ip, port] = match;
          await new Promise((resolve) => {
            const socket = net.createConnection({ host: ip, port: Number(port) }, () => {
              connected = true;
              status = 'connected';
              socket.destroy();
              resolve();
            });
            socket.on('error', () => {
              connected = false;
              status = 'offline';
              resolve();
            });
            setTimeout(() => {
              socket.destroy();
              connected = false;
              status = 'timeout';
              resolve();
            }, 500); // 0.5s timeout
          });
        } else {
          status = 'unknown';
        }
      } else {
        status = 'unknown';
      }
      return { ...printer, connected, status };
    })
  );
  const t4 = performance.now();
  console.log(`Connectivity scan time: ${(t4-t3).toFixed(2)}ms`);
  statusResults.forEach((p, i) => {
    console.log(`${i+1}. ${p.name} [${p.type}] - Status: ${p.status} (Connected: ${p.connected})`);
  });
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
