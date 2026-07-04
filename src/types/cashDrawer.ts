export type CashDrawerAction = 'open' | 'close';
export type CashDrawerTrigger = 'sale' | 'manual';
export type CashDrawerReasonCode =
    | 'sale'
    | 'cash_count'
    | 'cash_drop'
    | 'add_float'
    | 'make_change'
    | 'refund'
    | 'hardware_issue'
    | 'other';

export interface LocalCashDrawerEvent {
    id: string;
    employee_id: string;
    employee_name: string;
    employee_number: string | null;
    transaction_id: string | null;
    transaction_reference: string | null;
    action: CashDrawerAction;
    trigger: CashDrawerTrigger;
    reason_code: CashDrawerReasonCode;
    justification: string | null;
    terminal_id: string;
    terminal_label: string;
    sale_amount: number | null;
    success: boolean;
    error_message: string | null;
    hardware_method: string | null;
    timestamp: Date;
    created_at: Date;
}
