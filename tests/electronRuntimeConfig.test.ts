// @vitest-environment node
// Stage 0 runtime-config layer + Stage 3 version-compare (update-policy §10/§15).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { loadRuntimeConfig } = require('../electron/runtimeConfig.js');
const { compareVersions, HARDWARE_API_VERSION } = require('../electron/shellContract.js');

describe('Electron runtime config (Stage 0)', () => {
  let tmp: string;
  const write = (value: unknown) =>
    fs.writeFileSync(path.join(tmp, 'config.json'), typeof value === 'string' ? value : JSON.stringify(value));

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-cfg-'));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('missing config.json → defaults, no issues (zero behavior change)', () => {
    const cfg = loadRuntimeConfig({ userDataPath: path.join(tmp, 'nowhere') });
    expect(cfg.exists).toBe(false);
    expect(cfg.issues).toEqual([]);
    expect(cfg.rendererSource).toBe('bundled');
    expect(cfg.supabaseUrl).toBeNull();
  });

  it('valid network config → normalized ui_origin + network source', () => {
    write({
      environment: 'staging',
      supabase_url: 'https://abc.supabase.co',
      supabase_anon_key: 'anon',
      ui_origin: 'https://pos.example.com/some/path',
      renderer_source: 'network',
    });
    const cfg = loadRuntimeConfig({ userDataPath: tmp });
    expect(cfg.issues).toEqual([]);
    expect(cfg.uiOrigin).toBe('https://pos.example.com');
    expect(cfg.rendererSource).toBe('network');
    expect(cfg.environment).toBe('staging');
  });

  it("renderer_source 'network' without ui_origin → issue + bundled fallback", () => {
    write({ renderer_source: 'network' });
    const cfg = loadRuntimeConfig({ userDataPath: tmp });
    expect(cfg.issues.join(' ')).toContain('requires a valid ui_origin');
    expect(cfg.rendererSource).toBe('bundled');
  });

  it('http ui_origin is rejected except for local hosts', () => {
    write({ ui_origin: 'http://evil.example.com' });
    expect(loadRuntimeConfig({ userDataPath: tmp }).issues.join(' ')).toContain('must be https://');

    write({ ui_origin: 'http://localhost:4173' });
    const local = loadRuntimeConfig({ userDataPath: tmp });
    expect(local.issues).toEqual([]);
    expect(local.uiOrigin).toBe('http://localhost:4173');
  });

  it('half a supabase pair → both dropped, issue recorded', () => {
    write({ supabase_url: 'https://abc.supabase.co' });
    const cfg = loadRuntimeConfig({ userDataPath: tmp });
    expect(cfg.issues.join(' ')).toContain('must be set together');
    expect(cfg.supabaseUrl).toBeNull();
    expect(cfg.supabaseAnonKey).toBeNull();
  });

  it('corrupt JSON → issue, safe defaults survive', () => {
    write('{nope');
    const cfg = loadRuntimeConfig({ userDataPath: tmp });
    expect(cfg.issues.length).toBeGreaterThan(0);
    expect(cfg.rendererSource).toBe('bundled');
  });

  it('unknown renderer_source → issue + bundled', () => {
    write({ renderer_source: 'cloud' });
    const cfg = loadRuntimeConfig({ userDataPath: tmp });
    expect(cfg.issues.join(' ')).toContain('renderer_source');
    expect(cfg.rendererSource).toBe('bundled');
  });

  it('update_feed_url keeps its path and requires https strictly', () => {
    write({ update_feed_url: 'https://cdn.example.com/pos-updates/' });
    const cfg = loadRuntimeConfig({ userDataPath: tmp });
    expect(cfg.issues).toEqual([]);
    expect(cfg.updateFeedUrl).toBe('https://cdn.example.com/pos-updates/');

    // Executables travel over the feed: no LAN-http exception (unlike ui_origin)
    write({ update_feed_url: 'http://192.168.1.10/updates' });
    const lan = loadRuntimeConfig({ userDataPath: tmp });
    expect(lan.issues.join(' ')).toContain('update_feed_url must be https://');
    expect(lan.updateFeedUrl).toBeNull();

    // Loopback http IS allowed — it cannot be intercepted; local e2e test path
    write({ update_feed_url: 'http://127.0.0.1:8080/feed' });
    const loop = loadRuntimeConfig({ userDataPath: tmp });
    expect(loop.issues).toEqual([]);
    expect(loop.updateFeedUrl).toBe('http://127.0.0.1:8080/feed');

    write({ update_feed_url: 'not a url' });
    const junk = loadRuntimeConfig({ userDataPath: tmp });
    expect(junk.issues.join(' ')).toContain('update_feed_url');
    expect(junk.updateFeedUrl).toBeNull();
  });

  it('ui_origin still accepts LAN http and normalizes to origin (validateOrigin refactor)', () => {
    write({ ui_origin: 'http://192.168.1.20:4173/deep/path' });
    const cfg = loadRuntimeConfig({ userDataPath: tmp });
    expect(cfg.issues).toEqual([]);
    expect(cfg.uiOrigin).toBe('http://192.168.1.20:4173');
  });
});

describe('Shell contract version compare (Stage 3)', () => {
  it('orders dotted versions numerically', () => {
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
    expect(compareVersions('0.1.0', '0.2.0')).toBe(-1);
    expect(compareVersions('1.2.10', '1.2.9')).toBe(1);
    expect(compareVersions('v1.2', '1.2.0')).toBe(0);
    expect(compareVersions('0.0.0', '0.1.0')).toBe(-1);
  });

  it('hardware API version is a positive integer', () => {
    expect(Number.isInteger(HARDWARE_API_VERSION)).toBe(true);
    expect(HARDWARE_API_VERSION).toBeGreaterThanOrEqual(1);
  });
});
