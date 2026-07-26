import React, { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import QuickNumpad from './QuickNumpad';
import { Banknote, CreditCard, Percent, UserSquare } from 'lucide-react';
import { PaymentMethodButton } from './ui/PaymentMethodButton';
import { ActionButton } from './ui/ActionButton';
import { BaseDialog } from './ui/BaseDialog';
import { InputField } from './ui/InputField';
import { WithDialogTokens } from './ui/dialogParts';
import { DIALOG_SECONDARY_RADIUS } from '../theme/dialogStyle';

export type PaymentMethod = 'cash' | 'card';

/** What the operator actually chose. The caller must NOT re-derive the method
 *  from the cash amount: a cash sale tendered exactly leaves the field empty,
 *  and inferring from `cashReceived > 0` recorded those as card. */
export interface PaymentConfirmation {
    method: PaymentMethod;
    /** Amount tendered. Equals `total` when cash was confirmed without typing one. */
    cashReceived: number;
    change: number;
}

interface PaymentDialogProps {
    open: boolean;
    total: number;
    cashReceived: number;
    onChangeCash: (next: number) => void;
    onClose: () => void;
    onConfirm: (confirmation: PaymentConfirmation) => void;
    /** Opens the discount dialog from within the payment screen. */
    onDiscount?: () => void;
    /** Opens the customer / NIF dialog from within the payment screen. */
    onNif?: () => void;
    /** Currently applied discount amount (€), shown on the discount button when > 0. */
    discountAmount?: number;
    /** Currently selected customer tax number (NIF), shown on the NIF button when set. */
    nif?: string;
}

const PaymentDialog: React.FC<PaymentDialogProps> = ({ open, total, cashReceived, onChangeCash, onClose, onConfirm, onDiscount, onNif, discountAmount = 0, nif }) => {
    // 1. Hooks
    const { t } = useTranslation();
    const [method, setMethod] = useState<PaymentMethod>('cash');
    const [cashString, setCashString] = useState<string>(cashReceived > 0 ? String(cashReceived) : '');
    const [savedCashString, setSavedCashString] = useState<string>(''); // Store cash value when switching to card

    // 2. Event handlers
    const handleSetMethod = useCallback((m: PaymentMethod) => {
        if (m === method) return; // No change

        if (m === 'card') {
            // Switching to card: save current cash value, reset to 0
            setSavedCashString(cashString);
            setCashString('');
            onChangeCash(0);
        } else {
            // Switching to cash: restore saved value
            setCashString(savedCashString);
            const numeric = parseFloat(savedCashString.replace(',', '.'));
            onChangeCash(!isNaN(numeric) ? numeric : 0);
        }

        setMethod(m);
    }, [method, cashString, savedCashString, onChangeCash]);

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
    /** Empty field = "exact amount", the common case at a counter. Keyed on the
     *  raw string, not the number: a typed 0 and an untouched field both give
     *  cashReceived === 0, and a typed 0 on a €12.50 sale is not exact payment. */
    const cashNotEntered = cashString.trim() === '';

    const canConfirm = useMemo(() => {
        if (total <= 0) return false;
        if (method === 'card') return true;
        // Cash: confirm freely unless an amount was typed that does not cover
        // the total — that is a mistake worth blocking, not a shortcut.
        return cashNotEntered || cashReceived >= total;
    }, [cashNotEntered, cashReceived, method, total]);

    const effectiveCashReceived = method === 'cash' && cashNotEntered ? total : cashReceived;
    const balance = useMemo(() => cashReceived - total, [cashReceived, total]);

    const handleConfirm = useCallback(() => {
        const tendered = method === 'cash' ? effectiveCashReceived : 0;
        onConfirm({
            method,
            cashReceived: tendered,
            change: method === 'cash' ? Math.max(0, tendered - total) : 0,
        });
    }, [cashNotEntered, effectiveCashReceived, method, onConfirm, total]);

    // 5. Render
    const isCash = method === 'cash';

    return (
        <BaseDialog
            open={open}
            onClose={onClose}
            title={t('pos.processPayment')}
            icon={CreditCard}
            width="50vw"
            height="60vh"
            overlayClassName="z-40"
        >
            {/* Body */}
            <WithDialogTokens>{tk => (
            <div className={`flex-1 flex flex-row ${tk.cfg ? '' : 'bg-gray-100'}`}>
                {/* Left: Input + numpad - Always visible, disabled for Card */}
                <div className={`flex-1 min-w-0 flex flex-col min-h-0 ${!isCash ? 'opacity-50 pointer-events-none' : ''}`} style={{ padding: '3vh' }}>
                    <InputField
                        label={t('pos.cashReceived') || 'Cash Received'}
                        value={cashString}
                        onChange={(e) => handleCashChange(e.target.value.replace(/[^0-9.,]/g, ''))}
                        className="focus:ring-green-500 focus:border-green-500"
                        placeholder="0"
                        disabled={!isCash}
                    />

                    <div className="mt-4 flex-1 min-h-0">
                        <QuickNumpad
                            value={cashString}
                            onChange={handleCashChange}
                            allowDecimal={true}
                            quickValues={[100, 50, 20, 10]}
                            className="h-full"
                            disabled={!isCash}
                        />
                    </div>
                </div>

                {/* Right: Methods + totals + confirm */}
                <div className={`flex-1 flex flex-col min-h-0 ${tk.cfg ? '' : 'bg-white'}`} style={{ padding: '3vh' }}>
                    {/* Method buttons */}
                    <div className="grid grid-cols-2 gap-3" style={{ marginBottom: '1.5vh' }}>
                        <PaymentMethodButton
                            selected={method === 'cash'}
                            method="cash"
                            icon={Banknote}
                            label={t('pos.cash')}
                            onClick={() => handleSetMethod('cash')}
                            style={{ padding: '1.5vh', fontSize: '1.6vh' }}
                        />
                        <PaymentMethodButton
                            selected={method === 'card'}
                            method="card"
                            icon={CreditCard}
                            label={t('pos.card')}
                            onClick={() => handleSetMethod('card')}
                            style={{ padding: '1.5vh', fontSize: '1.6vh' }}
                        />
                    </div>

                    {/* Divider inside right section with horizontal padding inherited */}
                    <div className={`border-t ${tk.p.border}`} style={{ marginBottom: '1.5vh' }} />

                    {/* Totals */}
                    <div className="flex-1 overflow-auto">
                        <div className="flex items-center justify-between" style={{ marginBottom: '1.2vh' }}>
                            <span className={`${tk.p.subText}`} style={{ fontSize: '1.6vh' }}>{t('pos.totalLabel')}</span>
                            <span className={`${tk.p.titleText} font-bold`} style={{ fontSize: '2.4vh' }}>€{total.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className={`${tk.p.subText}`} style={{ fontSize: '1.6vh' }}>{t('pos.cashReceived')}</span>
                            <span className={`${tk.p.titleText} font-semibold`} style={{ fontSize: '2vh' }}>
                                €{(isCash ? effectiveCashReceived : 0).toFixed(2)}
                                {isCash && cashNotEntered && (
                                    <span className={`${tk.p.subText} font-normal`} style={{ fontSize: '1.4vh', marginLeft: '0.6vh' }}>
                                        {t('pos.exactAmount')}
                                    </span>
                                )}
                            </span>
                        </div>
                        <div className="flex items-center justify-between" style={{ marginTop: '1.2vh' }}>
                            <span className={`${tk.p.subText}`} style={{ fontSize: '1.6vh' }}>{t('pos.changeDue')}</span>
                            <span className={`font-bold ${balance >= 0 || cashNotEntered ? 'text-green-600' : 'text-red-600'}`} style={{ fontSize: '2vh' }}>
                                {cashNotEntered
                                    ? '€0.00'
                                    : balance >= 0 ? `€${balance.toFixed(2)}` : `-€${Math.abs(balance).toFixed(2)}`}
                            </span>
                        </div>
                    </div>

                    {/* Quick actions: discount + NIF */}
                    {(onDiscount || onNif) && (
                        <div className="grid grid-cols-2 gap-3" style={{ marginTop: '1.5vh' }}>
                            {onDiscount && (
                                <button
                                    type="button"
                                    onClick={onDiscount}
                                    className={`flex items-center justify-center gap-2 bg-white border shadow-sm font-semibold transition-all duration-200 ${tk.cfg ? `${tk.p.border} ${tk.p.titleText} ${DIALOG_SECONDARY_RADIUS[tk.cfg.primaryCta]}` : 'border-gray-200 text-gray-900 hover:bg-gray-50 rounded-2xl'}`}
                                    style={{ height: '5.5vh', fontSize: '1.5vh' }}
                                >
                                    <Percent style={{ width: '2vh', height: '2vh' }} />
                                    {discountAmount > 0 ? `−€${discountAmount.toFixed(2)}` : t('pos.discountLabel')}
                                </button>
                            )}
                            {onNif && (
                                <button
                                    type="button"
                                    onClick={onNif}
                                    className={`flex items-center justify-center gap-2 bg-white border shadow-sm font-semibold transition-all duration-200 ${tk.cfg ? `${tk.p.border} ${tk.p.titleText} ${DIALOG_SECONDARY_RADIUS[tk.cfg.primaryCta]}` : 'border-gray-200 text-gray-900 hover:bg-gray-50 rounded-2xl'}`}
                                    style={{ height: '5.5vh', fontSize: '1.5vh' }}
                                >
                                    <UserSquare style={{ width: '2vh', height: '2vh' }} />
                                    {nif ? `NIF ${nif}` : 'NIF'}
                                </button>
                            )}
                        </div>
                    )}

                    {/* Confirm button at bottom */}
                    <div style={{ marginTop: '1.5vh' }}>
                        <ActionButton
                            disabled={!canConfirm}
                            onClick={handleConfirm}
                            label={t('pos.confirmPayment')}
                            className={canConfirm ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700' : 'bg-gray-300 cursor-not-allowed'}
                            style={{ height: '5.5vh', fontSize: '1.6vh' }}
                        />
                    </div>
                </div>
            </div>
            )}</WithDialogTokens>
        </BaseDialog>
    );
};

export default React.memo(PaymentDialog);


