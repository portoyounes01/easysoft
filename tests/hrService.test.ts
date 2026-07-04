import { describe, expect, it } from 'vitest';

import {
    calculateShiftHours,
    computeHolidayEntitlement,
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
