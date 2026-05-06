import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? './' : '/',
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
