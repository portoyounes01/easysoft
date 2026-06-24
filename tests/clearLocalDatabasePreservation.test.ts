import { beforeEach, describe, expect, it } from 'vitest';
import { initializeLocalDatabase, localDb } from '../src/lib/localDatabase';
import { clearLocalDatabasePreservingRecovery } from '../src/utils/clearLocalDatabase';
import type {
  LocalEmployee,
  LocalFiscalDocument,
  LocalTransaction,
  LocalTransactionItem,
  LocalVendusIssueAttempt,
} from '../src/types/supabase';

const now = new Date();

function employee(employeeNumber: string, name: string): LocalEmployee {
  return {
    id: `${employeeNumber}-id`,
    employee_number: employeeNumber,
    name,
    email: null,
    phone: null,
    password_hash: `password-${employeeNumber}`,
    pin: `pin-${employeeNumber}`,
    role: 'admin',
    access_levels: ['all'],
    is_active: true,
    hire_date: '2025-01-01',
    total_sales: 0,
    transaction_count: 0,
    average_transaction: 0,
    hours_worked: 0,
    auth_id: null,
    created_at: now,
    updated_at: now,
    last_synced_at: null,
    deleted_at: null,
    needs_push: false,
    is_conflicted: false,
  };
}

const issueAttempt: LocalVendusIssueAttempt = {
  id: 'attempt-1',
  provider: 'vendus',
  kind: 'sale',
  tx_id: 'tx-1',
  external_reference: 'sale-1',
  status: 'pending',
  vendus_document_id: null,
  local_transaction_id: null,
  request_json: '{}',
  response_json: null,
  error_message: null,
  created_at: '2026-06-24T10:00:00.000Z',
  updated_at: '2026-06-24T10:00:00.000Z',
};

const fiscalTransaction: LocalTransaction = {
  id: 'transaction-1',
  transaction_number: 'FT TEST/1',
  employee_id: 'ADMIN001-id',
  employee_name: 'System Administrator',
  customer_id: null,
  customer_name: null,
  transaction_date: '2026-06-24',
  transaction_time: '10:00:00',
  subtotal: 10,
  discount: 0,
  tax: 2.3,
  total: 12.3,
  payment_method: 'cash',
  amount_paid: 12.3,
  change_given: 0,
  status: 'completed',
  notes: null,
  receipt_number: 'FT TEST/1',
  fiscal_document_id: 'fiscal-1',
  fiscal_metadata_json: '{}',
  created_at: now,
  updated_at: now,
  last_synced_at: null,
  deleted_at: null,
  needs_push: false,
  is_conflicted: false,
};

const fiscalItem: LocalTransactionItem = {
  id: 'item-1',
  transaction_id: fiscalTransaction.id,
  product_id: 'product-1',
  product_name: 'Product',
  product_sku: 'P1',
  category_id: null,
  category_name: null,
  quantity: 1,
  unit_price: 10,
  unit_cost: 2,
  iva_rate: 23,
  line_total: 10,
  tax_amount: 2.3,
  profit_amount: 8,
  discount_amount: 0,
  discount_percentage: 0,
  created_at: now,
  updated_at: now,
  last_synced_at: null,
  deleted_at: null,
  needs_push: false,
  is_conflicted: false,
};

const fiscalDocument: LocalFiscalDocument = {
  id: 'fiscal-1',
  transaction_id: fiscalTransaction.id,
  chain_scope: 'TEST::FT',
  series_key: 'FT TEST',
  at_validation_code: 'TEST',
  sequential_number: 1,
  invoice_no: 'FT TEST/1',
  invoice_type: 'FT',
  invoice_date: '2026-06-24',
  system_entry_date: '2026-06-24T10:00:00',
  gross_total: 12.3,
  net_total: 10,
  tax_total: 2.3,
  hash_base64: 'hash',
  hash_control: '1',
  hash_plaintext: 'plaintext',
  previous_hash_base64: '',
  qr_payload: 'qr',
  source_id: 'POS',
  certification_mode: 'production',
  customer_tax_id: null,
  payment_method: 'cash',
  created_at: '2026-06-24T10:00:00',
  atcud_body: 'TEST-1',
  hash_four_chars: 'h-a-s-h',
  needs_push: false,
};

describe('clearLocalDatabasePreservingRecovery', () => {
  beforeEach(async () => {
    await initializeLocalDatabase();
    await Promise.all(localDb.tables.map(table => table.clear()));
  });

  it('preserves configured system admins and fiscal issue recovery attempts', async () => {
    await localDb.employees.bulkPut([
      employee('ADMIN001', 'System Administrator'),
      employee('ADM001', 'Normal Administrator'),
    ]);
    await localDb.vendusIssueAttempts.put(issueAttempt);
    await localDb.transactions.put(fiscalTransaction);
    await localDb.transactionItems.put(fiscalItem);
    await localDb.fiscalDocuments.put(fiscalDocument);
    await localDb.transactionSyncQueue.put({
      id: 'fiscal-sync-operation',
      type: 'CREATE',
      transactionId: fiscalTransaction.id,
      data: null,
      timestamp: '2026-06-24T10:00:00.000Z',
      retryCount: 0,
    });
    await localDb.syncMetadata.put({
      id: 'transactions',
      lastPulledAt: '2026-06-24T09:00:00.000Z',
      lastPushedAt: null,
      pendingOperations: 1,
      conflictCount: 0,
    });
    await localDb.products.put({
      id: 'product-1',
      sku: 'P1',
      name: 'Product',
      description: null,
      category_id: null,
      price: 1,
      cost: 0,
      stock: 1,
      min_stock: 0,
      max_stock: null,
      unit: 'unit',
      barcode: null,
      tax_rate: 23,
      is_active: true,
      display_order: 1,
      image_url: null,
      supplier: null,
      storage_location: null,
      created_at: now,
      updated_at: now,
      last_synced_at: null,
      deleted_at: null,
      needs_push: false,
      is_conflicted: false,
    });

    const result = await clearLocalDatabasePreservingRecovery();

    expect(result).toEqual({
      preservedSystemAdmins: 1,
      preservedFiscalIssueAttempts: 1,
      preservedFiscalDocuments: 1,
      preservedFiscalTransactions: 1,
    });
    expect(await localDb.employees.toArray()).toMatchObject([
      {
        employee_number: 'ADMIN001',
        password_hash: 'password-ADMIN001',
        pin: 'pin-ADMIN001',
      },
    ]);
    expect(await localDb.vendusIssueAttempts.toArray()).toEqual([issueAttempt]);
    expect(await localDb.fiscalDocuments.toArray()).toMatchObject([{ id: 'fiscal-1' }]);
    expect(await localDb.transactions.toArray()).toMatchObject([{ id: 'transaction-1' }]);
    expect(await localDb.transactionItems.toArray()).toMatchObject([{ id: 'item-1' }]);
    expect(await localDb.transactionSyncQueue.toArray()).toMatchObject([
      { id: 'fiscal-sync-operation', transactionId: 'transaction-1' },
    ]);
    expect(await localDb.syncMetadata.get('transactions')).toMatchObject({
      pendingOperations: 1,
    });
    expect(await localDb.products.count()).toBe(0);
  });

  it('refuses to clear when the signed-in system admin is missing locally', async () => {
    await localDb.employees.put(employee('ADM001', 'Normal Administrator'));

    await expect(clearLocalDatabasePreservingRecovery()).rejects.toThrow(
      'No local system administrator account was found'
    );
    expect(await localDb.employees.count()).toBe(1);
  });
});
