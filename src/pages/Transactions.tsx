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
    Users,
    FileMinus,
    Printer,
} from 'lucide-react';
import { transactionService } from '../services/transactionService';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { useSettings } from '../contexts/SettingsContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import ReceiptDialog from '../components/ReceiptDialog';
import type { ReceiptProps } from '../components/ThermalReceipt';
import { AdminActionButton } from '../components/ui/AdminActionButton';
import { customerLocalService, initializeLocalDatabase, transactionLocalService } from '../lib/localDatabase';
import { generateQRCodeImage } from '../utils/qrCode';
import type { FiscalTransactionMetadata } from '../fiscal/types';
import { isSupabaseConfigured } from '../lib/supabase';
import { runFiscalCreditNoteForTransaction } from '../fiscal/creditNoteCheckout';
import { parseCreditNoteNotesFields } from '../fiscal/creditNoteNotes';
import { runFiscalReciboForTransaction } from '../fiscal/reciboCheckout';
import { saftTypeToReceiptDocumentType } from '../fiscal/saleDocumentType';

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
    /** True when local Dexie has a non-NC fiscal document for this sale (AT credit note allowed). */
    canIssueCreditNote?: boolean;
    /** FT/FS sale without NC/recibo yet — emit standalone RG (table 4.4). */
    canIssueRecibo?: boolean;
    /** Local fiscal id when present. */
    fiscalDocumentId?: string;
}

async function buildTransactionViewModel(dbTransaction: Record<string, unknown>): Promise<Transaction> {
    const tid = String(dbTransaction.id);
    const rawItems = (dbTransaction.transaction_items as Record<string, unknown>[] | undefined) ?? [];
    const items = rawItems.map(it => ({
        id: String(it.id),
        name: String(it.product_name),
        quantity: Number(it.quantity),
        price: Number(it.unit_price),
        total: Number(it.line_total),
    }));
    const txNum = String(dbTransaction.transaction_number ?? '');
    const local = await transactionLocalService.getTransactionById(tid);
    let customerNif: string | undefined;
    if (local?.customer_id) {
        const cust = await customerLocalService.getCustomerById(local.customer_id);
        customerNif = cust?.tax_number?.trim() || undefined;
    }

    let canIssueCreditNote = false;
    let canIssueRecibo = false;
    let fiscalDocumentId: string | undefined;

    const salesTypes = new Set(['FT', 'FS', 'FR']);

    // Any completed fiscal sale: expose fiscal id for receipt / segunda via (incl. NC and negative totals).
    if (local?.fiscal_document_id && local.status === 'completed' && local.deleted_at == null) {
        const fiscal = await transactionLocalService.getFiscalDocumentById(local.fiscal_document_id);
        if (fiscal) {
            fiscalDocumentId = local.fiscal_document_id;
        }
        if (
            fiscal &&
            Number(local.total) > 0 &&
            !txNum.trim().toUpperCase().startsWith('NC ') &&
            !txNum.trim().toUpperCase().startsWith('RG ')
        ) {
            const hasNc = await transactionLocalService.hasCreditNoteForOriginalTransaction(tid);
            const hasRec = await transactionLocalService.hasReciboForOriginalTransaction(tid);
            if (salesTypes.has(fiscal.invoice_type) && !fiscal.cancelled_at && !hasNc && !hasRec) {
                canIssueCreditNote = true;
            }
            if (
                (fiscal.invoice_type === 'FT' || fiscal.invoice_type === 'FS') &&
                !fiscal.cancelled_at &&
                !hasNc &&
                !hasRec
            ) {
                canIssueRecibo = true;
            }
        }
    }
    return {
        id: tid,
        transactionNumber: txNum,
        date: String(dbTransaction.transaction_date ?? ''),
        time: String(dbTransaction.transaction_time ?? ''),
        customerName: dbTransaction.customer_name ? String(dbTransaction.customer_name) : undefined,
        customerNif,
        items,
        subtotal: Number(dbTransaction.subtotal ?? 0),
        discount: Number(dbTransaction.discount ?? 0),
        tax: Number(dbTransaction.tax ?? 0),
        total: Number(dbTransaction.total ?? 0),
        paymentMethod: dbTransaction.payment_method as Transaction['paymentMethod'],
        cashReceived: dbTransaction.amount_paid != null ? Number(dbTransaction.amount_paid) : undefined,
        changeGiven: dbTransaction.change_given != null ? Number(dbTransaction.change_given) : undefined,
        status: dbTransaction.status as Transaction['status'],
        employeeName: String(dbTransaction.employee_name ?? ''),
        employeeId: String(dbTransaction.employee_id ?? ''),
        canIssueCreditNote,
        canIssueRecibo,
        fiscalDocumentId,
    };
}

const Transactions: React.FC = () => {
    const { t } = useTranslation();
    const { language } = useLanguage();
    const { settings } = useSettings();
    const { employee } = useSupabaseAuth();
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
    const [creditNoteBusyId, setCreditNoteBusyId] = useState<string | null>(null);
    const [reciboBusyId, setReciboBusyId] = useState<string | null>(null);

    const loadTransactions = async () => {
        try {
            setLoading(true);
            setError(null);
            await initializeLocalDatabase();

            let rows: Record<string, unknown>[] = [];
            if (isSupabaseConfigured()) {
                try {
                    rows = (await transactionService.getTransactions()) as Record<string, unknown>[];
                } catch (remoteErr) {
                    console.warn('Transactions: remote fetch failed, falling back to local', remoteErr);
                }
            }

            // Include any local transactions not yet on the server (e.g. nota de crédito, offline sales)
            // so the list matches Dexie/audit; remote alone can omit recent local-only rows.
            const serverIds = new Set(rows.map(r => String((r as { id?: string }).id)));
            const activeLocal = (await transactionLocalService.getAllTransactions()).filter(
                t => t.deleted_at == null
            );
            const onlyOnDevice = activeLocal.filter(t => !serverIds.has(t.id));
            if (onlyOnDevice.length > 0) {
                const withItems = (
                    await Promise.all(onlyOnDevice.map(t => transactionLocalService.getTransactionById(t.id)))
                ).filter((x): x is NonNullable<typeof x> => Boolean(x));
                for (const l of withItems) {
                    rows.push({ ...l, transaction_items: l.items } as Record<string, unknown>);
                }
            }

            const transformed = await Promise.all(rows.map(r => buildTransactionViewModel(r)));
            transformed.sort((a, b) => {
                const ta = new Date(`${a.date}T${a.time}`).getTime();
                const tb = new Date(`${b.date}T${b.time}`).getTime();
                return tb - ta;
            });
            setTransactions(transformed);
        } catch (err) {
            console.error('Error loading transactions:', err);
            setError(t('transactions.error.message'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadTransactions();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
    }, []);

    const handleIssueRecibo = async (tx: Transaction) => {
        if (!employee) {
            window.alert(t('transactions.recibo.needEmployee'));
            return;
        }
        if (
            !window.confirm(t('transactions.recibo.confirm', { number: tx.transactionNumber }))
        ) {
            return;
        }
        try {
            setReciboBusyId(tx.id);
            const pm =
                tx.paymentMethod === 'card' || tx.paymentMethod === 'mixed'
                    ? tx.paymentMethod
                    : 'cash';
            const result = await runFiscalReciboForTransaction({
                settings,
                originalTransactionId: tx.id,
                payment: {
                    paymentMethod: pm,
                    employeeId: employee.id,
                    employeeName: employee.name,
                    employeeNumber: employee.employee_number,
                },
            });
            window.alert(t('transactions.recibo.success', { invoiceNo: result.invoiceNo }));
            await loadTransactions();
        } catch (e) {
            console.error(e);
            const msg = e instanceof Error ? e.message : '';
            window.alert(msg ? `${t('transactions.recibo.error')} ${msg}` : t('transactions.recibo.error'));
        } finally {
            setReciboBusyId(null);
        }
    };

    const handleIssueCreditNote = async (tx: Transaction) => {
        if (!employee) {
            window.alert(t('transactions.creditNote.needEmployee'));
            return;
        }
        if (
            !window.confirm(
                t('transactions.creditNote.confirm', { number: tx.transactionNumber })
            )
        ) {
            return;
        }
        const reason = window.prompt(t('transactions.creditNote.reasonPrompt'), '');
        if (reason === null) {
            return;
        }
        try {
            setCreditNoteBusyId(tx.id);
            const pm =
                tx.paymentMethod === 'card' || tx.paymentMethod === 'mixed'
                    ? tx.paymentMethod
                    : 'cash';
            const result = await runFiscalCreditNoteForTransaction({
                settings,
                originalTransactionId: tx.id,
                creditReason: reason.trim() || undefined,
                payment: {
                    paymentMethod: pm,
                    employeeId: employee.id,
                    employeeName: employee.name,
                    employeeNumber: employee.employee_number,
                },
            });
            window.alert(t('transactions.creditNote.success', { invoiceNo: result.invoiceNo }));
            await loadTransactions();
        } catch (e) {
            console.error(e);
            const msg = e instanceof Error ? e.message : '';
            window.alert(msg ? `${t('transactions.creditNote.error')} ${msg}` : t('transactions.creditNote.error'));
        } finally {
            setCreditNoteBusyId(null);
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

    const buildReceiptPropsForTransaction = async (
        txId: string,
        documentLabel?: string
    ): Promise<ReceiptProps | null> => {
        const trx = await transactionLocalService.getTransactionById(txId);
        const itemsSource = trx?.items;
        const remoteTrx = trx ? null : await transactionService.getTransactionById(txId);
        const rawItems = itemsSource ?? remoteTrx?.transaction_items ?? [];
        if (!trx && !remoteTrx) return null;

        const header = trx ?? remoteTrx!;
        const date = new Date(`${header.transaction_date}T${header.transaction_time}`);

        const inferredDiscountPct = (() => {
            const pcts = (rawItems as { discount_percentage?: number }[])
                .map(it => Number(it.discount_percentage || 0))
                .filter(p => p > 0);
            if (pcts.length > 0) {
                const first = Math.round(pcts[0]);
                const allSame = pcts.every(p => Math.abs(p - first) < 0.01);
                if (allSame) return first;
            }
            const commonPercents = [5, 10, 12, 15, 20, 25, 30, 40, 50];
            const ratio = header.subtotal > 0 ? (header.discount / header.subtotal) * 100 : 0;
            const nearest = Math.round(ratio);
            const withinTolerance = Math.abs(ratio - nearest) < 0.05;
            if (withinTolerance && commonPercents.includes(nearest)) {
                return nearest;
            }
            return 0;
        })();

        const headerDiscountPct = Number(header.discount_percentage || 0);
        const headerDiscountType = (header.discount_type || 'none') as 'none' | 'percentage' | 'fixed';

        let meta: FiscalTransactionMetadata | null = null;
        if (trx?.fiscal_metadata_json) {
            try {
                meta = JSON.parse(trx.fiscal_metadata_json) as FiscalTransactionMetadata;
            } catch {
                meta = null;
            }
        }

        const fiscal = trx?.fiscal_document_id
            ? await transactionLocalService.getFiscalDocumentById(trx.fiscal_document_id)
            : undefined;

        const verificationCode = fiscal?.atcud_body ?? meta?.atcudBody ?? header.receipt_number ?? header.transaction_number;
        const qrPayload = fiscal?.qr_payload ?? meta?.qrPayload;
        const qrCodeImage = qrPayload ? await generateQRCodeImage(qrPayload) : undefined;

        const customerRow = header.customer_id
            ? await customerLocalService.getCustomerById(header.customer_id)
            : undefined;
        const customerTax = customerRow?.tax_number?.trim() || undefined;

        const documentType: ReceiptProps['documentType'] = fiscal?.invoice_type
            ? saftTypeToReceiptDocumentType(fiscal.invoice_type)
            : settings.receipt.defaultDocumentType === 'FATURA'
                ? 'FATURA'
                : 'FATURA_SIMPLIFICADA';

        const creditNoteDisplay =
            documentType === 'NOTA_CREDITO'
                ? parseCreditNoteNotesFields(
                      header.notes,
                      fiscal?.settled_invoice_no ?? null
                  )
                : null;

        const receipt: ReceiptProps = {
            documentNumber: fiscal?.invoice_no ?? header.receipt_number ?? header.transaction_number,
            documentType,
            date,
            counter: settings.receipt.counterLabel,
            verificationCode,
            documentHash: fiscal?.hash_base64 ?? undefined,
            hashFourChars: fiscal?.hash_four_chars ?? meta?.hashFourChars,
            qrCodeData: qrPayload ?? undefined,
            qrCodeImage,
            trainingMode: settings.fiscal.trainingMode,
            documentLabel,
            emitterName: header.employee_name,
            company: {
                name: settings.company.name,
                address: settings.company.address,
                postalCode: settings.company.postalCode,
                city: settings.company.city,
                taxNumber: settings.company.taxNumber,
                phone: settings.company.phone || undefined,
                email: settings.company.email || undefined,
            },
            customer: header.customer_id
                ? (() => {
                    const morada = [
                        customerRow?.address?.trim(),
                        [customerRow?.postal_code?.trim(), customerRow?.city?.trim()]
                            .filter(Boolean)
                            .join(' '),
                    ]
                        .filter(Boolean)
                        .join(', ');
                    return {
                        name: (customerRow?.name || header.customer_name || undefined) as
                            | string
                            | undefined,
                        taxNumber: customerTax,
                        address: morada || undefined,
                    };
                })()
                : undefined,
            items: rawItems.map((it: { id: string; product_name: string; quantity: number; unit_price: number; iva_rate?: number; line_total: number }) => ({
                id: it.id,
                description: it.product_name,
                quantity: it.quantity,
                unitPrice: it.unit_price,
                vatRate: Math.round(((it.iva_rate || 0) as number) * 100),
                total: it.line_total,
            })),
            totals: {
                subtotal: header.subtotal,
                discount: header.discount,
                discountPercentage:
                    headerDiscountType === 'percentage' && headerDiscountPct > 0
                        ? Math.round(headerDiscountPct)
                        : inferredDiscountPct,
                net: header.total - header.tax,
                vat: header.tax,
                total: header.total,
            },
            payment: {
                method:
                    header.payment_method === 'cash'
                        ? t('transactions.receipt.paymentCash')
                        : header.payment_method === 'card'
                            ? t('transactions.receipt.paymentCard')
                            : t('transactions.receipt.paymentMixed'),
                amountGiven: header.amount_paid ?? header.total,
                change: header.change_given || 0,
            },
            slogan: settings.company.slogan || undefined,
            softwareInfo: settings.company.softwareInfo || undefined,
            certificationNumber: settings.company.certificationNumber || undefined,
            ...(documentType === 'NOTA_CREDITO' && creditNoteDisplay
                ? {
                      originalInvoice: creditNoteDisplay.originalRef,
                      creditReason: creditNoteDisplay.reason,
                  }
                : {}),
        };

        return receipt;
    };

    const handleViewReceipt = async (id: string) => {
        try {
            const receipt = await buildReceiptPropsForTransaction(id, undefined);
            if (receipt) {
                setReceiptPreviewData(receipt);
                setShowReceiptPreview(true);
            }
        } catch (e) {
            console.error('Failed to build receipt preview:', e);
        }
    };

    const handleSegundaVia = async (id: string) => {
        if (!employee) {
            window.alert(t('transactions.creditNote.needEmployee'));
            return;
        }
        try {
            const receipt = await buildReceiptPropsForTransaction(id, t('transactions.receipt.secondCopy'));
            if (!receipt) return;
            await transactionLocalService.appendFiscalAuditEvent({
                event_type: 'REPRINT_REQUESTED',
                payload_json: JSON.stringify({ transactionId: id, documentNumber: receipt.documentNumber }),
                employee_id: employee.id,
            });
            setReceiptPreviewData(receipt);
            setShowReceiptPreview(true);
        } catch (e) {
            console.error(e);
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
                            onClick={() => void loadTransactions()}
                            disabled={loading}
                            title={t('transactions.refreshTooltip')}
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
                            <p className="text-xl text-gray-500 mb-2">{t('transactions.list.emptyTitle')}</p>
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
                                                <div className="flex items-center space-x-2 flex-wrap gap-1">
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
                                                <p className="text-sm text-gray-500">{transaction.items.length} {transaction.items.length !== 1 ? t('transactions.list.itemPlural') : t('transactions.list.itemSingular')}</p>
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
                                                                    <p className="text-sm text-gray-500">{t('transactions.list.qty')}: {item.quantity} × {formatCurrency(item.price)}</p>
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

                                            <div className="mt-4 pt-4 border-t border-gray-200 flex flex-col sm:flex-row sm:flex-wrap justify-end gap-3">
                                                <AdminActionButton
                                                    variant="outline"
                                                    label={t('transactions.list.viewReceipt')}
                                                    icon={Eye}
                                                    onClick={() => void handleViewReceipt(transaction.id)}
                                                />
                                                {transaction.fiscalDocumentId && (
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleSegundaVia(transaction.id)}
                                                        disabled={creditNoteBusyId !== null || reciboBusyId !== null}
                                                        className="inline-flex items-center justify-center gap-2 min-h-[60px] px-6 rounded-2xl font-semibold text-xl text-white bg-blue-500 hover:bg-blue-600 transition-colors duration-200 disabled:opacity-50"
                                                    >
                                                        <Printer className="w-6 h-6 shrink-0" />
                                                        Segunda via
                                                    </button>
                                                )}
                                                {transaction.canIssueRecibo && (
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleIssueRecibo(transaction)}
                                                        disabled={creditNoteBusyId !== null || reciboBusyId !== null}
                                                        className="inline-flex items-center justify-center gap-2 min-h-[60px] px-6 rounded-2xl font-semibold text-xl text-white bg-emerald-500 hover:bg-emerald-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <Receipt className="w-6 h-6 shrink-0" />
                                                        {reciboBusyId === transaction.id
                                                            ? t('transactions.recibo.issuing')
                                                            : t('transactions.list.issueRecibo')}
                                                    </button>
                                                )}
                                                {transaction.canIssueCreditNote && (
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleIssueCreditNote(transaction)}
                                                        disabled={creditNoteBusyId !== null || reciboBusyId !== null}
                                                        className="inline-flex items-center justify-center gap-2 min-h-[60px] px-6 rounded-2xl font-semibold text-xl text-white bg-orange-500 hover:bg-orange-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <FileMinus className="w-6 h-6 shrink-0" />
                                                        {creditNoteBusyId === transaction.id
                                                            ? t('transactions.creditNote.issuing')
                                                            : t('transactions.list.issueCreditNote')}
                                                    </button>
                                                )}
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