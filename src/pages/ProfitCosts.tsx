import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    Building2,
    Calculator,
    Package,
    Plus,
    ReceiptText,
    RefreshCw,
    Trash2,
    TrendingDown,
    TrendingUp,
    WalletCards,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { useProducts } from '../contexts/ProductsContext';
import { offlineReportingService } from '../services/offlineReportingService';
import type { ReportFilters, ReportTransaction } from '../types/supabase';
import { AdminActionButton } from '../components/ui/AdminActionButton';
import {
    useDesignSystem2Customization,
} from '../contexts/DesignSystem2CustomizationContext';
import {
    calculateEffectiveOperatingCost,
    calculateProfitAndCosts,
    OperatingCost,
    OperatingCostFrequency,
    operatingCostFrequencies,
    parseStoredOperatingCosts,
} from '../utils/profitCosts';
import '../styles/design-system-2-scope.css';

const OPERATING_COSTS_STORAGE_KEY = 'pos-profit-costs-operating-costs';

interface MetricCardProps {
    icon: LucideIcon;
    label: string;
    value: string;
    helper?: string;
    tone: 'blue' | 'green' | 'red' | 'amber' | 'slate';
}

interface ProductCostRow {
    productId: string;
    productName: string;
    quantitySold: number;
    sales: number;
    cost: number;
    profit: number;
}

const metricToneClasses: Record<MetricCardProps['tone'], { border: string; icon: string; label: string; value: string }> = {
    blue: {
        border: 'border-blue-200',
        icon: 'bg-blue-500',
        label: 'text-blue-700',
        value: 'text-blue-950',
    },
    green: {
        border: 'border-green-200',
        icon: 'bg-green-600',
        label: 'text-green-700',
        value: 'text-green-950',
    },
    red: {
        border: 'border-red-200',
        icon: 'bg-red-500',
        label: 'text-red-700',
        value: 'text-red-950',
    },
    amber: {
        border: 'border-amber-200',
        icon: 'bg-amber-500',
        label: 'text-amber-700',
        value: 'text-amber-950',
    },
    slate: {
        border: 'border-slate-200',
        icon: 'bg-slate-600',
        label: 'text-slate-700',
        value: 'text-slate-950',
    },
};

const MetricCard: React.FC<MetricCardProps> = ({ icon: Icon, label, value, helper, tone }) => {
    const classes = metricToneClasses[tone];

    return (
        <div className={`rounded-xl border bg-white p-5 shadow-sm ${classes.border}`}>
            <div className="flex items-start justify-between gap-4">
                <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${classes.icon}`}>
                    <Icon className="h-6 w-6 text-white" />
                </div>
                <div className="min-w-0 text-right">
                    <p className={`text-sm font-semibold ${classes.label}`}>{label}</p>
                    <p className={`mt-1 truncate text-2xl font-bold ${classes.value}`}>{value}</p>
                    {helper && <p className="mt-1 text-xs font-medium text-gray-500">{helper}</p>}
                </div>
            </div>
        </div>
    );
};

const createDefaultOperatingCosts = (translate: (key: string) => string): OperatingCost[] => [
    { id: 'rent', name: translate('profitCosts.defaultCosts.rent'), amount: 0, frequency: 'monthly' },
    { id: 'wages', name: translate('profitCosts.defaultCosts.wages'), amount: 0, frequency: 'monthly' },
    { id: 'electricity', name: translate('profitCosts.defaultCosts.electricity'), amount: 0, frequency: 'monthly' },
    { id: 'water', name: translate('profitCosts.defaultCosts.water'), amount: 0, frequency: 'monthly' },
    { id: 'internet', name: translate('profitCosts.defaultCosts.internet'), amount: 0, frequency: 'monthly' },
    { id: 'supplies', name: translate('profitCosts.defaultCosts.supplies'), amount: 0, frequency: 'period' },
    { id: 'other', name: translate('profitCosts.defaultCosts.other'), amount: 0, frequency: 'period' },
];

const ProfitCosts: React.FC = () => {
    const { t } = useTranslation();
    const { language } = useLanguage();
    const { products } = useProducts();
    const { visualStyle, prefs, layoutClasses } = useDesignSystem2Customization();

    const defaultOperatingCosts = useMemo(() => createDefaultOperatingCosts(t), [t]);
    const [filters, setFilters] = useState<ReportFilters>({
        dateRange: {
            start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            end: new Date().toISOString().split('T')[0],
        },
    });
    const [transactions, setTransactions] = useState<ReportTransaction[]>([]);
    const [operatingCosts, setOperatingCosts] = useState<OperatingCost[]>(() => (
        parseStoredOperatingCosts(
            typeof window === 'undefined' ? null : window.localStorage.getItem(OPERATING_COSTS_STORAGE_KEY),
            defaultOperatingCosts,
        )
    ));
    const [reloadToken, setReloadToken] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const locale = language?.startsWith('pt') ? 'pt-PT' : 'en-US';
    const currencyFormatter = useMemo(
        () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }),
        [locale],
    );
    const percentFormatter = useMemo(
        () => new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }),
        [locale],
    );

    const handleDateChange = (field: 'start' | 'end', value: string) => {
        setFilters(prev => ({
            ...prev,
            dateRange: {
                ...prev.dateRange,
                [field]: value,
            },
        }));
    };

    const handleCostNameChange = (id: string, value: string) => {
        setOperatingCosts(prev => prev.map(cost => (
            cost.id === id ? { ...cost, name: value } : cost
        )));
    };

    const handleCostAmountChange = (id: string, value: string) => {
        const amount = Number(value);
        setOperatingCosts(prev => prev.map(cost => (
            cost.id === id ? { ...cost, amount: Number.isFinite(amount) ? Math.max(0, amount) : 0 } : cost
        )));
    };

    const handleCostFrequencyChange = (id: string, frequency: OperatingCostFrequency) => {
        setOperatingCosts(prev => prev.map(cost => (
            cost.id === id ? { ...cost, frequency } : cost
        )));
    };

    const handleAddOperatingCost = () => {
        setOperatingCosts(prev => [
            ...prev,
            {
                id: `custom-${Date.now()}`,
                name: t('profitCosts.operatingCosts.newCostName'),
                amount: 0,
                frequency: 'monthly',
            },
        ]);
    };

    const handleRemoveOperatingCost = (id: string) => {
        setOperatingCosts(prev => prev.filter(cost => cost.id !== id));
    };

    const handleResetOperatingCosts = () => {
        setOperatingCosts(defaultOperatingCosts);
    };

    const handleRefresh = () => {
        setReloadToken(prev => prev + 1);
    };

    const formatCurrency = (amount: number): string => currencyFormatter.format(amount);
    const formatPercent = (amount: number): string => `${percentFormatter.format(amount)}%`;

    const summary = useMemo(
        () => calculateProfitAndCosts(transactions, operatingCosts, filters.dateRange),
        [filters.dateRange, operatingCosts, transactions],
    );

    const operatingCostRows = useMemo(() => (
        operatingCosts.map(cost => ({
            cost,
            appliedAmount: calculateEffectiveOperatingCost(cost, summary.dateRangeDays),
        }))
    ), [operatingCosts, summary.dateRangeDays]);

    const productCostRows = useMemo(() => {
        const rows = new Map<string, ProductCostRow>();

        transactions
            .filter(transaction => transaction.status === 'completed')
            .forEach(transaction => {
                transaction.items.forEach(item => {
                    const existing = rows.get(item.productId) || {
                        productId: item.productId,
                        productName: item.productName,
                        quantitySold: 0,
                        sales: 0,
                        cost: 0,
                        profit: 0,
                    };
                    const cost = item.cost * item.quantity;
                    const profit = item.total - cost;

                    rows.set(item.productId, {
                        ...existing,
                        quantitySold: existing.quantitySold + item.quantity,
                        sales: existing.sales + item.total,
                        cost: existing.cost + cost,
                        profit: existing.profit + profit,
                    });
                });
            });

        return Array.from(rows.values())
            .sort((a, b) => b.cost - a.cost)
            .slice(0, 8);
    }, [transactions]);

    const inventorySnapshot = useMemo(() => {
        const activeProducts = products.filter(product => product.is_active && !product.deleted_at);
        return activeProducts.reduce(
            (snapshot, product) => ({
                activeProducts: snapshot.activeProducts + 1,
                unitsInStock: snapshot.unitsInStock + product.stock,
                stockAtCost: snapshot.stockAtCost + (product.cost * product.stock),
                stockAtRetail: snapshot.stockAtRetail + (product.price * product.stock),
            }),
            {
                activeProducts: 0,
                unitsInStock: 0,
                stockAtCost: 0,
                stockAtRetail: 0,
            },
        );
    }, [products]);

    useEffect(() => {
        let isMounted = true;

        const loadProfitData = async () => {
            try {
                setIsLoading(true);
                setError(null);
                const data = await offlineReportingService.getReportData(filters);

                if (isMounted) {
                    setTransactions(data.transactions);
                }
            } catch (err) {
                console.error('Error loading profit and cost data:', err);
                if (isMounted) {
                    setError(err instanceof Error ? err.message : t('profitCosts.error.message'));
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        loadProfitData();

        return () => {
            isMounted = false;
        };
    }, [filters, reloadToken, t]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        window.localStorage.setItem(OPERATING_COSTS_STORAGE_KEY, JSON.stringify(operatingCosts));
    }, [operatingCosts]);

    const netProfitTone = summary.netProfit >= 0 ? 'green' : 'red';
    const toolbarBtn =
        'ds2-control-radius-lg ds2-toolbar-control-h !px-3 text-sm font-medium gap-2 shadow-none whitespace-nowrap leading-none shrink-0 [&>svg]:!h-4 [&>svg]:!w-4';

    if (isLoading) {
        return (
            <div className="ds2-visual-scope" style={visualStyle} data-ds2-neutral={prefs.neutralFamilyId}>
                <div className={`space-y-6 ${layoutClasses.contentInsetX}`}>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">{t('profitCosts.header.title')}</h1>
                        <p className="mt-1 text-gray-600">{t('profitCosts.header.subtitle')}</p>
                    </div>
                    <div className="flex h-64 items-center justify-center">
                        <div className="flex items-center gap-3 text-gray-600">
                            <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
                            <span>{t('profitCosts.loading')}</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="ds2-visual-scope" style={visualStyle} data-ds2-neutral={prefs.neutralFamilyId}>
                <div className={`space-y-6 ${layoutClasses.contentInsetX}`}>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">{t('profitCosts.header.title')}</h1>
                        <p className="mt-1 text-gray-600">{t('profitCosts.header.subtitle')}</p>
                    </div>
                    <div className="rounded-xl border border-red-200 bg-red-50 p-6">
                        <div className="flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-red-600" />
                            <h2 className="text-lg font-semibold text-red-900">{t('profitCosts.error.title')}</h2>
                        </div>
                        <p className="mt-2 text-red-700">{error}</p>
                        <AdminActionButton
                            type="button"
                            variant="outline"
                            icon={RefreshCw}
                            label={t('common.retry')}
                            onClick={handleRefresh}
                            className={`${toolbarBtn} mt-4`}
                        />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="ds2-visual-scope" style={visualStyle} data-ds2-neutral={prefs.neutralFamilyId}>
            <div className={`space-y-6 ${layoutClasses.contentInsetX}`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">{t('profitCosts.header.title')}</h1>
                        <p className="mt-1 text-gray-600">{t('profitCosts.header.subtitle')}</p>
                    </div>
                    <AdminActionButton
                        type="button"
                        variant="outline"
                        icon={RefreshCw}
                        label={t('profitCosts.header.refresh')}
                        onClick={handleRefresh}
                        className={toolbarBtn}
                    />
                </div>

                <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <label className="flex flex-col gap-2">
                            <span className="text-sm font-semibold text-gray-700">{t('profitCosts.filters.startDate')}</span>
                            <input
                                type="date"
                                value={filters.dateRange.start}
                                onChange={(event) => handleDateChange('start', event.target.value)}
                                className="ds2-control-radius-lg min-h-touch-xs border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </label>
                        <label className="flex flex-col gap-2">
                            <span className="text-sm font-semibold text-gray-700">{t('profitCosts.filters.endDate')}</span>
                            <input
                                type="date"
                                value={filters.dateRange.end}
                                onChange={(event) => handleDateChange('end', event.target.value)}
                                className="ds2-control-radius-lg min-h-touch-xs border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </label>
                        <div className="flex flex-col justify-end">
                            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                                <p className="text-sm font-semibold text-gray-700">{t('profitCosts.filters.periodLength')}</p>
                                <p className="mt-1 text-2xl font-bold text-gray-900">
                                    {summary.dateRangeDays} {t('profitCosts.filters.days')}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                        icon={ReceiptText}
                        label={t('profitCosts.metrics.grossSales')}
                        value={formatCurrency(summary.grossSales)}
                        helper={t('profitCosts.metrics.transactionCount', { count: summary.transactionCount })}
                        tone="blue"
                    />
                    <MetricCard
                        icon={Package}
                        label={t('profitCosts.metrics.productCosts')}
                        value={formatCurrency(summary.productCosts)}
                        helper={formatPercent(summary.productCosts === 0 ? 0 : (summary.productCosts / Math.max(summary.netSales, 1)) * 100)}
                        tone="amber"
                    />
                    <MetricCard
                        icon={WalletCards}
                        label={t('profitCosts.metrics.operatingCosts')}
                        value={formatCurrency(summary.operatingCosts)}
                        helper={t('profitCosts.metrics.dailyAverage', { amount: formatCurrency(summary.operatingCostDailyAverage) })}
                        tone="slate"
                    />
                    <MetricCard
                        icon={summary.netProfit >= 0 ? TrendingUp : TrendingDown}
                        label={t('profitCosts.metrics.netProfit')}
                        value={formatCurrency(summary.netProfit)}
                        helper={formatPercent(summary.netMarginPercent)}
                        tone={netProfitTone}
                    />
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
                    <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
                        <div className="border-b border-gray-100 px-5 py-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-lg bg-green-100 p-2">
                                    <Calculator className="h-5 w-5 text-green-700" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-gray-900">{t('profitCosts.statement.title')}</h2>
                                    <p className="text-sm text-gray-500">{t('profitCosts.statement.subtitle')}</p>
                                </div>
                            </div>
                        </div>
                        <div className="divide-y divide-gray-100 px-5">
                            <div className="flex items-center justify-between py-3">
                                <span className="text-sm font-medium text-gray-600">{t('profitCosts.statement.grossSales')}</span>
                                <span className="text-sm font-semibold text-gray-900">{formatCurrency(summary.grossSales)}</span>
                            </div>
                            <div className="flex items-center justify-between py-3">
                                <span className="text-sm font-medium text-gray-600">{t('profitCosts.statement.taxCollected')}</span>
                                <span className="text-sm font-semibold text-gray-900">-{formatCurrency(summary.taxCollected)}</span>
                            </div>
                            <div className="flex items-center justify-between py-3">
                                <span className="text-sm font-medium text-gray-600">{t('profitCosts.statement.netSales')}</span>
                                <span className="text-sm font-semibold text-gray-900">{formatCurrency(summary.netSales)}</span>
                            </div>
                            <div className="flex items-center justify-between py-3">
                                <span className="text-sm font-medium text-gray-600">{t('profitCosts.statement.productCosts')}</span>
                                <span className="text-sm font-semibold text-gray-900">-{formatCurrency(summary.productCosts)}</span>
                            </div>
                            <div className="flex items-center justify-between py-3">
                                <span className="text-sm font-medium text-gray-600">{t('profitCosts.statement.grossProfit')}</span>
                                <span className="text-sm font-semibold text-gray-900">{formatCurrency(summary.grossProfit)}</span>
                            </div>
                            <div className="flex items-center justify-between py-3">
                                <span className="text-sm font-medium text-gray-600">{t('profitCosts.statement.operatingCosts')}</span>
                                <span className="text-sm font-semibold text-gray-900">-{formatCurrency(summary.operatingCosts)}</span>
                            </div>
                            <div className="flex items-center justify-between py-4">
                                <span className="text-base font-bold text-gray-900">{t('profitCosts.statement.netProfit')}</span>
                                <span className={`text-xl font-bold ${summary.netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                    {formatCurrency(summary.netProfit)}
                                </span>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3 border-t border-gray-100 p-5 md:grid-cols-2">
                            <div className="rounded-xl bg-gray-50 p-4">
                                <p className="text-xs font-semibold uppercase text-gray-500">{t('profitCosts.statement.grossMargin')}</p>
                                <p className="mt-1 text-xl font-bold text-gray-900">{formatPercent(summary.grossMarginPercent)}</p>
                            </div>
                            <div className="rounded-xl bg-gray-50 p-4">
                                <p className="text-xs font-semibold uppercase text-gray-500">{t('profitCosts.statement.breakEven')}</p>
                                <p className="mt-1 text-xl font-bold text-gray-900">{formatCurrency(summary.breakEvenNetSales)}</p>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
                        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
                            <div className="flex items-center gap-3">
                                <div className="rounded-lg bg-blue-100 p-2">
                                    <Building2 className="h-5 w-5 text-blue-700" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-gray-900">{t('profitCosts.operatingCosts.title')}</h2>
                                    <p className="text-sm text-gray-500">{t('profitCosts.operatingCosts.subtitle')}</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <AdminActionButton
                                    type="button"
                                    variant="outline"
                                    icon={RefreshCw}
                                    label={t('profitCosts.operatingCosts.reset')}
                                    onClick={handleResetOperatingCosts}
                                    className={toolbarBtn}
                                />
                                <AdminActionButton
                                    type="button"
                                    variant="primary"
                                    icon={Plus}
                                    label={t('profitCosts.operatingCosts.add')}
                                    onClick={handleAddOperatingCost}
                                    className={toolbarBtn}
                                />
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[860px]">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-normal text-gray-500">{t('profitCosts.operatingCosts.table.cost')}</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-normal text-gray-500">{t('profitCosts.operatingCosts.table.amount')}</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-normal text-gray-500">{t('profitCosts.operatingCosts.table.frequency')}</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-normal text-gray-500">{t('profitCosts.operatingCosts.table.applied')}</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-normal text-gray-500">{t('profitCosts.operatingCosts.table.actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {operatingCostRows.map(({ cost, appliedAmount }) => (
                                        <tr key={cost.id}>
                                            <td className="px-5 py-4">
                                                <input
                                                    type="text"
                                                    value={cost.name}
                                                    onChange={(event) => handleCostNameChange(cost.id, event.target.value)}
                                                    aria-label={t('profitCosts.operatingCosts.table.cost')}
                                                    className="ds2-control-radius-lg min-h-touch-xs w-full border border-gray-300 px-3 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </td>
                                            <td className="px-5 py-4">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={cost.amount}
                                                    onChange={(event) => handleCostAmountChange(cost.id, event.target.value)}
                                                    aria-label={t('profitCosts.operatingCosts.table.amount')}
                                                    className="ds2-control-radius-lg min-h-touch-xs w-32 border border-gray-300 px-3 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="inline-flex overflow-hidden rounded-lg border border-gray-200">
                                                    {operatingCostFrequencies.map(frequency => {
                                                        const active = cost.frequency === frequency;
                                                        return (
                                                            <button
                                                                key={frequency}
                                                                type="button"
                                                                onClick={() => handleCostFrequencyChange(cost.id, frequency)}
                                                                className={`min-h-touch-xs px-3 text-xs font-semibold transition-colors ${active ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                                                            >
                                                                {t(`profitCosts.frequency.${frequency}`)}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-right text-sm font-semibold text-gray-900">
                                                {formatCurrency(appliedAmount)}
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveOperatingCost(cost.id)}
                                                    className="inline-flex min-h-touch-xs min-w-[44px] items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-50"
                                                    aria-label={t('profitCosts.operatingCosts.remove')}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {operatingCostRows.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-500">
                                                {t('profitCosts.operatingCosts.empty')}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)]">
                    <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
                        <div className="border-b border-gray-100 px-5 py-4">
                            <h2 className="text-lg font-semibold text-gray-900">{t('profitCosts.productBreakdown.title')}</h2>
                            <p className="text-sm text-gray-500">{t('profitCosts.productBreakdown.subtitle')}</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[760px]">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-normal text-gray-500">{t('profitCosts.productBreakdown.table.product')}</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-normal text-gray-500">{t('profitCosts.productBreakdown.table.quantity')}</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-normal text-gray-500">{t('profitCosts.productBreakdown.table.sales')}</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-normal text-gray-500">{t('profitCosts.productBreakdown.table.cost')}</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-normal text-gray-500">{t('profitCosts.productBreakdown.table.profit')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {productCostRows.map(row => (
                                        <tr key={row.productId} className="hover:bg-gray-50">
                                            <td className="px-5 py-4 text-sm font-medium text-gray-900">{row.productName}</td>
                                            <td className="px-5 py-4 text-right text-sm text-gray-700">{row.quantitySold}</td>
                                            <td className="px-5 py-4 text-right text-sm text-gray-700">{formatCurrency(row.sales)}</td>
                                            <td className="px-5 py-4 text-right text-sm text-gray-700">{formatCurrency(row.cost)}</td>
                                            <td className={`px-5 py-4 text-right text-sm font-semibold ${row.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                                {formatCurrency(row.profit)}
                                            </td>
                                        </tr>
                                    ))}
                                    {productCostRows.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-500">
                                                {t('profitCosts.productBreakdown.empty')}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
                        <div className="border-b border-gray-100 px-5 py-4">
                            <h2 className="text-lg font-semibold text-gray-900">{t('profitCosts.inventory.title')}</h2>
                            <p className="text-sm text-gray-500">{t('profitCosts.inventory.subtitle')}</p>
                        </div>
                        <div className="divide-y divide-gray-100 px-5">
                            <div className="flex items-center justify-between py-4">
                                <span className="text-sm font-medium text-gray-600">{t('profitCosts.inventory.activeProducts')}</span>
                                <span className="text-sm font-semibold text-gray-900">{inventorySnapshot.activeProducts}</span>
                            </div>
                            <div className="flex items-center justify-between py-4">
                                <span className="text-sm font-medium text-gray-600">{t('profitCosts.inventory.unitsInStock')}</span>
                                <span className="text-sm font-semibold text-gray-900">{inventorySnapshot.unitsInStock}</span>
                            </div>
                            <div className="flex items-center justify-between py-4">
                                <span className="text-sm font-medium text-gray-600">{t('profitCosts.inventory.stockAtCost')}</span>
                                <span className="text-sm font-semibold text-gray-900">{formatCurrency(inventorySnapshot.stockAtCost)}</span>
                            </div>
                            <div className="flex items-center justify-between py-4">
                                <span className="text-sm font-medium text-gray-600">{t('profitCosts.inventory.stockAtRetail')}</span>
                                <span className="text-sm font-semibold text-gray-900">{formatCurrency(inventorySnapshot.stockAtRetail)}</span>
                            </div>
                            <div className="flex items-center justify-between py-4">
                                <span className="text-sm font-medium text-gray-600">{t('profitCosts.inventory.potentialMargin')}</span>
                                <span className="text-sm font-semibold text-gray-900">
                                    {formatCurrency(inventorySnapshot.stockAtRetail - inventorySnapshot.stockAtCost)}
                                </span>
                            </div>
                        </div>
                        {summary.excludedTransactionCount > 0 && (
                            <div className="border-t border-amber-100 bg-amber-50 px-5 py-4 text-sm font-medium text-amber-800">
                                {t('profitCosts.inventory.excludedTransactions', { count: summary.excludedTransactionCount })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfitCosts;
