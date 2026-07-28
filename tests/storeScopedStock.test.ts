// The bug this whole design exists to fix: two stores of one tenant shared a
// single stock scalar, so a sale in one drew down the other's inventory.
//
// The fix is not a new read path — it is that the till syncs only ITS store's
// row and folds it onto the local record. `product.stock` and
// `rawMaterial.stock` keep their columns and simply now mean "this store's",
// which makes every existing reader correct without touching it.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeLocalDatabase, localDb } from '../src/lib/localDatabase';

const rpc = vi.fn();

vi.mock('../src/lib/supabase', () => ({
    supabase: { rpc: (...args: unknown[]) => rpc(...args) },
    connectionStatus: {
        getStatus: () => ({ isOnline: true, isSupabaseOnline: true }),
        addListener: vi.fn(),
        removeListener: vi.fn(),
    },
    isSupabaseConfigured: () => true,
}));

const STORE_A = '11111111-1111-1111-1111-111111111111';
const STORE_B = '22222222-2222-2222-2222-222222222222';
const PRODUCT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const MATERIAL = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const seedProduct = async (stock: number, price: number) => {
    await localDb.products.put({
        id: PRODUCT,
        name: 'Baguete',
        sku: 'BG1',
        price,
        cost: 1,
        stock,
        min_stock: 0,
        iva_rate: 0.13,
        category_id: null,
        category_name: null,
        is_active: true,
        track_stock: true,
        created_at: new Date(),
        updated_at: new Date(),
        last_synced_at: null,
        deleted_at: null,
        needs_push: false,
        is_conflicted: false,
    } as never);
};

const seedMaterial = async (stock: number) => {
    await localDb.rawMaterials.put({
        id: MATERIAL,
        name: 'Farinha',
        unit: 'kg',
        stock,
        cost: 1,
        min_stock: 0,
        supplier: null,
        is_active: true,
    } as never);
};

beforeEach(async () => {
    await initializeLocalDatabase();
    await localDb.products.clear();
    await localDb.rawMaterials.clear();
    rpc.mockReset();
});

describe('folding the store row onto the local record', () => {
    it('takes only this store’s stock and ignores the other store’s row', async () => {
        const { pullStoreProducts } = await import('../src/services/storeScopedSyncService');
        await seedProduct(999, 5);
        rpc.mockResolvedValue({
            data: [
                { store_id: STORE_A, product_id: PRODUCT, stock: 12, min_stock: 2, price: null, is_available: true, track_stock: true, deleted_at: null },
                { store_id: STORE_B, product_id: PRODUCT, stock: 77, min_stock: 9, price: null, is_available: true, track_stock: true, deleted_at: null },
            ],
            error: null,
        });

        await pullStoreProducts(STORE_A);

        const product = await localDb.products.get(PRODUCT);
        expect(product?.stock).toBe(12);
        expect(product?.min_stock).toBe(2);
    });

    // A null store price means "inherit the tenant product price".
    it('keeps the tenant price when the store sets none, and overrides when it does', async () => {
        const { pullStoreProducts } = await import('../src/services/storeScopedSyncService');
        const row = (price: number | null) => ({
            data: [{ store_id: STORE_A, product_id: PRODUCT, stock: 1, min_stock: 0, price, is_available: true, track_stock: true, deleted_at: null }],
            error: null,
        });

        await seedProduct(0, 5);
        rpc.mockResolvedValue(row(null));
        await pullStoreProducts(STORE_A);
        expect((await localDb.products.get(PRODUCT))?.price).toBe(5);

        rpc.mockResolvedValue(row(7.5));
        await pullStoreProducts(STORE_A);
        expect((await localDb.products.get(PRODUCT))?.price).toBe(7.5);
    });

    it('folds this store’s raw-material stock, not the tenant figure', async () => {
        const { pullStoreRawMaterials } = await import('../src/services/storeScopedSyncService');
        await seedMaterial(500);
        rpc.mockResolvedValue({
            data: [
                { store_id: STORE_B, raw_material_id: MATERIAL, stock: 400, min_stock: 0, deleted_at: null },
                { store_id: STORE_A, raw_material_id: MATERIAL, stock: 3, min_stock: 1, deleted_at: null },
            ],
            error: null,
        });

        await pullStoreRawMaterials(STORE_A);

        expect((await localDb.rawMaterials.get(MATERIAL))?.stock).toBe(3);
    });

    // The tenant pull carries identity and cost; it must not clobber the stock
    // the store pull owns.
    it('does not let the tenant material pull overwrite store stock', async () => {
        const { pullRawMaterials } = await import('../src/services/storeScopedSyncService');
        await seedMaterial(3);
        rpc.mockResolvedValue({
            data: [{ id: MATERIAL, name: 'Farinha T65', unit: 'kg', cost: 2, supplier: 'X', is_active: true, description: null, deleted_at: null }],
            error: null,
        });

        await pullRawMaterials();

        const material = await localDb.rawMaterials.get(MATERIAL);
        expect(material?.name).toBe('Farinha T65');
        expect(material?.cost).toBe(2);
        expect(material?.stock).toBe(3);
    });
});

describe('a sale marks the store row dirty, not the tenant row', () => {
    it('routes a product deduction to the store push, leaving needs_push alone', async () => {
        const { transactionLocalService } = await import('../src/lib/localDatabase');
        await seedProduct(10, 5);

        await transactionLocalService.updateProductStock([
            { product_id: PRODUCT, quantity: 3 } as never,
        ]);

        const product = await localDb.products.get(PRODUCT);
        expect(product?.stock).toBe(7);
        expect(product?.store_stock_dirty).toBe(true);
        // needs_push is forced true by the Dexie 'updating' hook on ANY change,
        // so it cannot be used to keep stock off the tenant row. That is closed
        // at the payload instead: pushProducts sends stock as null and
        // upsert_products preserves (migration 20260808000000).
    });

    it('routes a recipe deduction the same way', async () => {
        const { recipeService } = await import('../src/services/recipeService');
        await seedMaterial(10);
        await localDb.recipeLines.put({
            id: 'r1', product_id: PRODUCT, raw_material_id: MATERIAL, quantity_per_unit: 2,
        } as never);

        await recipeService.deductForSoldItems([{ product_id: PRODUCT, quantity: 3 }]);

        const material = await localDb.rawMaterials.get(MATERIAL);
        expect(material?.stock).toBe(4);
        expect(material?.store_stock_dirty).toBe(true);
    });
});

describe('pushing stock back', () => {
    it('sends the dirty rows to this store and clears the flag on success', async () => {
        const { pushStoreStock } = await import('../src/services/storeScopedSyncService');
        await seedProduct(7, 5);
        await localDb.products.update(PRODUCT, { store_stock_dirty: true } as never);
        rpc.mockResolvedValue({ data: 1, error: null });

        await pushStoreStock(STORE_A);

        const [fn, args] = rpc.mock.calls[0] as [string, { rows_data: Record<string, unknown>[] }];
        expect(fn).toBe('upsert_store_products');
        expect(args.rows_data[0]).toMatchObject({ store_id: STORE_A, product_id: PRODUCT, stock: 7 });
        expect((await localDb.products.get(PRODUCT))?.store_stock_dirty).toBe(false);
    });

    // A cleared flag on a failed push would lose the sale's deduction for good.
    it('keeps the flag when the push fails, so the next sync retries', async () => {
        const { pushStoreStock } = await import('../src/services/storeScopedSyncService');
        await seedProduct(7, 5);
        await localDb.products.update(PRODUCT, { store_stock_dirty: true } as never);
        rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });

        await pushStoreStock(STORE_A);

        expect((await localDb.products.get(PRODUCT))?.store_stock_dirty).toBe(true);
    });
});


describe('the tenant product push', () => {
    it('sends null stock so it cannot overwrite another store’s figure', async () => {
        const { productSyncService } = await import('../src/services/productService');
        await seedProduct(7, 5);
        await localDb.products.update(PRODUCT, { needs_push: true } as never);
        rpc.mockResolvedValue({ data: 1, error: null });

        await productSyncService.pushProducts();

        const call = rpc.mock.calls.find(c => c[0] === 'upsert_products');
        expect(call).toBeDefined();
        const row = (call![1] as { products_data: Record<string, unknown>[] }).products_data[0];
        expect(row.stock).toBeNull();
        expect(row.min_stock).toBeNull();
        // Catalogue fields still go, because those ARE the tenant's.
        expect(row.name).toBe('Baguete');
        expect(row.price).toBe(5);
    });
});
