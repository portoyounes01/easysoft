import { beforeEach, describe, expect, it } from 'vitest';

import { initializeLocalDatabase, localDb } from '../src/lib/localDatabase';
import { rawMaterialService } from '../src/services/rawMaterialService';
import { recipeService } from '../src/services/recipeService';

async function makeMaterial(name: string, stock: number) {
    return rawMaterialService.create({
        name,
        unit: 'pcs',
        stock,
        cost: 0,
        min_stock: 0,
        supplier: null,
        is_active: true,
    });
}

describe('recipeService.deductForSoldItems', () => {
    beforeEach(async () => {
        await initializeLocalDatabase();
        await localDb.rawMaterials.clear();
        await localDb.recipeLines.clear();
        await localDb.products.clear();
    });

    it('deducts each ingredient by qty/unit × quantity sold', async () => {
        const bun = await makeMaterial('Bun', 100);
        const tomato = await makeMaterial('Tomato', 10); // kg-ish
        const burger = 'prod-burger';
        await recipeService.upsertLine(burger, bun.id, 1);
        await recipeService.upsertLine(burger, tomato.id, 0.03);

        await recipeService.deductForSoldItems([{ product_id: burger, quantity: 4 }]);

        expect((await rawMaterialService.getById(bun.id))!.stock).toBe(96); // 100 - 1*4
        expect((await rawMaterialService.getById(tomato.id))!.stock).toBeCloseTo(9.88, 5); // 10 - 0.03*4
    });

    it('leaves products without a recipe untouched', async () => {
        const bun = await makeMaterial('Bun', 50);
        // 'prod-soda' has no recipe lines
        await recipeService.deductForSoldItems([{ product_id: 'prod-soda', quantity: 3 }]);
        expect((await rawMaterialService.getById(bun.id))!.stock).toBe(50);
    });

    it('aggregates a shared ingredient across multiple sold products', async () => {
        const bun = await makeMaterial('Bun', 100);
        await recipeService.upsertLine('prod-burger', bun.id, 1);
        await recipeService.upsertLine('prod-double', bun.id, 2);

        await recipeService.deductForSoldItems([
            { product_id: 'prod-burger', quantity: 3 }, // 3 buns
            { product_id: 'prod-double', quantity: 2 }, // 4 buns
        ]);

        expect((await rawMaterialService.getById(bun.id))!.stock).toBe(93); // 100 - 7
    });

    it('never drives stock below zero', async () => {
        const bun = await makeMaterial('Bun', 2);
        await recipeService.upsertLine('prod-burger', bun.id, 1);
        await recipeService.deductForSoldItems([{ product_id: 'prod-burger', quantity: 5 }]);
        expect((await rawMaterialService.getById(bun.id))!.stock).toBe(0);
    });

    it('syncs the product cost to the sum of ingredient costs', async () => {
        await localDb.products.add({
            id: 'prod-burger', name: 'Burger', description: null, sku: 'B1', barcode: null,
            category_id: null, category_name: null, price: 6, cost: 0, iva_rate: 0.23, stock: 0,
            min_stock: 0, track_stock: false, image_url: null, supplier: null, location: null,
            is_active: true, display_order: 0, created_at: new Date(), updated_at: new Date(),
            last_synced_at: null, deleted_at: null, needs_push: false, is_conflicted: false,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        const bun = await rawMaterialService.create({ name: 'Bun', unit: 'pcs', stock: 0, cost: 0.2, min_stock: 0, supplier: null, is_active: true });
        const patty = await rawMaterialService.create({ name: 'Patty', unit: 'pcs', stock: 0, cost: 1.3, min_stock: 0, supplier: null, is_active: true });

        await recipeService.upsertLine('prod-burger', bun.id, 1);
        await recipeService.upsertLine('prod-burger', patty.id, 1);

        const product = await localDb.products.get('prod-burger');
        expect(product!.cost).toBeCloseTo(1.5, 4); // 0.2 + 1.3
    });

    it('propagates a raw-material cost change to dishes that use it (future sales)', async () => {
        await localDb.products.add({
            id: 'prod-burger', name: 'Burger', description: null, sku: 'B1', barcode: null,
            category_id: null, category_name: null, price: 6, cost: 0, iva_rate: 0.23, stock: 0,
            min_stock: 0, track_stock: false, image_url: null, supplier: null, location: null,
            is_active: true, display_order: 0, created_at: new Date(), updated_at: new Date(),
            last_synced_at: null, deleted_at: null, needs_push: false, is_conflicted: false,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        const patty = await rawMaterialService.create({ name: 'Patty', unit: 'pcs', stock: 0, cost: 1.3, min_stock: 0, supplier: null, is_active: true });
        await recipeService.upsertLine('prod-burger', patty.id, 1);
        expect((await localDb.products.get('prod-burger'))!.cost).toBeCloseTo(1.3, 4);

        // Next delivery: patty now costs more. A manual cost edit must reprice the dish.
        await rawMaterialService.update(patty.id, { cost: 1.8 });
        expect((await localDb.products.get('prod-burger'))!.cost).toBeCloseTo(1.8, 4);
    });

    it('upsertLine with qty 0 removes the ingredient', async () => {
        const bun = await makeMaterial('Bun', 10);
        await recipeService.upsertLine('prod-burger', bun.id, 1);
        expect(await recipeService.hasRecipe('prod-burger')).toBe(true);
        await recipeService.upsertLine('prod-burger', bun.id, 0);
        expect(await recipeService.hasRecipe('prod-burger')).toBe(false);
    });
});
