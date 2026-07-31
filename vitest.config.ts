import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        // `.claude/worktrees` holds git-ignored checkouts whose test files are picked
        // up as if they were the repo's own; a byte-identical copy there reported
        // "4 passed" over a suite that was failing to collect here.
        exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/.claude/**'],
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