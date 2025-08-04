#!/usr/bin/env node

/**
 * Alternative approach - send ESC/POS commands via different methods
 */

const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function resetPrinterHard() {
  console.log('🔄 Attempting hard printer reset...');
  
  try {
    // Method 1: Stop and restart CUPS
    console.log('1️⃣ Stopping printer...');
    await execAsync('cupsdisable HPRT_TP80K');
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('2️⃣ Starting printer...');
    await execAsync('cupsenable HPRT_TP80K');
    
    console.log('✅ Printer driver reset complete');
    
    // Method 2: Send a comprehensive reset sequence
    console.log('3️⃣ Sending reset sequence...');
    
    const resetCommands = [
      0x1B, 0x40, // ESC @ - Initialize printer
      0x1B, 0x70, 0x00, 0x00, 0x00, // Stop drawer pulse pin 0
      0x1B, 0x70, 0x01, 0x00, 0x00, // Stop drawer pulse pin 1  
      0x18, // CAN - Cancel current operation
      0x1B, 0x40, // ESC @ - Initialize printer again
    ];
    
    const tempFile = '/tmp/printer_reset.bin';
    fs.writeFileSync(tempFile, Buffer.from(resetCommands));
    
    // Try sending without raw mode
    await execAsync(`lp -d "HPRT_TP80K" "${tempFile}"`);
    
    // Clean up
    fs.unlinkSync(tempFile);
    
    console.log('✅ Reset sequence sent');
    console.log('');
    console.log('🔌 If the drawer is still stuck:');
    console.log('   1. Unplug the USB cable from the printer');
    console.log('   2. Wait 10 seconds');
    console.log('   3. Plug it back in');
    console.log('   4. Try manually closing the drawer');
    
  } catch (error) {
    console.error('❌ Reset failed:', error.message);
  }
}

resetPrinterHard();
