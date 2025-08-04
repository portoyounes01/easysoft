#!/usr/bin/env node

/**
 * Sitten 6-wire Cash Drawer Status Test
 * Tests different status query methods for 6-wire drawers
 */

const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function testSittenDrawerStatus() {
  console.log('🔍 Sitten 6-Wire Cash Drawer Status Test');
  console.log('========================================\n');
  
  console.log('📋 Your drawer setup:');
  console.log('• Brand: Sitten');
  console.log('• Wires: 6 (status feedback capable)');
  console.log('• Click sound: Yes (mechanical sensor)');
  console.log('• Feedback type: Likely reed switch or hall sensor\n');
  
  // Test different status commands specific to 6-wire drawers
  const statusTests = [
    {
      name: 'Standard Status Query (Pin 0)',
      command: [0x1B, 0x75, 0x00], // ESC u 0
      description: 'Query status of drawer connected to pin 0'
    },
    {
      name: 'Standard Status Query (Pin 1)', 
      command: [0x1B, 0x75, 0x01], // ESC u 1
      description: 'Query status of drawer connected to pin 1'
    },
    {
      name: 'Real-time Status (Type 1)',
      command: [0x10, 0x04, 0x01], // DLE EOT 1
      description: 'Real-time printer status including drawer'
    },
    {
      name: 'Real-time Status (Type 2)',
      command: [0x10, 0x04, 0x02], // DLE EOT 2  
      description: 'Real-time offline status including drawer'
    },
    {
      name: 'Real-time Status (Type 3)',
      command: [0x10, 0x04, 0x03], // DLE EOT 3
      description: 'Real-time error status including drawer'
    },
    {
      name: 'Real-time Status (Type 4)',
      command: [0x10, 0x04, 0x04], // DLE EOT 4
      description: 'Real-time paper sensor status including drawer'
    }
  ];

  console.log('🧪 Testing Status Commands:');
  console.log('Note: Make sure drawer is CLOSED before starting\n');

  for (let i = 0; i < statusTests.length; i++) {
    const test = statusTests[i];
    console.log(`${i + 1}. ${test.name}`);
    console.log(`   📝 ${test.description}`);
    console.log(`   📤 Command: ${test.command.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
    
    const tempFile = `/tmp/sitten_status_${Date.now()}.bin`;
    fs.writeFileSync(tempFile, Buffer.from(test.command));
    
    try {
      await execAsync(`lp -d "HPRT_TP80K" -o raw "${tempFile}"`);
      console.log('   ✅ Command sent');
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
    
    // Wait between commands
    await new Promise(resolve => setTimeout(resolve, 1500));
    console.log('');
  }
  
  console.log('🎯 Interactive Test:');
  console.log('Now let\'s test if the status changes when you open/close the drawer');
}

async function interactiveStatusTest() {
  console.log('\n🎮 Interactive Drawer Status Test');
  console.log('=================================');
  
  console.log('This test will help us detect if status feedback is working:\n');
  
  // Test 1: Drawer closed
  console.log('📍 Step 1: Ensure drawer is CLOSED');
  console.log('🔄 Sending status query...');
  
  let tempFile = `/tmp/test_closed_${Date.now()}.bin`;
  fs.writeFileSync(tempFile, Buffer.from([0x1B, 0x75, 0x00])); // ESC u 0
  await execAsync(`lp -d "HPRT_TP80K" -o raw "${tempFile}"`);
  fs.unlinkSync(tempFile);
  
  console.log('✅ Status query sent (drawer closed)');
  console.log('⏳ Waiting 3 seconds...\n');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Test 2: Open drawer  
  console.log('📍 Step 2: OPEN the drawer now');
  console.log('🔄 Sending another status query...');
  
  tempFile = `/tmp/test_open_${Date.now()}.bin`;
  fs.writeFileSync(tempFile, Buffer.from([0x1B, 0x75, 0x00])); // ESC u 0
  await execAsync(`lp -d "HPRT_TP80K" -o raw "${tempFile}"`);
  fs.unlinkSync(tempFile);
  
  console.log('✅ Status query sent (drawer open)');
  console.log('⏳ Waiting 3 seconds...\n');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Test 3: Close drawer
  console.log('📍 Step 3: CLOSE the drawer now (listen for the click)');
  console.log('🔄 Sending final status query...');
  
  tempFile = `/tmp/test_closed_again_${Date.now()}.bin`;
  fs.writeFileSync(tempFile, Buffer.from([0x1B, 0x75, 0x00])); // ESC u 0
  await execAsync(`lp -d "HPRT_TP80K" -o raw "${tempFile}"`);
  fs.unlinkSync(tempFile);
  
  console.log('✅ Status query sent (drawer closed again)');
  
  console.log('\n📊 Analysis:');
  console.log('If your drawer supports status feedback:');
  console.log('• Different responses should be sent for open vs closed');
  console.log('• The printer may beep differently');
  console.log('• LED indicators on printer might change');
  console.log('• Print job behavior might vary');
  
  console.log('\n💡 Next: Check printer display/LEDs for any status changes');
  console.log('💡 Also: Look for any documentation on Sitten drawer protocols');
}

// Run the tests
testSittenDrawerStatus().then(() => {
  return interactiveStatusTest();
}).then(() => {
  console.log('\n🎯 Summary:');
  console.log('Your 6-wire Sitten drawer likely supports status feedback.');
  console.log('The challenge is reading the response through the macOS print system.');
  console.log('For full status monitoring, you might need direct serial communication.');
});
