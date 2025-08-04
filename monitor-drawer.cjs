#!/usr/bin/env node

/**
 * Cash Drawer Status Monitor
 * Attempts to detect drawer open/closed state
 */

const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function checkDrawerStatus() {
  console.log('🔍 Checking cash drawer status capabilities...');
  
  try {
    // ESC/POS drawer status query commands
    const statusCommands = [
      {
        name: 'Standard drawer status query',
        command: [0x1B, 0x75, 0x00], // ESC u 0
        description: 'Query drawer status pin 0'
      },
      {
        name: 'Alternative drawer status query', 
        command: [0x1B, 0x75, 0x01], // ESC u 1
        description: 'Query drawer status pin 1'
      },
      {
        name: 'Real-time status query',
        command: [0x10, 0x04, 0x01], // DLE EOT 1
        description: 'Real-time drawer status'
      },
      {
        name: 'Printer status query',
        command: [0x1D, 0x72, 0x01], // GS r 1
        description: 'General status including drawer'
      }
    ];

    console.log('📤 Sending status query commands...');
    
    for (const cmd of statusCommands) {
      console.log(`\n🔧 Testing: ${cmd.name}`);
      console.log(`📝 ${cmd.description}`);
      
      const tempFile = `/tmp/status_${Date.now()}.bin`;
      fs.writeFileSync(tempFile, Buffer.from(cmd.command));
      
      try {
        // Send command and try to capture response
        const result = await execAsync(`lp -d "HPRT_TP80K" -o raw "${tempFile}"`);
        console.log(`✅ Sent: ${cmd.command.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
        
        // Note: Getting response from lp is tricky, but the command is sent
        
      } catch (error) {
        console.log(`❌ Failed: ${error.message}`);
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n📋 Status queries sent. Check if drawer has status feedback wire.');
    console.log('💡 Most basic cash drawers only support open commands, not status reporting.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function monitorDrawerSimulated() {
  console.log('\n🕐 Simulated drawer monitoring (software-based approach):');
  console.log('This approach tracks drawer state based on:');
  console.log('• Commands sent (we know when we open it)');
  console.log('• Time-based estimation');
  console.log('• User input confirmation');
  
  let drawerState = 'closed';
  let lastOpenTime = null;
  
  console.log('\n📊 Current drawer state:', drawerState);
  console.log('💡 To implement full monitoring, you could:');
  console.log('1. Log every open command with timestamp');
  console.log('2. Prompt user to confirm when they close it');
  console.log('3. Use time-based estimation (most people close within X minutes)');
  console.log('4. Integrate with your POS transaction flow');
}

async function main() {
  await checkDrawerStatus();
  await monitorDrawerSimulated();
}

main();
