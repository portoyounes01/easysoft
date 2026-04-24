import { CONSUMER_FINAL_CUSTOMER_TAX_ID, DEFAULT_INVOICE_STATUS, formatGrossTotalForHash } from './spec';
import type { SaftFiscalDocumentType } from './spec';

export interface AtQrPayloadInput {
    emitterTaxNumber: string;
    customerTaxNumber: string | null;
    customerCountry: string;
    invoiceType: SaftFiscalDocumentType;
    invoiceDateYmd: string;
    invoiceNo: string;
    /** e.g. CSDF7T5H-00035 (validation + hyphen + padded sequential) */
    atcudBody: string;
    netTotal: number;
    taxTotal: number;
    hashFourChars: string;
    softwareCertificateNumber: string;
}

/**
 * AT QR payload (Portaria 195/2020 / AT technical spec — field keys A,B,C,…).
 * Segments joined with `*`; each segment is `Key:value`.
 */
export function buildAtQrPayloadString(input: AtQrPayloadInput): string {
    const clientNif = input.customerTaxNumber?.trim() || CONSUMER_FINAL_CUSTOMER_TAX_ID;
    const net = formatGrossTotalForHash(input.netTotal);
    const tax = formatGrossTotalForHash(input.taxTotal);
    const dateCompact = input.invoiceDateYmd.replace(/-/g, '');
    const segments = [
        `A:${input.emitterTaxNumber}`,
        `B:${clientNif}`,
        `C:${input.customerCountry}`,
        `D:${input.invoiceType}`,
        `E:${DEFAULT_INVOICE_STATUS}`,
        `F:${dateCompact}`,
        `G:${input.invoiceNo}`,
        `H:ATCUD:${input.atcudBody}`,
        `I1:PT`,
        `N:${tax}`,
        `O:${net}`,
        `Q:${input.hashFourChars}`,
        `R:${input.softwareCertificateNumber}`,
    ];
    return segments.join('*');
}
