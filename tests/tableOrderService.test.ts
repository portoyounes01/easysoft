import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeLocalDatabase, localDb } from '../src/lib/localDatabase';
import {
    TableOrderAlreadyOpenError,
    tableOrderService,
} from '../src/services/tableOrderService';
import type { LocalProduct } from '../src/types/supabase';

const product: LocalProduct = {
    id: 'product-coffee',
    name: 'Espresso',
    description: null,
    sku: 'COF-001',
    barcode: null,
    category_id: 'coffee',
    category_name: 'Coffee',
    price: 2.5,
    cost: 0.5,
    iva_rate: 0.13,
    stock: 12,
    min_stock: 0,
    track_stock: true,
    image_url: null,
    supplier: null,
    location: null,
    is_active: true,
    display_order: 1,
    created_at: new Date(),
    updated_at: new Date(),
    last_synced_at: null,
    deleted_at: null,
    needs_push: false,
    is_conflicted: false,
};

describe('tableOrderService', () => {
    beforeEach(async () => {
        await initializeLocalDatabase();
        await Promise.all([
            localDb.tableOrders.clear(),
            localDb.transactions.clear(),
            localDb.transactionItems.clear(),
            localDb.fiscalDocuments.clear(),
            localDb.products.clear(),
        ]);
        await localDb.products.add(product);
    });

    afterEach(async () => {
        await localDb.tableOrders.clear();
    });

    it('parks an exact cart snapshot without creating fiscal or transaction rows', async () => {
        const order = await tableOrderService.createOpenOrder({
            tableId: 'table-1',
            tableName: 'Table 1',
            lines: [
                { lineId: 'product-coffee', product, quantity: 2, discount: 0 },
                { lineId: 'product-coffee::w1', product, quantity: 0.375, discount: 10 },
            ],
            customer: null,
            globalDiscount: { type: 'percentage', value: 5 },
            pointsRedemption: null,
        });

        const reloaded = await tableOrderService.getById(order.id);
        expect(reloaded?.status).toBe('open');
        expect(reloaded?.lines).toEqual([
            { lineId: 'product-coffee', product, quantity: 2, discount: 0 },
            { lineId: 'product-coffee::w1', product, quantity: 0.375, discount: 10 },
        ]);
        expect(reloaded?.global_discount).toEqual({ type: 'percentage', value: 5 });
        expect(await localDb.transactions.count()).toBe(0);
        expect(await localDb.transactionItems.count()).toBe(0);
        expect(await localDb.fiscalDocuments.count()).toBe(0);
        expect((await localDb.products.get(product.id))?.stock).toBe(12);
    });

    it('allows only one blocking order per table and frees it after settlement', async () => {
        const order = await tableOrderService.createOpenOrder({
            tableId: 'table-1',
            tableName: 'Table 1',
            lines: [],
            customer: null,
            globalDiscount: { type: 'none', value: 0 },
            pointsRedemption: null,
        });

        await expect(tableOrderService.createOpenOrder({
            tableId: 'table-1',
            tableName: 'Table 1',
            lines: [],
            customer: null,
            globalDiscount: { type: 'none', value: 0 },
            pointsRedemption: null,
        })).rejects.toBeInstanceOf(TableOrderAlreadyOpenError);

        await tableOrderService.beginSettlement(order.id);
        expect((await tableOrderService.getById(order.id))?.status).toBe('settling');

        await tableOrderService.markSettled(order.id, 'fiscal-transaction-1');
        const settled = await tableOrderService.getById(order.id);
        expect(settled?.status).toBe('settled');
        expect(settled?.fiscal_transaction_id).toBe('fiscal-transaction-1');
        expect(await tableOrderService.listBlocking()).toEqual([]);
    });
});
