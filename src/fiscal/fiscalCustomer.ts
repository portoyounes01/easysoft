import type { LocalCustomer } from '../types/supabase';
import { CONSUMER_FINAL_CUSTOMER_TAX_ID } from './spec';

export const CONSUMER_FINAL_CUSTOMER_NAME = 'Consumidor Final';
export const CONSUMER_FINAL_DEFAULT_ADDRESS = 'Portugal';

function normalizeTaxId(raw: string | null | undefined): string | null {
    if (raw == null || !String(raw).trim()) return null;
    return String(raw).replace(/\s/g, '');
}

export interface FiscalCustomerFields {
    transactionName: string;
    taxIdForFiscalRow: string;
    taxNumberForQr: string | null;
    receiptName: string;
    receiptTaxNumber: string;
    receiptAddress: string;
    country: string;
}

/** Customer fields for fiscal checkout, receipt, and SAFT (FT always; consumer-final defaults). */
export function buildFiscalCustomerFields(customer: LocalCustomer | null | undefined): FiscalCustomerFields {
    const nifRaw = normalizeTaxId(customer?.tax_number);
    const taxIdForFiscalRow = nifRaw ?? CONSUMER_FINAL_CUSTOMER_TAX_ID;
    const taxNumberForQr = taxIdForFiscalRow === CONSUMER_FINAL_CUSTOMER_TAX_ID ? null : nifRaw;

    const name = customer?.name?.trim() || CONSUMER_FINAL_CUSTOMER_NAME;

    const moradaParts = [
        customer?.address?.trim(),
        [customer?.postal_code?.trim(), customer?.city?.trim()].filter(Boolean).join(' '),
    ].filter(Boolean);
    const receiptAddress =
        moradaParts.length > 0 ? moradaParts.join(', ') : CONSUMER_FINAL_DEFAULT_ADDRESS;

    const country = (customer?.country || 'PT').trim().slice(0, 2).toUpperCase() || 'PT';

    return {
        transactionName: name,
        taxIdForFiscalRow,
        taxNumberForQr,
        receiptName: name,
        receiptTaxNumber: taxIdForFiscalRow,
        receiptAddress,
        country,
    };
}

export interface ReceiptCustomerProps {
    name: string;
    taxNumber: string;
    address: string;
}

/** Receipt / segunda via customer block (always populated for FT). */
export function buildReceiptCustomerProps(
    customer: LocalCustomer | null | undefined,
    transactionCustomerName?: string | null,
    fiscalCustomerTaxId?: string | null
): ReceiptCustomerProps {
    const base = buildFiscalCustomerFields(customer);
    const taxId = normalizeTaxId(fiscalCustomerTaxId) ?? base.taxIdForFiscalRow;
    const name = transactionCustomerName?.trim() || base.receiptName;
    return {
        name,
        taxNumber: taxId,
        address: base.receiptAddress,
    };
}
