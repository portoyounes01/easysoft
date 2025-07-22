import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Allow access from other machines on the network
    host: '0.0.0.0',
    // Enable HTTPS when HTTPS=true environment variable is set
    https: process.env.HTTPS === 'true' ? {} : undefined,
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
