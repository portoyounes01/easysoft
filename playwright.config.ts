import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests drive a real Chromium instance (clicks, typing, navigation).
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
    testDir: 'e2e',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI ? 'github' : 'list',
    timeout: 90_000,
    expect: {
        timeout: 30_000,
    },
    use: {
        baseURL: 'http://localhost:5173',
        locale: 'en-US',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        actionTimeout: 20_000,
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
    },
});
