import React, { useEffect, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { initializeLocalDatabase, transactionLocalService } from '../lib/localDatabase';
import type { LocalFiscalAuditEvent } from '../types/supabase';

const FiscalAudit: React.FC = () => {
    const { t } = useTranslation();
    const [rows, setRows] = useState<LocalFiscalAuditEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    return (
        <div className="space-y-6">
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
        </div>
    );
};

export default FiscalAudit;
