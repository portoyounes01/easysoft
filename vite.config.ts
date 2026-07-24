import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Publishes the Stage-3 UI↔shell handshake file at the build root (served as
// <ui_origin>/shell-requirements.json and bundled into dist/ for the local
// gate). Single source of truth: src/shell-requirements.json, which
// src/lib/shellContract.ts imports for the in-UI check.
function emitShellRequirements(): Plugin {
  return {
    name: 'emit-shell-requirements',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'shell-requirements.json',
        source: readFileSync(fileURLToPath(new URL('./src/shell-requirements.json', import.meta.url)), 'utf8'),
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), emitShellRequirements()],
  // Electron (file://) needs a relative base; the Vercel/web PWA needs an absolute base so
  // the service-worker scope and /manifest.webmanifest resolve from the domain root.
  base: process.env.VERCEL ? '/' : (process.env.NODE_ENV === 'production' ? './' : '/'),
  server: {
    // Allow access from other machines on the network
    host: '0.0.0.0',
    port: 5173,
    // Enable HTTPS when HTTPS=true environment variable is set
    https: process.env.HTTPS === 'true' ? {} : undefined,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Generate source maps for debugging
    sourcemap: process.env.NODE_ENV === 'development',
  },
  // Pre-bundle lucide-react (default). Excluding it served per-icon files like
  // `icons/fingerprint.js`, which privacy/ad blockers often block (ERR_BLOCKED_BY_CLIENT).
});
