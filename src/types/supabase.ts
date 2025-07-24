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
            categories: {
                Row: CategoryRow;
                Insert: CategoryInsert;
                Update: CategoryUpdate;
            };
            products: {
                Row: ProductRow;
                Insert: ProductInsert;
                Update: ProductUpdate;
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
            get_categories_delta: {
                Args: { last_sync_timestamp?: string };
                Returns: CategoryRow[];
            };
            get_products_delta: {
                Args: { last_sync_timestamp?: string };
                Returns: ProductRow[];
            };
            upsert_categories: {
                Args: { categories_data: unknown };
                Returns: number;
            };
            upsert_products: {
                Args: { products_data: unknown };
                Returns: number;
            };
        };
    };
}

// =====================================================
// CATEGORY TYPES
// =====================================================

// Base category interface from database
export interface CategoryRow {
    id: string;
    name: string;
    description: string | null;
    color: string; // Tailwind gradient classes
    icon: string; // Icon name for UI
    display_order: number;
    is_active: boolean;
    created_at: string; // ISO timestamp
    updated_at: string; // ISO timestamp
    last_synced_at: string | null; // ISO timestamp
    deleted_at: string | null; // ISO timestamp
}

// For inserting new categories
export interface CategoryInsert {
    id?: string; // Optional, will be generated if not provided
    name: string;
    description?: string | null;
    color?: string;
    icon?: string;
    display_order?: number;
    is_active?: boolean;
    created_at?: string; // Will be auto-generated if not provided
    updated_at?: string; // Will be auto-generated
    last_synced_at?: string | null;
    deleted_at?: string | null;
}

// For updating existing categories
export interface CategoryUpdate {
    id?: never; // Can't update ID
    name?: string;
    description?: string | null;
    color?: string;
    icon?: string;
    display_order?: number;
    is_active?: boolean;
    updated_at?: string; // Will be auto-generated
    last_synced_at?: string | null;
    deleted_at?: string | null;
}

// Enhanced category interface for the app
export interface Category extends CategoryRow {
    // Additional computed fields
    product_count?: number;
}

// =====================================================
// PRODUCT TYPES
// =====================================================

// Base product interface from database
export interface ProductRow {
    id: string;
    name: string;
    description: string | null;
    sku: string;
    barcode: string | null;
    category_id: string | null;
    category_name: string | null; // Denormalized for performance
    price: number;
    cost: number;
    iva_rate: number; // Portuguese IVA tax rate as decimal (0.06, 0.13, 0.23)
    stock: number;
    min_stock: number;
    track_stock: boolean;
    image_url: string | null;
    supplier: string | null;
    location: string | null;
    is_active: boolean;
    display_order: number;
    created_at: string; // ISO timestamp
    updated_at: string; // ISO timestamp
    last_synced_at: string | null; // ISO timestamp
    deleted_at: string | null; // ISO timestamp
}

// For inserting new products
export interface ProductInsert {
    id?: string; // Optional, will be generated if not provided
    name: string;
    description?: string | null;
    sku: string;
    barcode?: string | null;
    category_id?: string | null;
    category_name?: string | null;
    price: number;
    cost?: number;
    iva_rate: number;
    stock?: number;
    min_stock?: number;
    track_stock?: boolean;
    image_url?: string | null;
    supplier?: string | null;
    location?: string | null;
    is_active?: boolean;
    display_order?: number;
    created_at?: string; // Will be auto-generated if not provided
    updated_at?: string; // Will be auto-generated
    last_synced_at?: string | null;
    deleted_at?: string | null;
}

// For updating existing products
export interface ProductUpdate {
    id?: never; // Can't update ID
    name?: string;
    description?: string | null;
    sku?: string;
    barcode?: string | null;
    category_id?: string | null;
    category_name?: string | null;
    price?: number;
    cost?: number;
    iva_rate?: number;
    stock?: number;
    min_stock?: number;
    track_stock?: boolean;
    image_url?: string | null;
    supplier?: string | null;
    location?: string | null;
    is_active?: boolean;
    display_order?: number;
    updated_at?: string; // Will be auto-generated
    last_synced_at?: string | null;
    deleted_at?: string | null;
}

// Enhanced product interface for the app
export interface Product extends ProductRow {
    // Additional computed fields
    stock_status?: 'in_stock' | 'low_stock' | 'out_of_stock';
    category?: Category; // Full category object
    tax_amount?: number; // Calculated tax amount
    price_with_tax?: number; // Price including IVA
}

// =====================================================
// EMPLOYEE TYPES
// =====================================================

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
    'sales',        // POS operations only
    'inventory',    // Product and category management (merged products + inventory)
    'reports',      // Business reports and analytics
    'dashboard',    // Main dashboard access
    'employees',    // Employee management
    'settings',     // System configuration
    'transactions'  // Transaction history (separate from sales)
] as const;
export type AccessLevel = typeof AccessLevels[number];

// Form data interfaces (for employee creation/editing forms)
export interface EmployeeFormData {
    employee_number: string;
    name: string;
    phone?: string; // Optional - only for managers and admins
    role: EmployeeRole;
    access_levels: AccessLevel[];
    hire_date: string; // ISO date string
    password?: string; // Raw password (will be hashed) - for admin login only
    pin: string; // Mandatory PIN for all roles (6+ chars, will be hashed)
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

// =====================================================
// PRODUCT & CATEGORY SYNC TYPES
// =====================================================

// Local database interfaces for products and categories
export interface LocalCategory extends Omit<CategoryRow, 'created_at' | 'updated_at' | 'last_synced_at' | 'deleted_at'> {
    // Local specific fields
    created_at: Date;
    updated_at: Date;
    last_synced_at: Date | null;
    deleted_at: Date | null;

    // Sync flags
    needs_push: boolean;
    is_conflicted: boolean;
}

export interface LocalProduct extends Omit<ProductRow, 'created_at' | 'updated_at' | 'last_synced_at' | 'deleted_at'> {
    // Local specific fields
    created_at: Date;
    updated_at: Date;
    last_synced_at: Date | null;
    deleted_at: Date | null;

    // Sync flags
    needs_push: boolean;
    is_conflicted: boolean;
}

// Sync operation queue items
export interface PendingCategoryOperation {
    id: string;
    type: 'CREATE' | 'UPDATE' | 'DELETE';
    categoryId: string;
    data: CategoryInsert | CategoryUpdate | null;
    timestamp: string;
    retryCount: number;
    error?: string;
}

export interface PendingProductOperation {
    id: string;
    type: 'CREATE' | 'UPDATE' | 'DELETE';
    productId: string;
    data: ProductInsert | ProductUpdate | null;
    timestamp: string;
    retryCount: number;
    error?: string;
}

// API response types
export interface CategorySyncResponse {
    categories: CategoryRow[];
    syncMetadata: {
        serverTimestamp: string;
        hasMore: boolean;
        totalCount: number;
    };
}

export interface ProductSyncResponse {
    products: ProductRow[];
    syncMetadata: {
        serverTimestamp: string;
        hasMore: boolean;
        totalCount: number;
    };
}

// Form data interfaces
export interface CategoryFormData {
    name: string;
    description: string;
    color: string;
    icon: string;
    display_order: number;
    is_active: boolean;
}

export interface ProductFormData {
    name: string;
    description: string;
    sku: string;
    category_id: string;
    price: number;
    cost: number;
    iva_rate: number;
    stock: number;
    min_stock: number;
    track_stock: boolean;
    image_url: string;
    supplier: string;
    location: string;
    is_active: boolean;
}

// Filter and search interfaces
export interface ProductFilters {
    category_id?: string | 'all';
    is_active?: boolean;
    stock_status?: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
    search?: string; // Search by name, SKU, or barcode
    price_min?: number;
    price_max?: number;
    supplier?: string;
}

export interface CategoryFilters {
    is_active?: boolean;
    search?: string; // Search by name or description
}

export interface ProductSortOptions {
    field: keyof ProductRow;
    direction: 'asc' | 'desc';
}

export interface CategorySortOptions {
    field: keyof CategoryRow;
    direction: 'asc' | 'desc';
}

// Portuguese IVA rates constants
export const IVA_RATES = [
    { value: 0.06, label: '6% (Reduced Rate)', description: 'Basic foods, books, medicines' },
    { value: 0.13, label: '13% (Intermediate Rate)', description: 'Restaurants, hotels, some services' },
    { value: 0.23, label: '23% (Standard Rate)', description: 'Most goods and services' }
] as const;

export type IVARate = typeof IVA_RATES[number]['value'];

// Stock status calculation helper
export const calculateStockStatus = (product: Pick<ProductRow, 'stock' | 'min_stock' | 'track_stock'>): 'in_stock' | 'low_stock' | 'out_of_stock' => {
    if (!product.track_stock) return 'in_stock';
    if (product.stock === 0) return 'out_of_stock';
    if (product.stock <= product.min_stock) return 'low_stock';
    return 'in_stock';
};

// Tax calculation helpers
export const calculateTaxAmount = (price: number, ivaRate: number): number => {
    return price * ivaRate;
};

export const calculatePriceWithTax = (price: number, ivaRate: number): number => {
    return price + calculateTaxAmount(price, ivaRate);
};

export const calculatePriceWithoutTax = (priceWithTax: number, ivaRate: number): number => {
    return priceWithTax / (1 + ivaRate);
}; 