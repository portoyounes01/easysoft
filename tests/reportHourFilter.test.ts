import { describe, it, expect } from 'vitest';
import { filterByHour } from '../src/services/offlineReportingService';

const tx = (transaction_time: string) => ({ transaction_time });

describe('filterByHour (reports time-of-day filter)', () => {
    it('returns everything when no range is set', () => {
        const rows = [tx('08:00:00'), tx('20:30:00')];
        expect(filterByHour(rows, undefined)).toHaveLength(2);
    });

    it('keeps transactions within the inclusive hour range', () => {
        const rows = [tx('07:59:00'), tx('08:00:00'), tx('12:15:00'), tx('17:00:00'), tx('17:59:59'), tx('18:00:00')];
        const kept = filterByHour(rows, { start: 8, end: 17 }).map(r => r.transaction_time);
        expect(kept).toEqual(['08:00:00', '12:15:00', '17:00:00', '17:59:59']);
    });

    it('supports a single-hour window', () => {
        const rows = [tx('08:59:00'), tx('09:00:00'), tx('09:45:00'), tx('10:00:00')];
        expect(filterByHour(rows, { start: 9, end: 9 }).map(r => r.transaction_time)).toEqual([
            '09:00:00',
            '09:45:00',
        ]);
    });

    it('keeps rows with a missing or unparseable time rather than dropping them', () => {
        const rows = [{ transaction_time: undefined }, tx(''), tx('14:00:00')];
        expect(filterByHour(rows, { start: 9, end: 12 })).toHaveLength(2);
    });
});
