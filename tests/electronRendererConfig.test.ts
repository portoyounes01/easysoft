// @vitest-environment node
import path from 'path';
import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  DEFAULT_DEV_SERVER_URL,
  PRODUCTION_RENDERER_URL,
  resolveRendererConfig,
} = require('../electron/rendererConfig.js') as typeof import('../electron/rendererConfig.js');

describe('Electron renderer config', () => {
  const electronDir = path.join('/repo', 'electron');

  it('loads the production build by default for npm run electron', () => {
    expect(
      resolveRendererConfig({
        argv: ['electron', '.'],
        env: {},
        dirname: electronDir,
      })
    ).toEqual({
      mode: 'production',
      url: PRODUCTION_RENDERER_URL,
      root: path.join('/repo', 'dist'),
      file: path.join('/repo', 'dist/index.html'),
    });
  });

  it('uses the default dev server only when dev mode is explicit', () => {
    expect(
      resolveRendererConfig({
        argv: ['electron', '.', '--dev'],
        env: {},
        dirname: electronDir,
      })
    ).toEqual({
      mode: 'development',
      url: DEFAULT_DEV_SERVER_URL,
    });
  });

  it('allows overriding the dev server URL from argv or environment', () => {
    expect(
      resolveRendererConfig({
        argv: ['electron', '.', '--dev-server-url=http://127.0.0.1:6000'],
        env: {},
        dirname: electronDir,
      })
    ).toEqual({
      mode: 'development',
      url: 'http://127.0.0.1:6000',
    });

    expect(
      resolveRendererConfig({
        argv: ['electron', '.'],
        env: { ELECTRON_RENDERER_URL: 'http://127.0.0.1:7000' },
        dirname: electronDir,
      })
    ).toEqual({
      mode: 'development',
      url: 'http://127.0.0.1:7000',
    });
  });
});
