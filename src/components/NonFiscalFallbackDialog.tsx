import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, FileWarning, RefreshCw, X } from 'lucide-react';
import { ConfiguredDialogShell } from './ui/ConfiguredDialogShell';
import { useAppliedDialogStyle } from '../theme/dialogStyle';
import { retryIsIdempotent, type FiscalIssueFailure } from '../fiscal/fiscalFailure';
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
 *  • rejected — the provider answered, and refused, with a status that proves
 *    no document was created. Nothing exists either, so the slip is one click
 *    away; but the wording says "refused", not "offline", because this is a
 *    fault in the document rather than an outage and it will recur.
 *  • unresolved — the request was sent and we did not get a usable answer. A
 *    document may already exist there, so the slip is gated behind the operator
 *    confirming they looked the sale up and found nothing. Retry is offered
 *    only where the provider deduplicates a re-sent sale (Vendus via tx_id,
 *    fiskaly via its checkoutId); for InvoiceXpress it would risk a second
 *    document, so it is withheld.
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
    const rejected = failure.dispatch === 'rejected';
    const externalReference = 'externalReference' in failure ? failure.externalReference : null;
    const providerStatus = 'providerStatus' in failure ? failure.providerStatus : null;
    const providerName = t(`nonFiscalFallback.providers.${failure.provider}`);
    const canIssue = !busy && (!unresolved || attested);
    // Re-sending is only safe where the provider recognises the repeat.
    const canRetry = !unresolved || retryIsIdempotent(failure.provider);

    const interior = (
        <div className="space-y-4">
            <div
                className={`rounded-2xl border-2 p-4 ${unresolved || rejected
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
                                : rejected
                                    ? t('nonFiscalFallback.rejectedTitle', { provider: providerName })
                                    : t('nonFiscalFallback.offlineTitle', { provider: providerName })}
                        </p>
                        <p className="text-sm leading-5">
                            {unresolved
                                ? t('nonFiscalFallback.unresolvedBody', { provider: providerName })
                                : rejected
                                    ? t('nonFiscalFallback.rejectedBody', {
                                        provider: providerName,
                                        status: providerStatus ?? '',
                                    })
                                    : t('nonFiscalFallback.offlineBody', { provider: providerName })}
                        </p>
                    </div>
                </div>
            </div>

            {externalReference && unresolved && (
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

            <p className="break-words font-mono text-xs text-slate-500">{failure.message}</p>
        </div>
    );

    // The attestation lives in the FOOTER, with the button it gates.
    //
    // It used to sit at the end of the body, which the dialog shell scrolls
    // while pinning the footer — so on a till screen the gate could sit below
    // the fold while the permanently-disabled button stayed in view, with
    // nothing on screen explaining why. It is also a full-width button rather
    // than a native checkbox: `min-h-touch` is the tap target this app is built
    // around, and a 20px box is not hittable with a finger.
    const footer = (
        <div className="space-y-3">
            {unresolved && (
                <button
                    type="button"
                    role="switch"
                    aria-checked={attested}
                    onClick={() => setAttested(value => !value)}
                    disabled={busy}
                    data-testid="fallback-attestation"
                    className={`min-h-touch flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left transition-colors disabled:opacity-50 ${attested
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-300 bg-white hover:bg-slate-50'
                        }`}
                >
                    <span
                        aria-hidden="true"
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 ${attested
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-400 bg-white'
                            }`}
                    >
                        {attested && <Check className="h-5 w-5" />}
                    </span>
                    <span className="text-sm leading-5 text-slate-800">
                        {t('nonFiscalFallback.attestation', { provider: providerName })}
                    </span>
                </button>
            )}

            <div className="flex flex-wrap gap-3">
            <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                data-testid="fallback-cancel"
                className="min-h-touch flex-1 rounded-2xl bg-slate-100 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
            >
                {t('nonFiscalFallback.cancelSale')}
            </button>
            {canRetry && (
                <button
                    type="button"
                    onClick={onRetry}
                    disabled={busy}
                    data-testid="fallback-retry"
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
                data-testid="fallback-issue-slip"
                className="min-h-touch flex-1 rounded-2xl bg-amber-500 px-4 py-3 font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {t('nonFiscalFallback.issueSlip')}
            </button>
            </div>

            {/* A disabled button must always say what would enable it. */}
            {unresolved && !attested && (
                <p data-testid="fallback-attestation-hint" className="text-center text-sm text-slate-500">
                    {t('nonFiscalFallback.attestationRequired')}
                </p>
            )}
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
