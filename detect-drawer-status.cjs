#!/usr/bin/env node

/**
 * Automatic Cash Drawer Status Detection
 * Attempts to read actual hardware status from 6-wire drawer
 */

const fs = require('fs');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Try to find the actual device path for the printer
async function findPrinterDevice() {
  console.log('🔍 Looking for printer device...');
  
  try {
    // Check for USB devices with HPRT vendor ID
    const { stdout } = await execAsync('system_profiler SPUSBDataType | grep -A 10 -B 5 "HPRT"');
    console.log('📱 Found HPRT device in system');
    
    // Look for potential device paths
    const deviceChecks = [
      '/dev/cu.usbmodem*',
      '/dev/cu.usbserial*', 
      '/dev/tty.usbmodem*',
      '/dev/tty.usbserial*'
    ];
    
    for (const pattern of deviceChecks) {
      try {
        const { stdout: devices } = await execAsync(`ls ${pattern} 2>/dev/null || echo ""`);
        if (devices.trim()) {
          console.log(`✅ Found potential device: ${devices.trim()}`);
          return devices.trim().split('\n')[0];
        }
      } catch (e) {
        // Continue checking
      }
    }
    
    console.log('⚠️  No direct serial device found');
    return null;
    
  } catch (error) {
    console.log('❌ Could not find HPRT device');
    return null;
  }
}

// Try to communicate with drawer through CUPS backend
async function queryDrawerThroughCUPS() {
  console.log('🔧 Querying drawer status through CUPS...');
  
  try {
    // Use lpinfo to get more details about the printer
    const { stdout: printerInfo } = await execAsync('lpstat -l -p HPRT_TP80K');
    console.log('📋 Printer info:', printerInfo.trim());
    
    // Send a status query that might give us feedback
    const statusCommand = Buffer.from([
      0x1B, 0x75, 0x00, // ESC u 0 - drawer status
      0x0A              // Line feed to ensure transmission
    ]);
    
    const tempFile = `/tmp/status_query_${Date.now()}.bin`;
    fs.writeFileSync(tempFile, statusCommand);
    
    // Send and capture any output
    const result = await execAsync(`lp -d "HPRT_TP80K" -o raw "${tempFile}" 2>&1`);
    
    fs.unlinkSync(tempFile);
    
    console.log('📤 Status query result:', result.stdout);
    
    // Check printer status immediately after
    const { stdout: statusAfter } = await execAsync('lpstat -p HPRT_TP80K');
    console.log('📊 Printer status after query:', statusAfter.trim());
    
  } catch (error) {
    console.log('❌ CUPS query failed:', error.message);
  }
}

// Try using the Web Serial API approach (requires browser context)
async function suggestWebSerialApproach() {
  console.log('\n💡 Alternative: Web Serial API Approach');
  console.log('=====================================');
  console.log('Your 6-wire drawer likely supports status feedback, but we need');
  console.log('direct serial communication to read the response.');
  console.log('');
  console.log('Options:');
  console.log('1. 🌐 Use Web Serial API in your React app');
  console.log('2. 📦 Install serialport npm package for direct communication');
  console.log('3. 🔧 Use a USB-to-Serial adapter with known protocol');
  console.log('');
  console.log('The macOS print system (CUPS) is designed for one-way communication');
  console.log('and doesn\'t easily expose the status responses from the drawer.');
}

// Test different status query methods
async function testStatusQueries() {
  console.log('🧪 Testing multiple status query methods...\n');
  
  const queries = [
    { name: 'Standard Drawer Status', cmd: [0x1B, 0x75, 0x00] },
    { name: 'Real-time Status 1', cmd: [0x10, 0x04, 0x01] },
    { name: 'Real-time Status 2', cmd: [0x10, 0x04, 0x02] },
    { name: 'Transmit Status', cmd: [0x1D, 0x72, 0x01] },
    { name: 'Paper Sensor Status', cmd: [0x1B, 0x76] }
  ];
  
  for (const query of queries) {
    console.log(`🔍 Testing: ${query.name}`);
    
    const tempFile = `/tmp/test_${Date.now()}.bin`;
    fs.writeFileSync(tempFile, Buffer.from(query.cmd));
    
    try {
      const start = Date.now();
      await execAsync(`lp -d "HPRT_TP80K" -o raw "${tempFile}"`);
      const duration = Date.now() - start;
      
      console.log(`  ✅ Sent in ${duration}ms`);
      
      // Wait and check for any system changes
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log(`  ❌ Failed: ${error.message}`);
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }
}

async function main() {
  console.log('🔄 Automatic Drawer Status Detection');
  console.log('=====================================\n');
  
  // Step 1: Look for direct device access
  const device = await findPrinterDevice();
  
  if (device) {
    console.log(`\n📱 Found device: ${device}`);
    console.log('💡 This could be used for direct serial communication');
  }
  
  // Step 2: Try CUPS-based queries
  await queryDrawerThroughCUPS();
  
  // Step 3: Test various status queries
  await testStatusQueries();
  
  // Step 4: Suggest alternatives
  await suggestWebSerialApproach();
  
  console.log('\n🎯 Summary:');
  console.log('Your 6-wire Sitten drawer has status capability, but accessing');
  console.log('it requires direct serial communication rather than the print system.');
  console.log('\n📝 Next steps to get automatic status:');
  console.log('1. Install serialport: npm install serialport');
  console.log('2. Use direct device communication');
  console.log('3. Implement status polling in your application');
}

main();
