import Dexie, { Table } from 'dexie';
import { generateUUID } from '../utils/uuid';
import { readPosTrackInventoryFromStorage } from '../utils/posSettingsStorage';
import {
    LocalEmployee,
    LocalCategory,
    LocalProduct,
    LocalCustomer,
    LocalQueueTicket,
    LocalTransaction,
    LocalTransactionItem,
    LocalDailySalesSummary,
    LocalFiscalDocument,
    LocalFiscalAuditEvent,
    LocalVendusIssueAttempt,
    PendingEmployeeOperation,
    PendingCategoryOperation,
    PendingProductOperation,
    PendingCustomerOperation,
    PendingTransactionOperation,
    SyncMetadata
} from '../types/supabase';
import type {
    ExternalFiscalCheckoutPersistencePayload,
    FiscalCheckoutAtomicPayload,
    FiscalCheckoutResult,
    FiscalTransactionMetadata,
    VendusFiscalCheckoutPersistencePayload,
} from '../fiscal/types';
import type {
    LocalAttendanceEntry,
    LocalEmployeeHrProfile,
    LocalLeaveRequest,
} from '../types/hr';
import type { LocalCashDrawerEvent } from '../types/cashDrawer';
import type {
    LocalPurchaseReceipt,
    LocalPurchaseReceiptLine,
} from '../types/purchaseReceipt';
import type { LocalRawMaterial, LocalRecipeLine } from '../types/rawMaterial';
import { buildHashPlaintext, extractQrHashFourChars } from '../fiscal/signing';
import { buildAtQrPayloadString } from '../fiscal/qrPayload';
import { assertInvoiceSeriesSegment, buildInvoiceNo, computeNextSequential, formatSequential, invoiceSeriesSegment } from '../fiscal/seriesUtils';
const DEXIE_NAME_PRODUCTION = 'POSDatabase';
const DEXIE_NAME_TRAINING = 'restaurante_pos_training';

/** Separate IndexedDB when modo formação — read before first open (reload after toggle). */
export function resolveDexieDbName(): string {
    try {
        if (typeof localStorage !== 'undefined' && localStorage.getItem('pos_dexie_slot') === 'training') {
            return DEXIE_NAME_TRAINING;
        }
    } catch {
        /* ignore */
    }
    return DEXIE_NAME_PRODUCTION;
}

// Local database schema for offline-first POS management
export class LocalPOSDatabase extends Dexie {
    // Core entity tables
    employees!: Table<LocalEmployee>;
    categories!: Table<LocalCategory>;
    products!: Table<LocalProduct>;
    customers!: Table<LocalCustomer>;
    queueTickets!: Table<LocalQueueTicket>;
    attendanceEntries!: Table<LocalAttendanceEntry>;
    employeeHrProfiles!: Table<LocalEmployeeHrProfile>;
    leaveRequests!: Table<LocalLeaveRequest>;
    cashDrawerEvents!: Table<LocalCashDrawerEvent>;
    purchaseReceipts!: Table<LocalPurchaseReceipt>;
    purchaseReceiptLines!: Table<LocalPurchaseReceiptLine>;
    rawMaterials!: Table<LocalRawMaterial>;
    recipeLines!: Table<LocalRecipeLine>;
    transactions!: Table<LocalTransaction>;
    transactionItems!: Table<LocalTransactionItem>;
    fiscalDocuments!: Table<LocalFiscalDocument>;
    fiscalAuditEvents!: Table<LocalFiscalAuditEvent>;
    vendusIssueAttempts!: Table<LocalVendusIssueAttempt>;
    dailySalesSummaries!: Table<LocalDailySalesSummary>;
    
    // Sync queue tables
    employeeSyncQueue!: Table<PendingEmployeeOperation>;
    categorySyncQueue!: Table<PendingCategoryOperation>;
    productSyncQueue!: Table<PendingProductOperation>;
    customerSyncQueue!: Table<PendingCustomerOperation>;
    transactionSyncQueue!: Table<PendingTransactionOperation>;
    
    // Metadata table
    syncMetadata!: Table<SyncMetadata & { id: string }>;

    constructor(dbName?: string) {
        super(dbName ?? DEXIE_NAME_PRODUCTION);

        // Central place for the schema so we can reuse for upgrades
        const schemaV1V2 = {
            employees: 'id, employee_number, name, role, is_active, updated_at, needs_push, deleted_at',
            categories: 'id, name, is_active, display_order, updated_at, needs_push, deleted_at',
            products: 'id, sku, name, category_id, is_active, stock, updated_at, needs_push, deleted_at',
            employeeSyncQueue: 'id, type, employeeId, timestamp, retryCount',
            categorySyncQueue: 'id, type, categoryId, timestamp, retryCount',
            productSyncQueue: 'id, type, productId, timestamp, retryCount',
            syncMetadata: 'id'
        } as const;

        // Extended schema for offline-first POS (v3 and v4)
        const schemaV3V4 = {
            ...schemaV1V2,
            customers: 'id, name, email, phone, is_active, updated_at, needs_push, deleted_at',
            transactions: 'id, transaction_number, employee_id, customer_id, status, transaction_date, updated_at, needs_push, deleted_at',
            transactionItems: 'id, transaction_id, product_id, quantity, updated_at, deleted_at',
            dailySalesSummaries: '[summary_date+employee_id], updated_at',
            customerSyncQueue: 'id, type, customerId, timestamp, retryCount',
            transactionSyncQueue: 'id, type, transactionId, timestamp, retryCount'
        } as const;

        const schemaV5 = {
            ...schemaV3V4,
            fiscalDocuments: 'id, chain_scope, sequential_number, transaction_id, created_at',
            fiscalAuditEvents: 'id, event_type, created_at',
            transactions:
                'id, transaction_number, employee_id, customer_id, status, transaction_date, updated_at, needs_push, deleted_at, fiscal_document_id',
        } as const;

        const schemaV6 = {
            ...schemaV5,
            fiscalDocuments:
                'id, &[chain_scope+sequential_number], transaction_id, chain_scope, sequential_number, created_at',
            customers:
                'id, name, email, phone, tax_number, is_active, updated_at, needs_push, deleted_at',
        } as const;

        // Initial version (for fresh installs) - legacy schema
        this.version(1).stores(schemaV1V2);

        // Bump to version 2 to ensure all object stores exist for older corrupted databases
        // Dexie will add missing stores during upgrade without deleting data
        this.version(2).stores(schemaV1V2);

        // Version 3: Add customers and transactions tables for offline-first POS
        this.version(3).stores(schemaV3V4).upgrade(trans => {
            console.log('Upgrading database to version 3 - adding offline sync tables');
            // Dexie automatically creates new tables defined in the schema
            // No manual migration needed for new tables
        });

        // Version 4: Ensure all new tables are properly created and initialized
        this.version(4).stores(schemaV3V4).upgrade(async trans => {
            console.log('Upgrading database to version 4 - initializing sync metadata');
            // Initialize sync metadata for new entities
            const metadataStore = trans.table('syncMetadata');
            
            // Check and initialize metadata for new entities
            const entitiesToInit = ['customers', 'transactions', 'transaction_items', 'daily_sales_summary'];
            
            for (const entity of entitiesToInit) {
                const existing = await metadataStore.get(entity);
                if (!existing) {
                    await metadataStore.add({
                        id: entity,
                        lastPulledAt: null,
                        lastPushedAt: null,
                        pendingOperations: 0,
                        conflictCount: 0,
                    });
                }
            }
        });

        // Version 5: Portugal AT fiscal_documents + audit + transaction fiscal link
        this.version(5).stores(schemaV5).upgrade(async () => {
            console.log('Upgrading database to version 5 - fiscal documents (AT certification)');
        });

        // Version 6: unique (chain_scope, sequential_number); customer tax_number; fiscal export markers
        this.version(6).stores(schemaV6).upgrade(async trans => {
            const fiscalRows = await trans.table('fiscalDocuments').toArray();
            const counts = new Map<string, number>();
            for (const r of fiscalRows) {
                const k = `${r.chain_scope}::${r.sequential_number}`;
                counts.set(k, (counts.get(k) || 0) + 1);
            }
            const duplicates = [...counts.entries()].filter(([, n]) => n > 1);
            if (duplicates.length > 0) {
                throw new Error(
                    `IndexedDB v6 upgrade blocked: duplicate fiscal sequential — ${duplicates[0][0]}. Resolve duplicates before opening the app.`
                );
            }
            await trans
                .table('fiscalDocuments')
                .toCollection()
                .modify((r: Record<string, unknown>) => {
                    if (r.saft_exported_at === undefined) r.saft_exported_at = null;
                    if (r.saft_export_batch_id === undefined) r.saft_export_batch_id = null;
                });
            await trans
                .table('customers')
                .toCollection()
                .modify((c: Record<string, unknown>) => {
                    if (c.tax_number === undefined) c.tax_number = null;
                });
        });

        // Version 7: fiscal cancellation fields; customer country (QR C:); transaction fiscal cancel mirror
        const schemaV7 = {
            ...schemaV6,
        } as const;

        this.version(7).stores(schemaV7).upgrade(async trans => {
            await trans.table('fiscalDocuments').toCollection().modify((r: Record<string, unknown>) => {
                if (r.cancelled_at === undefined) r.cancelled_at = null;
                if (r.cancelled_reason === undefined) r.cancelled_reason = null;
                if (r.cancelled_by_employee_id === undefined) r.cancelled_by_employee_id = null;
            });
            await trans.table('customers').toCollection().modify((c: Record<string, unknown>) => {
                if (c.country === undefined) c.country = 'PT';
            });
            await trans.table('transactions').toCollection().modify((t: Record<string, unknown>) => {
                if (t.fiscal_cancelled_at === undefined) t.fiscal_cancelled_at = null;
                if (t.fiscal_cancelled_reason === undefined) t.fiscal_cancelled_reason = null;
                if (t.fiscal_cancelled_by_employee_id === undefined) t.fiscal_cancelled_by_employee_id = null;
            });
        });

        const schemaV8 = {
            ...schemaV7,
        } as const;

        this.version(8).stores(schemaV8).upgrade(async trans => {
            await trans.table('customers').toCollection().modify((c: Record<string, unknown>) => {
                if (c.city === undefined) c.city = null;
                if (c.postal_code === undefined) c.postal_code = null;
            });
        });

        const schemaV9 = {
            ...schemaV8,
        } as const;

        this.version(9).stores(schemaV9).upgrade(async trans => {
            await trans.table('fiscalDocuments').toCollection().modify((r: Record<string, unknown>) => {
                if (r.settled_invoice_no === undefined) r.settled_invoice_no = null;
                if (r.settled_invoice_date === undefined) r.settled_invoice_date = null;
            });
        });

        const schemaV10 = {
            ...schemaV9,
            vendusIssueAttempts: 'id, tx_id, external_reference, status, created_at, updated_at',
        } as const;

        this.version(10).stores(schemaV10).upgrade(async () => {
            console.log('Upgrading database to version 10 - Vendus issue attempt log');
        });

        const schemaV11 = {
            ...schemaV10,
            queueTickets:
                'id, &receipt_reference, service_date, status, sequence, created_at, updated_at',
        } as const;

        this.version(11).stores(schemaV11).upgrade(async () => {
            console.log('Upgrading database to version 11 - customer order queue tickets');
        });

        const schemaV12 = {
            ...schemaV11,
            attendanceEntries:
                'id, employee_id, status, clock_in, clock_out, [employee_id+status]',
            employeeHrProfiles:
                'employee_id, contract_type, contract_end_date, updated_at',
            leaveRequests:
                'id, employee_id, leave_type, status, start_date, end_date, [employee_id+status]',
        } as const;

        this.version(12).stores(schemaV12).upgrade(async () => {
            console.log('Upgrading database to version 12 - HR attendance, contracts, and leave');
        });

        const schemaV13 = {
            ...schemaV12,
            cashDrawerEvents:
                'id, employee_id, action, trigger, reason_code, terminal_id, timestamp, transaction_id, [terminal_id+timestamp]',
        } as const;

        this.version(13).stores(schemaV13).upgrade(async () => {
            console.log('Upgrading database to version 13 - append-only cash drawer audit events');
        });

        const schemaV14 = {
            ...schemaV13,
            purchaseReceipts:
                'id, status, supplier_name, document_number, purchase_date, created_at, applied_at',
            purchaseReceiptLines:
                'id, purchase_receipt_id, product_id, resolution, [purchase_receipt_id+resolution]',
        } as const;

        this.version(14).stores(schemaV14).upgrade(async () => {
            console.log('Upgrading database to version 14 - purchase receipt stock imports');
        });

        const schemaV15 = {
            ...schemaV14,
            rawMaterials: 'id, name, is_active, updated_at',
            recipeLines: 'id, product_id, raw_material_id, [product_id+raw_material_id]',
        } as const;

        this.version(15).stores(schemaV15).upgrade(async () => {
            console.log('Upgrading database to version 15 - raw materials & recipes (fiche technique)');
        });

        // Add hooks for auto-updating sync flags
        this.employees.hook('creating', (primKey, obj, trans) => {
            obj.created_at = new Date();
            obj.updated_at = new Date();
            obj.needs_push = true;
            obj.is_conflicted = false;
            obj.last_synced_at = null;
        });

        this.employees.hook('updating', (modifications, primKey, obj, trans) => {
            (modifications as any).updated_at = new Date();
            (modifications as any).needs_push = true;
        });

        this.employees.hook('deleting', (primKey, obj, trans) => {
            // Soft delete - mark as deleted and queue for sync
            return this.employees.update(primKey, {
                deleted_at: new Date(),
                needs_push: true,
            }).then(() => false); // Return false to prevent actual deletion
        });

        // Categories hooks
        this.categories.hook('creating', (primKey, obj, trans) => {
            obj.created_at = new Date();
            obj.updated_at = new Date();
            obj.needs_push = true;
            obj.is_conflicted = false;
            obj.last_synced_at = null;
        });

        this.categories.hook('updating', (modifications, primKey, obj, trans) => {
            (modifications as any).updated_at = new Date();
            (modifications as any).needs_push = true;
        });

        this.categories.hook('deleting', (primKey, obj, trans) => {
            return this.categories.update(primKey, {
                deleted_at: new Date(),
                needs_push: true,
            }).then(() => false);
        });

        // Products hooks
        this.products.hook('creating', (primKey, obj, trans) => {
            obj.created_at = new Date();
            obj.updated_at = new Date();
            obj.needs_push = true;
            obj.is_conflicted = false;
            obj.last_synced_at = null;
        });

        this.products.hook('updating', (modifications, primKey, obj, trans) => {
            (modifications as any).updated_at = new Date();
            (modifications as any).needs_push = true;
        });

        this.products.hook('deleting', (primKey, obj, trans) => {
            return this.products.update(primKey, {
                deleted_at: new Date(),
                needs_push: true,
            }).then(() => false);
        });

        // Customer hooks
        this.customers.hook('creating', (primKey, obj, trans) => {
            obj.created_at = new Date();
            obj.updated_at = new Date();
            obj.needs_push = true;
            obj.is_conflicted = false;
            obj.last_synced_at = null;
        });

        this.customers.hook('updating', (modifications, primKey, obj, trans) => {
            (modifications as any).updated_at = new Date();
            (modifications as any).needs_push = true;
        });

        this.customers.hook('deleting', (primKey, obj, trans) => {
            return this.customers.update(primKey, {
                deleted_at: new Date(),
                needs_push: true,
            }).then(() => false);
        });

        // Transaction hooks
        this.transactions.hook('creating', (primKey, obj, trans) => {
            obj.created_at = new Date();
            obj.updated_at = new Date();
            obj.needs_push = true;
            obj.is_conflicted = false;
            obj.last_synced_at = null;
        });

        this.transactions.hook('updating', (modifications, primKey, obj, trans) => {
            (modifications as any).updated_at = new Date();
            (modifications as any).needs_push = true;
        });

        this.transactions.hook('deleting', (primKey, obj, trans) => {
            return this.transactions.update(primKey, {
                deleted_at: new Date(),
                needs_push: true,
            }).then(() => false);
        });

        // Transaction Items hooks
        this.transactionItems.hook('creating', (primKey, obj, trans) => {
            obj.created_at = new Date();
            obj.updated_at = new Date();
            obj.needs_push = true;
            obj.is_conflicted = false;
            obj.last_synced_at = null;
        });

        this.transactionItems.hook('updating', (modifications, primKey, obj, trans) => {
            (modifications as any).updated_at = new Date();
            (modifications as any).needs_push = true;
        });

        this.transactionItems.hook('deleting', (primKey, obj, trans) => {
            return this.transactionItems.update(primKey, {
                deleted_at: new Date(),
                needs_push: true,
            }).then(() => false);
        });

        // Daily Sales Summary hooks
        this.dailySalesSummaries.hook('creating', (primKey, obj, trans) => {
            obj.created_at = new Date();
            obj.updated_at = new Date();
            obj.needs_push = true;
            obj.is_conflicted = false;
        });

        this.dailySalesSummaries.hook('updating', (modifications, primKey, obj, trans) => {
            (modifications as any).updated_at = new Date();
            (modifications as any).needs_push = true;
        });
    }
}

// Create singleton instance (name fixed at first import — reload app after switching pos_dexie_slot)
export const localDb = new LocalPOSDatabase(resolveDexieDbName());

// Initialize sync metadata if it doesn't exist
export const initializeSyncMetadata = async (): Promise<void> => {
    const entities = ['employees', 'categories', 'products', 'customers', 'transactions', 'transaction_items', 'daily_sales_summary'];
    
    for (const entity of entities) {
        const existing = await localDb.syncMetadata.get(entity);
        if (!existing) {
            await localDb.syncMetadata.add({
                id: entity,
                lastPulledAt: null,
                lastPushedAt: null,
                pendingOperations: 0,
                conflictCount: 0,
            });
        }
    }
};

// Database operations with sync queue management
export class EmployeeLocalService {

    // Get all non-deleted employees (includes active and inactive)
    async getAllEmployees(): Promise<LocalEmployee[]> {
        return await localDb.employees
            .filter(emp => emp.deleted_at === null)
            .toArray();
    }

    // Get employee by ID
    async getEmployeeById(id: string): Promise<LocalEmployee | undefined> {
        return await localDb.employees
            .filter(emp => emp.id === id && emp.deleted_at === null)
            .first();
    }

    // Get employee by employee number
    async getEmployeeByNumber(employeeNumber: string): Promise<LocalEmployee | undefined> {
        return await localDb.employees
            .filter(emp => emp.employee_number === employeeNumber && emp.deleted_at === null)
            .first();
    }

    // Create new employee
    async createEmployee(employeeData: Omit<LocalEmployee, 'id' | 'created_at' | 'updated_at' | 'needs_push' | 'is_conflicted' | 'last_synced_at'>): Promise<string> {
        const id = generateUUID();
        const employee: LocalEmployee = {
            ...employeeData,
            id,
            created_at: new Date(),
            updated_at: new Date(),
            needs_push: true,
            is_conflicted: false,
            last_synced_at: null,
        };

        await localDb.transaction('rw', [localDb.employees, localDb.employeeSyncQueue, localDb.syncMetadata], async () => {
            await localDb.employees.add(employee);
            await this.queueOperation('CREATE', id, employee);
        });

        return id;
    }

    // Update employee
    async updateEmployee(id: string, updates: Partial<LocalEmployee>): Promise<void> {
        const updateData = {
            ...updates,
            updated_at: new Date(),
            needs_push: true,
        };

        await localDb.transaction('rw', [localDb.employees, localDb.employeeSyncQueue, localDb.syncMetadata], async () => {
            await localDb.employees.update(id, updateData);
            await this.queueOperation('UPDATE', id, updateData);
        });
    }

    // Soft delete employee
    async deleteEmployee(id: string): Promise<void> {
        await localDb.transaction('rw', [localDb.employees, localDb.employeeSyncQueue, localDb.syncMetadata], async () => {
            await localDb.employees.update(id, {
                deleted_at: new Date(),
                is_active: false,
                needs_push: true,
                updated_at: new Date(),
            });
            await this.queueOperation('DELETE', id, null);
        });
    }

    // Search employees
    async searchEmployees(query: string): Promise<LocalEmployee[]> {
        const normalizedQuery = query.toLowerCase();
        return await localDb.employees
            .filter(emp =>
                emp.deleted_at === null &&
                (emp.name.toLowerCase().includes(normalizedQuery) ||
                    emp.employee_number.toLowerCase().includes(normalizedQuery) ||
                    ((emp.email ?? '').toLowerCase().includes(normalizedQuery)))
            )
            .toArray();
    }

    // Filter employees by role
    async getEmployeesByRole(role: string): Promise<LocalEmployee[]> {
        return await localDb.employees
            .filter(emp => emp.role === role && emp.deleted_at === null && emp.is_active === true)
            .toArray();
    }

    // Queue sync operation
    private async queueOperation(
        type: 'CREATE' | 'UPDATE' | 'DELETE',
        employeeId: string,
        data: any
    ): Promise<void> {
        const operation: PendingEmployeeOperation = {
            id: generateUUID(),
            type,
            employeeId,
            data,
            timestamp: new Date().toISOString(),
            retryCount: 0,
        };

        await localDb.employeeSyncQueue.add(operation);
        await this.updateSyncMetadata({ pendingOperations: 1 }); // Increment counter
    }

    // Get pending sync operations
    async getPendingSyncOperations(): Promise<PendingEmployeeOperation[]> {
        return await localDb.employeeSyncQueue.orderBy('timestamp').toArray();
    }

    // Clear sync operation after successful sync
    async clearSyncOperation(operationId: string): Promise<void> {
        await localDb.transaction('rw', [localDb.employeeSyncQueue, localDb.syncMetadata], async () => {
            await localDb.employeeSyncQueue.delete(operationId);
            await this.updateSyncMetadata({ pendingOperations: -1 }); // Decrement counter
        });
    }

    // Mark sync operation as failed
    async markSyncOperationFailed(operationId: string, error: string): Promise<void> {
        const operation = await localDb.employeeSyncQueue.get(operationId);
        if (operation) {
            await localDb.employeeSyncQueue.update(operationId, {
                retryCount: operation.retryCount + 1,
                error,
            });
        }
    }

    // Bulk insert employees from server (during pull sync)
    async bulkInsertFromServer(employees: any[]): Promise<void> {
        await localDb.transaction('rw', [localDb.employees], async () => {
            for (const employee of employees) {
                // Convert string dates to Date objects
                const localEmployee: LocalEmployee = {
                    ...employee,
                    created_at: new Date(employee.created_at),
                    updated_at: new Date(employee.updated_at),
                    last_synced_at: employee.last_synced_at ? new Date(employee.last_synced_at) : null,
                    deleted_at: employee.deleted_at ? new Date(employee.deleted_at) : null,
                    needs_push: false, // Data from server doesn't need to be pushed
                    is_conflicted: false,
                };

                // Check if employee already exists by employee_number to prevent duplicates
                const existing = await localDb.employees
                    .where('employee_number')
                    .equals(employee.employee_number)
                    .first();

                if (existing) {
                    // Update existing employee but keep the local ID
                    await localDb.employees.update(existing.id, {
                        ...localEmployee,
                        id: existing.id, // Keep the original local ID
                    });
                } else {
                    // Insert new employee with server ID
                    await localDb.employees.put(localEmployee);
                }
            }
        });
    }

    // Update sync metadata
    async updateSyncMetadata(updates: Partial<SyncMetadata>): Promise<void> {
        try {
            const current = await localDb.syncMetadata.get('employees');
            if (current) {
                const newData = { ...current, ...updates };

                // Handle pending operations counter
                if (updates.pendingOperations !== undefined) {
                    newData.pendingOperations = Math.max(0, current.pendingOperations + updates.pendingOperations);
                }

                await localDb.syncMetadata.put(newData);
            } else {
                // Initialize if doesn't exist
                const initialData = {
                    id: 'employees',
                    lastPulledAt: updates.lastPulledAt || null,
                    lastPushedAt: updates.lastPushedAt || null,
                    pendingOperations: updates.pendingOperations || 0,
                    conflictCount: updates.conflictCount || 0,
                };
                await localDb.syncMetadata.put(initialData);
            }
        } catch (error) {
            console.warn('Failed to update sync metadata:', error);
            // Don't throw error to prevent breaking the main operation
        }
    }

    // Get sync metadata
    async getSyncMetadata(): Promise<SyncMetadata | null> {
        const data = await localDb.syncMetadata.get('employees');
        return data ? {
            lastPulledAt: data.lastPulledAt,
            lastPushedAt: data.lastPushedAt,
            pendingOperations: data.pendingOperations,
            conflictCount: data.conflictCount,
        } : null;
    }

    // Get employees that need to be pushed to server
    async getEmployeesNeedingPush(): Promise<LocalEmployee[]> {
        return await localDb.employees
            .filter(emp => emp.needs_push === true)
            .toArray();
    }

    // Mark employees as synced
    async markEmployeesSynced(employeeIds: string[]): Promise<void> {
        const now = new Date();
        await localDb.transaction('rw', [localDb.employees], async () => {
            for (const id of employeeIds) {
                await localDb.employees.update(id, {
                    needs_push: false,
                    last_synced_at: now,
                });
            }
        });
    }

    // Clear all data (for testing or reset)
    async clearAllData(): Promise<void> {
        await localDb.transaction('rw', [localDb.employees, localDb.employeeSyncQueue, localDb.syncMetadata], async () => {
            await localDb.employees.clear();
            await localDb.employeeSyncQueue.clear();
            await localDb.syncMetadata.clear();
            await initializeSyncMetadata();
        });
    }

    // Get database statistics
    async getStats(): Promise<{
        totalEmployees: number;
        activeEmployees: number;
        deletedEmployees: number;
        pendingSync: number;
        lastSync: Date | null;
    }> {
        const [total, active, deleted, pending, syncMeta] = await Promise.all([
            localDb.employees.count(),
            localDb.employees.filter(emp => emp.is_active && emp.deleted_at === null).count(),
            localDb.employees.filter(emp => emp.deleted_at !== null).count(),
            localDb.employeeSyncQueue.count(),
            this.getSyncMetadata(),
        ]);

        return {
            totalEmployees: total,
            activeEmployees: active,
            deletedEmployees: deleted,
            pendingSync: pending,
            lastSync: syncMeta?.lastPulledAt ? new Date(syncMeta.lastPulledAt) : null,
        };
    }
}

// Export singleton service instance
export const employeeLocalService = new EmployeeLocalService();

// =====================================================
// CUSTOMER LOCAL SERVICE
// =====================================================

export class CustomerLocalService {

    // Get all non-deleted customers (includes active and inactive)
    async getAllCustomers(): Promise<LocalCustomer[]> {
        return await localDb.customers
            .filter(customer => customer.deleted_at === null)
            .toArray();
    }

    // Get customer by ID
    async getCustomerById(id: string): Promise<LocalCustomer | undefined> {
        return await localDb.customers
            .filter(customer => customer.id === id && customer.deleted_at === null)
            .first();
    }

    // Get customer by email
    async getCustomerByEmail(email: string): Promise<LocalCustomer | undefined> {
        return await localDb.customers
            .filter(customer => customer.email === email && customer.deleted_at === null)
            .first();
    }

    // Get customer by phone
    async getCustomerByPhone(phone: string): Promise<LocalCustomer | undefined> {
        return await localDb.customers
            .filter(customer => customer.phone === phone && customer.deleted_at === null)
            .first();
    }

    // Create new customer
    async createCustomer(customerData: Omit<LocalCustomer, 'id' | 'created_at' | 'updated_at' | 'needs_push' | 'is_conflicted' | 'last_synced_at'>): Promise<string> {
        const taxRaw = customerData.tax_number;
        const normalizedNew =
            taxRaw == null || String(taxRaw).trim() === ''
                ? ''
                : String(taxRaw).replace(/\s/g, '').toUpperCase();

        const id = generateUUID();
        const customer: LocalCustomer = {
            ...customerData,
            country: customerData.country ?? 'PT',
            city: customerData.city ?? null,
            postal_code: customerData.postal_code ?? null,
            id,
            deleted_at: customerData.deleted_at ?? null,
            created_at: new Date(),
            updated_at: new Date(),
            needs_push: true,
            is_conflicted: false,
            last_synced_at: null,
        };

        await localDb.transaction('rw', [localDb.customers], async () => {
            if (normalizedNew) {
                const existing = await localDb.customers
                    .filter(
                        (c) =>
                            c.deleted_at == null &&
                            (c.tax_number ?? '').replace(/\s/g, '').toUpperCase() === normalizedNew
                    )
                    .first();
                if (existing) {
                    throw new Error('DUPLICATE_TAX_NUMBER');
                }
            }
            await localDb.customers.add(customer);
        });
        await this.queueOperation('CREATE', id, customer);

        return id;
    }

    // Update customer
    async updateCustomer(id: string, updates: Partial<LocalCustomer>): Promise<void> {
        const updateData = {
            ...updates,
            updated_at: new Date(),
            needs_push: true,
        };

        await localDb.transaction('rw', [localDb.customers], async () => {
            await localDb.customers.update(id, updateData);
        });
        await this.queueOperation('UPDATE', id, updateData);
    }

    // Soft delete customer
    async deleteCustomer(id: string): Promise<void> {
        await localDb.transaction('rw', [localDb.customers], async () => {
            await localDb.customers.update(id, {
                deleted_at: new Date(),
                is_active: false,
                needs_push: true,
                updated_at: new Date(),
            });
        });
        await this.queueOperation('DELETE', id, null);
    }

    // Search customers
    async searchCustomers(query: string): Promise<LocalCustomer[]> {
        const normalizedQuery = query.toLowerCase();
        return await localDb.customers
            .filter(customer =>
                customer.deleted_at === null &&
                (customer.name.toLowerCase().includes(normalizedQuery) ||
                    ((customer.tax_number ?? '').toLowerCase().includes(normalizedQuery)) ||
                    ((customer.email ?? '').toLowerCase().includes(normalizedQuery)) ||
                    ((customer.phone ?? '').toLowerCase().includes(normalizedQuery)))
            )
            .toArray();
    }

    // Filter customers by active status
    async getActiveCustomers(): Promise<LocalCustomer[]> {
        return await localDb.customers
            .filter(customer => customer.is_active === true && customer.deleted_at === null)
            .toArray();
    }

    // Queue sync operation
    private async queueOperation(
        type: 'CREATE' | 'UPDATE' | 'DELETE',
        customerId: string,
        data: any
    ): Promise<void> {
        const operation: PendingCustomerOperation = {
            id: generateUUID(),
            type,
            customerId,
            data,
            timestamp: new Date().toISOString(),
            retryCount: 0,
        };

        await localDb.customerSyncQueue.add(operation);
        await this.updateSyncMetadata({ pendingOperations: 1 }); // Increment counter
    }

    // Get pending sync operations
    async getPendingSyncOperations(): Promise<PendingCustomerOperation[]> {
        return await localDb.customerSyncQueue.orderBy('timestamp').toArray();
    }

    // Clear sync operation after successful sync
    async clearSyncOperation(operationId: string): Promise<void> {
        await localDb.transaction('rw', [localDb.customerSyncQueue, localDb.syncMetadata], async () => {
            await localDb.customerSyncQueue.delete(operationId);
            await this.updateSyncMetadata({ pendingOperations: -1 }); // Decrement counter
        });
    }

    // Mark sync operation as failed
    async markSyncOperationFailed(operationId: string, error: string): Promise<void> {
        const operation = await localDb.customerSyncQueue.get(operationId);
        if (operation) {
            await localDb.customerSyncQueue.update(operationId, {
                retryCount: operation.retryCount + 1,
                error,
            });
        }
    }

    // Bulk insert customers from server (during pull sync)
    async bulkInsertFromServer(customers: any[]): Promise<void> {
        await localDb.transaction('rw', [localDb.customers], async () => {
            for (const customer of customers) {
                // Convert string dates to Date objects
                const localCustomer: LocalCustomer = {
                    ...customer,
                    tax_number: customer.tax_number ?? null,
                    country: customer.country ?? 'PT',
                    city: customer.city ?? null,
                    postal_code: customer.postal_code ?? null,
                    created_at: new Date(customer.created_at),
                    updated_at: new Date(customer.updated_at),
                    last_synced_at: customer.last_synced_at ? new Date(customer.last_synced_at) : null,
                    deleted_at: customer.deleted_at ? new Date(customer.deleted_at) : null,
                    needs_push: false, // Data from server doesn't need to be pushed
                    is_conflicted: false,
                };

                // Check if customer already exists by email or phone to prevent duplicates
                const existing = await localDb.customers
                    .filter(c => c.id === customer.id || 
                        (customer.email && c.email === customer.email) ||
                        (customer.phone && c.phone === customer.phone))
                    .first();

                if (existing) {
                    // Update existing customer but keep the local ID
                    await localDb.customers.update(existing.id, {
                        ...localCustomer,
                        id: existing.id, // Keep the original local ID
                    });
                } else {
                    // Insert new customer with server ID
                    await localDb.customers.put(localCustomer);
                }
            }
        });
    }

    // Update sync metadata
    async updateSyncMetadata(updates: Partial<SyncMetadata>): Promise<void> {
        try {
            const current = await localDb.syncMetadata.get('customers');
            if (current) {
                const newData = { ...current, ...updates };

                // Handle pending operations counter
                if (updates.pendingOperations !== undefined) {
                    newData.pendingOperations = Math.max(0, current.pendingOperations + updates.pendingOperations);
                }

                await localDb.syncMetadata.put(newData);
            } else {
                // Initialize if doesn't exist
                const initialData = {
                    id: 'customers',
                    lastPulledAt: updates.lastPulledAt || null,
                    lastPushedAt: updates.lastPushedAt || null,
                    pendingOperations: updates.pendingOperations || 0,
                    conflictCount: updates.conflictCount || 0,
                };
                await localDb.syncMetadata.put(initialData);
            }
        } catch (error) {
            console.warn('Failed to update customer sync metadata:', error);
            // Don't throw error to prevent breaking the main operation
        }
    }

    // Get sync metadata
    async getSyncMetadata(): Promise<SyncMetadata | null> {
        const data = await localDb.syncMetadata.get('customers');
        return data ? {
            lastPulledAt: data.lastPulledAt,
            lastPushedAt: data.lastPushedAt,
            pendingOperations: data.pendingOperations,
            conflictCount: data.conflictCount,
        } : null;
    }

    // Get customers that need to be pushed to server
    async getCustomersNeedingPush(): Promise<LocalCustomer[]> {
        return await localDb.customers
            .filter(customer => customer.needs_push === true)
            .toArray();
    }

    // Mark customers as synced
    async markCustomersSynced(customerIds: string[]): Promise<void> {
        const now = new Date();
        await localDb.transaction('rw', [localDb.customers], async () => {
            for (const id of customerIds) {
                await localDb.customers.update(id, {
                    needs_push: false,
                    last_synced_at: now,
                });
            }
        });
    }

    // Clear all data (for testing or reset)
    async clearAllData(): Promise<void> {
        await localDb.transaction('rw', [localDb.customers, localDb.customerSyncQueue, localDb.syncMetadata], async () => {
            await localDb.customers.clear();
            await localDb.customerSyncQueue.clear();
            // Reset sync metadata for customers
            await localDb.syncMetadata.put({
                id: 'customers',
                lastPulledAt: null,
                lastPushedAt: null,
                pendingOperations: 0,
                conflictCount: 0,
            });
        });
    }

    // Get database statistics
    async getStats(): Promise<{
        totalCustomers: number;
        activeCustomers: number;
        deletedCustomers: number;
        pendingSync: number;
        lastSync: Date | null;
    }> {
        const [total, active, deleted, pending, syncMeta] = await Promise.all([
            localDb.customers.count(),
            localDb.customers.filter(customer => customer.is_active && customer.deleted_at === null).count(),
            localDb.customers.filter(customer => customer.deleted_at !== null).count(),
            localDb.customerSyncQueue.count(),
            this.getSyncMetadata(),
        ]);

        return {
            totalCustomers: total,
            activeCustomers: active,
            deletedCustomers: deleted,
            pendingSync: pending,
            lastSync: syncMeta?.lastPulledAt ? new Date(syncMeta.lastPulledAt) : null,
        };
    }
}

// Export singleton service instance
export const customerLocalService = new CustomerLocalService();

// =====================================================
// TRANSACTION LOCAL SERVICE
// =====================================================

export class TransactionLocalService {

    /** After a successful direct Supabase insert, avoid duplicate push from sync queue. */
    async markTransactionSyncedFromServer(transactionId: string): Promise<void> {
        const now = new Date();
        await localDb.transaction('rw', [localDb.transactions, localDb.transactionItems, localDb.transactionSyncQueue], async () => {
            await localDb.transactions.update(transactionId, {
                needs_push: false,
                last_synced_at: now,
                updated_at: now,
            });
            await localDb.transactionItems
                .where('transaction_id')
                .equals(transactionId)
                .modify({
                    needs_push: false,
                    last_synced_at: now,
                    updated_at: now,
                });
            const ops = await localDb.transactionSyncQueue
                .filter(op => op.transactionId === transactionId)
                .toArray();
            for (const op of ops) {
                await localDb.transactionSyncQueue.delete(op.id);
            }
        });
    }

    // Get all non-deleted transactions (includes all statuses)
    async getAllTransactions(): Promise<LocalTransaction[]> {
        const list = await localDb.transactions
            .filter(transaction => transaction.deleted_at === null)
            .toArray();
        // Sort by created_at desc
        list.sort((a, b) => (b.created_at as Date).getTime() - (a.created_at as Date).getTime());
        return list;
    }

    // Get transaction by ID with items
    async getTransactionById(id: string): Promise<(LocalTransaction & { items: LocalTransactionItem[] }) | undefined> {
        const transaction = await localDb.transactions
            .filter(t => t.id === id && t.deleted_at === null)
            .first();
        
        if (!transaction) return undefined;

        const items = await localDb.transactionItems
            .filter(item => item.transaction_id === id && item.deleted_at === null)
            .toArray();

        return { ...transaction, items };
    }

    async getFiscalDocumentById(id: string): Promise<LocalFiscalDocument | undefined> {
        return localDb.fiscalDocuments.get(id);
    }

    /** True if a payment receipt (RG) already settles this sale (same FT/FS ref in chain). */
    async hasReciboForOriginalTransaction(originalTransactionId: string): Promise<boolean> {
        const origTx = await this.getTransactionById(originalTransactionId);
        if (!origTx?.fiscal_document_id) return false;
        const origFiscal = await this.getFiscalDocumentById(origTx.fiscal_document_id);
        if (!origFiscal) return false;
        const settledNo = origFiscal.invoice_no;
        const settledDate = origFiscal.invoice_date;
        const chain = origFiscal.chain_scope;
        const matches = await localDb.fiscalDocuments
            .where('chain_scope')
            .equals(chain)
            .filter(
                d =>
                    d.invoice_type === 'RG' &&
                    d.settled_invoice_no === settledNo &&
                    (d.settled_invoice_date ?? '') === settledDate &&
                    !d.cancelled_at
            )
            .first();
        return Boolean(matches);
    }

    /** True if a credit note (NC) was already issued for this original sale (settled invoice ref). */
    async hasCreditNoteForOriginalTransaction(originalTransactionId: string): Promise<boolean> {
        const origTx = await this.getTransactionById(originalTransactionId);
        if (!origTx?.fiscal_document_id) return false;
        const origFiscal = await this.getFiscalDocumentById(origTx.fiscal_document_id);
        if (!origFiscal) return false;
        const settledNo = origFiscal.invoice_no;
        const settledDate = origFiscal.invoice_date;
        const match = await localDb.fiscalDocuments
            .filter(
                d =>
                    d.invoice_type === 'NC' &&
                    d.settled_invoice_no === settledNo &&
                    (d.settled_invoice_date ?? '') === settledDate &&
                    !d.cancelled_at
            )
            .first();
        return Boolean(match);
    }

    /** Recent fiscal audit events (newest first). */
    async listFiscalAuditEvents(limit = 500): Promise<LocalFiscalAuditEvent[]> {
        return localDb.fiscalAuditEvents.orderBy('created_at').reverse().limit(limit).toArray();
    }

    // Get transactions by employee ID
    async getTransactionsByEmployee(employeeId: string): Promise<LocalTransaction[]> {
        const list = await localDb.transactions
            .filter(transaction => 
                transaction.employee_id === employeeId && 
                transaction.deleted_at === null
            )
            .toArray();
        list.sort((a, b) => (b.created_at as Date).getTime() - (a.created_at as Date).getTime());
        return list;
    }

    // Get transactions by customer ID
    async getTransactionsByCustomer(customerId: string): Promise<LocalTransaction[]> {
        const list = await localDb.transactions
            .filter(transaction => 
                transaction.customer_id === customerId && 
                transaction.deleted_at === null
            )
            .toArray();
        list.sort((a, b) => (b.created_at as Date).getTime() - (a.created_at as Date).getTime());
        return list;
    }

    async getLatestPurchaseDatesByCustomer(): Promise<Record<string, Date>> {
        const transactions = await localDb.transactions
            .filter(
                transaction =>
                    transaction.customer_id !== null &&
                    transaction.status === 'completed' &&
                    transaction.deleted_at === null
            )
            .toArray();
        const latest: Record<string, Date> = {};
        for (const transaction of transactions) {
            if (!transaction.customer_id) continue;
            const purchasedAt = new Date(
                `${transaction.transaction_date}T${transaction.transaction_time || '00:00:00'}`
            );
            const current = latest[transaction.customer_id];
            if (!current || purchasedAt.getTime() > current.getTime()) {
                latest[transaction.customer_id] = purchasedAt;
            }
        }
        return latest;
    }

    // Get transactions by date range
    async getTransactionsByDateRange(startDate: string, endDate: string): Promise<LocalTransaction[]> {
        const list = await localDb.transactions
            .filter(transaction => 
                transaction.deleted_at === null &&
                transaction.transaction_date >= startDate &&
                transaction.transaction_date <= endDate
            )
            .toArray();
        list.sort((a, b) => (b.created_at as Date).getTime() - (a.created_at as Date).getTime());
        return list;
    }

    // Create new transaction with items
    async createTransaction(
        transactionData: Omit<LocalTransaction, 'id' | 'created_at' | 'updated_at' | 'needs_push' | 'is_conflicted' | 'last_synced_at'>,
        items: Omit<LocalTransactionItem, 'id' | 'transaction_id' | 'created_at' | 'updated_at' | 'needs_push' | 'is_conflicted' | 'last_synced_at'>[]
    ): Promise<string> {
        const transactionId = generateUUID();
        const transaction: LocalTransaction = {
            ...transactionData,
            id: transactionId,
            deleted_at: transactionData.deleted_at ?? null,
            created_at: new Date(),
            updated_at: new Date(),
            needs_push: true,
            is_conflicted: false,
            last_synced_at: null,
        };

        // Create transaction items
        const transactionItems: LocalTransactionItem[] = items.map(item => ({
            ...item,
            id: generateUUID(),
            transaction_id: transactionId,
            deleted_at: item.deleted_at ?? null,
            created_at: new Date(),
            updated_at: new Date(),
            needs_push: true,
            is_conflicted: false,
            last_synced_at: null,
        }));

        await localDb.transaction('rw', [localDb.transactions, localDb.transactionItems], async () => {
            await localDb.transactions.add(transaction);
            await localDb.transactionItems.bulkAdd(transactionItems);
        });
        await this.queueOperation('CREATE', transactionId, { ...transaction, items: transactionItems });

        return transactionId;
    }

    async getLastFiscalDocumentInChain(chainScope: string): Promise<LocalFiscalDocument | undefined> {
        const list = await localDb.fiscalDocuments
            .where('chain_scope')
            .equals(chainScope)
            .toArray();
        if (list.length === 0) return undefined;
        return list.reduce((a, b) => (a.sequential_number > b.sequential_number ? a : b));
    }

    /**
     * Allocate `sequential_number`, sign AT hash (outside IndexedDB — async Web Crypto must not run inside a Dexie txn),
     * then insert fiscal + transaction + items + audit in one rw transaction with chain-tip verification and retry if the chain advanced.
     */
    async createFiscalCheckoutAtomic(payload: FiscalCheckoutAtomicPayload): Promise<FiscalCheckoutResult> {
        const { settings, chainScope, atCode, seriesKey, payment, customerCountryForQr, receiptProfile } = payload;
        const company = settings.company;
        const hashControl = settings.fiscal.hashControlVersion || '1';
        const qrCountry =
            (customerCountryForQr || 'PT').trim().slice(0, 2).toUpperCase() || 'PT';
        const segment = invoiceSeriesSegment(receiptProfile);
        assertInvoiceSeriesSegment(segment);
        const maxAttempts = 8;

        const rwStores = [
            localDb.transactions,
            localDb.transactionItems,
            localDb.fiscalDocuments,
            localDb.fiscalAuditEvents,
        ] as const;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const fiscalId = generateUUID();
            const transactionId = generateUUID();
            const persistedAt = new Date();

            const tip = await localDb.transaction('r', [localDb.fiscalDocuments], async () => {
                const chainDocs = await localDb.fiscalDocuments.where('chain_scope').equals(chainScope).toArray();
                const lastDoc =
                    chainDocs.length === 0
                        ? undefined
                        : chainDocs.reduce((a, b) => (a.sequential_number > b.sequential_number ? a : b));
                return { lastDoc };
            });

            const lastDoc = tip.lastDoc;
            const previousHash = lastDoc?.hash_base64 ?? '';
            const lastSeq = lastDoc?.sequential_number;
            const nextSequential = computeNextSequential(lastSeq, receiptProfile.currentNumber);
            const invoiceNo = buildInvoiceNo(
                payload.invoiceTypeSaft,
                segment,
                nextSequential,
                receiptProfile.numericWidth
            );
            const paddedSeq = formatSequential(receiptProfile, nextSequential);
            const atcudBody = `${atCode}-${paddedSeq}`;

            const plaintext = buildHashPlaintext({
                invoiceDate: payload.transactionDate,
                systemEntryDate: payload.systemEntryDate,
                invoiceNo,
                grossTotal: payload.grossTotal,
                previousHashBase64: previousHash,
            });
            const { hashBase64, hashPlaintext } = await payload.signer.signHashPlaintext(plaintext);
            const hashFourChars = extractQrHashFourChars(hashBase64);

            const sourceId = payment.employeeNumber?.trim() || payment.employeeId.slice(0, 12);

            const qrPayload = buildAtQrPayloadString({
                emitterTaxNumber: company.taxNumber.replace(/\s/g, ''),
                customerTaxNumber: payload.customerTaxNumberForQr,
                customerCountry: qrCountry,
                invoiceType: payload.invoiceTypeSaft,
                invoiceDateYmd: payload.transactionDate,
                invoiceNo,
                atcudBody,
                netTotal: payload.netRounded,
                taxTotal: payload.taxTotal,
                hashFourChars,
                softwareCertificateNumber: (company.softwareCertNumber || '0').replace(/\s/g, ''),
            });

            const fiscalMetadata: FiscalTransactionMetadata = {
                invoiceNo,
                atcudBody,
                hashBase64,
                hashFourChars,
                hashControl,
                qrPayload,
                chainScope,
                sequentialNumber: nextSequential,
                certificationMode: payload.certificationMode,
                fiscalProvider: 'local_at',
            };

            const transaction: LocalTransaction = {
                ...payload.transactionBase,
                id: transactionId,
                fiscal_document_id: fiscalId,
                transaction_number: invoiceNo,
                receipt_number: invoiceNo,
                fiscal_metadata_json: JSON.stringify(fiscalMetadata),
                created_at: persistedAt,
                updated_at: persistedAt,
                needs_push: true,
                is_conflicted: false,
                last_synced_at: null,
            };

            const transactionItems: LocalTransactionItem[] = payload.transactionItems.map(item => ({
                ...item,
                id: generateUUID(),
                transaction_id: transactionId,
                created_at: persistedAt,
                updated_at: persistedAt,
                needs_push: true,
                is_conflicted: false,
                last_synced_at: null,
            }));

            const fiscalDoc: LocalFiscalDocument = {
                chain_scope: chainScope,
                series_key: seriesKey,
                at_validation_code: atCode,
                sequential_number: nextSequential,
                invoice_no: invoiceNo,
                invoice_type: payload.invoiceTypeSaft,
                settled_invoice_no: payload.settledInvoiceNo ?? null,
                settled_invoice_date: payload.settledInvoiceDateYmd ?? null,
                invoice_date: payload.transactionDate,
                system_entry_date: payload.systemEntryDate,
                gross_total: payload.grossTotal,
                net_total: payload.netRounded,
                tax_total: payload.taxTotal,
                hash_base64: hashBase64,
                hash_control: hashControl,
                hash_plaintext: hashPlaintext,
                previous_hash_base64: previousHash,
                qr_payload: qrPayload,
                source_id: sourceId,
                certification_mode: payload.certificationMode,
                customer_tax_id: payload.customerTaxId,
                payment_method: payment.paymentMethod,
                created_at: persistedAt.toISOString(),
                atcud_body: atcudBody,
                hash_four_chars: hashFourChars,
                saft_exported_at: null,
                saft_export_batch_id: null,
                fiscal_provider: 'local_at',
                external_document_id: null,
                external_reference: null,
                external_tx_id: null,
                external_output_format: null,
                external_payload_json: null,
                id: fiscalId,
                transaction_id: transactionId,
                needs_push: true,
            };

            const auditRow: LocalFiscalAuditEvent = {
                id: generateUUID(),
                event_type: 'FISCAL_DOCUMENT_CREATED',
                payload_json: JSON.stringify({ transactionId, fiscalId, invoiceNo }),
                employee_id: payment.employeeId,
                created_at: new Date().toISOString(),
            };

            try {
                let result: FiscalCheckoutResult | undefined;
                await localDb.transaction('rw', [...rwStores], async () => {
                    const chainDocs = await localDb.fiscalDocuments.where('chain_scope').equals(chainScope).toArray();
                    const lastDocNow =
                        chainDocs.length === 0
                            ? undefined
                            : chainDocs.reduce((a, b) => (a.sequential_number > b.sequential_number ? a : b));
                    const prevNow = lastDocNow?.hash_base64 ?? '';
                    const seqNow = lastDocNow?.sequential_number;
                    if (prevNow !== previousHash || seqNow !== lastSeq) {
                        throw new Error('FISCAL_CHAIN_ADVANCED');
                    }
                    const nextCheck = computeNextSequential(lastDocNow?.sequential_number, receiptProfile.currentNumber);
                    if (nextCheck !== nextSequential) {
                        throw new Error('FISCAL_CHAIN_ADVANCED');
                    }

                    const dupCount = await localDb.fiscalDocuments
                        .where('transaction_id')
                        .equals(transactionId)
                        .count();
                    if (dupCount > 0) {
                        throw new Error('Já existe documento fiscal para esta transação.');
                    }

                    await localDb.fiscalDocuments.add(fiscalDoc);
                    await localDb.transactions.add(transaction);
                    await localDb.transactionItems.bulkAdd(transactionItems);
                    await localDb.fiscalAuditEvents.add(auditRow);

                    result = {
                        transactionId,
                        fiscalId,
                        invoiceNo,
                        atcudBody,
                        hashBase64,
                        hashFourChars,
                        qrPayload,
                        hashControl,
                        certificationMode: payload.certificationMode,
                        grossTotal: payload.grossTotal,
                        netTotal: payload.netRounded,
                        taxTotal: payload.taxTotal,
                        systemEntryDate: payload.systemEntryDate,
                        invoiceDate: payload.transactionDate,
                        invoiceTypeSaft: payload.invoiceTypeSaft,
                        sourceId,
                        sequentialNumber: nextSequential,
                        seriesKey,
                        fiscalProvider: 'local_at',
                    };
                });
                await this.queueOperation('CREATE', transactionId, { ...transaction, items: transactionItems });
                return result as FiscalCheckoutResult;
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                if (msg === 'FISCAL_CHAIN_ADVANCED' && attempt < maxAttempts - 1) {
                    continue;
                }
                throw e;
            }
        }

        throw new Error('Fiscal checkout: excedidas tentativas (cadeia fiscal avançou durante a assinatura).');
    }

    async createVendusIssueAttempt(
        row: Omit<LocalVendusIssueAttempt, 'created_at' | 'updated_at'> &
            Partial<Pick<LocalVendusIssueAttempt, 'created_at' | 'updated_at'>>
    ): Promise<void> {
        const now = new Date().toISOString();
        await localDb.vendusIssueAttempts.add({
            ...row,
            created_at: row.created_at ?? now,
            updated_at: row.updated_at ?? now,
        });
    }

    async updateVendusIssueAttempt(
        id: string,
        updates: Partial<Omit<LocalVendusIssueAttempt, 'id' | 'created_at'>>
    ): Promise<void> {
        await localDb.vendusIssueAttempts.update(id, {
            ...updates,
            updated_at: new Date().toISOString(),
        });
    }

    async listPendingVendusIssueAttempts(): Promise<LocalVendusIssueAttempt[]> {
        return localDb.vendusIssueAttempts
            .where('status')
            .equals('pending')
            .toArray();
    }

    async createVendusFiscalCheckoutAtomic(
        payload: VendusFiscalCheckoutPersistencePayload
    ): Promise<FiscalCheckoutResult> {
        const fiscalId = generateUUID();
        const transactionId = generateUUID();
        const persistedAt = new Date();
        const vendus = payload.vendus;
        const sourceId = payload.payment.employeeNumber?.trim() || payload.payment.employeeId.slice(0, 12);
        const invoiceNo = vendus.number;
        const atcudBody = vendus.atcud.replace(/^\s*ATCUD\s*:\s*/i, '').trim();
        const hashValue = vendus.hash || '';
        const hashFourChars = hashValue.slice(0, 4);
        const qrPayload = vendus.qrcodeData || '';
        const chainScope = `vendus::${vendus.mode}::${vendus.registerId}::${vendus.type}`;
        const seriesKey = chainScope;
        const sequentialNumber = (() => {
            const match = invoiceNo.match(/(\d+)\s*$/);
            if (match) return Number(match[1]);
            const asNumber = Number(vendus.documentId);
            return Number.isFinite(asNumber) && asNumber > 0 ? asNumber : Date.now();
        })();

        const officialOutput = {
            provider: 'vendus' as const,
            format: vendus.outputFormat,
            data: typeof vendus.output === 'string' ? vendus.output : undefined,
            url:
                vendus.outputFormat === 'pdf_url' && typeof vendus.output === 'string'
                    ? vendus.output
                    : undefined,
            rawData: vendus.outputData,
        };

        const fiscalMetadata: FiscalTransactionMetadata = {
            invoiceNo,
            atcudBody,
            hashBase64: hashValue,
            hashFourChars,
            hashControl: 'vendus',
            qrPayload,
            chainScope,
            sequentialNumber,
            certificationMode: payload.certificationMode,
            fiscalProvider: 'vendus',
            externalDocumentId: vendus.documentId,
            externalReference: vendus.externalReference,
            externalTxId: vendus.txId,
            officialOutput,
            vendus: {
                registerId: vendus.registerId,
                storeId: vendus.storeId,
                mode: vendus.mode,
                outputFormat: vendus.outputFormat,
                items: vendus.items,
            },
        };

        const transaction: LocalTransaction = {
            ...payload.transactionBase,
            id: transactionId,
            fiscal_document_id: fiscalId,
            transaction_number: invoiceNo,
            receipt_number: invoiceNo,
            fiscal_metadata_json: JSON.stringify(fiscalMetadata),
            created_at: persistedAt,
            updated_at: persistedAt,
            needs_push: true,
            is_conflicted: false,
            last_synced_at: null,
        };

        const transactionItems: LocalTransactionItem[] = payload.transactionItems.map(item => ({
            ...item,
            id: generateUUID(),
            transaction_id: transactionId,
            created_at: persistedAt,
            updated_at: persistedAt,
            needs_push: true,
            is_conflicted: false,
            last_synced_at: null,
        }));

        const fiscalDoc: LocalFiscalDocument = {
            chain_scope: chainScope,
            series_key: seriesKey,
            at_validation_code: atcudBody.split('-')[0] || 'VENDUS',
            sequential_number: sequentialNumber,
            invoice_no: invoiceNo,
            invoice_type: vendus.type,
            settled_invoice_no: payload.settledInvoiceNo ?? null,
            settled_invoice_date: payload.settledInvoiceDateYmd ?? null,
            invoice_date: vendus.date || payload.transactionDate,
            system_entry_date: vendus.systemTime || payload.systemEntryDate,
            gross_total: vendus.amountGross,
            net_total: vendus.amountNet,
            tax_total: Number((vendus.amountGross - vendus.amountNet).toFixed(2)),
            hash_base64: hashValue,
            hash_control: 'vendus',
            hash_plaintext: 'VENDUS_EXTERNAL_ISSUER',
            previous_hash_base64: '',
            qr_payload: qrPayload,
            source_id: sourceId,
            certification_mode: payload.certificationMode,
            customer_tax_id: payload.customerTaxId,
            payment_method: payload.payment.paymentMethod,
            created_at: persistedAt.toISOString(),
            atcud_body: atcudBody,
            hash_four_chars: hashFourChars,
            saft_exported_at: null,
            saft_export_batch_id: null,
            cancelled_at: null,
            cancelled_reason: null,
            cancelled_by_employee_id: null,
            fiscal_provider: 'vendus',
            external_document_id: vendus.documentId,
            external_reference: vendus.externalReference,
            external_tx_id: vendus.txId,
            external_output_format: vendus.outputFormat,
            external_payload_json: JSON.stringify(vendus.raw),
            id: fiscalId,
            transaction_id: transactionId,
            needs_push: true,
        };

        const auditRow: LocalFiscalAuditEvent = {
            id: generateUUID(),
            event_type: vendus.type === 'NC' ? 'CREDIT_NOTE_ISSUED' : 'FISCAL_DOCUMENT_CREATED',
            payload_json: JSON.stringify({
                transactionId,
                fiscalId,
                invoiceNo,
                fiscalProvider: 'vendus',
                vendusDocumentId: vendus.documentId,
                externalReference: vendus.externalReference,
                txId: vendus.txId,
            }),
            employee_id: payload.payment.employeeId,
            created_at: new Date().toISOString(),
        };

        await localDb.transaction(
            'rw',
            [
                localDb.transactions,
                localDb.transactionItems,
                localDb.fiscalDocuments,
                localDb.fiscalAuditEvents,
            ],
            async () => {
                await localDb.fiscalDocuments.add(fiscalDoc);
                await localDb.transactions.add(transaction);
                await localDb.transactionItems.bulkAdd(transactionItems);
                await localDb.fiscalAuditEvents.add(auditRow);
            }
        );
        await this.queueOperation('CREATE', transactionId, { ...transaction, items: transactionItems });

        return {
            transactionId,
            fiscalId,
            invoiceNo,
            atcudBody,
            hashBase64: hashValue,
            hashFourChars,
            qrPayload,
            hashControl: 'vendus',
            certificationMode: payload.certificationMode,
            grossTotal: vendus.amountGross,
            netTotal: vendus.amountNet,
            taxTotal: Number((vendus.amountGross - vendus.amountNet).toFixed(2)),
            systemEntryDate: vendus.systemTime || payload.systemEntryDate,
            invoiceDate: vendus.date || payload.transactionDate,
            invoiceTypeSaft: vendus.type,
            sourceId,
            sequentialNumber,
            seriesKey,
            fiscalProvider: 'vendus',
            externalDocumentId: vendus.documentId,
            externalReference: vendus.externalReference,
            officialOutput,
        };
    }

    /**
     * Persist a document issued by any cloud fiscal backend (InvoiceXpress, Fiskaly, …).
     * Provider-agnostic sibling of {@link createVendusFiscalCheckoutAtomic}: the external
     * issuer owns numbering / ATCUD / hash / QR; we store an immutable snapshot atomically.
     */
    async createExternalFiscalCheckoutAtomic(
        payload: ExternalFiscalCheckoutPersistencePayload
    ): Promise<FiscalCheckoutResult> {
        const fiscalId = generateUUID();
        const transactionId = generateUUID();
        const persistedAt = new Date();
        const ext = payload.external;
        const sourceId = payload.payment.employeeNumber?.trim() || payload.payment.employeeId.slice(0, 12);
        const invoiceNo = ext.number;
        const atcudBody = ext.atcud.replace(/^\s*ATCUD\s*:\s*/i, '').trim();
        const hashValue = ext.hash || '';
        const hashFourChars = hashValue.slice(0, 4);
        const qrPayload = ext.qrcodeData || '';
        const chainScope = ext.chainScope;
        const seriesKey = chainScope;
        const atValidationCode = (ext.atValidationCode || atcudBody.split('-')[0] || ext.provider).toUpperCase();
        const sequentialNumber = (() => {
            const match = invoiceNo.match(/(\d+)\s*$/);
            if (match) return Number(match[1]);
            const asNumber = Number(ext.documentId);
            return Number.isFinite(asNumber) && asNumber > 0 ? asNumber : Date.now();
        })();

        const officialOutput = {
            provider: ext.provider,
            format: ext.outputFormat,
            data: typeof ext.output === 'string' ? ext.output : undefined,
            url: ext.outputFormat === 'pdf_url' && typeof ext.output === 'string' ? ext.output : undefined,
            rawData: ext.outputData,
        };

        const fiscalMetadata: FiscalTransactionMetadata = {
            invoiceNo,
            atcudBody,
            hashBase64: hashValue,
            hashFourChars,
            hashControl: ext.provider,
            qrPayload,
            chainScope,
            sequentialNumber,
            certificationMode: payload.certificationMode,
            fiscalProvider: ext.provider,
            externalDocumentId: ext.documentId,
            externalReference: ext.externalReference,
            externalTxId: ext.txId,
            officialOutput,
            external: {
                provider: ext.provider,
                outputFormat: ext.outputFormat,
                items: ext.items,
                meta: ext.providerMeta,
            },
        };

        const transaction: LocalTransaction = {
            ...payload.transactionBase,
            id: transactionId,
            fiscal_document_id: fiscalId,
            transaction_number: invoiceNo,
            receipt_number: invoiceNo,
            fiscal_metadata_json: JSON.stringify(fiscalMetadata),
            created_at: persistedAt,
            updated_at: persistedAt,
            needs_push: true,
            is_conflicted: false,
            last_synced_at: null,
        };

        const transactionItems: LocalTransactionItem[] = payload.transactionItems.map(item => ({
            ...item,
            id: generateUUID(),
            transaction_id: transactionId,
            created_at: persistedAt,
            updated_at: persistedAt,
            needs_push: true,
            is_conflicted: false,
            last_synced_at: null,
        }));

        const fiscalDoc: LocalFiscalDocument = {
            chain_scope: chainScope,
            series_key: seriesKey,
            at_validation_code: atValidationCode,
            sequential_number: sequentialNumber,
            invoice_no: invoiceNo,
            invoice_type: ext.type,
            settled_invoice_no: payload.settledInvoiceNo ?? null,
            settled_invoice_date: payload.settledInvoiceDateYmd ?? null,
            invoice_date: ext.date || payload.transactionDate,
            system_entry_date: ext.systemTime || payload.systemEntryDate,
            gross_total: ext.amountGross,
            net_total: ext.amountNet,
            tax_total: Number((ext.amountGross - ext.amountNet).toFixed(2)),
            hash_base64: hashValue,
            hash_control: ext.provider,
            hash_plaintext: `${ext.provider.toUpperCase()}_EXTERNAL_ISSUER`,
            previous_hash_base64: '',
            qr_payload: qrPayload,
            source_id: sourceId,
            certification_mode: payload.certificationMode,
            customer_tax_id: payload.customerTaxId,
            payment_method: payload.payment.paymentMethod,
            created_at: persistedAt.toISOString(),
            atcud_body: atcudBody,
            hash_four_chars: hashFourChars,
            saft_exported_at: null,
            saft_export_batch_id: null,
            cancelled_at: null,
            cancelled_reason: null,
            cancelled_by_employee_id: null,
            fiscal_provider: ext.provider,
            external_document_id: ext.documentId,
            external_reference: ext.externalReference,
            external_tx_id: ext.txId,
            external_output_format: ext.outputFormat,
            external_payload_json: JSON.stringify(ext.raw),
            id: fiscalId,
            transaction_id: transactionId,
            needs_push: true,
        };

        const auditRow: LocalFiscalAuditEvent = {
            id: generateUUID(),
            event_type: ext.type === 'NC' ? 'CREDIT_NOTE_ISSUED' : 'FISCAL_DOCUMENT_CREATED',
            payload_json: JSON.stringify({
                transactionId,
                fiscalId,
                invoiceNo,
                fiscalProvider: ext.provider,
                externalDocumentId: ext.documentId,
                externalReference: ext.externalReference,
                txId: ext.txId,
            }),
            employee_id: payload.payment.employeeId,
            created_at: new Date().toISOString(),
        };

        await localDb.transaction(
            'rw',
            [
                localDb.transactions,
                localDb.transactionItems,
                localDb.fiscalDocuments,
                localDb.fiscalAuditEvents,
            ],
            async () => {
                await localDb.fiscalDocuments.add(fiscalDoc);
                await localDb.transactions.add(transaction);
                await localDb.transactionItems.bulkAdd(transactionItems);
                await localDb.fiscalAuditEvents.add(auditRow);
            }
        );
        await this.queueOperation('CREATE', transactionId, { ...transaction, items: transactionItems });

        return {
            transactionId,
            fiscalId,
            invoiceNo,
            atcudBody,
            hashBase64: hashValue,
            hashFourChars,
            qrPayload,
            hashControl: ext.provider,
            certificationMode: payload.certificationMode,
            grossTotal: ext.amountGross,
            netTotal: ext.amountNet,
            taxTotal: Number((ext.amountGross - ext.amountNet).toFixed(2)),
            systemEntryDate: ext.systemTime || payload.systemEntryDate,
            invoiceDate: ext.date || payload.transactionDate,
            invoiceTypeSaft: ext.type,
            sourceId,
            sequentialNumber,
            seriesKey,
            fiscalProvider: ext.provider,
            externalDocumentId: ext.documentId,
            externalReference: ext.externalReference,
            officialOutput,
        };
    }

    /** Mark fiscal rows included in a SAF-T export (optional anti-duplicate workflow). */
    async markFiscalDocumentsSaftExported(
        fiscalIds: string[],
        batchId: string,
        exportedAtIso: string
    ): Promise<void> {
        if (fiscalIds.length === 0) return;
        await localDb.transaction('rw', [localDb.fiscalDocuments], async () => {
            for (const id of fiscalIds) {
                await localDb.fiscalDocuments.update(id, {
                    saft_exported_at: exportedAtIso,
                    saft_export_batch_id: batchId,
                });
            }
        });
    }

    /** Fiscal documents whose `invoice_date` falls in the closed range (YYYY-MM-DD). */
    async getFiscalDocumentsByDateRange(startYmd: string, endYmd: string): Promise<LocalFiscalDocument[]> {
        const list = await localDb.fiscalDocuments
            .filter(
                d => d.invoice_date >= startYmd && d.invoice_date <= endYmd
            )
            .toArray();
        list.sort((a, b) => {
            const c = a.invoice_date.localeCompare(b.invoice_date);
            return c !== 0 ? c : a.sequential_number - b.sequential_number;
        });
        return list;
    }

    /** Append-only fiscal audit trail (void requests, settings changes, etc.). */
    async appendFiscalAuditEvent(
        event: Omit<LocalFiscalAuditEvent, 'id' | 'created_at'> & { id?: string; created_at?: string }
    ): Promise<void> {
        const row: LocalFiscalAuditEvent = {
            ...event,
            id: event.id ?? generateUUID(),
            created_at: event.created_at ?? new Date().toISOString(),
        };
        await localDb.fiscalAuditEvents.add(row);
    }

    /**
     * Atomically persist fiscal document + transaction + items + audit (AT certification).
     */
    async createTransactionWithFiscal(
        transactionId: string,
        fiscalId: string,
        transactionData: Omit<LocalTransaction, 'id' | 'created_at' | 'updated_at' | 'needs_push' | 'is_conflicted' | 'last_synced_at' | 'fiscal_document_id'>,
        items: Omit<LocalTransactionItem, 'id' | 'transaction_id' | 'created_at' | 'updated_at' | 'needs_push' | 'is_conflicted' | 'last_synced_at'>[],
        fiscalRow: Omit<LocalFiscalDocument, 'needs_push' | 'id' | 'transaction_id'>,
        audit: Omit<LocalFiscalAuditEvent, 'created_at'> & { id?: string; created_at?: string }
    ): Promise<string> {
        const transaction: LocalTransaction = {
            ...transactionData,
            id: transactionId,
            fiscal_document_id: fiscalId,
            created_at: new Date(),
            updated_at: new Date(),
            needs_push: true,
            is_conflicted: false,
            last_synced_at: null,
        };

        const fiscalDoc: LocalFiscalDocument = {
            ...fiscalRow,
            id: fiscalId,
            transaction_id: transactionId,
            needs_push: true,
        };

        const transactionItems: LocalTransactionItem[] = items.map(item => ({
            ...item,
            id: generateUUID(),
            transaction_id: transactionId,
            created_at: new Date(),
            updated_at: new Date(),
            needs_push: true,
            is_conflicted: false,
            last_synced_at: null,
        }));

        const auditRow: LocalFiscalAuditEvent = {
            ...audit,
            id: audit.id ?? generateUUID(),
            created_at: audit.created_at ?? new Date().toISOString(),
        };

        await localDb.transaction(
            'rw',
            [
                localDb.transactions,
                localDb.transactionItems,
                localDb.fiscalDocuments,
                localDb.fiscalAuditEvents,
            ],
            async () => {
                await localDb.fiscalDocuments.add(fiscalDoc);
                await localDb.transactions.add(transaction);
                await localDb.transactionItems.bulkAdd(transactionItems);
                await localDb.fiscalAuditEvents.add(auditRow);
            }
        );
        await this.queueOperation('CREATE', transactionId, { ...transaction, items: transactionItems });

        return transactionId;
    }

    // Update transaction (status changes, notes, etc.)
    async updateTransaction(id: string, updates: Partial<LocalTransaction>): Promise<void> {
        const updateData = {
            ...updates,
            updated_at: new Date(),
            needs_push: true,
        };

        await localDb.transaction('rw', [localDb.transactions], async () => {
            await localDb.transactions.update(id, updateData);
        });
        await this.queueOperation('UPDATE', id, updateData);
    }

    // Soft delete transaction (and its items)
    async deleteTransaction(id: string): Promise<void> {
        const existing = await localDb.transactions.get(id);
        if (existing?.fiscal_document_id) {
            throw new Error(
                'Documentos fiscais finalizados não podem ser eliminados. Utilize anulação ou nota de crédito.'
            );
        }

        const now = new Date();
        
        await localDb.transaction('rw', [localDb.transactions, localDb.transactionItems], async () => {
            // Soft delete the transaction
            await localDb.transactions.update(id, {
                deleted_at: now,
                needs_push: true,
                updated_at: now,
            });

            // Soft delete all associated transaction items
            await localDb.transactionItems
                .where('transaction_id')
                .equals(id)
                .modify({
                    deleted_at: now,
                    needs_push: true,
                    updated_at: now,
                });
        });
        await this.queueOperation('DELETE', id, null);
    }

    // Search transactions by transaction number, customer name, or employee name
    async searchTransactions(query: string): Promise<LocalTransaction[]> {
        const normalizedQuery = query.toLowerCase();
        const list = await localDb.transactions
            .filter(transaction =>
                transaction.deleted_at === null &&
                (transaction.transaction_number.toLowerCase().includes(normalizedQuery) ||
                    ((transaction.customer_name ?? '').toLowerCase().includes(normalizedQuery)) ||
                    transaction.employee_name.toLowerCase().includes(normalizedQuery))
            )
            .toArray();
        list.sort((a, b) => (b.created_at as Date).getTime() - (a.created_at as Date).getTime());
        return list;
    }

    // Get transactions by status
    async getTransactionsByStatus(status: 'completed' | 'refunded' | 'pending' | 'cancelled'): Promise<LocalTransaction[]> {
        const list = await localDb.transactions
            .filter(transaction => transaction.status === status && transaction.deleted_at === null)
            .toArray();
        list.sort((a, b) => (b.created_at as Date).getTime() - (a.created_at as Date).getTime());
        return list;
    }

    // Get recent transactions (last N days)
    async getRecentTransactions(days: number = 30): Promise<LocalTransaction[]> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const cutoffDateString = cutoffDate.toISOString().split('T')[0];

        const list = await localDb.transactions
            .filter(transaction => 
                transaction.deleted_at === null &&
                transaction.transaction_date >= cutoffDateString
            )
            .toArray();
        list.sort((a, b) => (b.created_at as Date).getTime() - (a.created_at as Date).getTime());
        return list;
    }

    // Update stock levels for products in transaction items
    async updateProductStock(transactionItems: LocalTransactionItem[]): Promise<void> {
        await localDb.transaction('rw', [localDb.products], async () => {
            for (const item of transactionItems) {
                const product = await localDb.products.get(item.product_id);
                if (product && readPosTrackInventoryFromStorage() && product.track_stock) {
                    const newStock = Math.max(0, product.stock - item.quantity);
                    await localDb.products.update(item.product_id, {
                        stock: newStock,
                        updated_at: new Date(),
                        needs_push: true,
                    });
                }
            }
        });
    }

    // Queue sync operation
    private async queueOperation(
        type: 'CREATE' | 'UPDATE' | 'DELETE',
        transactionId: string,
        data: any
    ): Promise<void> {
        const operation: PendingTransactionOperation = {
            id: generateUUID(),
            type,
            transactionId,
            data,
            timestamp: new Date().toISOString(),
            retryCount: 0,
        };

        await localDb.transactionSyncQueue.add(operation);
        await this.updateSyncMetadata({ pendingOperations: 1 }); // Increment counter
    }

    // Get pending sync operations
    async getPendingSyncOperations(): Promise<PendingTransactionOperation[]> {
        return await localDb.transactionSyncQueue.orderBy('timestamp').toArray();
    }

    // Clear sync operation after successful sync
    async clearSyncOperation(operationId: string): Promise<void> {
        await localDb.transaction('rw', [localDb.transactionSyncQueue, localDb.syncMetadata], async () => {
            await localDb.transactionSyncQueue.delete(operationId);
            await this.updateSyncMetadata({ pendingOperations: -1 }); // Decrement counter
        });
    }

    // Mark sync operation as failed
    async markSyncOperationFailed(operationId: string, error: string): Promise<void> {
        const operation = await localDb.transactionSyncQueue.get(operationId);
        if (operation) {
            await localDb.transactionSyncQueue.update(operationId, {
                retryCount: operation.retryCount + 1,
                error,
            });
        }
    }

    // Bulk insert transactions from server (during pull sync)
    async bulkInsertFromServer(transactions: any[], transactionItems: any[]): Promise<void> {
        await localDb.transaction('rw', [localDb.transactions, localDb.transactionItems], async () => {
            // Insert transactions
            for (const transaction of transactions) {
                const localTransaction: LocalTransaction = {
                    ...transaction,
                    created_at: new Date(transaction.created_at),
                    updated_at: new Date(transaction.updated_at),
                    last_synced_at: transaction.last_synced_at ? new Date(transaction.last_synced_at) : null,
                    deleted_at: transaction.deleted_at ? new Date(transaction.deleted_at) : null,
                    needs_push: false, // Data from server doesn't need to be pushed
                    is_conflicted: false,
                };

                // Check if transaction already exists by transaction_number to prevent duplicates
                const existing = await localDb.transactions
                    .filter(t => t.transaction_number === transaction.transaction_number)
                    .first();

                if (existing) {
                    // Update existing transaction but keep the local ID
                    await localDb.transactions.update(existing.id, {
                        ...localTransaction,
                        id: existing.id, // Keep the original local ID
                    });
                } else {
                    // Insert new transaction with server ID
                    await localDb.transactions.put(localTransaction);
                }
            }

            // Insert transaction items
            for (const item of transactionItems) {
                const localItem: LocalTransactionItem = {
                    ...item,
                    created_at: new Date(item.created_at),
                    updated_at: new Date(item.updated_at),
                    last_synced_at: item.last_synced_at ? new Date(item.last_synced_at) : null,
                    deleted_at: item.deleted_at ? new Date(item.deleted_at) : null,
                    needs_push: false, // Data from server doesn't need to be pushed
                    is_conflicted: false,
                };

                // Check if item already exists
                const existing = await localDb.transactionItems.get(item.id);

                if (existing) {
                    // Update existing item
                    await localDb.transactionItems.update(item.id, localItem);
                } else {
                    // Insert new item with server ID
                    await localDb.transactionItems.put(localItem);
                }
            }
        });
    }

    // Update sync metadata
    async updateSyncMetadata(updates: Partial<SyncMetadata>): Promise<void> {
        try {
            const current = await localDb.syncMetadata.get('transactions');
            if (current) {
                const newData = { ...current, ...updates };

                // Handle pending operations counter
                if (updates.pendingOperations !== undefined) {
                    newData.pendingOperations = Math.max(0, current.pendingOperations + updates.pendingOperations);
                }

                await localDb.syncMetadata.put(newData);
            } else {
                // Initialize if doesn't exist
                const initialData = {
                    id: 'transactions',
                    lastPulledAt: updates.lastPulledAt || null,
                    lastPushedAt: updates.lastPushedAt || null,
                    pendingOperations: updates.pendingOperations || 0,
                    conflictCount: updates.conflictCount || 0,
                };
                await localDb.syncMetadata.put(initialData);
            }
        } catch (error) {
            console.warn('Failed to update transaction sync metadata:', error);
            // Don't throw error to prevent breaking the main operation
        }
    }

    // Get sync metadata
    async getSyncMetadata(): Promise<SyncMetadata | null> {
        const data = await localDb.syncMetadata.get('transactions');
        return data ? {
            lastPulledAt: data.lastPulledAt,
            lastPushedAt: data.lastPushedAt,
            pendingOperations: data.pendingOperations,
            conflictCount: data.conflictCount,
        } : null;
    }

    // Get transactions that need to be pushed to server
    async getTransactionsNeedingPush(): Promise<LocalTransaction[]> {
        return await localDb.transactions
            .filter(transaction => transaction.needs_push === true)
            .toArray();
    }

    // Get transaction items that need to be pushed to server
    async getTransactionItemsNeedingPush(): Promise<LocalTransactionItem[]> {
        return await localDb.transactionItems
            .filter(item => item.needs_push === true)
            .toArray();
    }

    // Mark transactions as synced
    async markTransactionsSynced(transactionIds: string[]): Promise<void> {
        const now = new Date();
        await localDb.transaction('rw', [localDb.transactions], async () => {
            for (const id of transactionIds) {
                await localDb.transactions.update(id, {
                    needs_push: false,
                    last_synced_at: now,
                });
            }
        });
    }

    // Mark transaction items as synced
    async markTransactionItemsSynced(itemIds: string[]): Promise<void> {
        const now = new Date();
        await localDb.transaction('rw', [localDb.transactionItems], async () => {
            for (const id of itemIds) {
                await localDb.transactionItems.update(id, {
                    needs_push: false,
                    last_synced_at: now,
                });
            }
        });
    }

    // Clear all data (for testing or reset)
    async clearAllData(): Promise<void> {
        await localDb.transaction('rw', [localDb.transactions, localDb.transactionItems, localDb.transactionSyncQueue, localDb.syncMetadata], async () => {
            await localDb.transactions.clear();
            await localDb.transactionItems.clear();
            await localDb.transactionSyncQueue.clear();
            // Reset sync metadata for transactions
            await localDb.syncMetadata.put({
                id: 'transactions',
                lastPulledAt: null,
                lastPushedAt: null,
                pendingOperations: 0,
                conflictCount: 0,
            });
        });
    }

    // Get database statistics
    async getStats(): Promise<{
        totalTransactions: number;
        completedTransactions: number;
        pendingTransactions: number;
        refundedTransactions: number;
        totalTransactionItems: number;
        pendingSync: number;
        lastSync: Date | null;
    }> {
        const [
            total, 
            completed, 
            pending, 
            refunded, 
            totalItems, 
            pendingSyncOps, 
            syncMeta
        ] = await Promise.all([
            localDb.transactions.filter(t => t.deleted_at === null).count(),
            localDb.transactions.filter(t => t.status === 'completed' && t.deleted_at === null).count(),
            localDb.transactions.filter(t => t.status === 'pending' && t.deleted_at === null).count(),
            localDb.transactions.filter(t => t.status === 'refunded' && t.deleted_at === null).count(),
            localDb.transactionItems.filter(item => item.deleted_at === null).count(),
            localDb.transactionSyncQueue.count(),
            this.getSyncMetadata(),
        ]);

        return {
            totalTransactions: total,
            completedTransactions: completed,
            pendingTransactions: pending,
            refundedTransactions: refunded,
            totalTransactionItems: totalItems,
            pendingSync: pendingSyncOps,
            lastSync: syncMeta?.lastPulledAt ? new Date(syncMeta.lastPulledAt) : null,
        };
    }

    // Generate client-side transaction number (fallback when offline)
    generateTransactionNumber(): string {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const timeStr = now.getTime().toString().slice(-4);
        const randomStr = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `TXN${dateStr}${timeStr}${randomStr}`;
    }
}

// Export singleton service instance
export const transactionLocalService = new TransactionLocalService();

/** Serialize concurrent open() calls (StrictMode + bootstrap + services can race). */
let localDatabaseInitInFlight: Promise<void> | null = null;

function isIndexedDbOpenRecoverableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }
    const { name, message } = error;
    const lower = message.toLowerCase();
    // Chrome often surfaces corrupt / stuck IDB as UnknownError + "backing store"
    const isBackingStoreFailure =
        lower.includes('backing store') ||
        lower.includes('internal error opening backing store') ||
        lower.includes('indexeddb.open');
    return (
        name === 'DatabaseClosedError' ||
        name === 'InvalidStateError' ||
        name === 'VersionError' ||
        name === 'UpgradeError' ||
        name === 'ModifyError' ||
        name === 'AbortError' ||
        (name === 'UnknownError' && isBackingStoreFailure) ||
        message.includes('object store') ||
        message.includes('NotFoundError') ||
        message.includes('IDBTransaction') ||
        message.includes('Dexie') ||
        message.includes('Another connection') ||
        isBackingStoreFailure
    );
}

async function openLocalDatabaseWithRecovery(): Promise<void> {
    try {
        await localDb.open();
        await initializeSyncMetadata();
        console.log('Local database initialized successfully');
    } catch (error) {
        console.error('Failed to initialize local database:', error);

        if (isIndexedDbOpenRecoverableError(error)) {
            console.warn('Database schema mismatch or IndexedDB error detected, attempting recovery...');

            try {
                localDb.close();
                await localDb.delete();
                await localDb.open();
                await initializeSyncMetadata();
                console.log('Database recovered successfully after reset');
                return;
            } catch (recoveryError) {
                console.error('Database recovery failed:', recoveryError);
                throw new Error(
                    'Database is corrupted and could not be recovered. Please clear browser data or use incognito mode.'
                );
            }
        }

        throw error;
    }
}

// Initialize the database with error recovery (single-flight)
export const initializeLocalDatabase = async (): Promise<void> => {
    if (localDb.isOpen()) {
        return;
    }
    if (!localDatabaseInitInFlight) {
        localDatabaseInitInFlight = (async () => {
            try {
                await openLocalDatabaseWithRecovery();
            } finally {
                localDatabaseInitInFlight = null;
            }
        })();
    }
    await localDatabaseInitInFlight;
};
