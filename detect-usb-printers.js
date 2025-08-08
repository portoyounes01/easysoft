#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class USBPrinterDetector {
  constructor() {
    this.foundPrinters = [];
  }

  async detectUSBPrinters() {
    try {
      console.log('🔍 Detecting USB printers...');
      
      // Get USB printers from CUPS
      const { stdout } = await execAsync('lpinfo -v | grep "usb://"');
      const usbLines = stdout.trim().split('\n').filter(line => line.trim());
      
      this.foundPrinters = [];
      
      for (const line of usbLines) {
        const printer = this.parseUSBLine(line);
        if (printer) {
          console.log(`✅ Found USB printer: ${printer.brand} ${printer.model}`);
          this.foundPrinters.push(printer);
        }
      }
      
      return this.foundPrinters;
    } catch (error) {
      console.log('❌ No USB printers found');
      return [];
    }
  }

  parseUSBLine(line) {
    // Parse line like: direct usb://HPRT/TP80K?serial=TP80K023251289
    const match = line.match(/usb:\/\/([^\/]+)\/([^?]+)\?serial=(.+)/);
    if (match) {
      const [, brand, model, serial] = match;
      return {
        type: 'usb',
        brand,
        model,
        serial,
        uri: line.replace('direct ', ''),
        isThermal: this.isThermalPrinter(brand, model),
        recommended: this.isThermalPrinter(brand, model)
      };
    }
    return null;
  }

  isThermalPrinter(brand, model) {
    const thermalBrands = ['HPRT', 'Zebra', 'Citizen', 'Star', 'Bixolon', 'Xprinter'];
    return thermalBrands.some(b => brand.toUpperCase().includes(b.toUpperCase()));
  }

  async setupUSBPrinter(printer, printerName = null) {
    const name = printerName || `${printer.brand}_${printer.model}_USB`;
    
    try {
      console.log(`🔧 Setting up USB printer: ${name}`);
      
      // Remove existing printer
      try {
        await execAsync(`lpadmin -x "${name}"`);
        console.log(`🗑️ Removed existing printer: ${name}`);
      } catch (error) {
        // Printer doesn't exist
      }
      
      // Add USB printer
      const command = `lpadmin -p "${name}" -v "${printer.uri}" -E`;
      await execAsync(command);
      console.log(`✅ USB printer added: ${name}`);
      
      // Check status
      const { stdout } = await execAsync(`lpstat -p "${name}"`);
      console.log(`📋 Status: ${stdout.trim()}`);
      
      return {
        success: true,
        printerName: name,
        message: `USB printer ${name} setup successfully`
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async testPrint(printerName) {
    try {
      const testCommand = `echo "USB printer test - $(date)" | lp -d "${printerName}"`;
      const { stdout } = await execAsync(testCommand);
      console.log(`✅ Test print sent: ${stdout.trim()}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// CLI usage
if (require.main === module) {
  const detector = new USBPrinterDetector();
  
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log('USB Printer Detector');
    console.log('Usage: node detect-usb-printers.js [--setup] [--name <name>]');
    console.log('Options:');
    console.log('  --setup     Auto-setup first thermal printer found');
    console.log('  --name      Custom printer name');
    process.exit(0);
  }
  
  detector.detectUSBPrinters()
    .then(async (printers) => {
      if (printers.length === 0) {
        console.log('❌ No USB printers found');
        process.exit(1);
      }
      
      console.log(`\n📋 Found ${printers.length} USB printer(s):`);
      printers.forEach((p, i) => {
        console.log(`${i + 1}. ${p.brand} ${p.model} (${p.isThermal ? 'Thermal' : 'Standard'})`);
        console.log(`   Serial: ${p.serial}`);
        console.log(`   URI: ${p.uri}`);
      });
      
      if (args.includes('--setup')) {
        const thermal = printers.find(p => p.isThermal) || printers[0];
        const nameIndex = args.indexOf('--name');
        const customName = nameIndex !== -1 ? args[nameIndex + 1] : null;
        
        const result = await detector.setupUSBPrinter(thermal, customName);
        if (result.success) {
          console.log(`\n🎉 ${result.message}`);
          console.log(`🖨️ Use: lp -d "${result.printerName}"`);
        } else {
          console.log(`\n❌ Setup failed: ${result.error}`);
          process.exit(1);
        }
      }
    })
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}

module.exports = USBPrinterDetector;
