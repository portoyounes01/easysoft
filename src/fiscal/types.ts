import type { SystemSettings } from '../contexts/SettingsContext';
import type { LocalTransaction, LocalTransactionItem } from '../types/supabase';
import type { SaftFiscalDocumentType, SaftInvoiceType } from './spec';
import type { FiscalSigner } from './signing';

export type CertificationMode = 'production' | 'training';

/** Immutable fiscal row persisted at issuance (local + server mirror). */
export interface FiscalDocumentRow {
    id: string;
    transaction_id: string | null;
    /** Scope for hash chain: `${at_validation_code}::${series_key}` */
    chain_scope: string;
    series_key: string;
    at_validation_code: string;
    sequential_number: number;
    /** SAFT InvoiceNo e.g. FS ABC/0001 — or RG/RC payment ref under table 4.4 */
    invoice_no: string;
    invoice_type: SaftFiscalDocumentType;
    /** For RG/RC: settled sales document no (e.g. FT …) */
    settled_invoice_no?: string | null;
    /** For RG/RC: invoice date of settled document (YYYY-MM-DD) */
    settled_invoice_date?: string | null;
    invoice_date: string;
    /** ISO local date-time without Z — SAFT SystemEntryDate style */
    system_entry_date: string;
    gross_total: number;
    net_total: number;
    tax_total: number;
    hash_base64: string;
    hash_control: string;
    /** Plain string that was signed (audit). */
    hash_plaintext: string;
    /** Previous document hash in chain (empty if first). */
    previous_hash_base64: string;
    qr_payload: string;
    source_id: string;
    certification_mode: CertificationMode;
    customer_tax_id: string | null;
    payment_method: 'cash' | 'card' | 'mixed';
    created_at: string;
    /** Validation code + padded sequential (e.g. CSDF7T5H-00035) without `ATCUD:` prefix */
    atcud_body: string;
    /** Four chars from Base64 hash at indices 0,10,20,30 joined by hyphen */
    hash_four_chars: string;
    /** Set when included in a SAF-T export batch (optional AT workflow). */
    saft_exported_at?: string | null;
    saft_export_batch_id?: string | null;
    /** When set, document is cancelled (anulado); row is never deleted. */
    cancelled_at?: string | null;
    cancelled_reason?: string | null;
    cancelled_by_employee_id?: string | null;
}

/** Snapshot passed to receipt / QR builder after persistence. */
export type FiscalDocumentSnapshot = FiscalDocumentRow;

/** Result of a successful fiscal checkout (immutable issuance). */
export interface FiscalCheckoutResult {
    transactionId: string;
    fiscalId: string;
    invoiceNo: string;
    atcudBody: string;
    hashBase64: string;
    hashFourChars: string;
    qrPayload: string;
    hashControl: string;
    certificationMode: CertificationMode;
    grossTotal: number;
    netTotal: number;
    taxTotal: number;
    systemEntryDate: string;
    invoiceDate: string;
    invoiceTypeSaft: SaftFiscalDocumentType;
    sourceId: string;
    sequentialNumber: number;
    seriesKey: string;
}

/** Row slice for fiscal checkout before invoice / hash exist (filled inside atomic DB txn). */
export type FiscalCheckoutTransactionBase = Omit<
    LocalTransaction,
    | 'id'
    | 'created_at'
    | 'updated_at'
    | 'needs_push'
    | 'is_conflicted'
    | 'last_synced_at'
    | 'fiscal_document_id'
    | 'transaction_number'
    | 'receipt_number'
    | 'fiscal_metadata_json'
>;

export type FiscalCheckoutItemBase = Omit<
    LocalTransactionItem,
    'id' | 'transaction_id' | 'created_at' | 'updated_at' | 'needs_push' | 'is_conflicted' | 'last_synced_at'
>;

import type { ReceiptSeriesProfile } from './receiptSeriesProfile';

/** Input to atomic fiscal persistence (sequential + hash + insert in one IndexedDB transaction). */
export interface FiscalCheckoutAtomicPayload {
    settings: SystemSettings;
    /** Série efectiva para prefixo, largura e número corrente (NC usa `seriesProfiles.NC`). */
    receiptProfile: ReceiptSeriesProfile;
    certificationMode: CertificationMode;
    transactionDate: string;
    transactionTime: string;
    systemEntryDate: string;
    seriesKey: string;
    chainScope: string;
    atCode: string;
    invoiceTypeSaft: SaftFiscalDocumentType;
    /** When issuing RG/RC — FT/FS invoice being acknowledged */
    settledInvoiceNo?: string;
    settledInvoiceDateYmd?: string;
    grossTotal: number;
    netRounded: number;
    taxTotal: number;
    totalDiscountAmount: number;
    originalSubtotal: number;
    total: number;
    changeGiven: number;
    transactionBase: FiscalCheckoutTransactionBase;
    transactionItems: FiscalCheckoutItemBase[];
    customerTaxId: string | null;
    customerTaxNumberForQr: string | null;
    /** ISO 3166-1 alpha-2 for QR segment C (default PT). */
    customerCountryForQr: string;
    payment: {
        paymentMethod: 'cash' | 'card' | 'mixed';
        amountPaid?: number;
        employeeId: string;
        employeeName: string;
        employeeNumber?: string;
    };
    signer: FiscalSigner;
}

/** Serialized into `transactions.fiscal_metadata_json` at issuance (immutable snapshot). */
export interface FiscalTransactionMetadata {
    invoiceNo: string;
    atcudBody: string;
    hashBase64: string;
    hashFourChars: string;
    hashControl: string;
    qrPayload: string;
    chainScope: string;
    sequentialNumber: number;
    certificationMode: CertificationMode;
}

export type FiscalAuditEventType =
    | 'FISCAL_DOCUMENT_CREATED'
    | 'VOID_REQUESTED'
    | 'FISCAL_DOCUMENT_CANCELLED'
    | 'REPRINT_REQUESTED'
    | 'POST_SALE_RECEIPT_PRINTED'
    | 'POST_SALE_RECEIPT_NOT_PRINTED'
    | 'CREDIT_NOTE_ISSUED'
    | 'RECIBO_ISSUED'
    | 'COMPANY_INFO_CHANGED'
    | 'SERIES_PROFILE_CHANGED'
    | 'SETTINGS_FISCAL_CHANGED'
    | 'SETTINGS_CHANGED'
    | 'SAFT_EXPORTED'
    | 'LOGIN_SUCCESS'
    | 'LOGIN_FAILURE'
    | 'KEY_ROTATED';

export interface FiscalAuditEventRow {
    id: string;
    event_type: FiscalAuditEventType;
    payload_json: string;
    employee_id: string | null;
    created_at: string;
}
