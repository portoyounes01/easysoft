import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import { initializeLocalDatabase, localDb, transactionLocalService } from '../../src/lib/localDatabase';
import type { FiscalCheckoutAtomicPayload } from '../../src/fiscal/types';
import { WebCryptoRsaSha1Signer } from '../../src/fiscal/signing';
import type { SystemSettings } from '../../src/contexts/SettingsContext';
import { runFiscalCreditNoteForTransaction } from '../../src/fiscal/creditNoteCheckout';

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
            name: 'NC Test Lda',
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
            atValidationCode: 'ATNC01',
            seriesDiscontinued: false,
        },
        fiscal: { hashControlVersion: '1', trainingMode: true, privateKeyPem },
    } as unknown as SystemSettings;
}

function buildSalePayload(settings: SystemSettings, signer: WebCryptoRsaSha1Signer): FiscalCheckoutAtomicPayload {
    const d = '2026-06-20';
    return {
        settings,
        certificationMode: 'training',
        transactionDate: d,
        transactionTime: '12:00:00',
        systemEntryDate: `${d}T12:00:00`,
        seriesKey: 'A-2026',
        chainScope: 'ATNC01::A-2026',
        atCode: 'ATNC01',
        invoiceTypeSaft: 'FS',
        grossTotal: 12.3,
        netRounded: 10,
        taxTotal: 2.3,
        totalDiscountAmount: 0,
        originalSubtotal: 12.3,
        total: 12.3,
        changeGiven: 7.7,
        transactionBase: {
            employee_id: 'e1',
            employee_name: 'Emp',
            customer_id: null,
            customer_name: null,
            transaction_date: d,
            transaction_time: '12:00:00',
            subtotal: 12.3,
            discount: 0,
            discount_type: 'none',
            discount_percentage: 0,
            tax: 2.3,
            total: 12.3,
            payment_method: 'cash',
            amount_paid: 20,
            change_given: 7.7,
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
                unit_price: 12.3,
                unit_cost: 5,
                iva_rate: 0.23,
                line_total: 12.3,
                tax_amount: 2.3,
                profit_amount: 0,
                discount_amount: 0,
                discount_percentage: 0,
                deleted_at: null,
            },
        ],
        customerTaxId: '999999990',
        customerTaxNumberForQr: null,
        customerCountryForQr: 'PT',
        payment: { paymentMethod: 'cash', amountPaid: 20, employeeId: 'e1', employeeName: 'Emp' },
        signer,
    };
}

describe('runFiscalCreditNoteForTransaction', () => {
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

    it('creates NC with negative totals and continues the hash chain', async () => {
        const sale = await transactionLocalService.createFiscalCheckoutAtomic(buildSalePayload(settings, signer));
        expect(sale.invoiceTypeSaft).toBe('FS');
        expect(sale.grossTotal).toBe(12.3);

        const nc = await runFiscalCreditNoteForTransaction({
            settings,
            originalTransactionId: sale.transactionId,
            payment: { paymentMethod: 'cash', employeeId: 'e2', employeeName: 'Other' },
            signer,
        });

        expect(nc.invoiceTypeSaft).toBe('NC');
        expect(nc.grossTotal).toBe(-12.3);
        expect(nc.sequentialNumber).toBe(sale.sequentialNumber + 1);

        const ncFiscal = await transactionLocalService.getFiscalDocumentById(nc.fiscalId);
        expect(ncFiscal?.invoice_type).toBe('NC');
        expect(ncFiscal?.gross_total).toBe(-12.3);
        expect(ncFiscal?.chain_scope).toBe('ATNC01::A-2026');
        const saleFiscal = await transactionLocalService.getFiscalDocumentById(sale.fiscalId);
        expect(ncFiscal?.settled_invoice_no).toBe(saleFiscal?.invoice_no);
        expect(ncFiscal?.settled_invoice_date).toBe(saleFiscal?.invoice_date);

        const audits = await localDb.fiscalAuditEvents.toArray();
        expect(audits.some(a => a.event_type === 'CREDIT_NOTE_ISSUED')).toBe(true);
    });

    it('persists credit reason in notes and audit when provided', async () => {
        const sale = await transactionLocalService.createFiscalCheckoutAtomic(buildSalePayload(settings, signer));
        const reason = 'Devolução de artigo com defeito';
        const nc = await runFiscalCreditNoteForTransaction({
            settings,
            originalTransactionId: sale.transactionId,
            creditReason: reason,
            payment: { paymentMethod: 'cash', employeeId: 'e2', employeeName: 'Other' },
            signer,
        });
        const ncTx = await transactionLocalService.getTransactionById(nc.transactionId);
        const saleFiscal = await transactionLocalService.getFiscalDocumentById(sale.fiscalId);
        expect(ncTx?.notes).toBe(`NC referente ${saleFiscal?.invoice_no}. ${reason}`);
        const audits = await localDb.fiscalAuditEvents.toArray();
        const ev = audits.find(a => a.event_type === 'CREDIT_NOTE_ISSUED');
        expect(ev).toBeDefined();
        const p = ev ? (JSON.parse(ev.payload_json) as { creditReason?: string }) : {};
        expect(p.creditReason).toBe(reason);
    });
});
