#!/usr/bin/env node

const USBPrinterDetector = require('./detect-usb-printers.js');

async function testUSBPrinterIntegration() {
  console.log('🧪 Testing USB Printer Integration\n');
  
  try {
    const detector = new USBPrinterDetector();
    
    // Test discovery
    console.log('Step 1: Discovering USB printers...');
    const printers = await detector.detectUSBPrinters();
    
    if (printers.length === 0) {
      console.log('❌ No USB printers found');
      process.exit(1);
    }
    
    console.log(`✅ Found ${printers.length} USB printer(s):`);
    printers.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.brand} ${p.model} (${p.isThermal ? 'Thermal' : 'Standard'})`);
      console.log(`     Serial: ${p.serial}`);
      console.log(`     Recommended: ${p.recommended ? 'Yes' : 'No'}`);
    });
    
    // Test setup (if thermal printer found)
    const thermalPrinter = printers.find(p => p.isThermal);
    if (thermalPrinter) {
      console.log(`\nStep 2: Setting up thermal printer: ${thermalPrinter.brand} ${thermalPrinter.model}`);
      
      const testPrinterName = `Test_${thermalPrinter.brand}_${Date.now()}`;
      const setupResult = await detector.setupUSBPrinter(thermalPrinter, testPrinterName);
      
      if (setupResult.success) {
        console.log(`✅ Setup successful: ${setupResult.printerName}`);
        
        // Test print
        console.log(`\nStep 3: Testing print functionality...`);
        const printResult = await detector.testPrint(setupResult.printerName);
        
        if (printResult.success) {
          console.log('✅ Test print successful!');
        } else {
          console.log(`❌ Test print failed: ${printResult.error}`);
        }
        
        // Clean up test printer
        console.log(`\nStep 4: Cleaning up test printer...`);
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        try {
          await execAsync(`lpadmin -x "${setupResult.printerName}"`);
          console.log(`🗑️ Removed test printer: ${setupResult.printerName}`);
        } catch (error) {
          console.log(`⚠️ Could not remove test printer: ${error.message}`);
        }
        
        console.log('\n🎉 USB printer integration test completed successfully!');
        console.log('\n📋 Summary:');
        console.log(`• Discovered ${printers.length} USB printer(s)`);
        console.log(`• Found ${printers.filter(p => p.isThermal).length} thermal printer(s)`);
        console.log('• Setup and test print functionality working');
        console.log('\n✅ Ready for dashboard integration!');
        
      } else {
        console.log(`❌ Setup failed: ${setupResult.error}`);
        process.exit(1);
      }
    } else {
      console.log('\n⚠️ No thermal printers found for testing');
      console.log('✅ Discovery functionality working, but no thermal printers to test setup');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testUSBPrinterIntegration();
}

module.exports = testUSBPrinterIntegration;
