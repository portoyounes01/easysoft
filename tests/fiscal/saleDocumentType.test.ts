import { describe, it, expect } from 'vitest';
import {
    hasCompleteFaturaCustomerData,
    resolveDefaultDocumentTypeForSale,
    saftTypeToReceiptDocumentType,
} from '../../src/fiscal/saleDocumentType';
import type { LocalCustomer } from '../../src/types/supabase';

const base = (over: Partial<LocalCustomer> = {}): LocalCustomer =>
    ({
        id: 'c1',
        name: 'Cliente',
        tax_number: '123456789',
        country: 'PT',
        email: null,
        phone: null,
        address: 'Rua A',
        city: 'Lisboa',
        postal_code: '1000-001',
        total_spent: 0,
        transaction_count: 0,
        loyalty_points: 0,
        is_active: true,
        preferred_payment_method: null,
        created_at: new Date(),
        updated_at: new Date(),
        last_synced_at: null,
        deleted_at: null,
        needs_push: false,
        is_conflicted: false,
        ...over,
    }) as LocalCustomer;

describe('saleDocumentType', () => {
    it('hasCompleteFaturaCustomerData is true when name, NIF, address, postal, city are set', () => {
        expect(hasCompleteFaturaCustomerData(base())).toBe(true);
    });

    it('hasCompleteFaturaCustomerData is false if any field missing', () => {
        expect(hasCompleteFaturaCustomerData(base({ address: null }))).toBe(false);
        expect(hasCompleteFaturaCustomerData(base({ postal_code: '  ' }))).toBe(false);
        expect(hasCompleteFaturaCustomerData(null)).toBe(false);
    });

    it('resolveDefaultDocumentTypeForSale issues FATURA when complete customer', () => {
        expect(resolveDefaultDocumentTypeForSale('FATURA_SIMPLIFICADA', base())).toBe('FATURA');
    });

    it('resolveDefaultDocumentTypeForSale uses settings when customer incomplete', () => {
        expect(
            resolveDefaultDocumentTypeForSale('FATURA_SIMPLIFICADA', base({ address: null }))
        ).toBe('FATURA_SIMPLIFICADA');
    });

    it('saftTypeToReceiptDocumentType maps FT/FS/NC', () => {
        expect(saftTypeToReceiptDocumentType('FT')).toBe('FATURA');
        expect(saftTypeToReceiptDocumentType('FS')).toBe('FATURA_SIMPLIFICADA');
        expect(saftTypeToReceiptDocumentType('NC')).toBe('NOTA_CREDITO');
    });
});
