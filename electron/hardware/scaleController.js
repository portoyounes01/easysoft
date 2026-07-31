// Weighing-scale controller for the Electron main process.
//
// Owns the serial port for a CAS PR-II scale: probe-based COM-port
// auto-detection (the scale proves itself by answering ENQ+DC1 with a valid
// weight frame), a poll loop that streams readings to the renderer, and
// automatic re-detection when the scale goes silent. Config persists to a
// JSON file in userData so the till remembers the last-known-good port.
//
// serialport is required lazily and every failure is reported through the
// { success, error } envelope — a broken native binding or missing scale must
// degrade to manual weight entry, never crash the till.

const fs = require('fs');
const path = require('path');
const { ENQ, DC1, parseScaleFrame, isValidScaleReply } = require('./casScale');

const CONFIG_FILE = 'scale-config.json';
const DEFAULT_CONFIG = {
  enabled: true,
  port: 'auto', // 'auto' = probe scan; anything else forces that port
  baud: 9600,
  lastGoodPort: null,
  lastGoodBaud: null,
};

// 9600 first: it is the CAS factory default, so the first pass across all
// ports finds a normally-configured scale in one sweep.
const PROBE_BAUDS = [9600, 4800, 2400, 19200, 1200];
const ENQ_TO_DC1_MS = 120;
const REPLY_WAIT_MS = 300;
const POLL_GAP_MS = 200;
const MAX_CONSECUTIVE_MISSES = 6;
const REDETECT_DELAY_MS = 5000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Sleep in short steps so stop() interrupts long waits within ~250ms.
async function sleepWhile(predicate, ms) {
  const step = 250;
  for (let waited = 0; waited < ms && predicate(); waited += step) {
    await delay(Math.min(step, ms - waited));
  }
}

class ScaleController {
  constructor({ getUserDataDir, mock = process.env.SCALE_MOCK === '1' } = {}) {
    this.getUserDataDir = getUserDataDir;
    this.mock = mock;
    this.config = null;
    this.SerialPort = null;
    this.serialModuleError = null;
    this.port = null;
    this.portPath = null;
    this.portBaud = null;
    this.polling = false;
    this.pollPromise = null;
    this.stopPromise = null;
    this.state = 'idle'; // idle | detecting | connected | disconnected | error
    this.lastReading = null;
    this.lastError = null;
    this.emitter = { reading: null, status: null };
  }

  // --- config -------------------------------------------------------------

  // Resolved lazily: app.getPath is only reliable once the app is ready.
  configPath() {
    return path.join(this.getUserDataDir(), CONFIG_FILE);
  }

  getConfig() {
    if (!this.config) {
      this.config = { ...DEFAULT_CONFIG };
      try {
        const raw = fs.readFileSync(this.configPath(), 'utf8');
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      } catch {
        // Missing or corrupt file -> defaults.
      }
    }
    return this.config;
  }

  async setConfig(patch) {
    const prev = this.getConfig();
    const next = { ...prev };
    if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled;
    if (typeof patch.port === 'string' && patch.port.trim()) next.port = patch.port.trim();
    if (Number.isInteger(patch.baud) && patch.baud > 0) next.baud = patch.baud;
    try {
      fs.writeFileSync(this.configPath(), JSON.stringify(next, null, 2));
    } catch (e) {
      // Memory keeps the old config so main process and renderer stay agreed.
      return { success: false, error: `Could not save scale config: ${e.message}`, config: prev };
    }
    this.config = next;
    // A live session must follow the new config: disable stops it, a
    // port/baud change reconnects it.
    const changed = next.port !== prev.port || next.baud !== prev.baud;
    if (this.polling && (!next.enabled || changed)) {
      await this.stop();
      if (next.enabled) await this.start();
    }
    return { success: true, config: next };
  }

  rememberGoodPort(portPath, baud) {
    this.config = { ...this.getConfig(), lastGoodPort: portPath, lastGoodBaud: baud };
    try {
      fs.writeFileSync(this.configPath(), JSON.stringify(this.config, null, 2));
    } catch {
      // Non-fatal: detection just takes longer next boot.
    }
  }

  // --- serial module ------------------------------------------------------

  loadSerialPort() {
    if (this.mock) {
      if (!this.SerialPort) this.SerialPort = createMockSerialPort();
      return this.SerialPort;
    }
    if (this.SerialPort) return this.SerialPort;
    if (this.serialModuleError) return null;
    try {
      this.SerialPort = require('serialport').SerialPort;
      return this.SerialPort;
    } catch (e) {
      this.serialModuleError = `serialport module failed to load: ${e.message}`;
      this.setState('error', this.serialModuleError);
      return null;
    }
  }

  async listPorts() {
    const SerialPort = this.loadSerialPort();
    if (!SerialPort) {
      return { success: false, error: this.serialModuleError, ports: [] };
    }
    try {
      const ports = await SerialPort.list();
      return {
        success: true,
        ports: ports.map((p) => ({
          path: p.path,
          manufacturer: p.manufacturer ?? null,
          vendorId: p.vendorId ?? null,
          productId: p.productId ?? null,
        })),
      };
    } catch (e) {
      return { success: false, error: e.message, ports: [] };
    }
  }

  // --- low-level port helpers ----------------------------------------------

  openPort(portPath, baud) {
    const SerialPort = this.loadSerialPort();
    if (!SerialPort) {
      return Promise.reject(new Error(this.serialModuleError));
    }
    return new Promise((resolve, reject) => {
      const port = new SerialPort({
        path: portPath,
        baudRate: baud,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        autoOpen: false,
      });
      port.open((openErr) => {
        if (openErr) {
          reject(openErr);
          return;
        }
        // The CAS scale only answers when DTR and RTS are raised.
        port.set({ dtr: true, rts: true }, (setErr) => {
          if (setErr) {
            port.close(() => reject(setErr));
            return;
          }
          resolve(port);
        });
      });
    });
  }

  closePort(port) {
    return new Promise((resolve) => {
      if (!port || !port.isOpen) {
        resolve();
        return;
      }
      port.close(() => resolve());
    });
  }

  writeBytes(port, bytes) {
    return new Promise((resolve, reject) => {
      port.write(Buffer.from(bytes), (err) => (err ? reject(err) : resolve()));
    });
  }

  flushPort(port) {
    return new Promise((resolve) => {
      port.flush(() => resolve());
    });
  }

  // One ENQ -> DC1 -> collect-reply exchange. Also catches free-streaming
  // scales: anything the port sends inside the wait window is collected.
  async pollCycle(port) {
    const chunks = [];
    const onData = (chunk) => chunks.push(chunk);
    port.on('data', onData);
    try {
      await this.writeBytes(port, [ENQ]);
      await delay(ENQ_TO_DC1_MS);
      await this.writeBytes(port, [DC1]);
      await delay(REPLY_WAIT_MS);
    } finally {
      port.removeListener('data', onData);
    }
    return Buffer.concat(chunks);
  }

  // --- detection ------------------------------------------------------------

  classifyOpenError(err) {
    const message = String(err && err.message ? err.message : err).toLowerCase();
    if (
      message.includes('access denied') ||
      message.includes('resource busy') ||
      message.includes('in use') ||
      message.includes('permission denied') ||
      message.includes('locked')
    ) {
      return 'busy';
    }
    return 'error';
  }

  async probePort(portPath, baud) {
    let port;
    try {
      port = await this.openPort(portPath, baud);
    } catch (e) {
      return { port: portPath, baud, outcome: this.classifyOpenError(e), detail: e.message };
    }
    try {
      await this.flushPort(port);
      const reply = await this.pollCycle(port);
      if (isValidScaleReply(reply)) {
        return { port: portPath, baud, outcome: 'answered', reply: parseScaleFrame(reply).raw };
      }
      return {
        port: portPath,
        baud,
        outcome: 'silent',
        detail: reply.length > 0 ? `unrecognized reply (${reply.length} bytes)` : undefined,
      };
    } catch (e) {
      return { port: portPath, baud, outcome: 'error', detail: e.message };
    } finally {
      await this.closePort(port);
    }
  }

  // Scan for the scale. Remembered port first, then every port at the likely
  // baud, then the remaining bauds. Returns per-port results for diagnostics.
  // shouldAbort lets the poll loop's re-detection bail out when stop() is
  // called mid-scan (a full scan can take tens of seconds).
  async detect(shouldAbort = () => false) {
    const SerialPort = this.loadSerialPort();
    if (!SerialPort) {
      return { success: false, found: false, error: this.serialModuleError, results: [] };
    }

    const config = this.getConfig();
    const results = [];
    const unusable = new Set(); // ports that failed to open; skip on later bauds

    let listed;
    try {
      listed = await SerialPort.list();
    } catch (e) {
      return { success: false, found: false, error: e.message, results: [] };
    }
    const paths = listed.map((p) => p.path);
    if (paths.length === 0) {
      return { success: true, found: false, results: [] };
    }

    const bauds = [...new Set([config.baud, ...PROBE_BAUDS])];
    const candidates = [];
    if (config.lastGoodPort && paths.includes(config.lastGoodPort)) {
      candidates.push({ port: config.lastGoodPort, baud: config.lastGoodBaud ?? config.baud });
    }
    for (const baud of bauds) {
      for (const portPath of paths) {
        candidates.push({ port: portPath, baud });
      }
    }

    const tried = new Set();
    for (const { port: portPath, baud } of candidates) {
      if (shouldAbort()) {
        return { success: true, found: false, aborted: true, results };
      }
      const key = `${portPath}@${baud}`;
      if (tried.has(key) || unusable.has(portPath)) continue;
      tried.add(key);

      const result = await this.probePort(portPath, baud);
      results.push(result);
      if (result.outcome === 'answered') {
        this.rememberGoodPort(portPath, baud);
        return { success: true, found: true, port: portPath, baud, results };
      }
      if (result.outcome === 'busy' || result.outcome === 'error') {
        unusable.add(portPath);
      }
    }
    return { success: true, found: false, results };
  }

  // --- polling ---------------------------------------------------------------

  setEmitter({ reading, status }) {
    this.emitter = { reading: reading ?? null, status: status ?? null };
  }

  setState(state, error = null) {
    this.state = state;
    this.lastError = error;
    if (this.emitter.status) {
      try {
        this.emitter.status(this.getStatus().status);
      } catch {
        // Renderer gone; the next start() re-wires the emitter.
      }
    }
  }

  getStatus() {
    return {
      success: true,
      status: {
        state: this.state,
        polling: this.polling,
        port: this.portPath,
        baud: this.portBaud,
        mock: this.mock,
        lastReading: this.lastReading,
        lastError: this.lastError,
      },
    };
  }

  async resolvePort(shouldAbort = () => false) {
    const config = this.getConfig();
    if (config.port !== 'auto') {
      return { found: true, port: config.port, baud: config.baud };
    }
    this.setState('detecting');
    const detection = await this.detect(shouldAbort);
    if (!detection.success) {
      return { found: false, error: detection.error };
    }
    if (!detection.found) {
      return { found: false, error: 'No scale detected on any serial port' };
    }
    return { found: true, port: detection.port, baud: detection.baud };
  }

  async start() {
    if (!this.getConfig().enabled) {
      return { success: false, error: 'Scale is disabled in configuration' };
    }
    const SerialPort = this.loadSerialPort();
    if (!SerialPort) {
      return { success: false, error: this.serialModuleError };
    }
    // Drain any in-flight stop and any winding-down loop before launching:
    // otherwise flipping this.polling back to true resurrects the old loop
    // (two loops on one port, and the stop() await never resolves).
    if (this.stopPromise) {
      await this.stopPromise.catch(() => {});
    }
    if (this.polling) {
      return { success: true, alreadyRunning: true };
    }
    if (this.pollPromise) {
      await this.pollPromise.catch(() => {});
      if (this.polling) {
        return { success: true, alreadyRunning: true };
      }
    }
    this.polling = true;
    this.pollPromise = this.runPollLoop();
    return { success: true };
  }

  async runPollLoop() {
    let misses = 0;
    while (this.polling) {
      if (!this.port) {
        const resolved = await this.resolvePort(() => !this.polling);
        if (!this.polling) break;
        if (!resolved.found) {
          this.setState('disconnected', resolved.error);
          await sleepWhile(() => this.polling, REDETECT_DELAY_MS);
          continue;
        }
        try {
          this.port = await this.openPort(resolved.port, resolved.baud);
          this.portPath = resolved.port;
          this.portBaud = resolved.baud;
          this.port.on('error', () => {
            // Surfaces on unplug mid-poll; the loop notices via isOpen below.
          });
          misses = 0;
          this.setState('connected');
        } catch (e) {
          this.port = null;
          this.setState('disconnected', e.message);
          await sleepWhile(() => this.polling, REDETECT_DELAY_MS);
          continue;
        }
      }

      try {
        if (!this.port.isOpen) {
          throw new Error('Serial port closed unexpectedly');
        }
        await this.flushPort(this.port);
        const reply = await this.pollCycle(this.port);
        const reading = parseScaleFrame(reply);
        if (reading) {
          misses = 0;
          this.lastReading = { ...reading, timestamp: new Date().toISOString() };
          if (this.state !== 'connected') this.setState('connected');
          if (this.emitter.reading) {
            try {
              this.emitter.reading(this.lastReading);
            } catch {
              // Renderer gone; keep polling so status stays current.
            }
          }
        } else {
          misses += 1;
          if (misses >= MAX_CONSECUTIVE_MISSES) {
            // Scale unplugged or powered off: drop the port and re-detect.
            await this.closePort(this.port);
            this.port = null;
            this.portPath = null;
            this.portBaud = null;
            this.setState('disconnected', 'Scale stopped responding');
          }
        }
      } catch (e) {
        await this.closePort(this.port);
        this.port = null;
        this.portPath = null;
        this.portBaud = null;
        this.setState('disconnected', e.message);
        await sleepWhile(() => this.polling, REDETECT_DELAY_MS);
        continue;
      }

      await delay(POLL_GAP_MS);
    }
  }

  stop() {
    // Latched so concurrent stop() calls share one teardown, and start()
    // can await an in-flight stop instead of racing it.
    if (this.stopPromise) {
      return this.stopPromise;
    }
    this.stopPromise = (async () => {
      this.polling = false;
      if (this.pollPromise) {
        await this.pollPromise.catch(() => {});
        this.pollPromise = null;
      }
      await this.closePort(this.port);
      this.port = null;
      this.portPath = null;
      this.portBaud = null;
      this.setState('idle');
      return { success: true };
    })().finally(() => {
      this.stopPromise = null;
    });
    return this.stopPromise;
  }

  // Single reading. While a session is live the poll loop owns the port
  // exclusively — serve its cached reading (at most one cycle old) instead of
  // interleaving a competing ENQ/DC1 exchange that could split frames.
  // Standalone open -> poll -> close only when no session exists, so
  // diagnostics work without one.
  async readOnce() {
    if (this.polling) {
      if (this.state === 'connected' && this.lastReading) {
        return { success: true, reading: this.lastReading };
      }
      return { success: false, error: this.lastError || 'Scale is reconnecting' };
    }

    const resolved = await this.resolvePort();
    if (!resolved.found) {
      this.setState('disconnected', resolved.error);
      return { success: false, error: resolved.error };
    }
    let port;
    try {
      port = await this.openPort(resolved.port, resolved.baud);
    } catch (e) {
      this.setState('disconnected', e.message);
      return { success: false, error: e.message };
    }
    try {
      await this.flushPort(port);
      const reply = await this.pollCycle(port);
      const reading = parseScaleFrame(reply);
      if (!reading) {
        this.setState('disconnected', 'No response from scale');
        return { success: false, error: 'No response from scale' };
      }
      this.lastReading = { ...reading, timestamp: new Date().toISOString() };
      this.setState('idle');
      return { success: true, reading: this.lastReading };
    } catch (e) {
      return { success: false, error: e.message };
    } finally {
      await this.closePort(port);
    }
  }

  cleanup() {
    this.polling = false;
    this.emitter = { reading: null, status: null };
    if (this.port) {
      try {
        if (this.port.isOpen) this.port.close(() => {});
      } catch {
        // Best effort on shutdown.
      }
      this.port = null;
    }
  }
}

// --- mock scale for development machines without hardware --------------------
//
// Activated with SCALE_MOCK=1. Mimics the serialport SerialPort surface used
// above and behaves like a CAS PR-II on a fake port: answers ENQ with ACK and
// DC1 with a weight frame. Weight drifts as if items were placed and removed,
// flagging unstable while it settles, so the whole UI flow is exercisable.
function createMockSerialPort() {
  const mockState = { weight: 0, target: 0, settleTicks: 0 };
  setInterval(() => {
    if (Math.random() < 0.08) {
      mockState.target = Math.random() < 0.3 ? 0 : Math.round(Math.random() * 2000) / 1000;
      mockState.settleTicks = 4;
    }
    const diff = mockState.target - mockState.weight;
    mockState.weight = Math.abs(diff) < 0.002 ? mockState.target : mockState.weight + diff * 0.5;
    if (mockState.settleTicks > 0) mockState.settleTicks -= 1;
  }, 250).unref();

  class MockPort {
    constructor({ path: portPath }) {
      this.path = portPath;
      this.isOpen = false;
      this.listeners = new Map();
    }

    static list() {
      return Promise.resolve([{ path: 'MOCK-SCALE', manufacturer: 'CAS (mock)' }]);
    }

    on(event, handler) {
      if (!this.listeners.has(event)) this.listeners.set(event, new Set());
      this.listeners.get(event).add(handler);
      return this;
    }

    removeListener(event, handler) {
      this.listeners.get(event)?.delete(handler);
      return this;
    }

    emit(event, payload) {
      for (const handler of this.listeners.get(event) ?? []) handler(payload);
    }

    open(cb) {
      if (this.path !== 'MOCK-SCALE') {
        cb(new Error(`No such port: ${this.path}`));
        return;
      }
      this.isOpen = true;
      cb(null);
    }

    set(_options, cb) {
      cb(null);
    }

    write(buffer, cb) {
      if (buffer.includes(ENQ)) {
        setTimeout(() => this.isOpen && this.emit('data', Buffer.from([0x06])), 20);
      }
      if (buffer.includes(DC1)) {
        const stable = mockState.settleTicks === 0;
        const text = `${stable ? 'S' : 'U'}  ${mockState.weight.toFixed(3)}kgp`;
        const frame = Buffer.concat([
          Buffer.from([0x01, 0x02]),
          Buffer.from(text, 'ascii'),
          Buffer.from([0x03, 0x04]),
        ]);
        setTimeout(() => this.isOpen && this.emit('data', frame), 120);
      }
      cb(null);
    }

    flush(cb) {
      cb(null);
    }

    close(cb) {
      this.isOpen = false;
      if (cb) cb(null);
    }
  }

  return MockPort;
}

module.exports = ScaleController;
