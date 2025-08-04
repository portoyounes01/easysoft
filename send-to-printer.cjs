#!/usr/bin/env node

/**
 * Simple Node.js script to send ESC/POS commands to system printer
 * Usage: node send-to-printer.cjs <command-file.bin> [printer-name]
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function sendCommandsToSystemPrinter(filePath, printerName = 'HPRT_TP80K') {
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

    // Check if printer exists
    console.log(`🔍 Checking printer: ${printerName}`);
    try {
      const { stdout: printerStatus } = await execAsync(`lpstat -p "${printerName}"`);
      console.log(`✅ Printer status: ${printerStatus.trim()}`);
    } catch (error) {
      console.log(`❌ Printer not found. Available printers:`);
      try {
        const { stdout: allPrinters } = await execAsync('lpstat -p');
        console.log(allPrinters);
      } catch (e) {
        console.log('No printers found or lpstat not available');
      }
      return;
    }

    // Send to system printer using lp command
    console.log(`🖨️  Sending to printer: ${printerName}`);
    const command = `lp -d "${printerName}" -o raw "${filePath}"`;
    console.log(`📤 Executing: ${command}`);
    
    const { stdout, stderr } = await execAsync(command);

    if (stderr) {
      console.log(`⚠️  Warning: ${stderr}`);
    }

    if (stdout.trim()) {
      console.log(`✅ Success! Job ID: ${stdout.trim()}`);
    } else {
      console.log(`✅ Command executed successfully`);
    }
    console.log(`📋 Commands sent to ${printerName}`);

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Quick cash drawer test function
async function testCashDrawer(printerName = 'HPRT_TP80K') {
  console.log('🏦 Testing cash drawer...');
  
  // Create temporary cash drawer command file
  const drawerCommands = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]); // ESC p 0 25 250 (longer pulse)
  const tempFile = path.join(__dirname, 'temp_drawer_test.bin');
  
  fs.writeFileSync(tempFile, drawerCommands);
  
  try {
    await sendCommandsToSystemPrinter(tempFile, printerName);
    console.log('💰 Cash drawer should open now!');
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

// Close/reset cash drawer function
async function closeCashDrawer(printerName = 'HPRT_TP80K') {
  console.log('🔒 Attempting to close/reset cash drawer...');
  
  // Try multiple approaches to stop the drawer signal
  const approaches = [
    {
      name: 'Stop pulse (0 duration)',
      commands: [0x1B, 0x70, 0x00, 0x00, 0x00] // ESC p 0 0 0
    },
    {
      name: 'Alternative pin with stop',
      commands: [0x1B, 0x70, 0x01, 0x00, 0x00] // ESC p 1 0 0
    },
    {
      name: 'Printer reset',
      commands: [0x1B, 0x40] // ESC @
    }
  ];

  for (const approach of approaches) {
    console.log(`🔧 Trying: ${approach.name}`);
    const tempFile = path.join(__dirname, `temp_close_${Date.now()}.bin`);
    const buffer = Buffer.from(approach.commands);
    
    fs.writeFileSync(tempFile, buffer);
    
    try {
      await sendCommandsToSystemPrinter(tempFile, printerName);
      console.log(`✅ Sent ${approach.name} command`);
      
      // Wait a moment between attempts
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }
  
  console.log('🔒 Close/reset commands sent. Try manually closing the drawer now.');
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage:');
    console.log('  node send-to-printer.cjs <command-file.bin> [printer-name]');
    console.log('  node send-to-printer.cjs --test-drawer [printer-name]');
    console.log('  node send-to-printer.cjs --close-drawer [printer-name]');
    console.log('  node send-to-printer.cjs --list-files');
    console.log('');
    console.log('Examples:');
    console.log('  node send-to-printer.cjs cash-drawer-test.bin');
    console.log('  node send-to-printer.cjs receipt.bin HPRT_TP80K');
    console.log('  node send-to-printer.cjs --test-drawer');
    console.log('  node send-to-printer.cjs --close-drawer');
    console.log('  node send-to-printer.cjs --list-files');
    process.exit(1);
  }

  if (args[0] === '--list-files') {
    console.log('📁 Available .bin files:');
    const binFiles = fs.readdirSync('.').filter(f => f.endsWith('.bin'));
    binFiles.forEach(file => {
      const stats = fs.statSync(file);
      console.log(`   ${file} (${stats.size} bytes)`);
    });
    return;
  }

  if (args[0] === '--test-drawer') {
    const printerName = args[1] || 'HPRT_TP80K';
    await testCashDrawer(printerName);
  } else if (args[0] === '--close-drawer') {
    const printerName = args[1] || 'HPRT_TP80K';
    await closeCashDrawer(printerName);
  } else {
    const filePath = args[0];
    const printerName = args[1] || 'HPRT_TP80K';
    await sendCommandsToSystemPrinter(filePath, printerName);
  }
}

// Run the script
main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
