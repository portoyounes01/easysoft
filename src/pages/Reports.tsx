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
    Search,
    ChevronDown,
    ChevronUp,
    Eye,
    FileSpreadsheet,
    Clock,
    Percent,
    ShoppingCart,
    ArrowUpRight,
    ArrowDownRight,
    Minus,
    AlertCircle,
    CheckCircle,
    Loader2
} from 'lucide-react';
import { useEmployees } from '../contexts/EmployeesContext';
import { useProducts } from '../contexts/ProductsContext';
import { useTranslation } from 'react-i18next';
import { reportingService } from '../services/transactionService';
import {
    ReportTransaction,
    ReportFilters,
    EmployeePerformance,
    ProductPerformance,
    OverviewMetrics
} from '../types/supabase';

// Note: Mock data has been replaced with real database integration
// The transaction data now comes from the reportingService

interface DateRange {
    start: string;
    end: string;
}

const Reports: React.FC = () => {
    const { t } = useTranslation();
    const { employees } = useEmployees();
    const { products, categories } = useProducts();

    const [activeTab, setActiveTab] = useState('overview');
    const [filters, setFilters] = useState<ReportFilters>({
        dateRange: {
            start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
            end: new Date().toISOString().split('T')[0] // today
        }
    });
    const [showFilters, setShowFilters] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [reportData, setReportData] = useState<{
        transactions: ReportTransaction[];
        employeePerformance: EmployeePerformance[];
        productPerformance: ProductPerformance[];
        overviewMetrics: OverviewMetrics;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Load report data when filters change
    useEffect(() => {
        const loadReportData = async () => {
            try {
                setIsLoading(true);
                setError(null);

                const data = await reportingService.getReportData(filters);
                setReportData(data);
            } catch (err) {
                console.error('Error loading report data:', err);
                setError(err instanceof Error ? err.message : 'Failed to load report data');
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

    // Handle export to Excel
    const handleExportExcel = async () => {
        if (!reportData) return;

        setIsExporting(true);
        try {
            // Generate CSV content using the reporting service
            const csvContent = reportingService.generateCSVReport(filteredTransactions);
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
        return new Intl.NumberFormat('pt-PT', {
            style: 'currency',
            currency: 'EUR'
        }).format(amount);
    };

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString('pt-PT');
    };

    const tabs = [
        { id: 'overview', label: 'Overview', icon: BarChart3 },
        { id: 'employees', label: 'Employee Performance', icon: Users },
        { id: 'products', label: 'Product Analysis', icon: Package },
        { id: 'inventory', label: 'Inventory Report', icon: ShoppingCart }
    ];

    // Show loading state
    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">Advanced Reports</h1>
                        <p className="text-gray-600 mt-1">Comprehensive business analytics and insights</p>
                    </div>
                </div>
                <div className="flex items-center justify-center h-64">
                    <div className="flex items-center space-x-2">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                        <span className="text-gray-600">Loading report data...</span>
                    </div>
                </div>
            </div>
        );
    }

    // Show error state
    if (error) {
        return (
            <div className="space-y-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">Advanced Reports</h1>
                        <p className="text-gray-600 mt-1">Comprehensive business analytics and insights</p>
                    </div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                    <div className="flex items-center space-x-2">
                        <AlertCircle className="w-5 h-5 text-red-500" />
                        <h3 className="text-red-800 font-medium">Error Loading Report Data</h3>
                    </div>
                    <p className="text-red-700 mt-2">{error}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-4 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Advanced Reports</h1>
                    <p className="text-gray-600 mt-1">Comprehensive business analytics and insights</p>
                </div>
                <div className="flex items-center space-x-3">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center space-x-2"
                    >
                        <Filter className="w-4 h-4" />
                        <span>Filters</span>
                        {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={handleExportExcel}
                        disabled={isExporting}
                        className="bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center space-x-2"
                    >
                        {isExporting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Exporting...</span>
                            </>
                        ) : (
                            <>
                                <Download className="w-4 h-4" />
                                <span>Export Excel</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Filters Panel */}
            {showFilters && (
                <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                            <input
                                type="date"
                                value={filters.dateRange.start}
                                onChange={(e) => handleFilterChange('dateRange', { ...filters.dateRange, start: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                            <input
                                type="date"
                                value={filters.dateRange.end}
                                onChange={(e) => handleFilterChange('dateRange', { ...filters.dateRange, end: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Employee</label>
                            <select
                                value={filters.employeeId || ''}
                                onChange={(e) => handleFilterChange('employeeId', e.target.value || undefined)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">All Employees</option>
                                {employees.filter(emp => emp.is_active && !emp.deleted_at).map(employee => (
                                    <option key={employee.id} value={employee.id}>
                                        {employee.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
                            <select
                                value={filters.paymentMethod || ''}
                                onChange={(e) => handleFilterChange('paymentMethod', e.target.value || undefined)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">All Payment Methods</option>
                                <option value="cash">Cash</option>
                                <option value="card">Card</option>
                                <option value="mixed">Mixed</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab Navigation */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-100">
                <div className="flex overflow-x-auto">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center space-x-2 px-6 py-4 font-medium text-sm whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.id
                                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                                    : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                                    }`}
                            >
                                <Icon className="w-4 h-4" />
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Tab Content */}
            <div className="space-y-6">
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <>
                        {/* Key Metrics */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                                        <p className="text-3xl font-bold text-gray-900">{formatCurrency(overviewMetrics.totalRevenue)}</p>
                                        <p className="text-sm text-green-600 mt-1">
                                            <ArrowUpRight className="w-4 h-4 inline mr-1" />
                                            {formatDate(filters.dateRange.start)} - {formatDate(filters.dateRange.end)}
                                        </p>
                                    </div>
                                    <div className="bg-green-100 p-3 rounded-full">
                                        <DollarSign className="w-8 h-8 text-green-600" />
                                    </div>
                                </div>
                            </div>



                            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-gray-600">Transactions</p>
                                        <p className="text-3xl font-bold text-gray-900">{overviewMetrics.totalTransactions}</p>
                                        <p className="text-sm text-purple-600 mt-1">
                                            <ShoppingCart className="w-4 h-4 inline mr-1" />
                                            {formatCurrency(overviewMetrics.avgTransaction)} avg
                                        </p>
                                    </div>
                                    <div className="bg-purple-100 p-3 rounded-full">
                                        <BarChart3 className="w-8 h-8 text-purple-600" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Summary Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                                <h3 className="text-lg font-semibold text-gray-800 mb-4">Sales Summary</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Total Items Sold:</span>
                                        <span className="font-semibold">{overviewMetrics.totalItems}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Average Transaction:</span>
                                        <span className="font-semibold">{formatCurrency(overviewMetrics.avgTransaction)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Total Transactions:</span>
                                        <span className="font-semibold">{overviewMetrics.totalTransactions}</span>
                                    </div>

                                </div>
                            </div>

                            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                                <h3 className="text-lg font-semibold text-gray-800 mb-4">Period Overview</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Start Date:</span>
                                        <span className="font-semibold">{formatDate(filters.dateRange.start)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">End Date:</span>
                                        <span className="font-semibold">{formatDate(filters.dateRange.end)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Days in Period:</span>
                                        <span className="font-semibold">
                                            {Math.ceil((new Date(filters.dateRange.end).getTime() - new Date(filters.dateRange.start).getTime()) / (1000 * 60 * 60 * 24)) + 1}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Daily Average:</span>
                                        <span className="font-semibold">
                                            {formatCurrency(overviewMetrics.totalRevenue / (Math.ceil((new Date(filters.dateRange.end).getTime() - new Date(filters.dateRange.start).getTime()) / (1000 * 60 * 60 * 24)) + 1))}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* Employee Performance Tab */}
                {activeTab === 'employees' && (
                    <div className="bg-white rounded-xl shadow-lg border border-gray-100">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h2 className="text-xl font-semibold text-gray-800">Employee Performance Report</h2>
                            <p className="text-gray-600 text-sm mt-1">Individual employee sales and performance metrics</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Sales</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Transactions</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items Sold</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg. Transaction</th>
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
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-900">
                                                    {formatCurrency(employee.totalSales / employee.transactionCount)}
                                                </div>
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
                            <h2 className="text-xl font-semibold text-gray-800">Product Sales Analysis</h2>
                            <p className="text-gray-600 text-sm mt-1">Detailed product performance with quantities and revenue</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity Sold</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Revenue</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Transactions</th>
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
                                                <div className="text-sm font-medium text-gray-900">{product.quantitySold} units</div>
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
                            <h2 className="text-xl font-semibold text-gray-800">Inventory Status Report</h2>
                            <p className="text-gray-600 text-sm mt-1">Current stock levels and inventory analysis - prioritized by urgency</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Stock</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Min Stock</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Value</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action Required</th>
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
                                                            {product.stock} units
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm text-gray-900">{product.min_stock} units</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm font-medium text-gray-900">{formatCurrency(stockValue)}</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        {isOutOfStock ? (
                                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                                                <AlertCircle className="w-3 h-3 mr-1" />
                                                                Out of Stock
                                                            </span>
                                                        ) : isLowStock ? (
                                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                                                <AlertCircle className="w-3 h-3 mr-1" />
                                                                Low Stock
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                                <CheckCircle className="w-3 h-3 mr-1" />
                                                                In Stock
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        {isOutOfStock ? (
                                                            <span className="text-red-600 text-sm font-medium">Urgent Restock</span>
                                                        ) : isLowStock ? (
                                                            <span className="text-yellow-600 text-sm font-medium">Reorder Soon</span>
                                                        ) : (
                                                            <span className="text-green-600 text-sm">No Action Needed</span>
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
    );
};

export default Reports; 