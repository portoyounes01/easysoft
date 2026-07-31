// Shared fixtures for the D-SAFT1 header-immutability tests.
//
// The golden XML committed next to these tests is generated from THIS builder, so
// the "byte-identical to before" assertion compares like with like. Changing a
// value here invalidates the golden — and the golden must be regenerated from the
// PRE-FIX exporter, never hand-edited, or it stops being evidence of anything:
//
//   git show c671fb9:src/fiscal/saft/exportSaft.ts
//
// then apply the loadCustomer injection to that copy (drop the `customerLocalService`
// import, take the loader as a param) so it runs under the node test environment,
// build the GOLDEN_SPECS period through it, and write maskDateCreated(xml).

import type { SystemSettings } from '../../src/contexts/SettingsContext';
import { defaultSeriesProfiles } from '../../src/fiscal/receiptSeriesProfile';
import type { FiscalIssuerSnapshot } from '../../src/fiscal/types';
import type { LocalFiscalDocument, LocalTransaction, LocalTransactionItem } from '../../src/types/supabase';

export const headerSettings = {
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
        name: 'Test Lda',
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
        defaultDocumentType: 'FATURA_SIMPLIFICADA' as const,
        counterLabel: 'B1',
        receiptLanguage: 'pt' as const,
        seriesProfiles: (() => {
            const p = defaultSeriesProfiles();
            const slice = {
                series: 'A',
                numericWidth: 4,
                resetPolicy: 'yearly' as const,
                lastSeriesKey: '',
                currentNumber: 1,
                atValidationCode: 'ATCODE1',
                seriesDiscontinued: false,
            };
            p.FS = { ...p.FS, ...slice };
            p.FT = { ...p.FT, ...slice };
            p.NC = { ...p.NC, ...slice };
            return p;
        })(),
    },
    fiscal: { hashControlVersion: '1', trainingMode: false },
} as unknown as SystemSettings;

export const PERIOD_START = '2026-04-01';
export const PERIOD_END = '2026-04-30';

export interface DocSpec {
    id: string;
    invoiceNo: string;
    sequentialNumber: number;
    invoiceDate: string;
    systemEntryDate: string;
    invoiceType?: 'FS' | 'NC';
    /** null (the default) writes `'{}'`, i.e. a pre-D-IM1 document. */
    issuer?: FiscalIssuerSnapshot | null;
    /** Overrides the whole column, for the malformed-JSON cases. */
    rawMetadata?: string | null;
    /** A fiscal row whose sale cannot be loaded: in range, but never in the file. */
    missingTransaction?: boolean;
}

export function issuerSnapshot(over: Partial<FiscalIssuerSnapshot> = {}): FiscalIssuerSnapshot {
    return {
        v: 1,
        name: 'Test Lda',
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
        counterLabel: 'B1',
        receiptLanguage: 'pt',
        logo: null,
        ...over,
    };
}

export function makeDocs(specs: DocSpec[]): {
    fiscalDocuments: LocalFiscalDocument[];
    loadTransaction: (id: string) => Promise<(LocalTransaction & { items: LocalTransactionItem[] }) | undefined>;
} {
    const byTxId = new Map<string, LocalTransaction & { items: LocalTransactionItem[] }>();
    const fiscalDocuments: LocalFiscalDocument[] = [];

    for (const spec of specs) {
        const txId = `tx-${spec.id}`;
        const type = spec.invoiceType ?? 'FS';
        // Registered in `fiscalDocuments` but never in `byTxId`, so every loader in
        // the pipeline reports it as unloadable exactly as a real orphan row would.
        if (spec.missingTransaction) {
            fiscalDocuments.push({
                id: spec.id,
                transaction_id: txId,
                invoice_no: spec.invoiceNo,
                invoice_type: type,
                sequential_number: spec.sequentialNumber,
                invoice_date: spec.invoiceDate,
                system_entry_date: spec.systemEntryDate,
            } as unknown as LocalFiscalDocument);
            continue;
        }

        fiscalDocuments.push({
            id: spec.id,
            transaction_id: txId,
            chain_scope: 'ATCODE1::k',
            series_key: 'k',
            at_validation_code: 'ATCODE1',
            sequential_number: spec.sequentialNumber,
            invoice_no: spec.invoiceNo,
            invoice_type: type,
            invoice_date: spec.invoiceDate,
            system_entry_date: spec.systemEntryDate,
            gross_total: 12.3,
            net_total: 10,
            tax_total: 2.3,
            hash_base64: 'QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQQ==',
            hash_control: '1',
            hash_plaintext: 'x',
            previous_hash_base64: '',
            qr_payload: 'Q',
            source_id: 'u1',
            certification_mode: 'production',
            customer_tax_id: '999999990',
            payment_method: 'cash',
            created_at: `${spec.invoiceDate}T12:00:00.000Z`,
            atcud_body: `ATCODE1-${String(spec.sequentialNumber).padStart(4, '0')}`,
            hash_four_chars: 'abcd',
            needs_push: false,
        } as unknown as LocalFiscalDocument);

        const item: LocalTransactionItem = {
            id: `item-${spec.id}`,
            transaction_id: txId,
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
            created_at: new Date(0),
            updated_at: new Date(0),
            needs_push: false,
            is_conflicted: false,
            last_synced_at: null,
            deleted_at: null,
        } as unknown as LocalTransactionItem;

        const metadata =
            spec.rawMetadata !== undefined
                ? spec.rawMetadata
                : spec.issuer
                  ? JSON.stringify({ issuer: spec.issuer })
                  : '{}';

        byTxId.set(txId, {
            id: txId,
            transaction_number: spec.invoiceNo,
            employee_id: 'e1',
            employee_name: 'Emp',
            customer_id: null,
            customer_name: null,
            transaction_date: spec.invoiceDate,
            transaction_time: '12:00:00',
            subtotal: 12.3,
            discount: 0,
            tax: 2.3,
            total: 12.3,
            payment_method: 'cash',
            amount_paid: 20,
            change_given: 7.7,
            status: 'completed',
            notes: null,
            receipt_number: spec.invoiceNo,
            fiscal_document_id: spec.id,
            fiscal_metadata_json: metadata,
            created_at: new Date(0),
            updated_at: new Date(0),
            needs_push: false,
            is_conflicted: false,
            last_synced_at: null,
            deleted_at: null,
            items: [item],
        } as unknown as LocalTransaction & { items: LocalTransactionItem[] });
    }

    return { fiscalDocuments, loadTransaction: async id => byTxId.get(id) };
}

/** One legacy FS: the period the golden was captured from. */
export const GOLDEN_SPECS: DocSpec[] = [
    {
        id: 'fid-g1',
        invoiceNo: 'FS A/0001',
        sequentialNumber: 1,
        invoiceDate: '2026-04-10',
        systemEntryDate: '2026-04-10T12:00:00',
    },
];

/**
 * `<DateCreated>` is the date the FILE was made (Portaria 302/2016 field 1.12), so
 * it legitimately differs between two exports of one period. Blank it before any
 * comparison against a committed golden, or the test starts failing at midnight.
 */
export function maskDateCreated(xml: string): string {
    return xml.replace(/<DateCreated>[^<]*<\/DateCreated>/, '<DateCreated>MASKED</DateCreated>');
}
