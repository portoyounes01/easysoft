import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import { runFiscalCheckout } from '../../src/fiscal/checkoutOrchestrator';
import { WebCryptoRsaSha1Signer } from '../../src/fiscal/signing';
import type { SystemSettings } from '../../src/contexts/SettingsContext';
import type { LocalProduct } from '../../src/types/supabase';

function makeSettings(privateKeyPem: string): SystemSettings {
    return {
        autoLogout: { enabled: false, timeoutMinutes: 15, warningSeconds: 30, protectWhenCartHasItems: false },
        pos: {
            currencySymbol: '€',
            taxRate: 0.23,
            allowNegativeStock: false,
            autoClearCart: { enabled: false, timeoutMinutes: 0 },
        },
        display: { itemsPerPage: 20, showEmployeePhotos: true, compactMode: false },
        company: {
            name: 'T',
            address: 'A',
            postalCode: '1000',
            city: 'Lx',
            taxNumber: '500000000',
            softwareCertNumber: '1',
        },
        receipt: {
            series: 'S',
            seriesDescription: '',
            seriesPrefix: 'T',
            numericWidth: 4,
            resetPolicy: 'monthly',
            lastSeriesKey: '',
            currentNumber: 999,
            defaultDocumentType: 'FATURA_SIMPLIFICADA',
            counterLabel: 'B1',
            atValidationCode: 'ATCODE1',
            seriesDiscontinued: false,
        },
        fiscal: { hashControlVersion: '1', trainingMode: true, privateKeyPem },
    } as SystemSettings;
}

function baseProduct(overrides: Partial<LocalProduct>): LocalProduct {
    return {
        id: 'p1',
        name: 'Item',
        description: null,
        sku: 'SKU1',
        barcode: null,
        category_id: 'c1',
        category_name: 'Cat',
        price: 10,
        cost: 5,
        iva_rate: 0.23,
        stock: 100,
        min_stock: 0,
        track_stock: false,
        image_url: null,
        supplier: null,
        location: null,
        is_active: true,
        display_order: 0,
        needs_push: false,
        is_conflicted: false,
        last_synced_at: null,
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        ...overrides,
    };
}

describe('runFiscalCheckout negative-line guards', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const signer = new WebCryptoRsaSha1Signer(privateKeyPem);
    const settings = makeSettings(privateKeyPem);

    it('rejects negative product price', async () => {
        await expect(
            runFiscalCheckout({
                settings,
                cart: [{ product: baseProduct({ price: -5 }), quantity: 1, discount: 0 }],
                selectedCustomer: null,
                payment: { paymentMethod: 'cash', employeeId: 'e1', employeeName: 'Emp' },
                signer,
            })
        ).rejects.toThrow(/Preço de produto inválido/);
    });

    it('rejects zero quantity', async () => {
        await expect(
            runFiscalCheckout({
                settings,
                cart: [{ product: baseProduct({}), quantity: 0, discount: 0 }],
                selectedCustomer: null,
                payment: { paymentMethod: 'cash', employeeId: 'e1', employeeName: 'Emp' },
                signer,
            })
        ).rejects.toThrow(/Quantidade inválida/);
    });

});
