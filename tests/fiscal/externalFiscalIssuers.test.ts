import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeLocalDatabase, localDb } from '../../src/lib/localDatabase';
import { issueInvoiceXpressSale } from '../../src/fiscal/invoicexpressFiscalIssuer';
import { issueFiskalySale } from '../../src/fiscal/fiskalyFiscalIssuer';
import { defaultSeriesProfiles } from '../../src/fiscal/receiptSeriesProfile';
import type { SystemSettings } from '../../src/contexts/SettingsContext';
import type { LocalProduct } from '../../src/types/supabase';

const invokeMock = vi.fn();
let connectionState = { isOnline: true, isSupabaseOnline: true };

vi.mock('../../src/lib/supabase', () => ({
    supabase: {
        functions: {
            invoke: (...args: unknown[]) => invokeMock(...args),
        },
    },
    connectionStatus: {
        getStatus: () => connectionState,
    },
}));

function baseSettings(): SystemSettings {
    return {
        autoLogout: { enabled: false, timeoutMinutes: 15, warningSeconds: 30, protectWhenCartHasItems: false },
        pos: {
            currencySymbol: '€',
            taxRate: 0.23,
            trackInventory: true,
            allowNegativeStock: false,
            autoClearCart: { enabled: false, timeoutMinutes: 0 },
        },
        display: { itemsPerPage: 20, showEmployeePhotos: true, compactMode: false },
        company: {
            name: 'Test Lda',
            address: 'Rua 1',
            postalCode: '1000-001',
            city: 'Lisboa',
            taxNumber: '509999999',
        },
        receipt: {
            defaultDocumentType: 'FATURA',
            counterLabel: 'B1',
            seriesProfiles: defaultSeriesProfiles(),
            printDuplicateOnIssue: false,
            receiptLanguage: 'pt',
        },
        fiscal: {
            issuer: 'local_at',
            hashControlVersion: '1',
            trainingMode: false,
            vendus: {
                enabled: false,
                mode: 'tests',
                registerId: '',
                storeId: '',
                documentType: 'FT',
                output: 'html',
                paymentMethodIds: { cash: '', card: '', mixed: '' },
                exemptTax: { code: 'M99', law: '' },
            },
            invoicexpress: {
                enabled: false,
                accountName: 'minha-empresa',
                documentType: 'invoice_receipt',
                finalizeOnIssue: true,
                sequenceId: '',
                exemptTax: { code: 'M99', law: '' },
            },
            fiskaly: {
                enabled: false,
                environment: 'test',
                taxpayerId: 'tax-1',
                locationId: 'loc-1',
                systemId: 'sys-1',
                seriesId: '',
                documentType: 'FT',
                exemptTax: { code: 'M99', law: '' },
            },
        },
    };
}

function invoiceXpressSettings(): SystemSettings {
    const s = baseSettings();
    s.fiscal.issuer = 'invoicexpress';
    s.fiscal.invoicexpress.enabled = true;
    return s;
}

function fiskalySettings(): SystemSettings {
    const s = baseSettings();
    s.fiscal.issuer = 'fiskaly';
    s.fiscal.fiskaly.enabled = true;
    return s;
}

function product(): LocalProduct {
    return {
        id: 'p1',
        name: 'Café',
        description: null,
        sku: 'CAF1',
        barcode: null,
        category_id: 'c1',
        category_name: 'Bar',
        price: 12.3,
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
        created_at: new Date(),
        updated_at: new Date(),
        last_synced_at: null,
        deleted_at: null,
        needs_push: false,
        is_conflicted: false,
    };
}

const cart = () => [{ product: product(), quantity: 1, discount: 0 }];
const payment = { paymentMethod: 'cash' as const, amountPaid: 20, employeeId: 'e1', employeeName: 'Emp' };

describe('External fiscal issuers', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        connectionState = { isOnline: true, isSupabaseOnline: true };
        await initializeLocalDatabase();
        await localDb.fiscalDocuments.clear();
        await localDb.transactions.clear();
        await localDb.transactionItems.clear();
        await localDb.fiscalAuditEvents.clear();
        await localDb.transactionSyncQueue.clear();
        await localDb.vendusIssueAttempts.clear();
    });

    it('issues an InvoiceXpress sale through the Edge Function and persists the provider', async () => {
        invokeMock.mockResolvedValueOnce({
            data: {
                document: {
                    id: 2137287,
                    sequence_number: '6/G',
                    atcud: 'ABCD1234-28',
                    saft_hash: 'HASH1234',
                    permalink: 'https://www.app.invoicexpress.com/documents/xyz',
                    status: 'finalized',
                    date: '11/06/2026',
                    qr_code: 'A:509999999*B:999999990',
                    items: [{ id: 555 }],
                },
            },
            error: null,
        });

        const result = await issueInvoiceXpressSale({
            settings: invoiceXpressSettings(),
            cart: cart(),
            selectedCustomer: null,
            payment,
        });

        expect(result.fiscalProvider).toBe('invoicexpress');
        expect(result.invoiceNo).toBe('6/G');
        expect(result.officialOutput?.provider).toBe('invoicexpress');

        const call = invokeMock.mock.calls[0];
        expect(call[0]).toBe('invoicexpress-fiscal');
        const body = call[1] as { body: { action: string; accountName: string; document: Record<string, unknown> } };
        expect(body.body.action).toBe('issue_document');
        expect(body.body.accountName).toBe('minha-empresa');

        const fiscal = await localDb.fiscalDocuments.get(result.fiscalId);
        expect(fiscal?.fiscal_provider).toBe('invoicexpress');
        expect(fiscal?.external_document_id).toBe('2137287');
        expect(fiscal?.atcud_body).toBe('ABCD1234-28');

        const attempts = await localDb.vendusIssueAttempts.toArray();
        expect(attempts).toHaveLength(1);
        expect(attempts[0].provider).toBe('invoicexpress');
        expect(attempts[0].status).toBe('persisted');
    });

    it('issues a Fiskaly sale through the Edge Function and persists the provider', async () => {
        invokeMock.mockResolvedValueOnce({
            data: {
                document: {
                    id: 'rec-abc',
                    number: 'FT SIGN/1',
                    atcud: 'WXYZ9876-1',
                    hash: 'FHASH',
                    signature: 'sig-data',
                    qr_code: 'A:509999999*B:999999990',
                    issued_at: '2026-06-11T10:00:00',
                },
            },
            error: null,
        });

        const result = await issueFiskalySale({
            settings: fiskalySettings(),
            cart: cart(),
            selectedCustomer: null,
            payment,
        });

        expect(result.fiscalProvider).toBe('fiskaly');
        expect(result.invoiceNo).toBe('FT SIGN/1');

        const call = invokeMock.mock.calls[0];
        expect(call[0]).toBe('fiskaly-fiscal');
        const body = call[1] as { body: { action: string; systemId: string; record: Record<string, unknown> } };
        expect(body.body.action).toBe('issue_document');
        expect(body.body.systemId).toBe('sys-1');

        const fiscal = await localDb.fiscalDocuments.get(result.fiscalId);
        expect(fiscal?.fiscal_provider).toBe('fiskaly');
        expect(fiscal?.external_document_id).toBe('rec-abc');

        const attempts = await localDb.vendusIssueAttempts.toArray();
        expect(attempts[0].provider).toBe('fiskaly');
        expect(attempts[0].status).toBe('persisted');
    });

    it('blocks external issuance when Supabase/provider is offline', async () => {
        connectionState = { isOnline: false, isSupabaseOnline: false };
        await expect(
            issueInvoiceXpressSale({ settings: invoiceXpressSettings(), cart: cart(), selectedCustomer: null, payment })
        ).rejects.toThrow(/bloqueada/);
        await expect(
            issueFiskalySale({ settings: fiskalySettings(), cart: cart(), selectedCustomer: null, payment })
        ).rejects.toThrow(/bloqueada/);
        expect(invokeMock).not.toHaveBeenCalled();
    });
});
