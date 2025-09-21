import React, { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import QuickNumpad from './QuickNumpad';
import { Banknote, CreditCard } from 'lucide-react';

export type PaymentMethod = 'cash' | 'card';

interface PaymentDialogProps {
    open: boolean;
    total: number;
    cashReceived: number;
    onChangeCash: (next: number) => void;
    onClose: () => void;
    onConfirm: () => void;
}

const PaymentDialog: React.FC<PaymentDialogProps> = ({ open, total, cashReceived, onChangeCash, onClose, onConfirm }) => {
    // 1. Hooks
    const { t } = useTranslation();
    const [method, setMethod] = useState<PaymentMethod>('cash');
    const [cashString, setCashString] = useState<string>(cashReceived > 0 ? String(cashReceived) : '');

    // 2. Event handlers
    const handleSetMethod = useCallback((m: PaymentMethod) => setMethod(m), []);

    const handleCashChange = useCallback((nextString: string) => {
        setCashString(nextString);
        const numeric = parseFloat(nextString.replace(',', '.'));
        if (!isNaN(numeric)) {
            onChangeCash(numeric);
        } else {
            onChangeCash(0);
        }
    }, [onChangeCash]);

    // 3. Computed values
    const canConfirm = useMemo(() => {
        if (method === 'cash') {
            return cashReceived >= total && total > 0;
        }
        return total > 0; // card: allow confirm directly
    }, [cashReceived, method, total]);

    const balance = useMemo(() => cashReceived - total, [cashReceived, total]);

    if (!open) return null;

    // 5. Render
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl w-[50vw] h-[60vh] shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="bg-gray-200 border-b rounded-t-xl" style={{ padding: '1.2vh 2vh' }}>
                    <div className="flex items-center justify-between">
                        <span className="opacity-0">✕</span>
                        <h3 className="font-bold text-gray-800 text-center" style={{ fontSize: '2vh' }}>{t('pos.processPayment')}</h3>
                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                            style={{ padding: '0.6vh' }}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Full-width divider */}
                <div
                    className="border-t border-gray-300"
                    style={{ marginLeft: '-4vh', marginRight: '-4vh' }}
                />


                {/* Body */}
                <div className="flex-1 flex flex-row bg-gray-100" >
                    {/* Left: Input + numpad */}
                    <div className="flex-1 min-w-0 flex flex-col min-h-0" style={{ padding: '3vh' }}>
                        <label className="block font-semibold text-gray-700 mb-2" style={{ fontSize: '1.4vh' }}>{t('pos.cashReceived')}</label>
                        <input
                            type="text"
                            value={cashString}
                            onChange={(e) => handleCashChange(e.target.value.replace(/[^0-9.,]/g, ''))}
                            className="w-full bg-white border border-gray-300 rounded-[10px] focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-all"
                            style={{ padding: '1.2vh 2vh', fontSize: '1.8vh' }}
                            placeholder="0"
                        />

                        <div className="mt-4 flex-1 min-h-0">
                            <QuickNumpad
                                value={cashString}
                                onChange={handleCashChange}
                                allowDecimal={true}
                                quickValues={[100, 50, 20, 10]}
                                className="h-full"
                            />
                        </div>
                    </div>

                    {/* Right: Methods + totals + confirm */}
                    <div className="flex-1 flex flex-col min-h-0 bg-white " style={{ padding: '3vh' }}>
                        {/* Method buttons */}
                        <div className="grid grid-cols-2 gap-3" style={{ marginBottom: '1.5vh' }}>
                            <button
                                onClick={() => handleSetMethod('cash')}
                                className={`rounded-[10px] border transition-all flex items-center justify-center space-x-2 ${method === 'cash' ? 'bg-green-50 border-green-500' : 'bg-gray-100 border-gray-200 hover:bg-gray-200'}`}
                                style={{ padding: '1.5vh', fontSize: '1.6vh' }}
                            >
                                <Banknote className={`${method === 'cash' ? 'text-green-600' : 'text-gray-700'}`} style={{ width: '2vh', height: '2vh' }} />
                                <span>{t('pos.cash')}</span>
                            </button>
                            <button
                                onClick={() => handleSetMethod('card')}
                                className={`rounded-[10px] border transition-all flex items-center justify-center space-x-2 ${method === 'card' ? 'bg-green-50 border-green-500' : 'bg-gray-100 border-gray-200 hover:bg-gray-200'}`}
                                style={{ padding: '1.5vh', fontSize: '1.6vh' }}
                            >
                                <CreditCard className={`${method === 'card' ? 'text-green-600' : 'text-gray-700'}`} style={{ width: '2vh', height: '2vh' }} />
                                <span>{t('pos.card')}</span>
                            </button>
                        </div>

                        {/* Divider inside right section with horizontal padding inherited */}
                        <div className="border-t border-gray-200" style={{ marginBottom: '1.5vh' }} />

                        {/* Totals */}
                        <div className="flex-1 overflow-auto">
                            <div className="flex items-center justify-between" style={{ marginBottom: '1.2vh' }}>
                                <span className="text-gray-600" style={{ fontSize: '1.6vh' }}>{t('pos.totalLabel')}</span>
                                <span className="text-gray-900 font-bold" style={{ fontSize: '2.4vh' }}>€{total.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600" style={{ fontSize: '1.6vh' }}>{t('pos.cashReceived')}</span>
                                <span className="text-gray-900 font-semibold" style={{ fontSize: '2vh' }}>€{(cashReceived || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between" style={{ marginTop: '1.2vh' }}>
                                <span className="text-gray-600" style={{ fontSize: '1.6vh' }}>Balance</span>
                                <span className={`font-bold ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`} style={{ fontSize: '2vh' }}>
                                    {balance >= 0 ? `€${balance.toFixed(2)}` : `-€${Math.abs(balance).toFixed(2)}`}
                                </span>
                            </div>
                        </div>

                        {/* Confirm button at bottom */}
                        <div style={{ marginTop: '1.5vh' }}>
                            <button
                                disabled={!canConfirm}
                                onClick={onConfirm}
                                className={`w-full text-white font-bold rounded-2xl transition-colors ${canConfirm ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700' : 'bg-gray-300 cursor-not-allowed'}`}
                                style={{ height: '5.5vh', fontSize: '1.6vh' }}
                            >
                                {t('pos.confirmPayment')}
                            </button>
                        </div>
                    </div>
                </div>
                {/* Removed bottom footer; confirm moved to right section */}
            </div>
        </div>
    );
};

export default React.memo(PaymentDialog);


