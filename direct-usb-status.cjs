#!/usr/bin/env node

/**
 * Direct USB Device Communication for Cash Drawer Status
 * Uses USB HID/Printer class to communicate directly with HPRT TP80K
 */

const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function findUSBDevice() {
  console.log('🔍 Finding HPRT USB device...');
  
  try {
    // Get USB device information
    const { stdout } = await execAsync('system_profiler SPUSBDataType -json');
    const usbData = JSON.parse(stdout);
    
    // Find HPRT device
    let hprtDevice = null;
    
    function searchUSB(items) {
      for (const item of items || []) {
        if (item.manufacturer === 'HPRT' || item._name?.includes('HPRT')) {
          hprtDevice = item;
          return;
        }
        if (item._items) {
          searchUSB(item._items);
        }
      }
    }
    
    searchUSB(usbData.SPUSBDataType?.[0]?._items || []);
    
    if (hprtDevice) {
      console.log('✅ Found HPRT device:');
      console.log(`   Manufacturer: ${hprtDevice.manufacturer}`);
      console.log(`   Product ID: 0x${hprtDevice.product_id}`);
      console.log(`   Vendor ID: 0x${hprtDevice.vendor_id}`);
      console.log(`   Location: ${hprtDevice.location_id}`);
      
      return {
        vendorId: parseInt(hprtDevice.vendor_id, 16),
        productId: parseInt(hprtDevice.product_id, 16),
        location: hprtDevice.location_id
      };
    } else {
      console.log('❌ HPRT device not found');
      return null;
    }
    
  } catch (error) {
    console.error('❌ Error finding USB device:', error.message);
    return null;
  }
}

async function checkWithIORegistry() {
  console.log('\n🔧 Using macOS IORegistry to access device...');
  
  try {
    // Find the device in IORegistry
    const { stdout } = await execAsync('ioreg -p IOUSB -l | grep -A 20 -B 5 "HPRT"');
    console.log('📋 IORegistry info:');
    console.log(stdout);
    
    // Look for any status-related properties
    const statusMatch = stdout.match(/status|drawer|open|close/gi);
    if (statusMatch) {
      console.log('🎯 Found potential status properties:', statusMatch);
    }
    
  } catch (error) {
    console.log('⚠️  IORegistry lookup failed (device might be busy)');
  }
}

async function tryDirectDeviceAccess() {
  console.log('\n🔌 Attempting direct device access...');
  
  try {
    // Try to access the device file directly
    const devicePaths = [
      '/dev/usb/lp0',
      '/dev/usblp0', 
      '/dev/ugen*',
      '/dev/ulpt0'
    ];
    
    for (const devicePath of devicePaths) {
      try {
        if (fs.existsSync(devicePath)) {
          console.log(`✅ Found device at: ${devicePath}`);
          return devicePath;
        }
      } catch (error) {
        // Continue checking
      }
    }
    
    // Check for any USB printer devices
    const { stdout } = await execAsync('ls /dev/ | grep -E "(usb|lp|ulpt)" || echo "No USB printer devices"');
    console.log('📱 Available USB devices:', stdout);
    
  } catch (error) {
    console.log('⚠️  Direct device access not available');
  }
  
  return null;
}

async function useUSBLibrary() {
  console.log('\n📚 Installing USB communication library...');
  
  try {
    // Check if usb library is available
    try {
      require('usb');
      console.log('✅ USB library already available');
    } catch (error) {
      console.log('📦 Installing USB library...');
      await execAsync('npm install usb');
      console.log('✅ USB library installed');
    }
    
    // Try to use the USB library
    const usb = require('usb');
    
    console.log('🔍 Scanning for USB devices...');
    const devices = usb.getDeviceList();
    
    // Find HPRT device
    const hprtDevice = devices.find(device => 
      device.deviceDescriptor.idVendor === 0x2aaf && 
      device.deviceDescriptor.idProduct === 0x6004
    );
    
    if (hprtDevice) {
      console.log('✅ Found HPRT device via USB library!');
      console.log(`   Vendor ID: 0x${hprtDevice.deviceDescriptor.idVendor.toString(16)}`);
      console.log(`   Product ID: 0x${hprtDevice.deviceDescriptor.idProduct.toString(16)}`);
      
      return await queryDeviceStatus(hprtDevice);
    } else {
      console.log('❌ HPRT device not found via USB library');
    }
    
  } catch (error) {
    console.log('❌ USB library approach failed:', error.message);
    console.log('💡 This might require additional system permissions');
  }
}

async function queryDeviceStatus(device) {
  console.log('\n📡 Querying device status...');
  
  try {
    // Open the device
    device.open();
    
    // Get the first interface
    const usbInterface = device.interface(0);
    
    // Claim the interface
    usbInterface.claim();
    
    // Find output endpoint
    const outEndpoint = usbInterface.endpoints.find(ep => ep.direction === 'out');
    const inEndpoint = usbInterface.endpoints.find(ep => ep.direction === 'in');
    
    if (outEndpoint && inEndpoint) {
      console.log('✅ Found communication endpoints');
      
      // Send drawer status query
      const statusQuery = Buffer.from([0x1B, 0x75, 0x00]); // ESC u 0
      
      return new Promise((resolve, reject) => {
        outEndpoint.transfer(statusQuery, (error) => {
          if (error) {
            reject(error);
            return;
          }
          
          console.log('📤 Status query sent');
          
          // Listen for response
          inEndpoint.transfer(64, (error, data) => {
            if (error) {
              console.log('⚠️  No response received (might be normal)');
              resolve(null);
              return;
            }
            
            console.log('📥 Received response:', data);
            
            // Interpret the response
            if (data && data.length > 0) {
              const statusByte = data[0];
              const isOpen = (statusByte & 0x01) !== 0; // Check bit 0
              
              console.log(`🎯 Drawer status: ${isOpen ? 'OPEN' : 'CLOSED'}`);
              resolve(isOpen ? 'OPEN' : 'CLOSED');
            } else {
              resolve('UNKNOWN');
            }
          });
        });
      });
      
    } else {
      console.log('❌ Could not find communication endpoints');
    }
    
  } catch (error) {
    console.log('❌ Device communication failed:', error.message);
  } finally {
    try {
      device.close();
    } catch (error) {
      // Ignore close errors
    }
  }
  
  return null;
}

// Main execution
async function main() {
  console.log('🏦 Direct USB Cash Drawer Status Checker');
  console.log('========================================\n');
  
  // Step 1: Find the device
  const deviceInfo = await findUSBDevice();
  
  if (!deviceInfo) {
    console.log('❌ Cannot proceed without device information');
    return;
  }
  
  // Step 2: Try different access methods
  await checkWithIORegistry();
  await tryDirectDeviceAccess();
  
  // Step 3: Try USB library approach
  const status = await useUSBLibrary();
  
  if (status) {
    console.log(`\n🎯 FINAL RESULT: Drawer is ${status}`);
  } else {
    console.log('\n💡 Automatic status detection not available with current setup');
    console.log('💡 This typically requires:');
    console.log('   • Root/admin permissions');
    console.log('   • Special USB drivers');
    console.log('   • Direct hardware support from manufacturer');
  }
}

main();
