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
    Loader2
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
import {
    useDesignSystem2Customization,
} from '../contexts/DesignSystem2CustomizationContext';
import '../styles/design-system-2-scope.css';

// Note: Mock data has been replaced with real database integration
// The transaction data now comes from the reportingService

interface DateRange {
    start: string;
    end: string;
}

const ReportsInner: React.FC = () => {
    const { t } = useTranslation();
    const { language } = useLanguage();
    const { visualStyle, prefs, layoutClasses } = useDesignSystem2Customization();
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
    const handleFilterChange = (key: keyof ReportFilters, value: any) => {
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
        return new Intl.NumberFormat(language?.startsWith('pt') ? 'pt-PT' : 'en-US', {
            style: 'currency',
            currency: 'EUR'
        }).format(amount);
    };

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString(language?.startsWith('pt') ? 'pt-PT' : 'en-US');
    };

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
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="ds2-control-radius-lg mt-4 bg-red-500 px-4 py-2 font-medium text-white transition-colors hover:bg-red-600"
                    >
                        {t('reports.error.retry')}
                    </button>
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
            <div className={`space-y-6 ${layoutClasses.contentInsetX}`}>
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