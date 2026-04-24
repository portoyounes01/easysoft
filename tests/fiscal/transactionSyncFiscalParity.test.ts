// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();

vi.mock('../../src/lib/supabase', () => ({
    supabase: {
        rpc: (...args: unknown[]) => mockRpc(...args),
    },
    isSupabaseConfigured: () => true,
    connectionStatus: {
        getStatus: () => ({ isOnline: true, isSupabaseOnline: true }),
    },
}));

vi.mock('../../src/lib/localDatabase', () => ({
    transactionLocalService: {
        getTransactionsNeedingPush: vi.fn(),
        getTransactionItemsNeedingPush: vi.fn(),
        markTransactionsSynced: vi.fn(),
        markTransactionItemsSynced: vi.fn(),
        getPendingSyncOperations: vi.fn().mockResolvedValue([]),
        updateSyncMetadata: vi.fn(),
    },
}));

import { TransactionSyncService } from '../../src/services/transactionSyncService';
import { transactionLocalService } from '../../src/lib/localDatabase';
import type { LocalTransaction } from '../../src/types/supabase';

describe('TransactionSyncService fiscal payload parity', () => {
    const svc = new TransactionSyncService();

    beforeEach(() => {
        vi.clearAllMocks();
        mockRpc.mockResolvedValue({ data: null, error: null });
    });

    it('passes fiscal_metadata_json, fiscal_document_id and cancel fields to upsert_transaction_with_items', async () => {
        const fiscalMeta = {
            hash_base64: 'YmFzZTY0aGFzaA==',
            invoice_no: 'FT A/1',
            atcud: 'ATCUD123',
            sequential_number: 42,
            hash_control: '1',
        };
        const tx: LocalTransaction = {
            id: 'tx-fiscal-1',
            transaction_number: 'TXN001',
            employee_id: 'emp-1',
            employee_name: 'Test',
            customer_id: null,
            customer_name: null,
            transaction_date: '2026-04-20',
            transaction_time: '12:00:00',
            subtotal: 10,
            discount: 0,
            tax: 2.3,
            total: 12.3,
            payment_method: 'cash',
            amount_paid: 12.3,
            change_given: 0,
            status: 'completed',
            notes: null,
            receipt_number: null,
            fiscal_document_id: 'fdoc-1',
            fiscal_metadata_json: JSON.stringify(fiscalMeta),
            fiscal_cancelled_at: null,
            fiscal_cancelled_reason: null,
            fiscal_cancelled_by_employee_id: null,
            created_at: new Date('2026-04-20T12:00:00Z'),
            updated_at: new Date('2026-04-20T12:00:00Z'),
            deleted_at: null,
            needs_push: true,
            last_synced_at: null,
            is_conflicted: false,
        };

        vi.mocked(transactionLocalService.getTransactionsNeedingPush).mockResolvedValue([tx]);
        vi.mocked(transactionLocalService.getTransactionItemsNeedingPush).mockResolvedValue([]);

        await svc.pushTransactions();

        expect(mockRpc).toHaveBeenCalled();
        const call = mockRpc.mock.calls.find((c) => c[0] === 'upsert_transaction_with_items');
        expect(call).toBeDefined();
        const payload = call![1] as { transaction_data: Record<string, unknown> };
        expect(payload.transaction_data.fiscal_document_id).toBe('fdoc-1');
        expect(payload.transaction_data.fiscal_cancelled_at).toBeNull();
        expect(payload.transaction_data.fiscal_metadata_json).toEqual(fiscalMeta);
    });

    it('maps fiscal cancel fields when set', async () => {
        const cancelledAt = '2026-04-20T14:00:00.000Z';
        const tx: LocalTransaction = {
            id: 'tx-cancel-1',
            transaction_number: 'TXN002',
            employee_id: 'emp-1',
            employee_name: 'Test',
            customer_id: null,
            customer_name: null,
            transaction_date: '2026-04-20',
            transaction_time: '12:00:00',
            subtotal: 10,
            discount: 0,
            tax: 2.3,
            total: 12.3,
            payment_method: 'cash',
            amount_paid: 12.3,
            change_given: 0,
            status: 'completed',
            notes: null,
            receipt_number: null,
            fiscal_document_id: 'fdoc-2',
            fiscal_metadata_json: null,
            fiscal_cancelled_at: cancelledAt,
            fiscal_cancelled_reason: 'Erro de operador',
            fiscal_cancelled_by_employee_id: 'emp-admin',
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
            needs_push: true,
            last_synced_at: null,
            is_conflicted: false,
        };

        vi.mocked(transactionLocalService.getTransactionsNeedingPush).mockResolvedValue([tx]);
        vi.mocked(transactionLocalService.getTransactionItemsNeedingPush).mockResolvedValue([]);

        await svc.pushTransactions();

        const call = mockRpc.mock.calls.find((c) => c[0] === 'upsert_transaction_with_items');
        const payload = call![1] as { transaction_data: Record<string, unknown> };
        expect(payload.transaction_data.fiscal_cancelled_at).toBe(cancelledAt);
        expect(payload.transaction_data.fiscal_cancelled_reason).toBe('Erro de operador');
        expect(payload.transaction_data.fiscal_cancelled_by_employee_id).toBe('emp-admin');
    });
});
