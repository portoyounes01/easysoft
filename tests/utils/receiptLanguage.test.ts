import { describe, it, expect } from 'vitest';
import { getReceiptT, normalizeReceiptLanguage } from '../../src/utils/receiptLanguage';

describe('receiptLanguage', () => {
    it('normalizeReceiptLanguage defaults invalid values to pt', () => {
        expect(normalizeReceiptLanguage('fr')).toBe('pt');
        expect(normalizeReceiptLanguage('en')).toBe('en');
    });

    it('getReceiptT returns locale-specific receipt strings', () => {
        expect(getReceiptT('pt')('thermalReceipt.docNotaCredito')).toBe('NOTA DE CRÉDITO N°');
        expect(getReceiptT('en')('thermalReceipt.docNotaCredito')).toBe('CREDIT NOTE NO.');
    });
});
