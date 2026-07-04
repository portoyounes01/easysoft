import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, KeyRound, LogIn, LogOut, X } from 'lucide-react';

import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { hrService } from '../../services/hrService';
import type { LocalAttendanceEntry } from '../../types/hr';

export const OPEN_MY_PROFILE_EVENT = 'pos:open-my-profile';

type ClockAction = 'clock-in' | 'clock-out';

const formatClock = (date: Date): string =>
    new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).format(date);

const MyProfileDialog: React.FC = () => {
    const { t } = useTranslation();
    const { employee, signOut } = useSupabaseAuth();
    const [open, setOpen] = useState(false);
    const [openShift, setOpenShift] = useState<LocalAttendanceEntry>();
    const [clockAction, setClockAction] = useState<ClockAction>();
    const [pin, setPin] = useState('');
    const [clockError, setClockError] = useState('');
    const [busy, setBusy] = useState(false);
    const [now, setNow] = useState(new Date());

    const loadData = useCallback(async () => {
        if (!employee) return;
        const shift = await hrService.getOpenShift(employee.id);
        setOpenShift(shift);
    }, [employee]);

    useEffect(() => {
        const handleOpen = () => setOpen(true);
        window.addEventListener(OPEN_MY_PROFILE_EVENT, handleOpen);
        return () => window.removeEventListener(OPEN_MY_PROFILE_EVENT, handleOpen);
    }, []);

    useEffect(() => {
        if (open) void loadData();
    }, [loadData, open]);

    useEffect(() => {
        if (!open) return;
        const timer = window.setInterval(() => setNow(new Date()), 1_000);
        return () => window.clearInterval(timer);
    }, [open]);

    const handleClock = async () => {
        if (!employee || !clockAction) return;
        setBusy(true);
        setClockError('');
        try {
            if (clockAction === 'clock-in') {
                await hrService.clockIn(employee.id, pin);
                setPin('');
                setClockAction(undefined);
                await loadData();
            } else {
                await hrService.clockOut(employee.id, pin);
                // Clocking out ends the session: close the profile and sign out so
                // the next person has to authenticate before using the till.
                setPin('');
                setClockAction(undefined);
                setOpen(false);
                await signOut();
            }
        } catch (error) {
            setClockError(error instanceof Error ? error.message : t('hr.errorRecordAttendance'));
        } finally {
            setBusy(false);
        }
    };

    if (!open || !employee) return null;

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4">
            <div className="flex max-h-[94vh] w-full max-w-md flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                    <div>
                        <h2 className="text-2xl font-semibold text-slate-950">{t('hr.myProfileTitle')}</h2>
                        <p className="text-sm text-slate-500">{t('hr.myProfileSubtitle')}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="flex min-h-touch-xs min-w-[2.75rem] items-center justify-center rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200"
                        aria-label={t('hr.closeProfile')}
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="bg-slate-50 p-5">
                    <div className="text-center">
                        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-purple-600 text-3xl font-bold text-white">
                            {employee.name.split(' ').map(part => part[0]).join('').slice(0, 2)}
                        </div>
                        <h3 className="mt-4 text-xl font-semibold text-slate-950">{employee.name}</h3>
                        <p className="text-sm text-slate-500">{employee.employee_number}</p>
                    </div>

                    <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-950">{t('hr.shiftStatus')}</span>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                openShift ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                                {openShift ? t('hr.clockedIn') : t('hr.notClockedIn')}
                            </span>
                        </div>
                        {!openShift && (
                            <div className="mt-4 flex flex-col items-center rounded-2xl bg-slate-50 py-3">
                                <Clock className="h-5 w-5 text-slate-400" />
                                <span className="mt-1 text-3xl font-semibold tabular-nums tracking-wide text-slate-950">
                                    {formatClock(now)}
                                </span>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                setClockError('');
                                setPin('');
                                setClockAction(openShift ? 'clock-out' : 'clock-in');
                            }}
                            className={`mt-4 flex min-h-touch w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 font-semibold text-white ${
                                openShift
                                    ? 'bg-red-500 hover:bg-red-600'
                                    : 'bg-green-500 hover:bg-green-600'
                            }`}
                        >
                            {openShift ? <LogOut className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
                            {openShift ? t('hr.clockOut') : t('hr.clockIn')}
                        </button>
                    </div>
                </div>
            </div>

            {clockAction && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4">
                    <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
                        <div className="text-center">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                                <KeyRound className="h-7 w-7 text-slate-700" />
                            </div>
                            <h3 className="mt-4 text-2xl font-semibold text-slate-950">
                                {clockAction === 'clock-in' ? t('hr.clockIn') : t('hr.clockOutNow')}
                            </h3>
                            <p className="mt-2 text-slate-500">{t('hr.enterPinPrompt')}</p>
                        </div>
                        <input
                            type="password"
                            autoFocus
                            value={pin}
                            onChange={event => setPin(event.target.value)}
                            onKeyDown={event => {
                                if (event.key === 'Enter') void handleClock();
                            }}
                            placeholder={t('hr.pinPlaceholder')}
                            className="mt-6 min-h-touch w-full rounded-2xl border border-slate-300 px-4 text-center text-2xl tracking-[0.4em] outline-none focus:border-slate-500 focus:ring-4 focus:ring-slate-200"
                        />
                        {clockError && <p className="mt-3 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{clockError}</p>}
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setClockAction(undefined)}
                                className="min-h-touch rounded-2xl bg-slate-100 font-semibold text-slate-700 hover:bg-slate-200"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="button"
                                disabled={busy || !pin}
                                onClick={() => void handleClock()}
                                className={`min-h-touch rounded-2xl font-semibold text-white disabled:bg-slate-300 ${
                                    clockAction === 'clock-out' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
                                }`}
                            >
                                {busy ? t('hr.recording') : clockAction === 'clock-out' ? t('hr.clockOut') : t('hr.clockIn')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MyProfileDialog;
