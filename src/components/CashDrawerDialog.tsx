import React, { useCallback, useEffect, useState } from 'react';
import { Archive, CheckCircle, Lock, Unlock, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cashDrawerAuditService } from '../services/cashDrawerAuditService';
import type {
    CashDrawerReasonCode,
    LocalCashDrawerEvent,
} from '../types/cashDrawer';
import { ConfiguredDialogShell } from './ui/ConfiguredDialogShell';
import { dialogButtonClasses, useAppliedDialogStyle } from '../theme/dialogStyle';

interface CashDrawerDialogProps {
    open: boolean;
    employee: {
        id: string;
        name: string;
        employeeNumber?: string;
    };
    terminalLabel: string;
    onClose: () => void;
}

const reasonOptions: Array<{
    value: Exclude<CashDrawerReasonCode, 'sale'>;
    labelKey: string;
}> = [
    { value: 'make_change', labelKey: 'cashDrawerDialog.reasonMakeChange' },
    { value: 'add_float', labelKey: 'cashDrawerDialog.reasonAddFloat' },
    { value: 'cash_drop', labelKey: 'cashDrawerDialog.reasonCashDrop' },
    { value: 'cash_count', labelKey: 'cashDrawerDialog.reasonCashCount' },
    { value: 'refund', labelKey: 'cashDrawerDialog.reasonRefund' },
    { value: 'hardware_issue', labelKey: 'cashDrawerDialog.reasonHardwareIssue' },
    { value: 'other', labelKey: 'cashDrawerDialog.reasonOther' },
];

const CashDrawerDialog: React.FC<CashDrawerDialogProps> = ({
    open,
    employee,
    terminalLabel,
    onClose,
}) => {
    const { t } = useTranslation();
    const applied = useAppliedDialogStyle();
    const [latestEvent, setLatestEvent] = useState<LocalCashDrawerEvent>();
    const [reasonCode, setReasonCode] = useState<Exclude<CashDrawerReasonCode, 'sale'>>('make_change');
    const [justification, setJustification] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const loadStatus = useCallback(async () => {
        setLatestEvent(await cashDrawerAuditService.getLatestForTerminal());
    }, []);

    useEffect(() => {
        if (!open) return;
        setMessage('');
        setError('');
        void loadStatus();
    }, [loadStatus, open]);

    const handleManualOpen = async () => {
        setBusy(true);
        setMessage('');
        setError('');
        try {
            const event = await cashDrawerAuditService.openManually({
                operator: employee,
                terminal: { label: terminalLabel },
                reasonCode,
                justification,
            });
            setLatestEvent(event);
            setJustification('');
            if (event.success) {
                setMessage(t('cashDrawerDialog.openSuccess'));
            } else {
                setError(t('cashDrawerDialog.openFailed', { error: event.error_message }));
            }
        } catch (openError) {
            setError(openError instanceof Error ? openError.message : t('cashDrawerDialog.openError'));
        } finally {
            setBusy(false);
        }
    };

    const handleConfirmClosed = async () => {
        setBusy(true);
        setMessage('');
        setError('');
        try {
            const event = await cashDrawerAuditService.confirmClosed(
                employee,
                { label: terminalLabel }
            );
            setLatestEvent(event);
            setMessage(t('cashDrawerDialog.closeConfirmed'));
        } catch (closeError) {
            setError(closeError instanceof Error ? closeError.message : t('cashDrawerDialog.closeError'));
        } finally {
            setBusy(false);
        }
    };

    if (!open) return null;
    const consideredOpen = latestEvent?.action === 'open' && latestEvent.success;

    // Interior shared between the original panel and the applied-style shell.
    const interior = (
        <>
            <div className={`mt-6 flex items-center gap-3 rounded-2xl p-4 ${
                consideredOpen ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'
            }`}>
                {consideredOpen ? <Unlock className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
                <div>
                    <p className="font-semibold">
                        {consideredOpen ? t('cashDrawerDialog.stateOpen') : t('cashDrawerDialog.stateClosed')}
                    </p>
                    <p className="text-sm opacity-75">
                        {latestEvent
                            ? `${latestEvent.employee_name} · ${latestEvent.timestamp.toLocaleString()}`
                            : t('cashDrawerDialog.noActionsRecorded')}
                    </p>
                </div>
            </div>

            <div className="mt-6 space-y-4">
                <label className="block text-sm font-semibold text-slate-700">
                    {t('cashDrawerDialog.reasonLabel')}
                    <select
                        value={reasonCode}
                        onChange={event => setReasonCode(event.target.value as Exclude<CashDrawerReasonCode, 'sale'>)}
                        className="mt-2 min-h-touch-sm w-full rounded-2xl border border-slate-300 bg-white px-4"
                    >
                        {reasonOptions.map(option => (
                            <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                        ))}
                    </select>
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                    {t('cashDrawerDialog.justificationLabel')}
                    <textarea
                        value={justification}
                        onChange={event => setJustification(event.target.value)}
                        placeholder={t('cashDrawerDialog.justificationPlaceholder')}
                        className="mt-2 min-h-28 w-full rounded-2xl border border-slate-300 p-4 font-normal outline-none focus:ring-4 focus:ring-slate-200"
                    />
                </label>
            </div>

            {message && (
                <div className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">
                    <CheckCircle className="h-5 w-5" /> {message}
                </div>
            )}
            {error && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        </>
    );

    if (applied) {
        const buttons = dialogButtonClasses(applied);
        return (
            <ConfiguredDialogShell
                config={applied}
                title={t('cashDrawerDialog.title')}
                subtitle={terminalLabel}
                icon={Archive}
                onClose={onClose}
                overlayClassName="z-[85]"
                footer={
                    <div className="grid gap-3 sm:grid-cols-2">
                        <button
                            type="button"
                            disabled={busy || !consideredOpen}
                            onClick={() => void handleConfirmClosed()}
                            className={`${buttons.secondary} disabled:opacity-40`}
                        >
                            {t('cashDrawerDialog.confirmClosedButton')}
                        </button>
                        <button
                            type="button"
                            disabled={busy || !justification.trim()}
                            onClick={() => void handleManualOpen()}
                            className={`${buttons.primary} disabled:opacity-50`}
                        >
                            {busy ? t('cashDrawerDialog.recording') : t('cashDrawerDialog.openWithoutSaleButton')}
                        </button>
                    </div>
                }
            >
                <div className="px-6 pb-5">{interior}</div>
            </ConfiguredDialogShell>
        );
    }

    return (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/55 p-4">
            <div className="w-full max-w-xl rounded-[2rem] bg-white p-6 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                            <Archive className="h-7 w-7" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-semibold text-slate-950">{t('cashDrawerDialog.title')}</h2>
                            <p className="text-sm text-slate-500">{terminalLabel}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex min-h-touch-xs min-w-[2.75rem] items-center justify-center rounded-2xl bg-slate-100 text-slate-600"
                        aria-label={t('cashDrawerDialog.closeAriaLabel')}
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {interior}

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <button
                        type="button"
                        disabled={busy || !consideredOpen}
                        onClick={() => void handleConfirmClosed()}
                        className="min-h-touch rounded-2xl bg-slate-100 px-4 font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-40"
                    >
                        {t('cashDrawerDialog.confirmClosedButton')}
                    </button>
                    <button
                        type="button"
                        disabled={busy || !justification.trim()}
                        onClick={() => void handleManualOpen()}
                        className="min-h-touch rounded-2xl bg-orange-500 px-4 font-semibold text-white hover:bg-orange-600 disabled:bg-slate-300"
                    >
                        {busy ? t('cashDrawerDialog.recording') : t('cashDrawerDialog.openWithoutSaleButton')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CashDrawerDialog;
