// Supabase Database Types
// Generated types for the employees table and related functionality

import type { FiscalDocumentRow } from '../fiscal/types';
import { readPosTrackInventoryFromStorage } from '../utils/posSettingsStorage';

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
            customers: {
                Row: CustomerRow;
                Insert: CustomerInsert;
                Update: CustomerUpdate;
            };
            transactions: {
                Row: TransactionRow;
                Insert: TransactionInsert;
                Update: TransactionUpdate;
            };
            transaction_items: {
                Row: TransactionItemRow;
                Insert: TransactionItemInsert;
                Update: TransactionItemUpdate;
            };
            daily_sales_summary: {
                Row: DailySalesSummaryRow;
                Insert: DailySalesSummaryInsert;
                Update: DailySalesSummaryUpdate;
            };
        };
        Functions: {
            get_employees_delta: {
                Args: { since_timestamp?: string };
                Returns: EmployeeRow[];
            };
            employee_pin_login: {
                Args: { p_employee_number: string; p_secret: string };
                Returns: EmployeeLoginResult[];
            };
            get_employee_profile: {
                Args: { p_employee_id: string };
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
            get_transactions_delta: {
                Args: { last_sync_timestamp?: string };
                Returns: TransactionRow[];
            };
            get_transaction_items_delta: {
                Args: { last_sync_timestamp?: string };
                Returns: TransactionItemRow[];
            };
            get_customers_delta: {
                Args: { since_timestamp?: string };
                Returns: CustomerRow[];
            };
            upsert_customers: {
                Args: { customers_data: unknown };
                Returns: { id: string; success: boolean; error: string }[];
            };
            upsert_transaction_with_items: {
                Args: { transaction_data: unknown; items_data: unknown };
                Returns: { transaction_id: string; success: boolean; error?: string };
            };
            generate_transaction_number: {
                Args: Record<PropertyKey, never>;
                Returns: string;
            };
            calculate_transaction_totals: {
                Args: { transaction_uuid: string };
                Returns: {
                    subtotal: number;
                    total_tax: number;
                    total_profit: number;
                    total_amount: number;
                }[];
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
    /** Sold by weight: price is €/kg, cart quantity is kg (3 decimals), stock is kg.
     *  Optional because rows synced before the weight-products migration lack it. */
    sold_by_weight?: boolean;
    image_url: string | null;
    supplier: string | null;
    location: string | null;
    is_active: boolean;
    display_order: number;
    /** Optional: rows synced before migration 20260731000000 lack these. */
    takeaway_price?: number | null;
    variants?: ProductVariantAttribute[] | null;
    modifiers?: ProductModifier[] | null;
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
    sold_by_weight?: boolean;
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
    sold_by_weight?: boolean;
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
    tenant_id?: string;
    employee_number: string;
    name: string;
    email: string | null;
    phone: string | null;
    // Transitional local-write fields only. Phase 2 removes these columns from
    // public.employees and the server roster never returns them.
    password_hash?: string | null;
    pin?: string | null;
    role: 'admin' | 'manager' | 'cashier' | 'trainee';
    access_levels: string[];
    is_active: boolean;
    hire_date: string; // ISO date string
    total_sales: number;
    transaction_count: number;
    average_transaction: number;
    hours_worked: number;
    auth_id?: string | null; // Linked Supabase auth user id (if provisioned)
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
    role: 'admin' | 'manager' | 'cashier' | 'trainee';
    access_levels?: string[];
    is_active?: boolean;
    hire_date: string; // ISO date string
    total_sales?: number;
    transaction_count?: number;
    average_transaction?: number;
    hours_worked?: number;
    auth_id?: string | null;
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
    role?: 'admin' | 'manager' | 'cashier' | 'trainee';
    access_levels?: string[];
    is_active?: boolean;
    hire_date?: string;
    total_sales?: number;
    transaction_count?: number;
    average_transaction?: number;
    hours_worked?: number;
    auth_id?: string | null;
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

export interface EmployeeLoginResult {
    employee_id: string | null;
    employee_number: string | null;
    name: string | null;
    role: string | null;
    success: boolean;
    error: 'invalid_credentials' | 'locked' | 'no_tenant_context' | null;
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
export const EmployeeRoles = ['admin', 'manager', 'cashier', 'trainee'] as const;
export type EmployeeRole = typeof EmployeeRoles[number];

export const AccessLevels = [
    'all',
    'sales',        // POS operations only
    'inventory',    // Product and category management (merged products + inventory)
    'customers',    // Customer management
    'reports',      // Business reports and analytics
    'dashboard',    // Main dashboard access
    'employees',    // Employee management
    'settings',     // System configuration
    'transactions', // Transaction history (separate from sales)
    'profit_costs', // Profit and cost reporting
    'orders',       // POS and platform order management
    'clear_data'    // Clear non-fiscal local IndexedDB data
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
    pin: string; // Mandatory PIN for all roles (4+ digits, will be hashed)
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

/** One selectable option of a variant attribute (e.g. Size -> Large, +2.00). */
export interface ProductVariantOption {
    id: string;
    name: string;
    price_delta: number;
    enabled: boolean;
}

/** A variant attribute group (e.g. Size, Spicy) configured on a product. */
export interface ProductVariantAttribute {
    id: string;
    name: string;
    enabled: boolean;
    options: ProductVariantOption[];
}

/** A toggleable, priced add-on (e.g. Extra Cheese +3.00) configured on a product. */
export interface ProductModifier {
    id: string;
    name: string;
    price_delta: number;
    enabled: boolean;
}

export interface LocalProduct extends Omit<ProductRow, 'created_at' | 'updated_at' | 'last_synced_at' | 'deleted_at'> {
    // Local specific fields
    created_at: Date;
    updated_at: Date;
    last_synced_at: Date | null;
    deleted_at: Date | null;
    /**
     * A sale changed this store's stock and it has not reached `store_products`
     * yet. Separate from `needs_push` on purpose: stock belongs to the store
     * row, catalogue fields belong to the tenant row, and pushing the two to the
     * same place is what let one store's sale draw down another's inventory.
     * Not indexed — Dexie needs no schema bump for a plain field.
     */
    store_stock_dirty?: boolean;

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
    sold_by_weight: boolean;
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

// Spanish IVA rates (ES-1, Veri*factu track — docs/fiskaly-strategy-brief.md). The server
// column is a generic NUMERIC(5,4), so rate sets are a per-country UI concern. NOTE: recargo
// de equivalencia (per-line surcharge for equivalence-regime retailers) is deliberately NOT
// modeled on products — loudly deferred, REGISTER D-ES1.
export const ES_IVA_RATES = [
    { value: 0.00, label: '0% (Exento/0%)', description: 'Exempt or 0%-rated essentials' },
    { value: 0.04, label: '4% (Superreducido)', description: 'Basic necessities: bread, milk, books, medicines' },
    { value: 0.10, label: '10% (Reducido)', description: 'Food, hospitality, passenger transport' },
    { value: 0.21, label: '21% (General)', description: 'Most goods and services' }
] as const;

// Country-aware rate list for product/tax UIs (falls back to PT, the current default market).
export const ivaRatesForCountry = (country: string | null | undefined) =>
    (country || 'PT').toUpperCase() === 'ES' ? ES_IVA_RATES : IVA_RATES;

// Stock status calculation helper
export const calculateStockStatus = (product: Pick<ProductRow, 'stock' | 'min_stock' | 'track_stock'>): 'in_stock' | 'low_stock' | 'out_of_stock' => {
    if (!readPosTrackInventoryFromStorage() || !product.track_stock) return 'in_stock';
    if (product.stock === 0) return 'out_of_stock';
    if (product.stock <= product.min_stock) return 'low_stock';
    return 'in_stock';
};

// Tax calculation helpers (European-style: tax-inclusive pricing)
export const calculateTaxAmount = (priceWithTax: number, ivaRate: number): number => {
    // Extract tax from a tax-inclusive price
    return priceWithTax - (priceWithTax / (1 + ivaRate));
};

export const calculatePriceWithTax = (priceWithoutTax: number, ivaRate: number): number => {
    // Add tax to a tax-exclusive price
    return priceWithoutTax * (1 + ivaRate);
};

export const calculatePriceWithoutTax = (priceWithTax: number, ivaRate: number): number => {
    // Extract base price from a tax-inclusive price
    return priceWithTax / (1 + ivaRate);
};

// =====================================================
// CUSTOMER TYPES
// =====================================================

// Base customer interface from database
export interface CustomerRow {
    id: string;
    name: string;
    /** NIF / VAT for fiscal documents (optional). */
    tax_number: string | null;
    /** ISO 3166-1 alpha-2 for AT QR segment C (default PT). */
    country: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    postal_code: string | null;
    total_spent: number;
    transaction_count: number;
    loyalty_points: number;
    is_active: boolean;
    preferred_payment_method: string | null;
    created_at: string; // ISO timestamp
    updated_at: string; // ISO timestamp
    last_synced_at: string | null; // ISO timestamp
    deleted_at: string | null; // ISO timestamp
}

// For inserting new customers
export interface CustomerInsert {
    id?: string; // Optional, will be generated if not provided
    name: string;
    tax_number?: string | null;
    country?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    postal_code?: string | null;
    total_spent?: number;
    transaction_count?: number;
    loyalty_points?: number;
    is_active?: boolean;
    preferred_payment_method?: string | null;
    created_at?: string; // Will be auto-generated if not provided
    updated_at?: string; // Will be auto-generated
    last_synced_at?: string | null;
    deleted_at?: string | null;
}

// For updating existing customers
export interface CustomerUpdate {
    id?: never; // Can't update ID
    name?: string;
    tax_number?: string | null;
    country?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    postal_code?: string | null;
    total_spent?: number;
    transaction_count?: number;
    loyalty_points?: number;
    is_active?: boolean;
    preferred_payment_method?: string | null;
    updated_at?: string; // Will be auto-generated
    last_synced_at?: string | null;
    deleted_at?: string | null;
}

// Enhanced customer interface for the app
export interface Customer extends CustomerRow {
    // Additional computed fields
    average_transaction?: number;
    last_purchase_date?: string;
}

// =====================================================
// TRANSACTION TYPES
// =====================================================

// Base transaction interface from database
export interface TransactionRow {
    id: string;
    transaction_number: string;
    employee_id: string;
    employee_name: string;
    customer_id: string | null;
    customer_name: string | null;
    transaction_date: string; // ISO date string
    transaction_time: string; // Time string (HH:MM:SS)
    subtotal: number;
    discount: number;
    discount_type?: 'none' | 'percentage' | 'fixed';
    discount_percentage?: number;
    tax: number;
    total: number;
    payment_method: 'cash' | 'card' | 'mixed';
    amount_paid: number | null;
    change_given: number;
    status: 'completed' | 'refunded' | 'pending' | 'cancelled';
    notes: string | null;
    receipt_number: string | null;
    /** Local fiscal document id (Dexie); mirrors fiscal_documents.id */
    fiscal_document_id?: string | null;
    /** Immutable fiscal snapshot JSON for sync / SAF-T */
    fiscal_metadata_json?: string | null;
    /** Mirror of local fiscal cancellation (evidence on server). */
    fiscal_cancelled_at?: string | null;
    fiscal_cancelled_reason?: string | null;
    fiscal_cancelled_by_employee_id?: string | null;
    created_at: string; // ISO timestamp
    updated_at: string; // ISO timestamp
    last_synced_at: string | null; // ISO timestamp
    deleted_at: string | null; // ISO timestamp
}

// For inserting new transactions
export interface TransactionInsert {
    id?: string; // Optional, will be generated if not provided
    transaction_number?: string; // Will be generated if not provided
    employee_id: string;
    employee_name: string;
    customer_id?: string | null;
    customer_name?: string | null;
    transaction_date: string; // ISO date string
    transaction_time: string; // Time string
    subtotal: number;
    discount?: number;
    discount_type?: 'none' | 'percentage' | 'fixed';
    discount_percentage?: number;
    tax: number;
    total: number;
    payment_method: 'cash' | 'card' | 'mixed';
    amount_paid?: number | null;
    change_given?: number;
    status?: 'completed' | 'refunded' | 'pending' | 'cancelled';
    notes?: string | null;
    receipt_number?: string | null;
    fiscal_document_id?: string | null;
    fiscal_metadata_json?: string | null;
    fiscal_cancelled_at?: string | null;
    fiscal_cancelled_reason?: string | null;
    fiscal_cancelled_by_employee_id?: string | null;
    created_at?: string; // Will be auto-generated if not provided
    updated_at?: string; // Will be auto-generated
    last_synced_at?: string | null;
    deleted_at?: string | null;
}

// For updating existing transactions
export interface TransactionUpdate {
    id?: never; // Can't update ID
    transaction_number?: never; // Can't update transaction number
    employee_id?: string;
    employee_name?: string;
    customer_id?: string | null;
    customer_name?: string | null;
    transaction_date?: string;
    transaction_time?: string;
    subtotal?: number;
    discount?: number;
    discount_type?: 'none' | 'percentage' | 'fixed';
    discount_percentage?: number;
    tax?: number;
    total?: number;
    payment_method?: 'cash' | 'card' | 'mixed';
    amount_paid?: number | null;
    change_given?: number;
    status?: 'completed' | 'refunded' | 'pending' | 'cancelled';
    notes?: string | null;
    receipt_number?: string | null;
    fiscal_document_id?: string | null;
    fiscal_metadata_json?: string | null;
    fiscal_cancelled_at?: string | null;
    fiscal_cancelled_reason?: string | null;
    fiscal_cancelled_by_employee_id?: string | null;
    updated_at?: string; // Will be auto-generated
    last_synced_at?: string | null;
    deleted_at?: string | null;
}

// Enhanced transaction interface for the app
export interface Transaction extends TransactionRow {
    // Additional computed fields
    items?: TransactionItem[];
    customer?: Customer;
    employee?: Employee;
}

// =====================================================
// TRANSACTION ITEM TYPES
// =====================================================

// Base transaction item interface from database
export interface TransactionItemRow {
    id: string;
    transaction_id: string;
    product_id: string;
    product_name: string;
    product_sku: string;
    category_id: string | null;
    category_name: string | null;
    quantity: number;
    /** 'kg' when the line was sold by weight (quantity is kg, unit_price €/kg).
     *  Optional: rows written before the weight-products migration lack it ('un'). */
    unit?: 'un' | 'kg';
    unit_price: number;
    unit_cost: number;
    iva_rate: number;
    line_total: number;
    tax_amount: number;
    profit_amount: number;
    discount_amount: number;
    discount_percentage: number;
    created_at: string; // ISO timestamp
    updated_at: string; // ISO timestamp
    last_synced_at: string | null; // ISO timestamp
    deleted_at: string | null; // ISO timestamp
}

// For inserting new transaction items
export interface TransactionItemInsert {
    id?: string; // Optional, will be generated if not provided
    transaction_id: string;
    product_id: string;
    product_name: string;
    product_sku: string;
    category_id?: string | null;
    category_name?: string | null;
    quantity: number;
    unit?: 'un' | 'kg';
    unit_price: number;
    unit_cost?: number;
    iva_rate: number;
    line_total: number;
    tax_amount: number;
    profit_amount?: number;
    discount_amount?: number;
    discount_percentage?: number;
    created_at?: string; // Will be auto-generated if not provided
    updated_at?: string; // Will be auto-generated
    last_synced_at?: string | null;
    deleted_at?: string | null;
}

// For updating existing transaction items
export interface TransactionItemUpdate {
    id?: never; // Can't update ID
    transaction_id?: never; // Can't update transaction ID
    product_id?: string;
    product_name?: string;
    product_sku?: string;
    category_id?: string | null;
    category_name?: string | null;
    quantity?: number;
    unit_price?: number;
    unit_cost?: number;
    iva_rate?: number;
    line_total?: number;
    tax_amount?: number;
    profit_amount?: number;
    discount_amount?: number;
    discount_percentage?: number;
    updated_at?: string; // Will be auto-generated
    last_synced_at?: string | null;
    deleted_at?: string | null;
}

// Enhanced transaction item interface for the app
export interface TransactionItem extends TransactionItemRow {
    // Additional computed fields
    product?: Product;
    category?: Category;
}

// =====================================================
// DAILY SALES SUMMARY TYPES
// =====================================================

// Base daily sales summary interface from database
export interface DailySalesSummaryRow {
    summary_date: string; // ISO date string
    employee_id: string;
    total_sales: number;
    transaction_count: number;
    items_sold: number;
    average_transaction: number;
    cash_sales: number;
    card_sales: number;
    mixed_sales: number;
    total_tax: number;
    total_profit: number;
    created_at: string; // ISO timestamp
    updated_at: string; // ISO timestamp
}

// For inserting new daily sales summary
export interface DailySalesSummaryInsert {
    summary_date: string; // ISO date string
    employee_id: string;
    total_sales?: number;
    transaction_count?: number;
    items_sold?: number;
    average_transaction?: number;
    cash_sales?: number;
    card_sales?: number;
    mixed_sales?: number;
    total_tax?: number;
    total_profit?: number;
    created_at?: string; // Will be auto-generated if not provided
    updated_at?: string; // Will be auto-generated
}

// For updating existing daily sales summary
export interface DailySalesSummaryUpdate {
    summary_date?: never; // Part of composite key, can't update
    employee_id?: never; // Part of composite key, can't update
    total_sales?: number;
    transaction_count?: number;
    items_sold?: number;
    average_transaction?: number;
    cash_sales?: number;
    card_sales?: number;
    mixed_sales?: number;
    total_tax?: number;
    total_profit?: number;
    updated_at?: string; // Will be auto-generated
}

// Enhanced daily sales summary interface for the app
export interface DailySalesSummary extends DailySalesSummaryRow {
    // Additional computed fields
    employee?: Employee;
}

// =====================================================
// REPORTING TYPES
// =====================================================

// For the Reports page - matches the existing mock data structure
export interface ReportTransaction {
    id: string;
    employeeId: string;
    employeeName: string;
    customerId?: string;
    customerName?: string;
    date: string;
    time: string;
    items: Array<{
        productId: string;
        productName: string;
        categoryId: string;
        categoryName: string;
        quantity: number;
        unitPrice: number;
        cost: number;
        total: number;
        profit: number;
    }>;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    paymentMethod: 'cash' | 'card' | 'mixed';
    status: 'completed' | 'refunded';
}

// Report filters
export interface ReportFilters {
    dateRange: {
        start: string;
        end: string;
    };
    /** Inclusive hour-of-day range (0–23) for time-of-day analysis. Omit for all hours. */
    hourRange?: {
        start: number;
        end: number;
    };
    employeeId?: string;
    categoryId?: string;
    paymentMethod?: string;
}

// Employee performance metrics
export interface EmployeePerformance {
    employeeId: string;
    employeeName: string;
    totalSales: number;
    transactionCount: number;
    itemsSold: number;
}

// Product performance metrics
export interface ProductPerformance {
    productId: string;
    productName: string;
    categoryName: string;
    quantitySold: number;
    totalRevenue: number;
    transactionCount: number;
}

// Overview metrics for reports
export interface OverviewMetrics {
    totalRevenue: number;
    totalTransactions: number;
    totalItems: number;
    avgTransaction: number;
}

// =====================================================
// FORM AND API TYPES
// =====================================================

// Transaction form data (for creating new transactions)
export interface TransactionFormData {
    employee_id: string;
    customer_id?: string;
    items: Array<{
        product_id: string;
        quantity: number;
        unit_price: number;
        discount_percentage?: number;
    }>;
    payment_method: 'cash' | 'card' | 'mixed';
    amount_paid?: number;
    notes?: string;
}

// Customer form data
export interface CustomerFormData {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    preferred_payment_method?: string;
}

// Transaction search and filter options
export interface TransactionFilters {
    employee_id?: string;
    customer_id?: string;
    payment_method?: 'cash' | 'card' | 'mixed';
    status?: 'completed' | 'refunded' | 'pending' | 'cancelled';
    date_from?: string;
    date_to?: string;
    search?: string; // Search by transaction number, customer name, or employee name
    min_amount?: number;
    max_amount?: number;
}

export interface TransactionSortOptions {
    field: keyof TransactionRow;
    direction: 'asc' | 'desc';
}

// =====================================================
// PAYMENT CONSTANTS
// =====================================================

export const PaymentMethods = ['cash', 'card', 'mixed'] as const;
export type PaymentMethod = typeof PaymentMethods[number];

export const TransactionStatuses = ['completed', 'refunded', 'pending', 'cancelled'] as const;
export type TransactionStatus = typeof TransactionStatuses[number];

// =====================================================
// LOCAL DATABASE TYPES FOR OFFLINE SYNC
// =====================================================

/** Persisted fiscal row (Portugal AT); Dexie + optional server JSON mirror. */
export interface LocalFiscalDocument extends FiscalDocumentRow {
    needs_push: boolean;
}

export interface LocalFiscalAuditEvent {
    id: string;
    event_type: string;
    payload_json: string;
    employee_id: string | null;
    created_at: string;
}

export interface LocalVendusIssueAttempt {
    id: string;
    /** Issuing backend; absent on legacy rows (treated as `vendus`). */
    provider?: 'vendus' | 'invoicexpress' | 'fiskaly';
    kind: 'sale' | 'credit_note';
    tx_id: string;
    external_reference: string;
    status: 'pending' | 'issued' | 'persisted' | 'failed';
    /** External document id (named for Vendus historically; generic across providers). */
    vendus_document_id: string | null;
    local_transaction_id: string | null;
    request_json: string;
    response_json: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
}

// Local database interfaces for customers
export interface LocalCustomer extends Omit<CustomerRow, 'created_at' | 'updated_at' | 'last_synced_at' | 'deleted_at'> {
    // Local specific fields
    created_at: Date;
    updated_at: Date;
    last_synced_at: Date | null;
    deleted_at: Date | null;

    // Sync flags
    needs_push: boolean;
    is_conflicted: boolean;
}

export type QueueTicketStatus = 'preparing' | 'ready' | 'collected';

export interface LocalQueueTicket {
    id: string;
    receipt_reference: string;
    service_date: string;
    sequence: number;
    display_number: string;
    status: QueueTicketStatus;
    created_at: Date;
    updated_at: Date;
    ready_at: Date | null;
    collected_at: Date | null;
}

/** Mutable, till-local restaurant order. This is deliberately separate from
 * `LocalTransaction`: a table order is not a fiscal document and must not
 * enter the transaction sync/reporting path until checkout is completed. */
export type TableOrderStatus = 'open' | 'settling' | 'settled';

export interface TableOrderLine {
    /** Preserves the cart-line identity, including distinct weighed lines. */
    lineId: string;
    /** Product snapshot: price, VAT and weight rules stay stable while parked. */
    product: LocalProduct;
    quantity: number;
    discount: number;
}

export interface TableOrderGlobalDiscount {
    type: 'none' | 'percentage' | 'fixed';
    value: number;
}

export interface TableOrderPointsRedemption {
    customerId: string;
    points: number;
}

export interface LocalTableOrder {
    id: string;
    table_id: string;
    table_name: string;
    status: TableOrderStatus;
    /** Cart snapshot. It is mutable until settlement and never fiscal on its own. */
    lines: TableOrderLine[];
    customer: LocalCustomer | null;
    global_discount: TableOrderGlobalDiscount;
    points_redemption: TableOrderPointsRedemption | null;
    created_at: Date;
    updated_at: Date;
    settled_at: Date | null;
    /** Link retained after settlement; the fiscal transaction itself remains immutable. */
    fiscal_transaction_id: string | null;
}

// Local database interfaces for transactions
export interface LocalTransaction extends Omit<TransactionRow, 'created_at' | 'updated_at' | 'last_synced_at' | 'deleted_at'> {
    // Local specific fields
    created_at: Date;
    updated_at: Date;
    last_synced_at: Date | null;
    deleted_at: Date | null;

    // Sync flags
    needs_push: boolean;
    is_conflicted: boolean;
}

// Local database interfaces for transaction items
export interface LocalTransactionItem extends Omit<TransactionItemRow, 'created_at' | 'updated_at' | 'last_synced_at' | 'deleted_at'> {
    // Local specific fields
    created_at: Date;
    updated_at: Date;
    last_synced_at: Date | null;
    deleted_at: Date | null;

    // Sync flags
    needs_push: boolean;
    is_conflicted: boolean;
}

// Local database interfaces for daily sales summary
export interface LocalDailySalesSummary extends Omit<DailySalesSummaryRow, 'created_at' | 'updated_at'> {
    // Local specific fields
    created_at: Date;
    updated_at: Date;

    // Sync flags
    needs_push: boolean;
    is_conflicted: boolean;
}

// =====================================================
// PENDING SYNC OPERATIONS
// =====================================================

// Pending customer operations
export interface PendingCustomerOperation {
    id: string;
    type: 'CREATE' | 'UPDATE' | 'DELETE';
    customerId: string;
    data: CustomerInsert | CustomerUpdate | null;
    timestamp: string;
    retryCount: number;
    error?: string;
}

// Pending transaction operations
export interface PendingTransactionOperation {
    id: string;
    type: 'CREATE' | 'UPDATE' | 'DELETE';
    transactionId: string;
    data: (TransactionInsert & { items?: TransactionItemInsert[] }) | TransactionUpdate | null;
    timestamp: string;
    retryCount: number;
    error?: string;
}

// Pending transaction item operations (optional - items usually sync with parent transaction)
export interface PendingTransactionItemOperation {
    id: string;
    type: 'CREATE' | 'UPDATE' | 'DELETE';
    transactionItemId: string;
    transactionId: string; // Parent transaction ID
    data: TransactionItemInsert | TransactionItemUpdate | null;
    timestamp: string;
    retryCount: number;
    error?: string;
}
