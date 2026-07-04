export type AttendanceStatus = 'open' | 'closed';
export type LeaveType = 'holiday' | 'sick' | 'unpaid' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type ContractType = 'permanent' | 'fixed_term' | 'temporary' | 'other';

export interface LocalAttendanceEntry {
    id: string;
    employee_id: string;
    clock_in: Date;
    clock_out: Date | null;
    unpaid_break_minutes: number;
    status: AttendanceStatus;
    notes: string | null;
    adjusted_by_employee_id: string | null;
    adjustment_reason: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface LocalEmployeeHrProfile {
    employee_id: string;
    contract_type: ContractType;
    contract_start_date: string;
    contract_end_date: string | null;
    weekly_hours: number;
    working_days: number[];
    annual_holiday_days: number;
    carried_holiday_days: number;
    holiday_adjustment_days: number;
    internal_notes: string;
    created_at: Date;
    updated_at: Date;
}

export interface LocalLeaveRequest {
    id: string;
    employee_id: string;
    leave_type: LeaveType;
    start_date: string;
    end_date: string;
    working_days: number;
    status: LeaveStatus;
    notes: string;
    reviewed_by_employee_id: string | null;
    reviewed_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export interface EmployeeHrSummary {
    employee_id: string;
    hours_worked: number;
    days_worked: number;
    no_show_days: number;
    holiday_entitlement: number;
    holiday_taken: number;
    holiday_remaining: number;
    contract_start_date: string;
    contract_end_date: string | null;
    contract_days_remaining: number | null;
}
