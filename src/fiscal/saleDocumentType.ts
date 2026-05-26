import type { LocalCustomer } from '../types/supabase';

/**
 * @deprecated FS removed for new sales; kept for tests referencing legacy identification rules.
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

/** All new POS sales issue FT (fatura). Consumer-final defaults apply when customer is incomplete. */
export function resolveDefaultDocumentTypeForSale(
    _settingsDefault?: 'FATURA' | 'FATURA_SIMPLIFICADA',
    _customer?: LocalCustomer | null | undefined
): 'FATURA' {
    return 'FATURA';
}

export function saftTypeToReceiptDocumentType(
    t: string
): 'FATURA' | 'FATURA_SIMPLIFICADA' | 'NOTA_CREDITO' {
    if (t === 'NC') return 'NOTA_CREDITO';
    if (t === 'FS') return 'FATURA';
    return 'FATURA';
}
