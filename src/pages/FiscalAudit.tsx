import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardList } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { initializeLocalDatabase, transactionLocalService } from '../lib/localDatabase';
import type { LocalFiscalAuditEvent } from '../types/supabase';
import { useDesignSystem2Customization } from '../contexts/DesignSystem2CustomizationContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import {
    logManualDocumentRecorded,
    outstandingManualDocuments,
    type NonFiscalFallbackAuditContext,
} from '../fiscal/fiscalAuditLog';
import ManualDocumentDialog, { type ManualDocumentFormValues } from '../components/ManualDocumentDialog';
import '../styles/design-system-2-scope.css';

const FiscalAudit: React.FC = () => {
    const { t } = useTranslation();
    const { visualStyle, prefs } = useDesignSystem2Customization();
    const { employee } = useSupabaseAuth();
    const [rows, setRows] = useState<LocalFiscalAuditEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [recordingSlip, setRecordingSlip] = useState<NonFiscalFallbackAuditContext | null>(null);

    const reload = useCallback(async () => {
        await initializeLocalDatabase();
        const list = await transactionLocalService.listFiscalAuditEvents(800);
        setRows(list);
    }, []);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            try {
                setLoading(true);
                setError(null);
                await initializeLocalDatabase();
                const list = await transactionLocalService.listFiscalAuditEvents(800);
                if (!cancelled) setRows(list);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : t('fiscalAudit.loadError'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, []);

    const saveManualDocument = async (values: ManualDocumentFormValues) => {
        if (!recordingSlip) return;
        await logManualDocumentRecorded(
            {
                slipReference: recordingSlip.slipReference,
                transactionId: recordingSlip.transactionId,
                manualSeries: values.manualSeries,
                manualNumber: values.manualNumber,
                manualAtcud: values.manualAtcud,
                issuedAt: values.issuedAt,
            },
            employee?.id
        );
        setRecordingSlip(null);
        // The reminder is derived from the events, so it clears on reload.
        await reload();
    };

    // Fallback slips whose paper invoice has not been recorded yet, and the
    // distinct providers involved — each backend needs different follow-up.
    const outstanding = useMemo(() => outstandingManualDocuments(rows), [rows]);
    const providersPending = useMemo(
        () => [...new Set(outstanding.map(o => o.provider).filter(Boolean))],
        [outstanding]
    );

    return (
        <div className="ds2-visual-scope space-y-6" style={visualStyle} data-ds2-neutral={prefs.neutralFamilyId}>
            <div className="flex items-center gap-3">
                <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-3 rounded-2xl">
                    <ClipboardList className="w-8 h-8 text-white" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">{t('fiscalAudit.title')}</h1>
                    <p className="text-gray-600 mt-1">
                        {t('fiscalAudit.subtitle')}
                    </p>
                </div>
            </div>

            {/* Sales that completed on a non-fiscal slip still owe a paper invoice.
                The till never re-issues these online (docs/fiscal-fallback-legal-brief.md),
                so this reminder is the only thing that surfaces the outstanding work. */}
            {!loading && !error && outstanding.length > 0 && (
                <div
                    className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6"
                    data-testid="manual-document-reminder"
                >
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-7 w-7 shrink-0 text-amber-600" />
                        <div className="min-w-0">
                            <h2 className="text-xl font-semibold text-amber-900">
                                {t('fiscalAudit.manualPending.title', { count: outstanding.length })}
                            </h2>
                            <p className="mt-1 text-base leading-6 text-amber-900">
                                {t('fiscalAudit.manualPending.body')}
                            </p>
                            <ul className="mt-3 space-y-1 text-base text-amber-900">
                                {providersPending.map(provider => (
                                    <li key={provider} className="flex min-w-0 items-start gap-2">
                                        <span className="shrink-0">•</span>
                                        <span className="min-w-0 break-words">
                                            {t(`fiscalAudit.manualPending.steps.${provider}`)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            <ul className="mt-4 space-y-2">
                                {outstanding.map(slip => (
                                    <li
                                        key={slip.slipReference}
                                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2"
                                    >
                                        <span className="min-w-0 break-all font-mono text-sm text-amber-900">
                                            {slip.slipReference}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setRecordingSlip(slip)}
                                            className="min-h-touch-sm shrink-0 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                                        >
                                            {t('fiscalAudit.manualPending.recordAction')}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {loading && (
                <div className="p-8 text-center text-gray-600 text-xl">{t('fiscalAudit.loading')}</div>
            )}
            {error && (
                <div className="p-6 bg-red-50 border-2 border-red-200 rounded-2xl text-red-800 text-xl">{error}</div>
            )}

            {!loading && !error && (
                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-lg">
                            <thead className="bg-gray-50 text-gray-700 font-semibold">
                                <tr>
                                    <th className="px-4 py-3">{t('fiscalAudit.colTime')}</th>
                                    <th className="px-4 py-3">{t('fiscalAudit.colEvent')}</th>
                                    <th className="px-4 py-3">{t('fiscalAudit.colEmployee')}</th>
                                    <th className="px-4 py-3">{t('fiscalAudit.colPayload')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => (
                                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/80">
                                        <td className="px-4 py-3 whitespace-nowrap font-mono text-base">{r.created_at}</td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-900">
                                                {t(`fiscalAudit.eventTypes.${r.event_type}`, { defaultValue: r.event_type })}
                                            </div>
                                            <div className="font-mono text-sm text-gray-500 mt-0.5">{r.event_type}</div>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-base">{r.employee_id ?? '—'}</td>
                                        <td className="px-4 py-3 font-mono text-sm break-all max-w-xl">{r.payload_json}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {rows.length === 0 && (
                        <p className="p-8 text-center text-gray-500 text-xl">{t('fiscalAudit.empty')}</p>
                    )}
                </div>
            )}

            {recordingSlip && (
                <ManualDocumentDialog
                    slip={recordingSlip}
                    onCancel={() => setRecordingSlip(null)}
                    onSave={saveManualDocument}
                />
            )}
        </div>
    );
};

export default FiscalAudit;
