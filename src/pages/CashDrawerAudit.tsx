import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Archive,
    CheckCircle,
    Download,
    Search,
    ShoppingCart,
    Unlock,
} from 'lucide-react';

import { useTranslation } from 'react-i18next';

import { cashDrawerAuditService } from '../services/cashDrawerAuditService';
import type { LocalCashDrawerEvent } from '../types/cashDrawer';
import { useDesignSystem2Customization } from '../contexts/DesignSystem2CustomizationContext';
import '../styles/design-system-2-scope.css';

const escapeCsv = (value: string | number | null): string =>
    `"${String(value ?? '').replace(/"/g, '""')}"`;

const CashDrawerAudit: React.FC = () => {
    const { t } = useTranslation();
    const { visualStyle, prefs } = useDesignSystem2Customization();
    const [events, setEvents] = useState<LocalCashDrawerEvent[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadEvents = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setEvents(await cashDrawerAuditService.list(1000));
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : t('cashDrawerAudit.loadError'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        void loadEvents();
    }, [loadEvents]);

    const filteredEvents = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return events;
        return events.filter(event =>
            [
                event.employee_name,
                event.employee_number,
                event.transaction_reference,
                event.reason_code,
                event.justification,
                event.terminal_label,
                event.error_message,
            ].some(value => value?.toLowerCase().includes(query))
        );
    }, [events, search]);

    const saleOpenCount = events.filter(event => event.action === 'open' && event.trigger === 'sale').length;
    const manualOpenCount = events.filter(event => event.action === 'open' && event.trigger === 'manual').length;
    const failedCount = events.filter(event => !event.success).length;

    const exportCsv = () => {
        const headers = [
            t('cashDrawerAudit.csvTimestamp'),
            t('cashDrawerAudit.csvTerminal'),
            t('cashDrawerAudit.csvEmployee'),
            t('cashDrawerAudit.csvEmployeeNumber'),
            t('cashDrawerAudit.csvAction'),
            t('cashDrawerAudit.csvTrigger'),
            t('cashDrawerAudit.csvReason'),
            t('cashDrawerAudit.csvJustification'),
            t('cashDrawerAudit.csvTransaction'),
            t('cashDrawerAudit.csvSaleAmount'),
            t('cashDrawerAudit.csvSuccess'),
            t('cashDrawerAudit.csvError'),
            t('cashDrawerAudit.csvHardwareMethod'),
        ];
        const rows = filteredEvents.map(event => [
            event.timestamp.toISOString(),
            event.terminal_label,
            event.employee_name,
            event.employee_number,
            event.action,
            event.trigger,
            event.reason_code,
            event.justification,
            event.transaction_reference,
            event.sale_amount,
            event.success ? 'yes' : 'no',
            event.error_message,
            event.hardware_method,
        ]);
        const csv = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `cash-drawer-audit-${new Date().toISOString().slice(0, 10)}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="ds2-visual-scope mx-auto max-w-[1500px] space-y-6 pt-6" style={visualStyle} data-ds2-neutral={prefs.neutralFamilyId}>
            <header className="flex flex-col gap-4 rounded-[2rem] border border-white bg-white/85 p-6 shadow-xl lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">{t('cashDrawerAudit.eyebrow')}</p>
                    <h1 className="mt-1 text-3xl font-semibold text-slate-950">{t('cashDrawerAudit.pageTitle')}</h1>
                    <p className="mt-2 text-slate-500">
                        {t('cashDrawerAudit.subtitle')}
                    </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                        <input
                            value={search}
                            onChange={event => setSearch(event.target.value)}
                            placeholder={t('cashDrawerAudit.searchPlaceholder')}
                            className="min-h-touch-sm w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 outline-none focus:ring-4 focus:ring-slate-200 sm:w-80"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={exportCsv}
                        disabled={filteredEvents.length === 0}
                        className="flex min-h-touch-sm items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 px-5 font-medium text-neutral-50 hover:from-blue-600 hover:to-blue-700 disabled:opacity-50"
                    >
                        <Download className="h-5 w-5" /> {t('cashDrawerAudit.exportCsvButton')}
                    </button>
                </div>
            </header>

            <div className="grid gap-4 sm:grid-cols-4">
                <SummaryCard icon={Archive} label={t('cashDrawerAudit.summaryAllActions')} value={events.length} />
                <SummaryCard icon={ShoppingCart} label={t('cashDrawerAudit.summarySaleOpens')} value={saleOpenCount} />
                <SummaryCard icon={Unlock} label={t('cashDrawerAudit.summaryWithoutSale')} value={manualOpenCount} warning={manualOpenCount > 0} />
                <SummaryCard icon={AlertTriangle} label={t('cashDrawerAudit.summaryFailedAttempts')} value={failedCount} danger={failedCount > 0} />
            </div>

            {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

            <section className="overflow-hidden rounded-[2rem] border border-white bg-white/85 shadow-xl">
                {loading ? (
                    <p className="p-10 text-center text-slate-500">{t('cashDrawerAudit.loading')}</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-5 py-4">{t('cashDrawerAudit.columnTimeTerminal')}</th>
                                    <th className="px-5 py-4">{t('cashDrawerAudit.columnAction')}</th>
                                    <th className="px-5 py-4">{t('cashDrawerAudit.columnOperator')}</th>
                                    <th className="px-5 py-4">{t('cashDrawerAudit.columnReasonJustification')}</th>
                                    <th className="px-5 py-4">{t('cashDrawerAudit.columnSale')}</th>
                                    <th className="px-5 py-4">{t('cashDrawerAudit.columnResult')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredEvents.map(event => (
                                    <tr key={event.id} className="border-t border-slate-200 align-top">
                                        <td className="whitespace-nowrap px-5 py-4">
                                            <p className="font-medium text-slate-950">{event.timestamp.toLocaleString()}</p>
                                            <p className="mt-1 text-xs text-slate-400">{event.terminal_label}</p>
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                                                event.action === 'open'
                                                    ? 'bg-amber-100 text-amber-800'
                                                    : 'bg-emerald-100 text-emerald-800'
                                            }`}>
                                                {event.action} · {event.trigger}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4">
                                            <p className="font-medium text-slate-950">{event.employee_name}</p>
                                            <p className="mt-1 text-xs text-slate-400">{event.employee_number ?? event.employee_id}</p>
                                        </td>
                                        <td className="max-w-md px-5 py-4">
                                            <p className="font-medium capitalize text-slate-950">{event.reason_code.replace(/_/g, ' ')}</p>
                                            <p className="mt-1 text-slate-500">{event.justification ?? t('cashDrawerAudit.automaticCashSaleOpening')}</p>
                                        </td>
                                        <td className="px-5 py-4">
                                            <p className="font-mono text-slate-700">{event.transaction_reference ?? '—'}</p>
                                            {event.sale_amount !== null && (
                                                <p className="mt-1 font-semibold text-slate-950">€{event.sale_amount.toFixed(2)}</p>
                                            )}
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className={`flex items-center gap-2 font-semibold ${
                                                event.success ? 'text-emerald-700' : 'text-red-700'
                                            }`}>
                                                {event.success ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                                                {event.success ? t('cashDrawerAudit.resultSuccess') : t('cashDrawerAudit.resultFailed')}
                                            </div>
                                            <p className="mt-1 max-w-xs text-xs text-slate-400">
                                                {event.error_message ?? event.hardware_method ?? t('cashDrawerAudit.resultRecorded')}
                                            </p>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredEvents.length === 0 && (
                            <p className="p-10 text-center text-slate-500">{t('cashDrawerAudit.emptyState')}</p>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
};

const SummaryCard: React.FC<{
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: number;
    warning?: boolean;
    danger?: boolean;
}> = ({ icon: Icon, label, value, warning = false, danger = false }) => (
    <div className={`rounded-[2rem] border p-5 shadow-lg ${
        danger
            ? 'border-red-200 bg-red-50'
            : warning
                ? 'border-amber-200 bg-amber-50'
                : 'border-white bg-white/85'
    }`}>
        <Icon className={`h-6 w-6 ${danger ? 'text-red-600' : warning ? 'text-amber-600' : 'text-slate-500'}`} />
        <p className="mt-4 text-sm text-slate-500">{label}</p>
        <p className="mt-1 text-3xl font-semibold text-slate-950">{value}</p>
    </div>
);

export default CashDrawerAudit;
