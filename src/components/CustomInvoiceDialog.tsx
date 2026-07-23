import React, { useMemo, useState } from 'react';
import { WithDialogTokens } from './ui/dialogParts';
import { useTranslation } from 'react-i18next';
import { Banknote, CreditCard, FileText, Plus, Trash2, X } from 'lucide-react';

import { ivaRatesForCountry, calculateTaxAmount } from '../types/supabase';
import { useSettings } from '../contexts/SettingsContext';
import { getCountryProfile } from '../lib/countryProfile';
import { ConfiguredDialogShell } from './ui/ConfiguredDialogShell';
import { PaymentMethodButton } from './ui/PaymentMethodButton';
import { TableActionButton } from './ui/TableActionButton';
import { dialogButtonClasses, useAppliedDialogStyle } from '../theme/dialogStyle';

export interface CustomInvoiceLine {
    description: string;
    quantity: number;
    unitPrice: number;
    ivaRate: number;
}

export interface CustomInvoicePayload {
    lines: CustomInvoiceLine[];
    customerName: string;
    customerNif: string;
    paymentMethod: 'cash' | 'card';
}

interface LineForm {
    description: string;
    quantity: string;
    unitPrice: string;
    ivaRate: number;
}

interface CustomInvoiceDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (payload: CustomInvoicePayload) => Promise<void>;
}

const DEFAULT_IVA = 0.23;

const emptyLine = (ivaRate: number = DEFAULT_IVA): LineForm => ({ description: '', quantity: '1', unitPrice: '', ivaRate });

const toNumber = (value: string): number => {
    const parsed = parseFloat(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
};

const CustomInvoiceDialog: React.FC<CustomInvoiceDialogProps> = ({ open, onClose, onSubmit }) => {
    const { t } = useTranslation();
    const applied = useAppliedDialogStyle();
    const { settings } = useSettings();
    // Country-aware IVA options + default rate + tax-id placeholder (PT NIF vs ES NIF/CIF/NIE).
    const country = settings.operatingCountry;
    const ivaRates = ivaRatesForCountry(country);
    const countryProfile = getCountryProfile(country);
    const defaultIva = countryProfile.defaultVatRate;
    const [lines, setLines] = useState<LineForm[]>([emptyLine(defaultIva)]);
    const [customerName, setCustomerName] = useState('');
    const [customerNif, setCustomerNif] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const reset = () => {
        setLines([emptyLine(defaultIva)]);
        setCustomerName('');
        setCustomerNif('');
        setPaymentMethod('cash');
        setError('');
    };

    const updateLine = (index: number, patch: Partial<LineForm>) => {
        setLines(prev => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
    };

    const addLine = () => setLines(prev => [...prev, emptyLine(defaultIva)]);
    const removeLine = (index: number) =>
        setLines(prev => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));

    // Unit prices are VAT-inclusive (gross), matching how product prices are stored.
    const totals = useMemo(() => {
        let gross = 0;
        let tax = 0;
        for (const line of lines) {
            const lineGross = toNumber(line.quantity) * toNumber(line.unitPrice);
            if (lineGross <= 0) continue;
            gross += lineGross;
            tax += calculateTaxAmount(lineGross, line.ivaRate);
        }
        return { gross, tax, net: gross - tax };
    }, [lines]);

    const validLines = lines.filter(
        line => line.description.trim() && toNumber(line.quantity) > 0 && toNumber(line.unitPrice) > 0
    );
    const canSubmit = validLines.length > 0 && totals.gross > 0 && !submitting;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        setError('');
        try {
            await onSubmit({
                lines: validLines.map(line => ({
                    description: line.description.trim(),
                    quantity: toNumber(line.quantity),
                    unitPrice: toNumber(line.unitPrice),
                    ivaRate: line.ivaRate,
                })),
                customerName: customerName.trim(),
                customerNif: customerNif.replace(/[^A-Za-z0-9]/g, '').slice(0, 9),
                paymentMethod,
            });
            reset();
            onClose();
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : t('customInvoice.createError'));
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    // Interior + totals shared between the original panel and the applied-style shell.
    const bodyContent = (
        <WithDialogTokens>{tk => (<>
        <>
            {/* Line items */}
            <div>
                <div className={`mb-2 hidden gap-2 px-1 text-xs font-semibold uppercase tracking-wide ${tk.p.subText} sm:grid sm:grid-cols-[1fr_5rem_7rem_8rem_2.5rem]`}>
                    <span>{t('transactions.customInvoice.description')}</span>
                    <span className="text-right">{t('transactions.customInvoice.qty')}</span>
                    <span className="text-right">{t('transactions.customInvoice.unitPrice')}</span>
                    <span>{t('transactions.customInvoice.tax')}</span>
                    <span />
                </div>
                <div className="space-y-2">
                    {lines.map((line, index) => (
                        <div
                            key={index}
                            className={`grid grid-cols-1 gap-2 rounded-xl border ${tk.p.border} p-2 sm:grid-cols-[1fr_5rem_7rem_8rem_2.5rem] sm:items-center sm:border-0 sm:p-0`}
                        >
                            <input
                                value={line.description}
                                onChange={e => updateLine(index, { description: e.target.value })}
                                placeholder={t('transactions.customInvoice.descriptionPlaceholder')}
                                className={tk.cfg ? tk.input : "min-h-touch-sm rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"}
                            />
                            <input
                                value={line.quantity}
                                onChange={e => updateLine(index, { quantity: e.target.value.replace(/[^0-9.,]/g, '') })}
                                inputMode="decimal"
                                placeholder="1"
                                className={`text-right ${tk.cfg ? tk.input : "min-h-touch-sm rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"}`}
                            />
                            <input
                                value={line.unitPrice}
                                onChange={e => updateLine(index, { unitPrice: e.target.value.replace(/[^0-9.,]/g, '') })}
                                inputMode="decimal"
                                placeholder="0.00"
                                className={`text-right ${tk.cfg ? tk.input : "min-h-touch-sm rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"}`}
                            />
                            <select
                                value={line.ivaRate}
                                onChange={e => updateLine(index, { ivaRate: Number(e.target.value) })}
                                className={tk.cfg ? tk.input : "min-h-touch-sm rounded-lg border border-gray-300 px-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"}
                            >
                                {ivaRates.map(rate => (
                                    <option key={rate.value} value={rate.value}>
                                        {Math.round(rate.value * 100)}%
                                    </option>
                                ))}
                            </select>
                            <TableActionButton
                                variant="delete"
                                icon={Trash2}
                                type="button"
                                onClick={() => removeLine(index)}
                                disabled={lines.length === 1}
                                className="disabled:cursor-not-allowed"
                                aria-label={t('transactions.customInvoice.removeLine')}
                            />
                        </div>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={addLine}
                    className={`mt-3 flex items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-2 text-sm font-semibold ${tk.p.subText} hover:border-purple-400 hover:bg-purple-50 transition-all`}
                >
                    <Plus className="h-4 w-4" />
                    {t('transactions.customInvoice.addLine')}
                </button>
            </div>

            {/* Customer + payment */}
            <div className={`grid gap-4 border-t ${tk.p.border} pt-5 sm:grid-cols-2`}>
                <label className={`block text-sm font-semibold ${tk.p.titleText}`}>
                    {t('transactions.customInvoice.customerName')}
                    <input
                        value={customerName}
                        onChange={e => setCustomerName(e.target.value)}
                        placeholder={t('transactions.customInvoice.customerNamePlaceholder')}
                        className={`mt-1 font-normal ${tk.cfg ? tk.input : "min-h-touch-sm w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"}`}
                    />
                </label>
                <label className={`block text-sm font-semibold ${tk.p.titleText}`}>
                    {t('transactions.customInvoice.nif')}
                    <input
                        value={customerNif}
                        onChange={e => setCustomerNif(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 9))}
                        inputMode="text"
                        placeholder={countryProfile.taxId.placeholder}
                        className={`mt-1 font-normal ${tk.cfg ? tk.input : "min-h-touch-sm w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"}`}
                    />
                </label>
                <div className={`text-sm font-semibold ${tk.p.titleText} sm:col-span-2`}>
                    {t('transactions.customInvoice.paymentMethod')}
                    <div className="mt-1 flex gap-3">
                        {(['cash', 'card'] as const).map(method => (
                            <PaymentMethodButton
                                key={method}
                                type="button"
                                method={method}
                                selected={paymentMethod === method}
                                icon={method === 'cash' ? Banknote : CreditCard}
                                label={method === 'cash' ? t('pos.cash') : t('pos.card')}
                                onClick={() => setPaymentMethod(method)}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        </>
        </>)}</WithDialogTokens>
    );

    const totalsSummary = (
        <WithDialogTokens>{tk => (<>
        <div className="flex items-center gap-6 text-sm">
            <span className={tk.p.subText}>
                {t('transactions.customInvoice.net')}: <strong className={tk.p.titleText}>€{totals.net.toFixed(2)}</strong>
            </span>
            <span className={tk.p.subText}>
                {t('transactions.customInvoice.tax')}: <strong className={tk.p.titleText}>€{totals.tax.toFixed(2)}</strong>
            </span>
            <span className={tk.p.subText}>
                {t('transactions.customInvoice.total')}: <strong className="text-lg text-gray-900">€{totals.gross.toFixed(2)}</strong>
            </span>
        </div>
        </>)}</WithDialogTokens>
    );

    if (applied) {
        const buttons = dialogButtonClasses(applied);
        return (
            <ConfiguredDialogShell
                config={applied}
                title={t('transactions.customInvoice.title')}
                subtitle={t('transactions.customInvoice.subtitle')}
                icon={FileText}
                onClose={onClose}
                overlayClassName="z-[80]"
                footer={
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        {totalsSummary}
                        <button
                            type="button"
                            disabled={!canSubmit}
                            onClick={() => void handleSubmit()}
                            className={`${buttons.primary} flex items-center justify-center gap-2 px-6 disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                            <FileText className="h-5 w-5" />
                            {submitting ? t('transactions.customInvoice.creating') : t('transactions.customInvoice.create')}
                        </button>
                    </div>
                }
            >
                <div className="space-y-5 p-6">{bodyContent}</div>
            </ConfiguredDialogShell>
        );
    }

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4">
            <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                            <FileText className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900">{t('transactions.customInvoice.title')}</h2>
                            <p className="text-sm text-gray-500">{t('transactions.customInvoice.subtitle')}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200"
                        aria-label={t('common.close') || 'Close'}
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto p-6">{bodyContent}</div>

                {/* Footer with totals + submit */}
                <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        {totalsSummary}
                        <button
                            type="button"
                            disabled={!canSubmit}
                            onClick={() => void handleSubmit()}
                            className="flex min-h-touch items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                        >
                            <FileText className="h-5 w-5" />
                            {submitting ? t('transactions.customInvoice.creating') : t('transactions.customInvoice.create')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CustomInvoiceDialog;
