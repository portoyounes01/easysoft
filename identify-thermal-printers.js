#!/usr/bin/env node

const net = require('net');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class ThermalPrinterIdentifier {
  constructor() {
    this.timeout = 3000;
  }

  // Send specific ESC/POS commands to identify thermal printer characteristics
  async identifyThermalPrinter(ip, port = 9100) {
    console.log(`🔍 Identifying thermal printer at ${ip}:${port}...`);
    
    try {
      // Test 1: Basic connectivity
      const connected = await this.testConnection(ip, port);
      if (!connected) {
        return { success: false, error: 'Connection failed' };
      }

      // Test 2: Send printer status requests
      const info = await this.getPrinterInfo(ip, port);
      
      // Test 3: Check if it responds to thermal printer commands
      const thermalTest = await this.testThermalCommands(ip, port);
      
      // Test 4: Try to get printer self-identification
      const selfId = await this.getPrinterSelfIdentification(ip, port);
      
      return {
        success: true,
        ip,
        port,
        info,
        thermalTest,
        selfId,
        isThermal: thermalTest.success,
        confidence: this.calculateConfidence(info, thermalTest, selfId)
      };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async testConnection(ip, port) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, this.timeout);

      socket.on('connect', () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });

      socket.connect(port, ip);
    });
  }

  async getPrinterInfo(ip, port) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let responseData = [];
      
      const timer = setTimeout(() => {
        socket.destroy();
        resolve({ statusResponse: responseData, type: 'timeout' });
      }, this.timeout);

      socket.on('connect', () => {
        // Send different status requests
        const commands = [
          [0x10, 0x04, 0x01], // DLE EOT 1 (printer status)
          [0x10, 0x04, 0x02], // DLE EOT 2 (offline status)
          [0x10, 0x04, 0x03], // DLE EOT 3 (error status)
          [0x10, 0x04, 0x04], // DLE EOT 4 (paper sensor status)
        ];
        
        commands.forEach((cmd, i) => {
          setTimeout(() => {
            if (!socket.destroyed) {
              socket.write(Buffer.from(cmd));
            }
          }, i * 100);
        });
      });

      socket.on('data', (data) => {
        responseData.push(...Array.from(data));
      });

      socket.on('error', () => {
        clearTimeout(timer);
        resolve({ statusResponse: [], type: 'error' });
      });

      socket.on('close', () => {
        clearTimeout(timer);
        resolve({ statusResponse: responseData, type: 'closed' });
      });

      socket.connect(port, ip);
    });
  }

  async testThermalCommands(ip, port) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let successful = false;
      
      const timer = setTimeout(() => {
        socket.destroy();
        resolve({ success: successful, type: 'timeout' });
      }, this.timeout);

      socket.on('connect', () => {
        // Send thermal-specific commands that should work on thermal printers
        const thermalCommands = [
          // Initialize printer
          [0x1B, 0x40], // ESC @
          
          // Test paper feed (small amount)
          [0x1B, 0x64, 0x01], // ESC d 1 (feed 1 line)
          
          // Test if it responds to thermal printer status
          [0x10, 0x04, 0x01], // DLE EOT 1
        ];
        
        let commandIndex = 0;
        const sendNextCommand = () => {
          if (commandIndex < thermalCommands.length && !socket.destroyed) {
            socket.write(Buffer.from(thermalCommands[commandIndex]));
            commandIndex++;
            setTimeout(sendNextCommand, 200);
          }
        };
        
        sendNextCommand();
        successful = true; // If we can send commands without error, it's likely thermal
      });

      socket.on('data', (data) => {
        // Any response indicates it's accepting thermal commands
        successful = true;
      });

      socket.on('error', () => {
        clearTimeout(timer);
        resolve({ success: false, type: 'error' });
      });

      socket.on('close', () => {
        clearTimeout(timer);
        resolve({ success: successful, type: 'completed' });
      });

      socket.connect(port, ip);
    });
  }

  async getPrinterSelfIdentification(ip, port) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let identificationData = [];
      
      const timer = setTimeout(() => {
        socket.destroy();
        resolve({ data: identificationData, identified: false });
      }, this.timeout);

      socket.on('connect', () => {
        // Send commands that might return printer identification
        const idCommands = [
          // Request printer ID (HPRT specific)
          [0x1D, 0x49, 0x01], // GS I 1 (printer ID)
          [0x1D, 0x49, 0x02], // GS I 2 (type ID)
          [0x1D, 0x49, 0x03], // GS I 3 (version ID)
          
          // Alternative identification
          [0x1B, 0x29, 0x49, 0x01, 0x00, 0x31], // Get printer info
        ];
        
        idCommands.forEach((cmd, i) => {
          setTimeout(() => {
            if (!socket.destroyed) {
              socket.write(Buffer.from(cmd));
            }
          }, i * 300);
        });
      });

      socket.on('data', (data) => {
        identificationData.push(...Array.from(data));
      });

      socket.on('error', () => {
        clearTimeout(timer);
        resolve({ data: [], identified: false });
      });

      socket.on('close', () => {
        clearTimeout(timer);
        const identified = identificationData.length > 0;
        const text = this.parseIdentificationData(identificationData);
        resolve({ data: identificationData, identified, text });
      });

      socket.connect(port, ip);
    });
  }

  parseIdentificationData(data) {
    if (data.length === 0) return null;
    
    // Convert to string and look for readable text
    const text = data
      .filter(byte => byte >= 32 && byte <= 126) // Printable ASCII
      .map(byte => String.fromCharCode(byte))
      .join('');
    
    if (text.length > 3) {
      return text.trim();
    }
    
    return null;
  }

  calculateConfidence(info, thermalTest, selfId) {
    let confidence = 0;
    
    // Base confidence for responding to status requests
    if (info.statusResponse && info.statusResponse.length > 0) {
      confidence += 30;
    }
    
    // High confidence for accepting thermal commands
    if (thermalTest.success) {
      confidence += 50;
    }
    
    // Bonus for self-identification
    if (selfId.identified) {
      confidence += 20;
      
      // Check for known thermal printer brands in identification
      const text = selfId.text || '';
      if (/HPRT|Hanprint/i.test(text)) {
        confidence += 30;
        selfId.brand = 'HPRT';
      } else if (/CITIZEN/i.test(text)) {
        confidence += 25;
        selfId.brand = 'CITIZEN';
      } else if (/BIXOLON/i.test(text)) {
        confidence += 25;
        selfId.brand = 'BIXOLON';
      } else if (/STAR/i.test(text)) {
        confidence += 25;
        selfId.brand = 'STAR';
      }
    }
    
    return Math.min(confidence, 100);
  }

  async identifyMultiplePrinters(printers) {
    console.log(`🔍 Identifying ${printers.length} printers...\n`);
    
    const results = [];
    
    for (const printer of printers) {
      const result = await this.identifyThermalPrinter(printer.ip, printer.port);
      results.push({ ...printer, ...result });
      
      if (result.success) {
        console.log(`✅ ${printer.ip}:${printer.port} - Confidence: ${result.confidence}%`);
        if (result.selfId && result.selfId.brand) {
          console.log(`   Brand: ${result.selfId.brand}`);
        }
        if (result.selfId && result.selfId.text) {
          console.log(`   ID: ${result.selfId.text}`);
        }
      } else {
        console.log(`❌ ${printer.ip}:${printer.port} - ${result.error}`);
      }
      console.log('');
    }
    
    // Sort by confidence
    results.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    
    return results;
  }

  printResults(results) {
    console.log('='.repeat(60));
    console.log('🏷️  THERMAL PRINTER IDENTIFICATION RESULTS');
    console.log('='.repeat(60));
    
    const successfulResults = results.filter(r => r.success);
    
    if (successfulResults.length === 0) {
      console.log('❌ No printers could be identified');
      return;
    }
    
    successfulResults.forEach((result, index) => {
      const confidenceIcon = result.confidence >= 80 ? '🔥' : result.confidence >= 60 ? '⭐' : '📄';
      
      console.log(`\n${confidenceIcon} ${index + 1}. ${result.ip}:${result.port}`);
      console.log(`   Confidence: ${result.confidence}% ${result.isThermal ? '(THERMAL)' : '(UNKNOWN)'}`);
      
      if (result.selfId && result.selfId.brand) {
        console.log(`   Brand: ${result.selfId.brand}`);
      }
      
      if (result.selfId && result.selfId.text) {
        console.log(`   Identification: ${result.selfId.text}`);
      }
      
      if (result.info && result.info.statusResponse.length > 0) {
        console.log(`   Status Response: [${result.info.statusResponse.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}]`);
      }
      
      console.log(`   Thermal Commands: ${result.thermalTest.success ? '✅ Accepted' : '❌ Failed'}`);
    });
    
    // Recommend the best thermal printer
    const bestThermal = successfulResults.find(r => r.confidence >= 70 && r.isThermal);
    if (bestThermal) {
      console.log(`\n🎯 RECOMMENDED THERMAL PRINTER:`);
      console.log(`   ${bestThermal.ip}:${bestThermal.port}`);
      console.log(`   Confidence: ${bestThermal.confidence}%`);
      if (bestThermal.selfId && bestThermal.selfId.brand) {
        console.log(`   Brand: ${bestThermal.selfId.brand}`);
      }
      console.log(`   Setup: lpadmin -p ThermalPrinter -v socket://${bestThermal.ip}:${bestThermal.port} -E`);
    }
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.length === 0) {
    console.log('Thermal Printer Identifier');
    console.log('Usage: node identify-thermal-printers.js <ip1> [ip2] [ip3] ...');
    console.log('       node identify-thermal-printers.js <ip>:<port>');
    console.log('');
    console.log('Examples:');
    console.log('  node identify-thermal-printers.js 192.168.1.113 192.168.1.19');
    console.log('  node identify-thermal-printers.js 192.168.1.113:9100');
    console.log('');
    console.log('This tool will test each printer to determine if it\'s a thermal printer');
    console.log('and try to identify the brand/model.');
    process.exit(0);
  }
  
  const identifier = new ThermalPrinterIdentifier();
  
  // Parse IP addresses and ports
  const printers = args.map(arg => {
    if (arg.includes(':')) {
      const [ip, port] = arg.split(':');
      return { ip, port: parseInt(port) };
    } else {
      return { ip: arg, port: 9100 };
    }
  });
  
  identifier.identifyMultiplePrinters(printers)
    .then(results => {
      identifier.printResults(results);
      
      const bestThermal = results.find(r => r.success && r.confidence >= 70);
      if (bestThermal) {
        process.exit(0);
      } else {
        console.log('\n❌ No high-confidence thermal printers found');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Identification failed:', error);
      process.exit(1);
    });
}

module.exports = ThermalPrinterIdentifier;
