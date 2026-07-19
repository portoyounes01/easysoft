import { expect, test } from '@playwright/test';

test.describe('/pos2 product grid', () => {
    test('keeps product cards square and compact on wide screens', async ({ page }) => {
        await page.addInitScript(() => {
            Object.defineProperty(window, 'electronAPI', {
                configurable: true,
                value: {},
            });
        });
        await page.setViewportSize({ width: 2048, height: 1086 });
        await page.goto('/pos2');
        await expect(page.getByRole('button', { name: 'All' })).toBeVisible({ timeout: 60_000 });

        await page.evaluate(async () => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open('POSDatabase');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            await new Promise<void>((resolve, reject) => {
                const transaction = db.transaction(['categories', 'products'], 'readwrite');
                const categories = transaction.objectStore('categories');
                const products = transaction.objectStore('products');

                categories.put({
                    id: 'pos2-layout-category',
                    name: 'Layout Test',
                    display_order: 1,
                    is_active: true,
                    deleted_at: null,
                });

                for (let index = 1; index <= 9; index += 1) {
                    products.put({
                        id: `pos2-layout-product-${index}`,
                        name: `Layout Product ${index}`,
                        category_id: 'pos2-layout-category',
                        price: index,
                        image_url: null,
                        sold_by_weight: false,
                        display_order: index,
                        is_active: true,
                        deleted_at: null,
                    });
                }

                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
                transaction.onabort = () => reject(transaction.error);
            });

            db.close();
        });

        await page.reload();

        const cards = page.locator('.pos2-product-card');
        await expect(cards.first()).toBeVisible({ timeout: 60_000 });

        const wideLayout = await cards.evaluateAll((elements) =>
            elements.map((element) => {
                const { width, height, y } = element.getBoundingClientRect();
                return { width, height, y };
            }),
        );
        const wideFirstCard = wideLayout[0];
        expect(Math.abs(wideFirstCard.width - wideFirstCard.height)).toBeLessThanOrEqual(1);
        expect(wideFirstCard.width).toBeLessThanOrEqual(260);
        expect(wideLayout.filter((card) => Math.abs(card.y - wideFirstCard.y) <= 1)).toHaveLength(5);

        await page.setViewportSize({ width: 1448, height: 1086 });

        const referenceLayout = await cards.evaluateAll((elements) =>
            elements.map((element) => {
                const { width, height, y } = element.getBoundingClientRect();
                return { width, height, y };
            }),
        );
        const referenceFirstCard = referenceLayout[0];
        expect(Math.abs(referenceFirstCard.width - referenceFirstCard.height)).toBeLessThanOrEqual(1);
        expect(referenceLayout.filter((card) => Math.abs(card.y - referenceFirstCard.y) <= 1)).toHaveLength(3);
    });
});
