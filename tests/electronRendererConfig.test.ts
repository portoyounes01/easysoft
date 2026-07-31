// @vitest-environment node
import path from 'path';
import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  DEFAULT_DEV_SERVER_URL,
  PRODUCTION_RENDERER_URL,
  GATE_URL,
  resolveRendererConfig,
} = require('../electron/rendererConfig.js') as typeof import('../electron/rendererConfig.js');

// Minimal stand-in for electron/runtimeConfig.js output (Stage 0).
const runtimeDefaults = {
  filePath: '/userData/config.json',
  exists: false,
  issues: [] as string[],
  environment: null,
  supabaseUrl: null,
  supabaseAnonKey: null,
  uiOrigin: null,
  rendererSource: 'bundled',
};

describe('Electron renderer config', () => {
  const electronDir = path.join('/repo', 'electron');

  it('loads the production build by default for npm run electron', () => {
    expect(
      resolveRendererConfig({
        argv: ['electron', '.'],
        env: {},
        dirname: electronDir,
        runtime: runtimeDefaults,
      })
    ).toMatchObject({
      mode: 'production',
      source: 'bundled',
      url: PRODUCTION_RENDERER_URL,
      gateUrl: GATE_URL,
      gateRoot: path.join(electronDir, 'gate'),
      root: path.join('/repo', 'dist'),
      file: path.join('/repo', 'dist/index.html'),
    });
  });

  it('tolerates a missing runtime config (legacy callers)', () => {
    expect(
      resolveRendererConfig({
        argv: ['electron', '.'],
        env: {},
        dirname: electronDir,
      })
    ).toMatchObject({ mode: 'production', source: 'bundled', url: PRODUCTION_RENDERER_URL });
  });

  it('repoints production to ui_origin when renderer_source is network (Stage 2)', () => {
    expect(
      resolveRendererConfig({
        argv: ['electron', '.'],
        env: {},
        dirname: electronDir,
        runtime: { ...runtimeDefaults, rendererSource: 'network', uiOrigin: 'https://pos.example.com' },
      })
    ).toMatchObject({
      mode: 'production',
      source: 'network',
      url: 'https://pos.example.com/',
      gateUrl: GATE_URL,
      // bundled paths stay resolved — they are the rollback target
      root: path.join('/repo', 'dist'),
    });
  });

  it('uses the default dev server only when dev mode is explicit', () => {
    expect(
      resolveRendererConfig({
        argv: ['electron', '.', '--dev'],
        env: {},
        dirname: electronDir,
        runtime: runtimeDefaults,
      })
    ).toMatchObject({
      mode: 'development',
      source: 'dev-server',
      url: DEFAULT_DEV_SERVER_URL,
    });
  });

  it('allows overriding the dev server URL from argv or environment', () => {
    expect(
      resolveRendererConfig({
        argv: ['electron', '.', '--dev-server-url=http://127.0.0.1:6000'],
        env: {},
        dirname: electronDir,
        runtime: runtimeDefaults,
      })
    ).toMatchObject({
      mode: 'development',
      url: 'http://127.0.0.1:6000',
    });

    expect(
      resolveRendererConfig({
        argv: ['electron', '.'],
        env: { ELECTRON_RENDERER_URL: 'http://127.0.0.1:7000' },
        dirname: electronDir,
        runtime: runtimeDefaults,
      })
    ).toMatchObject({
      mode: 'development',
      url: 'http://127.0.0.1:7000',
    });
  });
});
