import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import { initializeLocalDatabase, localDb, transactionLocalService } from '../../src/lib/localDatabase';
import { runFiscalCheckout, type FiscalCartLine } from '../../src/fiscal/checkoutOrchestrator';
import { WebCryptoRsaSha1Signer } from '../../src/fiscal/signing';
import type { SystemSettings } from '../../src/contexts/SettingsContext';
import type { LocalCustomer, LocalProduct } from '../../src/types/supabase';
import { defaultSeriesProfiles } from '../../src/fiscal/receiptSeriesProfile';

function makeTestSettings(privateKeyPem: string): SystemSettings {
    return {
        autoLogout: { enabled: false, timeoutMinutes: 15, warningSeconds: 30, protectWhenCartHasItems: true },
        pos: {
            currencySymbol: '€',
            taxRate: 0.23,
            trackInventory: true,
            allowNegativeStock: false,
            autoClearCart: { enabled: false, timeoutMinutes: 0 },
        },
        display: { itemsPerPage: 20, showEmployeePhotos: true, compactMode: false },
        company: {
            name: 'Custom Inv Lda',
            address: 'Rua 1',
            postalCode: '1000-001',
            city: 'Lisboa',
            taxNumber: '509999999',
            phone: '',
            email: '',
            slogan: '',
            softwareInfo: 'TestPOS',
            certificationNumber: '1/AT',
            softwareCertNumber: '999',
        },
        receipt: {
            defaultDocumentType: 'FATURA',
            counterLabel: 'B1',
            seriesProfiles: (() => {
                const p = defaultSeriesProfiles();
                p.FT.series = 'A';
                p.FT.numericWidth = 4;
                p.FT.resetPolicy = 'yearly';
                p.FT.lastSeriesKey = '';
                p.FT.currentNumber = 0;
                p.FT.atValidationCode = 'ATFT01';
                p.FT.seriesDiscontinued = false;
                p.FS = { ...p.FT };
                return p;
            })(),
        },
        fiscal: { hashControlVersion: '1', trainingMode: true, privateKeyPem },
    } as unknown as SystemSettings;
}

// Mirrors the synthetic product built by Transactions.handleCreateCustomInvoice.
function syntheticLine(description: string, unitPrice: number, ivaRate: number, id: string): FiscalCartLine {
    const now = new Date();
    const product = {
        id,
        name: description,
        description: null,
        sku: `CUSTOM-${id}`,
        barcode: null,
        category_id: null,
        category_name: null,
        price: unitPrice,
        cost: 0,
        iva_rate: ivaRate,
        stock: 0,
        min_stock: 0,
        track_stock: false,
        image_url: null,
        supplier: null,
        location: null,
        is_active: true,
        display_order: 0,
        created_at: now,
        updated_at: now,
        last_synced_at: null,
        deleted_at: null,
        needs_push: false,
        is_conflicted: false,
    } as LocalProduct;
    return { product, quantity: 1, discount: 0 };
}

describe('custom invoice via runFiscalCheckout (synthetic products)', () => {
    let settings: SystemSettings;
    let signer: WebCryptoRsaSha1Signer;

    beforeEach(async () => {
        await initializeLocalDatabase();
        await localDb.fiscalDocuments.clear();
        await localDb.transactions.clear();
        await localDb.transactionItems.clear();
        await localDb.fiscalAuditEvents.clear();
        await localDb.transactionSyncQueue.clear();

        const { privateKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
            publicKeyEncoding: { type: 'spki', format: 'pem' },
        });
        settings = makeTestSettings(privateKey);
        signer = await WebCryptoRsaSha1Signer.fromPkcs8Pem(privateKey);
    });

    it('issues a signed, numbered FT for a free-text line not in the catalogue', async () => {
        const result = await runFiscalCheckout({
            settings,
            cart: [syntheticLine('Consulting service', 123, 0.23, 'aaaaaaaa-0000-0000-0000-000000000001')],
            selectedCustomer: null,
            payment: { paymentMethod: 'cash', amountPaid: 123, employeeId: 'e1', employeeName: 'Emp' },
            signer,
        });

        expect(result.invoiceTypeSaft).toBe('FT');
        expect(result.invoiceNo).toBe('FT A/0001');
        expect(result.grossTotal).toBe(123);

        const fiscal = await transactionLocalService.getFiscalDocumentById(result.fiscalId);
        expect(fiscal?.invoice_type).toBe('FT');
        expect(fiscal?.gross_total).toBe(123);

        // The transaction persists with the free-text description as the line item.
        const tx = await transactionLocalService.getTransactionById(result.transactionId);
        expect(tx?.items?.[0]?.product_name).toBe('Consulting service');
    });

    it('puts the entered NIF on the fiscal document via an ephemeral customer', async () => {
        const ephemeral = {
            id: '',
            name: 'ACME Lda',
            tax_number: '501234567',
            country: 'PT',
            address: null,
        } as unknown as LocalCustomer;

        const result = await runFiscalCheckout({
            settings,
            cart: [syntheticLine('Repair', 50, 0.23, 'bbbbbbbb-0000-0000-0000-000000000002')],
            selectedCustomer: ephemeral,
            payment: { paymentMethod: 'card', employeeId: 'e1', employeeName: 'Emp' },
            signer,
        });

        const tx = await transactionLocalService.getTransactionById(result.transactionId);
        // Empty ephemeral id must not become a customer_id reference.
        expect(tx?.customer_id).toBeNull();
        const fiscal = await transactionLocalService.getFiscalDocumentById(result.fiscalId);
        expect(fiscal?.customer_tax_id).toBe('501234567');
    });

    it('gives each custom line a unique SKU so SAF-T ProductCode stays unique', async () => {
        const result = await runFiscalCheckout({
            settings,
            cart: [
                syntheticLine('Line one', 10, 0.23, 'cccccccc-0000-0000-0000-000000000003'),
                syntheticLine('Line two', 20, 0.13, 'dddddddd-0000-0000-0000-000000000004'),
            ],
            selectedCustomer: null,
            payment: { paymentMethod: 'cash', amountPaid: 30, employeeId: 'e1', employeeName: 'Emp' },
            signer,
        });

        const tx = await transactionLocalService.getTransactionById(result.transactionId);
        const skus = (tx?.items ?? []).map(item => item.product_sku);
        expect(new Set(skus).size).toBe(2);
        expect(skus.every(sku => sku?.startsWith('CUSTOM-'))).toBe(true);
    });
});
