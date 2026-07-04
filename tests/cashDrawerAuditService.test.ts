import { beforeEach, describe, expect, it } from 'vitest';

import { localDb } from '../src/lib/localDatabase';
import { cashDrawerAuditService } from '../src/services/cashDrawerAuditService';

describe('cash drawer audit service', () => {
    beforeEach(async () => {
        localStorage.clear();
        await localDb.open();
        await localDb.cashDrawerEvents.clear();
    });

    it('requires a justification before a non-sale opening', async () => {
        await expect(cashDrawerAuditService.openManually({
            operator: { id: 'employee-1', name: 'Cashier One', employeeNumber: 'C001' },
            terminal: { label: 'COUNTER 1' },
            reasonCode: 'other',
            justification: '   ',
        })).rejects.toThrow('justification is required');

        expect(await localDb.cashDrawerEvents.count()).toBe(0);
    });

    it('records a failed browser hardware attempt instead of losing the audit event', async () => {
        const event = await cashDrawerAuditService.openManually({
            operator: { id: 'employee-1', name: 'Cashier One', employeeNumber: 'C001' },
            terminal: { label: 'COUNTER 1' },
            reasonCode: 'make_change',
            justification: 'Customer needs change for a banknote.',
        });

        expect(event.action).toBe('open');
        expect(event.trigger).toBe('manual');
        expect(event.justification).toBe('Customer needs change for a banknote.');
        expect(event.success).toBe(false);
        expect(event.hardware_method).toBe('browser_unavailable');
        expect(await localDb.cashDrawerEvents.count()).toBe(1);
    });

    it('links automatic cash-sale openings to the transaction', async () => {
        const event = await cashDrawerAuditService.openForSale({
            operator: { id: 'employee-1', name: 'Cashier One', employeeNumber: 'C001' },
            terminal: { label: 'COUNTER 1' },
            transactionId: 'transaction-1',
            transactionReference: 'FS A/123',
            saleAmount: 24.5,
        });

        expect(event.trigger).toBe('sale');
        expect(event.reason_code).toBe('sale');
        expect(event.transaction_id).toBe('transaction-1');
        expect(event.transaction_reference).toBe('FS A/123');
        expect(event.sale_amount).toBe(24.5);
    });

    it('records physical closure as an operator confirmation', async () => {
        const event = await cashDrawerAuditService.confirmClosed(
            { id: 'employee-1', name: 'Cashier One', employeeNumber: 'C001' },
            { label: 'COUNTER 1' }
        );

        expect(event.action).toBe('close');
        expect(event.success).toBe(true);
        expect(event.hardware_method).toBe('manual_confirmation');
    });
});
