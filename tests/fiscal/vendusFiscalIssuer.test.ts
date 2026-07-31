import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../src/i18n';
import { initializeLocalDatabase, localDb } from '../../src/lib/localDatabase';
import { issueVendusCreditNoteForTransaction, issueVendusSale } from '../../src/fiscal/vendusFiscalIssuer';
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

function makeSettings(): SystemSettings {
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
            name: 'Vendus Test Lda',
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
            issuer: 'vendus',
            hashControlVersion: '1',
            trainingMode: false,
            vendus: {
                enabled: true,
                mode: 'tests',
                registerId: '12345',
                storeId: '999',
                documentType: 'FT',
                output: 'html',
                paymentMethodIds: {
                    cash: '1',
                    card: '2',
                    mixed: '3',
                },
                exemptTax: {
                    code: 'M99',
                    law: '',
                },
            },
        },
    };
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

function vendusResponse(overrides: Record<string, unknown> = {}) {
    return {
        id: 123,
        type: 'FT',
        number: 'FT VEND/1',
        date: '2026-06-11',
        system_time: '2026-06-11 10:00:00',
        local_time: '2026-06-11 11:00:00',
        amount_gross: 12.3,
        amount_net: 10,
        hash: 'HASH1234',
        atcud: 'VENDUS-1',
        output: '<html><body>Vendus receipt</body></html>',
        output_data: { format: 'html' },
        qrcode: '<svg></svg>',
        qrcode_data: 'A:509999999*B:999999990',
        items: [{ id: 9991, document_row: 1 }],
        ...overrides,
    };
}

describe('Vendus fiscal issuer', () => {
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

    it('issues a sale through the Edge Function and persists Vendus as fiscal provider', async () => {
        invokeMock.mockResolvedValueOnce({ data: { document: vendusResponse() }, error: null });

        const result = await issueVendusSale({
            settings: makeSettings(),
            cart: [{ product: product(), quantity: 1, discount: 0 }],
            selectedCustomer: null,
            payment: { paymentMethod: 'cash', amountPaid: 20, employeeId: 'e1', employeeName: 'Emp' },
        });

        expect(result.fiscalProvider).toBe('vendus');
        expect(result.invoiceNo).toBe('FT VEND/1');
        expect(result.officialOutput?.provider).toBe('vendus');
        expect(result.officialOutput?.format).toBe('html');

        const call = invokeMock.mock.calls[0];
        expect(call[0]).toBe('vendus-fiscal');
        const body = call[1] as { body: { document: Record<string, unknown> } };
        expect(body.body.document.tx_id).toMatch(/^pos-sale-/);
        expect(body.body.document.external_reference).toMatch(/^POS-/);
        expect(body.body.document.client).toBeUndefined();

        const fiscal = await localDb.fiscalDocuments.get(result.fiscalId);
        expect(fiscal?.fiscal_provider).toBe('vendus');
        expect(fiscal?.external_document_id).toBe('123');

        const attempts = await localDb.vendusIssueAttempts.toArray();
        expect(attempts).toHaveLength(1);
        expect(attempts[0].status).toBe('persisted');
    });

    it('blocks Vendus checkout when Supabase/Vendus is offline', async () => {
        connectionState = { isOnline: false, isSupabaseOnline: false };
        await expect(
            issueVendusSale({
                settings: makeSettings(),
                cart: [{ product: product(), quantity: 1, discount: 0 }],
                selectedCustomer: null,
                payment: { paymentMethod: 'cash', amountPaid: 20, employeeId: 'e1', employeeName: 'Emp' },
            })
        ).rejects.toThrow(i18n.t('checkout.vendusOffline'));
        expect(invokeMock).not.toHaveBeenCalled();
    });

    it('issues Vendus NC with original document row references', async () => {
        invokeMock
            .mockResolvedValueOnce({ data: { document: vendusResponse() }, error: null })
            .mockResolvedValueOnce({
                data: {
                    document: vendusResponse({
                        id: 124,
                        type: 'NC',
                        number: 'NC VEND/1',
                        amount_gross: 12.3,
                        amount_net: 10,
                    }),
                },
                error: null,
            });

        const sale = await issueVendusSale({
            settings: makeSettings(),
            cart: [{ product: product(), quantity: 1, discount: 0 }],
            selectedCustomer: null,
            payment: { paymentMethod: 'cash', amountPaid: 20, employeeId: 'e1', employeeName: 'Emp' },
        });

        const nc = await issueVendusCreditNoteForTransaction({
            settings: makeSettings(),
            originalTransactionId: sale.transactionId,
            payment: { paymentMethod: 'cash', employeeId: 'e2', employeeName: 'Manager' },
            creditReason: 'Devolução',
        });

        expect(nc.invoiceTypeSaft).toBe('NC');
        const secondCall = invokeMock.mock.calls[1][1] as { body: { document: { items: Array<Record<string, unknown>>; notes?: string } } };
        expect(secondCall.body.document.notes).toBe('Devolução');
        expect(secondCall.body.document.items[0].reference_document).toEqual({
            document_number: 'FT VEND/1',
            document_row: 1,
            reference_id: '9991',
            reference_relation: 'credit_note',
        });
    });
});
