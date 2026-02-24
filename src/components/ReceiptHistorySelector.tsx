import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ReceiptProps } from './ThermalReceipt';
import { BaseDialog } from './ui/BaseDialog';
import { ActionButton } from './ui/ActionButton';

interface ReceiptHistorySelectorProps {
    open: boolean;
    receipts: ReceiptProps[];
    onSelect: (receipt: ReceiptProps) => void;
    onClose: () => void;
}

const ReceiptHistorySelector: React.FC<ReceiptHistorySelectorProps> = ({ open, receipts, onSelect, onClose }) => {
    const { t } = useTranslation();

    const formatCurrency = (amount: number): string => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(amount);

    return (
        <BaseDialog
            open={open}
            onClose={onClose}
            title={t('pos.receiptHistory.title') || 'Select Receipt'}
            width="40vw"
            height="64vh"
            className="max-w-[95vw]"
        >
            <div className="flex-1 flex flex-col" style={{ padding: '2vh' }}>
                {receipts.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-gray-50 py-12">
                        {t('pos.receiptHistory.empty') || 'No receipts yet'}
                    </div>
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
                                            {r.customer?.name && <div className="text-sm text-gray-50 truncate max-w-[220px]">{r.customer.name}</div>}
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* <div className="mt-4 flex justify-end">
                    <ActionButton
                        onClick={onClose}
                        label={t('common.close') || 'Close'}
                        variant="secondary"
                        className="min-h-[60px] px-6"
                    />
                </div> */}
            </div>
        </BaseDialog>
    );
};

export default React.memo(ReceiptHistorySelector);


