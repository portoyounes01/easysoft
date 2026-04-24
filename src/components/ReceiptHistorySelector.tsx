import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import type { ReceiptProps } from './ThermalReceipt';
import { BaseDialog } from './ui/BaseDialog';
import { InputField } from './ui/InputField';

interface ReceiptHistorySelectorProps {
    open: boolean;
    receipts: ReceiptProps[];
    onSelect: (receipt: ReceiptProps) => void;
    onClose: () => void;
}

function receiptMatchesSearch(receipt: ReceiptProps, rawTerm: string): boolean {
    const term = rawTerm.trim().toLowerCase();
    if (term.length === 0) return true;

    if (receipt.documentNumber.toLowerCase().includes(term)) return true;

    const customer = receipt.customer;
    if (customer?.name?.toLowerCase().includes(term)) return true;
    if (customer?.taxNumber?.toLowerCase().includes(term)) return true;

    const dateStr =
        receipt.date.toLocaleDateString('pt-PT') +
        ' ' +
        receipt.date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    if (dateStr.toLowerCase().includes(term)) return true;

    const totalDot = receipt.totals.total.toFixed(2);
    const totalComma = totalDot.replace('.', ',');
    if (totalDot.includes(term) || totalComma.includes(term)) return true;

    return false;
}

const ReceiptHistorySelector: React.FC<ReceiptHistorySelectorProps> = ({ open, receipts, onSelect, onClose }) => {
    const { t } = useTranslation();
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (open) {
            setSearchTerm('');
        }
    }, [open]);

    const filteredReceipts = useMemo(() => {
        return receipts.filter((r) => receiptMatchesSearch(r, searchTerm));
    }, [receipts, searchTerm]);

    const formatCurrency = (amount: number): string =>
        new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(amount);

    return (
        <BaseDialog
            open={open}
            onClose={onClose}
            title={t('pos.receiptHistory.title')}
            width="40vw"
            height="64vh"
            className="max-w-[95vw]"
        >
            <div className="flex-1 flex flex-col min-h-0" style={{ padding: '2vh' }}>
                {receipts.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-gray-500 py-12">
                        {t('pos.receiptHistory.empty')}
                    </div>
                ) : (
                    <>
                        <div className="shrink-0 mb-3">
                            <InputField
                                icon={Search}
                                placeholder={t('pos.receiptHistory.searchPlaceholder')}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="rounded-2xl"
                            />
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto -mx-2 px-2">
                            {filteredReceipts.length > 0 ? (
                                <ul className="divide-y divide-gray-200">
                                    {filteredReceipts.map((r, idx) => (
                                        <li key={`${r.documentNumber}-${r.date.toISOString()}-${idx}`}>
                                            <button
                                                type="button"
                                                onClick={() => onSelect(r)}
                                                className="w-full text-left py-4 px-3 hover:bg-gray-50 rounded-xl transition-colors flex items-center justify-between"
                                                style={{ minHeight: 60 }}
                                            >
                                                <div>
                                                    <div className="font-semibold text-gray-900">{r.documentNumber}</div>
                                                    <div className="text-sm text-gray-600">
                                                        {r.date.toLocaleDateString('pt-PT')}{' '}
                                                        {r.date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-gray-900 font-semibold">{formatCurrency(r.totals.total)}</div>
                                                    {r.customer?.name && (
                                                        <div className="text-sm text-gray-500 truncate max-w-[220px]">
                                                            {r.customer.name}
                                                        </div>
                                                    )}
                                                </div>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-12 px-4 text-center text-gray-500">
                                    <p className="text-lg font-semibold text-gray-700 mb-1">{t('pos.receiptHistory.noMatchesTitle')}</p>
                                    <p className="text-sm">{t('pos.receiptHistory.noMatchesMessage')}</p>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </BaseDialog>
    );
};

export default React.memo(ReceiptHistorySelector);
