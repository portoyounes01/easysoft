import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, X } from 'lucide-react';
import { ConfiguredDialogShell } from './ui/ConfiguredDialogShell';
import { useAppliedDialogStyle } from '../theme/dialogStyle';
import type { NonFiscalFallbackAuditContext } from '../fiscal/fiscalAuditLog';

export interface ManualDocumentFormValues {
    manualSeries: string;
    manualNumber: string;
    manualAtcud: string | null;
    issuedAt: string;
}

interface ManualDocumentDialogProps {
    slip: NonFiscalFallbackAuditContext;
    onCancel: () => void;
    onSave: (values: ManualDocumentFormValues) => Promise<void> | void;
}

const fieldClass =
    'min-h-touch-sm w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base font-medium text-slate-900 outline-none focus:border-slate-400';

/**
 * Records WHICH handwritten document from the AT-authorised book covered a
 * fallback sale.
 *
 * Every value here is transcribed from paper that already exists — the series,
 * the number and the ATCUD are pre-printed by the tipografia. The till captures
 * them; it never generates them. That is the whole point: the paper document is
 * the legal one, and this form only makes the till aware of it so the reminder
 * can clear and the accountant has the link between slip and invoice.
 */
export const ManualDocumentDialog: React.FC<ManualDocumentDialogProps> = ({ slip, onCancel, onSave }) => {
    const { t } = useTranslation();
    const applied = useAppliedDialogStyle();
    const [manualSeries, setManualSeries] = useState('');
    const [manualNumber, setManualNumber] = useState('');
    const [manualAtcud, setManualAtcud] = useState('');
    const [issuedAt, setIssuedAt] = useState(() => new Date().toISOString().slice(0, 10));
    const [saving, setSaving] = useState(false);

    const canSave = !saving && manualSeries.trim().length > 0 && manualNumber.trim().length > 0;

    const submit = async () => {
        if (!canSave) return;
        setSaving(true);
        try {
            await onSave({
                manualSeries: manualSeries.trim(),
                manualNumber: manualNumber.trim(),
                manualAtcud: manualAtcud.trim() || null,
                issuedAt,
            });
        } finally {
            setSaving(false);
        }
    };

    const interior = (
        <div className="space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-600">{t('fiscalAudit.manualPending.form.slipLabel')}</p>
                <p className="mt-1 break-all font-mono text-base font-semibold text-slate-900">
                    {slip.slipReference}
                </p>
            </div>

            <p className="text-sm leading-5 text-slate-600">{t('fiscalAudit.manualPending.form.help')}</p>

            <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                    <span className="text-sm font-medium text-slate-700">
                        {t('fiscalAudit.manualPending.form.series')}
                    </span>
                    <input
                        className={fieldClass}
                        value={manualSeries}
                        onChange={e => setManualSeries(e.target.value)}
                        placeholder={t('fiscalAudit.manualPending.form.seriesPlaceholder')}
                    />
                </label>
                <label className="space-y-1">
                    <span className="text-sm font-medium text-slate-700">
                        {t('fiscalAudit.manualPending.form.number')}
                    </span>
                    <input
                        className={fieldClass}
                        value={manualNumber}
                        onChange={e => setManualNumber(e.target.value)}
                        placeholder={t('fiscalAudit.manualPending.form.numberPlaceholder')}
                    />
                </label>
            </div>

            <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">
                    {t('fiscalAudit.manualPending.form.atcud')}
                </span>
                <input
                    className={fieldClass}
                    value={manualAtcud}
                    onChange={e => setManualAtcud(e.target.value)}
                    placeholder={t('fiscalAudit.manualPending.form.atcudPlaceholder')}
                />
            </label>

            <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">
                    {t('fiscalAudit.manualPending.form.issuedAt')}
                </span>
                <input
                    type="date"
                    className={fieldClass}
                    value={issuedAt}
                    onChange={e => setIssuedAt(e.target.value)}
                />
            </label>
        </div>
    );

    const footer = (
        <div className="flex gap-3">
            <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="min-h-touch flex-1 rounded-2xl bg-slate-100 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
            >
                {t('common.cancel')}
            </button>
            <button
                type="button"
                onClick={submit}
                disabled={!canSave}
                className="min-h-touch flex-1 rounded-2xl bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {t('fiscalAudit.manualPending.form.save')}
            </button>
        </div>
    );

    if (applied) {
        return (
            <ConfiguredDialogShell
                config={applied}
                title={t('fiscalAudit.manualPending.form.title')}
                subtitle={t('fiscalAudit.manualPending.form.subtitle')}
                icon={BookOpen}
                onClose={onCancel}
                footer={footer}
            >
                <div className="px-6 pb-5">{interior}</div>
            </ConfiguredDialogShell>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                            <BookOpen className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">
                                {t('fiscalAudit.manualPending.form.title')}
                            </h2>
                            <p className="text-sm text-slate-500">
                                {t('fiscalAudit.manualPending.form.subtitle')}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        aria-label={t('common.close')}
                        className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="mt-5">{interior}</div>
                <div className="mt-5">{footer}</div>
            </div>
        </div>
    );
};

export default ManualDocumentDialog;
