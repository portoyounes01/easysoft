#!/usr/bin/env node

/**
 * Simple Cash Drawer Status Check
 * Attempts to detect if drawer is physically open or closed
 */

const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function checkDrawerStatus() {
  console.log('🔍 Checking cash drawer status...');
  
  try {
    // Send status query command to the drawer
    const statusCommand = Buffer.from([0x1B, 0x75, 0x00]); // ESC u 0 (drawer status query)
    const tempFile = `/tmp/drawer_status_${Date.now()}.bin`;
    
    fs.writeFileSync(tempFile, statusCommand);
    
    // Send command to printer
    const { stdout, stderr } = await execAsync(`lp -d "HPRT_TP80K" -o raw "${tempFile}"`);
    
    // Clean up
    fs.unlinkSync(tempFile);
    
    if (stderr) {
      console.log('⚠️  Warning:', stderr);
    }
    
    // Since we can't easily read the response through lp, 
    // we'll use the job completion as an indicator
    if (stdout.includes('request id')) {
      console.log('📤 Status query sent successfully');
      console.log('💡 Check your printer for any status indicators (LEDs, display, sounds)');
      
      // Wait a moment for any printer response
      console.log('⏳ Waiting for printer response...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('');
      console.log('📋 Manual Status Check:');
      console.log('====================');
      console.log('Please visually check your cash drawer:');
      console.log('🚪 OPEN   - Drawer is pulled out from printer');
      console.log('🔒 CLOSED - Drawer is flush with printer (heard click when closing)');
      
      // Try to give some automated hints
      console.log('');
      console.log('🤖 Automated hints:');
      console.log('• If you just sent an open command, drawer is likely OPEN');
      console.log('• If you heard a click when pushing it in, drawer is likely CLOSED');
      console.log('• If drawer springs back when you push it, it\'s likely OPEN');
      
    } else {
      console.log('❌ Failed to send status query');
    }
    
  } catch (error) {
    console.error('❌ Error checking drawer status:', error.message);
  }
}

async function simpleVisualCheck() {
  console.log('');
  console.log('👀 SIMPLE VISUAL CHECK');
  console.log('=====================');
  console.log('Look at your cash drawer right now:');
  console.log('');
  console.log('🚪 Is the drawer sticking out from the printer? → OPEN');
  console.log('🔒 Is the drawer flush/even with the printer?  → CLOSED');
  console.log('');
  console.log('✋ Physical test:');
  console.log('• Gently push the drawer - does it spring back? → OPEN');
  console.log('• Does it stay in place when pushed? → CLOSED');
  console.log('• Did you hear a "click" when it went in? → CLOSED');
}

// Main execution
async function main() {
  console.log('🏦 Cash Drawer Status Checker');
  console.log('=============================\n');
  
  await checkDrawerStatus();
  await simpleVisualCheck();
  
  console.log('');
  console.log('💡 For automated tracking, use:');
  console.log('   node drawer-logger.cjs status    (software state)');
  console.log('   node drawer-status.cjs           (this physical check)');
}

main();
