import type { SystemSettings } from '../contexts/SettingsContext';
import type { LocalTransaction, LocalTransactionItem } from '../types/supabase';
import type { SaftFiscalDocumentType } from './spec';
import type { FiscalSigner } from './signing';

export type CertificationMode = 'production' | 'training';
/** 'sign_es' = Spain / fiskaly SIGN ES (Veri*factu) issued via the pos-checkout-es edge fn (ES-3). */
export type FiscalProvider = 'local_at' | 'vendus' | 'invoicexpress' | 'fiskaly' | 'sign_es';
/** Cloud issuers that own numbering / ATCUD / hash / QR (everything except the local AT chain). */
export type ExternalFiscalProvider = Exclude<FiscalProvider, 'local_at'>;

export interface FiscalOfficialOutput {
    provider: FiscalProvider;
    format: string;
    data?: string;
    url?: string;
    rawData?: unknown;
}

export interface VendusIssuedItemReference {
    localProductId: string | null;
    localSku: string | null;
    vendusItemId: string | null;
    referenceId: string | null;
    documentRow: number;
}

export interface VendusFiscalSnapshot {
    documentId: string;
    number: string;
    type: SaftFiscalDocumentType;
    date: string;
    systemTime: string;
    localTime: string;
    amountGross: number;
    amountNet: number;
    hash: string;
    atcud: string;
    qrcodeSvg?: string;
    qrcodeData?: string;
    outputFormat: string;
    output?: string;
    outputData?: unknown;
    txId: string;
    externalReference: string;
    registerId: string;
    storeId?: string;
    mode: 'normal' | 'tests';
    items: VendusIssuedItemReference[];
    raw: unknown;
}

/** Per-line link back to the external issuer's document rows (for credit notes / reconciliation). */
export interface ExternalIssuedItemReference {
    localProductId: string | null;
    localSku: string | null;
    externalItemId: string | null;
    referenceId: string | null;
    documentRow: number;
}

/**
 * Provider-agnostic snapshot of a document issued by a cloud fiscal backend
 * (InvoiceXpress, Fiskaly, …). The issuer owns numbering, ATCUD, hash and QR;
 * the app only persists this snapshot. Modelled on {@link VendusFiscalSnapshot}.
 */
export interface ExternalFiscalSnapshot {
    provider: ExternalFiscalProvider;
    documentId: string;
    number: string;
    type: SaftFiscalDocumentType;
    date: string;
    systemTime: string;
    localTime: string;
    amountGross: number;
    amountNet: number;
    hash: string;
    atcud: string;
    qrcodeSvg?: string;
    qrcodeData?: string;
    outputFormat: string;
    output?: string;
    outputData?: unknown;
    txId: string;
    externalReference: string;
    /** Hash-chain scope label, provider-specific (e.g. `invoicexpress::<account>::FT`). */
    chainScope: string;
    /** AT validation code prefix when the provider exposes it (else derived from ATCUD/provider). */
    atValidationCode?: string;
    items: ExternalIssuedItemReference[];
    /** Provider-specific metadata persisted into `fiscal_metadata_json.external.meta`. */
    providerMeta?: Record<string, unknown>;
    raw: unknown;
}

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
    /** Fiscal issuer that owns numbering/signing. Defaults to local_at for legacy rows. */
    fiscal_provider?: FiscalProvider;
    external_document_id?: string | null;
    external_reference?: string | null;
    external_tx_id?: string | null;
    external_output_format?: string | null;
    external_payload_json?: string | null;
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
    fiscalProvider?: FiscalProvider;
    externalDocumentId?: string;
    externalReference?: string;
    officialOutput?: FiscalOfficialOutput;
    /** Spain / Veri*factu compliance legend for the receipt (e.g. "VERI*FACTU"); undefined for PT. */
    verifactuLegend?: string;
    /**
     * Set ONLY by the non-fiscal fallback (src/fiscal/nonFiscalFallback.ts).
     *
     * The sale completed, but no fiscal document was issued and none exists:
     * there is no fiscal row, `fiscalId` is empty, and `invoiceNo` holds the
     * internal slip reference rather than a document number. `atcudBody`,
     * `qrPayload`, `hashBase64` and `hashFourChars` are empty by construction.
     *
     * Every consumer that treats this result as proof of a fiscal document —
     * printing it as a fatura, advancing the série counter, exporting it to
     * SAF-T — MUST check this flag first.
     */
    nonFiscal?: true;
    /** The slip reference, when `nonFiscal`. Never a document number. */
    slipReference?: string;
}

/**
 * Input to atomic persistence of a non-fiscal fallback sale.
 *
 * Deliberately has no série, no AT validation code and no signer: nothing here
 * feeds a fiscal numbering sequence. The slip number comes from its own counter
 * (see `slipPrefix`), which exists only so two slips from the same till can be
 * told apart when the paper invoices are reconciled.
 */
export interface NonFiscalFallbackPersistencePayload {
    /** Per-till slip prefix, e.g. `TNF-3F9A21-`. Must not resemble a série. */
    slipPrefix: string;
    slipNumericWidth: number;
    certificationMode: CertificationMode;
    transactionDate: string;
    transactionTime: string;
    systemEntryDate: string;
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
    payment: {
        paymentMethod: 'cash' | 'card' | 'mixed';
        amountPaid?: number;
        employeeId: string;
        employeeName: string;
        employeeNumber?: string;
    };
    /** Why no fiscal document exists — recorded verbatim in the audit log. */
    failure: {
        provider: ExternalFiscalProvider;
        dispatch: string;
        reason: string;
        externalReference?: string;
        attemptId?: string;
        /** Upstream HTTP status, when the provider's own refusal was the proof. */
        providerStatus?: number;
        /** Operator attested at the backoffice that no document exists there. */
        operatorAttested?: boolean;
    };
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

export interface VendusFiscalCheckoutPersistencePayload {
    certificationMode: CertificationMode;
    transactionDate: string;
    transactionTime: string;
    systemEntryDate: string;
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
    payment: FiscalCheckoutAtomicPayload['payment'];
    vendus: VendusFiscalSnapshot;
    settledInvoiceNo?: string;
    settledInvoiceDateYmd?: string;
}

/** Input to atomic persistence of a document issued by any cloud fiscal backend. */
export interface ExternalFiscalCheckoutPersistencePayload {
    certificationMode: CertificationMode;
    transactionDate: string;
    transactionTime: string;
    systemEntryDate: string;
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
    payment: FiscalCheckoutAtomicPayload['payment'];
    external: ExternalFiscalSnapshot;
    settledInvoiceNo?: string;
    settledInvoiceDateYmd?: string;
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
    fiscalProvider?: FiscalProvider;
    externalDocumentId?: string;
    externalReference?: string;
    externalTxId?: string;
    officialOutput?: FiscalOfficialOutput;
    vendus?: {
        registerId: string;
        storeId?: string;
        mode: 'normal' | 'tests';
        outputFormat: string;
        items: VendusIssuedItemReference[];
    };
    /** Generic cloud-issuer block (InvoiceXpress, Fiskaly, …). */
    external?: {
        provider: ExternalFiscalProvider;
        outputFormat: string;
        items: ExternalIssuedItemReference[];
        meta?: Record<string, unknown>;
    };
    /**
     * Non-fiscal fallback marker, mirrored onto the transaction row so a
     * reprint months later still knows this was a slip and not a fatura —
     * the transaction has no fiscal document to infer it from.
     */
    nonFiscal?: true;
    nonFiscalFallback?: {
        slipReference: string;
        /** Backend that could not issue, so the reprint can explain which one. */
        provider: ExternalFiscalProvider;
        /** 'not-dispatched' | 'unresolved' — see fiscalFailure.ts. */
        dispatch: string;
        reason: string;
    };
}

export type FiscalAuditEventType =
    | 'FISCAL_DOCUMENT_CREATED'
    | 'VOID_REQUESTED'
    | 'FISCAL_DOCUMENT_CANCELLED'
    | 'REPRINT_REQUESTED'
    | 'POST_SALE_RECEIPT_PRINTED'
    | 'POST_SALE_RECEIPT_NOT_PRINTED'
    /** Fiscal issuance was impossible, so a NON-FISCAL sale slip was printed
     *  instead and the operator must write the invoice in the AT-authorised
     *  paper book. See docs/fiscal-fallback-legal-brief.md. */
    | 'NON_FISCAL_FALLBACK_ISSUED'
    /** The operator recorded which paper-book document covered a fallback sale
     *  (series / number / ATCUD), i.e. the "recovery into the certified
     *  program" that Ofício-Circulado 30213 requires. */
    | 'MANUAL_DOCUMENT_RECORDED'
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
