#!/usr/bin/env node

/**
 * Simple Node.js script to send ESC/POS commands to thermal printer
 * Usage: node send-to-printer.js <command-file.bin> [device]
 */

const fs = require('fs');
const path = require('path');

// Try to import serialport, but handle if not installed
let SerialPort;
try {
  SerialPort = require('serialport');
} catch (error) {
  console.error('❌ SerialPort module not found. Please install it:');
  console.error('   npm install serialport');
  process.exit(1);
}

async function sendCommandsToHardware(filePath, devicePath = null) {
  try {
    // Read command file
    if (!fs.existsSync(filePath)) {
      throw new Error(`Command file not found: ${filePath}`);
    }

    const commands = fs.readFileSync(filePath);
    console.log(`📄 Loaded ${commands.length} bytes from ${filePath}`);
    
    // Show commands in hex
    const hexCommands = Array.from(commands)
      .map(b => '0x' + b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');
    console.log(`🔢 Commands: ${hexCommands}`);

    // Auto-detect device if not specified
    if (!devicePath) {
      console.log('🔍 Auto-detecting printer...');
      const ports = await SerialPort.list();
      
      // Look for common printer device patterns
      const printerPorts = ports.filter(port => 
        port.path.includes('USB') || 
        port.path.includes('ttyUSB') || 
        port.path.includes('cu.usbserial') ||
        (port.manufacturer && port.manufacturer.toLowerCase().includes('printer'))
      );

      if (printerPorts.length === 0) {
        console.log('📋 Available ports:');
        ports.forEach(port => {
          console.log(`   ${port.path} - ${port.manufacturer || 'Unknown'}`);
        });
        throw new Error('No printer found. Please specify device path manually.');
      }

      devicePath = printerPorts[0].path;
      console.log(`✅ Found printer: ${devicePath}`);
    }

    // Connect and send commands
    console.log(`🔌 Connecting to ${devicePath}...`);
    
    const port = new SerialPort({
      path: devicePath,
      baudRate: 9600,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
      autoOpen: false
    });

    // Open connection
    await new Promise((resolve, reject) => {
      port.open((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log('✅ Connected successfully!');

    // Send commands
    await new Promise((resolve, reject) => {
      port.write(commands, (err) => {
        if (err) reject(err);
        else {
          console.log('📤 Commands sent to hardware!');
          resolve();
        }
      });
    });

    // Wait a bit for commands to process
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Close connection
    await new Promise((resolve, reject) => {
      port.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log('🎉 Success! Check your printer/cash drawer.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('📖 Usage: node send-to-printer.js <command-file.bin> [device-path]');
    console.log('');
    console.log('Examples:');
    console.log('  node send-to-printer.js cash-drawer-test.bin');
    console.log('  node send-to-printer.js printer-test.bin /dev/ttyUSB0');
    console.log('  node send-to-printer.js full-sequence.bin COM1');
    console.log('');
    console.log('💡 Download command files from the Cashier Testing page');
    process.exit(0);
  }

  const filePath = args[0];
  const devicePath = args[1];

  sendCommandsToHardware(filePath, devicePath);
}
