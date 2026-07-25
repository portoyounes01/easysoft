#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Receipt-printer vendors we can name from the USB vendor id (the scan on Windows
// cannot always read string descriptors — see detectUSBPrintersWindows).
const KNOWN_THERMAL_VENDORS = {
  0x2aaf: 'HPRT',   // the fleet's reference printer (TP80K) — also hardcoded in hardwareController
  0x0a5f: 'Zebra',
  0x0519: 'Star Micronics',
  0x1504: 'Bixolon',
  0x04b8: 'Epson',
};

class USBPrinterDetector {
  constructor() {
    this.foundPrinters = [];
  }

  async detectUSBPrinters() {
    // Windows has no CUPS (`lpinfo`); before this branch existed the exec below threw
    // and the catch returned [] — "Scan USB" reported 0 printers on EVERY Windows till.
    if (process.platform === 'win32') {
      return this.detectUSBPrintersWindows();
    }
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

  // Windows: enumerate over libusb (the `usb`/`escpos-usb` modules already ship in the
  // packaged build). Device + config descriptors come from Windows' cached copies, so
  // devices appear WITHOUT being opened — including printers bound to usbprint.sys
  // (the normal state for an installed printer). Opening is only attempted to read
  // the model/serial strings; when the Windows driver holds the device that open
  // fails, which is expected and MUST NOT hide the printer (that mistake would look
  // exactly like the old "0 printers found").
  async detectUSBPrintersWindows() {
    console.log('🔍 Detecting USB printers (Windows/libusb)...');
    let USB;
    try {
      USB = require('escpos-usb');
    } catch (error) {
      console.error('❌ escpos-usb unavailable on this shell:', error.message);
      return [];
    }
    let devices = [];
    try {
      // findPrinter filters usb.getDeviceList() to interface class 0x07 (printer)
      devices = USB.findPrinter() || [];
    } catch (error) {
      console.error('❌ USB enumeration failed:', error.message);
      return [];
    }

    const printers = [];
    for (const device of devices) {
      const dd = device.deviceDescriptor || {};
      const vid = dd.idVendor || 0;
      const pid = dd.idProduct || 0;
      const vidHex = `0x${vid.toString(16).padStart(4, '0')}`;
      const pidHex = `0x${pid.toString(16).padStart(4, '0')}`;
      const knownBrand = KNOWN_THERMAL_VENDORS[vid] || null;

      let model = '';
      let serial = '';
      let directAccess = false;
      try {
        device.open();
        const getStr = (index) => new Promise((resolve) => {
          if (!index) return resolve('');
          device.getStringDescriptor(index, (err, value) => resolve(err ? '' : String(value || '')));
        });
        model = await getStr(dd.iProduct);
        serial = await getStr(dd.iSerialNumber);
        // "Direct mode available" is only true if the PRINTER interface itself is
        // claimable — on composite devices open() can succeed while the printer
        // interface stays bound to usbprint.sys, and claim() is what proves it.
        try {
          const printerIface = (device.interfaces || []).find(
            (i) => i.descriptor && i.descriptor.bInterfaceClass === 0x07,
          );
          if (printerIface) {
            printerIface.claim();
            directAccess = true;
            await new Promise((resolve) => printerIface.release(() => resolve()));
          }
        } catch { /* interface driver-bound — 'windows-driver' it is */ }
        try { device.close(); } catch { /* already released */ }
      } catch {
        // usbprint.sys (or another Windows driver) owns the device — normal, not an error
      }

      const printer = {
        type: 'usb',
        brand: knownBrand || `USB printer ${vidHex}`,
        model: model || `${vidHex}:${pidHex}`,
        serial: serial || (directAccess ? 'unknown' : 'held by Windows driver'),
        uri: `usbwin://vid=${vidHex}&pid=${pidHex}`,
        isThermal: Boolean(knownBrand),
        recommended: Boolean(knownBrand),
        // 'winusb' → libusb can open it: direct ESC/POS mode possible.
        // 'windows-driver' → print through its Windows queue (System tab).
        driverState: directAccess ? 'winusb' : 'windows-driver',
      };
      console.log(`✅ Found USB printer: ${printer.brand} ${printer.model} (${printer.driverState})`);
      printers.push(printer);
    }
    this.foundPrinters = printers;
    return printers;
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

    if (process.platform === 'win32') {
      // CUPS lpadmin does not exist here; the controller routes usbwin:// URIs to
      // its own Windows connect path instead of this method.
      return { success: false, error: 'CUPS printer setup is not available on Windows' };
    }

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
