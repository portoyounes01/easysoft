#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function universalUSBCheck(deviceURI) {
  try {
    // Extract serial number from URI (more reliable than vendor)
    // URI formats: usb://HP/LaserJet?serial=12345 or usb://HPRT/TP80K?serial=TP80K023251289
    const serialMatch = deviceURI.match(/serial=([^&]+)/);
    if (!serialMatch) {
      return { connected: false, status: 'no_serial' };
    }
    
    const expectedSerial = serialMatch[1];
    console.log(`Looking for USB device with serial: ${expectedSerial}`);
    
    // Get all USB devices
    const { stdout } = await execAsync('system_profiler SPUSBDataType -json');
    const usbData = JSON.parse(stdout);
    
    // Look for device with matching serial number
    const findBySerial = (items, targetSerial) => {
      if (!items) return false;
      return items.some(item => {
        if (item.serial_num && item.serial_num === targetSerial) {
          console.log(`✅ Found matching device: ${item._name} (${item.manufacturer})`);
          return true;
        }
        return findBySerial(item._items, targetSerial);
      });
    };
    
    const found = findBySerial(usbData.SPUSBDataType, expectedSerial);
    return { 
      connected: found, 
      status: found ? 'connected' : 'offline',
      serial: expectedSerial 
    };
    
  } catch (error) {
    return { connected: false, status: 'error', error: error.message };
  }
}

async function testUniversalDetection() {
  console.log('🧪 TESTING UNIVERSAL USB DETECTION\n');
  
  // Test with your actual printer
  const testURI = 'usb://HPRT/TP80K?serial=TP80K023251289';
  console.log(`Testing URI: ${testURI}`);
  
  const result = await universalUSBCheck(testURI);
  console.log('Result:', result);
  
  console.log('\n📝 This approach would work for:');
  console.log('✅ ANY USB printer with a serial number in the URI');
  console.log('✅ HP, Canon, Epson, Brother, Generic, etc.');
  console.log('✅ Different vendor names');
  console.log('❌ Only fails if no serial number in URI');
}

testUniversalDetection();
