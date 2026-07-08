import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    AlertTriangle,
    CalendarPlus,
    ChevronLeft,
    ChevronRight,
    FileDown,
    FilePenLine,
    Search,
    UsersRound,
    X,
} from 'lucide-react';

import { useSettings } from '../contexts/SettingsContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { employeeLocalService, initializeLocalDatabase } from '../lib/localDatabase';
import { computeHolidayEntitlement, hrService } from '../services/hrService';
import type {
    EmployeeHrSummary,
    LocalEmployeeHrProfile,
    LocalLeaveRequest,
} from '../types/hr';
import type { LocalEmployee } from '../types/supabase';

const formatContractDate = (value: string | null | undefined): string => {
    if (!value) return '—';
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const toDateKey = (date: Date): string =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const toMonthKey = (date: Date): string =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

// Resolve a "YYYY-MM" picker value into the inclusive [start, end] window to
// report on. The end is capped at "now" so the current (still-open) month only
// counts elapsed days, while a fully-elapsed past month covers its whole length.
const monthKeyToRange = (monthKey: string): { start: Date; end: Date } => {
    const [year, month] = monthKey.split('-').map(Number);
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
    const now = new Date();
    return { start, end: monthEnd < now ? monthEnd : now };
};

const escapeHtml = (value: string): string =>
    value.replace(/[&<>"']/g, char => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string
    ));

// Collapse a sorted list of YYYY-MM-DD keys into inclusive [start, end] blocks
// of consecutive calendar days, so a multi-day selection becomes the fewest
// possible leave requests.
const groupContiguousDates = (sortedKeys: string[]): Array<[string, string]> => {
    const blocks: Array<[string, string]> = [];
    for (const key of sortedKeys) {
        const last = blocks[blocks.length - 1];
        if (last) {
            const next = new Date(`${last[1]}T12:00:00`);
            next.setDate(next.getDate() + 1);
            if (toDateKey(next) === key) {
                last[1] = key;
                continue;
            }
        }
        blocks.push([key, key]);
    }
    return blocks;
};

const mondayFirstOffset = (date: Date): number => (date.getDay() + 6) % 7;

const HR: React.FC = () => {
    const { t } = useTranslation();
    const { employee: signedInEmployee } = useSupabaseAuth();
    const { settings } = useSettings();
    const [employees, setEmployees] = useState<LocalEmployee[]>([]);
    const [summaries, setSummaries] = useState<Record<string, EmployeeHrSummary>>({});
    const [leaveRequests, setLeaveRequests] = useState<LocalLeaveRequest[]>([]);
    const [selectedEmployee, setSelectedEmployee] = useState<LocalEmployee>();
    const [editingProfile, setEditingProfile] = useState<LocalEmployeeHrProfile>();
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [bookingMonth, setBookingMonth] = useState(() => new Date());
    const [selectedHolidayDates, setSelectedHolidayDates] = useState<Set<string>>(new Set());
    const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
    const [bookingMode, setBookingMode] = useState<'single' | 'range'>('range');
    const [reportMonth, setReportMonth] = useState(() => toMonthKey(new Date()));
    const [exporting, setExporting] = useState(false);

    const accrualRate = settings.hr.monthlyHolidayAccrualRate;
    const defaults = useMemo(
        () => ({
            annual_holiday_days: settings.hr.defaultAnnualHolidayDays,
            weekly_hours: settings.hr.defaultWeeklyHours,
        }),
        [settings.hr.defaultAnnualHolidayDays, settings.hr.defaultWeeklyHours]
    );

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            await initializeLocalDatabase();
            const allEmployees = (await employeeLocalService.getAllEmployees())
                .filter(item => item.is_active && !item.deleted_at);
            const [allSummaries, requests] = await Promise.all([
                Promise.all(allEmployees.map(item => hrService.getSummary(item.id, defaults, accrualRate))),
                hrService.getLeaveRequests(),
            ]);
            setEmployees(allEmployees);
            setSummaries(Object.fromEntries(allSummaries.map(summary => [summary.employee_id, summary])));
            setLeaveRequests(requests);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : t('hr.errorLoadData'));
        } finally {
            setLoading(false);
        }
    }, [accrualRate, defaults]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const filteredEmployees = employees.filter(item =>
        `${item.name} ${item.employee_number} ${item.role}`.toLowerCase().includes(search.toLowerCase())
    );
    const expiringContracts = Object.values(summaries).filter(summary =>
        summary.contract_days_remaining !== null &&
        summary.contract_days_remaining >= 0 &&
        summary.contract_days_remaining <= settings.hr.contractExpiryWarningDays
    );

    const openEmployee = async (employee: LocalEmployee) => {
        const profile = await hrService.getHrProfile(employee.id, defaults);
        setSelectedEmployee(employee);
        setEditingProfile(profile);
        setSelectedHolidayDates(new Set());
        setRangeAnchor(null);
        setBookingMonth(new Date());
    };

    const closeEmployee = () => {
        setSelectedEmployee(undefined);
        setEditingProfile(undefined);
        setSelectedHolidayDates(new Set());
        setRangeAnchor(null);
    };

    const bookedHolidayDates = useMemo(() => {
        const set = new Set<string>();
        if (!selectedEmployee) return set;
        for (const request of leaveRequests) {
            if (request.employee_id !== selectedEmployee.id) continue;
            if (request.leave_type !== 'holiday') continue;
            if (request.status === 'rejected' || request.status === 'cancelled') continue;
            const start = new Date(`${request.start_date}T12:00:00`);
            const end = new Date(`${request.end_date}T12:00:00`);
            for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
                set.add(toDateKey(day));
            }
        }
        return set;
    }, [leaveRequests, selectedEmployee]);

    const calendarCells = useMemo<Array<Date | null>>(() => {
        const year = bookingMonth.getFullYear();
        const month = bookingMonth.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const cells: Array<Date | null> = Array.from({ length: mondayFirstOffset(new Date(year, month, 1)) }, () => null);
        for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));
        return cells;
    }, [bookingMonth]);

    const handleSelectHolidayDay = (key: string) => {
        if (bookedHolidayDates.has(key)) return;
        if (bookingMode === 'single') {
            setSelectedHolidayDates(prev => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
            });
            return;
        }
        // Range mode (Airbnb-style): first tap sets the start, second tap fills
        // the inclusive range between the two days, then resets for the next one.
        if (!rangeAnchor) {
            setRangeAnchor(key);
            setSelectedHolidayDates(prev => new Set(prev).add(key));
            return;
        }
        const [from, to] = [rangeAnchor, key].sort();
        const start = new Date(`${from}T12:00:00`);
        const end = new Date(`${to}T12:00:00`);
        setSelectedHolidayDates(prev => {
            const next = new Set(prev);
            for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
                if (!bookedHolidayDates.has(toDateKey(day))) next.add(toDateKey(day));
            }
            return next;
        });
        setRangeAnchor(null);
    };

    const bookSelectedHoliday = async () => {
        if (!selectedEmployee || !editingProfile || !signedInEmployee || selectedHolidayDates.size === 0) return;
        setSaving(true);
        setError('');
        try {
            const blocks = groupContiguousDates([...selectedHolidayDates].sort());
            for (const [start, end] of blocks) {
                await hrService.createApprovedHoliday(selectedEmployee.id, start, end, editingProfile, signedInEmployee.id);
            }
            setSelectedHolidayDates(new Set());
            setRangeAnchor(null);
            const [requests, summary] = await Promise.all([
                hrService.getLeaveRequests(),
                hrService.getSummary(selectedEmployee.id, defaults, accrualRate),
            ]);
            setLeaveRequests(requests);
            setSummaries(prev => ({ ...prev, [selectedEmployee.id]: summary }));
        } catch (bookError) {
            setError(bookError instanceof Error ? bookError.message : t('hr.errorBookHoliday'));
        } finally {
            setSaving(false);
        }
    };

    const saveProfile = async () => {
        if (!editingProfile) return;
        setSaving(true);
        setError('');
        try {
            await hrService.saveHrProfile(editingProfile);
            closeEmployee();
            await loadData();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : t('hr.errorSaveProfile'));
        } finally {
            setSaving(false);
        }
    };

    const employeeName = (employeeId: string): string =>
        employees.find(item => item.id === employeeId)?.name ?? t('hr.unknownEmployee');

    const exportReport = async () => {
        if (employees.length === 0) return;
        setExporting(true);
        setError('');
        try {
            const { start, end } = monthKeyToRange(reportMonth);
            const periodLabel = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })
                .format(start);
            const rangeLabel = `${new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(start)} – ${new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(end)}`;
            const generatedOn = new Intl.DateTimeFormat('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
            }).format(new Date());

            const sorted = [...employees].sort((a, b) => a.name.localeCompare(b.name));
            const periods = await Promise.all(
                sorted.map(employee => hrService.getPeriodAttendance(employee.id, start, end))
            );

            const rows = sorted.map((employee, index) => {
                const period = periods[index];
                const summary = summaries[employee.id];
                return `
                    <tr>
                        <td>
                            <span class="emp-name">${escapeHtml(employee.name)}</span>
                            <span class="emp-num">${escapeHtml(employee.employee_number)}</span>
                        </td>
                        <td class="cap">${escapeHtml(employee.role)}</td>
                        <td class="num">${period.hoursWorked.toFixed(1)}</td>
                        <td class="num">${period.daysWorked}</td>
                        <td class="num">${summary?.holiday_taken ?? 0}</td>
                        <td class="num">${summary?.holiday_remaining ?? 0}</td>
                        <td>${summary?.contract_end_date ?? '—'}</td>
                    </tr>`;
            }).join('');

            const totalHours = periods.reduce((total, period) => total + period.hoursWorked, 0);
            const totalDays = periods.reduce((total, period) => total + period.daysWorked, 0);

            const company = settings.company?.name?.trim() || t('hr.reportDefaultCompany');
            const html = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>${t('hr.reportDocTitle', { period: escapeHtml(periodLabel) })}</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 32px; }
        header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
        h1 { font-size: 20px; margin: 0; }
        .sub { color: #64748b; font-size: 13px; margin-top: 4px; }
        .meta { text-align: right; font-size: 12px; color: #64748b; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #e2e8f0; }
        th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #475569; }
        td.num, th.num { text-align: right; }
        td.cap { text-transform: capitalize; }
        .emp-name { display: block; font-weight: 600; }
        .emp-num { display: block; color: #94a3b8; font-size: 11px; }
        tfoot td { font-weight: 700; border-top: 2px solid #0f172a; border-bottom: none; }
        .note { margin-top: 20px; color: #94a3b8; font-size: 11px; }
        @media print { body { margin: 12mm; } button { display: none; } }
    </style>
</head>
<body>
    <header>
        <div>
            <h1>${escapeHtml(company)}</h1>
            <div class="sub">${t('hr.reportSubtitle', { period: escapeHtml(periodLabel) })}</div>
            <div class="sub">${t('hr.reportPeriodLabel', { range: escapeHtml(rangeLabel) })}</div>
        </div>
        <div class="meta">${t('hr.reportGenerated', { date: escapeHtml(generatedOn) })}<br/>${t('hr.reportEmployeeCount', { count: sorted.length })}</div>
    </header>
    <table>
        <thead>
            <tr>
                <th>${t('hr.reportColEmployee')}</th>
                <th>${t('hr.reportColRole')}</th>
                <th class="num">${t('hr.reportColHours')}</th>
                <th class="num">${t('hr.reportColDays')}</th>
                <th class="num">${t('hr.reportColHolidayTaken')}</th>
                <th class="num">${t('hr.reportColHolidayLeft')}</th>
                <th>${t('hr.contractEnd')}</th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
            <tr>
                <td colspan="2">${t('hr.reportTotal')}</td>
                <td class="num">${totalHours.toFixed(1)}</td>
                <td class="num">${totalDays}</td>
                <td class="num"></td>
                <td class="num"></td>
                <td></td>
            </tr>
        </tfoot>
    </table>
    <p class="note">${t('hr.reportNote')}</p>
</body>
</html>`;

            const win = window.open('', '_blank');
            if (!win) {
                setError(t('hr.errorPopupBlocked'));
                return;
            }
            win.document.open();
            win.document.write(html);
            win.document.close();
            win.focus();
            // Give the new document a tick to lay out before invoking print.
            win.setTimeout(() => win.print(), 300);
        } catch (exportError) {
            setError(exportError instanceof Error ? exportError.message : t('hr.errorExportReport'));
        } finally {
            setExporting(false);
        }
    };

    if (loading) {
        return <div className="flex min-h-96 items-center justify-center text-slate-500">{t('hr.loadingWorkspace')}</div>;
    }

    return (
        <div className="mx-auto max-w-[1500px] space-y-6 pt-6">
            <header className="flex flex-col gap-4 rounded-[2rem] border border-white bg-white/85 p-6 shadow-xl sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">{t('hr.peopleOperationsEyebrow')}</p>
                    <h1 className="mt-1 text-3xl font-semibold text-slate-950">{t('hr.pageTitle')}</h1>
                    <p className="mt-2 text-slate-500">{t('hr.pageSubtitle')}</p>
                </div>
                <div className="relative w-full sm:max-w-sm">
                    <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder={t('hr.searchPlaceholder')}
                        className="min-h-touch-sm w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 outline-none focus:ring-4 focus:ring-slate-200"
                    />
                </div>
            </header>

            {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <SummaryCard icon={UsersRound} label={t('hr.activeEmployees')} value={String(employees.length)} />
                <SummaryCard icon={AlertTriangle} label={t('hr.contractsExpiringSoon')} value={String(expiringContracts.length)} warning={expiringContracts.length > 0} />
            </div>

            {expiringContracts.length > 0 && (
                <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className="h-6 w-6 text-amber-600" />
                        <h2 className="text-lg font-semibold text-amber-950">{t('hr.contractAlerts')}</h2>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {expiringContracts.map(summary => (
                            <div key={summary.employee_id} className="rounded-2xl bg-white p-4 text-sm text-amber-950">
                                <strong>{employeeName(summary.employee_id)}</strong>
                                <p className="mt-1">
                                    {t('hr.contractEndsRemaining', { date: summary.contract_end_date, count: summary.contract_days_remaining })}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section className="rounded-[2rem] border border-white bg-white/85 p-5 shadow-xl">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h2 className="text-xl font-semibold text-slate-950">{t('hr.employeesHeading')}</h2>
                        <p className="text-sm text-slate-500">{t('hr.employeesSubheading')}</p>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                        <label className="text-xs font-semibold text-slate-500">
                            {t('hr.reportPeriod')}
                            <input
                                type="month"
                                value={reportMonth}
                                max={toMonthKey(new Date())}
                                onChange={event => setReportMonth(event.target.value)}
                                className="mt-1 block min-h-touch-sm rounded-2xl border border-slate-300 px-3 text-sm font-medium text-slate-900 outline-none focus:ring-4 focus:ring-slate-200"
                            />
                        </label>
                        <button
                            type="button"
                            disabled={exporting || employees.length === 0}
                            onClick={() => void exportReport()}
                            className="flex min-h-touch-sm items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
                        >
                            <FileDown className="h-4 w-4" />
                            {exporting ? t('hr.preparing') : t('hr.exportPdf')}
                        </button>
                    </div>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {filteredEmployees.map(employee => {
                        const summary = summaries[employee.id];
                        return (
                            <button
                                key={employee.id}
                                type="button"
                                onClick={() => void openEmployee(employee)}
                                className="min-h-70 rounded-3xl border border-slate-200 bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 font-bold text-white">
                                        {employee.name.split(' ').map(part => part[0]).join('').slice(0, 2)}
                                    </div>
                                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-600">{employee.role}</span>
                                </div>
                                <h3 className="mt-4 text-lg font-semibold text-slate-950">{employee.name}</h3>
                                <p className="text-sm text-slate-500">{employee.employee_number}</p>
                                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                                    <Metric label={t('hr.metricDaysWorked')} value={String(summary?.days_worked ?? 0)} />
                                    <Metric label={t('hr.metricNoShows')} value={t('hr.daysAbbrev', { count: summary?.no_show_days ?? 0 })} warning={(summary?.no_show_days ?? 0) > 0} />
                                    <Metric label={t('hr.metricHolidayTaken')} value={t('hr.daysAbbrev', { count: summary?.holiday_taken ?? 0 })} />
                                    <Metric label={t('hr.metricHolidayLeft')} value={t('hr.daysAbbrev', { count: summary?.holiday_remaining ?? 0 })} />
                                    <Metric label={t('hr.contractStart')} value={formatContractDate(summary?.contract_start_date)} />
                                    {summary?.contract_end_date && (
                                        <Metric label={t('hr.contractEnd')} value={formatContractDate(summary.contract_end_date)} />
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </section>

            {selectedEmployee && editingProfile && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4">
                    <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
                        <div className="flex items-start justify-between">
                            <div>
                                <h2 className="text-2xl font-semibold text-slate-950">{selectedEmployee.name}</h2>
                                <p className="text-sm text-slate-500">{t('hr.contractPolicySubtitle')}</p>
                            </div>
                            <button
                                type="button"
                                onClick={closeEmployee}
                                className="flex min-h-touch-xs min-w-[2.75rem] items-center justify-center rounded-2xl bg-slate-100"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="mt-6 grid gap-5 sm:grid-cols-2">
                            <Field label={t('hr.contractStart')}>
                                <input
                                    type="date"
                                    value={editingProfile.contract_start_date}
                                    onChange={event => setEditingProfile({ ...editingProfile, contract_start_date: event.target.value })}
                                    className="min-h-touch-sm w-full rounded-2xl border border-slate-300 px-4"
                                />
                            </Field>
                            <Field label={t('hr.contractEnd')}>
                                <input
                                    type="date"
                                    value={editingProfile.contract_end_date ?? ''}
                                    onChange={event => setEditingProfile({ ...editingProfile, contract_end_date: event.target.value || null })}
                                    className="min-h-touch-sm w-full rounded-2xl border border-slate-300 px-4"
                                />
                            </Field>
                            <Field label={t('hr.carriedDays')}>
                                <input
                                    type="number"
                                    step="0.5"
                                    value={editingProfile.carried_holiday_days}
                                    onChange={event => setEditingProfile({ ...editingProfile, carried_holiday_days: Number(event.target.value) })}
                                    className="min-h-touch-sm w-full rounded-2xl border border-slate-300 px-4"
                                />
                            </Field>
                            <Field label={t('hr.holidayEntitlement')}>
                                <div className="flex min-h-touch-sm flex-col justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2">
                                    <span className="text-lg font-semibold text-slate-950">
                                        {t('hr.entitlementDays', { count: computeHolidayEntitlement(editingProfile, accrualRate) })}
                                    </span>
                                    <span className="text-xs text-slate-500">
                                        {t('hr.accruedSince', { rate: accrualRate, date: editingProfile.contract_start_date })}
                                        {summaries[selectedEmployee.id]
                                            ? t('hr.accruedTakenLeft', { taken: summaries[selectedEmployee.id].holiday_taken, remaining: summaries[selectedEmployee.id].holiday_remaining })
                                            : ''}
                                    </span>
                                </div>
                            </Field>
                            <Field label={t('hr.workingDays')}>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        [1, t('hr.weekdayMon')], [2, t('hr.weekdayTue')], [3, t('hr.weekdayWed')], [4, t('hr.weekdayThu')], [5, t('hr.weekdayFri')], [6, t('hr.weekdaySat')], [0, t('hr.weekdaySun')],
                                    ].map(([day, label]) => {
                                        const numericDay = Number(day);
                                        const selected = editingProfile.working_days.includes(numericDay);
                                        return (
                                            <button
                                                key={day}
                                                type="button"
                                                onClick={() => setEditingProfile({
                                                    ...editingProfile,
                                                    working_days: selected
                                                        ? editingProfile.working_days.filter(item => item !== numericDay)
                                                        : [...editingProfile.working_days, numericDay],
                                                })}
                                                className={`min-h-touch-xs rounded-xl px-3 text-sm font-semibold ${
                                                    selected ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'
                                                }`}
                                            >
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </Field>
                        </div>

                        <div className="mt-5 rounded-3xl border border-slate-200 p-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <CalendarPlus className="h-5 w-5 text-slate-700" />
                                    <h3 className="font-semibold text-slate-950">{t('hr.bookHoliday')}</h3>
                                </div>
                                <div className="inline-flex rounded-2xl bg-slate-100 p-1 text-sm font-semibold">
                                    <button
                                        type="button"
                                        onClick={() => { setBookingMode('range'); setRangeAnchor(null); }}
                                        className={`min-h-touch-xs rounded-xl px-3 ${bookingMode === 'range' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}
                                    >
                                        {t('hr.bookModePeriod')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setBookingMode('single'); setRangeAnchor(null); }}
                                        className={`min-h-touch-xs rounded-xl px-3 ${bookingMode === 'single' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}
                                    >
                                        {t('hr.bookModeSingle')}
                                    </button>
                                </div>
                            </div>
                            <p className="mt-1 text-sm text-slate-500">
                                {bookingMode === 'range'
                                    ? rangeAnchor
                                        ? t('hr.hintTapLastDay')
                                        : t('hr.hintTapFirstLast')
                                    : t('hr.hintTapIndividual')}
                            </p>

                            <div className="mt-4 flex items-center justify-between">
                                <button
                                    type="button"
                                    onClick={() => setBookingMonth(new Date(bookingMonth.getFullYear(), bookingMonth.getMonth() - 1, 1))}
                                    className="flex min-h-touch-xs min-w-[2.75rem] items-center justify-center rounded-2xl bg-slate-100"
                                    aria-label={t('hr.previousMonth')}
                                >
                                    <ChevronLeft className="h-5 w-5" />
                                </button>
                                <span className="font-semibold capitalize text-slate-950">
                                    {new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(bookingMonth)}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setBookingMonth(new Date(bookingMonth.getFullYear(), bookingMonth.getMonth() + 1, 1))}
                                    className="flex min-h-touch-xs min-w-[2.75rem] items-center justify-center rounded-2xl bg-slate-100"
                                    aria-label={t('hr.nextMonth')}
                                >
                                    <ChevronRight className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400">
                                {[
                                    t('hr.weekdayMon'), t('hr.weekdayTue'), t('hr.weekdayWed'),
                                    t('hr.weekdayThu'), t('hr.weekdayFri'), t('hr.weekdaySat'), t('hr.weekdaySun'),
                                ].map((label, index) => <span key={index}>{label}</span>)}
                            </div>
                            <div className="mt-1 grid grid-cols-7 gap-1">
                                {calendarCells.map((date, index) => {
                                    if (!date) return <span key={`blank-${index}`} />;
                                    const key = toDateKey(date);
                                    const booked = bookedHolidayDates.has(key);
                                    const isSelected = selectedHolidayDates.has(key);
                                    const isAnchor = rangeAnchor === key;
                                    const isWorkingDay = editingProfile.working_days.includes(date.getDay());
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            disabled={booked}
                                            onClick={() => handleSelectHolidayDay(key)}
                                            className={`relative flex min-h-touch-sm items-center justify-center rounded-xl text-sm font-semibold transition-colors ${
                                                booked
                                                    ? 'cursor-not-allowed bg-indigo-100 text-indigo-700'
                                                    : isSelected
                                                        ? 'bg-slate-950 text-white'
                                                        : isWorkingDay
                                                            ? 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                                                            : 'bg-white text-slate-300 hover:bg-slate-50'
                                            } ${isAnchor ? 'ring-2 ring-slate-950' : ''}`}
                                        >
                                            {date.getDate()}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                    <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-slate-950" /> {t('hr.legendSelected')}</span>
                                    <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-indigo-100" /> {t('hr.legendBooked')}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {selectedHolidayDates.size > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => { setSelectedHolidayDates(new Set()); setRangeAnchor(null); }}
                                            className="min-h-touch-sm rounded-2xl bg-slate-100 px-4 font-semibold text-slate-600 hover:bg-slate-200"
                                        >
                                            {t('hr.clear')}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        disabled={saving || selectedHolidayDates.size === 0}
                                        onClick={() => void bookSelectedHoliday()}
                                        className="flex min-h-touch-sm items-center gap-2 rounded-2xl bg-emerald-600 px-5 font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
                                    >
                                        <CalendarPlus className="h-4 w-4" />
                                        {saving ? t('hr.booking') : t('hr.bookNDays', { count: selectedHolidayDates.size })}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <Field label={t('hr.internalNotes')}>
                            <textarea
                                value={editingProfile.internal_notes}
                                onChange={event => setEditingProfile({ ...editingProfile, internal_notes: event.target.value })}
                                className="mt-2 min-h-28 w-full rounded-2xl border border-slate-300 p-4"
                            />
                        </Field>
                        <div className="mt-6 flex justify-end">
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() => void saveProfile()}
                                className="flex min-h-touch items-center gap-2 rounded-2xl bg-slate-950 px-6 font-semibold text-white disabled:bg-slate-300"
                            >
                                <FilePenLine className="h-5 w-5" />
                                {saving ? t('common.saving') : t('hr.saveProfile')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const SummaryCard: React.FC<{
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    warning?: boolean;
}> = ({ icon: Icon, label, value, warning = false }) => (
    <div className={`rounded-[2rem] border p-5 shadow-lg ${warning ? 'border-amber-200 bg-amber-50' : 'border-white bg-white/85'}`}>
        <Icon className={`h-6 w-6 ${warning ? 'text-amber-600' : 'text-slate-500'}`} />
        <p className="mt-4 text-sm text-slate-500">{label}</p>
        <p className="mt-1 text-3xl font-semibold text-slate-950">{value}</p>
    </div>
);

const Metric: React.FC<{ label: string; value: string; warning?: boolean }> = ({ label, value, warning = false }) => (
    <div className={`rounded-2xl p-3 ${warning ? 'bg-amber-50' : 'bg-slate-50'}`}>
        <p className={`text-xs ${warning ? 'text-amber-600' : 'text-slate-400'}`}>{label}</p>
        <p className={`mt-1 font-semibold ${warning ? 'text-amber-700' : 'text-slate-950'}`}>{value}</p>
    </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <label className="block text-sm font-semibold text-slate-700">
        {label}
        <div className="mt-2">{children}</div>
    </label>
);

export default HR;
