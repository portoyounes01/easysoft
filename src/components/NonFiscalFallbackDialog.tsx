import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, FileWarning, RefreshCw, X } from 'lucide-react';
import { ConfiguredDialogShell } from './ui/ConfiguredDialogShell';
import { useAppliedDialogStyle } from '../theme/dialogStyle';
import type { FiscalIssueFailure } from '../fiscal/fiscalFailure';
import type { NonFiscalFallbackDecision } from '../fiscal/nonFiscalFallback';

interface NonFiscalFallbackDialogProps {
    failure: FiscalIssueFailure;
    /** Abandon the sale; the cart stays as it was. */
    onCancel: () => void;
    /** Re-run the same checkout against the fiscal backend. */
    onRetry: () => void;
    onIssueSlip: (decision: NonFiscalFallbackDecision) => void;
    busy?: boolean;
}

/**
 * Shown when the cloud fiscal backend could not issue a document for a sale the
 * customer is standing at the counter for.
 *
 * The dialog is the point where the obligation transfers: confirming it means
 * the cashier will write this sale into the AT-authorised paper book. That is
 * why it is never skipped and never defaulted — a slip issued without someone
 * reading this leaves a sale with no invoice at all.
 *
 * Two situations, deliberately not shown the same way:
 *
 *  • not-dispatched — the request never left the till, so nothing exists at the
 *    provider. Retrying is safe and is offered first.
 *  • unresolved — the request was sent and we did not get a usable answer. A
 *    document may already exist there. Retrying is NOT offered (for Vendus and
 *    InvoiceXpress a retry mints a fresh idempotency token and can issue a
 *    second document), and the slip is gated behind the operator confirming
 *    they looked the sale up and found nothing.
 */
export const NonFiscalFallbackDialog: React.FC<NonFiscalFallbackDialogProps> = ({
    failure,
    onCancel,
    onRetry,
    onIssueSlip,
    busy = false,
}) => {
    const { t } = useTranslation();
    const applied = useAppliedDialogStyle();
    const [attested, setAttested] = useState(false);

    const unresolved = failure.dispatch === 'unresolved';
    const externalReference = 'externalReference' in failure ? failure.externalReference : null;
    const providerName = t(`nonFiscalFallback.providers.${failure.provider}`);
    const canIssue = !busy && (!unresolved || attested);

    const interior = (
        <div className="space-y-4">
            <div
                className={`rounded-2xl border-2 p-4 ${unresolved
                    ? 'border-red-300 bg-red-50 text-red-900'
                    : 'border-amber-300 bg-amber-50 text-amber-900'
                    }`}
            >
                <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" />
                    <div className="min-w-0 space-y-1">
                        <p className="font-semibold">
                            {unresolved
                                ? t('nonFiscalFallback.unresolvedTitle', { provider: providerName })
                                : t('nonFiscalFallback.offlineTitle', { provider: providerName })}
                        </p>
                        <p className="text-sm leading-5">
                            {unresolved
                                ? t('nonFiscalFallback.unresolvedBody', { provider: providerName })
                                : t('nonFiscalFallback.offlineBody', { provider: providerName })}
                        </p>
                    </div>
                </div>
            </div>

            {externalReference && (
                <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-600">{t('nonFiscalFallback.lookupLabel')}</p>
                    <p className="mt-1 break-all font-mono text-base font-semibold text-slate-900">
                        {externalReference}
                    </p>
                </div>
            )}

            <div className="rounded-2xl border border-slate-200 p-4">
                <p className="font-semibold text-slate-900">{t('nonFiscalFallback.obligationTitle')}</p>
                <ul className="mt-2 space-y-1.5 text-sm leading-5 text-slate-700">
                    <li>• {t('nonFiscalFallback.obligationWriteBook')}</li>
                    <li>• {t('nonFiscalFallback.obligationSlipNotInvoice')}</li>
                    <li>• {t('nonFiscalFallback.obligationRecordLater')}</li>
                </ul>
            </div>

            {unresolved && (
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-slate-300 p-4 hover:bg-slate-50">
                    <input
                        type="checkbox"
                        checked={attested}
                        onChange={e => setAttested(e.target.checked)}
                        className="mt-1 h-5 w-5 shrink-0"
                    />
                    <span className="text-sm leading-5 text-slate-800">
                        {t('nonFiscalFallback.attestation', { provider: providerName })}
                    </span>
                </label>
            )}

            <p className="break-words font-mono text-xs text-slate-500">{failure.message}</p>
        </div>
    );

    const footer = (
        <div className="flex flex-wrap gap-3">
            <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="min-h-touch flex-1 rounded-2xl bg-slate-100 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
            >
                {t('nonFiscalFallback.cancelSale')}
            </button>
            {!unresolved && (
                <button
                    type="button"
                    onClick={onRetry}
                    disabled={busy}
                    className="min-h-touch flex-1 rounded-2xl bg-slate-800 px-4 py-3 font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
                >
                    <span className="inline-flex items-center justify-center gap-2">
                        <RefreshCw className="h-5 w-5" />
                        {t('nonFiscalFallback.retry')}
                    </span>
                </button>
            )}
            <button
                type="button"
                onClick={() => onIssueSlip({ failure, operatorAttested: unresolved ? attested : undefined })}
                disabled={!canIssue}
                className="min-h-touch flex-1 rounded-2xl bg-amber-500 px-4 py-3 font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {t('nonFiscalFallback.issueSlip')}
            </button>
        </div>
    );

    if (applied) {
        return (
            <ConfiguredDialogShell
                config={applied}
                title={t('nonFiscalFallback.title')}
                subtitle={t('nonFiscalFallback.subtitle')}
                icon={FileWarning}
                onClose={onCancel}
                footer={footer}
                // Opens on top of the still-mounted payment dialog.
                overlayClassName="z-[60]"
            >
                <div className="px-6 pb-5">{interior}</div>
            </ConfiguredDialogShell>
        );
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                            <FileWarning className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">{t('nonFiscalFallback.title')}</h2>
                            <p className="text-sm text-slate-500">{t('nonFiscalFallback.subtitle')}</p>
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

export default NonFiscalFallbackDialog;
