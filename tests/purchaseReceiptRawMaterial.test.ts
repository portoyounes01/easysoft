import { beforeEach, describe, expect, it } from 'vitest';

import { initializeLocalDatabase, localDb } from '../src/lib/localDatabase';
import { purchaseReceiptService } from '../src/services/purchaseReceiptService';
import { rawMaterialService } from '../src/services/rawMaterialService';
import { recipeService } from '../src/services/recipeService';
import type { PurchaseDocumentExtraction, PurchaseReceiptDraftLine } from '../src/types/purchaseReceipt';

const extraction: PurchaseDocumentExtraction = {
    provider: 'azure_document_intelligence',
    model: 'prebuilt-receipt',
    supplierName: 'Bun Supplier',
    supplierTaxNumber: null,
    documentNumber: 'DOC-1',
    purchaseDate: '2026-06-27',
    currency: 'EUR',
    subtotal: null,
    tax: null,
    total: null,
    confidence: 0.9,
    lines: [],
};

const rawLine = (overrides: Partial<PurchaseReceiptDraftLine>): PurchaseReceiptDraftLine => ({
    id: 'line-1',
    description: 'Sesame buns',
    productCode: null,
    quantity: 50,
    unitCost: 0.12,
    lineTotal: 6,
    confidence: 0.9,
    resolution: 'raw_material',
    matchedProductId: null,
    newProductName: '',
    newProductSku: '',
    newProductCategoryId: null,
    newProductSellingPrice: 0,
    rawMaterialId: null,
    newRawMaterialName: 'Sesame bun',
    newRawMaterialUnit: 'pcs',
    ...overrides,
});

const applyRequest = (lines: PurchaseReceiptDraftLine[]) => ({
    file: new File(['x'], 'receipt.pdf', { type: 'application/pdf' }),
    documentType: 'receipt' as const,
    extraction,
    lines,
    employeeId: 'emp-1',
});

describe('purchase receipts → raw materials', () => {
    beforeEach(async () => {
        await initializeLocalDatabase();
        await localDb.rawMaterials.clear();
        await localDb.purchaseReceipts.clear();
        await localDb.purchaseReceiptLines.clear();
        await localDb.recipeLines.clear();
        await localDb.products.clear();
    });

    it('creates a new raw material and stocks it from a purchase line', async () => {
        await purchaseReceiptService.apply(applyRequest([rawLine({})]));

        const materials = await rawMaterialService.list();
        expect(materials).toHaveLength(1);
        expect(materials[0].name).toBe('Sesame bun');
        expect(materials[0].unit).toBe('pcs');
        expect(materials[0].stock).toBe(50);
        expect(materials[0].cost).toBeCloseTo(0.12, 5);
        expect(materials[0].supplier).toBe('Bun Supplier');
    });

    it('tops up the stock of an existing raw material', async () => {
        const existing = await rawMaterialService.create({
            name: 'Tomato', unit: 'kg', stock: 4, cost: 1.2, min_stock: 0, supplier: null, is_active: true,
        });

        await purchaseReceiptService.apply(
            applyRequest([rawLine({ rawMaterialId: existing.id, quantity: 6, unitCost: 1.5 })])
        );

        const updated = await rawMaterialService.getById(existing.id);
        expect(updated!.stock).toBe(10); // 4 + 6
        expect(updated!.cost).toBeCloseTo(1.5, 5); // cost refreshed to latest purchase
    });

    it('repriced delivery flows to the cost of dishes that use the raw material', async () => {
        const meat = await rawMaterialService.create({
            name: 'Meat', unit: 'kg', stock: 0, cost: 8, min_stock: 0, supplier: null, is_active: true,
        });
        await localDb.products.add({
            id: 'shawarma', name: 'Shawarma', description: null, sku: 'S1', barcode: null,
            category_id: null, category_name: null, price: 6, cost: 0, iva_rate: 0.23, stock: 0,
            min_stock: 0, track_stock: false, image_url: null, supplier: null, location: null,
            is_active: true, display_order: 0, created_at: new Date(), updated_at: new Date(),
            last_synced_at: null, deleted_at: null, needs_push: false, is_conflicted: false,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        await recipeService.upsertLine('shawarma', meat.id, 0.15); // dish cost = 0.15 × 8 = 1.20

        // New delivery at €10/kg → dish cost should reprice to 0.15 × 10 = 1.50.
        await purchaseReceiptService.apply(
            applyRequest([rawLine({ rawMaterialId: meat.id, quantity: 20, unitCost: 10 })])
        );

        expect((await localDb.products.get('shawarma'))!.cost).toBeCloseTo(1.5, 4);
    });

    it('records the receipt line against the raw material, not a product', async () => {
        await purchaseReceiptService.apply(applyRequest([rawLine({})]));
        const lines = await localDb.purchaseReceiptLines.toArray();
        expect(lines).toHaveLength(1);
        expect(lines[0].resolution).toBe('raw_material');
        expect(lines[0].product_id).toBeNull();
        expect(lines[0].raw_material_id).toBeTruthy();
        expect(lines[0].stock_before).toBe(0);
        expect(lines[0].stock_after).toBe(50);
    });
});
