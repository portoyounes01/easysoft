#!/usr/bin/env node

/**
 * Advanced Cash Drawer Sensor Detection
 * Tests for various sensor types and status reporting
 */

const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function detectDrawerSensors() {
  console.log('🔍 Advanced Cash Drawer Sensor Detection');
  console.log('==========================================\n');
  
  // First, let's check what we can detect about the drawer
  console.log('📋 Step 1: Physical Connection Analysis');
  console.log('Please check your cash drawer cable and count the wires:');
  console.log('• 4 wires = Basic drawer (no sensors)');
  console.log('• 5+ wires = Likely has status feedback');
  console.log('• 6-8 wires = Advanced sensors\n');
  
  console.log('📋 Step 2: Testing Status Response Commands');
  
  const testCommands = [
    {
      name: 'ESC/POS Drawer Status Query',
      commands: [0x1B, 0x75, 0x00], // ESC u 0
      expectResponse: true,
      description: 'Standard drawer status query'
    },
    {
      name: 'Real-time Status Request',
      commands: [0x10, 0x04, 0x01], // DLE EOT 1
      expectResponse: true,
      description: 'Real-time printer/drawer status'
    },
    {
      name: 'Paper Sensor Status (includes drawer)',
      commands: [0x10, 0x04, 0x02], // DLE EOT 2
      expectResponse: true,
      description: 'Paper and drawer sensor status'
    },
    {
      name: 'Transmit Status',
      commands: [0x1D, 0x72, 0x01], // GS r 1
      expectResponse: true,
      description: 'Transmit drawer status'
    }
  ];
  
  for (const test of testCommands) {
    console.log(`\n🧪 Testing: ${test.name}`);
    console.log(`📝 ${test.description}`);
    console.log(`📤 Command: ${test.commands.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
    
    const tempFile = `/tmp/sensor_test_${Date.now()}.bin`;
    fs.writeFileSync(tempFile, Buffer.from(test.commands));
    
    try {
      await execAsync(`lp -d "HPRT_TP80K" -o raw "${tempFile}"`);
      console.log('✅ Command sent successfully');
      
      if (test.expectResponse) {
        console.log('⏳ Waiting for potential response...');
        // In a real implementation, you'd need to read from the printer's response
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('💡 Note: Response reading requires direct serial connection');
      }
      
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }
  
  console.log('\n📋 Step 3: Manual Sensor Test');
  console.log('To test if your drawer has sensors:');
  console.log('1. 🚪 Open the drawer manually');
  console.log('2. 📤 Run: node send-to-printer.cjs cash-drawer-test-commands.bin');
  console.log('3. 🔊 Listen for different sounds/behaviors');
  console.log('4. 🚪 Close the drawer slowly and listen for clicks/changes');
  console.log('5. 📝 Note any LED changes on the drawer or printer');
  
  console.log('\n🔍 What to Look For:');
  console.log('• 🔊 Different sounds when drawer reaches closed position');
  console.log('• 💡 LED indicators on drawer or printer that change state');
  console.log('• 🔒 Mechanical "click" when drawer locks into closed position');
  console.log('• ⚡ Any response data when querying status');
  
  console.log('\n📚 Common Drawer Models with Sensors:');
  console.log('• Star Micronics CD3-1616 (has status feedback)');
  console.log('• Epson DM-D30 (magnetic sensor)');
  console.log('• APG Vasario Series (optical sensors)');
  console.log('• MMF POS Heritage (reed switch)');
}

async function testInteractiveStatus() {
  console.log('\n🎮 Interactive Status Test');
  console.log('========================');
  console.log('This test will help determine if your drawer reports status:');
  console.log('\n1. First, make sure your drawer is CLOSED');
  console.log('2. We\'ll send a status query');
  console.log('3. Then open the drawer manually');
  console.log('4. Send another status query');
  console.log('5. Compare any differences\n');
  
  // Send status query with drawer closed
  console.log('📤 Sending status query with drawer CLOSED...');
  const statusCmd = Buffer.from([0x1B, 0x75, 0x00, 0x10, 0x04, 0x01]);
  const tempFile = `/tmp/closed_status_${Date.now()}.bin`;
  
  fs.writeFileSync(tempFile, statusCmd);
  await execAsync(`lp -d "HPRT_TP80K" -o raw "${tempFile}"`);
  fs.unlinkSync(tempFile);
  
  console.log('✅ Status query sent (drawer closed)');
  console.log('\n⏸️  Now MANUALLY OPEN the drawer and press Enter to continue...');
}

// Main execution
detectDrawerSensors().then(() => {
  console.log('\n🎯 Next Steps:');
  console.log('• Check the physical wiring of your cash drawer');
  console.log('• Look up your specific drawer model specifications');
  console.log('• If sensors exist, we can implement real-time monitoring');
  console.log('• Otherwise, we\'ll use software-based tracking');
});
