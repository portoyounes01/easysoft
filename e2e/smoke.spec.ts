import { expect, test } from '@playwright/test';

test.describe('App smoke', () => {
    test('serves app and shows login flow (redirect / → /login)', async ({ page }) => {
        await page.goto('/');

        await expect(page).toHaveURL(/\/login\/?$/);

        const heading = page.getByRole('heading', { level: 1 }).first();
        await expect(heading).toBeVisible({ timeout: 45_000 });
        await expect(heading).toHaveText(
            /Select Employee|Loading Employees|Unable to Load Employees/
        );

        await expect(page.locator('#root')).not.toBeEmpty();
    });

    test('login screen exposes Admin Mode after employee list loads', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByRole('heading', { name: 'Select Employee' })).toBeVisible({
            timeout: 60_000,
        });
        await page.getByRole('button', { name: 'Admin Mode' }).click();
        await expect(page.getByText('🛠️ Admin Mode')).toBeVisible();
    });
});
