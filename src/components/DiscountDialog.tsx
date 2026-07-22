import React, { useCallback, useMemo, useState } from 'react';
import { Tag } from 'lucide-react';
import { WithDialogTokens } from './ui/dialogParts';
import { useTranslation } from 'react-i18next';
import type { LoyaltyVoucher, SystemSettings } from '../contexts/SettingsContext';
import { useSettings } from '../contexts/SettingsContext';
import type { LocalCustomer } from '../types/supabase';
import QuickNumpad from './QuickNumpad';
import { ActionButton } from './ui/ActionButton';
import { BaseDialog } from './ui/BaseDialog';
import { InputField } from './ui/InputField';
import { TabToggle, type TabToggleOption } from './ui/TabToggle';

interface CouponPreset {
    id: string;
    name: string;
    type: 'percentage' | 'fixed';
    value: number;
    code?: string;
    description?: string;
}

export interface DiscountDialogResult {
    type: 'percentage' | 'fixed';
    value: number;
    source: 'preset' | 'percentage' | 'fixed' | 'voucher' | 'loyalty';
    code?: string;
    customer?: LocalCustomer;
    pointsRedeemed?: number;
}

interface DiscountDialogProps {
    open: boolean;
    onClose: () => void;
    onApply: (result: DiscountDialogResult) => void;
    presets?: CouponPreset[];
    customers: LocalCustomer[];
    loyalty: SystemSettings['loyalty'];
    saleTotal: number;
}

type DiscountTab = 'redeem' | 'preset' | 'percentage' | 'fixed';
type RedeemMode = 'voucher' | 'points';

const normalizePhone = (value: string): string => {
    const digits = value.replace(/\D/g, '');
    return digits.length === 12 && digits.startsWith('351') ? digits.slice(3) : digits;
};

const DiscountDialog: React.FC<DiscountDialogProps> = ({
    open,
    onClose,
    onApply,
    presets = [],
    customers,
    loyalty,
    saleTotal,
}) => {
    const { t } = useTranslation();
    const { settings } = useSettings();
    const currencySymbol = settings.pos.currencySymbol;
    const [activeTab, setActiveTab] = useState<DiscountTab>('redeem');
    const [redeemMode, setRedeemMode] = useState<RedeemMode>('voucher');
    const [selectedPresetId, setSelectedPresetId] = useState('');
    const [inputValue, setInputValue] = useState('');
    const [voucherCode, setVoucherCode] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [pointsInput, setPointsInput] = useState('');

    const selectedVoucher = useMemo<LoyaltyVoucher | undefined>(() => {
        const normalizedCode = voucherCode.trim().toUpperCase();
        if (!loyalty.vouchersEnabled || !normalizedCode) return undefined;
        return loyalty.vouchers.find(
            voucher => voucher.enabled && voucher.code.trim().toUpperCase() === normalizedCode
        );
    }, [loyalty.vouchers, loyalty.vouchersEnabled, voucherCode]);

    const matchedCustomer = useMemo(() => {
        const phone = normalizePhone(phoneNumber);
        if (!loyalty.enabled || !phone) return undefined;
        return customers.find(customer => normalizePhone(customer.phone ?? '') === phone);
    }, [customers, loyalty.enabled, phoneNumber]);

    const requestedPoints = useMemo(
        () => Math.max(0, Math.floor(Number(pointsInput) || 0)),
        [pointsInput]
    );
    const maxRedeemablePoints = useMemo(() => {
        if (!matchedCustomer || saleTotal <= 0) return 0;
        const saleCap = Math.floor(saleTotal * loyalty.pointsPerEuroRedeemed);
        return Math.min(matchedCustomer.loyalty_points, saleCap);
    }, [loyalty.pointsPerEuroRedeemed, matchedCustomer, saleTotal]);
    const pointsDiscount = useMemo(
        () => requestedPoints / Math.max(1, loyalty.pointsPerEuroRedeemed),
        [loyalty.pointsPerEuroRedeemed, requestedPoints]
    );
    const parsedNumber = useMemo(
        () => parseFloat(inputValue.replace(',', '.')),
        [inputValue]
    );
    const isNumericValid = useMemo(() => {
        if (activeTab === 'percentage') {
            return Number.isFinite(parsedNumber) && parsedNumber > 0 && parsedNumber <= 100;
        }
        return Number.isFinite(parsedNumber) && parsedNumber > 0;
    }, [activeTab, parsedNumber]);
    const canApply = useMemo(() => {
        if (activeTab === 'preset') return Boolean(selectedPresetId);
        if (activeTab === 'percentage' || activeTab === 'fixed') return isNumericValid;
        if (redeemMode === 'voucher') return Boolean(selectedVoucher);
        return Boolean(
            matchedCustomer &&
            requestedPoints > 0 &&
            requestedPoints <= maxRedeemablePoints
        );
    }, [
        activeTab,
        isNumericValid,
        matchedCustomer,
        maxRedeemablePoints,
        redeemMode,
        requestedPoints,
        selectedPresetId,
        selectedVoucher,
    ]);

    const resetInputs = useCallback(() => {
        setInputValue('');
        setSelectedPresetId('');
        setVoucherCode('');
        setPhoneNumber('');
        setPointsInput('');
    }, []);

    const handleSetTab = useCallback((tab: DiscountTab) => {
        setActiveTab(tab);
        resetInputs();
    }, [resetInputs]);

    const handleApply = useCallback(() => {
        if (activeTab === 'redeem' && redeemMode === 'voucher' && selectedVoucher) {
            onApply({
                type: selectedVoucher.type,
                value: selectedVoucher.value,
                source: 'voucher',
                code: selectedVoucher.code,
            });
            onClose();
            return;
        }
        if (activeTab === 'redeem' && redeemMode === 'points' && matchedCustomer) {
            onApply({
                type: 'fixed',
                value: Number(pointsDiscount.toFixed(2)),
                source: 'loyalty',
                customer: matchedCustomer,
                pointsRedeemed: requestedPoints,
            });
            onClose();
            return;
        }
        if (activeTab === 'preset') {
            const preset = presets.find(item => item.id === selectedPresetId);
            if (!preset) return;
            onApply({
                type: preset.type,
                value: preset.value,
                source: 'preset',
                code: preset.code,
            });
            onClose();
            return;
        }
        if (!isNumericValid) return;
        onApply({
            type: activeTab === 'fixed' ? 'fixed' : 'percentage',
            value: parsedNumber,
            source: activeTab === 'fixed' ? 'fixed' : 'percentage',
        });
        onClose();
    }, [
        activeTab,
        isNumericValid,
        matchedCustomer,
        onApply,
        onClose,
        parsedNumber,
        pointsDiscount,
        presets,
        redeemMode,
        requestedPoints,
        selectedPresetId,
        selectedVoucher,
    ]);

    return (
        <BaseDialog
            open={open}
            onClose={onClose}
            title={t('pos.discountDialog.title')}
            icon={Tag}
            width="36vw"
            height="76vh"
            footer={
                <div className="flex space-x-4">
                    <ActionButton
                        onClick={onClose}
                        label={t('common.cancel')}
                        variant="secondary"
                        className="flex-1"
                        style={{ height: '5vh', fontSize: '1.6vh' }}
                    />
                    <ActionButton
                        disabled={!canApply}
                        onClick={handleApply}
                        label={t('pos.discountDialog.buttons.apply')}
                        className={`flex-1 rounded-2xl ${canApply ? '' : 'cursor-not-allowed bg-gray-300'}`}
                        style={{ height: '5vh', fontSize: '1.6vh' }}
                    />
                </div>
            }
        >
            <WithDialogTokens>{tk => (
            <div className={`flex flex-1 flex-col ${tk.cfg ? '' : 'bg-gray-100'} px-8 pb-5 pt-6`}>
                <div className="mb-5">
                    <TabToggle
                        options={[
                            { value: 'redeem', label: t('pos.discountDialog.tabs.redeem') },
                            { value: 'preset', label: t('pos.discountDialog.tabs.preset') },
                            { value: 'percentage', label: t('pos.discountDialog.tabs.percentage') },
                            { value: 'fixed', label: t('pos.discountDialog.tabs.fixed') },
                        ] as TabToggleOption<DiscountTab>[]}
                        value={activeTab}
                        onChange={handleSetTab}
                    />
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    {activeTab === 'redeem' && (
                        <div className="space-y-5">
                            <TabToggle
                                options={[
                                    { value: 'voucher', label: t('pos.discountDialog.redeem.voucher') },
                                    { value: 'points', label: t('pos.discountDialog.redeem.points') },
                                ] as TabToggleOption<RedeemMode>[]}
                                value={redeemMode}
                                onChange={mode => {
                                    setRedeemMode(mode);
                                    setVoucherCode('');
                                    setPhoneNumber('');
                                    setPointsInput('');
                                }}
                            />

                            {redeemMode === 'voucher' ? (
                                <div className="space-y-4">
                                    <InputField
                                        label={t('pos.discountDialog.redeem.voucherCode')}
                                        value={voucherCode}
                                        onChange={event => setVoucherCode(event.target.value.toUpperCase())}
                                        placeholder="SUMMER10"
                                    />
                                    {voucherCode && (
                                        <div className={`rounded-2xl p-4 text-sm ${selectedVoucher ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-800'}`}>
                                            {selectedVoucher
                                                ? `${selectedVoucher.description || selectedVoucher.code}: ${
                                                    selectedVoucher.type === 'percentage'
                                                        ? `${selectedVoucher.value}%`
                                                        : `€${selectedVoucher.value.toFixed(2)}`
                                                }`
                                                : t('pos.discountDialog.redeem.invalidVoucher')}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <InputField
                                        label={t('pos.discountDialog.redeem.phone')}
                                        value={phoneNumber}
                                        onChange={event => setPhoneNumber(event.target.value)}
                                        placeholder="+351 912 345 678"
                                    />
                                    {matchedCustomer ? (
                                        <>
                                            <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-900">
                                                <p className="font-semibold">{matchedCustomer.name}</p>
                                                <p className="mt-1 text-sm">
                                                    {matchedCustomer.loyalty_points.toLocaleString()} points available
                                                </p>
                                            </div>
                                            <InputField
                                                label={t('pos.discountDialog.redeem.pointsToRedeem')}
                                                value={pointsInput}
                                                onChange={event =>
                                                    setPointsInput(event.target.value.replace(/\D/g, ''))
                                                }
                                                placeholder={String(maxRedeemablePoints)}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setPointsInput(String(maxRedeemablePoints))}
                                                className="min-h-touch-sm w-full rounded-xl border border-emerald-200 bg-white px-4 font-semibold text-emerald-800 hover:bg-emerald-50"
                                            >
                                                {t('pos.discountDialog.redeem.useMaximum')} ({maxRedeemablePoints})
                                            </button>
                                            {requestedPoints > 0 && (
                                                <div className={`rounded-2xl bg-white p-4 text-sm ${tk.p.subText}`}>
                                                    {requestedPoints.toLocaleString()} points = €{pointsDiscount.toFixed(2)}
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        phoneNumber && (
                                            <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">
                                                {t('pos.discountDialog.redeem.customerNotFound')}
                                            </div>
                                        )
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'preset' && (
                        <div className="h-full overflow-y-auto">
                            {presets.length === 0 ? (
                                <div className={`flex h-full items-center justify-center ${tk.p.subText}`}>
                                    {t('pos.discountDialog.noPresets')}
                                </div>
                            ) : (
                                <ul className="divide-y divide-gray-200">
                                    {presets.map(preset => (
                                        <li key={preset.id}>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedPresetId(preset.id)}
                                                className={`w-full px-5 py-4 text-left transition-all ${selectedPresetId === preset.id ? 'bg-green-100' : `hover:${tk.p.tintBg}`}`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className={`font-semibold ${tk.p.titleText}`}>{preset.name}</span>
                                                    <span className="font-semibold text-red-500">
                                                        {preset.type === 'percentage'
                                                            ? `-${preset.value}%`
                                                            : `- ${preset.value.toFixed(2)}`}
                                                    </span>
                                                </div>
                                                {preset.description && (
                                                    <div className={`mt-1 text-sm ${tk.p.subText}`}>{preset.description}</div>
                                                )}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {(activeTab === 'percentage' || activeTab === 'fixed') && (
                        <div className="flex h-full min-h-0 flex-col">
                            <InputField
                                label={
                                    activeTab === 'fixed'
                                        ? t('pos.discountDialog.labels.price')
                                        : t('pos.discountDialog.labels.percentage')
                                }
                                value={inputValue}
                                onChange={event =>
                                    setInputValue(event.target.value.replace(/[^0-9.,]/g, ''))
                                }
                                prefixText={activeTab === 'fixed' ? currencySymbol : undefined}
                                suffixText={activeTab === 'percentage' ? '%' : undefined}
                                className={
                                    inputValue && !isNumericValid
                                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                                        : 'focus:border-green-500 focus:ring-green-500'
                                }
                                placeholder={activeTab === 'fixed' ? '5.00' : '15'}
                            />
                            <div className="mt-4 min-h-0 flex-1 pb-4">
                                <QuickNumpad
                                    value={inputValue}
                                    onChange={setInputValue}
                                    allowDecimal={activeTab === 'fixed'}
                                    quickValues={[100, 50, 20, 10]}
                                    className="h-full"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
            )}</WithDialogTokens>
        </BaseDialog>
    );
};

export default React.memo(DiscountDialog);
