import { expect, test, type Page } from '@playwright/test';

async function signInAsRegularAdmin(page: Page): Promise<void> {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Select Employee' })).toBeVisible({
        timeout: 60_000,
    });
    await page.getByRole('option', { name: 'Maria Santos admin' }).click();
    for (const digit of ['0', '0', '9', '9']) {
        await page.getByRole('button', { name: digit, exact: true }).click();
    }
    await expect(page).toHaveURL(/\/pos\/?$/, { timeout: 30_000 });
}

async function signInAsSystemAdmin(page: Page): Promise<void> {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Select Employee' })).toBeVisible({
        timeout: 60_000,
    });
    await page.getByRole('option', { name: 'Other Employee Custom ID' }).click();
    await page.getByLabel('Employee ID').fill('ADMIN001');
    await page.getByLabel('PIN').fill('password');
    await Promise.all([
        page.waitForURL(/\/pos\/?$/, { timeout: 30_000 }),
        page.getByRole('button', { name: 'Sign In' }).click(),
    ]);
}

async function editEmployee(page: Page, employeeNumber: string, employeeName: string) {
    await page.goto('/employees');
    const card = page.getByTestId(`employee-card-${employeeNumber}`);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole('button', { name: `Edit Employee ${employeeName}` }).click();
    const form = page.locator('#employee-form');
    await expect(form).toBeVisible();
    return form;
}

test.describe('Employee permission editing', () => {
    test('regular admins see ordinary permissions but not system-admin-managed permissions', async ({ page }) => {
        await signInAsRegularAdmin(page);
        const form = await editEmployee(page, 'MGR001', 'João Pereira');

        await expect(form.getByText('Customers', { exact: true })).toBeVisible();
        await expect(form.getByText('Reports', { exact: true })).toHaveCount(0);
        await expect(form.getByText('Dashboard', { exact: true })).toHaveCount(0);
        await expect(form.getByText('Appearances', { exact: true })).toHaveCount(0);
        await expect(form.getByText('Profit & Costs', { exact: true })).toHaveCount(0);
        await expect(form.getByText('Orders', { exact: true })).toHaveCount(0);
        await expect(form.getByText('Clear Local Data', { exact: true })).toHaveCount(0);
    });

    test('system admins can manage restricted permissions for regular admins', async ({ page }) => {
        await signInAsSystemAdmin(page);
        const form = await editEmployee(page, 'ADM001', 'Maria Santos');

        for (const permission of [
            'Customers',
            'Reports',
            'Dashboard',
            'Profit & Costs',
            'Orders',
            'Clear Local Data',
        ]) {
            await expect(form.getByText(permission, { exact: true })).toBeVisible();
        }
        await expect(form.getByText('Appearances', { exact: true })).toHaveCount(0);
    });
});
