import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { POSProvider, usePOS } from '../src/contexts/POSContext';
import { initializeLocalDatabase, localDb } from '../src/lib/localDatabase';
import { LocalProduct } from '../src/types/supabase';

// Mock Supabase to simulate offline mode
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

// Mock transaction service to simulate server failure
vi.mock('../src/services/transactionService', () => ({
    transactionService: {
        createTransaction: vi.fn().mockRejectedValue(new Error('Network error'))
    }
}));

// Mock UUID generation for consistent testing
vi.mock('../src/utils/uuid', () => ({
    generateUUID: vi.fn(() => 'test-uuid-' + Math.random().toString(36).substr(2, 9))
}));

// Test component that uses POS context
const TestPOSComponent: React.FC = () => {
    const { 
        cart, 
        addToCart, 
        processTransaction, 
        selectedCustomer,
        selectCustomer 
    } = usePOS();

    const testProduct: LocalProduct = {
        id: 'prod-1',
        name: 'Test Product',
        description: 'A test product',
        sku: 'TST001',
        barcode: null,
        category_id: 'cat-1',
        category_name: 'Test Category',
        price: 50,
        cost: 30,
        iva_rate: 0.23,
        stock: 10,
        min_stock: 2,
        track_stock: true,
        image_url: null,
        supplier: null,
        location: null,
        is_active: true,
        display_order: 1,
        created_at: new Date(),
        updated_at: new Date(),
        last_synced_at: null,
        deleted_at: null,
        needs_push: false,
        is_conflicted: false
    };

    const handleAddToCart = () => {
        addToCart(testProduct, 2);
    };

    const handleProcessTransaction = async () => {
        try {
            const { receiptNumber } = await processTransaction({
                paymentMethod: 'cash',
                amountPaid: 130,
                employeeId: 'emp-1',
                employeeName: 'Test Employee'
            });
            console.log('Transaction processed:', receiptNumber);
        } catch (error) {
            console.error('Transaction failed:', error);
        }
    };

    return (
        <div>
            <div data-testid="cart-count">{cart.length}</div>
            <div data-testid="cart-total">
                {cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0)}
            </div>
            <button onClick={handleAddToCart} data-testid="add-to-cart">
                Add to Cart
            </button>
            <button onClick={handleProcessTransaction} data-testid="process-transaction">
                Process Transaction
            </button>
            {selectedCustomer && (
                <div data-testid="selected-customer">{selectedCustomer.name}</div>
            )}
        </div>
    );
};

describe('POS Offline Integration', () => {
    beforeEach(async () => {
        // Initialize clean database for each test
        await initializeLocalDatabase();
        await localDb.customers.clear();
        await localDb.transactions.clear();
        await localDb.transactionItems.clear();
        await localDb.fiscalDocuments.clear();
        await localDb.fiscalAuditEvents.clear();
        await localDb.customerSyncQueue.clear();
        await localDb.transactionSyncQueue.clear();
        await localDb.products.clear();
    });

    afterEach(async () => {
        // Clean up after each test
        await localDb.customers.clear();
        await localDb.transactions.clear();
        await localDb.transactionItems.clear();
        await localDb.fiscalDocuments.clear();
        await localDb.fiscalAuditEvents.clear();
        await localDb.customerSyncQueue.clear();
        await localDb.transactionSyncQueue.clear();
        await localDb.products.clear();
    });

    it('should add products to cart', async () => {
        render(
            <POSProvider>
                <TestPOSComponent />
            </POSProvider>
        );

        const cartCount = screen.getByTestId('cart-count');
        const cartTotal = screen.getByTestId('cart-total');
        const addButton = screen.getByTestId('add-to-cart');

        // Initially empty cart
        expect(cartCount.textContent).toBe('0');
        expect(cartTotal.textContent).toBe('0');

        // Add product to cart
        fireEvent.click(addButton);

        await waitFor(() => {
            expect(cartCount.textContent).toBe('1');
            expect(cartTotal.textContent).toBe('100'); // 2 items * 50 price
        });
    });

    it('should process transaction offline and store locally', async () => {
        // Add a test product to the local database for stock tracking
        await localDb.products.add({
            id: 'prod-1',
            name: 'Test Product',
            description: 'A test product',
            sku: 'TST001',
            barcode: null,
            category_id: 'cat-1',
            category_name: 'Test Category',
            price: 50,
            cost: 30,
            iva_rate: 0.23,
            stock: 10,
            min_stock: 2,
            track_stock: true,
            image_url: null,
            supplier: null,
            location: null,
            is_active: true,
            display_order: 1,
            created_at: new Date(),
            updated_at: new Date(),
            last_synced_at: null,
            deleted_at: null,
            needs_push: false,
            is_conflicted: false
        });

        render(
            <POSProvider>
                <TestPOSComponent />
            </POSProvider>
        );

        const addButton = screen.getByTestId('add-to-cart');
        const processButton = screen.getByTestId('process-transaction');

        // Add product to cart
        fireEvent.click(addButton);

        await waitFor(() => {
            expect(screen.getByTestId('cart-count').textContent).toBe('1');
        });

        // Process transaction
        fireEvent.click(processButton);

        // Wait for transaction to be processed
        await waitFor(async () => {
            // Check that transaction was stored locally
            const transactions = await localDb.transactions.toArray();
            expect(transactions).toHaveLength(1);
            
            const transaction = transactions[0];
            expect(transaction.total).toBe(100); // 2 items * 50 price
            expect(transaction.payment_method).toBe('cash');
            expect(transaction.status).toBe('completed');
            expect(transaction.needs_push).toBe(true); // Should be queued for sync
        }, { timeout: 5000 });

        // Check that transaction items were created
        await waitFor(async () => {
            const items = await localDb.transactionItems.toArray();
            expect(items).toHaveLength(1);
            
            const item = items[0];
            expect(item.product_name).toBe('Test Product');
            expect(item.quantity).toBe(2);
            expect(item.unit_price).toBe(50);
            expect(item.needs_push).toBe(true);
        });

        // Check that product stock was updated
        await waitFor(async () => {
            const product = await localDb.products.get('prod-1');
            expect(product?.stock).toBe(8); // 10 - 2 = 8
            expect(product?.needs_push).toBe(true); // Stock change should be synced
        });

        // Check that sync queue entries were created
        await waitFor(async () => {
            const syncQueue = await localDb.transactionSyncQueue.toArray();
            expect(syncQueue).toHaveLength(1);
            expect(syncQueue[0].type).toBe('CREATE');
        });

        // Cart should be cleared after successful transaction
        await waitFor(() => {
            expect(screen.getByTestId('cart-count').textContent).toBe('0');
        });
    });

    it('should handle transaction with customer', async () => {
        // Create a test customer
        const customerId = await localDb.customers.add({
            id: 'cust-1',
            name: 'Test Customer',
            email: 'test@example.com',
            phone: '123456789',
            address: '123 Test St',
            total_spent: 0,
            transaction_count: 0,
            loyalty_points: 0,
            is_active: true,
            preferred_payment_method: 'cash',
            created_at: new Date(),
            updated_at: new Date(),
            last_synced_at: null,
            deleted_at: null,
            needs_push: false,
            is_conflicted: false
        });

        const TestComponentWithCustomer: React.FC = () => {
            const { addToCart, processTransaction, selectCustomer } = usePOS();

            const testProduct: LocalProduct = {
                id: 'prod-1',
                name: 'Test Product',
                description: 'A test product',
                sku: 'TST001',
                barcode: null,
                category_id: 'cat-1',
                category_name: 'Test Category',
                price: 50,
                cost: 30,
                iva_rate: 0.23,
                stock: 10,
                min_stock: 2,
                track_stock: true,
                image_url: null,
                supplier: null,
                location: null,
                is_active: true,
                display_order: 1,
                created_at: new Date(),
                updated_at: new Date(),
                last_synced_at: null,
                deleted_at: null,
                needs_push: false,
                is_conflicted: false
            };

            const handleCompleteWithCustomer = () => {
                selectCustomer({
                    id: 'cust-1',
                    name: 'Test Customer',
                    email: 'test@example.com',
                    phone: '123456789',
                    address: '123 Test St',
                    total_spent: 0,
                    transaction_count: 0,
                    loyalty_points: 0,
                    is_active: true,
                    preferred_payment_method: 'cash',
                    created_at: new Date(),
                    updated_at: new Date(),
                    last_synced_at: null,
                    deleted_at: null,
                    needs_push: false,
                    is_conflicted: false,
                });
                addToCart(testProduct, 1);
                void processTransaction({
                    paymentMethod: 'card',
                    employeeId: 'emp-1',
                    employeeName: 'Test Employee'
                });
            };

            return (
                <div>
                    <button onClick={handleCompleteWithCustomer} data-testid="complete-with-customer">
                        Complete with customer
                    </button>
                </div>
            );
        };

        render(
            <POSProvider>
                <TestComponentWithCustomer />
            </POSProvider>
        );

        fireEvent.click(screen.getByTestId('complete-with-customer'));

        // Wait for transaction to be processed
        await waitFor(async () => {
            const transactions = await localDb.transactions.toArray();
            expect(transactions).toHaveLength(1);
            
            const transaction = transactions[0];
            expect(transaction.customer_id).toBe('cust-1');
            expect(transaction.customer_name).toBe('Test Customer');
        }, { timeout: 10000 });

        // Check that customer totals were updated
        await waitFor(async () => {
            const customer = await localDb.customers.get('cust-1');
            expect(customer?.total_spent).toBe(50);
            expect(customer?.transaction_count).toBe(1);
            expect(customer?.needs_push).toBe(true); // Should be queued for sync
        });
    });

    it('should generate client-side transaction numbers when offline', async () => {
        render(
            <POSProvider>
                <TestPOSComponent />
            </POSProvider>
        );

        const addButton = screen.getByTestId('add-to-cart');
        const processButton = screen.getByTestId('process-transaction');

        // Add product to cart
        fireEvent.click(addButton);

        // Process transaction
        fireEvent.click(processButton);

        // Wait for transaction to be processed
        await waitFor(async () => {
            const transactions = await localDb.transactions.toArray();
            expect(transactions).toHaveLength(1);
            
            const transaction = transactions[0];
            expect(transaction.transaction_number).toMatch(/^TXN\d+/); // Should start with TXN
            expect(transaction.receipt_number).toMatch(/^REC-TXN\d+/); // Should be based on transaction number
        }, { timeout: 5000 });
    });
});

describe('Error Handling in Offline Mode', () => {
    beforeEach(async () => {
        await initializeLocalDatabase();
        await localDb.customers.clear();
        await localDb.transactions.clear();
        await localDb.transactionItems.clear();
        await localDb.fiscalDocuments.clear();
        await localDb.fiscalAuditEvents.clear();
    });

    afterEach(async () => {
        await localDb.customers.clear();
        await localDb.transactions.clear();
        await localDb.transactionItems.clear();
        await localDb.fiscalDocuments.clear();
        await localDb.fiscalAuditEvents.clear();
    });

    it('should handle database errors gracefully', async () => {
        // Mock database error
        const originalAdd = localDb.transactions.add;
        localDb.transactions.add = vi.fn().mockRejectedValue(new Error('Database error'));

        const TestErrorComponent: React.FC = () => {
            const { addToCart, processTransaction } = usePOS();
            const [error, setError] = React.useState<string | null>(null);

            const testProduct: LocalProduct = {
                id: 'prod-1',
                name: 'Test Product',
                description: 'A test product',
                sku: 'TST001',
                barcode: null,
                category_id: 'cat-1',
                category_name: 'Test Category',
                price: 50,
                cost: 30,
                iva_rate: 0.23,
                stock: 10,
                min_stock: 2,
                track_stock: true,
                image_url: null,
                supplier: null,
                location: null,
                is_active: true,
                display_order: 1,
                created_at: new Date(),
                updated_at: new Date(),
                last_synced_at: null,
                deleted_at: null,
                needs_push: false,
                is_conflicted: false
            };

            const handleProcess = async () => {
                try {
                    addToCart(testProduct, 1);
                    await processTransaction({
                        paymentMethod: 'cash',
                        amountPaid: 60,
                        employeeId: 'emp-1',
                        employeeName: 'Test Employee'
                    });
                } catch (err) {
                    setError(err instanceof Error ? err.message : 'Unknown error');
                }
            };

            return (
                <div>
                    <button onClick={handleProcess} data-testid="process-with-error">
                        Process Transaction
                    </button>
                    {error && <div data-testid="error-message">{error}</div>}
                </div>
            );
        };

        render(
            <POSProvider>
                <TestErrorComponent />
            </POSProvider>
        );

        fireEvent.click(screen.getByTestId('process-with-error'));

        // Should show error message
        await waitFor(() => {
            expect(screen.getByTestId('error-message')).toBeInTheDocument();
            expect(screen.getByTestId('error-message').textContent).toContain('Transaction failed');
        });

        // Restore original method
        localDb.transactions.add = originalAdd;
    });
});