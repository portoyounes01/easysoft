import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ReceiptProps } from './ThermalReceipt';

interface ReceiptHistorySelectorProps {
    open: boolean;
    receipts: ReceiptProps[];
    onSelect: (receipt: ReceiptProps) => void;
    onClose: () => void;
}

const ReceiptHistorySelector: React.FC<ReceiptHistorySelectorProps> = ({ open, receipts, onSelect, onClose }) => {
    const { t } = useTranslation();
    if (!open) return null;

    const formatCurrency = (amount: number): string => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(amount);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-3xl p-6 w-[640px] max-w-[95vw] shadow-2xl max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-2xl font-bold text-gray-800">{t('pos.receiptHistory.title') || 'Select Receipt'}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors min-h-[44px]">✕</button>
                </div>

                {receipts.length === 0 ? (
                    <div className="text-center text-gray-500 py-12">{t('pos.receiptHistory.empty') || 'No receipts yet'}</div>
                ) : (
                    <div className="flex-1 overflow-y-auto -mx-2 px-2">
                        <ul className="divide-y divide-gray-200">
                            {receipts.map((r, idx) => (
                                <li key={(r as any).id || r.documentNumber || idx}>
                                    <button
                                        onClick={() => onSelect(r)}
                                        className="w-full text-left py-4 px-3 hover:bg-gray-50 rounded-xl transition-colors flex items-center justify-between"
                                        style={{ minHeight: 60 }}
                                    >
                                        <div>
                                            <div className="font-semibold text-gray-900">{r.documentNumber}</div>
                                            <div className="text-sm text-gray-600">{r.date.toLocaleDateString('pt-PT')} {r.date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-gray-900 font-semibold">{formatCurrency(r.totals.total)}</div>
                                            {r.customer?.name && <div className="text-sm text-gray-500 truncate max-w-[220px]">{r.customer.name}</div>}
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="mt-4 flex justify-end">
                    <button
                        onClick={onClose}
                        className="min-h-[60px] px-6 rounded-2xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium transition-colors"
                    >
                        {t('common.close') || 'Close'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default React.memo(ReceiptHistorySelector);


