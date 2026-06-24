import { describe, expect, it } from 'vitest';
import type { ReportTransaction } from '../src/types/supabase';
import {
    calculateEffectiveOperatingCost,
    calculateProfitAndCosts,
    normalizeOperatingCosts,
    OperatingCost,
} from '../src/utils/profitCosts';

const makeTransaction = (overrides: Partial<ReportTransaction> = {}): ReportTransaction => ({
    id: 'tx-1',
    employeeId: 'emp-1',
    employeeName: 'Cashier',
    date: '2026-06-01',
    time: '10:00:00',
    items: [
        {
            productId: 'product-1',
            productName: 'Coffee',
            categoryId: 'drinks',
            categoryName: 'Drinks',
            quantity: 2,
            unitPrice: 6,
            cost: 2,
            total: 12,
            profit: 8,
        },
    ],
    subtotal: 12,
    discount: 0,
    tax: 2,
    total: 12,
    paymentMethod: 'cash',
    status: 'completed',
    ...overrides,
});

describe('profitCosts', () => {
    it('calculates profit from tax-exclusive sales, product costs, and operating costs', () => {
        const operatingCosts: OperatingCost[] = [
            { id: 'rent', name: 'Rent', amount: 300, frequency: 'period' },
            { id: 'water', name: 'Water', amount: 10, frequency: 'daily' },
        ];

        const summary = calculateProfitAndCosts(
            [makeTransaction()],
            operatingCosts,
            { start: '2026-06-01', end: '2026-06-03' },
        );

        expect(summary.dateRangeDays).toBe(3);
        expect(summary.grossSales).toBe(12);
        expect(summary.taxCollected).toBe(2);
        expect(summary.netSales).toBe(10);
        expect(summary.productCosts).toBe(4);
        expect(summary.grossProfit).toBe(6);
        expect(summary.operatingCosts).toBe(330);
        expect(summary.netProfit).toBe(-324);
        expect(summary.excludedTransactionCount).toBe(0);
    });

    it('excludes non-completed transactions from the profit statement', () => {
        const summary = calculateProfitAndCosts(
            [
                makeTransaction(),
                makeTransaction({ id: 'tx-refund', status: 'refunded', total: 50, tax: 10 }),
            ],
            [],
            { start: '2026-06-01', end: '2026-06-01' },
        );

        expect(summary.transactionCount).toBe(1);
        expect(summary.excludedTransactionCount).toBe(1);
        expect(summary.grossSales).toBe(12);
    });

    it('prorates monthly operating costs to the selected date range', () => {
        const applied = calculateEffectiveOperatingCost(
            { id: 'rent', name: 'Rent', amount: 304.17, frequency: 'monthly' },
            10,
        );

        expect(applied).toBeCloseTo(100, 1);
    });

    it('normalizes stored operating costs without accepting invalid rows', () => {
        const fallback: OperatingCost[] = [
            { id: 'fallback', name: 'Fallback', amount: 1, frequency: 'period' },
        ];
        const normalized = normalizeOperatingCosts(
            [
                { id: 'rent', name: 'Rent', amount: '25.5', frequency: 'weekly' },
                { id: 'bad-name', name: '', amount: 10, frequency: 'monthly' },
                { id: 'bad-frequency', name: 'Other', amount: -5, frequency: 'yearly' },
            ],
            fallback,
        );

        expect(normalized).toEqual([
            { id: 'rent', name: 'Rent', amount: 25.5, frequency: 'weekly' },
            { id: 'bad-frequency', name: 'Other', amount: 0, frequency: 'period' },
        ]);
    });
});
