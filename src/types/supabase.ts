// Supabase Database Types
// Generated types for the employees table and related functionality

export interface Database {
    public: {
        Tables: {
            employees: {
                Row: EmployeeRow;
                Insert: EmployeeInsert;
                Update: EmployeeUpdate;
            };
        };
        Functions: {
            get_employees_delta: {
                Args: { since_timestamp?: string };
                Returns: EmployeeRow[];
            };
            upsert_employees: {
                Args: { employees_data: unknown };
                Returns: { id: string; success: boolean; error: string }[];
            };
        };
    };
}

// Base employee interface from database
export interface EmployeeRow {
    id: string;
    employee_number: string;
    name: string;
    email: string | null;
    phone: string | null;
    password_hash: string | null;
    pin: string | null;
    role: 'admin' | 'manager' | 'cashier';
    access_levels: string[];
    is_active: boolean;
    hire_date: string; // ISO date string
    total_sales: number;
    transaction_count: number;
    average_transaction: number;
    hours_worked: number;
    created_at: string; // ISO timestamp
    updated_at: string; // ISO timestamp
    last_synced_at: string | null; // ISO timestamp
    deleted_at: string | null; // ISO timestamp
}

// For inserting new employees
export interface EmployeeInsert {
    id?: string; // Optional, will be generated if not provided
    employee_number: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    password_hash?: string | null;
    pin?: string | null;
    role: 'admin' | 'manager' | 'cashier';
    access_levels?: string[];
    is_active?: boolean;
    hire_date: string; // ISO date string
    total_sales?: number;
    transaction_count?: number;
    average_transaction?: number;
    hours_worked?: number;
    created_at?: string; // Will be auto-generated if not provided
    updated_at?: string; // Will be auto-generated
    last_synced_at?: string | null;
    deleted_at?: string | null;
}

// For updating existing employees
export interface EmployeeUpdate {
    id?: never; // Can't update ID
    employee_number?: string;
    name?: string;
    email?: string | null;
    phone?: string | null;
    password_hash?: string | null;
    pin?: string | null;
    role?: 'admin' | 'manager' | 'cashier';
    access_levels?: string[];
    is_active?: boolean;
    hire_date?: string;
    total_sales?: number;
    transaction_count?: number;
    average_transaction?: number;
    hours_worked?: number;
    updated_at?: string; // Will be auto-generated
    last_synced_at?: string | null;
    deleted_at?: string | null;
}

// Enhanced employee interface for the app (extends database row)
export interface Employee extends EmployeeRow {
    // Additional computed fields that might be useful in the UI
    performance?: {
        totalSales: number;
        transactionCount: number;
        averageTransaction: number;
        hoursWorked?: number;
    };
    loginHistory?: Array<{
        timestamp: string;
        device?: string;
        success: boolean;
    }>;
}

// Sync metadata for offline operations
export interface SyncMetadata {
    lastPulledAt: string | null; // ISO timestamp
    lastPushedAt: string | null; // ISO timestamp
    pendingOperations: number;
    conflictCount: number;
}

// Sync operation queue item
export interface PendingEmployeeOperation {
    id: string; // Local operation ID
    type: 'CREATE' | 'UPDATE' | 'DELETE';
    employeeId: string;
    data: EmployeeInsert | EmployeeUpdate | null;
    timestamp: string; // ISO timestamp
    retryCount: number;
    error?: string;
}

// API response types
export interface EmployeeSyncResponse {
    employees: EmployeeRow[];
    syncMetadata: {
        serverTimestamp: string;
        hasMore: boolean;
        totalCount: number;
    };
}

export interface BulkUpsertResponse {
    results: Array<{
        id: string;
        success: boolean;
        error?: string;
    }>;
    totalProcessed: number;
    successCount: number;
    errorCount: number;
}

// Local database (Dexie) schema interfaces
export interface LocalEmployee extends Omit<EmployeeRow, 'created_at' | 'updated_at' | 'last_synced_at' | 'deleted_at'> {
    // Local specific fields
    created_at: Date;
    updated_at: Date;
    last_synced_at: Date | null;
    deleted_at: Date | null;

    // Sync flags
    needs_push: boolean; // Indicates local changes need to be synced to server
    is_conflicted: boolean; // Indicates a sync conflict needs resolution
}

// Validation schemas (for runtime type checking)
export const EmployeeRoles = ['admin', 'manager', 'cashier'] as const;
export type EmployeeRole = typeof EmployeeRoles[number];

export const AccessLevels = [
    'all',
    'sales',
    'inventory',
    'reports',
    'dashboard',
    'employees',
    'settings',
    'transactions',
    'products'
] as const;
export type AccessLevel = typeof AccessLevels[number];

// Form data interfaces (for employee creation/editing forms)
export interface EmployeeFormData {
    employee_number: string;
    name: string;
    email: string;
    phone: string;
    role: EmployeeRole;
    access_levels: AccessLevel[];
    hire_date: string; // ISO date string
    password?: string; // Raw password (will be hashed)
    pin?: string;
    is_active: boolean;
}

// Search and filter interfaces
export interface EmployeeFilters {
    role?: EmployeeRole | 'all';
    is_active?: boolean;
    search?: string; // Search by name or employee number
    hire_date_from?: string;
    hire_date_to?: string;
}

export interface EmployeeSortOptions {
    field: keyof EmployeeRow;
    direction: 'asc' | 'desc';
} 