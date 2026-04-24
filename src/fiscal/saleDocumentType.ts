import type { LocalCustomer } from '../types/supabase';

/**
 * Full identification for issuing FT (fatura) instead of FS: name, NIF, and full address
 * (street, postal code, city) as required for invoicing a identified customer.
 */
export function hasCompleteFaturaCustomerData(
    customer: LocalCustomer | null | undefined
): boolean {
    if (!customer) return false;
    const name = String(customer.name || '').trim();
    const nif = String(customer.tax_number || '').trim();
    const address = String(customer.address || '').trim();
    const postal = String(customer.postal_code || '').trim();
    const city = String(customer.city || '').trim();
    return Boolean(name && nif && address && postal && city);
}

/**
 * When the customer is fully identified, always issue FT; otherwise use the default in settings.
 */
export function resolveDefaultDocumentTypeForSale(
    settingsDefault: 'FATURA' | 'FATURA_SIMPLIFICADA',
    customer: LocalCustomer | null | undefined
): 'FATURA' | 'FATURA_SIMPLIFICADA' {
    if (hasCompleteFaturaCustomerData(customer)) {
        return 'FATURA';
    }
    return settingsDefault;
}

export function saftTypeToReceiptDocumentType(
    t: string
): 'FATURA' | 'FATURA_SIMPLIFICADA' | 'NOTA_CREDITO' {
    if (t === 'NC') return 'NOTA_CREDITO';
    if (t === 'FT') return 'FATURA';
    return 'FATURA_SIMPLIFICADA';
}
