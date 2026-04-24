import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import { initializeLocalDatabase, localDb, transactionLocalService } from '../../src/lib/localDatabase';
import type { FiscalCheckoutAtomicPayload } from '../../src/fiscal/types';
import { WebCryptoRsaSha1Signer } from '../../src/fiscal/signing';
import type { SystemSettings } from '../../src/contexts/SettingsContext';

function makeTestSettings(privateKeyPem: string): SystemSettings {
    return {
        autoLogout: { enabled: false, timeoutMinutes: 15, warningSeconds: 30, protectWhenCartHasItems: true },
        pos: {
            currencySymbol: '€',
            taxRate: 0.23,
            allowNegativeStock: false,
            autoClearCart: { enabled: false, timeoutMinutes: 0 },
        },
        display: { itemsPerPage: 20, showEmployeePhotos: true, compactMode: false },
        company: {
            name: 'Atomic Test Lda',
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
            series: 'S1',
            seriesPrefix: 'A',
            numericWidth: 4,
            resetPolicy: 'yearly' as const,
            lastSeriesKey: '',
            currentNumber: 0,
            defaultDocumentType: 'FATURA_SIMPLIFICADA' as const,
            counterLabel: 'B1',
            atValidationCode: 'ATSEQ1',
            seriesDiscontinued: false,
        },
        fiscal: { hashControlVersion: '1', trainingMode: true, privateKeyPem },
    } as unknown as SystemSettings;
}

function buildSalePayload(settings: SystemSettings, signer: WebCryptoRsaSha1Signer): FiscalCheckoutAtomicPayload {
    const d = '2026-06-15';
    return {
        settings,
        certificationMode: 'training',
        transactionDate: d,
        transactionTime: '10:00:00',
        systemEntryDate: `${d}T10:00:00`,
        seriesKey: 'A-2026',
        chainScope: 'ATSEQ1::A-2026',
        atCode: 'ATSEQ1',
        invoiceTypeSaft: 'FS',
        grossTotal: 1,
        netRounded: 0.81,
        taxTotal: 0.19,
        totalDiscountAmount: 0,
        originalSubtotal: 1,
        total: 1,
        changeGiven: 0,
        transactionBase: {
            employee_id: 'e1',
            employee_name: 'Emp',
            customer_id: null,
            customer_name: null,
            transaction_date: d,
            transaction_time: '10:00:00',
            subtotal: 1,
            discount: 0,
            discount_type: 'none',
            discount_percentage: 0,
            tax: 0.19,
            total: 1,
            payment_method: 'cash',
            amount_paid: 1,
            change_given: 0,
            status: 'completed',
            notes: null,
            deleted_at: null,
        },
        transactionItems: [
            {
                product_id: 'p1',
                product_name: 'Item',
                product_sku: 'SKU1',
                category_id: 'c1',
                category_name: 'Cat',
                quantity: 1,
                unit_price: 1,
                unit_cost: 0,
                iva_rate: 0.23,
                line_total: 1,
                tax_amount: 0.19,
                profit_amount: 0,
                discount_amount: 0,
                discount_percentage: 0,
                deleted_at: null,
            },
        ],
        customerTaxId: '999999990',
        customerTaxNumberForQr: null,
        customerCountryForQr: 'PT',
        payment: { paymentMethod: 'cash', amountPaid: 1, employeeId: 'e1', employeeName: 'Emp' },
        signer,
    };
}

describe('createFiscalCheckoutAtomic concurrency', () => {
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

    it('assigns distinct sequential_number for parallel checkouts on the same chain', async () => {
        const n = 6;
        const payloads = Array.from({ length: n }, () => buildSalePayload(settings, signer));
        const results = await Promise.all(
            payloads.map(p => transactionLocalService.createFiscalCheckoutAtomic(p))
        );
        const nums = results.map(r => r.sequentialNumber).sort((a, b) => a - b);
        expect(new Set(nums).size).toBe(n);
        for (let i = 0; i < n; i++) {
            expect(nums[i]).toBe(i + 1);
        }
    });
});
