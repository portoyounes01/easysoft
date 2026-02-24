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
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { useSettings } from '../contexts/SettingsContext';
import ReceiptDialog from '../components/ReceiptDialog';
import type { ReceiptProps } from '../components/ThermalReceipt';
import { AdminActionButton } from '../components/ui/AdminActionButton';
import { TableActionButton } from '../components/ui/TableActionButton';

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
    const { t } = useTranslation();
    const { language } = useLanguage();
    const { settings } = useSettings();
    const [showReceiptPreview, setShowReceiptPreview] = useState(false);
    const [receiptPreviewData, setReceiptPreviewData] = useState<ReceiptProps | null>(null);
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
                console.log('Transactions: Fetching transactions...');
                const data = await transactionService.getTransactions();

                // Transform database data to UI format
                const transformedTransactions: Transaction[] = data.map((dbTransaction: any) => {
                    const items = (dbTransaction.transaction_items || []).map((it: any) => ({
                        id: it.id,
                        name: it.product_name,
                        quantity: it.quantity,
                        price: it.unit_price,
                        total: it.line_total
                    }));

                    console.log(`Transactions: Transaction ${dbTransaction.transaction_number} has ${items.length} items`);

                    return {
                        id: dbTransaction.id,
                        transactionNumber: dbTransaction.transaction_number,
                        date: dbTransaction.transaction_date,
                        time: dbTransaction.transaction_time,
                        customerName: dbTransaction.customer_name,
                        customerNif: dbTransaction.customer_id, // Using customer_id as NIF for now
                        items: items,
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
                    };
                });

                console.log(`Transactions: Loaded ${transformedTransactions.length} transactions`);
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

    // Refresh transactions function
    const refreshTransactions = async () => {
        try {
            setLoading(true);
            setError(null);
            console.log('Transactions: Refreshing transactions...');
            const data = await transactionService.getTransactions();

            const transformedTransactions: Transaction[] = data.map((dbTransaction: any) => {
                const items = (dbTransaction.transaction_items || []).map((it: any) => ({
                    id: it.id,
                    name: it.product_name,
                    quantity: it.quantity,
                    price: it.unit_price,
                    total: it.line_total
                }));

                console.log(`Transactions: Transaction ${dbTransaction.transaction_number} has ${items.length} items (refresh)`);

                return {
                    id: dbTransaction.id,
                    transactionNumber: dbTransaction.transaction_number,
                    date: dbTransaction.transaction_date,
                    time: dbTransaction.transaction_time,
                    customerName: dbTransaction.customer_name,
                    customerNif: dbTransaction.customer_id,
                    items: items,
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
                };
            });

            console.log(`Transactions: Refreshed ${transformedTransactions.length} transactions`);
            setTransactions(transformedTransactions);
        } catch (err) {
            console.error('Error refreshing transactions:', err);
            setError('Failed to refresh transactions. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Filter transactions
    const filteredTransactions = transactions.filter(transaction => {
        const matchesSearch =
            transaction.transactionNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            transaction.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            transaction.customerNif?.includes(searchTerm) ||
            transaction.employeeName.toLowerCase().includes(searchTerm.toLowerCase());

        // Reference language to trigger re-render on language change (i18n formatting)
        void language;
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

    const handleViewReceipt = async (id: string) => {
        try {
            const trx = await transactionService.getTransactionById(id);
            if (!trx) return;

            const date = new Date(`${trx.transaction_date}T${trx.transaction_time}`);
            // Infer percentage discount for historical transactions
            // Priority 1: If items carry a uniform non-zero discount_percentage, use it
            // Priority 2: Otherwise, infer from header (discount/subtotal) ONLY when it matches a common percentage
            const inferredDiscountPct = (() => {
                const pcts = (trx.transaction_items || [])
                    .map((it: any) => Number(it.discount_percentage || 0))
                    .filter((p: number) => p > 0);
                if (pcts.length > 0) {
                    const first = Math.round(pcts[0]);
                    const allSame = pcts.every((p: number) => Math.abs(p - first) < 0.01);
                    if (allSame) return first;
                }

                // Header inference guarded by whitelist to avoid misclassifying fixed discounts
                const commonPercents = [5, 10, 12, 15, 20, 25, 30, 40, 50];
                const ratio = trx.subtotal > 0 ? (trx.discount / trx.subtotal) * 100 : 0;
                const nearest = Math.round(ratio);
                const withinTolerance = Math.abs(ratio - nearest) < 0.05; // 0.05pp tolerance
                if (withinTolerance && commonPercents.includes(nearest)) {
                    return nearest;
                }
                return 0;
            })();

            const headerDiscountPct = Number(trx.discount_percentage || 0);
            const headerDiscountType = (trx.discount_type || 'none') as 'none' | 'percentage' | 'fixed';

            const receipt: ReceiptProps = {
                documentNumber: trx.receipt_number || trx.transaction_number,
                documentType: settings.receipt.defaultDocumentType,
                date,
                counter: settings.receipt.counterLabel,
                verificationCode: `${settings.receipt.atcudPrefix}-${trx.receipt_number || trx.transaction_number}`,
                company: {
                    name: settings.company.name,
                    address: settings.company.address,
                    postalCode: settings.company.postalCode,
                    city: settings.company.city,
                    taxNumber: settings.company.taxNumber,
                    phone: settings.company.phone || undefined,
                    email: settings.company.email || undefined,
                },
                customer: trx.customer_id ? {
                    name: trx.customer_name || undefined,
                    taxNumber: trx.customers?.tax_id || undefined
                } : undefined,
                items: (trx.transaction_items || []).map((it: any) => ({
                    id: it.id,
                    description: it.product_name,
                    quantity: it.quantity,
                    unitPrice: it.unit_price,
                    vatRate: Math.round(((it.iva_rate || 0) as number) * 100),
                    total: it.line_total,
                })),
                totals: {
                    subtotal: trx.subtotal,
                    discount: trx.discount,
                    discountPercentage: headerDiscountType === 'percentage' && headerDiscountPct > 0 ? Math.round(headerDiscountPct) : inferredDiscountPct,
                    net: trx.total - trx.tax,
                    vat: trx.tax,
                    total: trx.total,
                },
                payment: {
                    method: trx.payment_method === 'cash' ? 'Numerário' : 'Multibanco',
                    amountGiven: trx.amount_paid || trx.total,
                    change: trx.change_given || 0,
                },
                slogan: settings.company.slogan || undefined,
                softwareInfo: settings.company.softwareInfo || undefined,
                certificationNumber: settings.company.certificationNumber || undefined,
            };

            setReceiptPreviewData(receipt);
            setShowReceiptPreview(true);
        } catch (e) {
            console.error('Failed to build receipt preview:', e);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">{t('transactions.header.title')}</h1>
                    <p className="text-gray-600 mt-1">{t('transactions.header.subtitle')}</p>
                </div>
                <div className="mt-4 sm:mt-0 flex items-center space-x-3">
                    <AdminActionButton
                        variant="primary"
                        label={t('transactions.header.export')}
                        icon={Download}
                    />
                </div>
            </div>

            {/* Loading State */}
            {loading && (
                <div className="flex justify-center items-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="ml-3 text-gray-600">{t('transactions.loading')}</span>
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
                            <h3 className="text-sm font-medium text-red-800">{t('transactions.error.title')}</h3>
                            <p className="text-sm text-red-700 mt-1">{error}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Summary Stats */}
            {!loading && !error && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">{t('transactions.summary.totalTransactions')}</p>
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
                                <p className="text-sm font-medium text-gray-600">{t('transactions.summary.totalRevenue')}</p>
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
                                <p className="text-sm font-medium text-gray-600">{t('transactions.summary.averageTransaction')}</p>
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
                                <p className="text-sm font-medium text-gray-600">{t('transactions.summary.completed')}</p>
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
                                placeholder={t('transactions.filters.searchPlaceholder')}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <AdminActionButton
                            variant="outline"
                            label={t('transactions.filters.filters')}
                            icon={Filter}
                            showChevron={true}
                            onClick={() => setShowFilters(!showFilters)}
                        >
                            {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </AdminActionButton>
                        <AdminActionButton
                            variant="outline"
                            label="Refresh"
                            icon={Receipt}
                            onClick={refreshTransactions}
                            disabled={loading}
                            title="Refresh transactions"
                        />
                    </div>
                </div>

                {showFilters && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('transactions.filters.date')}</label>
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('transactions.filters.status')}</label>
                                <select
                                    value={selectedStatus}
                                    onChange={(e) => setSelectedStatus(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="all">{t('transactions.filters.allStatus')}</option>
                                    <option value="completed">{t('transactions.filters.completed')}</option>
                                    <option value="refunded">{t('transactions.filters.refunded')}</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('transactions.filters.paymentMethod')}</label>
                                <select
                                    value={selectedPaymentMethod}
                                    onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="all">{t('transactions.filters.allMethods')}</option>
                                    <option value="cash">{t('transactions.filters.cash')}</option>
                                    <option value="card">{t('transactions.filters.card')}</option>
                                    <option value="mixed">{t('transactions.filters.mixed')}</option>
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
                        <h2 className="text-lg font-semibold text-gray-900">{t('transactions.list.recentTransactions')}</h2>
                    </div>

                    {filteredTransactions.length === 0 ? (
                        <div className="text-center py-12">
                            <Receipt className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <p className="text-xl text-gray-50 mb-2">{t('transactions.list.emptyTitle')}</p>
                            <p className="text-gray-400">{t('transactions.list.emptyMessage')}</p>
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
                                                        <span>{formatDate(transaction.date)} {t('transactions.list.dateAt')} {transaction.time}</span>
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
                                                <p className="text-sm text-gray-50">{transaction.items.length} {transaction.items.length !== 1 ? t('transactions.list.itemPlural') : t('transactions.list.itemSingular')}</p>
                                            </div>
                                            <button
                                                onClick={() => setExpandedTransaction(
                                                    expandedTransaction === transaction.id ? null : transaction.id
                                                )}
                                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                                                aria-label={expandedTransaction === transaction.id ? 'Collapse transaction details' : 'Expand transaction details'}
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
                                                    <h4 className="font-medium text-gray-900 mb-3">{t('transactions.list.itemsHeader')}</h4>
                                                    <div className="space-y-2">
                                                        {transaction.items.map((item, index) => (
                                                            <div key={index} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg">
                                                                <div>
                                                                    <p className="font-medium text-gray-900">{item.name}</p>
                                                                    <p className="text-sm text-gray-50">{t('transactions.list.qty')}: {item.quantity} × {formatCurrency(item.price)}</p>
                                                                </div>
                                                                <p className="font-medium text-gray-900">{formatCurrency(item.total)}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Payment Details */}
                                                <div>
                                                    <h4 className="font-medium text-gray-900 mb-3">{t('transactions.list.paymentDetails')}</h4>
                                                    <div className="space-y-2">
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-600">{t('transactions.list.subtotal')}</span>
                                                            <span className="text-gray-900">{formatCurrency(transaction.subtotal)}</span>
                                                        </div>
                                                        {transaction.discount > 0 && (
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-600">{t('transactions.list.discount')}</span>
                                                                <span className="text-green-600">-{formatCurrency(transaction.discount)}</span>
                                                            </div>
                                                        )}
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-600">{t('transactions.list.tax')}</span>
                                                            <span className="text-gray-900">{formatCurrency(transaction.tax)}</span>
                                                        </div>
                                                        <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                                                            <span>{t('transactions.list.total')}</span>
                                                            <span>{formatCurrency(transaction.total)}</span>
                                                        </div>

                                                        {transaction.paymentMethod === 'cash' && transaction.cashReceived && (
                                                            <div className="mt-4 pt-4 border-t border-gray-200">
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-600">{t('transactions.list.cashReceived')}</span>
                                                                    <span className="text-gray-900">{formatCurrency(transaction.cashReceived)}</span>
                                                                </div>
                                                                {transaction.changeGiven && (
                                                                    <div className="flex justify-between">
                                                                        <span className="text-gray-600">{t('transactions.list.changeGiven')}</span>
                                                                        <span className="text-gray-900">{formatCurrency(transaction.changeGiven)}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end space-x-3">
                                                <AdminActionButton
                                                    variant="outline"
                                                    label={t('transactions.list.viewReceipt')}
                                                    icon={Eye}
                                                    onClick={() => handleViewReceipt(transaction.id)}
                                                />
                                                <AdminActionButton
                                                    variant="ghost"
                                                    label={t('transactions.list.download')}
                                                    icon={Download}
                                                    className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {showReceiptPreview && receiptPreviewData && (
                <ReceiptDialog
                    open={showReceiptPreview}
                    onClose={() => setShowReceiptPreview(false)}
                    receipt={receiptPreviewData}
                />
            )}
        </div>
    );
};

export default Transactions;