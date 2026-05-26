import { describe, it, expect } from 'vitest';
import {
    buildFiscalCustomerFields,
    buildReceiptCustomerProps,
    CONSUMER_FINAL_CUSTOMER_NAME,
    CONSUMER_FINAL_DEFAULT_ADDRESS,
} from '../../src/fiscal/fiscalCustomer';
import { CONSUMER_FINAL_CUSTOMER_TAX_ID } from '../../src/fiscal/spec';
import type { LocalCustomer } from '../../src/types/supabase';

const base = (over: Partial<LocalCustomer> = {}): LocalCustomer =>
    ({
        id: 'c1',
        name: 'Cliente Lda',
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

describe('fiscalCustomer', () => {
    it('uses consumer-final defaults when no customer', () => {
        const f = buildFiscalCustomerFields(null);
        expect(f.transactionName).toBe(CONSUMER_FINAL_CUSTOMER_NAME);
        expect(f.taxIdForFiscalRow).toBe(CONSUMER_FINAL_CUSTOMER_TAX_ID);
        expect(f.taxNumberForQr).toBeNull();
        expect(f.receiptAddress).toBe(CONSUMER_FINAL_DEFAULT_ADDRESS);
    });

    it('fills missing NIF and name from consumer-final defaults', () => {
        const f = buildFiscalCustomerFields(base({ name: '  ', tax_number: null }));
        expect(f.transactionName).toBe(CONSUMER_FINAL_CUSTOMER_NAME);
        expect(f.taxIdForFiscalRow).toBe(CONSUMER_FINAL_CUSTOMER_TAX_ID);
    });

    it('uses Portugal when address fields are empty', () => {
        const f = buildFiscalCustomerFields(base({ address: null, postal_code: null, city: null }));
        expect(f.receiptAddress).toBe(CONSUMER_FINAL_DEFAULT_ADDRESS);
    });

    it('buildReceiptCustomerProps prefers transaction name when set', () => {
        const r = buildReceiptCustomerProps(null, 'Consumidor Final', CONSUMER_FINAL_CUSTOMER_TAX_ID);
        expect(r.name).toBe('Consumidor Final');
        expect(r.taxNumber).toBe(CONSUMER_FINAL_CUSTOMER_TAX_ID);
        expect(r.address).toBe(CONSUMER_FINAL_DEFAULT_ADDRESS);
    });
});
