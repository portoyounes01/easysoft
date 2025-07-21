import Dexie, { Table } from 'dexie';
import { generateUUID } from '../utils/uuid';
import {
    LocalEmployee,
    LocalCategory,
    LocalProduct,
    PendingEmployeeOperation,
    PendingCategoryOperation,
    PendingProductOperation,
    SyncMetadata
} from '../types/supabase';

// Local database schema for offline-first POS management
export class LocalPOSDatabase extends Dexie {
    // Tables
    employees!: Table<LocalEmployee>;
    categories!: Table<LocalCategory>;
    products!: Table<LocalProduct>;
    employeeSyncQueue!: Table<PendingEmployeeOperation>;
    categorySyncQueue!: Table<PendingCategoryOperation>;
    productSyncQueue!: Table<PendingProductOperation>;
    syncMetadata!: Table<SyncMetadata & { id: string }>;

    constructor() {
        super('POSDatabase');

        this.version(1).stores({
            employees: 'id, employee_number, name, role, is_active, updated_at, needs_push, deleted_at',
            categories: 'id, name, is_active, display_order, updated_at, needs_push, deleted_at',
            products: 'id, sku, name, category_id, is_active, stock, updated_at, needs_push, deleted_at',
            employeeSyncQueue: 'id, type, employeeId, timestamp, retryCount',
            categorySyncQueue: 'id, type, categoryId, timestamp, retryCount',
            productSyncQueue: 'id, type, productId, timestamp, retryCount',
            syncMetadata: 'id' // Records: 'employees', 'categories', 'products'
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
    }
}

// Create singleton instance
export const localDb = new LocalPOSDatabase();

// Initialize sync metadata if it doesn't exist
export const initializeSyncMetadata = async (): Promise<void> => {
    const existing = await localDb.syncMetadata.get('employees');
    if (!existing) {
        await localDb.syncMetadata.add({
            id: 'employees',
            lastPulledAt: null,
            lastPushedAt: null,
            pendingOperations: 0,
            conflictCount: 0,
        });
    }
};

// Database operations with sync queue management
export class EmployeeLocalService {

    // Get all active employees (excluding soft-deleted)
    async getAllEmployees(): Promise<LocalEmployee[]> {
        return await localDb.employees
            .filter(emp => emp.deleted_at === null && emp.is_active === true)
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

        await localDb.transaction('rw', [localDb.employees, localDb.employeeSyncQueue], async () => {
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

        await localDb.transaction('rw', [localDb.employees, localDb.employeeSyncQueue], async () => {
            await localDb.employees.update(id, updateData);
            await this.queueOperation('UPDATE', id, updateData);
        });
    }

    // Soft delete employee
    async deleteEmployee(id: string): Promise<void> {
        await localDb.transaction('rw', [localDb.employees, localDb.employeeSyncQueue], async () => {
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
                    (emp.email && emp.email.toLowerCase().includes(normalizedQuery)))
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
        const operation = await localDb.syncQueue.get(operationId);
        if (operation) {
            await localDb.syncQueue.update(operationId, {
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

                // Use put to insert or update
                await localDb.employees.put(localEmployee);
            }
        });
    }

    // Update sync metadata
    async updateSyncMetadata(updates: Partial<SyncMetadata>): Promise<void> {
        const current = await localDb.syncMetadata.get('employees');
        if (current) {
            const newData = { ...current, ...updates };

            // Handle pending operations counter
            if (updates.pendingOperations !== undefined) {
                newData.pendingOperations = Math.max(0, current.pendingOperations + updates.pendingOperations);
            }

            await localDb.syncMetadata.put(newData);
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
        await localDb.transaction('rw', [localDb.employees, localDb.syncQueue, localDb.syncMetadata], async () => {
            await localDb.employees.clear();
            await localDb.syncQueue.clear();
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
            localDb.employees.filter(emp => emp.is_active === true && emp.deleted_at === null).count(),
            localDb.employees.filter(emp => emp.deleted_at !== null).count(),
            localDb.syncQueue.count(),
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

// Initialize the database
export const initializeLocalDatabase = async (): Promise<void> => {
    try {
        await localDb.open();
        await initializeSyncMetadata();
        console.log('Local database initialized successfully');
    } catch (error) {
        console.error('Failed to initialize local database:', error);
        throw error;
    }
}; 