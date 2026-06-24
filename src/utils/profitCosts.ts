import type { ReportTransaction } from '../types/supabase';

export const operatingCostFrequencies = ['period', 'daily', 'weekly', 'monthly'] as const;

export type OperatingCostFrequency = typeof operatingCostFrequencies[number];

export interface OperatingCost {
    id: string;
    name: string;
    amount: number;
    frequency: OperatingCostFrequency;
}

export interface ProfitAndCostDateRange {
    start: string;
    end: string;
}

export interface ProfitAndCostSummary {
    dateRangeDays: number;
    transactionCount: number;
    excludedTransactionCount: number;
    itemsSold: number;
    grossSales: number;
    taxCollected: number;
    netSales: number;
    productCosts: number;
    grossProfit: number;
    operatingCosts: number;
    totalCosts: number;
    netProfit: number;
    averageTransaction: number;
    grossMarginPercent: number;
    netMarginPercent: number;
    operatingCostDailyAverage: number;
    breakEvenNetSales: number;
}

const AVERAGE_DAYS_PER_MONTH = 365 / 12;

const toFiniteNumber = (value: number): number => (Number.isFinite(value) ? value : 0);

const safePercentage = (value: number, base: number): number => (
    base === 0 ? 0 : (value / base) * 100
);

export const isOperatingCostFrequency = (value: unknown): value is OperatingCostFrequency => (
    typeof value === 'string' && operatingCostFrequencies.includes(value as OperatingCostFrequency)
);

export const getInclusiveDateRangeDays = (startDate: string, endDate: string): number => {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
        return 1;
    }

    const diffMs = end.getTime() - start.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
};

export const calculateEffectiveOperatingCost = (cost: OperatingCost, dateRangeDays: number): number => {
    const amount = Math.max(0, toFiniteNumber(cost.amount));

    switch (cost.frequency) {
        case 'daily':
            return amount * dateRangeDays;
        case 'weekly':
            return amount * (dateRangeDays / 7);
        case 'monthly':
            return amount * (dateRangeDays / AVERAGE_DAYS_PER_MONTH);
        case 'period':
        default:
            return amount;
    }
};

export const calculateProfitAndCosts = (
    transactions: ReportTransaction[],
    operatingCosts: OperatingCost[],
    dateRange: ProfitAndCostDateRange,
): ProfitAndCostSummary => {
    const dateRangeDays = getInclusiveDateRangeDays(dateRange.start, dateRange.end);
    const completedTransactions = transactions.filter(transaction => transaction.status === 'completed');

    const totals = completedTransactions.reduce(
        (summary, transaction) => {
            const grossSales = toFiniteNumber(transaction.total);
            const taxCollected = toFiniteNumber(transaction.tax);
            const productCosts = transaction.items.reduce(
                (sum, item) => sum + (toFiniteNumber(item.cost) * toFiniteNumber(item.quantity)),
                0,
            );
            const itemsSold = transaction.items.reduce(
                (sum, item) => sum + toFiniteNumber(item.quantity),
                0,
            );

            return {
                grossSales: summary.grossSales + grossSales,
                taxCollected: summary.taxCollected + taxCollected,
                productCosts: summary.productCosts + productCosts,
                itemsSold: summary.itemsSold + itemsSold,
            };
        },
        {
            grossSales: 0,
            taxCollected: 0,
            productCosts: 0,
            itemsSold: 0,
        },
    );

    const netSales = totals.grossSales - totals.taxCollected;
    const grossProfit = netSales - totals.productCosts;
    const operatingCostsTotal = operatingCosts.reduce(
        (sum, cost) => sum + calculateEffectiveOperatingCost(cost, dateRangeDays),
        0,
    );
    const totalCosts = totals.productCosts + operatingCostsTotal;
    const netProfit = grossProfit - operatingCostsTotal;
    const grossMarginDecimal = netSales === 0 ? 0 : grossProfit / netSales;

    return {
        dateRangeDays,
        transactionCount: completedTransactions.length,
        excludedTransactionCount: transactions.length - completedTransactions.length,
        itemsSold: totals.itemsSold,
        grossSales: totals.grossSales,
        taxCollected: totals.taxCollected,
        netSales,
        productCosts: totals.productCosts,
        grossProfit,
        operatingCosts: operatingCostsTotal,
        totalCosts,
        netProfit,
        averageTransaction: completedTransactions.length === 0 ? 0 : totals.grossSales / completedTransactions.length,
        grossMarginPercent: safePercentage(grossProfit, netSales),
        netMarginPercent: safePercentage(netProfit, netSales),
        operatingCostDailyAverage: operatingCostsTotal / dateRangeDays,
        breakEvenNetSales: grossMarginDecimal <= 0 ? 0 : operatingCostsTotal / grossMarginDecimal,
    };
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null
);

const readStoredAmount = (value: unknown): number => {
    const amount = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
};

export const normalizeOperatingCosts = (
    value: unknown,
    fallback: OperatingCost[],
): OperatingCost[] => {
    if (!Array.isArray(value)) {
        return fallback;
    }

    const costs = value
        .map((item, index): OperatingCost | null => {
            if (!isRecord(item)) {
                return null;
            }

            const name = typeof item.name === 'string' ? item.name.trim() : '';
            if (!name) {
                return null;
            }

            const id = typeof item.id === 'string' && item.id.trim()
                ? item.id.trim()
                : `operating-cost-${index}`;
            const frequency = isOperatingCostFrequency(item.frequency) ? item.frequency : 'period';

            return {
                id,
                name,
                amount: readStoredAmount(item.amount),
                frequency,
            };
        })
        .filter((cost): cost is OperatingCost => cost !== null);

    return costs.length > 0 ? costs : fallback;
};

export const parseStoredOperatingCosts = (
    storedValue: string | null,
    fallback: OperatingCost[],
): OperatingCost[] => {
    if (!storedValue) {
        return fallback;
    }

    try {
        const parsed: unknown = JSON.parse(storedValue);
        return normalizeOperatingCosts(parsed, fallback);
    } catch {
        return fallback;
    }
};
