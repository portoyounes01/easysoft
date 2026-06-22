const path = require('path');

const DEFAULT_DEV_SERVER_URL = 'http://127.0.0.1:5173';
const PRODUCTION_RENDERER_URL = 'app://pos/index.html';

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

function resolveRendererConfig(options = {}) {
  const argv = options.argv ?? process.argv;
  const env = options.env ?? process.env;
  const dirname = options.dirname ?? __dirname;

  const explicitDevServerUrl =
    readArgValue(argv, '--dev-server-url') ||
    env.ELECTRON_RENDERER_URL ||
    env.VITE_DEV_SERVER_URL;
  const explicitDevMode = argv.includes('--dev') || env.NODE_ENV === 'development';

  if (explicitDevServerUrl || explicitDevMode) {
    return {
      mode: 'development',
      url: explicitDevServerUrl || DEFAULT_DEV_SERVER_URL,
    };
  }

  return {
    mode: 'production',
    url: PRODUCTION_RENDERER_URL,
    root: path.join(dirname, '../dist'),
    file: path.join(dirname, '../dist/index.html'),
  };
}

module.exports = {
  DEFAULT_DEV_SERVER_URL,
  PRODUCTION_RENDERER_URL,
  resolveRendererConfig,
};
