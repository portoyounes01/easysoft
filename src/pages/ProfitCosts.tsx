import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    BarChart3,
    Building2,
    Calculator,
    ChevronLeft,
    ChevronRight,
    CircleDollarSign,
    Package,
    Plus,
    ReceiptText,
    RefreshCw,
    SlidersHorizontal,
    Trash2,
    TrendingDown,
    TrendingUp,
    WalletCards,
    X,
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

type MobileProfitCostsView = 'overview' | 'operating' | 'products' | 'inventory';
type MobileProductMetric = 'profit' | 'margin' | 'cost';

const toDateInputValue = (date: Date): string => date.toISOString().split('T')[0];

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
    const [mobileView, setMobileView] = useState<MobileProfitCostsView>('overview');
    const [showMobilePeriodPicker, setShowMobilePeriodPicker] = useState(false);
    const [mobileEditingCostId, setMobileEditingCostId] = useState<string | null>(null);
    const [mobileProductMetric, setMobileProductMetric] = useState<MobileProductMetric>('profit');

    const locale = language?.startsWith('pt') ? 'pt-PT' : language?.startsWith('es') ? 'es-ES' : 'en-US';
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

    const handleMobileDatePreset = (days: number) => {
        const end = new Date();
        const start = new Date(end);
        start.setDate(end.getDate() - days + 1);

        setFilters(prev => ({
            ...prev,
            dateRange: {
                start: toDateInputValue(start),
                end: toDateInputValue(end),
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
        const id = `custom-${Date.now()}`;
        setOperatingCosts(prev => [
            ...prev,
            {
                id,
                name: t('profitCosts.operatingCosts.newCostName'),
                amount: 0,
                frequency: 'monthly',
            },
        ]);
        setMobileEditingCostId(id);
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

    const mobileProductCostRows = useMemo(() => {
        const metricValue = (row: ProductCostRow): number => {
            switch (mobileProductMetric) {
                case 'margin':
                    return row.sales === 0 ? 0 : (row.profit / row.sales) * 100;
                case 'cost':
                    return row.cost;
                case 'profit':
                default:
                    return row.profit;
            }
        };

        return [...productCostRows].sort((a, b) => metricValue(b) - metricValue(a));
    }, [mobileProductMetric, productCostRows]);

    const inventoryCapitalRows = useMemo(() => (
        products
            .filter(product => product.is_active && !product.deleted_at)
            .map(product => ({
                id: product.id,
                name: product.name,
                units: product.stock,
                value: product.cost * product.stock,
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5)
    ), [products]);

    const mobileDateRangeLabel = useMemo(() => {
        const start = new Date(`${filters.dateRange.start}T00:00:00`);
        const end = new Date(`${filters.dateRange.end}T00:00:00`);
        const dateFormat: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
        return `${start.toLocaleDateString(locale, dateFormat)} – ${end.toLocaleDateString(locale, dateFormat)}`;
    }, [filters.dateRange.end, filters.dateRange.start, locale]);

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
            <div className="space-y-5 px-4 pb-7 pt-1 md:hidden">
                {mobileView === 'overview' && (
                    <>
                        <header className="flex items-start justify-between gap-3 pt-2">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Business health</p>
                                <h1 className="mt-0.5 text-[32px] font-bold tracking-tight text-gray-950">{t('profitCosts.header.title')}</h1>
                            </div>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setShowMobilePeriodPicker(true)} className="flex min-h-touch-xs min-w-touch-xs items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm" aria-label="Choose reporting period">
                                    <SlidersHorizontal className="h-5 w-5" />
                                </button>
                                <button type="button" onClick={handleRefresh} className="flex min-h-touch-xs min-w-touch-xs items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm" aria-label={t('profitCosts.header.refresh')}>
                                    <RefreshCw className="h-5 w-5" />
                                </button>
                            </div>
                        </header>

                        <button type="button" onClick={() => setShowMobilePeriodPicker(true)} className="flex min-h-touch-xs w-full items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 text-left shadow-sm">
                            <span><span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Reporting period</span><span className="mt-1 block text-base font-semibold text-gray-900">{mobileDateRangeLabel}</span></span>
                            <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">{summary.dateRangeDays} days</span>
                        </button>

                        <section className={`rounded-3xl p-6 text-white shadow-sm ${summary.netProfit >= 0 ? 'bg-[#227a4f]' : 'bg-red-700'}`}>
                            <div className="flex items-start justify-between gap-4">
                                <div><p className="text-sm font-semibold text-white/75">Net profit</p><p className="mt-1 text-4xl font-bold tracking-tight">{formatCurrency(summary.netProfit)}</p></div>
                                <div className="rounded-2xl bg-white/15 px-3 py-2 text-right"><p className="text-xs font-medium text-white/70">Margin</p><p className="text-lg font-bold">{formatPercent(summary.netMarginPercent)}</p></div>
                            </div>
                            <div className="mt-6 border-t border-white/15 pt-4"><p className="text-sm font-medium text-white/80">{summary.netProfit >= 0 ? 'Your margin is healthy this period.' : 'Costs are higher than this period’s net sales.'}</p><p className="mt-1 text-xs text-white/65">{t('profitCosts.metrics.transactionCount', { count: summary.transactionCount })}</p></div>
                        </section>

                        <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                            <div className="flex items-center justify-between"><div><h2 className="text-lg font-bold text-gray-950">Where revenue goes</h2><p className="mt-0.5 text-sm text-gray-500">A simple view of this period</p></div><BarChart3 className="h-5 w-5 text-gray-400" /></div>
                            <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-gray-100">
                                <div className="bg-[#60a5fa]" style={{ width: `${summary.netSales <= 0 ? 0 : Math.max(0, (summary.productCosts / summary.netSales) * 100)}%` }} />
                                <div className="bg-gray-400" style={{ width: `${summary.netSales <= 0 ? 0 : Math.max(0, (summary.operatingCosts / summary.netSales) * 100)}%` }} />
                                <div className={summary.netProfit >= 0 ? 'bg-[#34a86b]' : 'bg-red-500'} style={{ width: `${summary.netSales <= 0 ? 0 : Math.max(0, (summary.netProfit / summary.netSales) * 100)}%` }} />
                            </div>
                            <div className="mt-5 space-y-3">
                                {[{ label: t('profitCosts.statement.netSales'), value: summary.netSales, tone: 'bg-blue-400' }, { label: t('profitCosts.statement.productCosts'), value: -summary.productCosts, tone: 'bg-amber-400' }, { label: t('profitCosts.statement.operatingCosts'), value: -summary.operatingCosts, tone: 'bg-gray-400' }, { label: t('profitCosts.statement.netProfit'), value: summary.netProfit, tone: summary.netProfit >= 0 ? 'bg-green-500' : 'bg-red-500' }].map(item => <div key={item.label} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 font-medium text-gray-600"><span className={`h-2.5 w-2.5 rounded-full ${item.tone}`} />{item.label}</span><span className="font-semibold text-gray-900">{item.value < 0 ? '-' : ''}{formatCurrency(Math.abs(item.value))}</span></div>)}
                            </div>
                        </section>

                        <section className="grid grid-cols-2 gap-3">
                            {[{ label: t('profitCosts.metrics.grossSales'), value: formatCurrency(summary.grossSales), icon: ReceiptText, tone: 'text-blue-700 bg-blue-50' }, { label: t('profitCosts.metrics.productCosts'), value: formatCurrency(summary.productCosts), icon: Package, tone: 'text-amber-700 bg-amber-50' }, { label: t('profitCosts.statement.grossMargin'), value: formatPercent(summary.grossMarginPercent), icon: TrendingUp, tone: 'text-green-700 bg-green-50' }, { label: t('profitCosts.statement.breakEven'), value: formatCurrency(summary.breakEvenNetSales), icon: Calculator, tone: 'text-gray-700 bg-gray-100' }].map(({ label, value, icon: Icon, tone }) => <div key={label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span><p className="mt-3 text-xs font-semibold text-gray-500">{label}</p><p className="mt-1 truncate text-lg font-bold tracking-tight text-gray-950">{value}</p></div>)}
                        </section>

                        <section><h2 className="px-1 text-lg font-bold text-gray-950">Explore</h2><div className="mt-2 overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">{[{ view: 'operating' as const, icon: Building2, title: t('profitCosts.operatingCosts.title'), subtitle: formatCurrency(summary.operatingCosts) }, { view: 'products' as const, icon: TrendingUp, title: 'Product profitability', subtitle: formatCurrency(summary.grossProfit) }, { view: 'inventory' as const, icon: CircleDollarSign, title: 'Inventory capital', subtitle: formatCurrency(inventorySnapshot.stockAtCost) }].map(({ view, icon: Icon, title, subtitle }) => <button key={view} type="button" onClick={() => setMobileView(view)} className="flex min-h-touch items-center gap-4 border-b border-gray-100 px-4 text-left last:border-b-0"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-700"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block text-base font-semibold text-gray-900">{title}</span><span className="block text-sm text-gray-500">{subtitle}</span></span><ChevronRight className="h-5 w-5 text-gray-400" /></button>)}</div></section>
                    </>
                )}

                {mobileView === 'operating' && (
                    <>
                        <header className="flex min-h-touch-xs items-center gap-2"><button type="button" onClick={() => setMobileView('overview')} className="flex min-h-touch-xs min-w-touch-xs items-center justify-center rounded-full bg-white text-gray-700 shadow-sm" aria-label="Back to profit overview"><ChevronLeft className="h-5 w-5" /></button><div><p className="text-sm font-medium text-gray-500">Manage</p><h1 className="text-2xl font-bold tracking-tight text-gray-950">{t('profitCosts.operatingCosts.title')}</h1></div></header>
                        <section className="rounded-3xl bg-[#f2f8f4] p-6"><p className="text-sm font-semibold text-[#35684b]">Applied this period</p><p className="mt-1 text-4xl font-bold tracking-tight text-[#155b36]">{formatCurrency(summary.operatingCosts)}</p><p className="mt-2 text-sm text-[#4d7960]">{summary.dateRangeDays}-day period · {formatCurrency(summary.operatingCostDailyAverage)} daily average</p></section>
                        <div className="flex items-center justify-between px-1"><h2 className="text-lg font-bold text-gray-950">Your charges</h2><button type="button" onClick={handleResetOperatingCosts} className="min-h-touch-xs px-2 text-sm font-semibold text-gray-600">{t('profitCosts.operatingCosts.reset')}</button></div>
                        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">{operatingCostRows.map(({ cost, appliedAmount }) => <button key={cost.id} type="button" onClick={() => setMobileEditingCostId(cost.id)} className="flex min-h-touch items-center gap-3 border-b border-gray-100 px-4 text-left last:border-b-0"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Building2 className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-base font-semibold text-gray-900">{cost.name}</span><span className="block text-sm text-gray-500">{t(`profitCosts.frequency.${cost.frequency}`)} · {formatCurrency(cost.amount)}</span></span><span className="text-right"><span className="block text-sm font-bold text-gray-900">{formatCurrency(appliedAmount)}</span><ChevronRight className="ml-auto mt-1 h-4 w-4 text-gray-400" /></span></button>)}{operatingCostRows.length === 0 && <p className="p-5 text-center text-sm text-gray-500">{t('profitCosts.operatingCosts.empty')}</p>}</section>
                        <button type="button" onClick={handleAddOperatingCost} className="flex min-h-touch w-full items-center justify-center gap-2 rounded-2xl bg-[#227a4f] px-5 text-base font-semibold text-white shadow-sm"><Plus className="h-5 w-5" />{t('profitCosts.operatingCosts.add')}</button>
                    </>
                )}

                {mobileView === 'products' && (
                    <>
                        <header className="flex min-h-touch-xs items-center gap-2"><button type="button" onClick={() => setMobileView('overview')} className="flex min-h-touch-xs min-w-touch-xs items-center justify-center rounded-full bg-white text-gray-700 shadow-sm" aria-label="Back to profit overview"><ChevronLeft className="h-5 w-5" /></button><div><p className="text-sm font-medium text-gray-500">Sales performance</p><h1 className="text-2xl font-bold tracking-tight text-gray-950">Product profitability</h1></div></header>
                        <section className="rounded-3xl bg-[#227a4f] p-6 text-white"><p className="text-sm font-semibold text-white/75">Gross profit</p><p className="mt-1 text-4xl font-bold tracking-tight">{formatCurrency(summary.grossProfit)}</p><div className="mt-5 flex items-center justify-between border-t border-white/15 pt-4"><span className="text-sm text-white/75">Gross margin</span><span className="text-lg font-bold">{formatPercent(summary.grossMarginPercent)}</span></div></section>
                        <div className="grid grid-cols-3 rounded-2xl bg-gray-100 p-1">{([{ value: 'profit', label: 'Profit' }, { value: 'margin', label: 'Margin' }, { value: 'cost', label: 'Cost' }] as const).map(option => <button key={option.value} type="button" onClick={() => setMobileProductMetric(option.value)} className={`min-h-touch-xs rounded-xl text-sm font-semibold transition-colors ${mobileProductMetric === option.value ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500'}`}>{option.label}</button>)}</div>
                        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">{mobileProductCostRows.map((row, index) => { const value = mobileProductMetric === 'margin' ? (row.sales === 0 ? 0 : (row.profit / row.sales) * 100) : mobileProductMetric === 'cost' ? row.cost : row.profit; const max = Math.max(...mobileProductCostRows.map(item => mobileProductMetric === 'margin' ? (item.sales === 0 ? 0 : (item.profit / item.sales) * 100) : mobileProductMetric === 'cost' ? item.cost : item.profit), 1); return <div key={row.productId} className="border-b border-gray-100 p-4 last:border-b-0"><div className="flex items-start gap-3"><span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-600">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className="truncate text-base font-semibold text-gray-900">{row.productName}</p><p className="whitespace-nowrap text-base font-bold text-[#227a4f]">{mobileProductMetric === 'margin' ? formatPercent(value) : formatCurrency(value)}</p></div><p className="mt-0.5 text-sm text-gray-500">{row.quantitySold} sold · {formatCurrency(row.sales)} sales</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-[#4cae76]" style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} /></div></div></div></div>})}{mobileProductCostRows.length === 0 && <p className="p-6 text-center text-sm text-gray-500">{t('profitCosts.productBreakdown.empty')}</p>}</section>
                    </>
                )}

                {mobileView === 'inventory' && (
                    <>
                        <header className="flex min-h-touch-xs items-center gap-2"><button type="button" onClick={() => setMobileView('overview')} className="flex min-h-touch-xs min-w-touch-xs items-center justify-center rounded-full bg-white text-gray-700 shadow-sm" aria-label="Back to profit overview"><ChevronLeft className="h-5 w-5" /></button><div><p className="text-sm font-medium text-gray-500">Stock value</p><h1 className="text-2xl font-bold tracking-tight text-gray-950">Inventory capital</h1></div></header>
                        <section className="rounded-3xl bg-[#1f2937] p-6 text-white"><p className="text-sm font-semibold text-white/70">Capital tied up in stock</p><p className="mt-1 text-4xl font-bold tracking-tight">{formatCurrency(inventorySnapshot.stockAtCost)}</p><div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/15 pt-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-white/55">Retail value</p><p className="mt-1 text-lg font-bold">{formatCurrency(inventorySnapshot.stockAtRetail)}</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-white/55">Potential margin</p><p className="mt-1 text-lg font-bold text-[#7ee2aa]">{formatCurrency(inventorySnapshot.stockAtRetail - inventorySnapshot.stockAtCost)}</p></div></div></section>
                        <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold text-gray-950">Capital concentration</h2><p className="mt-0.5 text-sm text-gray-500">Products tying up the most cash</p></div><CircleDollarSign className="h-5 w-5 text-gray-400" /></div><div className="mt-5 space-y-4">{inventoryCapitalRows.map(row => <div key={row.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-base font-semibold text-gray-900">{row.name}</p><p className="mt-0.5 text-sm text-gray-500">{row.units} units in stock</p></div><p className="whitespace-nowrap text-base font-bold text-gray-900">{formatCurrency(row.value)}</p></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-[#65758b]" style={{ width: `${inventorySnapshot.stockAtCost === 0 ? 0 : Math.min(100, (row.value / inventorySnapshot.stockAtCost) * 100)}%` }} /></div></div>)}{inventoryCapitalRows.length === 0 && <p className="text-center text-sm text-gray-500">No active inventory.</p>}</div></section>
                        <section className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-sm font-semibold text-gray-500">Active products</p><p className="mt-2 text-2xl font-bold text-gray-950">{inventorySnapshot.activeProducts}</p></div><div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-sm font-semibold text-gray-500">Units in stock</p><p className="mt-2 text-2xl font-bold text-gray-950">{inventorySnapshot.unitsInStock}</p></div></section>
                    </>
                )}

                {showMobilePeriodPicker && <div className="fixed inset-0 z-50 flex items-end bg-gray-950/40" role="dialog" aria-modal="true" aria-label="Choose reporting period"><div className="relative w-full rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"><div className="absolute left-1/2 top-3 h-1.5 w-10 -translate-x-1/2 rounded-full bg-gray-200" /><div className="mt-3 flex items-center justify-between"><div><p className="text-sm font-medium text-gray-500">Reporting period</p><h2 className="text-2xl font-bold text-gray-950">Choose dates</h2></div><button type="button" onClick={() => setShowMobilePeriodPicker(false)} className="flex min-h-touch-xs min-w-touch-xs items-center justify-center rounded-full bg-gray-100 text-gray-700" aria-label="Close period picker"><X className="h-5 w-5" /></button></div><div className="mt-6 grid grid-cols-3 gap-2">{[{ label: 'Today', days: 1 }, { label: '7 days', days: 7 }, { label: '30 days', days: 30 }].map(option => <button key={option.days} type="button" onClick={() => handleMobileDatePreset(option.days)} className={`min-h-touch-xs rounded-xl border text-sm font-semibold ${(option.days === summary.dateRangeDays || (option.days === 30 && summary.dateRangeDays === 31)) ? 'border-[#227a4f] bg-[#227a4f] text-white' : 'border-gray-200 text-gray-700'}`}>{option.label}</button>)}</div><div className="mt-5 grid grid-cols-2 gap-3"><label className="text-sm font-semibold text-gray-700">{t('profitCosts.filters.startDate')}<input type="date" value={filters.dateRange.start} onChange={event => handleDateChange('start', event.target.value)} className="mt-2 min-h-touch-xs w-full rounded-xl border border-gray-200 px-3 text-base font-normal" /></label><label className="text-sm font-semibold text-gray-700">{t('profitCosts.filters.endDate')}<input type="date" value={filters.dateRange.end} onChange={event => handleDateChange('end', event.target.value)} className="mt-2 min-h-touch-xs w-full rounded-xl border border-gray-200 px-3 text-base font-normal" /></label></div><button type="button" onClick={() => setShowMobilePeriodPicker(false)} className="mt-6 min-h-touch w-full rounded-2xl bg-[#227a4f] text-base font-semibold text-white">Apply period</button></div></div>}

                {mobileEditingCostId && (() => { const cost = operatingCosts.find(item => item.id === mobileEditingCostId); return cost ? <div className="fixed inset-0 z-50 flex items-end bg-gray-950/40" role="dialog" aria-modal="true" aria-label="Edit operating charge"><div className="relative w-full rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"><div className="absolute left-1/2 top-3 h-1.5 w-10 -translate-x-1/2 rounded-full bg-gray-200" /><div className="mt-3 flex items-center justify-between"><h2 className="text-2xl font-bold text-gray-950">Edit charge</h2><button type="button" onClick={() => setMobileEditingCostId(null)} className="flex min-h-touch-xs min-w-touch-xs items-center justify-center rounded-full bg-gray-100 text-gray-700" aria-label="Close charge editor"><X className="h-5 w-5" /></button></div><label className="mt-5 block text-sm font-semibold text-gray-700">{t('profitCosts.operatingCosts.table.cost')}<input type="text" value={cost.name} onChange={event => handleCostNameChange(cost.id, event.target.value)} className="mt-2 min-h-touch-xs w-full rounded-xl border border-gray-200 px-3 text-base font-normal" /></label><label className="mt-4 block text-sm font-semibold text-gray-700">{t('profitCosts.operatingCosts.table.amount')}<input type="number" min="0" step="0.01" value={cost.amount} onChange={event => handleCostAmountChange(cost.id, event.target.value)} className="mt-2 min-h-touch-xs w-full rounded-xl border border-gray-200 px-3 text-base font-normal" /></label><div className="mt-4"><p className="text-sm font-semibold text-gray-700">{t('profitCosts.operatingCosts.table.frequency')}</p><div className="mt-2 grid grid-cols-2 gap-2">{operatingCostFrequencies.map(frequency => <button key={frequency} type="button" onClick={() => handleCostFrequencyChange(cost.id, frequency)} className={`min-h-touch-xs rounded-xl border text-sm font-semibold ${cost.frequency === frequency ? 'border-[#227a4f] bg-[#eaf6ef] text-[#17613c]' : 'border-gray-200 text-gray-700'}`}>{t(`profitCosts.frequency.${frequency}`)}</button>)}</div></div><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={() => { handleRemoveOperatingCost(cost.id); setMobileEditingCostId(null); }} className="min-h-touch-xs rounded-xl border border-red-200 font-semibold text-red-700"><Trash2 className="mr-2 inline h-4 w-4" />Delete</button><button type="button" onClick={() => setMobileEditingCostId(null)} className="min-h-touch-xs rounded-xl bg-[#227a4f] font-semibold text-white">Done</button></div></div></div> : null; })()}
            </div>

            <div className={`hidden space-y-6 md:block ${layoutClasses.contentInsetX}`}>
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
