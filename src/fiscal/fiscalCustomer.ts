import type { LocalCustomer } from '../types/supabase';
import { CONSUMER_FINAL_CUSTOMER_TAX_ID } from './spec';
import { activeProfile, getCountryProfile, type OperatingCountry } from '../lib/countryProfile';

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

/**
 * Customer fields for fiscal checkout, receipt, and SAFT (FT always; consumer-final defaults).
 * Country-aware: Portugal uses the AT "consumidor final" placeholder NIF (999999990) and a
 * "Portugal" address default; Spain (Veri*factu simplified invoices) carries NO buyer tax id
 * and must not leak the PT placeholder or a "Portugal" default onto ES documents.
 */
export function buildFiscalCustomerFields(
    customer: LocalCustomer | null | undefined,
    countryOverride?: OperatingCountry,
): FiscalCustomerFields {
    const profile = countryOverride ? getCountryProfile(countryOverride) : activeProfile();
    const consumerTaxId = profile.taxId.finalConsumer ?? null; // PT '999999990'; ES null (omit)
    const consumerName = profile.code === 'ES' ? 'Consumidor final' : CONSUMER_FINAL_CUSTOMER_NAME;
    const consumerAddress = profile.code === 'ES' ? profile.name : CONSUMER_FINAL_DEFAULT_ADDRESS;

    const nifRaw = normalizeTaxId(customer?.tax_number);
    const taxIdForFiscalRow = nifRaw ?? consumerTaxId ?? '';
    const taxNumberForQr = nifRaw && nifRaw !== consumerTaxId ? nifRaw : null;

    const name = customer?.name?.trim() || consumerName;

    const moradaParts = [
        customer?.address?.trim(),
        [customer?.postal_code?.trim(), customer?.city?.trim()].filter(Boolean).join(' '),
    ].filter(Boolean);
    const receiptAddress =
        moradaParts.length > 0 ? moradaParts.join(', ') : consumerAddress;

    const country = (customer?.country || profile.code).trim().slice(0, 2).toUpperCase() || profile.code;

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
