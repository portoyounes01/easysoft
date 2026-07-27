import { beforeEach, describe, expect, it } from 'vitest';
import { initializeLocalDatabase, localDb } from '../src/lib/localDatabase';
import { seedRestaurantDataset } from '../src/utils/seedRestaurantData';
import { QBELLA_EVORA_DATASET } from '../src/utils/restaurantSeedDataset';

async function wipe() {
    await initializeLocalDatabase();
    await Promise.all([
        localDb.categories.clear(),
        localDb.products.clear(),
        localDb.rawMaterials.clear(),
        localDb.recipeLines.clear(),
        localDb.categorySyncQueue.clear(),
        localDb.productSyncQueue.clear(),
    ]);
}

describe('seedRestaurantDataset', () => {
    beforeEach(wipe);

    it('writes every collection of the dataset', async () => {
        const result = await seedRestaurantDataset(QBELLA_EVORA_DATASET);

        expect(result.success).toBe(true);
        expect(result.unknownMaterials).toEqual([]);

        expect(await localDb.categories.count()).toBe(QBELLA_EVORA_DATASET.categories.length);
        expect(await localDb.products.count()).toBe(QBELLA_EVORA_DATASET.products.length);
        expect(await localDb.rawMaterials.count()).toBe(QBELLA_EVORA_DATASET.rawMaterials.length);
        expect(await localDb.recipeLines.count()).toBe(result.recipeLinesCount);
        expect(result.recipeLinesCount).toBeGreaterThan(0);
    });

    it('links products to the categories it just wrote', async () => {
        await seedRestaurantDataset(QBELLA_EVORA_DATASET);

        const categoryIds = new Set((await localDb.categories.toArray()).map(c => c.id));
        const products = await localDb.products.toArray();

        expect(products.length).toBeGreaterThan(0);
        for (const product of products) {
            expect(categoryIds.has(product.category_id!), product.name).toBe(true);
        }
    });

    it('stores variants and modifiers on the product row', async () => {
        await seedRestaurantDataset(QBELLA_EVORA_DATASET);

        const penne = await localDb.products.where('sku').equals('QB-PM-003').first();
        expect(penne).toBeDefined();

        const sauce = penne!.variants?.find(v => v.name === 'Molho');
        expect(sauce?.options.map(o => o.name)).toContain('Pomodoro');
        expect(penne!.modifiers?.some(m => m.name === 'Extra camarão')).toBe(true);
    });

    it('gives products their photo so the POS grid is not blank', async () => {
        await seedRestaurantDataset(QBELLA_EVORA_DATASET);

        const penne = await localDb.products.where('sku').equals('QB-PM-003').first();
        expect(penne?.image_url).toMatch(/^https:\/\/images\.bolt\.eu\//);

        const withImages = (await localDb.products.toArray()).filter(p => p.image_url);
        expect(withImages.length).toBe(QBELLA_EVORA_DATASET.products.length - 1);
    });

    it('costs recipe dishes from their ingredients, not from the dataset', async () => {
        await seedRestaurantDataset(QBELLA_EVORA_DATASET);

        const quiche = await localDb.products.where('sku').equals('QB-EN-002').first();
        expect(quiche).toBeDefined();
        // One quiche unit at 1.15 — the cost must come from the recipe line.
        expect(quiche!.cost).toBeCloseTo(1.15, 4);
        expect(quiche!.cost).toBeLessThan(quiche!.price);
    });

    it('leaves recipe-free products on their declared cost', async () => {
        await seedRestaurantDataset(QBELLA_EVORA_DATASET);

        const water = await localDb.products.where('sku').equals('QB-BE-005').first();
        expect(water?.cost).toBeCloseTo(0.28, 4);
    });

    it('points recipe lines at real products and real raw materials', async () => {
        await seedRestaurantDataset(QBELLA_EVORA_DATASET);

        const productIds = new Set((await localDb.products.toArray()).map(p => p.id));
        const materialIds = new Set((await localDb.rawMaterials.toArray()).map(m => m.id));

        for (const line of await localDb.recipeLines.toArray()) {
            expect(productIds.has(line.product_id)).toBe(true);
            expect(materialIds.has(line.raw_material_id)).toBe(true);
            expect(line.quantity_per_unit).toBeGreaterThan(0);
        }
    });

    it('queues categories and products for sync', async () => {
        await seedRestaurantDataset(QBELLA_EVORA_DATASET);

        expect(await localDb.categorySyncQueue.count()).toBe(QBELLA_EVORA_DATASET.categories.length);
        expect(await localDb.productSyncQueue.count()).toBe(QBELLA_EVORA_DATASET.products.length);

        const queued = await localDb.categorySyncQueue.toArray();
        expect(queued.every(op => op.type === 'CREATE')).toBe(true);
        expect(typeof queued[0].timestamp).toBe('string');
    });

    it('updates instead of duplicating when run a second time', async () => {
        await seedRestaurantDataset(QBELLA_EVORA_DATASET);
        const firstProducts = await localDb.products.toArray();
        const firstIds = firstProducts.map(p => p.id).sort();

        await seedRestaurantDataset(QBELLA_EVORA_DATASET);
        const secondProducts = await localDb.products.toArray();

        expect(secondProducts.length).toBe(firstProducts.length);
        expect(secondProducts.map(p => p.id).sort()).toEqual(firstIds);
        expect(await localDb.recipeLines.count()).toBe(
            new Set((await localDb.recipeLines.toArray()).map(l => l.id)).size
        );

        // The second pass queues updates, not another round of creates.
        const queued = await localDb.productSyncQueue.toArray();
        expect(queued.filter(op => op.type === 'UPDATE').length).toBe(firstProducts.length);
    });

    it('keeps a raw material that was wired up to sell in the POS', async () => {
        await seedRestaurantDataset(QBELLA_EVORA_DATASET);

        const material = (await localDb.rawMaterials.toArray())[0];
        await localDb.rawMaterials.update(material.id, {
            sell_enabled: true,
            sale_price: 9.99,
            linked_product_id: 'linked-product-id',
        });

        await seedRestaurantDataset(QBELLA_EVORA_DATASET);

        const after = await localDb.rawMaterials.get(material.id);
        expect(after?.sell_enabled).toBe(true);
        expect(after?.sale_price).toBe(9.99);
        expect(after?.linked_product_id).toBe('linked-product-id');
    });

    it('skips recipe lines whose raw material is not in the dataset', async () => {
        const broken = {
            ...QBELLA_EVORA_DATASET,
            id: 'broken-dataset',
            products: [
                {
                    ...QBELLA_EVORA_DATASET.products[0],
                    recipe: [{ material: 'does-not-exist', quantity_per_unit: 1 }],
                },
            ],
        };

        const result = await seedRestaurantDataset(broken);

        expect(result.unknownMaterials).toEqual(['does-not-exist']);
        expect(result.recipeLinesCount).toBe(0);
        expect(result.success).toBe(true);
    });
});
