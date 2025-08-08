#!/usr/bin/env node

const net = require('net');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class NetworkPrinterDiscovery {
  constructor() {
    this.foundPrinters = [];
    this.commonPorts = [9100, 515, 631, 9101, 9102, 9103]; // Common printer ports
    this.timeout = 2000; // 2 seconds timeout
  }

  // Get the local network range
  async getNetworkRange() {
    try {
      const { stdout } = await execAsync('ifconfig | grep "inet " | grep -v 127.0.0.1');
      const lines = stdout.trim().split('\n');
      
      for (const line of lines) {
        const match = line.match(/inet (\d+\.\d+\.\d+\.\d+) netmask (0x[a-f0-9]+)/);
        if (match) {
          const ip = match[1];
          const netmask = match[2];
          
          // Convert hex netmask to CIDR
          const cidr = this.hexToCidr(netmask);
          const networkBase = this.getNetworkBase(ip, cidr);
          
          if (!ip.startsWith('169.254') && networkBase !== '127.0.0.0') {
            console.log(`📡 Detected network: ${networkBase}/${cidr} (Your IP: ${ip})`);
            return { ip, networkBase, cidr };
          }
        }
      }
      
      // Fallback to common ranges
      return { ip: '192.168.1.35', networkBase: '192.168.1.0', cidr: 24 };
    } catch (error) {
      console.error('Error detecting network:', error.message);
      return { ip: '192.168.1.35', networkBase: '192.168.1.0', cidr: 24 };
    }
  }

  hexToCidr(hexMask) {
    const num = parseInt(hexMask, 16);
    return num.toString(2).split('1').length - 1;
  }

  getNetworkBase(ip, cidr) {
    const ipParts = ip.split('.').map(Number);
    const mask = (0xFFFFFFFF << (32 - cidr)) >>> 0;
    const ipNum = (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3];
    const networkNum = (ipNum & mask) >>> 0;
    
    return [
      (networkNum >>> 24) & 0xFF,
      (networkNum >>> 16) & 0xFF,
      (networkNum >>> 8) & 0xFF,
      networkNum & 0xFF
    ].join('.');
  }

  // Generate IP range for scanning
  generateIPRange(networkBase, cidr) {
    const baseParts = networkBase.split('.').map(Number);
    const hostBits = 32 - cidr;
    const maxHosts = Math.min(254, (1 << hostBits) - 2); // Avoid broadcast and network addresses
    
    const ips = [];
    for (let i = 1; i <= maxHosts; i++) {
      if (cidr >= 24) {
        // /24 or smaller - scan last octet
        ips.push(`${baseParts[0]}.${baseParts[1]}.${baseParts[2]}.${i}`);
      } else if (cidr >= 16) {
        // /16 to /23 - scan last two octets (limited)
        for (let j = 0; j < Math.min(4, 256); j++) {
          for (let k = 1; k < Math.min(51, 255); k++) {
            ips.push(`${baseParts[0]}.${baseParts[1]}.${j}.${k}`);
          }
        }
        break;
      }
    }
    
    return ips.slice(0, 254); // Limit scan to prevent overload
  }

  // Test if a port is open on a specific IP
  async testPort(ip, port) {
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

  // Test if device responds to printer commands
  async testPrinterResponse(ip, port) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let isResponding = false;
      
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, this.timeout);

      socket.on('connect', () => {
        // Send ESC/POS status request
        const statusCommand = Buffer.from([0x10, 0x04, 0x01]); // DLE EOT n (printer status)
        socket.write(statusCommand);
        
        // Set a short timeout for response
        setTimeout(() => {
          if (!isResponding) {
            clearTimeout(timer);
            socket.destroy();
            resolve(true); // Assume it's a printer if it accepts connection
          }
        }, 500);
      });

      socket.on('data', (data) => {
        isResponding = true;
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

  // Discover printers using mDNS/Bonjour
  async discoverBonjour() {
    try {
      console.log('🔍 Scanning for Bonjour printers...');
      
      // Scan for different printer service types
      const serviceTypes = ['_ipp._tcp', '_printer._tcp', '_pdl-datastream._tcp'];
      const discoveries = [];
      
      for (const serviceType of serviceTypes) {
        try {
          const { stdout } = await execAsync(`timeout 3 dns-sd -B ${serviceType} | grep -v "Browsing for" | grep -v "DATE:"`, { timeout: 4000 });
          if (stdout.trim()) {
            discoveries.push({ serviceType, result: stdout.trim() });
          }
        } catch (error) {
          // Timeout or no results - continue
        }
      }
      
      return discoveries;
    } catch (error) {
      console.log('❌ Bonjour discovery failed:', error.message);
      return [];
    }
  }

  // Try to detect printer brand/model via HTTP interface
  async detectPrinterInfo(printer) {
    // First, try to get info via HTTP (many printers have web interfaces)
    await this.tryHttpDetection(printer);
    
    // Try SNMP detection
    await this.trySnmpDetection(printer);
    
    // Mark thermal printer characteristics
    if (printer.port === 9100) {
      printer.likelyThermal = true;
      printer.notes = 'Raw socket (common for thermal printers)';
      
      // Check if it's a known thermal printer brand based on behavior
      if (printer.brand && this.isThermalBrand(printer.brand)) {
        printer.confirmed = 'thermal';
        printer.priority = 10; // High priority for confirmed thermal
      } else {
        printer.priority = 5; // Medium priority for port 9100
      }
    } else if (printer.port === 515) {
      printer.notes = 'LPD protocol';
      printer.priority = 2;
    } else if (printer.port === 631) {
      printer.notes = 'IPP protocol';
      printer.priority = 3;
    } else {
      printer.priority = 1;
    }
  }

  // Try to detect via HTTP interface
  async tryHttpDetection(printer) {
    const httpPorts = [80, 443, 8080, 631];
    
    for (const httpPort of httpPorts) {
      try {
        // Check if HTTP port is open
        const isOpen = await this.testPort(printer.ip, httpPort);
        if (isOpen) {
          const protocol = httpPort === 443 ? 'https' : 'http';
          const url = `${protocol}://${printer.ip}:${httpPort}`;
          
          try {
            // Try to get printer info via HTTP
            const info = await this.fetchPrinterInfo(url);
            if (info) {
              printer.brand = info.brand;
              printer.model = info.model;
              printer.webInterface = url;
              console.log(`📋 Detected: ${printer.ip} - ${info.brand} ${info.model}`);
              return true;
            }
          } catch (error) {
            // Continue to next port
          }
        }
      } catch (error) {
        // Continue to next port
      }
    }
    
    return false;
  }

  // Fetch printer info from web interface
  async fetchPrinterInfo(url) {
    try {
      const { stdout } = await execAsync(`curl -s --max-time 3 "${url}" 2>/dev/null | head -20`, { timeout: 4000 });
      
      const html = stdout.toLowerCase();
      
      // Common printer brand patterns
      const brandPatterns = {
        'hprt': /hprt|hanprint/,
        'epson': /epson/,
        'brother': /brother/,
        'canon': /canon/,
        'hp': /hewlett.?packard|hp\b/,
        'zebra': /zebra/,
        'citizen': /citizen/,
        'star': /star\s+micronics|star\s+tsp/,
        'bixolon': /bixolon/,
        'pos-x': /pos-x|posx/,
        'rongta': /rongta/,
        'xprinter': /xprinter/
      };
      
      for (const [brand, pattern] of Object.entries(brandPatterns)) {
        if (pattern.test(html)) {
          // Try to extract model from title or content
          const modelMatch = html.match(new RegExp(`${brand}[\\s-]*([a-z0-9\\-]+)`, 'i'));
          const model = modelMatch ? modelMatch[1] : 'Unknown Model';
          
          return { brand: brand.toUpperCase(), model };
        }
      }
      
      // Generic model extraction
      const titleMatch = html.match(/<title[^>]*>([^<]+)</i);
      if (titleMatch) {
        const title = titleMatch[1].trim();
        if (title.length > 0 && title.length < 100) {
          return { brand: 'Unknown', model: title };
        }
      }
      
    } catch (error) {
      // Silent fail
    }
    
    return null;
  }

  // Try SNMP detection (basic)
  async trySnmpDetection(printer) {
    try {
      // Try to get system description via SNMP (if available)
      const { stdout } = await execAsync(`timeout 3 snmpget -v1 -c public ${printer.ip} 1.3.6.1.2.1.1.1.0 2>/dev/null`, { timeout: 4000 });
      
      if (stdout.trim()) {
        const description = stdout.replace(/.*STRING:\s*/, '').replace(/"/g, '').trim();
        if (description.length > 0) {
          printer.snmpDescription = description;
          
          // Extract brand from SNMP description
          const brandMatch = description.match(/(HPRT|Epson|Brother|Canon|HP|Zebra|Citizen|Star|Bixolon|POS-X|Rongta|Xprinter)/i);
          if (brandMatch && !printer.brand) {
            printer.brand = brandMatch[1].toUpperCase();
            console.log(`📋 SNMP detected: ${printer.ip} - ${printer.brand} (${description})`);
          }
        }
      }
    } catch (error) {
      // SNMP not available or failed - that's okay
    }
  }

  // Check if brand is known thermal printer manufacturer
  isThermalBrand(brand) {
    const thermalBrands = ['HPRT', 'ZEBRA', 'CITIZEN', 'STAR', 'BIXOLON', 'POS-X', 'RONGTA', 'XPRINTER'];
    return thermalBrands.includes(brand.toUpperCase());
  }

  // Discover printers using CUPS lpinfo
  async discoverCUPS() {
    try {
      console.log('🔍 Scanning CUPS discovered printers...');
      const { stdout } = await execAsync('lpinfo -v');
      
      const networkPrinters = stdout.split('\n')
        .filter(line => line.includes('network'))
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      return networkPrinters;
    } catch (error) {
      console.log('❌ CUPS discovery failed:', error.message);
      return [];
    }
  }

  // Main discovery function
  async discoverPrinters(options = {}) {
    console.log('🚀 Starting automatic printer discovery...\n');
    
    this.foundPrinters = [];
    
    // 1. Try Bonjour/mDNS discovery first (fastest)
    console.log('=== Phase 1: Bonjour/mDNS Discovery ===');
    const bonjourResults = await this.discoverBonjour();
    if (bonjourResults.length > 0) {
      console.log('📡 Found Bonjour services:');
      bonjourResults.forEach(result => {
        console.log(`  ${result.serviceType}: ${result.result}`);
      });
    } else {
      console.log('❌ No Bonjour printers found');
    }
    
    // 2. Try CUPS discovery and verify
    console.log('\n=== Phase 2: CUPS Discovery ===');
    const cupsResults = await this.discoverCUPS();
    if (cupsResults.length > 0) {
      console.log('📋 Found CUPS network printers:');
      for (const uri of cupsResults) {
        console.log(`  ${uri}`);
        // Parse socket URI for host and port
        const match = uri.match(/socket:\/\/([\d\.]+):(\d+)/);
        if (match) {
          const ip = match[1];
          const port = parseInt(match[2], 10);
          // Queue for verification
          this.foundPrinters.push({ ip, port, type: 'network', protocol: 'raw', verified: false });
        }
      }
    } else {
      console.log('❌ No CUPS network printers found');
    }
    
    // 3. Network scanning (if enabled)
    if (!options.skipNetworkScan) {
      console.log('\n=== Phase 3: Network Port Scanning ===');
      await this.scanNetwork();
    }
    
    // 4. Verify found printers
    if (this.foundPrinters.length > 0) {
      console.log('\n=== Phase 4: Printer Verification ===');
      await this.verifyPrinters();
    }
    
    return this.foundPrinters;
  }

  async scanNetwork() {
    try {
      const network = await this.getNetworkRange();
      const ips = this.generateIPRange(network.networkBase, network.cidr);
      
      console.log(`📡 Scanning ${ips.length} IPs for printer ports...`);
      console.log(`   Network: ${network.networkBase}/${network.cidr}`);
      console.log(`   Ports: ${this.commonPorts.join(', ')}`);
      
      const batchSize = 20; // Scan in batches to avoid overwhelming the network
      
      for (let i = 0; i < ips.length; i += batchSize) {
        const batch = ips.slice(i, i + batchSize);
        const promises = [];
        
        for (const ip of batch) {
          for (const port of this.commonPorts) {
            promises.push(this.scanIPPort(ip, port));
          }
        }
        
        const results = await Promise.all(promises);
        const progress = Math.round(((i + batchSize) / ips.length) * 100);
        process.stdout.write(`\r   Progress: ${Math.min(progress, 100)}%`);
      }
      
      console.log('\n');
      
      if (this.foundPrinters.length === 0) {
        console.log('❌ No printers found via network scan');
      }
      
    } catch (error) {
      console.error('Network scan error:', error.message);
    }
  }

  async scanIPPort(ip, port) {
    try {
      const isOpen = await this.testPort(ip, port);
      if (isOpen) {
        console.log(`\n🔍 Found open port: ${ip}:${port}`);
        
        // Test if it's actually a printer
        const isPrinter = await this.testPrinterResponse(ip, port);
        if (isPrinter) {
          this.foundPrinters.push({
            ip,
            port,
            type: 'network',
            protocol: port === 9100 ? 'raw' : port === 515 ? 'lpd' : port === 631 ? 'ipp' : 'unknown',
            verified: false
          });
          console.log(`✅ Potential printer found: ${ip}:${port}`);
        }
      }
    } catch (error) {
      // Silent fail for individual IP/port combinations
    }
  }

  async verifyPrinters() {
    console.log(`🔍 Verifying ${this.foundPrinters.length} potential printers...`);
    
    for (const printer of this.foundPrinters) {
      try {
        console.log(`\n📡 Testing printer at ${printer.ip}:${printer.port}...`);
        
        // Try to send a simple status request
        const verified = await this.testPrinterResponse(printer.ip, printer.port);
        printer.verified = verified;
        
        if (verified) {
          console.log(`✅ Verified: ${printer.ip}:${printer.port} (${printer.protocol})`);
          
          // Try to detect printer model/type if possible
          await this.detectPrinterInfo(printer);
        } else {
          console.log(`❌ Not responding: ${printer.ip}:${printer.port}`);
        }
      } catch (error) {
        console.log(`❌ Error verifying ${printer.ip}:${printer.port}: ${error.message}`);
        printer.verified = false;
      }
    }
  }

  async detectPrinterInfo(printer) {
    // This could be expanded to detect specific printer models
    // For now, we'll just mark thermal printers based on port
    if (printer.port === 9100) {
      printer.likelyThermal = true;
      printer.notes = 'Raw socket (common for thermal printers)';
    } else if (printer.port === 515) {
      printer.notes = 'LPD protocol';
    } else if (printer.port === 631) {
      printer.notes = 'IPP protocol';
    }
  }

  // Print results summary
  printResults() {
    console.log('\n' + '='.repeat(50));
    console.log('📋 PRINTER DISCOVERY RESULTS');
    console.log('='.repeat(50));
    
    if (this.foundPrinters.length === 0) {
      console.log('❌ No network printers found');
      console.log('\nTroubleshooting tips:');
      console.log('1. Ensure printer is powered on');
      console.log('2. Check network cable connection');
      console.log('3. Verify printer and computer are on same network');
      console.log('4. Print network configuration from printer');
      return;
    }
    
    const verifiedPrinters = this.foundPrinters.filter(p => p.verified);
    
    // Sort by priority (thermal printers first)
    verifiedPrinters.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    console.log(`\n🎯 Found ${this.foundPrinters.length} potential printers, ${verifiedPrinters.length} verified\n`);
    
    verifiedPrinters.forEach((printer, index) => {
      const priority = printer.priority || 0;
      const priorityIcon = priority >= 10 ? '🔥' : priority >= 5 ? '⭐' : '📄';
      
      console.log(`${priorityIcon} ${index + 1}. ${printer.ip}:${printer.port}`);
      
      // Show brand/model if detected
      if (printer.brand || printer.model) {
        const brand = printer.brand || 'Unknown';
        const model = printer.model || 'Unknown Model';
        console.log(`   Brand: ${brand} ${model}`);
      }
      
      if (printer.snmpDescription) {
        console.log(`   Description: ${printer.snmpDescription}`);
      }
      
      if (printer.webInterface) {
        console.log(`   Web Interface: ${printer.webInterface}`);
      }
      
      console.log(`   Protocol: ${printer.protocol}`);
      console.log(`   Type: ${printer.confirmed === 'thermal' ? 'Thermal Printer ✅' : printer.likelyThermal ? 'Likely Thermal' : 'Standard Printer'}`);
      
      if (printer.notes) {
        console.log(`   Notes: ${printer.notes}`);
      }
      
      console.log(`   Test command: nc -z ${printer.ip} ${printer.port}`);
      console.log('');
    });
    
    // Provide connection commands with priority indication
    if (verifiedPrinters.length > 0) {
      console.log('🔧 To add these printers to macOS:');
      verifiedPrinters.forEach((printer, index) => {
        const printerName = printer.brand 
          ? `${printer.brand}_${printer.ip.replace(/\./g, '_')}`
          : `NetworkPrinter_${index + 1}`;
        const priority = printer.priority >= 10 ? ' # ⭐ RECOMMENDED' : printer.priority >= 5 ? ' # Thermal' : '';
        console.log(`lpadmin -p ${printerName} -v socket://${printer.ip}:${printer.port} -E${priority}`);
      });
      
      // Highlight best thermal printer
      const bestThermal = verifiedPrinters.find(p => p.confirmed === 'thermal' || p.priority >= 10);
      if (bestThermal) {
        console.log(`\n🎯 RECOMMENDED: ${bestThermal.ip}:${bestThermal.port}`);
        if (bestThermal.brand) {
          console.log(`   Brand: ${bestThermal.brand} ${bestThermal.model || ''}`);
        }
        console.log(`   Reason: ${bestThermal.confirmed === 'thermal' ? 'Confirmed thermal printer' : 'Best thermal candidate'}`);
      }
    }
  }
}

// CLI usage
if (require.main === module) {
  const discovery = new NetworkPrinterDiscovery();
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const options = {
    skipNetworkScan: args.includes('--skip-scan'),
    fastMode: args.includes('--fast')
  };
  
  if (args.includes('--help')) {
    console.log('Network Printer Discovery Tool');
    console.log('Usage: node discover-network-printers.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --skip-scan    Skip network port scanning (faster)');
    console.log('  --fast        Use fast discovery only (Bonjour + CUPS)');
    console.log('  --help        Show this help');
    process.exit(0);
  }
  
  if (options.fastMode) {
    options.skipNetworkScan = true;
  }
  
  discovery.discoverPrinters(options)
    .then(() => {
      discovery.printResults();
    })
    .catch(error => {
      console.error('Discovery failed:', error);
      process.exit(1);
    });
}

module.exports = NetworkPrinterDiscovery;
