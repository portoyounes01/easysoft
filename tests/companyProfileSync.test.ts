import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
    mergeCompanyProfileIntoSettings,
    type CompanyProfile,
} from '../src/services/companyProfileService';
import { writeCompanyProfileToStorage } from '../src/services/companyProfileSync';

function profile(overrides: Partial<CompanyProfile> = {}): CompanyProfile {
    return {
        name: 'VERDE HONORÁRIO LDA',
        taxNumber: '517430940',
        address: 'Rua Luis Adelino Fonseca, 2',
        postalCode: '7005-345',
        city: 'Évora',
        phone: '',
        email: '',
        slogan: '',
        storeId: 'store-1',
        storeName: 'Évora Plaza',
        ...overrides,
    };
}

const LOCAL = {
    name: 'Nome da Empresa',
    address: 'Morada',
    postalCode: '1000-001',
    city: 'Lisboa',
    taxNumber: '000000000',
    phone: '910000000',
    email: 'shop@example.pt',
    slogan: 'Slogan',
};

describe('mergeCompanyProfileIntoSettings', () => {
    it('lets the server replace the values it actually has', () => {
        const merged = mergeCompanyProfileIntoSettings(LOCAL, profile());
        expect(merged.name).toBe('VERDE HONORÁRIO LDA');
        expect(merged.taxNumber).toBe('517430940');
        expect(merged.city).toBe('Évora');
    });

    // The dangerous case: this migration ships against tenants whose stores
    // have no address filled in yet. If an empty server field won, the first
    // sync after deploy would blank the receipt header of every till.
    it('never blanks a local value with an empty server one', () => {
        const merged = mergeCompanyProfileIntoSettings(LOCAL, profile({ phone: '', email: '', slogan: '' }));
        expect(merged.phone).toBe('910000000');
        expect(merged.email).toBe('shop@example.pt');
        expect(merged.slogan).toBe('Slogan');
    });

    it('treats whitespace-only server values as absent', () => {
        const merged = mergeCompanyProfileIntoSettings(LOCAL, profile({ city: '   ' }));
        expect(merged.city).toBe('Lisboa');
    });

    it('fills a field the till never had', () => {
        const bare = { ...LOCAL, phone: undefined, email: undefined, slogan: undefined };
        const merged = mergeCompanyProfileIntoSettings(bare, profile({ phone: '266000000' }));
        expect(merged.phone).toBe('266000000');
        expect(merged.email).toBe('');
    });
});

describe('writeCompanyProfileToStorage', () => {
    const KEY = 'pos_system_settings';

    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('leaves fields it does not own alone — the logo above all', () => {
        localStorage.setItem(
            KEY,
            JSON.stringify({
                company: { ...LOCAL, logo: { bitmap: 'AAA', widthDots: 100, heightDots: 40 } },
                pos: { currencySymbol: '€' },
            })
        );

        writeCompanyProfileToStorage(profile());

        const stored = JSON.parse(localStorage.getItem(KEY) as string);
        // receiptBrandingSync owns the logo; this sync must not touch it.
        expect(stored.company.logo).toEqual({ bitmap: 'AAA', widthDots: 100, heightDots: 40 });
        // Nor anything outside the company block.
        expect(stored.pos).toEqual({ currencySymbol: '€' });
        expect(stored.company.name).toBe('VERDE HONORÁRIO LDA');
    });

    it('reports no change when the server says what the till already holds', () => {
        localStorage.setItem(KEY, JSON.stringify({ company: { ...LOCAL, name: 'VERDE HONORÁRIO LDA' } }));
        const first = writeCompanyProfileToStorage(profile({ address: '', postalCode: '', city: '', taxNumber: '' }));
        expect(first).toBeNull();
    });

    it('survives a corrupt settings blob without throwing', () => {
        localStorage.setItem(KEY, '{not json');
        expect(() => writeCompanyProfileToStorage(profile())).not.toThrow();
    });
});
