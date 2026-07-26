const escpos = require('escpos');
const os = require('os');
const usbModule = require('usb');

if (typeof usbModule.on !== 'function' && usbModule.usb && typeof usbModule.usb.on === 'function') {
  usbModule.on = usbModule.usb.on.bind(usbModule.usb);
}

const USB = require('escpos-usb');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const net = require('net');
const dns = require('dns');
const { parseCashDrawerStatus } = require('./cashDrawerStatus.js');
const { sendRawToWindowsPrinter, runPowerShell, warmWindowsRawPrintWorker, shutdownWindowsRawPrint } = require('./windowsRawPrint.js');

// Import our discovery classes
const NetworkPrinterDiscovery = require('../../discover-network-printers.js');
const ThermalPrinterIdentifier = require('../../identify-thermal-printers.js');
const AutoPrinterSetup = require('../../auto-printer-setup.js');
// const HardwareMonitorManager = require('../monitors/hardware-monitor-manager');

const execAsync = promisify(exec);

// printRaw payload guard. The renderer owns the receipt layout, so the bytes
// arrive from outside the shell: reject anything that is not plausibly a
// base64 ESC/POS job rather than handing junk to the spooler.
const MAX_RAW_PAYLOAD_BYTES = 512 * 1024;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function normalizeRawPayload(payload) {
  let buffer;
  if (typeof payload === 'string') {
    const compact = payload.replace(/\s/g, '');
    // Buffer.from(…, 'base64') silently drops invalid characters, so a typo
    // would print garbage instead of failing — check the alphabet first.
    if (!compact || !BASE64_RE.test(compact)) {
      throw new Error('printRaw expects base64-encoded bytes');
    }
    buffer = Buffer.from(compact, 'base64');
  } else if (Buffer.isBuffer(payload)) {
    buffer = payload;
  } else if (payload instanceof Uint8Array || Array.isArray(payload)) {
    buffer = Buffer.from(payload);
  } else {
    throw new Error('printRaw expects base64-encoded bytes');
  }
  if (buffer.length === 0) throw new Error('printRaw got an empty payload');
  if (buffer.length > MAX_RAW_PAYLOAD_BYTES) {
    throw new Error(`printRaw payload too large (${buffer.length} bytes, max ${MAX_RAW_PAYLOAD_BYTES})`);
  }
  return buffer;
}

class HardwareController {
  constructor(options = {}) {
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

    // App-wide printer-config SSOT: which transport carries receipts (and the
    // drawer kick, which rides the receipt printer). Set when the operator
    // picks a queue ("Use This" → setPrinterRole) or a direct-USB connect
    // succeeds; persisted to userData so a rebooted till remembers its printer.
    // Dispatch (printReceipt/openCashDrawer) and initialize() key on THIS —
    // never on bare object truthiness of a possibly-unopened USB handle.
    this.printerTransport = null; // 'windows-queue' | 'cups-queue' | 'direct-usb' | null (network rides discoveryMode)
    this.getUserDataDir = options.getUserDataDir || null;
    // In-flight guard: every caller of quickListPrinters shares one scan
    // instead of stacking a powershell.exe per remount/refresh click.
    this.quickListInFlight = null;
    // TTL for the configured-queue existence check: cashDrawerAuditService runs
    // initialize() before EVERY drawer command — one Get-Printer per 30s, not
    // one per cash sale.
    this.lastQueueCheckOkAt = null;
    
    // Cached printer list for instant display
    this.cachedPrinterList = [];
    this.lastCacheUpdate = null;
    
    // Hardware monitoring
    // this.hardwareMonitor = new HardwareMonitorManager();
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

    // MUST be the constructor's last statement: it assigns activePrinter/
    // printerName/printerTransport, and any field default below it would
    // silently clobber the restored values (three review agents independently
    // caught exactly that when this call sat mid-constructor).
    this.restorePersistedPrinterConfig();
  }

  /**
  * List system printers quickly without a full scan, but enrich each entry with:
  * - device URI and inferred type
  * - accepting status and queue size
  * - lightweight connectivity check
  * This enables the UI to differentiate stale/removed (ghost) printers that still
  * exist in CUPS or have queued jobs from actually reachable printers.
   */
  // Universal connectivity check for any printer type
  async checkPrinterConnectivityUniversal(printer) {
    try {
      if (printer.type === 'usb') {
        // Check USB device using serial number (universal approach)
        if (printer.device && printer.device.startsWith('usb://')) {
          // Extract serial number from URI (more reliable than vendor name)
          const serialMatch = printer.device.match(/serial=([^&]+)/);
          if (serialMatch) {
            const expectedSerial = serialMatch[1];
            
            // Get all USB devices and look for matching serial
            const { stdout } = await execAsync('system_profiler SPUSBDataType -json');
            const usbData = JSON.parse(stdout);
            
            const findBySerial = (items, targetSerial) => {
              if (!items) return false;
              return items.some(item => {
                if (item.serial_num && item.serial_num === targetSerial) {
                  return true;
                }
                return findBySerial(item._items, targetSerial);
              });
            };
            
            const connected = findBySerial(usbData.SPUSBDataType, expectedSerial);
            return {
              connected,
              status: connected ? 'connected' : 'offline',
              lastSeen: connected ? new Date().toISOString() : null
            };
          } else {
            // Fallback to vendor-based check if no serial
            const { stdout } = await execAsync('system_profiler SPUSBDataType -json');
            const usbData = JSON.parse(stdout);
            
            const findUSBDevice = (items, vendorName) => {
              if (!items) return false;
              return items.some(item => {
                if (item._name && item._name.toLowerCase().includes(vendorName.toLowerCase())) {
                  return true;
                }
                if (item.manufacturer && item.manufacturer.toLowerCase().includes(vendorName.toLowerCase())) {
                  return true;
                }
                return findUSBDevice(item._items, vendorName);
              });
            };
            
            const vendorMatch = printer.device.match(/usb:\/\/([^\/]+)/);
            if (vendorMatch) {
              const vendor = vendorMatch[1];
              const connected = findUSBDevice(usbData.SPUSBDataType, vendor);
              return {
                connected,
                status: connected ? 'connected' : 'offline',
                lastSeen: connected ? new Date().toISOString() : null
              };
            }
          }
        }
        
      } else if (printer.type === 'network') {
        // Network connectivity check with timeout
        const net = require('net');
        const match = printer.device.match(/(\d+\.\d+\.\d+\.\d+):(\d+)/);
        if (match) {
          const [_, ip, port] = match;
          
          return new Promise((resolve) => {
            const socket = net.createConnection({ host: ip, port: Number(port) }, () => {
              socket.destroy();
              resolve({
                connected: true,
                status: 'connected',
                lastSeen: new Date().toISOString()
              });
            });
            
            socket.on('error', () => {
              resolve({
                connected: false,
                status: 'offline',
                lastSeen: null
              });
            });
            
            setTimeout(() => {
              socket.destroy();
              resolve({
                connected: false,
                status: 'timeout',
                lastSeen: null
              });
            }, 500); // 0.5s timeout
          });
        }
      }
      
      // Default for unknown types
      return {
        connected: false,
        status: 'unknown',
        lastSeen: null
      };
      
    } catch (error) {
      return {
        connected: false,
        status: 'error',
        lastSeen: null,
        error: error.message
      };
    }
  }

  // Enhanced quick list with optional connectivity check
  async quickListPrintersWithStatus(checkConnectivity = false) {
    try {
      // First get the quick list
      const quickPrinters = await this.quickListPrinters();

      if (!checkConnectivity) {
        return quickPrinters;
      }

      // Windows: the quick list ALREADY carries honest per-queue status
      // (Get-Printer WorkOffline → connected/isStale). The universal probes
      // below are CUPS/macOS-shaped (usb:// URIs, system_profiler) and would
      // overwrite that honesty with connected:false for every queue.
      if (process.platform === 'win32') {
        return quickPrinters;
      }

      // Then check connectivity for each printer
      const printersWithStatus = await Promise.all(
        quickPrinters.map(async (printer) => {
          const connectivity = await this.checkPrinterConnectivityUniversal(printer);
          return {
            ...printer,
            connected: connectivity.connected,
            connectionStatus: connectivity.status,
            lastSeen: connectivity.lastSeen,
            isStale: !connectivity.connected
          };
        })
      );
      
      return printersWithStatus;
      
    } catch (error) {
      console.error('Quick list with status failed:', error);
      return [];
    }
  }

  // Instant printer list from cache - truly instant for UI
  getInstantPrinterList() {
    if (this.cachedPrinterList.length > 0) {
      // Return cached list with 'quick_list' status
      return this.cachedPrinterList.map(printer => ({
        ...printer,
        connectionStatus: 'quick_list',
        connected: true,
        status: 'unknown'
      }));
    }
    
    // If no cache, return empty array (will trigger async load)
    return [];
  }

  // Update cache when we get printer data
  updatePrinterCache(printers) {
    this.cachedPrinterList = printers.map(p => ({ ...p })); // Deep copy
    this.lastCacheUpdate = new Date();
  }

  // ---- Printer-config persistence (userData/printer-config.json, same pattern
  // as the scale's scale-config.json). Only the receipt role is persisted: the
  // drawer and status paths all hang off the receipt printer.
  printerConfigPath() {
    return this.getUserDataDir ? path.join(this.getUserDataDir(), 'printer-config.json') : null;
  }

  restorePersistedPrinterConfig() {
    try {
      const configPath = this.printerConfigPath();
      if (!configPath || !fs.existsSync(configPath)) return;
      const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const receipt = saved?.roles?.receipt;
      if (!receipt?.name) return;
      this.configuredPrinters.set(receipt.name, {
        ...(this.configuredPrinters.get(receipt.name) || {}),
        role: 'receipt',
        lastUpdated: saved.savedAt || null,
      });
      this.activePrinter = receipt.name;
      this.printerName = receipt.name;
      if (receipt.transport) this.printerTransport = receipt.transport;
      // isInitialized stays false here on purpose: initialize() validates the
      // queue still exists (fail-closed) before printing is declared ready.
      // Boot-time warm-up: compile the raw-print worker in the background so
      // even the first drawer kick of the day is instant.
      if (this.printerTransport === 'windows-queue') warmWindowsRawPrintWorker();
      console.log(`💾 Restored receipt printer from config: ${receipt.name} (${receipt.transport || 'unknown transport'})`);
    } catch (error) {
      console.error('Failed to restore printer config:', error.message);
    }
  }

  persistPrinterConfig() {
    try {
      const configPath = this.printerConfigPath();
      if (!configPath) return;
      const roles = {};
      if (this.activePrinter) {
        roles.receipt = { name: this.activePrinter, transport: this.printerTransport };
      }
      // Atomic write: tills lose power routinely; a half-written JSON must not
      // eat the configuration (restore treats parse failure as unconfigured).
      const tempPath = `${configPath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify({ roles, savedAt: new Date().toISOString() }, null, 2));
      fs.renameSync(tempPath, configPath);
    } catch (error) {
      console.error('Failed to persist printer config:', error.message);
    }
  }

  // Snapshot served over hardware:get-printer-config and pushed on
  // hardware:printer-config-changed — the renderer's app-wide printer SSOT.
  getPrinterConfigSnapshot() {
    let mode = null;
    if (this.discoveryMode === 'network' && this.networkPrinter) mode = 'network';
    else if (this.printerTransport) mode = this.printerTransport;
    else if (this.isInitialized) mode = process.platform === 'win32' ? 'windows-queue' : 'cups-queue';
    return {
      // Network mode: the discovered device's name, not the ctor default that
      // this.printerName may still carry.
      receiptPrinter: (mode === 'network' ? this.networkPrinter?.name : null)
        || this.activePrinter
        || (this.isInitialized ? this.printerName : null),
      mode,
      initialized: this.isInitialized,
      platform: process.platform,
    };
  }

  // Windows print-queue list, shared by listPrinters and quickListPrinters.
  // WorkOffline is the honest presence signal: Windows flips it when a USB
  // printer is unplugged, and ghost queues (printers installed years ago) sit
  // permanently offline — the old branches hardcoded connected:true, painting
  // every ghost green. StatusText via "$()" stringifies the enum so the value
  // is version-stable text ("Normal", "Offline", ...). The [Console] line
  // forces UTF-8 stdout: PowerShell 5.1 otherwise writes the OEM codepage and
  // accented queue names (Impressora Térmica) arrive as U+FFFD mojibake that
  // can never be targeted by OpenPrinter. runPowerShell (execFile-based)
  // sidesteps cmd.exe and its 8,191-char command-line cap entirely.
  async winListPrinterQueues() {
    const ps = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; '
      + 'Get-Printer | Select-Object -Property Name, DriverName, PortName, WorkOffline, '
      + '@{n=\'StatusText\';e={"$($_.PrinterStatus)"}} | ConvertTo-Json';
    const { stdout: winOut } = await runPowerShell(ps, { timeout: 15000 });
    if (!winOut.trim()) return [];
    const list = JSON.parse(winOut);
    const arr = Array.isArray(list) ? list : [list];
    return arr.map(p => {
      const statusText = String(p.StatusText || 'unknown');
      const offline = p.WorkOffline === true || /offline/i.test(statusText);
      return {
        name: p.Name,
        status: offline ? 'not_accepting' : (/^normal$/i.test(statusText) ? 'ready' : 'unknown'),
        device: p.PortName || p.DriverName || 'unknown',
        type: (p.PortName || '').toLowerCase().includes('usb') ? 'usb' : ((p.PortName || '').match(/\d+\.\d+\.\d+\.\d+/) ? 'network' : 'system'),
        role: this.configuredPrinters.get(p.Name)?.role || 'unassigned',
        isActive: this.activePrinter === p.Name,
        lastConnected: this.configuredPrinters.get(p.Name)?.lastConnected || null,
        connected: !offline,
        connectionStatus: offline ? 'offline' : statusText.toLowerCase(),
        lastSeen: null,
        hasQueuedJobs: false,
        queueCount: 0,
        // ghost/unplugged queues surface as stale instead of green "Connected"
        isStale: offline,
        source: 'system'
      };
    });
  }

  // Quick list without connectivity checks - for instant UI display
  async quickListPrinters() {
    // Shared in-flight scan: page mounts, Refresh clicks, and main.js's
    // cache-warm fire-and-forget all coalesce onto one child-process sweep
    // instead of stacking a fresh powershell/lpstat per trigger.
    if (this.quickListInFlight) return this.quickListInFlight;
    this.quickListInFlight = this.quickListPrintersUncoalesced()
      .finally(() => { this.quickListInFlight = null; });
    return this.quickListInFlight;
  }

  async quickListPrintersUncoalesced() {
    try {
      let stdout = '';
      try {
        ({ stdout } = await execAsync('lpstat -p'));
      } catch (e) {
        // Non-CUPS environment (likely Windows). Fallback to PowerShell.
        if (process.platform === 'win32') {
          const quickList = await this.winListPrinterQueues();
          this.updatePrinterCache(quickList);
          return quickList;
        }
        throw e;
      }
      
      const printerLines = stdout
        .split('\n')
        .filter(line => line.trim().startsWith('printer '));

      const names = printerLines.map(line => {
        const match = line.match(/printer\s+(\S+)/);
        return match ? match[1] : null;
      }).filter(Boolean);

      // Quick enrichment without connectivity checks
      const quickList = await Promise.all(
        names.map(async (name) => {
          let device = 'unknown';
          let type = 'unknown';
          let accepting = null;

          // Only get device URI (fast)
          try {
            const { stdout: deviceInfo } = await execAsync(`lpstat -v "${name}"`);
            const deviceMatch = deviceInfo.match(/device for\s+\S+:\s*(.+)/);
            device = deviceMatch ? deviceMatch[1].trim() : 'unknown';
            type = this.detectPrinterType(device);
          } catch (e) {
            // ignore, leave defaults
          }

          // Quick accepting status check (fast)
          try {
            const { stdout: acceptingInfo } = await execAsync(`lpstat -a "${name}"`);
            accepting = acceptingInfo.includes('accepting requests');
          } catch (e) {
            accepting = null;
          }

          return {
            name,
            status: 'default', // Use default status for quick list
            device,
            type,
            role: this.configuredPrinters.get(name)?.role || 'unassigned',
            isActive: this.activePrinter === name,
            lastConnected: this.configuredPrinters.get(name)?.lastConnected || null,
            connected: false, // Unknown status for quick display
            connectionStatus: 'quick_list',
            lastSeen: null,
            hasQueuedJobs: false, // Skip queue check for speed
            queueCount: 0,
            isStale: false,
            source: 'system'
          };
        })
      );

      // Cache the results for instant access
      this.updatePrinterCache(quickList);
      
      return quickList;
    } catch (error) {
      console.error('Quick list printers failed:', error);
      return [];
    }
  }

  async listPrinters() {
    try {
      let stdout = '';
      try {
        ({ stdout } = await execAsync('lpstat -p'));
      } catch (e) {
        // Non-CUPS environment (likely Windows). Fallback to PowerShell —
        // shared honest branch (WorkOffline-based; see winListPrinterQueues).
        if (process.platform === 'win32') {
          return await this.winListPrinterQueues();
        }
        throw e;
      }
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

  // Readiness for the PRINT/DRAWER entry points. A persisted queue selection is
  // a real configuration that simply has not been validated yet this boot
  // (restore leaves isInitialized false on purpose), so refusing outright would
  // strand the first drawer kick or receipt after every restart. Validates the
  // configured queue once (TTL-cached) and NEVER runs auto-discovery — an
  // unconfigured till still gets the old refusal.
  async ensureReady() {
    if (this.isInitialized) return { success: true };
    if (this.printerTransport === 'windows-queue' || this.printerTransport === 'cups-queue') {
      // Deliberately NO Get-Printer probe here. The spooler write is itself the
      // existence test and fails with a staged Win32 error ("OpenPrinter failed
      // (Win32 error 1801)") if the queue is gone, whereas probing first put a
      // cold PowerShell spawn (15s ceiling, wildcard-sensitive -Name matching)
      // in front of a physical action the operator is standing there waiting
      // for — and any hiccup in it swallowed the drawer kick entirely.
      // Fail-closed still holds where it matters: this cannot reroute anywhere,
      // the bytes go to the operator's configured queue by exact name.
      this.isInitialized = true;
      if (this.printerTransport === 'windows-queue') warmWindowsRawPrintWorker();
      return { success: true };
    }
    return { success: false, error: 'Hardware not initialized' };
  }

  async initialize() {
    try {
      console.log('🔧 Initializing hardware controller...');

      // A configured receipt QUEUE is the source of truth: validate it exists
      // and go. Re-running discovery here would (a) clobber the operator's
      // explicit "Use This" selection, (b) kick off a full network scan on
      // every drawer open (cashDrawerAuditService calls initialize() before
      // each drawer command), and (c) leave a half-open direct-USB handle that
      // crashed drawer kicks with "reading 'transfer'".
      if (this.printerTransport === 'windows-queue' || this.printerTransport === 'cups-queue') {
        const cacheFresh = this.lastQueueCheckOkAt && (Date.now() - this.lastQueueCheckOkAt < 30000);
        const queueCheck = cacheFresh ? { success: true } : await this.checkSystemPrinter();
        if (queueCheck.success) {
          // Stamp only on a REAL check — a sliding window would let sustained
          // sales keep an actually-deleted queue "fresh" forever.
          if (!cacheFresh) this.lastQueueCheckOkAt = Date.now();
          // Drop any stale auto-discovery network claim: dispatch checks the
          // network branch FIRST, so leaving it set would silently reroute
          // receipts away from the operator's configured queue.
          if (this.networkPrinter && this.networkPrinter.name !== this.printerName) {
            this.networkPrinter = null;
            if (this.discoveryMode === 'network') this.discoveryMode = 'auto';
          }
          this.isInitialized = true;
          // Pre-compile the raw-print worker so the first receipt/drawer job
          // of the shift doesn't pay the PowerShell+Add-Type cold start.
          if (this.printerTransport === 'windows-queue') warmWindowsRawPrintWorker();
          return {
            success: true,
            mode: 'configured-queue',
            message: `Using configured receipt printer: ${this.printerName}`,
            printer: this.printerName,
          };
        }
        // Fail CLOSED — never fall through to discovery here: auto-discovery
        // could claim whatever LAN device answers port 9100 and fiscal receipts
        // would silently reroute to it. If the queue is really gone the
        // operator re-picks it in Settings; isInitialized is left untouched so
        // a transient Get-Printer blip doesn't brick printing mid-shift.
        console.log(`⚠️ Configured queue "${this.printerName}" not found — staying on it (fail-closed)`);
        return {
          success: false,
          error: `Configured receipt printer "${this.printerName}" was not found (${queueCheck.error || 'queue check failed'}). Reselect it in Settings → Hardware → Printers if it was renamed or removed.`,
        };
      }

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

      // Assign to this.device/this.printer ONLY after open() succeeds:
      // dispatch in printReceipt/openCashDrawer keys on their truthiness, and
      // an unopened escpos-usb adapter has no endpoint — any write() crashes
      // with "Cannot read properties of undefined (reading 'transfer')".
      // (On Windows the driver-bound HPRT ALWAYS refuses open, so the old
      // assign-first code poisoned the state on every initialize().)
      const device = new USB(targetDevice);
      const printer = new escpos.Printer(device);

      try {
        await new Promise((resolve, reject) => {
          device.open((error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
      } catch (openError) {
        try { device.close(); } catch { /* releases the detach listener best-effort */ }
        throw openError;
      }

      this.device = device;
      this.printer = printer;
      this.printerTransport = 'direct-usb';

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
    // Windows: verify the configured queue exists via Get-Printer (lpstat is
    // CUPS-only). This is load-bearing for printing on Windows: initialize()'s
    // fallback chain reaches here, and its success is what sets isInitialized —
    // without this branch printReceipt/openCashDrawer refused with 'Hardware
    // not initialized' even though the winspool raw path was ready.
    if (process.platform === 'win32') {
      try {
        const psName = String(this.printerName ?? '').replace(/'/g, "''");
        // Exact-match against the queue list, NOT `Get-Printer -Name` — -Name
        // does WILDCARD matching, so a queue whose name contains [ ] * or ?
        // (which winspool's OpenPrinterW matches literally, and which therefore
        // prints perfectly) would report "not found" here.
        await runPowerShell(
          // Both strings single-quoted: in a double-quoted PS string a queue
          // name containing $ or a backtick would be evaluated, not compared.
          `if (-not (@(Get-Printer).Name -contains '${psName}')) { throw 'configured print queue not found' }`,
          { timeout: 15000 },
        );
        console.log(`✅ Windows print queue found: ${this.printerName}`);
        return { success: true, printer: this.printerName };
      } catch {
        return { success: false, error: `System printer "${this.printerName}" not found` };
      }
    }
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
      const ready = await this.ensureReady();
      if (!ready.success) {
        return { success: false, error: ready.error };
      }

      console.log('🖨️ Printing receipt...');

      if (this.discoveryMode === 'network' && this.networkPrinter) {
        // Network printer - use raw socket
        return await this.printViaNetwork(receiptData);
      } else if (this.printerTransport === 'direct-usb' && this.printer && this.device) {
        // Direct USB printing — only when direct USB is the CONFIGURED
        // transport, never on bare handle truthiness (a configured queue
        // must win even if a USB handle exists).
        return await this.printViaUSB(receiptData);
      } else {
        // System printer (queue) path
        return await this.printViaSystem(receiptData);
      }

    } catch (error) {
      console.error('Print receipt error:', error);
      return { success: false, error: error.message };
    }
  }

  /** Print caller-supplied ESC/POS bytes on the configured receipt printer.
   *
   *  The receipt LAYOUT lives in the renderer (one source of truth with the
   *  on-screen ThermalReceipt, and fiscal fields the shell knows nothing
   *  about); the shell owns only the transport. That split is deliberate —
   *  a receipt change then ships as a UI deploy instead of a fleet update.
   *
   *  `payload` is base64 (arrays/typed arrays tolerated for main-process
   *  callers). Never auto-retries: on Windows a delivered-but-unacknowledged
   *  job comes back as { outcomeUnknown: true } so a human decides, because a
   *  blind resend double-prints a fiscal document. */
  async printRaw(payload) {
    try {
      const buffer = normalizeRawPayload(payload);

      const ready = await this.ensureReady();
      if (!ready.success) {
        return { success: false, error: ready.error };
      }

      console.log(`🖨️ Printing raw ESC/POS job (${buffer.length} bytes)...`);
      return await this.sendRawBytes(buffer);
    } catch (error) {
      console.error('Raw print error:', error);
      return {
        success: false,
        error: error.message,
        outcomeUnknown: error.outcomeUnknown === true,
      };
    }
  }

  /** Transport dispatch shared by printRaw — same branch order as printReceipt
   *  and openCashDrawer (network → configured direct USB → system queue), with
   *  the caller's bytes in place of generateReceiptCommands(). */
  async sendRawBytes(buffer) {
    if (this.discoveryMode === 'network' && this.networkPrinter) {
      await this.sendToNetworkPrinter(buffer);
      console.log(`✅ Raw job printed via network (${this.networkPrinter.ip})`);
      return { success: true, method: 'network' };
    }

    if (this.printerTransport === 'direct-usb' && this.printer && this.device) {
      await new Promise((resolve, reject) => {
        this.device.write(buffer, (error) => (error ? reject(error) : resolve()));
      });
      console.log('✅ Raw job printed via USB');
      return { success: true, method: 'usb' };
    }

    if (process.platform === 'win32') {
      await sendRawToWindowsPrinter(this.printerName, buffer);
      console.log(`✅ Raw job printed via Windows spooler (${this.printerName})`);
      return { success: true, method: 'system-windows' };
    }

    // CUPS. Temp file goes to the OS temp dir, not next to __dirname: in a
    // packaged app that path is inside the read-only asar.
    const tempFile = path.join(os.tmpdir(), `pos-escpos-${process.pid}-${Date.now()}.bin`);
    fs.writeFileSync(tempFile, buffer);
    try {
      const { stdout } = await execAsync(`lp -d "${this.printerName}" -o raw "${tempFile}"`);
      console.log(`✅ Raw job printed via CUPS. Job ID: ${stdout.trim()}`);
      return { success: true, method: 'system', jobId: stdout.trim() };
    } finally {
      try { fs.unlinkSync(tempFile); } catch { /* best effort */ }
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

      // Windows: raw bytes go through winspool (the CUPS `lp -o raw` equivalent) —
      // `lp` does not exist there, so before this branch the system fallback could
      // never print on a Windows till.
      if (process.platform === 'win32') {
        await sendRawToWindowsPrinter(this.printerName, Buffer.from(commands));
        console.log(`✅ Receipt printed via Windows spooler (${this.printerName})`);
        return { success: true, method: 'system-windows' };
      }

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
      const ready = await this.ensureReady();
      if (!ready.success) {
        return { success: false, error: ready.error };
      }

      console.log('💰 Opening cash drawer...');
      
      const commandType = options.command || 'standard';
      const commands = this.commands.cashDrawer[commandType] || this.commands.cashDrawer.standard;

      if (this.discoveryMode === 'network' && this.networkPrinter) {
        // Network printer - send raw commands
        return await this.openDrawerViaNetwork(commands);
      } else if (this.printerTransport === 'direct-usb' && this.printer && this.device) {
        // Direct USB control — same transport-first rule as printReceipt.
        return await this.openDrawerViaUSB(commands);
      } else {
        // System printer (queue) path — on win32 this is the same winspool
        // transport the receipts use.
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
      // Windows: same winspool raw path as receipts (drawer kick = ESC/POS pulse
      // through the receipt printer).
      if (process.platform === 'win32') {
        await sendRawToWindowsPrinter(this.printerName, Buffer.from(commands));
        console.log(`✅ Cash drawer opened via Windows spooler (${this.printerName})`);
        return { success: true, method: 'system-windows' };
      }

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
      console.log('📊 Checking drawer status...');

      if (!this.isInitialized) {
        return { success: false, status: 'unknown', error: 'Hardware not initialized' };
      }

      let result;

      if (this.discoveryMode === 'network' && this.networkPrinter) {
        result = await this.getDrawerStatusViaNetwork();
      } else if (this.printerTransport === 'windows-queue' || this.printerTransport === 'cups-queue') {
        // Spooler transport is write-only: the DLE EOT status byte needs a
        // readable USB endpoint the print queue does not expose. Be honest
        // instead of re-running USB init (which used to poison the dispatch
        // state for the NEXT drawer open on driver-bound printers).
        return {
          success: false,
          status: 'unknown',
          error: `Drawer status readback is not available through the "${this.printerName}" print queue (write-only). Opening the drawer still works.`,
        };
      } else {
        if (!this.device || !this.device.device) {
          const initialization = await this.initializeUSBPrinter();
          if (!initialization.success) {
            return {
              success: false,
              status: 'unknown',
              error: initialization.error || 'Could not establish a direct USB status connection',
            };
          }

          this.discoveryMode = 'usb';
        }

        result = await this.getDrawerStatusViaUSB();
      }

      if (result.success) {
        console.log(
          `💵 Cash drawer state: ${result.status.toUpperCase()} ` +
          `(signal: ${result.signal}, raw: ${result.rawStatus}, method: ${result.method})`
        );
      } else {
        console.error(`Cash drawer state check failed: ${result.error}`);
      }

      return result;

    } catch (error) {
      console.error('Get drawer status error:', error);
      return { 
        success: false, 
        status: 'unknown',
        error: error.message 
      };
    }
  }

  async getDrawerStatusViaUSB() {
    const rawDevice = this.device && this.device.device;
    const inputEndpoint = rawDevice && rawDevice.interfaces
      .flatMap((usbInterface) => usbInterface.endpoints || [])
      .find((endpoint) => endpoint.direction === 'in');

    if (!inputEndpoint) {
      return {
        success: false,
        status: 'unknown',
        error: 'USB printer does not expose a readable status endpoint',
      };
    }

    return new Promise((resolve) => {
      let settled = false;
      inputEndpoint.timeout = 2000;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      };

      const timeout = setTimeout(() => {
        finish({
          success: false,
          status: 'unknown',
          error: 'Timed out waiting for the cash drawer status byte',
        });
      }, 2500);

      this.device.write(Buffer.from([0x10, 0x04, 0x01]), (writeError) => {
        if (writeError) {
          finish({ success: false, status: 'unknown', error: writeError.message });
          return;
        }

        const readStatusByte = () => {
          if (settled) return;

          inputEndpoint.transfer(64, (readError, data) => {
            if (readError) {
              finish({ success: false, status: 'unknown', error: readError.message });
              return;
            }

            if (!data || data.length === 0) {
              readStatusByte();
              return;
            }

            finish({ success: true, method: 'usb', ...parseCashDrawerStatus(data[0]) });
          });
        };

        readStatusByte();
      });
    });
  }

  async getDrawerStatusViaNetwork() {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };

      socket.setTimeout(2000);
      socket.once('connect', () => socket.write(Buffer.from([0x10, 0x04, 0x01])));
      socket.once('data', (data) => {
        if (!data || data.length === 0) {
          finish({ success: false, status: 'unknown', error: 'Printer returned an empty status response' });
          return;
        }

        finish({ success: true, method: 'network', ...parseCashDrawerStatus(data[0]) });
      });
      socket.once('timeout', () => {
        finish({ success: false, status: 'unknown', error: 'Timed out waiting for the cash drawer status byte' });
      });
      socket.once('error', (error) => {
        finish({ success: false, status: 'unknown', error: error.message });
      });
      socket.connect(this.networkPrinter.port, this.networkPrinter.ip);
    });
  }

  async testPrinter() {
    try {
      const ready = await this.ensureReady();
      if (!ready.success) {
        return { success: false, error: ready.error };
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
      const diagnostics = detector.lastScanDiagnostics || [];

      if (usbPrinters.length === 0) {
        return {
          success: true,
          printers: [],
          diagnostics,
          message: diagnostics.length
            ? `No USB printers found — ${diagnostics.join(' · ')}`
            : 'No USB printers found'
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
        confidence: printer.isThermal ? 90 : 50,
        // Windows only: 'winusb' (direct mode possible) | 'windows-driver' (use its queue)
        ...(printer.driverState ? { driverState: printer.driverState } : {})
      }));

      console.log(`✅ Found ${formattedPrinters.length} USB printer(s)`);
      
      return {
        success: true,
        printers: formattedPrinters,
        diagnostics,
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

      // Windows scan results carry usbwin:// URIs — no CUPS on that platform.
      if (typeof uri === 'string' && uri.startsWith('usbwin://')) {
        return await this.connectToWindowsUSBPrinter(uri, printerName);
      }

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

  // Windows direct-USB connect: only possible when libusb can OPEN the device, i.e.
  // it carries a WinUSB-class driver. A printer installed normally (usbprint.sys)
  // refuses the open — that is not a dead end: its Windows print QUEUE is the
  // supported transport (System tab + raw spooler), so the error says exactly that.
  async connectToWindowsUSBPrinter(uri, printerName) {
    try {
      const m = uri.match(/vid=0x([0-9a-f]{1,4})&pid=0x([0-9a-f]{1,4})/i);
      if (!m) return { success: false, error: 'Invalid Windows USB printer URI' };
      const vid = parseInt(m[1], 16);
      const pid = parseInt(m[2], 16);

      const devices = USB.findPrinter() || [];
      const target = devices.find(d =>
        d.deviceDescriptor && d.deviceDescriptor.idVendor === vid && d.deviceDescriptor.idProduct === pid);
      if (!target) return { success: false, error: 'That USB printer is no longer attached' };

      const device = new USB(target);
      await new Promise((resolve, reject) => device.open((err) => (err ? reject(err) : resolve())));

      this.device = device;
      this.printer = new escpos.Printer(device);
      this.discoveryMode = 'usb';
      this.printerTransport = 'direct-usb';
      this.isInitialized = true;

      const name = printerName || `USB_${m[1]}_${m[2]}`;
      this.configuredPrinters.set(name, {
        type: 'usb',
        uri,
        role: 'unassigned',
        lastConnected: new Date().toISOString(),
        connectionMethod: 'usb_direct',
      });
      if (!this.activePrinter) this.activePrinter = name;

      console.log(`✅ Direct USB (WinUSB) printer connected: ${name}`);
      return { success: true, printerName: name, message: `Direct USB connection to ${name} established` };
    } catch (error) {
      console.error('Windows direct-USB connect failed:', error.message);
      return {
        success: false,
        error: `Windows holds this printer through its print driver (${error.message}). `
          + 'Use its Windows print queue instead: System tab → select the printer → Use This. '
          + '(Direct mode would require replacing the driver with WinUSB via Zadig — not needed for normal printing.)',
      };
    }
  }

  // Multiple Printer Management Methods
  async getConfiguredPrinters() {
    try {
      console.log('📋 Getting configured printers...');

      // Windows: derive from the honest queue list (Get-Printer + WorkOffline)
      // — the CUPS lpstat path below throws on win32 and used to make this
      // handler useless on exactly the platform where roles are assigned.
      if (process.platform === 'win32') {
        const queues = await this.winListPrinterQueues();
        return {
          success: true,
          printers: queues,
          count: queues.length,
          connectedCount: queues.filter(p => p.connected).length
        };
      }

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
        // A held direct-USB device would otherwise keep winning in printReceipt/
        // openCashDrawer and silently ignore this selection.
        if (this.printer && this.device) {
          try { this.device.close(); } catch { /* already released */ }
          this.printer = null;
          this.device = null;
        }
        // "Use This" targets a system print queue on every platform — record
        // the transport so dispatch and initialize() honor the selection.
        this.printerTransport = process.platform === 'win32' ? 'windows-queue' : 'cups-queue';
        // Drop a prior auto-discovery network claim (dispatch checks it first)
        // unless the operator selected the network printer itself.
        if (this.networkPrinter && this.networkPrinter.name !== printerName) {
          this.networkPrinter = null;
          if (this.discoveryMode === 'network') this.discoveryMode = 'auto';
        }
        // New selection → next initialize() re-validates the queue for real.
        this.lastQueueCheckOkAt = null;
        // Windows: the queue IS the transport — selecting it makes printing
        // ready immediately (initialize()'s checkSystemPrinter branch confirms
        // it on the next boot).
        if (process.platform === 'win32') {
          this.isInitialized = true;
          // Warm the raw-print worker: the operator will test-print next, and
          // the first sale shouldn't pay the compile either.
          warmWindowsRawPrintWorker();
        }
        // Survive app restarts: the till remembers its printer without anyone
        // reopening the setup dialog.
        this.persistPrinterConfig();
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

      // Remove from CUPS (macOS/Linux). On Windows we only manage OUR config —
      // deleting the OS print queue is the operator's call, not the POS's.
      if (process.platform !== 'win32') {
        await execAsync(`lpadmin -x "${printerName}"`);
      }
      
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
            // The promoted printer's own transport, not the removed one's.
            this.printerTransport = config.connectionMethod === 'usb_direct'
              ? 'direct-usb'
              : (process.platform === 'win32' ? 'windows-queue' : 'cups-queue');
            break;
          }
        }
        if (!this.activePrinter) this.printerTransport = null;
        this.lastQueueCheckOkAt = null;
        this.persistPrinterConfig();
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
      
      // Windows: raw text + feed/cut through winspool (`lp` is CUPS-only).
      if (process.platform === 'win32') {
        const cut = Buffer.from([0x0a, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00]); // feeds + GS V full cut
        await sendRawToWindowsPrinter(printerName, Buffer.concat([Buffer.from(testContent, 'utf8'), cut]));
        return {
          success: true,
          message: `Test print sent to ${printerName}`,
          jobInfo: 'windows-spooler'
        };
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

      shutdownWindowsRawPrint(); // no-op when no worker was ever started

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
    
    console.log('🚀 Hardware monitoring temporarily disabled (missing hardware-monitor-manager)');
    this.isMonitoring = true;
    
    // TODO: Re-enable when hardware-monitor-manager is available
    /*
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
    */
  }

  async stopRealtimeMonitoring() {
    if (!this.isMonitoring) return;
    
    console.log('⏹️ Stopping real-time hardware monitoring...');
    // this.hardwareMonitor.stop();
    this.isMonitoring = false;
  }

  setHardwareChangeCallback(callback) {
    this.onHardwareChange = callback;
  }

  getMonitoringStatus() {
    return {
      isMonitoring: this.isMonitoring,
      status: null // this.hardwareMonitor.getStatus()
    };
  }
}

module.exports = HardwareController;
