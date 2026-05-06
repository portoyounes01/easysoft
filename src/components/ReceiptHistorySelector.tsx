import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Search } from 'lucide-react';
import type { ReceiptProps } from './ThermalReceipt';
import { BaseDialog } from './ui/BaseDialog';
import { InputField } from './ui/InputField';
import SimpleNumpad from './SimpleNumpad';

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
    const searchInputRef = useRef<HTMLInputElement>(null);

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
            width="55vw"
            height="80vh"
            className="max-w-[95vw]"
        >
            <div className="flex flex-col h-full min-h-0">
                {receipts.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-gray-500 px-6 py-12 text-xl">
                        {t('pos.receiptHistory.empty')}
                    </div>
                ) : (
                    <div className="flex-1 flex space-x-6 px-6 pb-6 pt-6 overflow-hidden min-h-0">
                        <div className="flex-1 flex flex-col min-w-0">
                            <div className="mb-4 pt-1">
                                <InputField
                                    ref={searchInputRef}
                                    icon={Search}
                                    placeholder={t('pos.receiptHistory.searchPlaceholder')}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="rounded-2xl"
                                />
                            </div>
                            <div className="flex-1 min-h-0 py-1">
                                <SimpleNumpad
                                    value={searchTerm}
                                    onChange={setSearchTerm}
                                    onButtonClick={() => searchInputRef.current?.focus()}
                                    className="h-full"
                                />
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                            {filteredReceipts.length > 0 ? (
                                <div className="flex-1 overflow-y-auto">
                                    <ul className="divide-y divide-gray-200">
                                        {filteredReceipts.map((r, index) => (
                                            <li key={`${r.documentNumber}-${r.date.toISOString()}-${index}`}>
                                                <button
                                                    type="button"
                                                    onClick={() => onSelect(r)}
                                                    className="w-full text-left transition-colors hover:bg-blue-50 rounded-xl"
                                                    style={{
                                                        paddingTop: index === 0 ? '2vh' : '1.5vh',
                                                        paddingBottom: '1vh',
                                                        paddingLeft: '0.5rem',
                                                        paddingRight: '0.5rem',
                                                    }}
                                                >
                                                    <div className="flex items-center justify-between px-2">
                                                        <p
                                                            className="font-semibold text-gray-900 truncate"
                                                            style={{ fontSize: '1.7vh', paddingRight: '1vh' }}
                                                        >
                                                            {r.documentNumber}
                                                        </p>
                                                        <p className="font-semibold text-gray-900 shrink-0" style={{ fontSize: '1.5vh' }}>
                                                            {formatCurrency(r.totals.total)}
                                                        </p>
                                                    </div>
                                                    <div
                                                        className="flex items-center space-x-3 text-gray-500 px-2"
                                                        style={{
                                                            marginTop: index === 0 ? '0.2vh' : '0.8vh',
                                                            paddingLeft: '1vh',
                                                        }}
                                                    >
                                                        <span className="font-medium truncate" style={{ fontSize: '1.3vh' }}>
                                                            {r.date.toLocaleDateString('pt-PT')}{' '}
                                                            {r.date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                        {r.customer?.name && (
                                                            <>
                                                                <span style={{ fontSize: '1.3vh' }}>•</span>
                                                                <span className="truncate" style={{ fontSize: '1.3vh' }}>
                                                                    {r.customer.name}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
                                    <FileText className="w-16 h-16 text-gray-300 mb-4" />
                                    <p className="text-xl font-semibold text-gray-700 mb-2">{t('pos.receiptHistory.noMatchesTitle')}</p>
                                    <p className="text-gray-500">{t('pos.receiptHistory.noMatchesMessage')}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </BaseDialog>
    );
};

export default React.memo(ReceiptHistorySelector);
