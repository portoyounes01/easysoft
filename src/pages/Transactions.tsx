import React, { useState, useEffect } from 'react';
import {
    Search,
    Filter,
    Calendar,
    User,
    CreditCard,
    Banknote,
    Receipt,
    Eye,
    Download,
    ChevronDown,
    ChevronUp,
    CheckCircle,
    TrendingUp,
    DollarSign,
    ShoppingCart,
    Users
} from 'lucide-react';
import { transactionService } from '../services/transactionService';

interface Transaction {
    id: string;
    transactionNumber: string;
    date: string;
    time: string;
    customerName?: string;
    customerNif?: string;
    items: Array<{
        id: string;
        name: string;
        quantity: number;
        price: number;
        total: number;
    }>;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    paymentMethod: 'cash' | 'card' | 'mixed';
    cashReceived?: number;
    changeGiven?: number;
    status: 'completed' | 'refunded';
    employeeName: string;
    employeeId: string;
}

const Transactions: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDate, setSelectedDate] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('all');
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('all');
    const [expandedTransaction, setExpandedTransaction] = useState<string | null>(null);
    const [showFilters, setShowFilters] = useState(false);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch transactions from database
    useEffect(() => {
        const fetchTransactions = async () => {
            try {
                setLoading(true);
                setError(null);
                const data = await transactionService.getTransactions();

                // Transform database data to UI format
                const transformedTransactions: Transaction[] = data.map((dbTransaction: any) => ({
                    id: dbTransaction.id,
                    transactionNumber: dbTransaction.transaction_number,
                    date: dbTransaction.transaction_date,
                    time: dbTransaction.transaction_time,
                    customerName: dbTransaction.customer_name,
                    customerNif: dbTransaction.customer_id, // Using customer_id as NIF for now
                    items: dbTransaction.items || [],
                    subtotal: dbTransaction.subtotal,
                    discount: dbTransaction.discount,
                    tax: dbTransaction.tax,
                    total: dbTransaction.total,
                    paymentMethod: dbTransaction.payment_method,
                    cashReceived: dbTransaction.amount_paid,
                    changeGiven: dbTransaction.change_given,
                    status: dbTransaction.status,
                    employeeName: dbTransaction.employee_name,
                    employeeId: dbTransaction.employee_id
                }));

                setTransactions(transformedTransactions);
            } catch (err) {
                console.error('Error fetching transactions:', err);
                setError('Failed to load transactions. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        fetchTransactions();
    }, []);

    // Filter transactions
    const filteredTransactions = transactions.filter(transaction => {
        const matchesSearch =
            transaction.transactionNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            transaction.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            transaction.customerNif?.includes(searchTerm) ||
            transaction.employeeName.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesDate = !selectedDate || transaction.date === selectedDate;
        const matchesStatus = selectedStatus === 'all' || transaction.status === selectedStatus;
        const matchesPayment = selectedPaymentMethod === 'all' || transaction.paymentMethod === selectedPaymentMethod;

        return matchesSearch && matchesDate && matchesStatus && matchesPayment;
    });

    // Calculate summary statistics
    const totalTransactions = filteredTransactions.length;
    const totalRevenue = filteredTransactions.reduce((sum, t) => sum + t.total, 0);
    const averageTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
    const completedTransactions = filteredTransactions.filter(t => t.status === 'completed').length;

    const getStatusBadge = (status: string) => {
        const baseClasses = "px-2 py-1 rounded-full text-xs font-medium";
        switch (status) {
            case 'completed':
                return `${baseClasses} bg-green-100 text-green-800`;
            case 'refunded':
                return `${baseClasses} bg-red-100 text-red-800`;
            default:
                return `${baseClasses} bg-gray-100 text-gray-800`;
        }
    };

    const getPaymentMethodIcon = (method: string) => {
        switch (method) {
            case 'cash':
                return <Banknote className="w-4 h-4 text-green-600" />;
            case 'card':
                return <CreditCard className="w-4 h-4 text-blue-600" />;
            case 'mixed':
                return <DollarSign className="w-4 h-4 text-purple-600" />;
            default:
                return <DollarSign className="w-4 h-4 text-gray-600" />;
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('pt-PT', {
            style: 'currency',
            currency: 'EUR'
        }).format(amount);
    };

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString('pt-PT', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
                    <p className="text-gray-600 mt-1">View and manage sales transactions</p>
                </div>
                <div className="mt-4 sm:mt-0 flex items-center space-x-3">
                    <button className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center space-x-2">
                        <Download className="w-4 h-4" />
                        <span>Export</span>
                    </button>
                </div>
            </div>

            {/* Loading State */}
            {loading && (
                <div className="flex justify-center items-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="ml-3 text-gray-600">Loading transactions...</span>
                </div>
            )}

            {/* Error State */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center">
                        <div className="text-red-600 mr-3">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-red-800">Error loading transactions</h3>
                            <p className="text-sm text-red-700 mt-1">{error}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Summary Stats */}
            {!loading && !error && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Total Transactions</p>
                                <p className="text-2xl font-bold text-gray-900">{totalTransactions}</p>
                            </div>
                            <div className="bg-blue-100 p-3 rounded-full">
                                <Receipt className="w-6 h-6 text-blue-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                                <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</p>
                            </div>
                            <div className="bg-green-100 p-3 rounded-full">
                                <TrendingUp className="w-6 h-6 text-green-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Average Transaction</p>
                                <p className="text-2xl font-bold text-gray-900">{formatCurrency(averageTransaction)}</p>
                            </div>
                            <div className="bg-purple-100 p-3 rounded-full">
                                <ShoppingCart className="w-6 h-6 text-purple-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Completed</p>
                                <p className="text-2xl font-bold text-gray-900">{completedTransactions}</p>
                            </div>
                            <div className="bg-green-100 p-3 rounded-full">
                                <CheckCircle className="w-6 h-6 text-green-600" />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex flex-1 items-center space-x-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search transactions..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            <Filter className="w-4 h-4" />
                            <span>Filters</span>
                            {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {showFilters && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                                <select
                                    value={selectedStatus}
                                    onChange={(e) => setSelectedStatus(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="all">All Status</option>
                                    <option value="completed">Completed</option>
                                    <option value="refunded">Refunded</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
                                <select
                                    value={selectedPaymentMethod}
                                    onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="all">All Methods</option>
                                    <option value="cash">Cash</option>
                                    <option value="card">Card</option>
                                    <option value="mixed">Mixed</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Transaction List */}
            {!loading && !error && (
                <div className="bg-white rounded-xl shadow-lg border border-gray-100">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <h2 className="text-lg font-semibold text-gray-900">Recent Transactions</h2>
                    </div>

                    {filteredTransactions.length === 0 ? (
                        <div className="text-center py-12">
                            <Receipt className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <p className="text-xl text-gray-500 mb-2">No transactions found</p>
                            <p className="text-gray-400">Try adjusting your search or filters</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-200">
                            {filteredTransactions.map((transaction) => (
                                <div key={transaction.id} className="px-6 py-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-4">
                                            <div className="bg-gray-100 p-2 rounded-lg">
                                                {getPaymentMethodIcon(transaction.paymentMethod)}
                                            </div>
                                            <div>
                                                <div className="flex items-center space-x-2">
                                                    <h3 className="font-semibold text-gray-900">{transaction.transactionNumber}</h3>
                                                    <span className={getStatusBadge(transaction.status)}>
                                                        {transaction.status.replace('_', ' ')}
                                                    </span>
                                                </div>
                                                <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                                                    <span className="flex items-center space-x-1">
                                                        <Calendar className="w-3 h-3" />
                                                        <span>{formatDate(transaction.date)} at {transaction.time}</span>
                                                    </span>
                                                    {transaction.customerName && (
                                                        <span className="flex items-center space-x-1">
                                                            <User className="w-3 h-3" />
                                                            <span>{transaction.customerName}</span>
                                                        </span>
                                                    )}
                                                    <span className="flex items-center space-x-1">
                                                        <Users className="w-3 h-3" />
                                                        <span>{transaction.employeeName}</span>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center space-x-4">
                                            <div className="text-right">
                                                <p className="text-lg font-bold text-gray-900">{formatCurrency(transaction.total)}</p>
                                                <p className="text-sm text-gray-500">{transaction.items.length} item{transaction.items.length !== 1 ? 's' : ''}</p>
                                            </div>
                                            <button
                                                onClick={() => setExpandedTransaction(
                                                    expandedTransaction === transaction.id ? null : transaction.id
                                                )}
                                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                                            >
                                                {expandedTransaction === transaction.id ? (
                                                    <ChevronUp className="w-5 h-5" />
                                                ) : (
                                                    <ChevronDown className="w-5 h-5" />
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded Transaction Details */}
                                    {expandedTransaction === transaction.id && (
                                        <div className="mt-4 pt-4 border-t border-gray-200">
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                {/* Items */}
                                                <div>
                                                    <h4 className="font-medium text-gray-900 mb-3">Items</h4>
                                                    <div className="space-y-2">
                                                        {transaction.items.map((item, index) => (
                                                            <div key={index} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg">
                                                                <div>
                                                                    <p className="font-medium text-gray-900">{item.name}</p>
                                                                    <p className="text-sm text-gray-500">Qty: {item.quantity} × {formatCurrency(item.price)}</p>
                                                                </div>
                                                                <p className="font-medium text-gray-900">{formatCurrency(item.total)}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Payment Details */}
                                                <div>
                                                    <h4 className="font-medium text-gray-900 mb-3">Payment Details</h4>
                                                    <div className="space-y-2">
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-600">Subtotal:</span>
                                                            <span className="text-gray-900">{formatCurrency(transaction.subtotal)}</span>
                                                        </div>
                                                        {transaction.discount > 0 && (
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-600">Discount:</span>
                                                                <span className="text-green-600">-{formatCurrency(transaction.discount)}</span>
                                                            </div>
                                                        )}
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-600">Tax:</span>
                                                            <span className="text-gray-900">{formatCurrency(transaction.tax)}</span>
                                                        </div>
                                                        <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                                                            <span>Total:</span>
                                                            <span>{formatCurrency(transaction.total)}</span>
                                                        </div>

                                                        {transaction.paymentMethod === 'cash' && transaction.cashReceived && (
                                                            <div className="mt-4 pt-4 border-t border-gray-200">
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-600">Cash Received:</span>
                                                                    <span className="text-gray-900">{formatCurrency(transaction.cashReceived)}</span>
                                                                </div>
                                                                {transaction.changeGiven && (
                                                                    <div className="flex justify-between">
                                                                        <span className="text-gray-600">Change Given:</span>
                                                                        <span className="text-gray-900">{formatCurrency(transaction.changeGiven)}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end space-x-3">
                                                <button className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors flex items-center space-x-2">
                                                    <Eye className="w-4 h-4" />
                                                    <span>View Receipt</span>
                                                </button>
                                                <button className="px-4 py-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors flex items-center space-x-2">
                                                    <Download className="w-4 h-4" />
                                                    <span>Download</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Transactions;