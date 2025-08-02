import { supabase, isSupabaseConfigured, connectionStatus } from '../lib/supabase';
import { employeeLocalService, initializeLocalDatabase } from '../lib/localDatabase';
import { hashPassword } from '../utils/hashUtils';
import {
    EmployeeRow,
    EmployeeFormData,
    EmployeeFilters,
    LocalEmployee,
    SyncMetadata,
    Employee
} from '../types/supabase';

// Service class that manages employees with offline-first approach
export class EmployeeService {
    private isInitialized = false;
    private syncInProgress = false;
    private syncCallbacks: Array<(status: 'syncing' | 'completed' | 'error', details?: any) => void> = [];

    constructor() {
        this.initialize();
    }

    // Initialize the service and start connection monitoring
    private async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            // Initialize local database first
            await initializeLocalDatabase();

            // Listen for connection status changes
            connectionStatus.subscribe(({ isSupabaseOnline }) => {
                if (isSupabaseOnline && !this.syncInProgress) {
                    this.performBackgroundSync();
                }
            });

            this.isInitialized = true;
            console.log('EmployeeService initialized successfully');

            // Perform initial sync if online
            if (connectionStatus.getStatus().isSupabaseOnline) {
                this.performBackgroundSync();
            }
        } catch (error) {
            console.error('Failed to initialize EmployeeService:', error);
            
            // Provide user-friendly error message for database issues
            if (error instanceof Error && 
                (error.message.includes('Database is corrupted') ||
                 error.message.includes('object store') ||
                 error.message.includes('IndexedDB'))) {
                throw new Error('Database initialization failed. Please refresh the page or clear browser data.');
            }
            
            throw error;
        }
    }

    // Get all employees (from local store)
    async getAllEmployees(): Promise<Employee[]> {
        await this.ensureInitialized();
        const localEmployees = await employeeLocalService.getAllEmployees();
        return this.convertLocalToEmployee(localEmployees);
    }

    // Get employee by ID
    async getEmployeeById(id: string): Promise<Employee | null> {
        await this.ensureInitialized();
        const localEmployee = await employeeLocalService.getEmployeeById(id);
        return localEmployee ? this.convertLocalToEmployee([localEmployee])[0] : null;
    }

    // Get employee by employee number
    async getEmployeeByNumber(employeeNumber: string): Promise<Employee | null> {
        await this.ensureInitialized();
        const localEmployee = await employeeLocalService.getEmployeeByNumber(employeeNumber);
        return localEmployee ? this.convertLocalToEmployee([localEmployee])[0] : null;
    }

    // Create new employee
    async createEmployee(employeeData: EmployeeFormData): Promise<string> {
        await this.ensureInitialized();

        // Validate employee number is unique
        const existing = await this.getEmployeeByNumber(employeeData.employee_number);
        if (existing) {
            throw new Error('Employee number already exists');
        }

        // Hash password if provided
        let passwordHash: string | null = null;
        if (employeeData.password) {
            passwordHash = await this.hashPassword(employeeData.password);
        }

        // Hash PIN (mandatory for all employees)
        const pinHash = await this.hashPassword(employeeData.pin);

        // Create local employee record
        const localEmployeeData: Omit<LocalEmployee, 'id' | 'created_at' | 'updated_at' | 'needs_push' | 'is_conflicted' | 'last_synced_at'> = {
            employee_number: employeeData.employee_number,
            name: employeeData.name,
            email: null, // No longer using email
            phone: employeeData.phone || null,
            password_hash: passwordHash,
            pin: pinHash, // Store hashed PIN
            role: employeeData.role,
            access_levels: employeeData.access_levels,
            is_active: employeeData.is_active,
            hire_date: employeeData.hire_date,
            total_sales: 0,
            transaction_count: 0,
            average_transaction: 0,
            hours_worked: 0,
            deleted_at: null,
        };

        const employeeId = await employeeLocalService.createEmployee(localEmployeeData);

        // Trigger sync if online
        if (connectionStatus.getStatus().isSupabaseOnline) {
            this.performBackgroundSync();
        }

        return employeeId;
    }

    // Update employee
    async updateEmployee(id: string, updates: Partial<EmployeeFormData>): Promise<void> {
        await this.ensureInitialized();

        const updateData: Partial<LocalEmployee> = {};

        if (updates.name !== undefined) updateData.name = updates.name;
        if (updates.phone !== undefined) updateData.phone = updates.phone || null;
        if (updates.role !== undefined) updateData.role = updates.role;
        if (updates.access_levels !== undefined) updateData.access_levels = updates.access_levels;
        if (updates.is_active !== undefined) updateData.is_active = updates.is_active;
        if (updates.hire_date !== undefined) updateData.hire_date = updates.hire_date;

        // Hash PIN if provided (don't update if empty)
        if (updates.pin && updates.pin.trim()) {
            updateData.pin = await this.hashPassword(updates.pin);
        }

        // Hash password if provided
        if (updates.password) {
            updateData.password_hash = await this.hashPassword(updates.password);
        }

        await employeeLocalService.updateEmployee(id, updateData);

        // Trigger sync if online
        if (connectionStatus.getStatus().isSupabaseOnline) {
            this.performBackgroundSync();
        }
    }

    // Delete employee (soft delete)
    async deleteEmployee(id: string): Promise<void> {
        await this.ensureInitialized();
        await employeeLocalService.deleteEmployee(id);

        // Trigger sync if online
        if (connectionStatus.getStatus().isSupabaseOnline) {
            this.performBackgroundSync();
        }
    }

    // Search employees
    async searchEmployees(query: string): Promise<Employee[]> {
        await this.ensureInitialized();
        const localEmployees = await employeeLocalService.searchEmployees(query);
        return this.convertLocalToEmployee(localEmployees);
    }

    // Filter employees
    async filterEmployees(filters: EmployeeFilters): Promise<Employee[]> {
        await this.ensureInitialized();
        let employees = await employeeLocalService.getAllEmployees();

        // Apply filters
        if (filters.role && filters.role !== 'all') {
            employees = employees.filter(emp => emp.role === filters.role);
        }

        if (filters.is_active !== undefined) {
            employees = employees.filter(emp => emp.is_active === filters.is_active);
        }

        if (filters.search) {
            const searchTerm = filters.search.toLowerCase();
            employees = employees.filter(emp =>
                emp.name.toLowerCase().includes(searchTerm) ||
                emp.employee_number.toLowerCase().includes(searchTerm) ||
                (emp.email && emp.email.toLowerCase().includes(searchTerm))
            );
        }

        if (filters.hire_date_from) {
            employees = employees.filter(emp => emp.hire_date >= filters.hire_date_from!);
        }

        if (filters.hire_date_to) {
            employees = employees.filter(emp => emp.hire_date <= filters.hire_date_to!);
        }

        return this.convertLocalToEmployee(employees);
    }

    // Get employees by role
    async getEmployeesByRole(role: string): Promise<Employee[]> {
        await this.ensureInitialized();
        const localEmployees = await employeeLocalService.getEmployeesByRole(role);
        return this.convertLocalToEmployee(localEmployees);
    }

    // Get sync status
    async getSyncStatus(): Promise<SyncMetadata & { isOnline: boolean; isSyncing: boolean }> {
        await this.ensureInitialized();
        const syncMeta = await employeeLocalService.getSyncMetadata();
        const { isSupabaseOnline } = connectionStatus.getStatus();

        return {
            lastPulledAt: syncMeta?.lastPulledAt || null,
            lastPushedAt: syncMeta?.lastPushedAt || null,
            pendingOperations: syncMeta?.pendingOperations || 0,
            conflictCount: syncMeta?.conflictCount || 0,
            isOnline: isSupabaseOnline,
            isSyncing: this.syncInProgress,
        };
    }

    // Force sync (manual trigger)
    async forceSync(): Promise<{ success: boolean; error?: string }> {
        await this.ensureInitialized();

        if (!connectionStatus.getStatus().isSupabaseOnline) {
            return { success: false, error: 'Not connected to server' };
        }

        try {
            await this.performSync();
            return { success: true };
        } catch (error) {
            console.error('Force sync failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    // Subscribe to sync status changes
    onSyncStatusChange(callback: (status: 'syncing' | 'completed' | 'error', details?: any) => void): () => void {
        this.syncCallbacks.push(callback);
        return () => {
            const index = this.syncCallbacks.indexOf(callback);
            if (index > -1) {
                this.syncCallbacks.splice(index, 1);
            }
        };
    }

    // Get database statistics
    async getStats() {
        await this.ensureInitialized();
        return await employeeLocalService.getStats();
    }

    // === PRIVATE METHODS ===

    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    // Convert LocalEmployee to Employee interface
    private convertLocalToEmployee(localEmployees: LocalEmployee[]): Employee[] {
        return localEmployees.map(localEmp => ({
            id: localEmp.id,
            employee_number: localEmp.employee_number,
            name: localEmp.name,
            email: localEmp.email,
            phone: localEmp.phone,
            password_hash: localEmp.password_hash,
            pin: localEmp.pin,
            role: localEmp.role,
            access_levels: localEmp.access_levels,
            is_active: localEmp.is_active,
            hire_date: localEmp.hire_date,
            total_sales: localEmp.total_sales,
            transaction_count: localEmp.transaction_count,
            average_transaction: localEmp.average_transaction,
            hours_worked: localEmp.hours_worked,
            created_at: localEmp.created_at.toISOString(),
            updated_at: localEmp.updated_at.toISOString(),
            last_synced_at: localEmp.last_synced_at?.toISOString() || null,
            deleted_at: localEmp.deleted_at?.toISOString() || null,
            performance: {
                totalSales: localEmp.total_sales,
                transactionCount: localEmp.transaction_count,
                averageTransaction: localEmp.average_transaction,
                hoursWorked: localEmp.hours_worked,
            }
        }));
    }

    // Background sync (non-blocking)
    private async performBackgroundSync(): Promise<void> {
        if (this.syncInProgress) return;

        try {
            await this.performSync();
        } catch (error) {
            console.warn('Background sync failed:', error);
            // Don't throw for background sync failures
        }
    }

    // Perform bi-directional sync
    private async performSync(): Promise<void> {
        if (!isSupabaseConfigured() || this.syncInProgress) {
            return;
        }

        this.syncInProgress = true;
        this.notifySync('syncing');

        try {
            // Step 1: Push local changes to server
            await this.pushLocalChanges();

            // Step 2: Pull remote changes from server
            await this.pullRemoteChanges();

            this.notifySync('completed');
        } catch (error) {
            console.error('Sync failed:', error);
            this.notifySync('error', error);
            throw error;
        } finally {
            this.syncInProgress = false;
        }
    }

    // Check if online (same as products/categories)
    private async isOnline(): Promise<boolean> {
        try {
            const { error } = await supabase.from('employees').select('id').limit(1);
            return !error;
        } catch {
            return false;
        }
    }

    // Push local changes to Supabase (using bulk upsert like products/categories)
    private async pushLocalChanges(): Promise<void> {
        if (!(await this.isOnline())) return;

        const pendingEmployees = await employeeLocalService.getEmployeesNeedingPush();
        if (pendingEmployees.length === 0) return;

        try {
            // Convert to server format (same as products/categories pattern)
            const serverEmployees = pendingEmployees.map(emp => ({
                ...emp,
                created_at: emp.created_at.toISOString(),
                updated_at: emp.updated_at.toISOString(),
                last_synced_at: emp.last_synced_at?.toISOString() || null,
                deleted_at: emp.deleted_at?.toISOString() || null,
            }));

            // Use bulk upsert RPC (same pattern as products/categories)
            const { error } = await supabase.rpc('upsert_employees', {
                employees_data: serverEmployees
            });

            if (error) throw error;

            // Mark employees as synced
            const employeeIds = pendingEmployees.map(emp => emp.id);
            await employeeLocalService.markEmployeesSynced(employeeIds);
            
            // Update sync metadata
            await employeeLocalService.updateSyncMetadata({
                lastPushedAt: new Date().toISOString(),
            });

            console.log(`✅ Pushed ${pendingEmployees.length} employees to server`);
        } catch (error) {
            console.error('Failed to push employees:', error);
            throw error;
        }
    }

    // Pull remote changes from Supabase
    private async pullRemoteChanges(): Promise<void> {
        const syncMeta = await employeeLocalService.getSyncMetadata();
        const lastPulledAt = syncMeta?.lastPulledAt || '1970-01-01T00:00:00Z';

        const { data, error } = await supabase
            .rpc('get_employees_delta', { since_timestamp: lastPulledAt });

        if (error) {
            throw error;
        }

        if (data && data.length > 0) {
            // Insert/update employees in local database
            await employeeLocalService.bulkInsertFromServer(data);
        }

        // Update sync metadata
        await employeeLocalService.updateSyncMetadata({
            lastPulledAt: new Date().toISOString(),
        });
    }

    // Simple password hashing (in production, use a proper library like bcrypt)
    private async hashPassword(password: string): Promise<string> {
        return await hashPassword(password);
    }

    // Notify sync callbacks
    private notifySync(status: 'syncing' | 'completed' | 'error', details?: any): void {
        this.syncCallbacks.forEach(callback => {
            try {
                callback(status, details);
            } catch (error) {
                console.error('Error in sync callback:', error);
            }
        });
    }

    // Clean up resources
    destroy(): void {
        this.syncCallbacks = [];
        this.isInitialized = false;
    }
}

// Export singleton instance
export const employeeService = new EmployeeService();