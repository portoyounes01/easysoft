#!/usr/bin/env node

/**
 * HPRT TP80K Configuration Script
 * Attempts to disable auto cash drawer opening
 */

const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function configureDrawer() {
  console.log('🔧 Configuring HPRT TP80K cash drawer settings...');
  
  const configs = [
    {
      name: 'Disable auto drawer open',
      commands: [0x1B, 0x40, 0x1B, 0x70, 0x00, 0x00, 0x00] // Reset + stop drawer
    },
    {
      name: 'Set drawer to manual mode',
      commands: [0x1C, 0x30] // Some printers use GS 0 for drawer config
    },
    {
      name: 'Configure drawer timing',
      commands: [0x1B, 0x70, 0x00, 0x01, 0x01] // Very short pulse
    },
    {
      name: 'HPRT specific config (if available)',
      commands: [0x1D, 0x28, 0x45, 0x03, 0x00, 0x01, 0x00] // Some HPRT config command
    }
  ];

  for (const config of configs) {
    console.log(`🔧 Trying: ${config.name}`);
    
    const tempFile = `/tmp/config_${Date.now()}.bin`;
    fs.writeFileSync(tempFile, Buffer.from(config.commands));
    
    try {
      await execAsync(`lp -d "HPRT_TP80K" -o raw "${tempFile}"`);
      console.log(`✅ Sent: ${config.name}`);
      
      // Wait between commands
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log(`❌ Failed: ${config.name} - ${error.message}`);
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }
  
  console.log('');
  console.log('🔄 Configuration complete. Try turning the printer off and on again.');
  console.log('');
  console.log('📖 If this doesn\'t work, check for:');
  console.log('   1. DIP switches on the printer (usually on back/bottom)');
  console.log('   2. Cash drawer connection cable - try disconnecting it');
  console.log('   3. Printer manual for cash drawer configuration');
}

configureDrawer();
