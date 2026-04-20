import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
        fileParallelism: false,
        environment: 'jsdom',
        environmentMatchGlobs: [['tests/fiscal/**', 'node']],
        globals: true,
        setupFiles: './vitest.setup.ts',
        environmentOptions: {
            jsdom: {
                resources: 'usable',
            },
        },
    },
}); 