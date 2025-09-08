import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
    localDb, 
    customerLocalService, 
    transactionLocalService,
    initializeLocalDatabase 
} from '../src/lib/localDatabase';
import { customerSyncService } from '../src/services/customerSyncService';
import { transactionSyncService } from '../src/services/transactionSyncService';
import { syncManager } from '../src/services/syncManager';
import { offlineReportingService } from '../src/services/offlineReportingService';

// Mock Supabase
vi.mock('../src/lib/supabase', () => ({
    supabase: {
        rpc: vi.fn(),
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: vi.fn()
                }))
            }))
        }))
    },
    isSupabaseConfigured: vi.fn(() => true),
    connectionStatus: {
        getStatus: vi.fn(() => ({ isOnline: false, isSupabaseOnline: false })),
        addListener: vi.fn(),
        removeListener: vi.fn()
    }
}));

// Mock UUID generation for consistent testing
vi.mock('../src/utils/uuid', () => ({
    generateUUID: vi.fn(() => 'test-uuid-' + Math.random().toString(36).substr(2, 9))
}));

describe('Offline Sync System', () => {
    beforeEach(async () => {
        // Initialize clean database for each test
        await initializeLocalDatabase();
        await localDb.customers.clear();
        await localDb.transactions.clear();
        await localDb.transactionItems.clear();
        await localDb.customerSyncQueue.clear();
        await localDb.transactionSyncQueue.clear();
    });

    afterEach(async () => {
        // Clean up after each test
        await localDb.customers.clear();
        await localDb.transactions.clear();
        await localDb.transactionItems.clear();
        await localDb.customerSyncQueue.clear();
        await localDb.transactionSyncQueue.clear();
    });

    describe('Customer Local Service', () => {
        it('should create customer locally with sync queue', async () => {
            const customerId = await customerLocalService.createCustomer({
                name: 'Test Customer',
                email: 'test@example.com',
                phone: '123456789',
                address: '123 Test St',
                total_spent: 0,
                transaction_count: 0,
                loyalty_points: 0,
                is_active: true,
                preferred_payment_method: 'cash'
            });

            expect(customerId).toBeDefined();

            // Check customer was created
            const customer = await customerLocalService.getCustomerById(customerId);
            expect(customer).toBeDefined();
            expect(customer?.name).toBe('Test Customer');
            expect(customer?.needs_push).toBe(true);

            // Check sync queue entry was created
            const pendingOps = await customerLocalService.getPendingSyncOperations();
            expect(pendingOps).toHaveLength(1);
            expect(pendingOps[0].type).toBe('CREATE');
            expect(pendingOps[0].customerId).toBe(customerId);
        });

        it('should update customer and queue sync operation', async () => {
            const customerId = await customerLocalService.createCustomer({
                name: 'Test Customer',
                email: 'test@example.com',
                phone: '123456789',
                address: '123 Test St',
                total_spent: 0,
                transaction_count: 0,
                loyalty_points: 0,
                is_active: true,
                preferred_payment_method: 'cash'
            });

            await customerLocalService.updateCustomer(customerId, {
                name: 'Updated Customer',
                total_spent: 100
            });

            const customer = await customerLocalService.getCustomerById(customerId);
            expect(customer?.name).toBe('Updated Customer');
            expect(customer?.total_spent).toBe(100);
            expect(customer?.needs_push).toBe(true);

            // Should have CREATE and UPDATE operations
            const pendingOps = await customerLocalService.getPendingSyncOperations();
            expect(pendingOps.length).toBeGreaterThanOrEqual(2);
        });

        it('should search customers by name, email, and phone', async () => {
            await customerLocalService.createCustomer({
                name: 'John Doe',
                email: 'john@example.com',
                phone: '123456789',
                address: '123 Test St',
                total_spent: 0,
                transaction_count: 0,
                loyalty_points: 0,
                is_active: true,
                preferred_payment_method: 'cash'
            });

            await customerLocalService.createCustomer({
                name: 'Jane Smith',
                email: 'jane@example.com',
                phone: '987654321',
                address: '456 Test Ave',
                total_spent: 0,
                transaction_count: 0,
                loyalty_points: 0,
                is_active: true,
                preferred_payment_method: 'card'
            });

            // Search by name
            const nameResults = await customerLocalService.searchCustomers('john');
            expect(nameResults).toHaveLength(1);
            expect(nameResults[0].name).toBe('John Doe');

            // Search by email
            const emailResults = await customerLocalService.searchCustomers('jane@');
            expect(emailResults).toHaveLength(1);
            expect(emailResults[0].email).toBe('jane@example.com');

            // Search by phone
            const phoneResults = await customerLocalService.searchCustomers('987654');
            expect(phoneResults).toHaveLength(1);
            expect(phoneResults[0].phone).toBe('987654321');
        });
    });

    describe('Transaction Local Service', () => {
        it('should create transaction with items locally', async () => {
            const transactionId = await transactionLocalService.createTransaction(
                {
                    transaction_number: 'TXN001',
                    employee_id: 'emp-1',
                    employee_name: 'Test Employee',
                    customer_id: null,
                    customer_name: null,
                    transaction_date: '2024-01-15',
                    transaction_time: '10:30:00',
                    subtotal: 100,
                    discount: 0,
                    tax: 23,
                    total: 123,
                    payment_method: 'cash',
                    amount_paid: 130,
                    change_given: 7,
                    status: 'completed',
                    notes: null,
                    receipt_number: 'REC001'
                },
                [
                    {
                        product_id: 'prod-1',
                        product_name: 'Test Product',
                        product_sku: 'TST001',
                        category_id: 'cat-1',
                        category_name: 'Test Category',
                        quantity: 2,
                        unit_price: 50,
                        unit_cost: 30,
                        iva_rate: 0.23,
                        line_total: 100,
                        tax_amount: 23,
                        profit_amount: 40,
                        discount_amount: 0,
                        discount_percentage: 0
                    }
                ]
            );

            expect(transactionId).toBeDefined();

            // Check transaction was created
            const transaction = await transactionLocalService.getTransactionById(transactionId);
            expect(transaction).toBeDefined();
            expect(transaction?.transaction_number).toBe('TXN001');
            expect(transaction?.total).toBe(123);
            expect(transaction?.needs_push).toBe(true);
            expect(transaction?.items).toHaveLength(1);
            expect(transaction?.items[0].product_name).toBe('Test Product');

            // Check sync queue entry was created
            const pendingOps = await transactionLocalService.getPendingSyncOperations();
            expect(pendingOps).toHaveLength(1);
            expect(pendingOps[0].type).toBe('CREATE');
        });

        it('should search transactions by transaction number and customer name', async () => {
            await transactionLocalService.createTransaction(
                {
                    transaction_number: 'TXN001',
                    employee_id: 'emp-1',
                    employee_name: 'John Cashier',
                    customer_id: 'cust-1',
                    customer_name: 'Alice Customer',
                    transaction_date: '2024-01-15',
                    transaction_time: '10:30:00',
                    subtotal: 100,
                    discount: 0,
                    tax: 23,
                    total: 123,
                    payment_method: 'cash',
                    amount_paid: 130,
                    change_given: 7,
                    status: 'completed',
                    notes: null,
                    receipt_number: 'REC001'
                },
                []
            );

            // Search by transaction number
            const txnResults = await transactionLocalService.searchTransactions('TXN001');
            expect(txnResults).toHaveLength(1);
            expect(txnResults[0].transaction_number).toBe('TXN001');

            // Search by customer name
            const customerResults = await transactionLocalService.searchTransactions('alice');
            expect(customerResults).toHaveLength(1);
            expect(customerResults[0].customer_name).toBe('Alice Customer');

            // Search by employee name
            const employeeResults = await transactionLocalService.searchTransactions('john');
            expect(employeeResults).toHaveLength(1);
            expect(employeeResults[0].employee_name).toBe('John Cashier');
        });

        it('should get transactions by date range', async () => {
            // Create transactions on different dates
            await transactionLocalService.createTransaction({
                transaction_number: 'TXN001',
                employee_id: 'emp-1',
                employee_name: 'Test Employee',
                customer_id: null,
                customer_name: null,
                transaction_date: '2024-01-15',
                transaction_time: '10:30:00',
                subtotal: 100,
                discount: 0,
                tax: 23,
                total: 123,
                payment_method: 'cash',
                amount_paid: null,
                change_given: 0,
                status: 'completed',
                notes: null,
                receipt_number: 'REC001'
            }, []);

            await transactionLocalService.createTransaction({
                transaction_number: 'TXN002',
                employee_id: 'emp-1',
                employee_name: 'Test Employee',
                customer_id: null,
                customer_name: null,
                transaction_date: '2024-01-20',
                transaction_time: '14:30:00',
                subtotal: 200,
                discount: 0,
                tax: 46,
                total: 246,
                payment_method: 'card',
                amount_paid: null,
                change_given: 0,
                status: 'completed',
                notes: null,
                receipt_number: 'REC002'
            }, []);

            // Get transactions in range that includes both
            const allResults = await transactionLocalService.getTransactionsByDateRange('2024-01-10', '2024-01-25');
            expect(allResults).toHaveLength(2);

            // Get transactions in range that includes only first
            const partialResults = await transactionLocalService.getTransactionsByDateRange('2024-01-10', '2024-01-18');
            expect(partialResults).toHaveLength(1);
            expect(partialResults[0].transaction_number).toBe('TXN001');
        });
    });

    describe('Offline Reporting Service', () => {
        beforeEach(async () => {
            // Create some test data for reporting
            const customerId = await customerLocalService.createCustomer({
                name: 'Test Customer',
                email: 'test@example.com',
                phone: '123456789',
                address: '123 Test St',
                total_spent: 0,
                transaction_count: 0,
                loyalty_points: 0,
                is_active: true,
                preferred_payment_method: 'cash'
            });

            await transactionLocalService.createTransaction(
                {
                    transaction_number: 'TXN001',
                    employee_id: 'emp-1',
                    employee_name: 'John Cashier',
                    customer_id: customerId,
                    customer_name: 'Test Customer',
                    transaction_date: '2024-01-15',
                    transaction_time: '10:30:00',
                    subtotal: 100,
                    discount: 0,
                    tax: 23,
                    total: 123,
                    payment_method: 'cash',
                    amount_paid: 130,
                    change_given: 7,
                    status: 'completed',
                    notes: null,
                    receipt_number: 'REC001'
                },
                [
                    {
                        product_id: 'prod-1',
                        product_name: 'Test Product',
                        product_sku: 'TST001',
                        category_id: 'cat-1',
                        category_name: 'Test Category',
                        quantity: 2,
                        unit_price: 50,
                        unit_cost: 30,
                        iva_rate: 0.23,
                        line_total: 100,
                        tax_amount: 23,
                        profit_amount: 40,
                        discount_amount: 0,
                        discount_percentage: 0
                    }
                ]
            );
        });

        it('should generate overview metrics from local data', async () => {
            const filters = {
                dateRange: {
                    start: '2024-01-01',
                    end: '2024-01-31'
                }
            };

            const metrics = await offlineReportingService.getOverviewMetrics(filters);
            
            expect(metrics.totalRevenue).toBe(123);
            expect(metrics.totalTransactions).toBe(1);
            expect(metrics.totalItems).toBe(2);
            expect(metrics.avgTransaction).toBe(123);
        });

        it('should generate employee performance from local data', async () => {
            const filters = {
                dateRange: {
                    start: '2024-01-01',
                    end: '2024-01-31'
                }
            };

            const performance = await offlineReportingService.getEmployeePerformance(filters);
            
            expect(performance).toHaveLength(1);
            expect(performance[0].employeeId).toBe('emp-1');
            expect(performance[0].employeeName).toBe('John Cashier');
            expect(performance[0].totalSales).toBe(123);
            expect(performance[0].transactionCount).toBe(1);
            expect(performance[0].itemsSold).toBe(2);
        });

        it('should generate product performance from local data', async () => {
            const filters = {
                dateRange: {
                    start: '2024-01-01',
                    end: '2024-01-31'
                }
            };

            const performance = await offlineReportingService.getProductPerformance(filters);
            
            expect(performance).toHaveLength(1);
            expect(performance[0].productId).toBe('prod-1');
            expect(performance[0].productName).toBe('Test Product');
            expect(performance[0].categoryName).toBe('Test Category');
            expect(performance[0].quantitySold).toBe(2);
            expect(performance[0].totalRevenue).toBe(100);
        });

        it('should generate CSV report from local data', async () => {
            const filters = {
                dateRange: {
                    start: '2024-01-01',
                    end: '2024-01-31'
                }
            };

            const csvContent = await offlineReportingService.generateCSVReport(filters);
            
            expect(csvContent).toContain('Date,Time,Employee,Customer,Product,Category');
            expect(csvContent).toContain('2024-01-15,10:30:00,John Cashier,Test Customer,Test Product,Test Category');
            expect(csvContent).toContain('€50.00,€100.00,cash');
        });
    });

    describe('Database Statistics', () => {
        it('should provide accurate customer statistics', async () => {
            // Create test customers
            await customerLocalService.createCustomer({
                name: 'Active Customer',
                email: 'active@example.com',
                phone: '123456789',
                address: '123 Test St',
                total_spent: 0,
                transaction_count: 0,
                loyalty_points: 0,
                is_active: true,
                preferred_payment_method: 'cash'
            });

            const inactiveId = await customerLocalService.createCustomer({
                name: 'Inactive Customer',
                email: 'inactive@example.com',
                phone: '987654321',
                address: '456 Test Ave',
                total_spent: 0,
                transaction_count: 0,
                loyalty_points: 0,
                is_active: false,
                preferred_payment_method: 'card'
            });

            const deletedId = await customerLocalService.createCustomer({
                name: 'Deleted Customer',
                email: 'deleted@example.com',
                phone: '555555555',
                address: '789 Test Blvd',
                total_spent: 0,
                transaction_count: 0,
                loyalty_points: 0,
                is_active: true,
                preferred_payment_method: 'cash'
            });

            // Delete one customer
            await customerLocalService.deleteCustomer(deletedId);

            const stats = await customerLocalService.getStats();
            
            expect(stats.totalCustomers).toBe(3); // Includes soft-deleted
            expect(stats.activeCustomers).toBe(1); // Only active and not deleted
            expect(stats.deletedCustomers).toBe(1);
            expect(stats.pendingSync).toBeGreaterThan(0); // Should have pending sync operations
        });

        it('should provide accurate transaction statistics', async () => {
            // Create test transactions
            await transactionLocalService.createTransaction({
                transaction_number: 'TXN001',
                employee_id: 'emp-1',
                employee_name: 'Test Employee',
                customer_id: null,
                customer_name: null,
                transaction_date: '2024-01-15',
                transaction_time: '10:30:00',
                subtotal: 100,
                discount: 0,
                tax: 23,
                total: 123,
                payment_method: 'cash',
                amount_paid: 130,
                change_given: 7,
                status: 'completed',
                notes: null,
                receipt_number: 'REC001'
            }, []);

            await transactionLocalService.createTransaction({
                transaction_number: 'TXN002',
                employee_id: 'emp-1',
                employee_name: 'Test Employee',
                customer_id: null,
                customer_name: null,
                transaction_date: '2024-01-15',
                transaction_time: '11:30:00',
                subtotal: 50,
                discount: 0,
                tax: 11.5,
                total: 61.5,
                payment_method: 'card',
                amount_paid: null,
                change_given: 0,
                status: 'pending',
                notes: null,
                receipt_number: 'REC002'
            }, []);

            const stats = await transactionLocalService.getStats();
            
            expect(stats.totalTransactions).toBe(2);
            expect(stats.completedTransactions).toBe(1);
            expect(stats.pendingTransactions).toBe(1);
            expect(stats.refundedTransactions).toBe(0);
            expect(stats.pendingSync).toBeGreaterThan(0);
        });
    });
});

describe('Database Schema and Migration', () => {
    it('should initialize database with correct schema version', async () => {
        await initializeLocalDatabase();
        
        // Check that all tables exist
        expect(localDb.customers).toBeDefined();
        expect(localDb.transactions).toBeDefined();
        expect(localDb.transactionItems).toBeDefined();
        expect(localDb.customerSyncQueue).toBeDefined();
        expect(localDb.transactionSyncQueue).toBeDefined();
        
        // Check sync metadata is initialized
        const metadata = await localDb.syncMetadata.toArray();
        const entityIds = metadata.map(m => m.id);
        
        expect(entityIds).toContain('customers');
        expect(entityIds).toContain('transactions');
        expect(entityIds).toContain('transaction_items');
    });
});