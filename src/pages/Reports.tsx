import React, { useState, useEffect, useMemo } from 'react';
import {
    BarChart3,
    TrendingUp,
    Users,
    Package,
    DollarSign,
    Calendar,
    Download,
    Filter,
    ShoppingCart,
    AlertCircle,
    CheckCircle,
    Loader2,
    ChevronLeft,
    X,
    RotateCcw
} from 'lucide-react';
import { useEmployees } from '../contexts/EmployeesContext';
import { useProducts } from '../contexts/ProductsContext';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { offlineReportingService } from '../services/offlineReportingService';
import {
    ReportTransaction,
    ReportFilters,
    EmployeePerformance,
    ProductPerformance,
    OverviewMetrics
} from '../types/supabase';
import { TabButton } from '../components/ui/TabButton';
import { AdminActionButton } from '../components/ui/AdminActionButton';
import { ListRow } from '../components/ui/ListRow';
import { TabToggle } from '../components/ui/TabToggle';
import { dialogButtonClasses, useAppliedDialogStyle } from '../theme/dialogStyle';
import {
    useDesignSystem2Customization,
} from '../contexts/DesignSystem2CustomizationContext';
import '../styles/design-system-2-scope.css';

// Note: Mock data has been replaced with real database integration
// The transaction data now comes from the reportingService

const ReportsInner: React.FC = () => {
    const { t } = useTranslation();
    const { language } = useLanguage();
    const { visualStyle, prefs, layoutClasses } = useDesignSystem2Customization();
    const appliedDialog = useAppliedDialogStyle();
    const sheetButtons = appliedDialog ? dialogButtonClasses(appliedDialog) : null;
    const { employees } = useEmployees();
    const { products, categories } = useProducts();

    const [activeTab, setActiveTab] = useState('overview');
    const [filters, setFilters] = useState<ReportFilters>({
        dateRange: {
            start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
            end: new Date().toISOString().split('T')[0] // today
        }
    });
    const [showFilters, setShowFilters] = useState(true);
    const [showMobileFilters, setShowMobileFilters] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [reportData, setReportData] = useState<{
        transactions: ReportTransaction[];
        employeePerformance: EmployeePerformance[];
        productPerformance: ProductPerformance[];
        overviewMetrics: OverviewMetrics;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const toolbarBtn =
        'ds2-control-radius-lg ds2-toolbar-control-h !px-3 text-sm font-medium gap-2 shadow-none whitespace-nowrap leading-none shrink-0 [&>svg]:!h-4 [&>svg]:!w-4';
    const headerPrimaryBtn =
        'ds2-control-radius-lg ds2-toolbar-control-h !px-4 text-sm font-semibold gap-2 shadow-none whitespace-nowrap leading-none shrink-0 [&>svg]:!h-4 [&>svg]:!w-4';

    const scopeShell = (children: React.ReactNode, extraClass = '') => (
        <div
            className={['ds2-visual-scope', extraClass].filter(Boolean).join(' ')}
            style={visualStyle}
            data-ds2-neutral={prefs.neutralFamilyId}
        >
            {children}
        </div>
    );

    // Load report data when filters change
    useEffect(() => {
        const loadReportData = async () => {
            try {
                setIsLoading(true);
                setError(null);

                const data = await offlineReportingService.getReportData(filters);
                setReportData(data);
            } catch (err) {
                console.error('Error loading report data:', err);
                setError(err instanceof Error ? err.message : t('reports.error.title'));
            } finally {
                setIsLoading(false);
            }
        };

        loadReportData();
    }, [filters]);

    // Get filtered transactions
    const filteredTransactions = useMemo(() => {
        if (!reportData) return [];
        return reportData.transactions;
    }, [reportData]);

    // Get report data from service
    const overviewMetrics = useMemo(() => {
        return reportData?.overviewMetrics || {
            totalRevenue: 0,
            totalTransactions: 0,
            totalItems: 0,
            avgTransaction: 0
        };
    }, [reportData]);

    const employeePerformance = useMemo(() => {
        return reportData?.employeePerformance || [];
    }, [reportData]);

    const productPerformance = useMemo(() => {
        return reportData?.productPerformance || [];
    }, [reportData]);



    // Handle filter changes
    const handleFilterChange = <K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    // Hour-of-day filter: clearing either bound removes the filter; the range is
    // kept valid (start <= end) by mirroring whichever bound the user just moved.
    const handleHourChange = (part: 'start' | 'end', raw: string) => {
        if (raw === '') {
            handleFilterChange('hourRange', undefined);
            return;
        }
        const value = Number(raw);
        const current = filters.hourRange ?? { start: value, end: value };
        const next = { ...current, [part]: value };
        if (next.start > next.end) {
            if (part === 'start') next.end = value;
            else next.start = value;
        }
        handleFilterChange('hourRange', next);
    };

    const hourOptions = Array.from({ length: 24 }, (_, hour) => hour);

    // Handle export to Excel
    const handleExportExcel = async () => {
        if (!reportData) return;

        setIsExporting(true);
        try {
            // Generate CSV content using the reporting service
            const csvContent = await offlineReportingService.generateCSVReport(filters);
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `sales-report-${filters.dateRange.start}-to-${filters.dateRange.end}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Export failed:', error);
            setError('Failed to export report. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat(language?.startsWith('pt') ? 'pt-PT' : language?.startsWith('es') ? 'es-ES' : 'en-US', {
            style: 'currency',
            currency: 'EUR'
        }).format(amount);
    };

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString(language?.startsWith('pt') ? 'pt-PT' : language?.startsWith('es') ? 'es-ES' : 'en-US');
    };

    const toDateInputValue = (date: Date) => {
        const timezoneOffset = date.getTimezoneOffset() * 60_000;
        return new Date(date.getTime() - timezoneOffset).toISOString().split('T')[0];
    };

    const handleMobileDatePreset = (days: number) => {
        const end = new Date();
        const start = new Date(end);
        start.setDate(end.getDate() - (days - 1));
        handleFilterChange('dateRange', { start: toDateInputValue(start), end: toDateInputValue(end) });
    };

    const handleResetMobileFilters = () => {
        handleMobileDatePreset(30);
        setFilters(prev => ({ dateRange: prev.dateRange }));
    };

    const dateRangeLabel = useMemo(() => {
        const start = new Date(`${filters.dateRange.start}T00:00:00`);
        const end = new Date(`${filters.dateRange.end}T00:00:00`);
        const locale = language?.startsWith('pt') ? 'pt-PT' : language?.startsWith('es') ? 'es-ES' : 'en-GB';
        const startLabel = start.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
        const endLabel = end.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
        return `${startLabel} – ${endLabel}`;
    }, [filters.dateRange.end, filters.dateRange.start, language]);

    const mobileMetrics = useMemo(() => {
        const dayCount = Math.max(1, Math.round((new Date(`${filters.dateRange.end}T00:00:00`).getTime() - new Date(`${filters.dateRange.start}T00:00:00`).getTime()) / 86_400_000) + 1);
        return {
            dailyAverage: overviewMetrics.totalRevenue / dayCount,
            periodDays: dayCount,
            activeFilterCount: [filters.employeeId, filters.categoryId, filters.paymentMethod, filters.hourRange].filter(Boolean).length,
        };
    }, [filters.categoryId, filters.dateRange.end, filters.dateRange.start, filters.employeeId, filters.hourRange, filters.paymentMethod, overviewMetrics.totalRevenue]);

    const trendPoints = useMemo(() => {
        const start = new Date(`${filters.dateRange.start}T00:00:00`);
        const end = new Date(`${filters.dateRange.end}T00:00:00`);
        const days = Math.min(31, Math.max(2, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1));
        const totals = Array.from({ length: days }, (_, index) => {
            const day = new Date(start);
            day.setDate(start.getDate() + index);
            const dayKey = toDateInputValue(day);
            return filteredTransactions.filter(transaction => transaction.date === dayKey).reduce((sum, transaction) => sum + transaction.total, 0);
        });
        const max = Math.max(...totals, 1);
        return totals.map((value, index) => `${(index / (days - 1)) * 100},${84 - (value / max) * 68}`).join(' ');
    }, [filteredTransactions, filters.dateRange.end, filters.dateRange.start]);

    const mobileProducts = useMemo(() => [...productPerformance].sort((a, b) => b.totalRevenue - a.totalRevenue), [productPerformance]);
    const inventoryProducts = useMemo(() => products.filter(product => product.is_active && !product.deleted_at).sort((a, b) => {
        const priority = (product: typeof a) => product.stock === 0 ? 0 : product.stock <= product.min_stock ? 1 : 2;
        return priority(a) - priority(b) || a.name.localeCompare(b.name);
    }), [products]);
    const inventorySummary = useMemo(() => ({
        out: inventoryProducts.filter(product => product.stock === 0).length,
        low: inventoryProducts.filter(product => product.stock > 0 && product.stock <= product.min_stock).length,
        healthy: inventoryProducts.filter(product => product.stock > product.min_stock).length,
    }), [inventoryProducts]);
    const maxEmployeeSales = employeePerformance[0]?.totalSales || 1;
    const maxProductRevenue = mobileProducts[0]?.totalRevenue || 1;
    const leadingEmployee = employeePerformance[0];

    const tabs = [
        { id: 'overview', label: t('reports.tabs.overview'), icon: BarChart3 },
        { id: 'employees', label: t('reports.tabs.employees'), icon: Users },
        { id: 'products', label: t('reports.tabs.products'), icon: Package },
        { id: 'inventory', label: t('reports.tabs.inventory'), icon: ShoppingCart }
    ];

    // Show loading state
    if (isLoading) {
        return scopeShell(
            <div className={`space-y-6 ${layoutClasses.contentInsetX}`}>
                <div className="flex flex-col space-y-4 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">{t('reports.header.title')}</h1>
                        <p className="mt-1 text-gray-600">{t('reports.header.subtitle')}</p>
                    </div>
                </div>
                <div className="flex h-64 items-center justify-center">
                    <div className="flex items-center space-x-2">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                        <span className="text-gray-600">{t('reports.loading.loadingData')}</span>
                    </div>
                </div>
            </div>
        );
    }

    // Show error state
    if (error) {
        return scopeShell(
            <div className={`space-y-6 ${layoutClasses.contentInsetX}`}>
                <div className="flex flex-col space-y-4 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">{t('reports.header.title')}</h1>
                        <p className="mt-1 text-gray-600">{t('reports.header.subtitle')}</p>
                    </div>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-6">
                    <div className="flex items-center space-x-2">
                        <AlertCircle className="h-5 w-5 text-red-500" />
                        <h3 className="font-medium text-red-800">{t('reports.error.title')}</h3>
                    </div>
                    <p className="mt-2 text-red-700">{error}</p>
                    <AdminActionButton
                        type="button"
                        variant="primary"
                        label={t('reports.error.retry')}
                        onClick={() => window.location.reload()}
                        className="mt-4 w-fit"
                    />
                </div>
            </div>
        );
    }

    return (
        <div
            className="ds2-visual-scope"
            style={visualStyle}
            data-ds2-neutral={prefs.neutralFamilyId}
        >
            <div className="space-y-5 md:hidden">
                <header className="flex items-start justify-between gap-3">
                    {activeTab === 'overview' ? <div>
                        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Reports</h1>
                        <p className="mt-1 text-base text-gray-600">Your business at a glance</p>
                    </div> : <div />}
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setShowMobileFilters(true)} className="relative flex min-h-touch-xs min-w-touch-xs items-center justify-center rounded-2xl text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500" aria-label={t('reports.header.filters')}>
                            <Filter className="h-5 w-5" />
                            {mobileMetrics.activeFilterCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-green-600 px-1 text-[11px] font-bold text-white">{mobileMetrics.activeFilterCount}</span>}
                        </button>
                        <button type="button" onClick={handleExportExcel} disabled={isExporting} className="flex min-h-touch-xs min-w-touch-xs items-center justify-center rounded-2xl text-gray-700 hover:bg-gray-100 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-green-500" aria-label={t('reports.header.exportExcel')}>
                            {isExporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                        </button>
                    </div>
                </header>

                {activeTab === 'overview' && <>
                    <div role="group" aria-label="Date range">
                        <TabToggle<string>
                            options={[{ value: '1', label: 'Today' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }]}
                            value={mobileMetrics.periodDays === 1 ? '1' : mobileMetrics.periodDays === 7 ? '7' : (mobileMetrics.periodDays === 30 || mobileMetrics.periodDays === 31) ? '30' : ''}
                            onChange={value => handleMobileDatePreset(Number(value))}
                        />
                    </div>
                    <button type="button" onClick={() => setShowMobileFilters(true)} className="flex min-h-touch-xs w-full items-center gap-2 rounded-xl bg-transparent px-1 text-left text-sm font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500">
                        <Calendar className="h-4 w-4 text-green-700" />
                        <span>{dateRangeLabel}</span><span className="text-gray-300">·</span><span>{filters.employeeId ? employees.find(employee => employee.id === filters.employeeId)?.name : t('reports.filters.allEmployees')}</span>
                    </button>
                    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                        <p className="text-sm font-semibold text-gray-600">{t('reports.overview.totalRevenue')}</p>
                        <p className="mt-1 font-mono text-4xl font-bold tracking-tight text-gray-900">{formatCurrency(overviewMetrics.totalRevenue)}</p>
                        <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-green-700"><TrendingUp className="h-4 w-4" /> {filteredTransactions.length ? 'Current sales across this period' : 'No sales in this period'}</p>
                        <div className="mt-5 h-28 border-b border-l border-dashed border-gray-200 px-1 pb-1">
                            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Revenue trend">
                                <polyline points={trendPoints} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" className="text-green-600" />
                            </svg>
                        </div>
                    </section>
                    <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                        {[
                            { label: t('reports.overview.transactions'), value: overviewMetrics.totalTransactions, icon: BarChart3 },
                            { label: t('reports.overview.itemsSold'), value: overviewMetrics.totalItems, icon: Package },
                            { label: 'Avg. sale', value: formatCurrency(overviewMetrics.avgTransaction), icon: DollarSign },
                            { label: 'Daily average', value: formatCurrency(mobileMetrics.dailyAverage), icon: TrendingUp },
                        ].map(({ label, value, icon: Icon }, index) => <div key={label} className={`flex min-h-24 items-center gap-3 p-4 ${index < 2 ? 'border-b' : ''} ${index % 2 === 0 ? 'border-r' : ''} border-gray-200`}><span className="rounded-xl bg-green-50 p-2.5 text-green-700"><Icon className="h-5 w-5" /></span><div><p className="text-xs font-medium text-gray-500">{label}</p><p className="mt-0.5 font-mono text-xl font-bold text-gray-900">{value}</p></div></div>)}
                    </div>
                    <section>
                        <h2 className="mb-2 text-xl font-bold text-gray-900">Explore reports</h2>
                        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                            {tabs.filter(tab => tab.id !== 'overview').map(({ id, label, icon: Icon }) => <ListRow key={id} showChevron onClick={() => setActiveTab(id)} className="focus:outline-none focus:ring-2 focus:ring-inset focus:ring-green-500"><span className="rounded-xl bg-green-50 p-2.5 text-green-700"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block font-semibold text-gray-900">{label}</span><span className="block truncate text-sm text-gray-500">{id === 'employees' ? 'Sales, transactions, and productivity' : id === 'products' ? 'Top-selling products and categories' : 'Stock levels and alerts'}</span></span></ListRow>)}
                        </div>
                    </section>
                </>}

                {activeTab === 'employees' && <section>
                    <div className="mb-4 flex items-center gap-3"><button type="button" onClick={() => setActiveTab('overview')} className="flex min-h-touch-xs min-w-touch-xs items-center justify-center rounded-2xl text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500" aria-label="Back to reports"><ChevronLeft className="h-7 w-7" /></button><div><h2 className="text-2xl font-bold text-gray-900">{t('reports.tabs.employees')}</h2><p className="text-sm text-gray-500">{dateRangeLabel}</p></div></div>
                    {leadingEmployee && <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><p className="text-sm text-gray-600">Top performer</p><p className="mt-1 text-xl font-bold text-gray-900">{leadingEmployee.employeeName}</p><p className="mt-1 text-sm text-green-700">{formatCurrency(leadingEmployee.totalSales)} · {leadingEmployee.transactionCount} transactions</p></div>}
                    <h3 className="mb-2 text-xl font-bold text-gray-900">Team ranking</h3><div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">{employeePerformance.map((employee, index) => <ListRow key={employee.employeeId} className="focus:outline-none focus:ring-2 focus:ring-inset focus:ring-green-500"><span className="w-5 font-mono text-lg font-bold text-gray-700">{index + 1}</span><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white">{employee.employeeName.split(' ').map(name => name[0]).join('')}</span><span className="min-w-0 flex-1"><span className="block truncate font-semibold text-gray-900">{employee.employeeName}</span><span className="block text-sm text-gray-500">{employee.transactionCount} transactions · {employee.itemsSold} items</span><span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full bg-green-600" style={{ width: `${(employee.totalSales / maxEmployeeSales) * 100}%` }} /></span></span><span className="font-mono text-base font-bold text-gray-900">{formatCurrency(employee.totalSales)}</span></ListRow>)}</div>
                </section>}

                {activeTab === 'products' && <section>
                    <div className="mb-4 flex items-center gap-3"><button type="button" onClick={() => setActiveTab('overview')} className="flex min-h-touch-xs min-w-touch-xs items-center justify-center rounded-2xl text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500" aria-label="Back to reports"><ChevronLeft className="h-7 w-7" /></button><div><h2 className="text-2xl font-bold text-gray-900">{t('reports.tabs.products')}</h2><p className="text-sm text-gray-500">{dateRangeLabel}</p></div></div>
                    {mobileProducts[0] && <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><p className="text-sm text-green-700">Top product</p><p className="mt-1 text-xl font-bold text-gray-900">{mobileProducts[0].productName}</p><p className="mt-1 text-sm text-gray-600">{formatCurrency(mobileProducts[0].totalRevenue)} · {mobileProducts[0].quantitySold} {t('reports.products.table.units')}</p></div>}
                    <h3 className="mb-2 text-xl font-bold text-gray-900">Top products</h3><div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">{mobileProducts.map((product, index) => <ListRow key={product.productId} className="focus:outline-none focus:ring-2 focus:ring-inset focus:ring-green-500"><span className="w-5 font-mono text-lg font-bold text-gray-700">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate font-semibold text-gray-900">{product.productName}</span><span className="block text-sm text-gray-500">{product.categoryName} · {product.quantitySold} {t('reports.products.table.units')}</span><span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full bg-green-600" style={{ width: `${(product.totalRevenue / maxProductRevenue) * 100}%` }} /></span></span><span className="font-mono text-base font-bold text-gray-900">{formatCurrency(product.totalRevenue)}</span></ListRow>)}</div>
                </section>}

                {activeTab === 'inventory' && <section>
                    <div className="mb-4 flex items-center gap-3"><button type="button" onClick={() => setActiveTab('overview')} className="flex min-h-touch-xs min-w-touch-xs items-center justify-center rounded-2xl text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500" aria-label="Back to reports"><ChevronLeft className="h-7 w-7" /></button><div><h2 className="text-2xl font-bold text-gray-900">Inventory health</h2><p className="text-sm text-gray-500">Prioritised by urgency</p></div></div>
                    <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><p className="text-xl font-bold text-gray-900">{inventorySummary.out + inventorySummary.low ? `${inventorySummary.out + inventorySummary.low} items need attention` : 'Inventory is healthy'}</p><div className="mt-4 grid grid-cols-3 text-center"><span><b className="block text-xl text-red-600">{inventorySummary.out}</b><small className="text-gray-500">Out</small></span><span><b className="block text-xl text-amber-600">{inventorySummary.low}</b><small className="text-gray-500">Low</small></span><span><b className="block text-xl text-green-600">{inventorySummary.healthy}</b><small className="text-gray-500">Healthy</small></span></div></div>
                    <h3 className="mb-2 text-xl font-bold text-gray-900">{inventorySummary.out + inventorySummary.low ? 'Needs action' : 'Healthy inventory'}</h3><div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">{inventoryProducts.filter(product => inventorySummary.out + inventorySummary.low ? product.stock <= product.min_stock : true).map(product => { const out = product.stock === 0; const low = product.stock <= product.min_stock; return <div key={product.id} className="flex min-h-touch-sm items-center gap-3 border-b border-gray-100 p-4 last:border-b-0"><span className={`rounded-xl p-2.5 ${out ? 'bg-red-50 text-red-600' : low ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>{out || low ? <AlertCircle className="h-5 w-5" /> : <CheckCircle className="h-5 w-5" />}</span><span className="min-w-0 flex-1"><span className="block truncate font-semibold text-gray-900">{product.name}</span><span className="block text-sm text-gray-500">{product.stock} in stock · minimum {product.min_stock}</span></span><span className={`text-right text-sm font-semibold ${out ? 'text-red-600' : low ? 'text-amber-600' : 'text-green-600'}`}>{out ? t('reports.inventory.table.urgentRestock') : low ? t('reports.inventory.table.reorderSoon') : t('reports.inventory.table.noAction')}</span></div>; })}</div>
                </section>}

                {showMobileFilters && <div className="fixed inset-0 z-50 flex items-end bg-gray-950/40 p-0 md:hidden" role="dialog" aria-modal="true" aria-label={t('reports.header.filters')}>
                    <div className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"><div className="mb-5 flex items-center justify-between"><div className="h-1.5 w-10 rounded-full bg-gray-200 absolute left-1/2 -translate-x-1/2 -translate-y-3" /><h2 className="text-2xl font-bold text-gray-900">{t('reports.header.filters')}</h2><AdminActionButton type="button" variant="icon" icon={X} onClick={() => setShowMobileFilters(false)} className="min-w-touch-xs" aria-label="Close filters" /></div><div className="space-y-5"><div><p className="mb-2 text-sm font-semibold text-gray-700">Date range</p><div className="grid grid-cols-4 gap-2">{[{ label: 'Today', days: 1 }, { label: '7 days', days: 7 }, { label: '30 days', days: 30 }].map(option => <button key={option.days} type="button" onClick={() => handleMobileDatePreset(option.days)} className={`min-h-touch-xs rounded-lg border text-sm font-semibold ${(mobileMetrics.periodDays === option.days || (option.days === 30 && mobileMetrics.periodDays === 31)) ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>{option.label}</button>)}<button type="button" className="min-h-touch-xs rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50">Custom</button></div><div className="mt-3 grid grid-cols-2 gap-2"><input aria-label={t('reports.filters.startDate')} type="date" value={filters.dateRange.start} onChange={event => handleFilterChange('dateRange', { ...filters.dateRange, start: event.target.value })} className="min-h-touch-xs rounded-xl border border-gray-200 px-3 text-sm" /><input aria-label={t('reports.filters.endDate')} type="date" value={filters.dateRange.end} onChange={event => handleFilterChange('dateRange', { ...filters.dateRange, end: event.target.value })} className="min-h-touch-xs rounded-xl border border-gray-200 px-3 text-sm" /></div></div><label className="block text-sm font-semibold text-gray-700">{t('reports.filters.employee')}<select value={filters.employeeId || ''} onChange={event => handleFilterChange('employeeId', event.target.value || undefined)} className="mt-2 min-h-touch-xs w-full rounded-xl border border-gray-200 bg-white px-3 text-base font-normal"><option value="">{t('reports.filters.allEmployees')}</option>{employees.filter(employee => employee.is_active && !employee.deleted_at).map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><label className="block text-sm font-semibold text-gray-700">Category<select value={filters.categoryId || ''} onChange={event => handleFilterChange('categoryId', event.target.value || undefined)} className="mt-2 min-h-touch-xs w-full rounded-xl border border-gray-200 bg-white px-3 text-base font-normal"><option value="">All categories</option>{categories.filter(category => category.is_active && !category.deleted_at).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><div><p className="mb-2 text-sm font-semibold text-gray-700">{t('reports.filters.paymentMethod')}</p><div className="grid grid-cols-4 gap-2">{[{ label: 'All', value: '' }, { label: t('reports.filters.cash'), value: 'cash' }, { label: t('reports.filters.card'), value: 'card' }, { label: t('reports.filters.mixed'), value: 'mixed' }].map(option => <button key={option.value || 'all'} type="button" onClick={() => handleFilterChange('paymentMethod', option.value || undefined)} className={`min-h-touch-xs rounded-[10px] border transition-all text-sm font-semibold ${filters.paymentMethod === option.value || (!filters.paymentMethod && !option.value) ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>{option.label}</button>)}</div></div><div className="grid grid-cols-2 gap-2"><label className="text-sm font-semibold text-gray-700">{t('reports.filters.fromHour')}<select value={filters.hourRange ? String(filters.hourRange.start) : ''} onChange={event => handleHourChange('start', event.target.value)} className="mt-2 min-h-touch-xs w-full rounded-xl border border-gray-200 bg-white px-3 font-normal"><option value="">{t('reports.filters.allHours')}</option>{hourOptions.map(hour => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}</select></label><label className="text-sm font-semibold text-gray-700">{t('reports.filters.toHour')}<select disabled={!filters.hourRange} value={filters.hourRange ? String(filters.hourRange.end) : ''} onChange={event => handleHourChange('end', event.target.value)} className="mt-2 min-h-touch-xs w-full rounded-xl border border-gray-200 bg-white px-3 font-normal disabled:bg-gray-100">{hourOptions.map(hour => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:59</option>)}</select></label></div><div className="grid grid-cols-[1fr_1.45fr] gap-3 border-t border-gray-100 pt-4"><button type="button" onClick={handleResetMobileFilters} className={sheetButtons ? sheetButtons.secondary : 'min-h-touch-xs rounded-xl border border-gray-300 font-semibold text-gray-700'}><RotateCcw className="mr-2 inline h-4 w-4" />Reset</button><button type="button" onClick={() => setShowMobileFilters(false)} className={sheetButtons ? sheetButtons.primary : 'min-h-touch-xs rounded-xl bg-green-600 px-4 font-semibold text-white shadow-sm'}>Apply filters</button></div></div></div>
                </div>}
            </div>
            <div className={`hidden space-y-6 md:block ${layoutClasses.contentInsetX}`}>
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">{t('reports.header.title')}</h1>
                    <p className="text-gray-600 mt-1">{t('reports.header.subtitle')}</p>
                </div>
                <div className="flex items-center space-x-3">
                    <AdminActionButton
                        variant="outline"
                        label={t('reports.header.filters')}
                        icon={Filter}
                        showChevron={true}
                        onClick={() => setShowFilters(!showFilters)}
                        className={toolbarBtn}
                    />
                    <AdminActionButton
                        variant="primary"
                        label={isExporting ? t('reports.header.exporting') : t('reports.header.exportExcel')}
                        icon={Download}
                        onClick={handleExportExcel}
                        disabled={isExporting}
                        isLoading={isExporting}
                        className={headerPrimaryBtn}
                    />
                </div>
            </div>

            {/* Filters Panel */}
            {showFilters && (
                <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('reports.filters.startDate')}</label>
                            <input
                                type="date"
                                value={filters.dateRange.start}
                                onChange={(e) => handleFilterChange('dateRange', { ...filters.dateRange, start: e.target.value })}
                                className="ds2-control-radius-lg box-border w-full border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('reports.filters.endDate')}</label>
                            <input
                                type="date"
                                value={filters.dateRange.end}
                                onChange={(e) => handleFilterChange('dateRange', { ...filters.dateRange, end: e.target.value })}
                                className="ds2-control-radius-lg box-border w-full border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('reports.filters.employee')}</label>
                            <select
                                value={filters.employeeId || ''}
                                onChange={(e) => handleFilterChange('employeeId', e.target.value || undefined)}
                                className="ds2-control-radius-lg box-border w-full border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">{t('reports.filters.allEmployees')}</option>
                                {employees.filter(emp => emp.is_active && !emp.deleted_at).map(employee => (
                                    <option key={employee.id} value={employee.id}>
                                        {employee.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('reports.filters.paymentMethod')}</label>
                            <select
                                value={filters.paymentMethod || ''}
                                onChange={(e) => handleFilterChange('paymentMethod', e.target.value || undefined)}
                                className="ds2-control-radius-lg box-border w-full border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">{t('reports.filters.allPaymentMethods')}</option>
                                <option value="cash">{t('reports.filters.cash')}</option>
                                <option value="card">{t('reports.filters.card')}</option>
                                <option value="mixed">{t('reports.filters.mixed')}</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('reports.filters.fromHour')}</label>
                            <select
                                value={filters.hourRange ? String(filters.hourRange.start) : ''}
                                onChange={(e) => handleHourChange('start', e.target.value)}
                                className="ds2-control-radius-lg box-border w-full border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">{t('reports.filters.allHours')}</option>
                                {hourOptions.map(hour => (
                                    <option key={hour} value={hour}>
                                        {String(hour).padStart(2, '0')}:00
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('reports.filters.toHour')}</label>
                            <select
                                value={filters.hourRange ? String(filters.hourRange.end) : ''}
                                onChange={(e) => handleHourChange('end', e.target.value)}
                                disabled={!filters.hourRange}
                                className="ds2-control-radius-lg box-border w-full border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
                            >
                                {hourOptions.map(hour => (
                                    <option key={hour} value={hour}>
                                        {String(hour).padStart(2, '0')}:59
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab Navigation */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-100">
                <div className="flex">
                    {tabs.map((tab) => (
                        <TabButton
                            key={tab.id}
                            variant="reports"
                            active={activeTab === tab.id}
                            label={tab.label}
                            icon={tab.icon}
                            onClick={() => setActiveTab(tab.id)}
                            className="flex-1"
                        />
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            <div className="space-y-6">
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <>
                        {/* Key Performance Metrics */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {/* Total Revenue */}
                            <div className="bg-white rounded-xl shadow-lg p-6 border border-blue-200">
                                <div className="flex items-center justify-between">
                                    <div className="bg-blue-500 p-3 rounded-full">
                                        <DollarSign className="w-6 h-6 text-white" />
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-medium text-blue-600">{t('reports.overview.totalRevenue')}</p>
                                        <p className="text-2xl font-bold text-blue-900">{formatCurrency(overviewMetrics.totalRevenue)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Total Transactions */}
                            <div className="bg-white rounded-xl shadow-lg p-6 border border-blue-200">
                                <div className="flex items-center justify-between">
                                    <div className="bg-blue-500 p-3 rounded-full">
                                        <BarChart3 className="w-6 h-6 text-white" />
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-medium text-blue-600">{t('reports.overview.transactions')}</p>
                                        <p className="text-2xl font-bold text-blue-900">{overviewMetrics.totalTransactions}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Total Items */}
                            <div className="bg-white rounded-xl shadow-lg p-6 border border-blue-200">
                                <div className="flex items-center justify-between">
                                    <div className="bg-blue-500 p-3 rounded-full">
                                        <ShoppingCart className="w-6 h-6 text-white" />
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-medium text-blue-600">{t('reports.overview.itemsSold')}</p>
                                        <p className="text-2xl font-bold text-blue-900">{overviewMetrics.totalItems}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Daily Average Revenue */}
                            <div className="bg-white rounded-xl shadow-lg p-6 border border-blue-200">
                                <div className="flex items-center justify-between">
                                    <div className="bg-blue-500 p-3 rounded-full">
                                        <TrendingUp className="w-6 h-6 text-white" />
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-medium text-blue-600">{t('reports.overview.dailyAvgRevenue')}</p>
                                        <p className="text-2xl font-bold text-blue-900">
                                            {formatCurrency(overviewMetrics.totalRevenue / (Math.ceil((new Date(filters.dateRange.end).getTime() - new Date(filters.dateRange.start).getTime()) / (1000 * 60 * 60 * 24)) + 1))}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Period Overview */}
                        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                            <div className="flex items-center mb-4">
                                <div className="bg-indigo-100 p-2 rounded-lg mr-3">
                                    <Calendar className="w-5 h-5 text-indigo-600" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-800">{t('reports.overview.periodOverview')}</h3>
                            </div>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                    <span className="text-gray-600 text-sm">{t('reports.overview.startDate')}</span>
                                    <span className="font-medium text-gray-900">{formatDate(filters.dateRange.start)}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                    <span className="text-gray-600 text-sm">{t('reports.overview.endDate')}</span>
                                    <span className="font-medium text-gray-900">{formatDate(filters.dateRange.end)}</span>
                                </div>
                                <div className="flex justify-between items-center py-2">
                                    <span className="text-gray-600 text-sm">{t('reports.overview.totalDays')}</span>
                                    <span className="font-medium text-gray-900">
                                        {Math.ceil((new Date(filters.dateRange.end).getTime() - new Date(filters.dateRange.start).getTime()) / (1000 * 60 * 60 * 24)) + 1} {t('reports.overview.days')}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* Employee Performance Tab */}
                {activeTab === 'employees' && (
                    <div className="bg-white rounded-xl shadow-lg border border-gray-100">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h2 className="text-xl font-semibold text-gray-800">{t('reports.employees.title')}</h2>
                            <p className="text-gray-600 text-sm mt-1">{t('reports.employees.subtitle')}</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('reports.employees.table.employee')}</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('reports.employees.table.totalSales')}</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('reports.employees.table.transactions')}</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('reports.employees.table.itemsSold')}</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {employeePerformance.map((employee, index) => (
                                        <tr key={employee.employeeId} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                                                        <span className="text-white text-sm font-bold">
                                                            {employee.employeeName.split(' ').map((n: string) => n[0]).join('')}
                                                        </span>
                                                    </div>
                                                    <div className="ml-4">
                                                        <div className="text-sm font-medium text-gray-900">{employee.employeeName}</div>
                                                        <div className="text-sm text-gray-500">#{index + 1} performer</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">{formatCurrency(employee.totalSales)}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-900">{employee.transactionCount}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-900">{employee.itemsSold}</div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Product Analysis Tab */}
                {activeTab === 'products' && (
                    <div className="bg-white rounded-xl shadow-lg border border-gray-100">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h2 className="text-xl font-semibold text-gray-800">{t('reports.products.title')}</h2>
                            <p className="text-gray-600 text-sm mt-1">{t('reports.products.subtitle')}</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('reports.products.table.product')}</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('reports.products.table.category')}</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('reports.products.table.quantitySold')}</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('reports.products.table.totalRevenue')}</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('reports.products.table.transactions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {productPerformance.map((product, index) => (
                                        <tr key={product.productId} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div>
                                                    <div className="text-sm font-medium text-gray-900">{product.productName}</div>
                                                    <div className="text-sm text-gray-500">#{index + 1} best seller</div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                    {product.categoryName}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">{product.quantitySold} {t('reports.products.table.units')}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">{formatCurrency(product.totalRevenue)}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-900">{product.transactionCount}</div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}



                {/* Inventory Report Tab */}
                {activeTab === 'inventory' && (
                    <div className="bg-white rounded-xl shadow-lg border border-gray-100">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h2 className="text-xl font-semibold text-gray-800">{t('reports.inventory.title')}</h2>
                            <p className="text-gray-600 text-sm mt-1">{t('reports.inventory.subtitle')}</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('reports.inventory.table.product')}</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('reports.inventory.table.currentStock')}</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('reports.inventory.table.minStock')}</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('reports.inventory.table.stockValue')}</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('reports.inventory.table.status')}</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('reports.inventory.table.actionRequired')}</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {products
                                        .filter(p => p.is_active && !p.deleted_at)
                                        .sort((a, b) => {
                                            // Priority sorting: Out of stock (0) > Low stock (1) > In stock (2)
                                            const getStockPriority = (product: typeof a) => {
                                                if (product.stock === 0) return 0; // Out of stock - highest priority
                                                if (product.stock <= product.min_stock) return 1; // Low stock - medium priority
                                                return 2; // In stock - lowest priority
                                            };

                                            const aPriority = getStockPriority(a);
                                            const bPriority = getStockPriority(b);

                                            // If same priority, sort alphabetically by name
                                            if (aPriority === bPriority) {
                                                return a.name.localeCompare(b.name);
                                            }

                                            return aPriority - bPriority;
                                        })
                                        .map((product) => {
                                            const stockValue = product.price * product.stock;
                                            const isLowStock = product.stock <= product.min_stock;
                                            const isOutOfStock = product.stock === 0;

                                            return (
                                                <tr key={product.id} className={`hover:bg-gray-50 ${isOutOfStock ? 'bg-red-50' : isLowStock ? 'bg-yellow-50' : ''}`}>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div>
                                                            <div className="text-sm font-medium text-gray-900">{product.name}</div>
                                                            <div className="text-sm text-gray-500">{product.sku}</div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className={`text-sm font-medium ${isOutOfStock ? 'text-red-600' : isLowStock ? 'text-yellow-600' : 'text-gray-900'}`}>
                                                            {product.stock} {t('reports.products.table.units')}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm text-gray-900">{product.min_stock} {t('reports.products.table.units')}</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm font-medium text-gray-900">{formatCurrency(stockValue)}</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        {isOutOfStock ? (
                                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                                                <AlertCircle className="w-3 h-3 mr-1" />
                                                                {t('products.status.outOfStock')}
                                                            </span>
                                                        ) : isLowStock ? (
                                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                                                <AlertCircle className="w-3 h-3 mr-1" />
                                                                {t('products.status.lowStock')}
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                                <CheckCircle className="w-3 h-3 mr-1" />
                                                                {t('products.status.inStock')}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        {isOutOfStock ? (
                                                            <span className="text-red-600 text-sm font-medium">{t('reports.inventory.table.urgentRestock')}</span>
                                                        ) : isLowStock ? (
                                                            <span className="text-yellow-600 text-sm font-medium">{t('reports.inventory.table.reorderSoon')}</span>
                                                        ) : (
                                                            <span className="text-green-600 text-sm">{t('reports.inventory.table.noAction')}</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
            </div>
        </div>
    );
};

export default ReportsInner;
