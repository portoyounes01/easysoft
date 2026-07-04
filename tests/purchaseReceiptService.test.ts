import { beforeEach, describe, expect, it } from 'vitest';

import { localDb } from '../src/lib/localDatabase';
import { matchPurchaseLines } from '../src/services/purchaseReceiptService';
import { purchaseReceiptService } from '../src/services/purchaseReceiptService';
import type { PurchaseDocumentExtraction } from '../src/types/purchaseReceipt';
import type { LocalProduct } from '../src/types/supabase';

const product = (overrides: Partial<LocalProduct>): LocalProduct => ({
    id: 'product-1',
    name: 'Coca Cola Original',
    description: null,
    sku: 'COCA001',
    barcode: '5601234567890',
    category_id: 'category-1',
    category_name: 'Drinks',
    price: 2.2,
    cost: 1,
    iva_rate: 0.23,
    stock: 10,
    min_stock: 2,
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
    ...overrides,
});

const extraction = (line: PurchaseDocumentExtraction['lines'][number]): PurchaseDocumentExtraction => ({
    provider: 'azure_document_intelligence',
    model: 'prebuilt-receipt',
    supplierName: 'Supplier',
    supplierTaxNumber: null,
    documentNumber: null,
    purchaseDate: null,
    currency: 'EUR',
    subtotal: null,
    tax: null,
    total: line.lineTotal,
    confidence: 0.9,
    lines: [line],
});

describe('purchase receipt product matching', () => {
    it('matches by SKU or barcode before product name', () => {
        const lines = matchPurchaseLines(extraction({
            description: 'Different receipt wording',
            productCode: '5601234567890',
            quantity: 6,
            unitCost: 1.1,
            lineTotal: 6.6,
            confidence: 0.95,
        }), [product({})]);

        expect(lines[0].resolution).toBe('matched');
        expect(lines[0].matchedProductId).toBe('product-1');
    });

    it('matches normalized names with accents and punctuation removed', () => {
        const lines = matchPurchaseLines(extraction({
            description: 'Coca-Cola Original',
            productCode: null,
            quantity: 2,
            unitCost: 1,
            lineTotal: 2,
            confidence: 0.85,
        }), [product({})]);

        expect(lines[0].resolution).toBe('matched');
    });

    it('proposes a new product when no catalog match exists', () => {
        const lines = matchPurchaseLines(extraction({
            description: 'New supplier sauce',
            productCode: null,
            quantity: 3,
            unitCost: 2.5,
            lineTotal: 7.5,
            confidence: 0.72,
        }), [product({})]);

        expect(lines[0].resolution).toBe('new_product');
        expect(lines[0].newProductName).toBe('New supplier sauce');
        expect(lines[0].newProductSku).toMatch(/^IMP-/);
    });
});

describe('purchase receipt stock application', () => {
    beforeEach(async () => {
        await localDb.open();
        await Promise.all([
            localDb.products.clear(),
            localDb.categories.clear(),
            localDb.productSyncQueue.clear(),
            localDb.purchaseReceipts.clear(),
            localDb.purchaseReceiptLines.clear(),
        ]);
        await localDb.categories.add({
            id: 'category-1',
            name: 'Drinks',
            description: '',
            color: 'from-blue-500 to-purple-600',
            icon: 'grid',
            display_order: 1,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
            last_synced_at: null,
            deleted_at: null,
            needs_push: false,
            is_conflicted: false,
        });
        await localDb.products.add(product({}));
    });

    it('atomically updates matched stock and stores the purchase history', async () => {
        const extracted = extraction({
            description: 'Coca-Cola Original',
            productCode: 'COCA001',
            quantity: 6,
            unitCost: 1.25,
            lineTotal: 7.5,
            confidence: 0.95,
        });
        const draftLines = matchPurchaseLines(extracted, [product({})]);

        const receiptId = await purchaseReceiptService.apply({
            file: new File(['receipt'], 'receipt.pdf', { type: 'application/pdf' }),
            documentType: 'receipt',
            extraction: extracted,
            lines: draftLines,
            employeeId: 'employee-1',
        });

        const updatedProduct = await localDb.products.get('product-1');
        expect(updatedProduct?.stock).toBe(16);
        expect(updatedProduct?.cost).toBe(1.25);
        expect((await localDb.purchaseReceipts.get(receiptId))?.status).toBe('applied');
        const storedLines = await localDb.purchaseReceiptLines
            .where('purchase_receipt_id')
            .equals(receiptId)
            .toArray();
        expect(storedLines[0]).toMatchObject({
            product_id: 'product-1',
            stock_before: 10,
            stock_after: 16,
        });
    });
});
