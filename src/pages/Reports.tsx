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

// Mock transaction data for reporting (in production this would come from a transactions context/API)
interface ReportTransaction {
    id: string;
    employeeId: string;
    employeeName: string;
    customerId?: string;
    customerName?: string;
    date: string;
    time: string;
    items: Array<{
        productId: string;
        productName: string;
        categoryId: string;
        categoryName: string;
        quantity: number;
        unitPrice: number;
        cost: number;
        total: number;
        profit: number;
    }>;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    paymentMethod: 'cash' | 'card' | 'mixed';
    status: 'completed' | 'refunded' | 'partial_refund';
}

// Mock transactions data - in production this would come from a service
const mockTransactions: ReportTransaction[] = [
    // Recent transactions (last 30 days)
    {
        id: 'txn-1',
        employeeId: 'EMP001',
        employeeName: 'Carlos Ferreira',
        customerId: 'cust-1',
        customerName: 'Maria Silva',
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 day ago
        time: '14:30',
        items: [
            {
                productId: 'prod-1',
                productName: 'Premium Coffee Beans',
                categoryId: 'cat-1',
                categoryName: 'Coffee',
                quantity: 2,
                unitPrice: 12.50,
                cost: 8.00,
                total: 25.00,
                profit: 9.00
            },
            {
                productId: 'prod-5',
                productName: 'Croissant',
                categoryId: 'cat-4',
                categoryName: 'Bakery',
                quantity: 1,
                unitPrice: 3.50,
                cost: 1.20,
                total: 3.50,
                profit: 2.30
            }
        ],
        subtotal: 28.50,
        discount: 1.43,
        tax: 6.20,
        total: 33.27,
        paymentMethod: 'card',
        status: 'completed'
    },
    {
        id: 'txn-2',
        employeeId: 'EMP002',
        employeeName: 'João Santos',
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 2 days ago
        time: '15:45',
        items: [
            {
                productId: 'prod-2',
                productName: 'Organic Milk',
                categoryId: 'cat-2',
                categoryName: 'Dairy',
                quantity: 3,
                unitPrice: 2.80,
                cost: 1.50,
                total: 8.40,
                profit: 3.90
            },
            {
                productId: 'prod-3',
                productName: 'Dark Chocolate',
                categoryId: 'cat-3',
                categoryName: 'Confectionery',
                quantity: 2,
                unitPrice: 6.90,
                cost: 4.20,
                total: 13.80,
                profit: 5.40
            }
        ],
        subtotal: 22.20,
        discount: 0,
        tax: 5.11,
        total: 27.31,
        paymentMethod: 'cash',
        status: 'completed'
    },
    {
        id: 'txn-3',
        employeeId: 'EMP003',
        employeeName: 'Maria Oliveira',
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 3 days ago
        time: '16:20',
        items: [
            {
                productId: 'prod-1',
                productName: 'Premium Coffee Beans',
                categoryId: 'cat-1',
                categoryName: 'Coffee',
                quantity: 1,
                unitPrice: 12.50,
                cost: 8.00,
                total: 12.50,
                profit: 4.50
            },
            {
                productId: 'prod-6',
                productName: 'Cheese',
                categoryId: 'cat-2',
                categoryName: 'Dairy',
                quantity: 1,
                unitPrice: 8.90,
                cost: 5.50,
                total: 8.90,
                profit: 3.40
            }
        ],
        subtotal: 21.40,
        discount: 0,
        tax: 4.92,
        total: 26.32,
        paymentMethod: 'card',
        status: 'completed'
    },
    {
        id: 'txn-4',
        employeeId: 'EMP001',
        employeeName: 'Carlos Ferreira',
        customerId: 'cust-2',
        customerName: 'João Costa',
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 5 days ago
        time: '10:15',
        items: [
            {
                productId: 'prod-7',
                productName: 'Espresso',
                categoryId: 'cat-1',
                categoryName: 'Coffee',
                quantity: 2,
                unitPrice: 1.50,
                cost: 0.30,
                total: 3.00,
                profit: 2.40
            },
            {
                productId: 'prod-8',
                productName: 'Muffin',
                categoryId: 'cat-4',
                categoryName: 'Bakery',
                quantity: 1,
                unitPrice: 4.20,
                cost: 1.80,
                total: 4.20,
                profit: 2.40
            }
        ],
        subtotal: 7.20,
        discount: 0.36,
        tax: 1.58,
        total: 8.42,
        paymentMethod: 'cash',
        status: 'completed'
    },
    {
        id: 'txn-5',
        employeeId: 'EMP002',
        employeeName: 'João Santos',
        date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days ago
        time: '13:25',
        items: [
            {
                productId: 'prod-3',
                productName: 'Dark Chocolate',
                categoryId: 'cat-3',
                categoryName: 'Confectionery',
                quantity: 3,
                unitPrice: 6.90,
                cost: 4.20,
                total: 20.70,
                profit: 8.10
            },
            {
                productId: 'prod-9',
                productName: 'Candy Bar',
                categoryId: 'cat-3',
                categoryName: 'Confectionery',
                quantity: 2,
                unitPrice: 2.50,
                cost: 1.00,
                total: 5.00,
                profit: 3.00
            }
        ],
        subtotal: 25.70,
        discount: 0,
        tax: 5.91,
        total: 31.61,
        paymentMethod: 'card',
        status: 'completed'
    },
    {
        id: 'txn-6',
        employeeId: 'EMP003',
        employeeName: 'Maria Oliveira',
        date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 10 days ago
        time: '17:40',
        items: [
            {
                productId: 'prod-2',
                productName: 'Organic Milk',
                categoryId: 'cat-2',
                categoryName: 'Dairy',
                quantity: 2,
                unitPrice: 2.80,
                cost: 1.50,
                total: 5.60,
                profit: 2.60
            },
            {
                productId: 'prod-10',
                productName: 'Yogurt',
                categoryId: 'cat-2',
                categoryName: 'Dairy',
                quantity: 3,
                unitPrice: 1.80,
                cost: 0.90,
                total: 5.40,
                profit: 2.70
            }
        ],
        subtotal: 11.00,
        discount: 0.55,
        tax: 2.40,
        total: 12.85,
        paymentMethod: 'cash',
        status: 'completed'
    },
    {
        id: 'txn-7',
        employeeId: 'EMP001',
        employeeName: 'Carlos Ferreira',
        date: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 12 days ago
        time: '11:30',
        items: [
            {
                productId: 'prod-1',
                productName: 'Premium Coffee Beans',
                categoryId: 'cat-1',
                categoryName: 'Coffee',
                quantity: 1,
                unitPrice: 12.50,
                cost: 8.00,
                total: 12.50,
                profit: 4.50
            },
            {
                productId: 'prod-11',
                productName: 'Sandwich',
                categoryId: 'cat-4',
                categoryName: 'Bakery',
                quantity: 1,
                unitPrice: 7.50,
                cost: 3.20,
                total: 7.50,
                profit: 4.30
            }
        ],
        subtotal: 20.00,
        discount: 2.00,
        tax: 4.14,
        total: 22.14,
        paymentMethod: 'mixed',
        status: 'completed'
    },
    {
        id: 'txn-8',
        employeeId: 'EMP002',
        employeeName: 'João Santos',
        customerId: 'cust-3',
        customerName: 'Ana Pereira',
        date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 15 days ago
        time: '14:15',
        items: [
            {
                productId: 'prod-7',
                productName: 'Espresso',
                categoryId: 'cat-1',
                categoryName: 'Coffee',
                quantity: 4,
                unitPrice: 1.50,
                cost: 0.30,
                total: 6.00,
                profit: 4.80
            },
            {
                productId: 'prod-12',
                productName: 'Cake Slice',
                categoryId: 'cat-4',
                categoryName: 'Bakery',
                quantity: 2,
                unitPrice: 5.80,
                cost: 2.50,
                total: 11.60,
                profit: 6.60
            }
        ],
        subtotal: 17.60,
        discount: 0,
        tax: 4.05,
        total: 21.65,
        paymentMethod: 'card',
        status: 'completed'
    },
    {
        id: 'txn-9',
        employeeId: 'EMP003',
        employeeName: 'Maria Oliveira',
        date: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 18 days ago
        time: '16:50',
        items: [
            {
                productId: 'prod-3',
                productName: 'Dark Chocolate',
                categoryId: 'cat-3',
                categoryName: 'Confectionery',
                quantity: 1,
                unitPrice: 6.90,
                cost: 4.20,
                total: 6.90,
                profit: 2.70
            },
            {
                productId: 'prod-13',
                productName: 'Gummy Bears',
                categoryId: 'cat-3',
                categoryName: 'Confectionery',
                quantity: 2,
                unitPrice: 3.20,
                cost: 1.50,
                total: 6.40,
                profit: 3.40
            }
        ],
        subtotal: 13.30,
        discount: 0,
        tax: 3.06,
        total: 16.36,
        paymentMethod: 'cash',
        status: 'completed'
    },
    {
        id: 'txn-10',
        employeeId: 'EMP001',
        employeeName: 'Carlos Ferreira',
        customerId: 'cust-4',
        customerName: 'Pedro Santos',
        date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 20 days ago
        time: '09:45',
        items: [
            {
                productId: 'prod-2',
                productName: 'Organic Milk',
                categoryId: 'cat-2',
                categoryName: 'Dairy',
                quantity: 1,
                unitPrice: 2.80,
                cost: 1.50,
                total: 2.80,
                profit: 1.30
            },
            {
                productId: 'prod-14',
                productName: 'Butter',
                categoryId: 'cat-2',
                categoryName: 'Dairy',
                quantity: 1,
                unitPrice: 4.50,
                cost: 2.80,
                total: 4.50,
                profit: 1.70
            },
            {
                productId: 'prod-5',
                productName: 'Croissant',
                categoryId: 'cat-4',
                categoryName: 'Bakery',
                quantity: 2,
                unitPrice: 3.50,
                cost: 1.20,
                total: 7.00,
                profit: 4.60
            }
        ],
        subtotal: 14.30,
        discount: 0.71,
        tax: 3.13,
        total: 16.72,
        paymentMethod: 'card',
        status: 'completed'
    },
    {
        id: 'txn-11',
        employeeId: 'EMP002',
        employeeName: 'João Santos',
        date: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 22 days ago
        time: '12:20',
        items: [
            {
                productId: 'prod-7',
                productName: 'Espresso',
                categoryId: 'cat-1',
                categoryName: 'Coffee',
                quantity: 3,
                unitPrice: 1.50,
                cost: 0.30,
                total: 4.50,
                profit: 3.60
            },
            {
                productId: 'prod-15',
                productName: 'Latte',
                categoryId: 'cat-1',
                categoryName: 'Coffee',
                quantity: 1,
                unitPrice: 3.80,
                cost: 1.20,
                total: 3.80,
                profit: 2.60
            }
        ],
        subtotal: 8.30,
        discount: 0,
        tax: 1.91,
        total: 10.21,
        paymentMethod: 'cash',
        status: 'completed'
    },
    {
        id: 'txn-12',
        employeeId: 'EMP003',
        employeeName: 'Maria Oliveira',
        customerId: 'cust-5',
        customerName: 'Carla Silva',
        date: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 25 days ago
        time: '15:35',
        items: [
            {
                productId: 'prod-8',
                productName: 'Muffin',
                categoryId: 'cat-4',
                categoryName: 'Bakery',
                quantity: 3,
                unitPrice: 4.20,
                cost: 1.80,
                total: 12.60,
                profit: 7.20
            },
            {
                productId: 'prod-16',
                productName: 'Cookies',
                categoryId: 'cat-3',
                categoryName: 'Confectionery',
                quantity: 1,
                unitPrice: 5.50,
                cost: 2.20,
                total: 5.50,
                profit: 3.30
            }
        ],
        subtotal: 18.10,
        discount: 1.81,
        tax: 3.75,
        total: 20.04,
        paymentMethod: 'card',
        status: 'completed'
    }
];

interface DateRange {
    start: string;
    end: string;
}

interface ReportFilters {
    dateRange: DateRange;
    employeeId?: string;
    categoryId?: string;
    paymentMethod?: string;
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

    // Filter transactions based on current filters
    const filteredTransactions = useMemo(() => {
        return mockTransactions.filter(transaction => {
            const transactionDate = transaction.date;
            const matchesDateRange = transactionDate >= filters.dateRange.start && transactionDate <= filters.dateRange.end;
            const matchesEmployee = !filters.employeeId || transaction.employeeId === filters.employeeId;
            const matchesPayment = !filters.paymentMethod || transaction.paymentMethod === filters.paymentMethod;
            const matchesCategory = !filters.categoryId || transaction.items.some(item => item.categoryId === filters.categoryId);

            return matchesDateRange && matchesEmployee && matchesPayment && matchesCategory && transaction.status === 'completed';
        });
    }, [filters]);

    // Calculate overview metrics
    const overviewMetrics = useMemo(() => {
        const totalRevenue = filteredTransactions.reduce((sum, t) => sum + t.total, 0);
        const totalTransactions = filteredTransactions.length;
        const totalItems = filteredTransactions.reduce((sum, t) =>
            sum + t.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
        );
        const avgTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

        return {
            totalRevenue,
            totalTransactions,
            totalItems,
            avgTransaction
        };
    }, [filteredTransactions]);

    // Calculate employee performance
    const employeePerformance = useMemo(() => {
        const performanceMap = new Map();

        filteredTransactions.forEach(transaction => {
            const existing = performanceMap.get(transaction.employeeId) || {
                employeeId: transaction.employeeId,
                employeeName: transaction.employeeName,
                totalSales: 0,
                transactionCount: 0,
                itemsSold: 0
            };

            existing.totalSales += transaction.total;
            existing.transactionCount += 1;
            existing.itemsSold += transaction.items.reduce((sum, item) => sum + item.quantity, 0);

            performanceMap.set(transaction.employeeId, existing);
        });

        return Array.from(performanceMap.values()).sort((a, b) => b.totalSales - a.totalSales);
    }, [filteredTransactions]);

    // Calculate product performance
    const productPerformance = useMemo(() => {
        const productMap = new Map();

        filteredTransactions.forEach(transaction => {
            transaction.items.forEach(item => {
                const existing = productMap.get(item.productId) || {
                    productId: item.productId,
                    productName: item.productName,
                    categoryName: item.categoryName,
                    quantitySold: 0,
                    totalRevenue: 0,
                    transactionCount: 0
                };

                existing.quantitySold += item.quantity;
                existing.totalRevenue += item.total;
                existing.transactionCount += 1;

                productMap.set(item.productId, existing);
            });
        });

        return Array.from(productMap.values()).sort((a, b) => b.quantitySold - a.quantitySold);
    }, [filteredTransactions]);



    // Handle filter changes
    const handleFilterChange = (key: keyof ReportFilters, value: any) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    // Handle export to Excel
    const handleExportExcel = async () => {
        setIsExporting(true);
        try {
            // In production, this would call an API to generate Excel file
            await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate export

            // Create CSV content for demonstration
            const csvContent = generateCSVReport();
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
        } finally {
            setIsExporting(false);
        }
    };

    // Generate CSV report content
    const generateCSVReport = () => {
        const headers = [
            'Date', 'Time', 'Employee', 'Customer', 'Product', 'Category',
            'Quantity', 'Unit Price', 'Total', 'Payment Method'
        ];

        const rows = filteredTransactions.flatMap(transaction =>
            transaction.items.map(item => [
                transaction.date,
                transaction.time,
                transaction.employeeName,
                transaction.customerName || 'N/A',
                item.productName,
                item.categoryName,
                item.quantity,
                `€${item.unitPrice.toFixed(2)}`,
                `€${item.total.toFixed(2)}`,
                transaction.paymentMethod
            ])
        );

        return [headers, ...rows].map(row => row.join(',')).join('\n');
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