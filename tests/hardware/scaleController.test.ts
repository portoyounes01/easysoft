// @vitest-environment node
// Lifecycle tests for the scale controller against the built-in mock scale.
// These pin the start/stop/readOnce race fixes from the adversarial review:
// resurrection of a stopped poll loop, competing reads on the live port, and
// config changes affecting a running session.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ScaleController from '../../electron/hardware/scaleController';

let dir: string;
let controller: InstanceType<typeof ScaleController>;

const waitFor = async (predicate: () => boolean, timeoutMs = 8000, stepMs = 50) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, stepMs));
  }
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scale-ctrl-test-'));
  controller = new ScaleController({ getUserDataDir: () => dir, mock: true });
});

afterEach(async () => {
  await controller.stop();
  controller.cleanup();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('ScaleController lifecycle', () => {
  it('start -> readings -> stop returns to idle with the port released', async () => {
    const readings: unknown[] = [];
    controller.setEmitter({ reading: (r: unknown) => readings.push(r), status: null });

    expect((await controller.start()).success).toBe(true);
    await waitFor(() => readings.length >= 2);
    expect(controller.getStatus().status.state).toBe('connected');

    const stopped = await controller.stop();
    expect(stopped.success).toBe(true);
    expect(controller.getStatus().status.state).toBe('idle');
    expect(controller.port).toBeNull();
    expect(controller.polling).toBe(false);
  }, 15000);

  it('un-awaited stop() followed by immediate start() does not resurrect the old loop or hang', async () => {
    expect((await controller.start()).success).toBe(true);
    await waitFor(() => controller.getStatus().status.state === 'connected');

    // The panel's unmount cleanup fires stop() without awaiting; a remount
    // can call start() inside the teardown window.
    const stopPromise = controller.stop();
    const startResult = await controller.start();
    expect(startResult.success).toBe(true);

    // The original stop must resolve (pre-fix it hung forever) …
    await expect(
      Promise.race([
        stopPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('stop() hung')), 10000)),
      ])
    ).resolves.toMatchObject({ success: true });

    // … and exactly one live loop remains, still producing readings.
    const readings: unknown[] = [];
    controller.setEmitter({ reading: (r: unknown) => readings.push(r), status: null });
    await waitFor(() => readings.length >= 2);
    expect(controller.polling).toBe(true);

    await controller.stop();
    expect(controller.getStatus().status.state).toBe('idle');
  }, 20000);

  it('readOnce during a live session serves the cached reading without touching the port', async () => {
    await controller.start();
    await waitFor(() => controller.lastReading !== null);

    const result = await controller.readOnce();
    expect(result.success).toBe(true);
    expect(result.reading).toEqual(controller.lastReading);
  }, 15000);

  it('readOnce fails soft while a session is reconnecting instead of scanning concurrently', async () => {
    await controller.start();
    // Simulate the loop's detecting/disconnected phase.
    controller.port = null;
    controller.state = 'detecting';

    const result = await controller.readOnce();
    expect(result.success).toBe(false);
    await controller.stop();
  }, 15000);

  it('readOnce without a session does a standalone read and releases the port', async () => {
    const result = await controller.readOnce();
    expect(result.success).toBe(true);
    expect(result.reading?.unit).toBe('kg');
    expect(controller.polling).toBe(false);
    expect(controller.port).toBeNull();
  }, 15000);

  it('setConfig({enabled:false}) stops a running session; re-enable does not auto-restart', async () => {
    await controller.start();
    await waitFor(() => controller.getStatus().status.state === 'connected');

    const result = await controller.setConfig({ enabled: false });
    expect(result.success).toBe(true);
    expect(controller.polling).toBe(false);
    expect(controller.getStatus().status.state).toBe('idle');

    await controller.setConfig({ enabled: true });
    expect(controller.polling).toBe(false);
    expect((await controller.start()).success).toBe(true);
  }, 15000);

  it('setConfig failure keeps the previous config in memory', async () => {
    const before = { ...controller.getConfig() };
    fs.rmSync(dir, { recursive: true, force: true }); // make the write fail
    const result = await controller.setConfig({ baud: 4800 });
    expect(result.success).toBe(false);
    expect(result.config).toEqual(before);
    expect(controller.getConfig().baud).toBe(before.baud);
    fs.mkdirSync(dir, { recursive: true });
  });

  it('detect aborts promptly when the predicate flips', async () => {
    const result = await controller.detect(() => true);
    expect(result.success).toBe(true);
    expect(result.found).toBe(false);
    expect(result.aborted).toBe(true);
  });
});
