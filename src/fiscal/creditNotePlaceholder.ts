import { transactionLocalService } from '../lib/localDatabase';

/**
 * Append-only audit hook for credit notes (NC). Wire into a dedicated NC checkout flow when implemented.
 */
export async function recordCreditNoteIssuedAudit(params: {
    employeeId: string;
    payload: Record<string, unknown>;
}): Promise<void> {
    await transactionLocalService.appendFiscalAuditEvent({
        event_type: 'CREDIT_NOTE_ISSUED',
        payload_json: JSON.stringify(params.payload),
        employee_id: params.employeeId,
    });
}
