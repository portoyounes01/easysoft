/**
 * Portugal AT fiscal constants — normative mapping for certification (Portaria 321-A/2007 SAFT-PT 1.04_01,
 * Despacho 8632/2014, hash chain per AT technical notes). Aligns with certification requirements PDF and hash-teste-node.js.
 *
 * **Field freeze (hash plaintext):** `invoiceDate;systemEntryDate;invoiceNo;grossTotal;prevHash`
 * — `grossTotal` is `Number(x).toFixed(2)` (SAFT `DocumentTotals.GrossTotal`). `prevHash` is empty string
 * for the first document in a **chain scope** `${atValidationCode}::${seriesKey}` (see `seriesUtils`).
 *
 * **QR:** builder in `qrPayload.ts` (`A:`…`R:`) matches AT QR technical note layout used with Portaria 195/2020.
 */

/** SAFT-PT invoice / document type codes (subset used by this POS). */
export const SaftInvoiceTypes = ['FT', 'FS', 'FR', 'NC', 'ND'] as const;
export type SaftInvoiceType = (typeof SaftInvoiceTypes)[number];

/**
 * SAFT-PT table 4.4 Payments — `PaymentType` (not the same as SalesInvoices `InvoiceType`).
 * RG = outros recibos; RC = regime de IVA de caixa.
 */
export const SaftPaymentReceiptTypes = ['RE', 'RC'] as const;
export type SaftPaymentReceiptType = (typeof SaftPaymentReceiptTypes)[number];

export type SaftFiscalDocumentType = SaftInvoiceType | SaftPaymentReceiptType;

export function isSaftPaymentReceiptType(t: string): t is SaftPaymentReceiptType {
    return t === 'RE' || t === 'RC';
}

/** Maps POS UI document default to SAFT invoice type. */
export function mapDefaultDocumentTypeToSaft(
    defaultType: 'FATURA' | 'FATURA_SIMPLIFICADA'
): SaftInvoiceType {
    return defaultType === 'FATURA' ? 'FT' : 'FS';
}

/**
 * Gross total for AT document hash (semicolon-separated payload) must match the fiscal document
 * total with VAT (SAFT DocumentTotals.GrossTotal). Use same rounding as SAFT export (2 decimals).
 */
export function formatGrossTotalForHash(grossTotal: number): string {
    return Number(grossTotal).toFixed(2);
}

/**
 * Hash plaintext: invoiceDate;systemEntryDate;invoiceNo;grossTotal;prevHash
 * — prevHash empty string for first document in series (same series scope as chain).
 */
export const HASH_FIELD_SEPARATOR = ';';

/** Document status in SAFT / QR (normal = N). */
export const DEFAULT_INVOICE_STATUS = 'N';

/** Consumer final NIF placeholder used in SAFT for unidentified B2C. */
export const CONSUMER_FINAL_CUSTOMER_TAX_ID = '999999990';

/** SAFT sales type for POS checkout (fatura completa only; FS deprecated for new sales). */
export const SALE_INVOICE_TYPE_SAFT = 'FT' as const;
