/** Audit row for a manually-entered weight (scale offline/unavailable).
 *  Local Dexie table — same pattern as cash drawer events. Every manual
 *  weight is attributable: who sold, who authorized (manager/admin PIN),
 *  and why the scale wasn't used. */
export interface LocalManualWeightAudit {
    id: string;
    product_id: string;
    product_name: string;
    weight_kg: number;
    /** Cashier performing the sale. */
    cashier_id: string;
    cashier_name: string;
    /** Manager/admin whose PIN authorized the manual entry. */
    authorized_by_id: string;
    authorized_by_name: string;
    authorized_by_number: string | null;
    /** Scale state that forced manual entry (disconnected/detecting/error/disabled/no-bridge). */
    scale_state: string;
    terminal_id: string;
    timestamp: Date;
    created_at: Date;
}
