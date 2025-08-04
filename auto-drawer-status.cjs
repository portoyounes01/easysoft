#!/usr/bin/env node

/**
 * Real Automatic Drawer Status Detection
 * Uses direct serial communication to read drawer status
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

async function findHPRTPrinter() {
  console.log('🔍 Scanning for HPRT printer...');
  
  try {
    const ports = await SerialPort.list();
    console.log('📋 Available serial ports:');
    
    ports.forEach(port => {
      console.log(`  ${port.path} - ${port.manufacturer || 'Unknown'} (VID: ${port.vendorId || 'N/A'}, PID: ${port.productId || 'N/A'})`);
    });
    
    // Look for HPRT-specific vendor ID (0x2aaf) or manufacturer
    const hprtPorts = ports.filter(port => 
      port.vendorId === '2AAF' || 
      port.vendorId === '2aaf' ||
      (port.manufacturer && port.manufacturer.toLowerCase().includes('hprt'))
    );
    
    if (hprtPorts.length > 0) {
      console.log(`✅ Found HPRT device: ${hprtPorts[0].path}`);
      return hprtPorts[0].path;
    }
    
    // If no HPRT found, look for any USB device that might be the printer
    const usbPorts = ports.filter(port => 
      port.path.includes('usb') || 
      port.path.includes('tty.usb') ||
      port.path.includes('cu.usb')
    );
    
    if (usbPorts.length > 0) {
      console.log(`🤔 Found USB device (might be printer): ${usbPorts[0].path}`);
      return usbPorts[0].path;
    }
    
    console.log('❌ No suitable device found');
    return null;
    
  } catch (error) {
    console.error('❌ Error scanning ports:', error.message);
    return null;
  }
}

async function queryDrawerStatus(devicePath) {
  console.log(`🔌 Connecting to ${devicePath}...`);
  
  return new Promise((resolve, reject) => {
    const port = new SerialPort({
      path: devicePath,
      baudRate: 9600,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
      autoOpen: false
    });
    
    let responseData = Buffer.alloc(0);
    let timeout;
    
    port.on('data', (data) => {
      responseData = Buffer.concat([responseData, data]);
      console.log('📨 Received data:', Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
      
      // Clear timeout when we get data
      if (timeout) {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          analyzeResponse(responseData);
          port.close();
          resolve(responseData);
        }, 500); // Wait 500ms for more data
      }
    });
    
    port.on('error', (err) => {
      console.error('❌ Serial port error:', err.message);
      reject(err);
    });
    
    port.open((err) => {
      if (err) {
        console.error('❌ Failed to open port:', err.message);
        reject(err);
        return;
      }
      
      console.log('✅ Connected successfully');
      
      // Send drawer status query
      const statusCommand = Buffer.from([0x1B, 0x75, 0x00]); // ESC u 0
      console.log('📤 Sending status query: ESC u 0');
      
      port.write(statusCommand, (err) => {
        if (err) {
          console.error('❌ Failed to send command:', err.message);
          reject(err);
          return;
        }
        
        console.log('✅ Status query sent, waiting for response...');
        
        // Set timeout for response
        timeout = setTimeout(() => {
          if (responseData.length === 0) {
            console.log('⏰ No response received within 3 seconds');
            console.log('💡 This might mean:');
            console.log('   • Drawer doesn\'t support status queries');
            console.log('   • Wrong baud rate or communication settings');
            console.log('   • Drawer is connected but not responding');
          } else {
            analyzeResponse(responseData);
          }
          port.close();
          resolve(responseData);
        }, 3000);
      });
    });
  });
}

function analyzeResponse(data) {
  console.log('\n📊 Response Analysis:');
  console.log('====================');
  
  if (data.length === 0) {
    console.log('❌ No response data received');
    console.log('💡 Your drawer might not support status queries');
    return;
  }
  
  console.log(`📦 Received ${data.length} bytes:`, Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
  
  // Analyze common status response patterns
  if (data.length === 1) {
    const statusByte = data[0];
    console.log(`🔍 Status byte: 0x${statusByte.toString(16).padStart(2, '0')} (${statusByte})`);
    
    // Common ESC/POS status byte interpretations
    if (statusByte & 0x01) {
      console.log('🚪 Drawer status: OPEN (bit 0 set)');
    } else {
      console.log('🔒 Drawer status: CLOSED (bit 0 clear)');
    }
    
    if (statusByte & 0x02) {
      console.log('📄 Paper status: Issue detected (bit 1 set)');
    }
    
    if (statusByte & 0x04) {
      console.log('⚠️  Error status: Error detected (bit 2 set)');
    }
  } else {
    console.log('📋 Multi-byte response - analyzing...');
    // Could be multiple status bytes or other data
    data.forEach((byte, index) => {
      console.log(`  Byte ${index}: 0x${byte.toString(16).padStart(2, '0')} (${byte})`);
    });
  }
}

async function main() {
  console.log('🤖 Automatic Cash Drawer Status Detection');
  console.log('=========================================\n');
  
  const devicePath = await findHPRTPrinter();
  
  if (!devicePath) {
    console.log('\n💡 Fallback: Manual check');
    console.log('Since no direct device was found, you can still:');
    console.log('1. Use visual inspection (node drawer-status.cjs)');
    console.log('2. Use software state tracking (node drawer-logger.cjs)');
    console.log('3. Check if printer creates a device file when connected');
    return;
  }
  
  try {
    const response = await queryDrawerStatus(devicePath);
    
    console.log('\n🎯 Result:');
    if (response.length > 0) {
      console.log('✅ Automatic status detection is possible!');
      console.log('💡 You can now poll this regularly to track drawer state');
    } else {
      console.log('⚠️  No status response - drawer might not support queries');
      console.log('💡 Continue using manual logging approach');
    }
    
  } catch (error) {
    console.error('\n❌ Status detection failed:', error.message);
    console.log('💡 Try the manual approaches instead');
  }
}

main();
