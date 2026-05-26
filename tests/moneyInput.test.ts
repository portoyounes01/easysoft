import { describe, it, expect } from 'vitest';
import {
    sanitizeMoneyInput,
    parseMoneyInput,
    formatMoneyInputValue,
    moneyInputHasDecimalSeparator,
} from '../src/utils/moneyInput';

describe('moneyInput', () => {
    describe('sanitizeMoneyInput', () => {
        it('allows comma as decimal separator', () => {
            expect(sanitizeMoneyInput('12,50')).toBe('12,50');
        });

        it('allows dot as decimal separator', () => {
            expect(sanitizeMoneyInput('12.50')).toBe('12.50');
        });

        it('keeps only the first decimal separator', () => {
            expect(sanitizeMoneyInput('1,2,3')).toBe('1,23');
        });
    });

    describe('parseMoneyInput', () => {
        it('parses comma decimals', () => {
            expect(parseMoneyInput('12,5')).toBe(12.5);
        });

        it('parses trailing decimal separator without resetting to zero', () => {
            expect(parseMoneyInput('12.')).toBe(12);
            expect(parseMoneyInput('12,')).toBe(12);
        });

        it('returns 0 for empty input', () => {
            expect(parseMoneyInput('')).toBe(0);
        });
    });

    describe('formatMoneyInputValue', () => {
        it('returns empty string for zero', () => {
            expect(formatMoneyInputValue(0)).toBe('');
        });
    });

    describe('moneyInputHasDecimalSeparator', () => {
        it('detects comma and dot', () => {
            expect(moneyInputHasDecimalSeparator('1,2')).toBe(true);
            expect(moneyInputHasDecimalSeparator('1.2')).toBe(true);
            expect(moneyInputHasDecimalSeparator('12')).toBe(false);
        });
    });
});
