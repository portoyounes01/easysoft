const path = require('path');

const DEFAULT_DEV_SERVER_URL = 'http://127.0.0.1:5173';
const PRODUCTION_RENDERER_URL = 'app://pos/index.html';
const GATE_URL = 'app://gate/index.html';

function readArgValue(argv, name) {
  const inlinePrefix = `${name}=`;
  const inlineValue = argv.find((arg) => arg.startsWith(inlinePrefix));
  if (inlineValue) {
    return inlineValue.slice(inlinePrefix.length);
  }

  const index = argv.indexOf(name);
  if (index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--')) {
    return argv[index + 1];
  }

  return undefined;
}

// Resolves where the renderer comes from. Dev stays exactly as before (dev server,
// no gate). Production now consults the Stage-0 runtime config: `renderer_source`
// picks bundled dist/ vs the network `ui_origin` (update-policy §6.1/§10 Stage 2),
// and every production boot goes through the local readiness gate first
// (§10 Stage 1 — "gate before repoint"). Rollback from network is editing
// config.json back to 'bundled'; no reinstall (P4).
function resolveRendererConfig(options = {}) {
  const argv = options.argv ?? process.argv;
  const env = options.env ?? process.env;
  const dirname = options.dirname ?? __dirname;
  const runtime = options.runtime ?? null;

  const explicitDevServerUrl =
    readArgValue(argv, '--dev-server-url') ||
    env.ELECTRON_RENDERER_URL ||
    env.VITE_DEV_SERVER_URL;
  const explicitDevMode = argv.includes('--dev') || env.NODE_ENV === 'development';

  if (explicitDevServerUrl || explicitDevMode) {
    return {
      mode: 'development',
      source: 'dev-server',
      url: explicitDevServerUrl || DEFAULT_DEV_SERVER_URL,
      gateRoot: path.join(dirname, 'gate'),
      runtime,
    };
  }

  const source = runtime?.rendererSource === 'network' ? 'network' : 'bundled';

  return {
    mode: 'production',
    source,
    url: source === 'network' ? `${runtime.uiOrigin}/` : PRODUCTION_RENDERER_URL,
    gateUrl: GATE_URL,
    gateRoot: path.join(dirname, 'gate'),
    root: path.join(dirname, '../dist'),
    file: path.join(dirname, '../dist/index.html'),
    runtime,
  };
}

module.exports = {
  DEFAULT_DEV_SERVER_URL,
  PRODUCTION_RENDERER_URL,
  GATE_URL,
  resolveRendererConfig,
};
