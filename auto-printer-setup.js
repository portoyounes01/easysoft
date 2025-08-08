#!/usr/bin/env node

const NetworkPrinterDiscovery = require('./discover-network-printers.js');
const ThermalPrinterTester = require('./test-thermal-printer.js');
const ThermalPrinterIdentifier = require('./identify-thermal-printers.js');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class AutoPrinterSetup {
  constructor() {
    this.discovery = new NetworkPrinterDiscovery();
    this.tester = new ThermalPrinterTester();
    this.identifier = new ThermalPrinterIdentifier();
  }

  async autoSetup(options = {}) {
    console.log('🚀 Starting automatic thermal printer setup...\n');
    
    try {
      // Step 1: Discover printers
      console.log('=== Step 1: Discovering Printers ===');
      const printers = await this.discovery.discoverPrinters({ skipNetworkScan: false });
      
      if (printers.length === 0) {
        console.log('❌ No printers found. Please check:');
        console.log('1. Printer is powered on');
        console.log('2. Network cable is connected');
        console.log('3. Printer and computer are on same network');
        return { success: false, error: 'No printers found' };
      }
      
      // Step 2: Filter and identify thermal printers
      console.log('\n=== Step 2: Identifying Thermal Printers ===');
      const thermalPrinters = printers.filter(p => p.verified && (p.port === 9100 || p.likelyThermal));
      
      if (thermalPrinters.length === 0) {
        console.log('❌ No thermal printers found on port 9100');
        console.log('Found printers:');
        printers.forEach(p => {
          console.log(`  ${p.ip}:${p.port} (${p.protocol})`);
        });
        return { success: false, error: 'No thermal printers found' };
      }
      
      console.log(`✅ Found ${thermalPrinters.length} potential thermal printer(s):`);
      thermalPrinters.forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.ip}:${p.port}`);
      });
      
      // Step 3: Identify which is the best thermal printer
      console.log('\n=== Step 3: Thermal Printer Identification ===');
      const identificationResults = await this.identifier.identifyMultiplePrinters(thermalPrinters);
      
      // Sort by confidence
      const sortedResults = identificationResults
        .filter(r => r.success)
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      
      if (sortedResults.length === 0) {
        return { success: false, error: 'Could not identify any thermal printers' };
      }
      
      // Step 4: Setup the best thermal printer
      console.log('\n=== Step 4: Setting Up Best Thermal Printer ===');
      
      const bestPrinter = sortedResults[0];
      console.log(`🎯 Selected printer: ${bestPrinter.ip}:${bestPrinter.port} (${bestPrinter.confidence}% confidence)`);
      
      if (bestPrinter.selfId && bestPrinter.selfId.brand) {
        console.log(`📋 Brand: ${bestPrinter.selfId.brand}`);
      }
      
      // Test the selected printer
      const testResult = await this.tester.runFullTest(bestPrinter.ip, bestPrinter.port);
      
      if (testResult.connection && testResult.printTest) {
        console.log(`\n✅ Printer ${bestPrinter.ip}:${bestPrinter.port} is working!`);
        
        // Setup printer in macOS
        const printerName = bestPrinter.selfId && bestPrinter.selfId.brand 
          ? `${bestPrinter.selfId.brand}_Thermal`
          : options.printerName || 'ThermalPrinter_Auto';
          
        const setupResult = await this.setupPrinter(bestPrinter, { ...options, printerName });
        if (setupResult.success) {
          return {
            success: true,
            printer: bestPrinter,
            printerName: setupResult.printerName,
            confidence: bestPrinter.confidence,
            brand: bestPrinter.selfId && bestPrinter.selfId.brand,
            message: `Thermal printer setup completed: ${setupResult.printerName} (${bestPrinter.confidence}% confidence)`
          };
        } else {
          console.log(`❌ Failed to setup printer: ${setupResult.error}`);
        }
      } else {
        console.log(`❌ Printer ${bestPrinter.ip}:${bestPrinter.port} test failed`);
      }
      
      return { success: false, error: 'No working thermal printers found' };
      
    } catch (error) {
      console.error('Auto setup failed:', error);
      return { success: false, error: error.message };
    }
  }

  async setupPrinter(printer, options = {}) {
    const printerName = options.printerName || `HPRT_Auto_${printer.ip.replace(/\./g, '_')}`;
    
    try {
      console.log(`\n🔧 Setting up printer as: ${printerName}`);
      
      // Remove existing printer with same name
      try {
        await execAsync(`lpadmin -x "${printerName}"`);
        console.log(`🗑️ Removed existing printer: ${printerName}`);
      } catch (error) {
        // Printer doesn't exist, that's fine
      }
      
      // Add new printer
      const command = `lpadmin -p "${printerName}" -v socket://${printer.ip}:${printer.port} -E`;
      await execAsync(command);
      
      console.log(`✅ Printer added: ${printerName}`);
      
      // Verify it was added
      const { stdout } = await execAsync(`lpstat -p "${printerName}"`);
      console.log(`📋 Status: ${stdout.trim()}`);
      
      // Send a test print
      if (!options.skipTestPrint) {
        console.log(`🖨️ Sending verification test print...`);
        const testCommand = `echo "Auto-setup test print - $(date)" | lp -d "${printerName}"`;
        const { stdout: jobInfo } = await execAsync(testCommand);
        console.log(`✅ Test print queued: ${jobInfo.trim()}`);
      }
      
      return {
        success: true,
        printerName,
        command: `lp -d "${printerName}"`
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Quick setup for known IP
  async quickSetup(ip, port = 9100, printerName = null) {
    console.log(`🚀 Quick setup for ${ip}:${port}...\n`);
    
    try {
      // Test the printer first
      const testResult = await this.tester.runFullTest(ip, port);
      
      if (!testResult.connection || !testResult.printTest) {
        return {
          success: false,
          error: 'Printer test failed'
        };
      }
      
      // Setup the printer
      const printer = { ip, port, protocol: 'raw', verified: true };
      const setupResult = await this.setupPrinter(printer, { printerName });
      
      return setupResult;
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log('Automatic Thermal Printer Setup');
    console.log('Usage:');
    console.log('  node auto-printer-setup.js                    # Auto-discover and setup');
    console.log('  node auto-printer-setup.js <ip>               # Quick setup for known IP');
    console.log('  node auto-printer-setup.js <ip> <port>        # Quick setup with custom port');
    console.log('');
    console.log('Options:');
    console.log('  --name <name>     Custom printer name');
    console.log('  --skip-test       Skip test print');
    console.log('  --help           Show this help');
    process.exit(0);
  }
  
  const setup = new AutoPrinterSetup();
  
  // Parse options
  const options = {
    printerName: null,
    skipTestPrint: args.includes('--skip-test')
  };
  
  const nameIndex = args.indexOf('--name');
  if (nameIndex !== -1 && args[nameIndex + 1]) {
    options.printerName = args[nameIndex + 1];
  }
  
  // Filter out option flags
  const positionalArgs = args.filter(arg => !arg.startsWith('--') && arg !== options.printerName);
  
  if (positionalArgs.length === 0) {
    // Auto discovery mode
    setup.autoSetup(options)
      .then(result => {
        if (result.success) {
          console.log(`\n🎉 SUCCESS: ${result.message}`);
          console.log(`🖨️ Use this command to print: lp -d "${result.printerName}"`);
          process.exit(0);
        } else {
          console.log(`\n❌ FAILED: ${result.error}`);
          process.exit(1);
        }
      })
      .catch(error => {
        console.error('Setup failed:', error);
        process.exit(1);
      });
  } else {
    // Quick setup mode
    const ip = positionalArgs[0];
    const port = parseInt(positionalArgs[1]) || 9100;
    
    setup.quickSetup(ip, port, options.printerName)
      .then(result => {
        if (result.success) {
          console.log(`\n🎉 SUCCESS: Printer setup completed: ${result.printerName}`);
          console.log(`🖨️ Use this command to print: ${result.command}`);
          process.exit(0);
        } else {
          console.log(`\n❌ FAILED: ${result.error}`);
          process.exit(1);
        }
      })
      .catch(error => {
        console.error('Quick setup failed:', error);
        process.exit(1);
      });
  }
}

module.exports = AutoPrinterSetup;
