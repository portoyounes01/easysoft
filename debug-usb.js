#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function debugUSB() {
  try {
    console.log('🔍 Debugging USB detection...\n');
    
    // Get USB data
    const { stdout } = await execAsync('system_profiler SPUSBDataType -json');
    const usbData = JSON.parse(stdout);
    
    console.log('📱 Looking for HPRT devices in USB tree...\n');
    
    const findUSBDevice = (items, vendorName, depth = 0) => {
      if (!items) return false;
      const indent = '  '.repeat(depth);
      
      return items.some(item => {
        console.log(`${indent}Checking: ${item._name || 'unnamed'}`);
        if (item.manufacturer) console.log(`${indent}  Manufacturer: ${item.manufacturer}`);
        
        if (item._name && item._name.toLowerCase().includes(vendorName.toLowerCase())) {
          console.log(`${indent}✅ FOUND MATCH: ${item._name} contains "${vendorName}"`);
          return true;
        }
        if (item.manufacturer && item.manufacturer.toLowerCase().includes(vendorName.toLowerCase())) {
          console.log(`${indent}✅ FOUND MATCH: manufacturer "${item.manufacturer}" contains "${vendorName}"`);
          return true;
        }
        
        const found = findUSBDevice(item._items, vendorName, depth + 1);
        if (found) return true;
        
        return false;
      });
    };
    
    const found = findUSBDevice(usbData.SPUSBDataType, 'HPRT');
    console.log(`\n🎯 Result: HPRT device found = ${found}`);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debugUSB();
