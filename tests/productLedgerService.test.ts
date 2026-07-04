import { beforeEach, describe, expect, it } from 'vitest';

import { initializeLocalDatabase, localDb } from '../src/lib/localDatabase';
import { productLedgerService } from '../src/services/productLedgerService';
import { rawMaterialService } from '../src/services/rawMaterialService';
import { recipeService } from '../src/services/recipeService';
import type { LocalProduct } from '../src/types/supabase';

const product = (id: string, name: string, stock: number): LocalProduct => ({
    id,
    name,
    description: null,
    sku: `${id.toUpperCase()}-SKU`,
    barcode: null,
    category_id: null,
    category_name: null,
    price: 5,
    cost: 2,
    iva_rate: 0.23,
    stock,
    min_stock: 0,
    track_stock: true,
    image_url: null,
    supplier: null,
    location: null,
    is_active: true,
    display_order: 0,
    created_at: new Date(),
    updated_at: new Date(),
    last_synced_at: null,
    deleted_at: null,
    needs_push: false,
    is_conflicted: false,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function addSale(productId: string, date: string, qty: number, lineTotal: number, profit: number) {
    const txId = `tx-${productId}-${date}`;
    await localDb.transactions.add({
        id: txId,
        transaction_number: txId,
        employee_id: 'e1',
        employee_name: 'Emp',
        customer_id: null,
        customer_name: null,
        transaction_date: date,
        transaction_time: '12:00:00',
        subtotal: lineTotal,
        discount: 0,
        tax: 0,
        total: lineTotal,
        payment_method: 'cash',
        amount_paid: lineTotal,
        change_given: 0,
        status: 'completed',
        notes: null,
        receipt_number: null,
        deleted_at: null,
        fiscal_document_id: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    await localDb.transactionItems.add({
        id: `it-${txId}`,
        transaction_id: txId,
        product_id: productId,
        product_name: productId,
        product_sku: null,
        category_id: null,
        category_name: null,
        quantity: qty,
        unit_price: lineTotal / qty,
        unit_cost: 0,
        iva_rate: 0.23,
        line_total: lineTotal,
        tax_amount: 0,
        profit_amount: profit,
        discount_amount: 0,
        discount_percentage: 0,
        deleted_at: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
}

async function addPurchase(productId: string | null, date: string, qty: number, lineTotal: number) {
    const receiptId = `rc-${productId ?? 'raw'}-${date}`;
    await localDb.purchaseReceipts.add({
        id: receiptId,
        file_name: 'r.pdf',
        mime_type: 'application/pdf',
        document_type: 'receipt',
        extraction_model: 'prebuilt-receipt',
        supplier_name: 'S',
        supplier_tax_number: null,
        document_number: null,
        purchase_date: date,
        currency: 'EUR',
        subtotal: null,
        tax: null,
        total: null,
        status: 'applied',
        line_count: 1,
        applied_by_employee_id: 'e1',
        error_message: null,
        raw_extraction_json: '{}',
        created_at: new Date(`${date}T10:00:00`),
        applied_at: new Date(`${date}T10:00:00`),
    });
    await localDb.purchaseReceiptLines.add({
        id: `rl-${receiptId}`,
        purchase_receipt_id: receiptId,
        description: 'line',
        product_code: null,
        quantity: qty,
        unit_cost: lineTotal / qty,
        line_total: lineTotal,
        confidence: 1,
        resolution: productId ? 'matched' : 'raw_material',
        product_id: productId,
        raw_material_id: productId ? null : 'raw-1',
        stock_before: 0,
        stock_after: qty,
        created_at: new Date(`${date}T10:00:00`),
    });
}

describe('productLedgerService.getLedger', () => {
    beforeEach(async () => {
        await initializeLocalDatabase();
        await localDb.products.clear();
        await localDb.transactions.clear();
        await localDb.transactionItems.clear();
        await localDb.purchaseReceipts.clear();
        await localDb.purchaseReceiptLines.clear();
        await localDb.rawMaterials.clear();
        await localDb.recipeLines.clear();
    });

    it('aggregates purchases, sales, remaining and profit per product within the range', async () => {
        await localDb.products.add(product('burger', 'Burger', 7));
        await addPurchase('burger', '2026-06-10', 20, 40);
        await addSale('burger', '2026-06-15', 5, 25, 12);

        const rows = await productLedgerService.getLedger('2026-06-01', '2026-06-30');
        const row = rows.find(r => r.productId === 'burger')!;
        expect(row.purchasedQty).toBe(20);
        expect(row.purchasedValue).toBe(40);
        expect(row.soldQty).toBe(5);
        expect(row.soldValue).toBe(25);
        expect(row.remaining).toBe(7);
        expect(row.profit).toBe(12);
    });

    it('excludes activity outside the date range', async () => {
        await localDb.products.add(product('soda', 'Soda', 3));
        await addSale('soda', '2026-05-30', 4, 8, 3); // before range
        await addPurchase('soda', '2026-07-02', 10, 10); // after range

        const rows = await productLedgerService.getLedger('2026-06-01', '2026-06-30');
        const row = rows.find(r => r.productId === 'soda')!;
        expect(row.soldQty).toBe(0);
        expect(row.purchasedQty).toBe(0);
        expect(row.remaining).toBe(3); // remaining is point-in-time
    });

    it('excludes credit-note transactions so reversed sales are not double-counted', async () => {
        await localDb.products.add(product('combo', 'Combo', 5));
        await addSale('combo', '2026-06-15', 2, 20, 8); // real sale (FT-less / legacy)
        // A credit note stored as its own completed transaction with positive items.
        const ncId = 'tx-combo-nc';
        await localDb.transactions.add({
            id: ncId,
            transaction_number: 'NC NCSER/0001',
            employee_id: 'e1',
            employee_name: 'Emp',
            customer_id: null,
            customer_name: null,
            transaction_date: '2026-06-16',
            transaction_time: '12:00:00',
            subtotal: 20,
            discount: 0,
            tax: 0,
            total: 20,
            payment_method: 'cash',
            amount_paid: 20,
            change_given: 0,
            status: 'completed',
            notes: null,
            receipt_number: null,
            deleted_at: null,
            fiscal_document_id: null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        await localDb.transactionItems.add({
            id: `it-${ncId}`,
            transaction_id: ncId,
            product_id: 'combo',
            product_name: 'combo',
            product_sku: null,
            category_id: null,
            category_name: null,
            quantity: 2,
            unit_price: 10,
            unit_cost: 0,
            iva_rate: 0.23,
            line_total: 20,
            tax_amount: 0,
            profit_amount: 8,
            discount_amount: 0,
            discount_percentage: 0,
            deleted_at: null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        const rows = await productLedgerService.getLedger('2026-06-01', '2026-06-30');
        const row = rows.find(r => r.productId === 'combo')!;
        expect(row.soldQty).toBe(2); // not 4
        expect(row.profit).toBe(8); // not 16
    });

    it('ignores raw-material purchase lines (no product_id)', async () => {
        await localDb.products.add(product('dish', 'Dish', 0));
        await addPurchase(null, '2026-06-12', 100, 12); // raw material line

        const rows = await productLedgerService.getLedger('2026-06-01', '2026-06-30');
        const row = rows.find(r => r.productId === 'dish')!;
        expect(row.purchasedQty).toBe(0);
    });

    it('reports raw materials: purchased from receipts, consumed via recipes', async () => {
        await localDb.products.add(product('shawarma', 'Shawarma', 0));
        const meat = await rawMaterialService.create({
            name: 'Meat cone', unit: 'kg', stock: 18, cost: 8, min_stock: 0, supplier: null, is_active: true,
        });
        await recipeService.upsertLine('shawarma', meat.id, 0.15); // 0.15 kg per sandwich

        // Purchase a fresh cone (20 kg) and sell 10 sandwiches in the period.
        await addPurchaseRaw(meat.id, '2026-06-05', 20, 160);
        await addSale('shawarma', '2026-06-10', 10, 80, 40);

        const report = await productLedgerService.getReport('2026-06-01', '2026-06-30');
        const row = report.rawMaterials.find(r => r.rawMaterialId === meat.id)!;
        expect(row.purchasedQty).toBe(20);
        expect(row.consumedQty).toBeCloseTo(1.5, 5); // 0.15 × 10
        expect(row.remaining).toBe(18); // current on-hand (point-in-time)

        // The dish itself shows the sale on the product grain.
        const dish = report.products.find(p => p.productId === 'shawarma')!;
        expect(dish.soldQty).toBe(10);
        expect(dish.profit).toBe(40);
    });
});

async function addPurchaseRaw(rawMaterialId: string, date: string, qty: number, lineTotal: number) {
    const receiptId = `rc-raw-${rawMaterialId}-${date}`;
    await localDb.purchaseReceipts.add({
        id: receiptId,
        file_name: 'r.pdf',
        mime_type: 'application/pdf',
        document_type: 'receipt',
        extraction_model: 'prebuilt-receipt',
        supplier_name: 'S',
        supplier_tax_number: null,
        document_number: null,
        purchase_date: date,
        currency: 'EUR',
        subtotal: null,
        tax: null,
        total: null,
        status: 'applied',
        line_count: 1,
        applied_by_employee_id: 'e1',
        error_message: null,
        raw_extraction_json: '{}',
        created_at: new Date(`${date}T10:00:00`),
        applied_at: new Date(`${date}T10:00:00`),
    });
    await localDb.purchaseReceiptLines.add({
        id: `rl-${receiptId}`,
        purchase_receipt_id: receiptId,
        description: 'meat',
        product_code: null,
        quantity: qty,
        unit_cost: lineTotal / qty,
        line_total: lineTotal,
        confidence: 1,
        resolution: 'raw_material',
        product_id: null,
        raw_material_id: rawMaterialId,
        stock_before: 0,
        stock_after: qty,
        created_at: new Date(`${date}T10:00:00`),
    });
}
