import { expect, test } from '@playwright/test';

/**
 * Offline bootstrap admin (`public/bootstrap-data.json`) uses SHA-256 of `password`
 * (same string shown as the demo password on the login screen).
 */
test.describe('Authentication', () => {
    test('bootstrap admin signs in and reaches dashboard', async ({ page }) => {
        await page.goto('/login');

        await expect(page.getByRole('heading', { name: 'Select Employee' })).toBeVisible({
            timeout: 60_000,
        });

        await page.getByRole('button', { name: 'Admin Mode' }).click();
        await page.getByRole('button', { name: /System Administrator/ }).click();

        await page.getByPlaceholder('Enter your password').fill('password');

        await Promise.all([
            page.waitForURL((url) => new URL(url).pathname === '/'),
            page.getByRole('button', { name: 'Sign In' }).click(),
        ]);

        await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible({
            timeout: 30_000,
        });
    });
});
