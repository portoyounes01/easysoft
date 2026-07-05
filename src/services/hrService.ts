import { employeeLocalService, initializeLocalDatabase, localDb } from '../lib/localDatabase';
import { supabase } from '../lib/supabase';
import type { EmployeeLoginResult } from '../types/supabase';
import type {
    EmployeeHrSummary,
    LeaveStatus,
    LocalAttendanceEntry,
    LocalEmployeeHrProfile,
    LocalLeaveRequest,
} from '../types/hr';
import { generateUUID } from '../utils/uuid';

const MS_PER_DAY = 86_400_000;

const dateKey = (date: Date): string =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const calculateShiftHours = (
    entry: Pick<LocalAttendanceEntry, 'clock_in' | 'clock_out' | 'unpaid_break_minutes'>,
    now = new Date()
): number => {
    const end = entry.clock_out ?? now;
    const elapsedMinutes = Math.max(0, (end.getTime() - entry.clock_in.getTime()) / 60_000);
    return Math.max(0, elapsedMinutes - entry.unpaid_break_minutes) / 60;
};

export const countWorkingDays = (
    startDate: string,
    endDate: string,
    workingDays: number[]
): number => {
    const start = new Date(`${startDate}T12:00:00`);
    const end = new Date(`${endDate}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

    let count = 0;
    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        if (workingDays.includes(cursor.getDay())) count += 1;
    }
    return count;
};

const contractDaysRemaining = (endDate: string | null, now = new Date()): number | null => {
    if (!endDate) return null;
    const end = new Date(`${endDate}T23:59:59`);
    return Math.ceil((end.getTime() - now.getTime()) / MS_PER_DAY);
};

const startOfDay = (date: Date): Date =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());

/**
 * Number of (fractional) months between two dates, never negative. The day of
 * the month contributes a 1/30 fraction so accrual grows smoothly through the
 * month rather than jumping on the 1st.
 */
export const monthsBetween = (start: Date, end: Date): number => {
    if (end <= start) return 0;
    const months =
        (end.getFullYear() - start.getFullYear()) * 12 +
        (end.getMonth() - start.getMonth()) +
        (end.getDate() - start.getDate()) / 30;
    return Math.max(0, months);
};

/**
 * Holiday entitlement accrued so far this year, pro-rata to time employed.
 * Accrues at `monthlyAccrualRate` days per month from the later of the contract
 * start and 1 January, up to today (or the contract end if it already passed),
 * plus any carried-over balance. Rounded to the nearest half day.
 */
export const computeHolidayEntitlement = (
    profile: Pick<LocalEmployeeHrProfile, 'contract_start_date' | 'contract_end_date' | 'carried_holiday_days'>,
    monthlyAccrualRate: number,
    now = new Date()
): number => {
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const contractStart = new Date(`${profile.contract_start_date}T00:00:00`);
    const periodStart = contractStart > yearStart ? contractStart : yearStart;

    let periodEnd = now;
    if (profile.contract_end_date) {
        const contractEnd = new Date(`${profile.contract_end_date}T23:59:59`);
        if (contractEnd < periodEnd) periodEnd = contractEnd;
    }

    const accrued = monthsBetween(periodStart, periodEnd) * monthlyAccrualRate;
    const total = Math.max(0, accrued) + profile.carried_holiday_days;
    return Math.round(total * 2) / 2;
};

/**
 * Scheduled working days, strictly before today, on which the employee neither
 * clocked in nor was on any approved leave (holiday, sick, unpaid or other).
 *
 * The window starts at the latest of: the contract start, 1 January, and the
 * employee's first clock-in. Anchoring on the first clock-in means days before
 * attendance was ever tracked are not counted as no-shows; an employee with no
 * attendance at all yields 0.
 */
export const countNoShowDays = (
    profile: Pick<LocalEmployeeHrProfile, 'contract_start_date' | 'contract_end_date' | 'working_days'>,
    attendance: Pick<LocalAttendanceEntry, 'clock_in'>[],
    approvedLeave: Pick<LocalLeaveRequest, 'start_date' | 'end_date'>[],
    now = new Date()
): number => {
    if (attendance.length === 0) return 0;
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const contractStart = startOfDay(new Date(`${profile.contract_start_date}T00:00:00`));
    const firstClockIn = startOfDay(
        attendance.reduce((earliest, entry) => (entry.clock_in < earliest ? entry.clock_in : earliest), attendance[0].clock_in)
    );
    const cursor = [contractStart, yearStart, firstClockIn].reduce((latest, date) => (date > latest ? date : latest));
    const today = startOfDay(now);
    const contractEnd = profile.contract_end_date
        ? startOfDay(new Date(`${profile.contract_end_date}T00:00:00`))
        : null;

    const workedDates = new Set(attendance.map(entry => dateKey(entry.clock_in)));
    const leaveDates = new Set<string>();
    for (const leave of approvedLeave) {
        const leaveStart = new Date(`${leave.start_date}T12:00:00`);
        const leaveEnd = new Date(`${leave.end_date}T12:00:00`);
        for (let day = new Date(leaveStart); day <= leaveEnd; day.setDate(day.getDate() + 1)) {
            leaveDates.add(dateKey(day));
        }
    }

    let count = 0;
    for (; cursor < today; cursor.setDate(cursor.getDate() + 1)) {
        if (contractEnd && cursor > contractEnd) break;
        if (!profile.working_days.includes(cursor.getDay())) continue;
        const key = dateKey(cursor);
        if (workedDates.has(key) || leaveDates.has(key)) continue;
        count += 1;
    }
    return count;
};

class HrService {
    async verifyEmployeePin(employeeId: string, pin: string): Promise<boolean> {
        await initializeLocalDatabase();
        const employee = await employeeLocalService.getEmployeeById(employeeId);
        if (!employee || !pin.trim()) return false;
        const { data, error } = await supabase.rpc('employee_pin_login', {
            p_employee_number: employee.employee_number,
            p_secret: pin,
        });
        if (error) throw new Error('Could not verify employee credentials. Check the connection and try again.');
        return Boolean((data as EmployeeLoginResult[] | null)?.[0]?.success);
    }

    async getOpenShift(employeeId: string): Promise<LocalAttendanceEntry | undefined> {
        await initializeLocalDatabase();
        return localDb.attendanceEntries
            .where('[employee_id+status]')
            .equals([employeeId, 'open'])
            .first();
    }

    async clockIn(employeeId: string, pin: string): Promise<LocalAttendanceEntry> {
        const pinValid = await this.verifyEmployeePin(employeeId, pin);
        if (!pinValid) throw new Error('Incorrect PIN.');

        const existing = await this.getOpenShift(employeeId);
        if (existing) throw new Error('You are already clocked in.');

        const now = new Date();
        const entry: LocalAttendanceEntry = {
            id: generateUUID(),
            employee_id: employeeId,
            clock_in: now,
            clock_out: null,
            unpaid_break_minutes: 0,
            status: 'open',
            notes: null,
            adjusted_by_employee_id: null,
            adjustment_reason: null,
            created_at: now,
            updated_at: now,
        };
        await localDb.attendanceEntries.add(entry);
        return entry;
    }

    async clockOut(employeeId: string, pin: string): Promise<LocalAttendanceEntry> {
        const pinValid = await this.verifyEmployeePin(employeeId, pin);
        if (!pinValid) throw new Error('Incorrect PIN.');

        const entry = await this.getOpenShift(employeeId);
        if (!entry) throw new Error('There is no open shift to clock out.');

        const clockOut = new Date();
        const updated: LocalAttendanceEntry = {
            ...entry,
            clock_out: clockOut,
            status: 'closed',
            updated_at: clockOut,
        };
        await localDb.attendanceEntries.put(updated);
        return updated;
    }

    async getAttendance(employeeId: string, limit?: number): Promise<LocalAttendanceEntry[]> {
        await initializeLocalDatabase();
        const entries = await localDb.attendanceEntries
            .where('employee_id')
            .equals(employeeId)
            .reverse()
            .sortBy('clock_in');
        entries.sort((left, right) => right.clock_in.getTime() - left.clock_in.getTime());
        return limit ? entries.slice(0, limit) : entries;
    }

    /**
     * Attendance worked within an inclusive [start, end] window, used for the
     * payroll/HR period export. Holiday balances are deliberately left to the
     * year-to-date summary — prorating entitlement into a partial month is not
     * meaningful, so only hours and distinct days worked are period-scoped here.
     */
    async getPeriodAttendance(
        employeeId: string,
        start: Date,
        end: Date
    ): Promise<{ hoursWorked: number; daysWorked: number }> {
        const entries = await this.getAttendance(employeeId);
        const inRange = entries.filter(entry => entry.clock_in >= start && entry.clock_in <= end);
        const days = new Set(inRange.map(entry => dateKey(entry.clock_in)));
        return {
            hoursWorked: inRange.reduce((total, entry) => total + calculateShiftHours(entry), 0),
            daysWorked: days.size,
        };
    }

    async getHrProfile(
        employeeId: string,
        defaults: Pick<LocalEmployeeHrProfile, 'annual_holiday_days' | 'weekly_hours'>
    ): Promise<LocalEmployeeHrProfile> {
        await initializeLocalDatabase();
        const existing = await localDb.employeeHrProfiles.get(employeeId);
        if (existing) return existing;

        const employee = await employeeLocalService.getEmployeeById(employeeId);
        const now = new Date();
        return {
            employee_id: employeeId,
            contract_type: 'permanent',
            contract_start_date: employee?.hire_date ?? dateKey(now),
            contract_end_date: null,
            weekly_hours: defaults.weekly_hours,
            working_days: [1, 2, 3, 4, 5],
            annual_holiday_days: defaults.annual_holiday_days,
            carried_holiday_days: 0,
            holiday_adjustment_days: 0,
            internal_notes: '',
            created_at: now,
            updated_at: now,
        };
    }

    async saveHrProfile(profile: LocalEmployeeHrProfile): Promise<void> {
        await initializeLocalDatabase();
        const existing = await localDb.employeeHrProfiles.get(profile.employee_id);
        await localDb.employeeHrProfiles.put({
            ...profile,
            created_at: existing?.created_at ?? profile.created_at ?? new Date(),
            updated_at: new Date(),
        });
    }

    async getLeaveRequests(employeeId?: string): Promise<LocalLeaveRequest[]> {
        await initializeLocalDatabase();
        const requests = employeeId
            ? await localDb.leaveRequests.where('employee_id').equals(employeeId).toArray()
            : await localDb.leaveRequests.toArray();
        return requests.sort((left, right) => right.start_date.localeCompare(left.start_date));
    }

    async createLeaveRequest(
        request: Omit<LocalLeaveRequest, 'id' | 'working_days' | 'status' | 'reviewed_by_employee_id' | 'reviewed_at' | 'created_at' | 'updated_at'>,
        profile: LocalEmployeeHrProfile
    ): Promise<LocalLeaveRequest> {
        await initializeLocalDatabase();
        const now = new Date();
        const leaveRequest: LocalLeaveRequest = {
            ...request,
            id: generateUUID(),
            working_days: countWorkingDays(request.start_date, request.end_date, profile.working_days),
            status: 'pending',
            reviewed_by_employee_id: null,
            reviewed_at: null,
            created_at: now,
            updated_at: now,
        };
        if (leaveRequest.working_days <= 0) throw new Error('The selected period has no scheduled working days.');
        await localDb.leaveRequests.add(leaveRequest);
        return leaveRequest;
    }

    async reviewLeaveRequest(
        requestId: string,
        status: Extract<LeaveStatus, 'approved' | 'rejected' | 'cancelled'>,
        reviewerEmployeeId: string
    ): Promise<void> {
        await initializeLocalDatabase();
        await localDb.leaveRequests.update(requestId, {
            status,
            reviewed_by_employee_id: reviewerEmployeeId,
            reviewed_at: new Date(),
            updated_at: new Date(),
        });
    }

    async getSummary(
        employeeId: string,
        defaults: Pick<LocalEmployeeHrProfile, 'annual_holiday_days' | 'weekly_hours'>,
        monthlyAccrualRate: number,
        year = new Date().getFullYear()
    ): Promise<EmployeeHrSummary> {
        const [entries, requests, profile] = await Promise.all([
            this.getAttendance(employeeId),
            this.getLeaveRequests(employeeId),
            this.getHrProfile(employeeId, defaults),
        ]);
        const yearEntries = entries.filter(entry => entry.clock_in.getFullYear() === year);
        const workedDates = new Set(yearEntries.map(entry => dateKey(entry.clock_in)));
        const approvedLeave = requests.filter(request => request.status === 'approved');
        const holidayTaken = approvedLeave
            .filter(request =>
                request.leave_type === 'holiday' &&
                Number(request.start_date.slice(0, 4)) === year
            )
            .reduce((total, request) => total + request.working_days, 0);
        const entitlement = computeHolidayEntitlement(profile, monthlyAccrualRate);

        return {
            employee_id: employeeId,
            hours_worked: yearEntries.reduce((total, entry) => total + calculateShiftHours(entry), 0),
            days_worked: workedDates.size,
            no_show_days: countNoShowDays(profile, yearEntries, approvedLeave),
            holiday_entitlement: entitlement,
            holiday_taken: holidayTaken,
            holiday_remaining: entitlement - holidayTaken,
            contract_start_date: profile.contract_start_date,
            contract_end_date: profile.contract_end_date,
            contract_days_remaining: contractDaysRemaining(profile.contract_end_date),
        };
    }

    /**
     * Book holiday for an employee on the manager's behalf. Creates an
     * already-approved holiday leave request for the given inclusive range.
     */
    async createApprovedHoliday(
        employeeId: string,
        startDate: string,
        endDate: string,
        profile: LocalEmployeeHrProfile,
        reviewerEmployeeId: string
    ): Promise<LocalLeaveRequest> {
        await initializeLocalDatabase();
        const now = new Date();
        const leaveRequest: LocalLeaveRequest = {
            id: generateUUID(),
            employee_id: employeeId,
            leave_type: 'holiday',
            start_date: startDate,
            end_date: endDate,
            working_days: countWorkingDays(startDate, endDate, profile.working_days),
            status: 'approved',
            notes: '',
            reviewed_by_employee_id: reviewerEmployeeId,
            reviewed_at: now,
            created_at: now,
            updated_at: now,
        };
        await localDb.leaveRequests.add(leaveRequest);
        return leaveRequest;
    }
}

export const hrService = new HrService();
