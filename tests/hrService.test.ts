import { describe, expect, it } from 'vitest';

import {
    calculateShiftHours,
    computeHolidayEntitlement,
    contractDurationFromDates,
    contractEndForDuration,
    countNoShowDays,
    countWorkingDays,
    monthsBetween,
} from '../src/services/hrService';

describe('HR calculations', () => {
    it('calculates paid shift hours after unpaid breaks', () => {
        const hours = calculateShiftHours({
            clock_in: new Date('2026-06-25T09:00:00'),
            clock_out: new Date('2026-06-25T17:30:00'),
            unpaid_break_minutes: 30,
        });

        expect(hours).toBe(8);
    });

    it('never returns negative paid time', () => {
        const hours = calculateShiftHours({
            clock_in: new Date('2026-06-25T09:00:00'),
            clock_out: new Date('2026-06-25T09:15:00'),
            unpaid_break_minutes: 30,
        });

        expect(hours).toBe(0);
    });

    it('counts only configured working days in a leave period', () => {
        expect(countWorkingDays('2026-06-22', '2026-06-28', [1, 2, 3, 4, 5])).toBe(5);
        expect(countWorkingDays('2026-06-27', '2026-06-28', [1, 2, 3, 4, 5])).toBe(0);
    });

    it('rejects reversed leave periods', () => {
        expect(countWorkingDays('2026-06-28', '2026-06-22', [1, 2, 3, 4, 5])).toBe(0);
    });
});

describe('holiday accrual', () => {
    it('counts whole and reversed month spans', () => {
        expect(monthsBetween(new Date('2026-01-01T12:00:00'), new Date('2026-07-01T12:00:00'))).toBe(6);
        expect(monthsBetween(new Date('2026-07-01T12:00:00'), new Date('2026-01-01T12:00:00'))).toBe(0);
    });

    it('accrues pro-rata from the start of the year', () => {
        const entitlement = computeHolidayEntitlement(
            { contract_start_date: '2020-01-01', contract_end_date: null, carried_holiday_days: 0 },
            1.5,
            new Date('2026-07-01T12:00:00')
        );
        expect(entitlement).toBe(9); // 6 months * 1.5
    });

    it('accrues only from the contract start when hired mid-year', () => {
        const entitlement = computeHolidayEntitlement(
            { contract_start_date: '2026-04-01', contract_end_date: null, carried_holiday_days: 2 },
            1.5,
            new Date('2026-07-01T12:00:00')
        );
        expect(entitlement).toBe(6.5); // 3 months * 1.5 + 2 carried
    });
});

describe('no-show days', () => {
    const everyDay = [0, 1, 2, 3, 4, 5, 6];

    it('counts scheduled days with no attendance or approved leave, strictly before today', () => {
        const noShows = countNoShowDays(
            { contract_start_date: '2026-06-01', contract_end_date: null, working_days: everyDay },
            [{ clock_in: new Date('2026-06-02T09:00:00') }, { clock_in: new Date('2026-06-04T09:00:00') }],
            [{ start_date: '2026-06-03', end_date: '2026-06-03' }],
            new Date('2026-06-08T12:00:00')
        );
        // Window starts at first clock-in (Jun 2) through Jun 7 (Jun 8 is today);
        // worked Jun 2 & 4; leave Jun 3 -> no-shows Jun 5, 6, 7
        expect(noShows).toBe(3);
    });

    it('returns 0 when the employee has no attendance at all', () => {
        const noShows = countNoShowDays(
            { contract_start_date: '2026-06-01', contract_end_date: null, working_days: everyDay },
            [],
            [],
            new Date('2026-06-08T12:00:00')
        );
        expect(noShows).toBe(0);
    });

    it('does not count days after the contract ends', () => {
        const noShows = countNoShowDays(
            { contract_start_date: '2026-06-01', contract_end_date: '2026-06-03', working_days: everyDay },
            [{ clock_in: new Date('2026-06-01T09:00:00') }],
            [],
            new Date('2026-06-08T12:00:00')
        );
        // First clock-in Jun 1, worked Jun 1; window stops at contract end Jun 3 -> Jun 2, 3
        expect(noShows).toBe(2);
    });

    it('ignores non-working days', () => {
        const noShows = countNoShowDays(
            { contract_start_date: '2026-06-01', contract_end_date: null, working_days: [1, 2, 3, 4, 5] },
            [{ clock_in: new Date('2026-06-01T09:00:00') }],
            [],
            new Date('2026-06-08T12:00:00')
        );
        // Jun 2026: 1 Mon … 7 Sun. Worked Jun 1; working Mon–Fri before Jun 8 -> no-shows Jun 2,3,4,5
        expect(noShows).toBe(4);
    });
});

describe('contract duration', () => {
    it('ends a fixed-term contract the day before the same date of the closing month', () => {
        expect(contractEndForDuration('2026-07-17', 3)).toBe('2026-10-16');
        expect(contractEndForDuration('2026-07-17', 6)).toBe('2027-01-16');
        expect(contractEndForDuration('2026-07-17', 9)).toBe('2027-04-16');
    });

    it('starts on the 1st and ends on the last day of the previous month', () => {
        expect(contractEndForDuration('2026-01-01', 3)).toBe('2026-03-31');
    });

    it('clamps to the target month before taking the day off', () => {
        // 31 Jan + 1 month has no 31 Feb: clamp to 28 Feb, then step back a day.
        expect(contractEndForDuration('2026-01-31', 1)).toBe('2026-02-27');
        expect(contractEndForDuration('2026-11-30', 3)).toBe('2027-02-27');
        // 2028 is a leap year, so the clamp lands on the 29th.
        expect(contractEndForDuration('2027-11-30', 3)).toBe('2028-02-28');
    });

    it('crosses the year boundary', () => {
        expect(contractEndForDuration('2026-12-05', 3)).toBe('2027-03-04');
    });

    it('rejects an unparseable start date', () => {
        expect(contractEndForDuration('', 3)).toBeNull();
        expect(contractEndForDuration('not-a-date', 3)).toBeNull();
    });

    it('reads the duration back out of the stored dates', () => {
        expect(contractDurationFromDates('2026-07-17', null)).toBe('endless');
        expect(contractDurationFromDates('2026-07-17', '2026-10-16')).toBe('3');
        expect(contractDurationFromDates('2026-07-17', '2027-01-16')).toBe('6');
        expect(contractDurationFromDates('2026-07-17', '2027-04-16')).toBe('9');
        expect(contractDurationFromDates('2026-07-17', '2026-10-17')).toBe('custom');
        expect(contractDurationFromDates('2026-07-17', '2026-12-31')).toBe('custom');
    });

    it('round-trips every preset, so picking one never reads back as custom', () => {
        const starts = ['2026-01-01', '2026-01-31', '2026-02-28', '2026-05-17', '2026-11-30', '2027-12-31'];
        for (const start of starts) {
            for (const months of [3, 6, 9]) {
                const end = contractEndForDuration(start, months);
                expect(contractDurationFromDates(start, end)).toBe(String(months));
            }
        }
    });
});
