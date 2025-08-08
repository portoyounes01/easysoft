#!/usr/bin/env node

const net = require('net');

class ThermalPrinterTester {
  constructor() {
    this.timeout = 5000;
  }

  // Test connection to a thermal printer
  async testConnection(ip, port = 9100) {
    console.log(`🔍 Testing connection to ${ip}:${port}...`);
    
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let connected = false;
      
      const timer = setTimeout(() => {
        if (!connected) {
          socket.destroy();
          reject(new Error(`Connection timeout to ${ip}:${port}`));
        }
      }, this.timeout);

      socket.on('connect', () => {
        connected = true;
        clearTimeout(timer);
        console.log(`✅ Connected to ${ip}:${port}`);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      socket.connect(port, ip);
    });
  }

  // Send test print to thermal printer
  async sendTestPrint(ip, port = 9100) {
    console.log(`🖨️ Sending test print to ${ip}:${port}...`);
    
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let connected = false;
      
      const timer = setTimeout(() => {
        if (!connected) {
          socket.destroy();
          reject(new Error(`Print timeout to ${ip}:${port}`));
        }
      }, this.timeout);

      socket.on('connect', () => {
        connected = true;
        console.log(`📡 Connected, sending test print...`);
        
        // Create ESC/POS test receipt
        const commands = this.createTestReceipt();
        const buffer = Buffer.from(commands);
        
        socket.write(buffer, () => {
          console.log(`✅ Test print sent to ${ip}:${port}`);
          clearTimeout(timer);
          socket.destroy();
          resolve(true);
        });
      });

      socket.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      socket.connect(port, ip);
    });
  }

  // Create ESC/POS commands for test receipt
  createTestReceipt() {
    const commands = [];
    
    // Initialize printer
    commands.push(0x1B, 0x40); // ESC @
    
    // Center alignment
    commands.push(0x1B, 0x61, 0x01); // ESC a 1
    
    // Bold on
    commands.push(0x1B, 0x45, 0x01); // ESC E 1
    
    // Double height
    commands.push(0x1B, 0x21, 0x10); // ESC ! 16
    
    // Test title
    const title = "NETWORK TEST";
    commands.push(...Array.from(Buffer.from(title, 'utf8')));
    commands.push(0x0A, 0x0A); // Double line feed
    
    // Normal text
    commands.push(0x1B, 0x21, 0x00); // ESC ! 0
    commands.push(0x1B, 0x45, 0x00); // ESC E 0
    
    // Left alignment
    commands.push(0x1B, 0x61, 0x00); // ESC a 0
    
    const now = new Date();
    const dateStr = `Date: ${now.toLocaleDateString()}`;
    const timeStr = `Time: ${now.toLocaleTimeString()}`;
    
    commands.push(...Array.from(Buffer.from(dateStr, 'utf8')));
    commands.push(0x0A);
    commands.push(...Array.from(Buffer.from(timeStr, 'utf8')));
    commands.push(0x0A);
    commands.push(...Array.from(Buffer.from('--------------------------------', 'utf8')));
    commands.push(0x0A);
    
    // Test content
    const testLines = [
      'Printer: NETWORK CONNECTED',
      'Status: OPERATIONAL',
      'Protocol: RAW SOCKET',
      'Port: 9100'
    ];
    
    testLines.forEach(line => {
      commands.push(...Array.from(Buffer.from(line, 'utf8')));
      commands.push(0x0A);
    });
    
    commands.push(...Array.from(Buffer.from('--------------------------------', 'utf8')));
    commands.push(0x0A);
    
    // Center alignment for footer
    commands.push(0x1B, 0x61, 0x01); // ESC a 1
    commands.push(...Array.from(Buffer.from('Network Test Complete!', 'utf8')));
    commands.push(0x0A, 0x0A, 0x0A);
    
    // Cut paper (if supported)
    commands.push(0x1D, 0x56, 0x42, 0x00); // GS V B 0
    
    return commands;
  }

  // Send status request to check if printer is responding
  async checkStatus(ip, port = 9100) {
    console.log(`📊 Checking status of ${ip}:${port}...`);
    
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let statusReceived = false;
      
      const timer = setTimeout(() => {
        if (!statusReceived) {
          socket.destroy();
          // Don't reject, just assume no status response is normal for some printers
          resolve({ status: 'no_response', message: 'Printer connected but no status response' });
        }
      }, 3000);

      socket.on('connect', () => {
        console.log(`📡 Connected, requesting status...`);
        
        // Send DLE EOT status request
        const statusCommand = Buffer.from([0x10, 0x04, 0x01]); // DLE EOT n
        socket.write(statusCommand);
      });

      socket.on('data', (data) => {
        statusReceived = true;
        clearTimeout(timer);
        console.log(`📊 Received status data: ${Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
        socket.destroy();
        resolve({ status: 'responded', data: Array.from(data) });
      });

      socket.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      socket.connect(port, ip);
    });
  }

  // Comprehensive test of a thermal printer
  async runFullTest(ip, port = 9100) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🧪 THERMAL PRINTER FULL TEST`);
    console.log(`📍 Target: ${ip}:${port}`);
    console.log(`${'='.repeat(50)}\n`);
    
    const results = {
      ip,
      port,
      connection: false,
      status: null,
      printTest: false,
      errors: []
    };
    
    try {
      // Test 1: Connection
      console.log('Test 1: Connection Test');
      await this.testConnection(ip, port);
      results.connection = true;
      console.log('✅ Connection test passed\n');
      
      // Test 2: Status check
      console.log('Test 2: Status Check');
      try {
        results.status = await this.checkStatus(ip, port);
        console.log(`✅ Status check: ${results.status.message || 'OK'}\n`);
      } catch (error) {
        console.log(`⚠️ Status check failed: ${error.message}\n`);
        results.errors.push(`Status: ${error.message}`);
      }
      
      // Test 3: Print test
      console.log('Test 3: Print Test');
      await this.sendTestPrint(ip, port);
      results.printTest = true;
      console.log('✅ Print test completed\n');
      
      console.log('🎉 All tests completed successfully!');
      
    } catch (error) {
      console.error(`❌ Test failed: ${error.message}`);
      results.errors.push(error.message);
    }
    
    // Print summary
    console.log(`\n${'='.repeat(30)}`);
    console.log('📋 TEST SUMMARY');
    console.log(`${'='.repeat(30)}`);
    console.log(`Connection: ${results.connection ? '✅' : '❌'}`);
    console.log(`Status: ${results.status ? '✅' : '⚠️'}`);
    console.log(`Print Test: ${results.printTest ? '✅' : '❌'}`);
    
    if (results.errors.length > 0) {
      console.log(`\nErrors:`);
      results.errors.forEach(error => console.log(`  ❌ ${error}`));
    }
    
    if (results.connection && results.printTest) {
      console.log(`\n🔧 To add this printer to macOS:`);
      console.log(`lpadmin -p ThermalPrinter -v socket://${ip}:${port} -E`);
    }
    
    return results;
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    console.log('Thermal Printer Network Tester');
    console.log('Usage: node test-thermal-printer.js <ip> [port]');
    console.log('');
    console.log('Examples:');
    console.log('  node test-thermal-printer.js 192.168.1.113');
    console.log('  node test-thermal-printer.js 192.168.1.113 9100');
    console.log('');
    console.log('Options:');
    console.log('  --help        Show this help');
    process.exit(0);
  }
  
  const ip = args[0];
  const port = parseInt(args[1]) || 9100;
  
  if (!ip) {
    console.error('Error: IP address is required');
    process.exit(1);
  }
  
  const tester = new ThermalPrinterTester();
  
  tester.runFullTest(ip, port)
    .then(results => {
      if (results.connection && results.printTest) {
        console.log('\n🎯 Printer is ready for use!');
        process.exit(0);
      } else {
        console.log('\n❌ Printer test failed');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = ThermalPrinterTester;
