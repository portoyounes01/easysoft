const escpos = require('escpos');
const USB = require('escpos-usb');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const net = require('net');
const dns = require('dns');

// Import our discovery classes
const NetworkPrinterDiscovery = require('../../discover-network-printers.js');
const ThermalPrinterIdentifier = require('../../identify-thermal-printers.js');
const AutoPrinterSetup = require('../../auto-printer-setup.js');
const HardwareMonitorManager = require('../monitors/hardware-monitor-manager');

const execAsync = promisify(exec);

class HardwareController {
  constructor() {
    this.printer = null;
    this.device = null;
    this.isInitialized = false;
    this.printerName = 'HPRT_TP80K';
    this.printerVendorId = 0x2aaf;
    this.printerProductId = 0x6004;
    
    // Network printer info
    this.networkPrinter = null;
    this.discoveryMode = 'auto'; // 'auto', 'usb', 'network'
    
    // Multiple printer management
    this.configuredPrinters = new Map(); // Map of printer name -> printer config
    
    // Hardware monitoring
    this.hardwareMonitor = new HardwareMonitorManager();
    this.isMonitoring = false;
    this.activePrinter = null; // Current active printer for compatibility
    
    // Real-time monitoring
    this.monitoringInterval = null;
    this.monitoringEnabled = false;
    this.lastKnownStatus = new Map(); // Track last known status for each printer
    this.statusChangeCallbacks = [];
    
    // Initialize discovery classes
    this.discovery = new NetworkPrinterDiscovery();
    this.identifier = new ThermalPrinterIdentifier();
    this.autoSetup = new AutoPrinterSetup();
    
    // ESC/POS commands that we know work from the working scripts
    this.commands = {
      cashDrawer: {
        standard: [0x1b, 0x70, 0x00, 0x19, 0xfa],
        alternative: [0x1b, 0x70, 0x01, 0x19, 0xfa],
        test: [0x1b, 0x70, 0x00, 0x0a, 0x0a]
      },
      printer: {
        initialize: [0x1b, 0x40],
        cut: [0x1d, 0x56, 0x42, 0x00],
        boldOn: [0x1b, 0x45, 0x01],
        boldOff: [0x1b, 0x45, 0x00],
        center: [0x1b, 0x61, 0x01],
        left: [0x1b, 0x61, 0x00],
        doubleHeight: [0x1b, 0x21, 0x10],
        normal: [0x1b, 0x21, 0x00]
      }
    };
  }

  /**
  * List system printers quickly without a full scan, but enrich each entry with:
  * - device URI and inferred type
  * - accepting status and queue size
  * - lightweight connectivity check
  * This enables the UI to differentiate stale/removed (ghost) printers that still
  * exist in CUPS or have queued jobs from actually reachable printers.
   */
  async listPrinters() {
    try {
      const { stdout } = await execAsync('lpstat -p');
      const printerLines = stdout
        .split('\n')
        .filter(line => line.trim().startsWith('printer '));

      const names = printerLines.map(line => {
        const match = line.match(/printer\s+(\S+)/);
        return match ? match[1] : null;
      }).filter(Boolean);

      // Enrich each printer with device info, connectivity and queue status
      const enriched = await Promise.all(
        names.map(async (name) => {
          let device = 'unknown';
          let type = 'unknown';
          let accepting = null; // true/false/null
          let queueCount = 0;
          let connectivity = { connected: false, status: 'unknown', lastSeen: null };

          // Try get device URI
          try {
            const { stdout: deviceInfo } = await execAsync(`lpstat -v "${name}"`);
            const deviceMatch = deviceInfo.match(/device for\s+\S+:\s*(.+)/);
            device = deviceMatch ? deviceMatch[1].trim() : 'unknown';
            type = this.detectPrinterType(device);
          } catch (e) {
            // ignore, leave defaults
          }

          // Check if printer is accepting jobs
          try {
            const { stdout: acceptingInfo } = await execAsync(`lpstat -a "${name}"`);
            accepting = acceptingInfo.includes('accepting requests');
          } catch (e) {
            accepting = null;
          }

          // Queue size (jobs pending)
          try {
            const { stdout: queueOut } = await execAsync(`lpstat -o "${name}"`);
            queueCount = queueOut.trim() ? queueOut.trim().split('\n').filter(Boolean).length : 0;
          } catch (e) {
            queueCount = 0; // if command fails, assume 0 visible jobs
          }

          // Connectivity (physical/network presence)
          try {
            if (device && device !== 'unknown') {
              connectivity = await this.checkPrinterConnectivity(name, device);
            }
          } catch (e) {
            // keep default connectivity
          }

          return {
            name,
            status: accepting === true ? 'ready' : (accepting === false ? 'not_accepting' : 'unknown'),
            device,
            type,
            role: this.configuredPrinters.get(name)?.role || 'unassigned',
            isActive: this.activePrinter === name,
            lastConnected: this.configuredPrinters.get(name)?.lastConnected || null,
            connected: connectivity.connected,
            connectionStatus: connectivity.status,
            lastSeen: connectivity.lastSeen,
            hasQueuedJobs: queueCount > 0,
            queueCount,
            // Printers that exist in CUPS but are not physically reachable
            // (e.g., unplugged USB or unreachable network) are marked stale
            isStale: connectivity.connected === false,
            source: 'system'
          };
        })
      );

      return enriched;
    } catch (error) {
      console.error('List printers failed:', error);
      return [];
    }
  }

  async initialize() {
    try {
      console.log('🔧 Initializing hardware controller...');
      
      // Try automatic discovery first
      if (this.discoveryMode === 'auto') {
        console.log('🚀 Starting automatic thermal printer discovery...');
        const autoResult = await this.initializeAutoDiscovery();
        if (autoResult.success) {
          this.isInitialized = true;
          return autoResult;
        }
        console.log('⚠️ Auto discovery failed, trying USB...');
      }
      
      // Try to connect via USB 
      const initResult = await this.initializeUSBPrinter();
      
      if (!initResult.success) {
        console.log('📋 USB connection failed, falling back to system printer');
        // Fall back to system printer (CUPS)
        const systemResult = await this.checkSystemPrinter();
        if (systemResult.success) {
          this.isInitialized = true;
          return { 
            success: true, 
            mode: 'system',
            message: `Connected to system printer: ${this.printerName}`,
            printer: systemResult.printer
          };
        }
      } else {
        this.isInitialized = true;
        return {
          success: true,
          mode: 'usb',
          message: 'Connected via USB direct control',
          printer: initResult.printer
        };
      }

      return { 
        success: false, 
        error: 'No printer found via auto-discovery, USB, or system' 
      };

    } catch (error) {
      console.error('Hardware initialization error:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  async initializeAutoDiscovery() {
    try {
      console.log('🔍 Auto-discovering thermal printers...');
      
      // Use our auto-setup system to find and configure the best thermal printer
      const result = await this.autoSetup.autoSetup({ 
        skipTestPrint: true,
        printerName: 'ThermalPrinter_Auto'
      });
      
      if (result.success) {
        this.networkPrinter = {
          ip: result.printer.ip,
          port: result.printer.port,
          name: result.printerName,
          brand: result.brand,
          confidence: result.confidence
        };
        
        this.discoveryMode = 'network';
        
        console.log(`✅ Auto-discovery successful: ${result.printer.ip}:${result.printer.port}`);
        if (result.brand) {
          console.log(`📋 Brand: ${result.brand}`);
        }
        console.log(`🎯 Confidence: ${result.confidence}%`);
        
        return {
          success: true,
          mode: 'network',
          message: `Auto-discovered thermal printer: ${result.printerName}`,
          printer: result.printerName,
          details: this.networkPrinter
        };
      }
      
      return { success: false, error: result.error };
      
    } catch (error) {
      console.error('Auto-discovery failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Discover available thermal printers without setting them up
  async discoverThermalPrinters() {
    try {
      console.log('🔍 Discovering thermal printers on network...');
      
      // Step 1: Find all network printers
      const printers = await this.discovery.discoverPrinters({ skipNetworkScan: false });
      
      if (printers.length === 0) {
        return { success: false, error: 'No network printers found', printers: [] };
      }
      
      // Step 2: Filter potential thermal printers
      const thermalCandidates = printers.filter(p => p.verified && (p.port === 9100 || p.likelyThermal));
      
      if (thermalCandidates.length === 0) {
        return { 
          success: false, 
          error: 'No thermal printers found', 
          printers: printers.map(p => ({ ip: p.ip, port: p.port, protocol: p.protocol }))
        };
      }
      
      // Step 3: Identify thermal printers
      const identifiedPrinters = await this.identifier.identifyMultiplePrinters(thermalCandidates);
      
      // Sort by confidence
      const sortedPrinters = identifiedPrinters
        .filter(p => p.success)
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .map(p => ({
          ip: p.ip,
          port: p.port,
          confidence: p.confidence,
          isThermal: p.isThermal,
          brand: p.selfId && p.selfId.brand,
          identification: p.selfId && p.selfId.text,
          recommended: p.confidence >= 70
        }));
      
      return {
        success: true,
        printers: sortedPrinters,
        recommended: sortedPrinters.find(p => p.recommended)
      };
      
    } catch (error) {
      console.error('Discovery failed:', error);
      return { success: false, error: error.message, printers: [] };
    }
  }

  // Manually connect to a specific network printer
  async connectToNetworkPrinter(ip, port = 9100, printerName = null) {
    try {
      console.log(`🔌 Connecting to network printer at ${ip}:${port}...`);
      
      // Test the printer first
      const identification = await this.identifier.identifyThermalPrinter(ip, port);
      
      if (!identification.success) {
        return { success: false, error: `Cannot connect to printer at ${ip}:${port}` };
      }
      
      // Setup the printer
      const setupName = printerName || `ThermalPrinter_${ip.replace(/\./g, '_')}`;
      const setupResult = await this.autoSetup.quickSetup(ip, port, setupName);
      
      if (setupResult.success) {
        this.networkPrinter = {
          ip,
          port,
          name: setupResult.printerName,
          brand: identification.selfId && identification.selfId.brand,
          confidence: identification.confidence
        };
        
        this.discoveryMode = 'network';
        this.isInitialized = true;
        
        return {
          success: true,
          mode: 'network',
          message: `Connected to network printer: ${setupResult.printerName}`,
          printer: setupResult.printerName,
          details: this.networkPrinter
        };
      }
      
      return { success: false, error: setupResult.error };
      
    } catch (error) {
      console.error('Network printer connection failed:', error);
      return { success: false, error: error.message };
    }
  }

  async initializeUSBPrinter() {
    try {
      // Find the HPRT printer
      const devices = USB.findPrinter();
      console.log('🔍 Found USB devices:', devices.length);

      let targetDevice = null;
      for (const device of devices) {
        if (device.deviceDescriptor.idVendor === this.printerVendorId && 
            device.deviceDescriptor.idProduct === this.printerProductId) {
          targetDevice = device;
          break;
        }
      }

      if (!targetDevice) {
        return { 
          success: false, 
          error: `HPRT printer not found (VID: 0x${this.printerVendorId.toString(16)}, PID: 0x${this.printerProductId.toString(16)})` 
        };
      }

      this.device = new USB(targetDevice);
      this.printer = new escpos.Printer(this.device);

      // Test connection
      await new Promise((resolve, reject) => {
        this.device.open((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      console.log('✅ USB printer connected successfully');
      return { 
        success: true, 
        printer: 'HPRT_TP80K_USB' 
      };

    } catch (error) {
      console.error('USB printer initialization failed:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  async checkSystemPrinter() {
    try {
      console.log(`🔍 Checking system printer: ${this.printerName}`);
      const { stdout } = await execAsync(`lpstat -p "${this.printerName}"`);
      console.log(`✅ System printer status: ${stdout.trim()}`);
      
      return { 
        success: true, 
        printer: this.printerName,
        status: stdout.trim()
      };
    } catch (error) {
      console.error('System printer check failed:', error);
      
      // Try to list available printers
      try {
        const { stdout: allPrinters } = await execAsync('lpstat -p');
        console.log('Available printers:', allPrinters);
      } catch (e) {
        console.log('No system printers found');
      }
      
      return { 
        success: false, 
        error: `System printer "${this.printerName}" not found` 
      };
    }
  }

  async printReceipt(receiptData) {
    try {
      if (!this.isInitialized) {
        return { success: false, error: 'Hardware not initialized' };
      }

      console.log('🖨️ Printing receipt...');

      if (this.discoveryMode === 'network' && this.networkPrinter) {
        // Network printer - use raw socket
        return await this.printViaNetwork(receiptData);
      } else if (this.printer && this.device) {
        // Direct USB printing
        return await this.printViaUSB(receiptData);
      } else {
        // System printer fallback
        return await this.printViaSystem(receiptData);
      }

    } catch (error) {
      console.error('Print receipt error:', error);
      return { success: false, error: error.message };
    }
  }

  async printViaNetwork(receiptData) {
    try {
      console.log(`📡 Printing to network printer: ${this.networkPrinter.ip}:${this.networkPrinter.port}`);
      
      // Generate ESC/POS commands for the receipt
      const commands = this.generateReceiptCommands(receiptData);
      
      // Send directly to network printer
      const result = await this.sendToNetworkPrinter(commands);
      
      if (result.success) {
        console.log('✅ Receipt printed via network');
        return { success: true, method: 'network', printer: this.networkPrinter };
      } else {
        throw new Error(result.error);
      }
      
    } catch (error) {
      console.error('Network printing failed:', error);
      throw error;
    }
  }

  async sendToNetworkPrinter(commands) {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const timeout = 10000; // 10 seconds
      
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error('Network printer timeout'));
      }, timeout);

      socket.on('connect', () => {
        console.log('📡 Connected to network printer');
        const buffer = Buffer.from(commands);
        
        socket.write(buffer, (error) => {
          clearTimeout(timer);
          socket.destroy();
          
          if (error) {
            reject(error);
          } else {
            resolve({ success: true });
          }
        });
      });

      socket.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      socket.connect(this.networkPrinter.port, this.networkPrinter.ip);
    });
  }

  async printViaUSB(receiptData) {
    return new Promise((resolve, reject) => {
      try {
        this.printer
          .font('a')
          .align('ct')
          .style('bu')
          .size(1, 1)
          .text(receiptData.header || 'RECEIPT')
          .text('')
          .align('lt')
          .style('normal')
          .text(`Date: ${receiptData.date || new Date().toLocaleDateString()}`)
          .text(`Time: ${receiptData.time || new Date().toLocaleTimeString()}`)
          .text('--------------------------------');

        // Print items
        if (receiptData.items && receiptData.items.length > 0) {
          receiptData.items.forEach(item => {
            this.printer
              .text(`${item.name}`)
              .text(`  ${item.quantity} x ${item.price} = ${item.total}`);
          });
        }

        this.printer
          .text('--------------------------------')
          .align('rt')
          .style('b')
          .text(`TOTAL: ${receiptData.total || '0.00'}`)
          .text('')
          .align('ct')
          .text('Thank you for your business!')
          .cut()
          .close(() => {
            console.log('✅ Receipt printed via USB');
            resolve({ success: true, method: 'usb' });
          });

      } catch (error) {
        reject(error);
      }
    });
  }

  async printViaSystem(receiptData) {
    try {
      // Generate ESC/POS commands for the receipt
      const commands = this.generateReceiptCommands(receiptData);
      
      // Write to temporary file
      const tempFile = path.join(__dirname, '..', 'temp_receipt.bin');
      fs.writeFileSync(tempFile, Buffer.from(commands));

      // Send to system printer
      const command = `lp -d "${this.printerName}" -o raw "${tempFile}"`;
      const { stdout } = await execAsync(command);

      // Clean up
      fs.unlinkSync(tempFile);

      console.log(`✅ Receipt printed via system printer. Job ID: ${stdout.trim()}`);
      return { 
        success: true, 
        method: 'system',
        jobId: stdout.trim()
      };

    } catch (error) {
      throw error;
    }
  }

  generateReceiptCommands(receiptData) {
    const commands = [];
    
    // Initialize printer
    commands.push(...this.commands.printer.initialize);
    
    // Header
    commands.push(...this.commands.printer.center);
    commands.push(...this.commands.printer.boldOn);
    commands.push(...this.commands.printer.doubleHeight);
    commands.push(...this.stringToCommands(receiptData.header || 'RECEIPT'));
    commands.push(0x0A); // Line feed
    commands.push(...this.commands.printer.normal);
    commands.push(...this.commands.printer.boldOff);
    commands.push(0x0A); // Line feed

    // Date and time
    commands.push(...this.commands.printer.left);
    commands.push(...this.stringToCommands(`Date: ${receiptData.date || new Date().toLocaleDateString()}`));
    commands.push(0x0A);
    commands.push(...this.stringToCommands(`Time: ${receiptData.time || new Date().toLocaleTimeString()}`));
    commands.push(0x0A);
    commands.push(...this.stringToCommands('--------------------------------'));
    commands.push(0x0A);

    // Items
    if (receiptData.items && receiptData.items.length > 0) {
      receiptData.items.forEach(item => {
        commands.push(...this.stringToCommands(item.name));
        commands.push(0x0A);
        commands.push(...this.stringToCommands(`  ${item.quantity} x ${item.price} = ${item.total}`));
        commands.push(0x0A);
      });
    }

    // Total
    commands.push(...this.stringToCommands('--------------------------------'));
    commands.push(0x0A);
    commands.push(...this.commands.printer.boldOn);
    commands.push(...this.stringToCommands(`TOTAL: ${receiptData.total || '0.00'}`));
    commands.push(0x0A);
    commands.push(...this.commands.printer.boldOff);
    commands.push(0x0A);

    // Footer
    commands.push(...this.commands.printer.center);
    commands.push(...this.stringToCommands('Thank you for your business!'));
    commands.push(0x0A);
    commands.push(0x0A);

    // Cut paper
    commands.push(...this.commands.printer.cut);

    return commands;
  }

  stringToCommands(str) {
    return Array.from(Buffer.from(str, 'utf8'));
  }

  async openCashDrawer(options = {}) {
    try {
      if (!this.isInitialized) {
        return { success: false, error: 'Hardware not initialized' };
      }

      console.log('💰 Opening cash drawer...');
      
      const commandType = options.command || 'standard';
      const commands = this.commands.cashDrawer[commandType] || this.commands.cashDrawer.standard;

      if (this.discoveryMode === 'network' && this.networkPrinter) {
        // Network printer - send raw commands
        return await this.openDrawerViaNetwork(commands);
      } else if (this.printer && this.device) {
        // Direct USB control
        return await this.openDrawerViaUSB(commands);
      } else {
        // System printer fallback
        return await this.openDrawerViaSystem(commands);
      }

    } catch (error) {
      console.error('Open cash drawer error:', error);
      return { success: false, error: error.message };
    }
  }

  async openDrawerViaNetwork(commands) {
    try {
      console.log(`📡 Opening cash drawer via network: ${this.networkPrinter.ip}:${this.networkPrinter.port}`);
      
      const result = await this.sendToNetworkPrinter(commands);
      
      if (result.success) {
        console.log('✅ Cash drawer opened via network');
        return { success: true, method: 'network', printer: this.networkPrinter };
      } else {
        throw new Error(result.error);
      }
      
    } catch (error) {
      console.error('Network cash drawer open failed:', error);
      throw error;
    }
  }

  async openDrawerViaUSB(commands) {
    return new Promise((resolve, reject) => {
      try {
        const buffer = Buffer.from(commands);
        this.device.write(buffer, (error) => {
          if (error) {
            reject(error);
          } else {
            console.log('✅ Cash drawer opened via USB');
            resolve({ success: true, method: 'usb' });
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async openDrawerViaSystem(commands) {
    try {
      // Write commands to temporary file
      const tempFile = path.join(__dirname, '..', 'temp_drawer.bin');
      fs.writeFileSync(tempFile, Buffer.from(commands));

      // Send to system printer
      const command = `lp -d "${this.printerName}" -o raw "${tempFile}"`;
      const { stdout } = await execAsync(command);

      // Clean up
      fs.unlinkSync(tempFile);

      console.log(`✅ Cash drawer opened via system printer. Job ID: ${stdout.trim()}`);
      return { 
        success: true, 
        method: 'system',
        jobId: stdout.trim()
      };

    } catch (error) {
      throw error;
    }
  }

  async getDrawerStatus() {
    try {
      // This would require the direct-usb-status.cjs logic
      // For now, return unknown status
      console.log('📊 Checking drawer status...');
      
      return { 
        success: true, 
        status: 'unknown',
        message: 'Drawer status detection not yet implemented in Electron version'
      };

    } catch (error) {
      console.error('Get drawer status error:', error);
      return { 
        success: false, 
        status: 'unknown',
        error: error.message 
      };
    }
  }

  async testPrinter() {
    try {
      if (!this.isInitialized) {
        return { success: false, error: 'Hardware not initialized' };
      }

      console.log('🧪 Testing printer...');

      const testReceipt = {
        header: 'PRINTER TEST',
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        items: [
          { name: 'Test Item 1', quantity: '1', price: '€1.00', total: '€1.00' },
          { name: 'Test Item 2', quantity: '2', price: '€2.50', total: '€5.00' }
        ],
        total: '€6.00'
      };

      const result = await this.printReceipt(testReceipt);
      
      if (result.success) {
        console.log('✅ Printer test completed successfully');
        return { 
          success: true, 
          message: 'Printer test completed successfully',
          method: result.method
        };
      } else {
        return result;
      }

    } catch (error) {
      console.error('Test printer error:', error);
      return { success: false, error: error.message };
    }
  }

  async getHardwareStatus() {
    try {
      const status = {
        initialized: this.isInitialized,
        discoveryMode: this.discoveryMode,
        printer: {
          connected: false,
          type: 'unknown',
          name: this.printerName
        },
        cashDrawer: {
          available: false,
          status: 'unknown'
        },
        network: null
      };

      if (this.discoveryMode === 'network' && this.networkPrinter) {
        status.printer.connected = true;
        status.printer.type = 'network';
        status.printer.name = this.networkPrinter.name;
        status.cashDrawer.available = true;
        status.network = {
          ip: this.networkPrinter.ip,
          port: this.networkPrinter.port,
          brand: this.networkPrinter.brand,
          confidence: this.networkPrinter.confidence
        };
      } else if (this.discoveryMode === 'usb_system') {
        // USB printer connected via system (lpadmin)
        try {
          await this.checkSystemPrinter();
          status.printer.connected = true;
          status.printer.type = 'usb_system';
          status.cashDrawer.available = true;
          status.initialized = true;
        } catch (error) {
          status.printer.connected = false;
        }
      } else if (this.printer && this.device) {
        status.printer.connected = true;
        status.printer.type = 'usb';
        status.cashDrawer.available = true;
      } else if (this.isInitialized) {
        // Check system printer
        try {
          await this.checkSystemPrinter();
          status.printer.connected = true;
          status.printer.type = 'system';
          status.cashDrawer.available = true;
        } catch (error) {
          status.printer.connected = false;
        }
      }

      return { success: true, status };

    } catch (error) {
      console.error('Get hardware status error:', error);
      return { success: false, error: error.message };
    }
  }

  // USB Printer Discovery Methods
  async discoverUSBPrinters() {
    try {
      console.log('🔍 Discovering USB printers...');
      
      // Use our existing USB detection script
      const USBPrinterDetector = require('../../detect-usb-printers.js');
      const detector = new USBPrinterDetector();
      
      const usbPrinters = await detector.detectUSBPrinters();
      
      if (usbPrinters.length === 0) {
        return {
          success: true,
          printers: [],
          message: 'No USB printers found'
        };
      }

      // Convert to our format
      const formattedPrinters = usbPrinters.map(printer => ({
        type: 'usb',
        brand: printer.brand,
        model: printer.model,
        serial: printer.serial,
        uri: printer.uri,
        isThermal: printer.isThermal,
        recommended: printer.recommended,
        confidence: printer.isThermal ? 90 : 50
      }));

      console.log(`✅ Found ${formattedPrinters.length} USB printer(s)`);
      
      return {
        success: true,
        printers: formattedPrinters,
        message: `Found ${formattedPrinters.length} USB printer(s)`
      };

    } catch (error) {
      console.error('USB printer discovery failed:', error);
      return {
        success: false,
        error: error.message,
        printers: []
      };
    }
  }

  async connectToUSBPrinter(uri, printerName) {
    try {
      console.log(`🔌 Connecting to USB printer: ${printerName}`);
      
      // Use our existing USB detection script for setup
      const USBPrinterDetector = require('../../detect-usb-printers.js');
      const detector = new USBPrinterDetector();
      
      // Parse the URI to get printer info
      const match = uri.match(/usb:\/\/([^\/]+)\/([^?]+)\?serial=(.+)/);
      if (!match) {
        throw new Error('Invalid USB printer URI format');
      }

      const [, brand, model, serial] = match;
      const printer = {
        type: 'usb',
        brand,
        model,
        serial,
        uri,
        isThermal: detector.isThermalPrinter(brand, model)
      };

      // Setup the printer in macOS
      const setupResult = await detector.setupUSBPrinter(printer, printerName);
      
      if (setupResult.success) {
        // Update our internal state
        this.discoveryMode = 'usb_system';
        this.printerName = setupResult.printerName;
        this.isInitialized = true; // Mark as initialized
        
        // Register in multiple printer system
        this.configuredPrinters.set(setupResult.printerName, {
          type: 'usb',
          brand,
          model,
          serial,
          uri,
          isThermal: printer.isThermal,
          role: 'unassigned',
          lastConnected: new Date().toISOString(),
          connectionMethod: 'usb_system'
        });
        
        // If no active printer, make this the active one
        if (!this.activePrinter) {
          this.activePrinter = setupResult.printerName;
        }
        
        console.log(`✅ USB printer connected: ${setupResult.printerName}`);
        
        return {
          success: true,
          printerName: setupResult.printerName,
          message: setupResult.message,
          details: {
            brand,
            model,
            serial,
            uri,
            isThermal: printer.isThermal
          }
        };
      } else {
        throw new Error(setupResult.error);
      }

    } catch (error) {
      console.error('USB printer connection failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Multiple Printer Management Methods
  async getConfiguredPrinters() {
    try {
      console.log('📋 Getting configured printers...');
      
      // Get all configured printers from CUPS
      const { stdout } = await execAsync('lpstat -p');
      const printerLines = stdout.split('\n').filter(line => line.trim() && line.startsWith('printer '));
      
      const systemPrinters = [];
      
      for (const line of printerLines) {
        // Parse line like: "printer HPRT_USB_Test is idle. enabled since Wed Aug  6 11:09:01 2025"
        const match = line.match(/printer\s+(\S+)\s+is\s+(\w+)/);
        if (match) {
          const [, name, status] = match;
          
          // Get printer details
          try {
            const { stdout: deviceInfo } = await execAsync(`lpstat -v "${name}"`);
            const deviceMatch = deviceInfo.match(/device for\s+\S+:\s*(.+)/);
            const device = deviceMatch ? deviceMatch[1].trim() : 'unknown';
            
            // Check if printer is actually connected/reachable
            const connectivity = await this.checkPrinterConnectivity(name, device);
            
            const printerInfo = {
              name,
              status: status === 'idle' ? 'ready' : status,
              device,
              type: this.detectPrinterType(device),
              role: this.configuredPrinters.get(name)?.role || 'unassigned',
              isActive: this.activePrinter === name,
              lastConnected: this.configuredPrinters.get(name)?.lastConnected || null,
              connected: connectivity.connected,
              connectionStatus: connectivity.status,
              lastSeen: connectivity.lastSeen
            };
            
            systemPrinters.push(printerInfo);
          } catch (error) {
            console.warn(`Could not get details for printer ${name}:`, error.message);
            // Still add the printer but mark as disconnected
            systemPrinters.push({
              name,
              status: 'unknown',
              device: 'unknown',
              type: 'unknown',
              role: this.configuredPrinters.get(name)?.role || 'unassigned',
              isActive: this.activePrinter === name,
              lastConnected: this.configuredPrinters.get(name)?.lastConnected || null,
              connected: false,
              connectionStatus: 'error',
              lastSeen: null
            });
          }
        }
      }
      
      return {
        success: true,
        printers: systemPrinters,
        count: systemPrinters.length,
        connectedCount: systemPrinters.filter(p => p.connected).length
      };
      
    } catch (error) {
      console.error('Failed to get configured printers:', error);
      return {
        success: false,
        error: error.message,
        printers: []
      };
    }
  }

  async checkPrinterConnectivity(printerName, device) {
    try {
      // For USB printers
      if (device.startsWith('usb://')) {
        // Parse USB device info like: usb://HPRT/TP80K?serial=TP80K023251289
        const usbMatch = device.match(/usb:\/\/([^\/]+)\/([^?]+)\?serial=(.+)/);
        if (usbMatch) {
          const [, brand, model, serial] = usbMatch;
          
          // Check if USB device is still present
          try {
            const { stdout } = await execAsync('lpinfo -v | grep "usb://"');
            const isPresent = stdout.includes(device.replace('usb://', ''));
            
            return {
              connected: isPresent,
              status: isPresent ? 'connected' : 'disconnected',
              lastSeen: isPresent ? new Date().toISOString() : null
            };
          } catch (error) {
            return {
              connected: false,
              status: 'disconnected',
              lastSeen: null
            };
          }
        }
      }
      
      // For network printers
      if (device.startsWith('socket://')) {
        // Parse network device like: socket://192.168.1.113:9100
        const socketMatch = device.match(/socket:\/\/([^:]+):(\d+)/);
        if (socketMatch) {
          const [, ip, port] = socketMatch;
          
          // Test network connectivity
          const isReachable = await this.testNetworkPrinter(ip, parseInt(port));
          
          return {
            connected: isReachable,
            status: isReachable ? 'connected' : 'network_unreachable',
            lastSeen: isReachable ? new Date().toISOString() : null
          };
        }
      }
      
      // For other printer types (IPP, LPD, etc.)
      if (device.includes('://')) {
        // Try to send a simple test job to check if printer responds
        try {
          // Use lpstat to check if printer is accepting jobs
          const { stdout } = await execAsync(`lpstat -a "${printerName}"`);
          const isAccepting = stdout.includes('accepting requests');
          
          return {
            connected: isAccepting,
            status: isAccepting ? 'connected' : 'not_accepting',
            lastSeen: isAccepting ? new Date().toISOString() : null
          };
        } catch (error) {
          return {
            connected: false,
            status: 'unreachable',
            lastSeen: null
          };
        }
      }
      
      // Fallback for unknown device types
      return {
        connected: false,
        status: 'unknown_device',
        lastSeen: null
      };
      
    } catch (error) {
      console.warn(`Error checking connectivity for ${printerName}:`, error.message);
      return {
        connected: false,
        status: 'error',
        lastSeen: null
      };
    }
  }

  async testNetworkPrinter(ip, port) {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 2000); // 2 second timeout

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

  detectPrinterType(device) {
    if (device.startsWith('usb://')) {
      return 'usb';
    } else if (device.startsWith('socket://')) {
      return 'network';
    } else if (device.includes('ipp://') || device.includes('ipps://')) {
      return 'ipp';
    } else if (device.includes('lpd://')) {
      return 'lpd';
    } else {
      return 'system';
    }
  }

  async setPrinterRole(printerName, role) {
    try {
      console.log(`🏷️ Setting printer ${printerName} role to: ${role}`);
      
      // Validate role
      const validRoles = ['receipt', 'kitchen', 'bar', 'label', 'backup', 'unassigned'];
      if (!validRoles.includes(role)) {
        throw new Error(`Invalid role: ${role}. Valid roles: ${validRoles.join(', ')}`);
      }
      
      // Update internal configuration
      const existing = this.configuredPrinters.get(printerName) || {};
      this.configuredPrinters.set(printerName, {
        ...existing,
        role,
        lastUpdated: new Date().toISOString()
      });
      
      // If this is a receipt printer, make it the active printer for compatibility
      if (role === 'receipt') {
        this.activePrinter = printerName;
        this.printerName = printerName;
      }
      
      return {
        success: true,
        message: `Printer ${printerName} assigned role: ${role}`
      };
      
    } catch (error) {
      console.error('Failed to set printer role:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async removePrinter(printerName) {
    try {
      console.log(`🗑️ Removing printer: ${printerName}`);
      
      // Remove from CUPS
      await execAsync(`lpadmin -x "${printerName}"`);
      
      // Remove from internal configuration
      this.configuredPrinters.delete(printerName);
      
      // If this was the active printer, clear it
      if (this.activePrinter === printerName) {
        this.activePrinter = null;
        // Try to find another receipt printer to make active
        for (const [name, config] of this.configuredPrinters) {
          if (config.role === 'receipt') {
            this.activePrinter = name;
            this.printerName = name;
            break;
          }
        }
      }
      
      return {
        success: true,
        message: `Printer ${printerName} removed successfully`
      };
      
    } catch (error) {
      console.error('Failed to remove printer:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async testPrinterByName(printerName, testType = 'basic') {
    try {
      console.log(`🖨️ Testing printer: ${printerName} (${testType})`);
      
      let testContent;
      switch (testType) {
        case 'receipt':
          testContent = `RECEIPT TEST\n${'-'.repeat(30)}\nTest Item          $10.00\nTax                 $1.00\n${'-'.repeat(30)}\nTotal              $11.00\n\nTest completed: ${new Date().toLocaleString()}\n\n`;
          break;
        case 'kitchen':
          testContent = `KITCHEN ORDER\n${'-'.repeat(20)}\nTable: 5\nOrder #: 123\n\n1x Burger\n2x Fries\n1x Coke\n\nTime: ${new Date().toLocaleTimeString()}\n\n`;
          break;
        case 'basic':
        default:
          testContent = `Printer Test\nName: ${printerName}\nTime: ${new Date().toLocaleString()}\nStatus: OK\n\n`;
          break;
      }
      
      const command = `echo "${testContent}" | lp -d "${printerName}"`;
      const { stdout } = await execAsync(command);
      
      return {
        success: true,
        message: `Test print sent to ${printerName}`,
        jobInfo: stdout.trim()
      };
      
    } catch (error) {
      console.error(`Failed to test printer ${printerName}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Progressive Printer Scanning Methods
  async scanPrintersProgressively(onPrinterFound) {
    try {
      console.log('🔍 Starting progressive printer scan...');
      const allPrinters = [];
      
      // Notify start
      if (onPrinterFound) {
        onPrinterFound({
          type: 'start',
          message: 'Starting printer scan...'
        });
      }
      
      // Scan configured system printers
      console.log('🖨️ Phase 2: Scanning configured system printers...');
      if (onPrinterFound) {
        onPrinterFound({
          type: 'progress',
          stage: 'system',
          message: 'Scanning configured system printers...'
        });
      }
      const systemPrinters = await this.scanSystemPrintersProgressively(onPrinterFound, allPrinters);
      allPrinters.push(...systemPrinters);
      
      console.log(`✅ Progressive scan completed. Found ${allPrinters.length} printers total.`);
      
      // Notify completion
      if (onPrinterFound) {
        onPrinterFound({
          type: 'complete',
          printers: allPrinters,
          message: `Scan complete. Found ${allPrinters.length} printers.`
        });
      }
      
      return {
        success: true,
        printers: allPrinters,
        count: allPrinters.length,
        connectedCount: allPrinters.filter(p => p.connected).length
      };
      
    } catch (error) {
      console.error('Progressive scan failed:', error);
      if (onPrinterFound) {
        onPrinterFound({
          type: 'complete',
          printers: [],
          message: `Scan failed: ${error.message}`
        });
      }
      return {
        success: false,
        error: error.message,
        printers: []
      };
    }
  }

  async scanUSBPrintersProgressively(onPrinterFound) {
    const foundPrinters = [];
    
    try {
      // Get USB printers using our detection script
      const USBPrinterDetector = require('../../detect-usb-printers.js');
      const detector = new USBPrinterDetector();
      const usbPrinters = await detector.detectUSBPrinters();
      
      for (const usbPrinter of usbPrinters) {
        console.log(`🔌 Testing USB printer: ${usbPrinter.brand} ${usbPrinter.model}`);
        
        // Check if this USB printer is configured in the system
        try {
          const { stdout } = await execAsync('lpstat -p');
          const configuredPrinters = stdout.split('\n')
            .filter(line => line.includes('printer '))
            .map(line => {
              const match = line.match(/printer\s+(\S+)/);
              return match ? match[1] : null;
            })
            .filter(Boolean);
          
          // Find matching configured printer for this USB device
          let matchingSystemPrinter = null;
          for (const printerName of configuredPrinters) {
            try {
              const { stdout: deviceInfo } = await execAsync(`lpstat -v "${printerName}"`);
              if (deviceInfo.includes(usbPrinter.serial)) {
                matchingSystemPrinter = printerName;
                break;
              }
            } catch (error) {
              // Continue checking other printers
            }
          }
          
          const printerInfo = {
            name: matchingSystemPrinter || `${usbPrinter.brand}_${usbPrinter.model}`,
            status: matchingSystemPrinter ? 'ready' : 'not_configured',
            device: usbPrinter.uri,
            type: 'usb',
            role: this.configuredPrinters.get(matchingSystemPrinter)?.role || 'unassigned',
            isActive: this.activePrinter === matchingSystemPrinter,
            lastConnected: this.configuredPrinters.get(matchingSystemPrinter)?.lastConnected || null,
            connected: true, // USB printer is physically connected
            connectionStatus: matchingSystemPrinter ? 'connected' : 'not_configured',
            lastSeen: new Date().toISOString(),
            brand: usbPrinter.brand,
            model: usbPrinter.model,
            serial: usbPrinter.serial,
            isThermal: usbPrinter.isThermal,
            scanPhase: 'usb'
          };
          
          foundPrinters.push(printerInfo);
          
          // Notify UI about this printer
          if (onPrinterFound) {
            onPrinterFound({
              type: 'printer-found',
              stage: 'usb',
              printer: printerInfo
            });
          }
          
        } catch (error) {
          console.warn(`Error checking USB printer ${usbPrinter.brand} ${usbPrinter.model}:`, error.message);
        }
      }
      
    } catch (error) {
      console.warn('USB scan failed:', error.message);
    }
    
    return foundPrinters;
  }

  async scanSystemPrintersProgressively(onPrinterFound, existingPrinters = []) {
    const foundPrinters = [];
    const existingNames = new Set(existingPrinters.map(p => p.name));
    
    try {
      // Get all configured printers from CUPS
      const { stdout } = await execAsync('lpstat -p');
      const printerLines = stdout.split('\n').filter(line => line.trim() && line.startsWith('printer '));
      
      for (const line of printerLines) {
        const match = line.match(/printer\s+(\S+)\s+is\s+(\w+)/);
        if (match) {
          const [, name, status] = match;
          
          // Skip if we already found this printer in USB scan
          if (existingNames.has(name)) {
            continue;
          }
          
          console.log(`🖨️ Testing system printer: ${name}`);
          
          try {
            // Get printer device info
            const { stdout: deviceInfo } = await execAsync(`lpstat -v "${name}"`);
            const deviceMatch = deviceInfo.match(/device for\s+\S+:\s*(.+)/);
            const device = deviceMatch ? deviceMatch[1].trim() : 'unknown';
            
            // Test connectivity
            const connectivity = await this.checkPrinterConnectivity(name, device);
            
            const printerInfo = {
              name,
              status: status === 'idle' ? 'ready' : status,
              device,
              type: this.detectPrinterType(device),
              role: this.configuredPrinters.get(name)?.role || 'unassigned',
              isActive: this.activePrinter === name,
              lastConnected: this.configuredPrinters.get(name)?.lastConnected || null,
              connected: connectivity.connected,
              connectionStatus: connectivity.status,
              lastSeen: connectivity.lastSeen,
              scanPhase: 'system'
            };
            
            foundPrinters.push(printerInfo);
            
            // Notify UI about this printer
            if (onPrinterFound) {
              onPrinterFound({
                type: 'printer-found',
                stage: 'system',
                printer: printerInfo
              });
            }
            
            // Add small delay to make progression visible
            await new Promise(resolve => setTimeout(resolve, 200));
            
          } catch (error) {
            console.warn(`Error testing printer ${name}:`, error.message);
            
            // Still add the printer but mark as error
            const printerInfo = {
              name,
              status: 'error',
              device: 'unknown',
              type: 'unknown',
              role: this.configuredPrinters.get(name)?.role || 'unassigned',
              isActive: this.activePrinter === name,
              lastConnected: this.configuredPrinters.get(name)?.lastConnected || null,
              connected: false,
              connectionStatus: 'error',
              lastSeen: null,
              scanPhase: 'system'
            };
            
            foundPrinters.push(printerInfo);
            
            if (onPrinterFound) {
              onPrinterFound(printerInfo);
            }
          }
        }
      }
      
    } catch (error) {
      console.error('System printer scan failed:', error);
    }
    
    return foundPrinters;
  }

  async checkPrinterConnectivity(printerName, device) {
    try {
      // For USB printers
      if (device.startsWith('usb://')) {
        try {
          const { stdout } = await execAsync('lpinfo -v | grep "usb://"');
          const isPresent = stdout.includes(device.replace('usb://', ''));
          
          return {
            connected: isPresent,
            status: isPresent ? 'connected' : 'disconnected',
            lastSeen: isPresent ? new Date().toISOString() : null
          };
        } catch (error) {
          return {
            connected: false,
            status: 'disconnected',
            lastSeen: null
          };
        }
      }
      
      // For network printers
      if (device.startsWith('socket://')) {
        const socketMatch = device.match(/socket:\/\/([^:]+):(\d+)/);
        if (socketMatch) {
          const [, ip, port] = socketMatch;
          const isReachable = await this.testNetworkConnection(ip, parseInt(port));
          
          return {
            connected: isReachable,
            status: isReachable ? 'connected' : 'network_unreachable',
            lastSeen: isReachable ? new Date().toISOString() : null
          };
        }
      }
      
      // For other printer types, try to check if accepting jobs
      try {
        const { stdout } = await execAsync(`lpstat -a "${printerName}"`);
        const isAccepting = stdout.includes('accepting requests');
        
        return {
          connected: isAccepting,
          status: isAccepting ? 'connected' : 'not_accepting',
          lastSeen: isAccepting ? new Date().toISOString() : null
        };
      } catch (error) {
        return {
          connected: false,
          status: 'unreachable',
          lastSeen: null
        };
      }
      
    } catch (error) {
      return {
        connected: false,
        status: 'error',
        lastSeen: null
      };
    }
  }

  async testNetworkConnection(ip, port) {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 2000);

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

  detectPrinterType(device) {
    if (device.startsWith('usb://')) {
      return 'usb';
    } else if (device.startsWith('socket://')) {
      return 'network';
    } else if (device.includes('ipp://') || device.includes('ipps://')) {
      return 'ipp';
    } else if (device.includes('lpd://')) {
      return 'lpd';
    } else {
      return 'system';
    }
  }

  cleanup() {
    try {
      // Stop monitoring
      this.stopConnectionMonitoring();
      
      if (this.device) {
        this.device.close();
      }
      this.printer = null;
      this.device = null;
      this.isInitialized = false;
      console.log('🧹 Hardware controller cleaned up');
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  // Real-time Connection Monitoring Methods

  /**
   * Start monitoring printer connections in the background
   * OS-agnostic approach using CUPS status checks
   */
  startConnectionMonitoring(interval = 10000) {
    if (this.monitoringInterval) {
      console.log('📊 Monitoring already running');
      return;
    }

    console.log('🔍 Starting printer connection monitoring...');
    this.monitoringEnabled = true;
    
    this.monitoringInterval = setInterval(async () => {
      if (!this.monitoringEnabled) return;
      
      try {
        await this.checkAllPrinterConnections();
      } catch (error) {
        console.error('Monitoring check failed:', error);
      }
    }, interval);
  }

  /**
   * Stop connection monitoring
   */
  stopConnectionMonitoring() {
    if (this.monitoringInterval) {
      console.log('⏹️ Stopping printer connection monitoring');
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.monitoringEnabled = false;
  }

  /**
   * Check all configured printers for connection changes
   * Returns list of printers with changed status
   */
  async checkAllPrinterConnections() {
    const changedPrinters = [];
    
    try {
      // Get current system printer list
      const { stdout } = await execAsync('lpstat -p');
      const printerLines = stdout.split('\n').filter(line => line.trim() && line.startsWith('printer '));
      
      for (const line of printerLines) {
        const match = line.match(/printer\s+(\S+)\s+is\s+(\w+)/);
        if (match) {
          const [, name, status] = match;
          
          try {
            // Get device info and connectivity
            const { stdout: deviceInfo } = await execAsync(`lpstat -v "${name}"`);
            const deviceMatch = deviceInfo.match(/device for\s+\S+:\s*(.+)/);
            const device = deviceMatch ? deviceMatch[1].trim() : 'unknown';
            
            // Check connectivity based on device type
            const connectivity = await this.checkPrinterConnectivity(name, device);
            
            // Create current status object
            const currentStatus = {
              name,
              connected: connectivity.connected,
              status: status === 'idle' ? 'ready' : status,
              connectionStatus: connectivity.status,
              lastSeen: connectivity.lastSeen,
              device,
              type: this.detectPrinterType(device)
            };
            
            // Compare with last known status
            const lastStatus = this.lastKnownStatus.get(name);
            
            if (!lastStatus || 
                lastStatus.connected !== currentStatus.connected ||
                lastStatus.connectionStatus !== currentStatus.connectionStatus) {
              
              console.log(`🔄 Status change detected for ${name}:`, {
                was: lastStatus ? `${lastStatus.connected ? 'connected' : 'disconnected'}` : 'unknown',
                now: `${currentStatus.connected ? 'connected' : 'disconnected'}`
              });
              
              // Update last known status
              this.lastKnownStatus.set(name, currentStatus);
              
              // Add to changed list
              changedPrinters.push({
                ...currentStatus,
                previousStatus: lastStatus
              });
              
              // Notify callbacks
              this.notifyStatusChange(currentStatus, lastStatus);
            } else {
              // Update last seen time if still connected
              if (currentStatus.connected) {
                this.lastKnownStatus.set(name, currentStatus);
              }
            }
            
          } catch (error) {
            console.warn(`Error checking printer ${name}:`, error.message);
          }
        }
      }
      
    } catch (error) {
      console.error('Failed to check printer connections:', error);
    }
    
    return changedPrinters;
  }

  /**
   * Register callback for status changes
   */
  onStatusChange(callback) {
    this.statusChangeCallbacks.push(callback);
    return () => {
      const index = this.statusChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.statusChangeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Notify all callbacks of status changes
   */
  notifyStatusChange(currentStatus, previousStatus) {
    this.statusChangeCallbacks.forEach(callback => {
      try {
        callback({
          type: 'status-change',
          printer: currentStatus,
          previousStatus,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Status change callback error:', error);
      }
    });
  }

  /**
   * Enhanced connectivity check with OS-agnostic approaches
   */
  async checkPrinterConnectivity(printerName, device) {
    try {
      // Method 1: Check if printer is accepting jobs (works on all OS)
      let accepting = null;
      try {
        const { stdout: acceptingInfo } = await execAsync(`lpstat -a "${printerName}"`);
        accepting = acceptingInfo.includes('accepting requests');
      } catch (e) {
        accepting = false;
      }

      // Method 2: Device-specific checks
      if (device.startsWith('usb://')) {
        return await this.checkUSBConnectivity(device);
      } else if (device.startsWith('socket://')) {
        return await this.checkNetworkConnectivity(device);
      } else if (device.includes('ipp://') || device.includes('ipps://')) {
        return await this.checkIPPConnectivity(device);
      }
      
      // Method 3: Fallback - use accepting status
      return {
        connected: accepting === true,
        status: accepting ? 'connected' : 'not_accepting',
        lastSeen: accepting ? new Date().toISOString() : null
      };
      
    } catch (error) {
      return {
        connected: false,
        status: 'error',
        lastSeen: null
      };
    }
  }

  /**
   * OS-agnostic USB connectivity check
   */
  async checkUSBConnectivity(device) {
    try {
      // Cross-platform approach: Check if USB device is still enumerated
      const platform = process.platform;
      
      if (platform === 'darwin') {
        // macOS: Use lpinfo
        const { stdout } = await execAsync('lpinfo -v');
        const isPresent = stdout.includes(device.replace('usb://', ''));
        
        return {
          connected: isPresent,
          status: isPresent ? 'connected' : 'disconnected',
          lastSeen: isPresent ? new Date().toISOString() : null
        };
      } else if (platform === 'linux') {
        // Linux: Check /proc/bus/usb or use lsusb
        try {
          const { stdout } = await execAsync('lsusb');
          // Parse USB device info from device string
          const usbMatch = device.match(/usb:\/\/([^\/]+)\/([^?]+)/);
          if (usbMatch) {
            const [, vendor, product] = usbMatch;
            const isPresent = stdout.toLowerCase().includes(vendor.toLowerCase()) || 
                            stdout.toLowerCase().includes(product.toLowerCase());
            
            return {
              connected: isPresent,
              status: isPresent ? 'connected' : 'disconnected',
              lastSeen: isPresent ? new Date().toISOString() : null
            };
          }
        } catch (e) {
          // Fallback to lpinfo if available
          const { stdout } = await execAsync('lpinfo -v');
          const isPresent = stdout.includes(device.replace('usb://', ''));
          
          return {
            connected: isPresent,
            status: isPresent ? 'connected' : 'disconnected',
            lastSeen: isPresent ? new Date().toISOString() : null
          };
        }
      } else if (platform === 'win32') {
        // Windows: Use WMI or registry checks (fallback to lpstat)
        try {
          // Check if printer is still listed in Windows
          const { stdout } = await execAsync('wmic printer list brief');
          const isPresent = stdout.includes(device) || stdout.includes('USB');
          
          return {
            connected: isPresent,
            status: isPresent ? 'connected' : 'disconnected',
            lastSeen: isPresent ? new Date().toISOString() : null
          };
        } catch (e) {
          // Fallback
          return {
            connected: false,
            status: 'unknown',
            lastSeen: null
          };
        }
      }
      
      // Generic fallback for other platforms
      return {
        connected: false,
        status: 'unsupported_platform',
        lastSeen: null
      };
      
    } catch (error) {
      return {
        connected: false,
        status: 'check_failed',
        lastSeen: null
      };
    }
  }

  /**
   * Network connectivity check
   */
  async checkNetworkConnectivity(device) {
    try {
      const socketMatch = device.match(/socket:\/\/([^:]+):(\d+)/);
      if (socketMatch) {
        const [, ip, port] = socketMatch;
        const isReachable = await this.testNetworkConnection(ip, parseInt(port));
        
        return {
          connected: isReachable,
          status: isReachable ? 'connected' : 'network_unreachable',
          lastSeen: isReachable ? new Date().toISOString() : null
        };
      }
      
      return {
        connected: false,
        status: 'invalid_network_device',
        lastSeen: null
      };
      
    } catch (error) {
      return {
        connected: false,
        status: 'network_check_failed',
        lastSeen: null
      };
    }
  }

  /**
   * IPP connectivity check
   */
  async checkIPPConnectivity(device) {
    try {
      // Extract URL from IPP device string
      const url = new URL(device);
      const isReachable = await this.testNetworkConnection(url.hostname, url.port || 631);
      
      return {
        connected: isReachable,
        status: isReachable ? 'connected' : 'ipp_unreachable',
        lastSeen: isReachable ? new Date().toISOString() : null
      };
      
    } catch (error) {
      return {
        connected: false,
        status: 'ipp_check_failed',
        lastSeen: null
      };
    }
  }

  // Hardware monitoring methods
  async startRealtimeMonitoring() {
    if (this.isMonitoring) return;
    
    console.log('🚀 Starting real-time hardware monitoring...');
    
    // Set up event listeners
    this.hardwareMonitor.on('hardware-change', (event) => {
      console.log('Hardware change detected:', event);
      // Trigger printer list refresh when hardware changes
      this.onHardwareChange && this.onHardwareChange(event);
    });
    
    this.hardwareMonitor.on('error', (error) => {
      console.error('Hardware monitor error:', error);
    });
    
    await this.hardwareMonitor.start();
    this.isMonitoring = true;
  }

  async stopRealtimeMonitoring() {
    if (!this.isMonitoring) return;
    
    console.log('⏹️ Stopping real-time hardware monitoring...');
    this.hardwareMonitor.stop();
    this.isMonitoring = false;
  }

  setHardwareChangeCallback(callback) {
    this.onHardwareChange = callback;
  }

  getMonitoringStatus() {
    return {
      isMonitoring: this.isMonitoring,
      status: this.hardwareMonitor.getStatus()
    };
  }
}

module.exports = HardwareController;
