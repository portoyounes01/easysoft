import { expect, test, type Page } from '@playwright/test';

const adminPin = ['0', '0', '9', '9'];
const posRows = ['Currency symbol', 'Default IVA rate', 'Track inventory', 'Allow negative stock'];
const viewports = [
    { name: 'desktop', width: 1280, height: 720 },
    { name: 'tablet', width: 820, height: 1180 },
    { name: 'mobile', width: 390, height: 844 },
];

type RowLayoutProbe = {
    overlaps: boolean;
    rowWidth: number;
    labelWidth: number;
    controlWidth: number;
};

type OverflowProbe = {
    clientWidth: number;
    scrollWidth: number;
    text: string;
};

async function signInAsSeedAdmin(page: Page): Promise<void> {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Select Employee' })).toBeVisible({
        timeout: 60_000,
    });

    await page.getByRole('option', { name: 'Maria Santos admin' }).click();

    for (const digit of adminPin) {
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
    await page.locator('#login2-custom-id').fill('SYS001');
    await page.locator('#login2-custom-pin').fill('password');

    await Promise.all([
        page.waitForURL(/\/pos\/?$/, { timeout: 30_000 }),
        page.getByRole('button', { name: 'Sign In' }).click(),
    ]);
}

async function openPosSettings(page: Page): Promise<void> {
    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'POS Currency, tax, stock, and cart behavior.' })).toBeVisible({
        timeout: 30_000,
    });
    await page.getByRole('button', { name: 'POS Currency, tax, stock, and cart behavior.' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Currency, tax, stock, and cart behavior.' })).toBeVisible();
}

async function openCompanyFiscalSettings(page: Page): Promise<void> {
    await page.goto('/settings');
    const companyTab = page.getByRole('button', { name: 'Company & Fiscal Company identity, receipts, Local AT, and Vendus.' });
    await expect(companyTab).toBeVisible({
        timeout: 30_000,
    });
    await companyTab.click();
    await expect(page.getByRole('heading', { level: 2, name: 'Company identity', exact: true })).toBeVisible();
}

async function openSeedTools(page: Page): Promise<void> {
    await page.goto('/settings?hw=seed');
    await expect(page.getByTestId('seed-management-panel')).toBeVisible({
        timeout: 30_000,
    });
}

async function expectReadablePosRows(page: Page, viewportName: string): Promise<void> {
    for (const title of posRows) {
        const row = page.locator(`[data-settings-row-title="${title}"]`);
        await expect(row, `${viewportName}: ${title} row should be visible`).toBeVisible();

        const heading = row.getByRole('heading', { level: 3, name: title });
        await expect(heading, `${viewportName}: ${title} heading should be visible`).toBeVisible();
        const headingBox = await heading.boundingBox();

        expect(headingBox, `${viewportName}: ${title} heading should have layout`).not.toBeNull();
        expect(headingBox?.height, `${viewportName}: ${title} should not wrap into multiple lines`).toBeLessThanOrEqual(32);

        const probe = await row.evaluate((element): RowLayoutProbe => {
            const [label, control] = Array.from(element.children);
            if (!(label instanceof HTMLElement) || !(control instanceof HTMLElement)) {
                return { overlaps: true, rowWidth: 0, labelWidth: 0, controlWidth: 0 };
            }

            const rowRect = element.getBoundingClientRect();
            const labelRect = label.getBoundingClientRect();
            const controlRect = control.getBoundingClientRect();
            const overlaps =
                labelRect.left < controlRect.right &&
                labelRect.right > controlRect.left &&
                labelRect.top < controlRect.bottom &&
                labelRect.bottom > controlRect.top;

            return {
                overlaps,
                rowWidth: rowRect.width,
                labelWidth: labelRect.width,
                controlWidth: controlRect.width,
            };
        });

        expect(probe.rowWidth, `${viewportName}: ${title} row should have width`).toBeGreaterThan(0);
        expect(probe.labelWidth, `${viewportName}: ${title} label column should have width`).toBeGreaterThan(0);
        expect(probe.controlWidth, `${viewportName}: ${title} control column should have width`).toBeGreaterThan(0);
        expect(probe.overlaps, `${viewportName}: ${title} label and control should not overlap`).toBe(false);
    }
}

async function expectSeedToolsDoNotOverflow(page: Page, viewportName: string): Promise<void> {
    const panel = page.getByTestId('seed-management-panel');
    const panelProbe = await panel.evaluate(
        (element): OverflowProbe => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            text: element.textContent?.trim().slice(0, 80) ?? '',
        })
    );

    expect(panelProbe.scrollWidth, `${viewportName}: Seed panel should not overflow horizontally`).toBeLessThanOrEqual(
        panelProbe.clientWidth + 1
    );

    for (const testId of ['seed-file-row', 'seed-env-row']) {
        const rows = page.getByTestId(testId);
        const count = await rows.count();
        expect(count, `${viewportName}: ${testId} should render`).toBeGreaterThan(0);

        const probes = await rows.evaluateAll((elements): OverflowProbe[] =>
            elements.map(element => ({
                clientWidth: element.clientWidth,
                scrollWidth: element.scrollWidth,
                text: element.textContent?.trim().slice(0, 80) ?? '',
            }))
        );

        for (const probe of probes) {
            expect(
                probe.scrollWidth,
                `${viewportName}: ${testId} "${probe.text}" should not overflow horizontally`
            ).toBeLessThanOrEqual(probe.clientWidth + 1);
        }
    }
}

test.describe('Settings POS layout', () => {
    test('hides fiscal status and issuer selection from non-system admins while showing default Local AT setup', async ({ page }) => {
        await signInAsSeedAdmin(page);
        await page.goto('/settings');

        await expect(page.getByText('Fiscal issuer', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Database', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Save state', { exact: true })).toHaveCount(0);

        await openCompanyFiscalSettings(page);

        await expect(page.getByRole('heading', { level: 2, name: 'Fiscal controls' })).toBeVisible();
        await expect(page.getByRole('heading', { level: 3, name: 'Active issuer' })).toHaveCount(0);
        await expect(page.getByRole('heading', { level: 2, name: 'AT series', exact: true })).toBeVisible();
        await expect(page.getByText('Export fiscal audit data for the selected period.')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Download SAF-T' })).toBeVisible();
        await expect(page.getByText('Local AT periods use local immutable fiscal rows.')).toHaveCount(0);

        const trainingMode = page.getByRole('switch', { name: 'Training mode' });
        await expect(trainingMode).toBeVisible();
        await expect(trainingMode).toBeEnabled();
        const originalChecked = (await trainingMode.getAttribute('aria-checked')) ?? 'false';

        const dialogHandled = new Promise<string>(resolve => {
            page.once('dialog', async dialog => {
                const type = dialog.type();
                await dialog.dismiss();
                resolve(type);
            });
        });
        await trainingMode.click();
        expect(await dialogHandled).toBe('confirm');
        await expect(trainingMode).toHaveAttribute('aria-checked', originalChecked);
    });

    test('hides Local AT setup from non-system admins when a different issuer is saved', async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem(
                'pos_system_settings',
                JSON.stringify({
                    fiscal: {
                        issuer: 'vendus',
                        vendus: {
                            enabled: true,
                        },
                    },
                })
            );
        });

        await signInAsSeedAdmin(page);
        await openCompanyFiscalSettings(page);

        await expect(page.getByRole('heading', { level: 3, name: 'Active issuer' })).toHaveCount(0);
        await expect(page.getByRole('heading', { level: 2, name: 'AT series', exact: true })).toHaveCount(0);
        await expect(page.getByRole('heading', { level: 2, name: 'Vendus setup' })).toHaveCount(0);
        await expect(page.getByRole('switch', { name: 'Training mode' })).toBeVisible();
    });

    test('shows fiscal status and issuer setup to the system administrator', async ({ page }) => {
        await signInAsSystemAdmin(page);
        await page.goto('/settings');

        await expect(page.getByText('Fiscal issuer', { exact: true })).toBeVisible();
        await expect(page.getByText('Database', { exact: true })).toBeVisible();
        await expect(page.getByText('Save state', { exact: true })).toBeVisible();

        await openCompanyFiscalSettings(page);

        await expect(page.getByRole('heading', { level: 2, name: 'Fiscal controls' })).toBeVisible();
        await expect(page.getByRole('heading', { level: 3, name: 'Active issuer' })).toBeVisible();
        await expect(page.getByRole('heading', { level: 3, name: 'Training mode' })).toBeVisible();
        await expect(page.getByRole('heading', { level: 2, name: 'AT series', exact: true })).toBeVisible();
        await expect(page.getByText('Local AT periods use local immutable fiscal rows.')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Download local SAF-T' })).toBeVisible();
    });

    test('uses Appearance primary color for the selected Settings section tab', async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem(
                'design-system-2-prefs',
                JSON.stringify({
                    schemaVersion: 2,
                    primaryColorId: 'rose',
                    secondaryColorId: 'slate',
                })
            );
        });

        await signInAsSeedAdmin(page);
        await page.goto('/settings');

        const activeTab = page.getByRole('button', { name: 'Security Session timeout and active-sale protection.' });
        await expect(activeTab).toBeVisible({ timeout: 30_000 });

        const styles = await activeTab.evaluate(element => {
            const computed = getComputedStyle(element);
            return {
                backgroundColor: computed.backgroundColor,
                backgroundImage: computed.backgroundImage,
            };
        });

        expect(styles.backgroundImage).toContain('rgb(244, 63, 94)');
        expect(styles.backgroundImage).toContain('rgb(190, 18, 60)');
        expect(styles.backgroundColor).not.toBe('rgb(2, 6, 23)');
    });

    test('uses Appearance primary color for the selected Hardware tool tab', async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem(
                'design-system-2-prefs',
                JSON.stringify({
                    schemaVersion: 2,
                    primaryColorId: 'rose',
                    secondaryColorId: 'slate',
                })
            );
        });

        await signInAsSeedAdmin(page);
        await page.goto('/settings?hw=seed');

        const activeTool = page.getByRole('button', { name: 'Seed tools Data setup' });
        await expect(activeTool).toBeVisible({ timeout: 30_000 });

        const styles = await activeTool.evaluate(element => {
            const computed = getComputedStyle(element);
            return {
                backgroundColor: computed.backgroundColor,
                backgroundImage: computed.backgroundImage,
            };
        });

        expect(styles.backgroundImage).toContain('rgb(244, 63, 94)');
        expect(styles.backgroundImage).toContain('rgb(190, 18, 60)');
        expect(styles.backgroundColor).not.toBe('rgb(2, 6, 23)');
    });

    test('keeps POS settings rows readable across responsive widths', async ({ page }) => {
        await signInAsSeedAdmin(page);

        for (const viewport of viewports) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await openPosSettings(page);
            await expectReadablePosRows(page, viewport.name);
        }
    });

    test('keeps embedded Seed tools readable across responsive widths', async ({ page }) => {
        await signInAsSeedAdmin(page);

        for (const viewport of viewports) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await openSeedTools(page);
            await expectSeedToolsDoNotOverflow(page, viewport.name);
            await expect(page.getByTestId('clear-local-database-button')).toHaveCount(0);
        }
    });

    test('shows guarded local-database clear controls only to the system administrator', async ({ page }) => {
        await signInAsSystemAdmin(page);
        await openSeedTools(page);

        const clearButton = page.getByTestId('clear-local-database-button');
        await expect(clearButton).toBeVisible();
        await clearButton.click();

        const dialog = page.getByRole('dialog', { name: 'Clear local database?' });
        await expect(dialog).toBeVisible();

        const confirmButton = dialog.getByRole('button', { name: 'Delete local data' });
        await expect(confirmButton).toBeDisabled();
        await dialog.getByLabel('Type CLEAR LOCAL DATA').fill('CLEAR LOCAL DATA');
        await expect(confirmButton).toBeEnabled();
    });
});
