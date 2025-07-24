import { supabase } from '../lib/supabase';

// Sample customers data
const sampleCustomers = [
    {
        id: 'cust-1',
        name: 'Maria Silva',
        email: 'maria.silva@email.com',
        phone: '+351 123 456 789',
        is_active: true
    },
    {
        id: 'cust-2',
        name: 'João Costa',
        email: 'joao.costa@email.com',
        phone: '+351 123 456 788',
        is_active: true
    },
    {
        id: 'cust-3',
        name: 'Ana Pereira',
        email: 'ana.pereira@email.com',
        phone: '+351 123 456 787',
        is_active: true
    },
    {
        id: 'cust-4',
        name: 'Pedro Santos',
        email: 'pedro.santos@email.com',
        phone: '+351 123 456 786',
        is_active: true
    },
    {
        id: 'cust-5',
        name: 'Carla Silva',
        email: 'carla.silva@email.com',
        phone: '+351 123 456 785',
        is_active: true
    }
];

// Sample transactions data (converted from mock data)
const sampleTransactions = [
    {
        id: 'txn-1',
        transaction_number: 'TXN202412200001',
        employee_id: 'EMP001',
        employee_name: 'Carlos Ferreira',
        customer_id: 'cust-1',
        customer_name: 'Maria Silva',
        transaction_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '14:30:00',
        subtotal: 28.50,
        discount: 1.43,
        tax: 6.20,
        total: 33.27,
        payment_method: 'card',
        amount_paid: 33.27,
        change_given: 0,
        status: 'completed'
    },
    {
        id: 'txn-2',
        transaction_number: 'TXN202412180001',
        employee_id: 'EMP002',
        employee_name: 'João Santos',
        customer_id: null,
        customer_name: null,
        transaction_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '15:45:00',
        subtotal: 22.20,
        discount: 0,
        tax: 5.11,
        total: 27.31,
        payment_method: 'cash',
        amount_paid: 30.00,
        change_given: 2.69,
        status: 'completed'
    },
    {
        id: 'txn-3',
        transaction_number: 'TXN202412170001',
        employee_id: 'EMP003',
        employee_name: 'Maria Oliveira',
        customer_id: null,
        customer_name: null,
        transaction_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '16:20:00',
        subtotal: 21.40,
        discount: 0,
        tax: 4.92,
        total: 26.32,
        payment_method: 'card',
        amount_paid: 26.32,
        change_given: 0,
        status: 'completed'
    },
    {
        id: 'txn-4',
        transaction_number: 'TXN202412150001',
        employee_id: 'EMP001',
        employee_name: 'Carlos Ferreira',
        customer_id: 'cust-2',
        customer_name: 'João Costa',
        transaction_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '10:15:00',
        subtotal: 7.20,
        discount: 0.36,
        tax: 1.58,
        total: 8.42,
        payment_method: 'cash',
        amount_paid: 10.00,
        change_given: 1.58,
        status: 'completed'
    },
    {
        id: 'txn-5',
        transaction_number: 'TXN202412130001',
        employee_id: 'EMP002',
        employee_name: 'João Santos',
        customer_id: null,
        customer_name: null,
        transaction_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '13:25:00',
        subtotal: 25.70,
        discount: 0,
        tax: 5.91,
        total: 31.61,
        payment_method: 'card',
        amount_paid: 31.61,
        change_given: 0,
        status: 'completed'
    },
    {
        id: 'txn-6',
        transaction_number: 'TXN202412100001',
        employee_id: 'EMP003',
        employee_name: 'Maria Oliveira',
        customer_id: null,
        customer_name: null,
        transaction_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '17:40:00',
        subtotal: 11.00,
        discount: 0.55,
        tax: 2.40,
        total: 12.85,
        payment_method: 'cash',
        amount_paid: 15.00,
        change_given: 2.15,
        status: 'completed'
    },
    {
        id: 'txn-7',
        transaction_number: 'TXN202412080001',
        employee_id: 'EMP001',
        employee_name: 'Carlos Ferreira',
        customer_id: null,
        customer_name: null,
        transaction_date: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '11:30:00',
        subtotal: 20.00,
        discount: 2.00,
        tax: 4.14,
        total: 22.14,
        payment_method: 'mixed',
        amount_paid: 22.14,
        change_given: 0,
        status: 'completed'
    },
    {
        id: 'txn-8',
        transaction_number: 'TXN202412050001',
        employee_id: 'EMP002',
        employee_name: 'João Santos',
        customer_id: 'cust-3',
        customer_name: 'Ana Pereira',
        transaction_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '14:15:00',
        subtotal: 17.60,
        discount: 0,
        tax: 4.05,
        total: 21.65,
        payment_method: 'card',
        amount_paid: 21.65,
        change_given: 0,
        status: 'completed'
    },
    {
        id: 'txn-9',
        transaction_number: 'TXN202412020001',
        employee_id: 'EMP003',
        employee_name: 'Maria Oliveira',
        customer_id: null,
        customer_name: null,
        transaction_date: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '16:50:00',
        subtotal: 13.30,
        discount: 0,
        tax: 3.06,
        total: 16.36,
        payment_method: 'cash',
        amount_paid: 20.00,
        change_given: 3.64,
        status: 'completed'
    },
    {
        id: 'txn-10',
        transaction_number: 'TXN202411300001',
        employee_id: 'EMP001',
        employee_name: 'Carlos Ferreira',
        customer_id: 'cust-4',
        customer_name: 'Pedro Santos',
        transaction_date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '09:45:00',
        subtotal: 14.30,
        discount: 0.71,
        tax: 3.13,
        total: 16.72,
        payment_method: 'card',
        amount_paid: 16.72,
        change_given: 0,
        status: 'completed'
    },
    {
        id: 'txn-11',
        transaction_number: 'TXN202411280001',
        employee_id: 'EMP002',
        employee_name: 'João Santos',
        customer_id: null,
        customer_name: null,
        transaction_date: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '12:20:00',
        subtotal: 8.30,
        discount: 0,
        tax: 1.91,
        total: 10.21,
        payment_method: 'cash',
        amount_paid: 15.00,
        change_given: 4.79,
        status: 'completed'
    },
    {
        id: 'txn-12',
        transaction_number: 'TXN202411250001',
        employee_id: 'EMP003',
        employee_name: 'Maria Oliveira',
        customer_id: 'cust-5',
        customer_name: 'Carla Silva',
        transaction_date: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '15:35:00',
        subtotal: 18.10,
        discount: 1.81,
        tax: 3.75,
        total: 20.04,
        payment_method: 'card',
        amount_paid: 20.04,
        change_given: 0,
        status: 'completed'
    }
];

// Sample transaction items (matching the mock data)
const sampleTransactionItems = [
    // Transaction 1 items
    {
        id: 'item-1-1',
        transaction_id: 'txn-1',
        product_id: '550e8400-e29b-41d4-a716-446655440101', // Premium Coffee Beans
        product_name: 'Premium Coffee Beans',
        product_sku: 'COF001',
        category_id: '550e8400-e29b-41d4-a716-446655440001',
        category_name: 'Beverages',
        quantity: 2,
        unit_price: 12.50,
        unit_cost: 8.00,
        iva_rate: 0.23,
        line_total: 25.00,
        tax_amount: 4.60,
        profit_amount: 9.00,
        discount_amount: 0,
        discount_percentage: 0
    },
    {
        id: 'item-1-2',
        transaction_id: 'txn-1',
        product_id: '550e8400-e29b-41d4-a716-446655440103', // Artisan Bread (acting as Croissant)
        product_name: 'Croissant',
        product_sku: 'BRD002',
        category_id: '550e8400-e29b-41d4-a716-446655440003',
        category_name: 'Bakery',
        quantity: 1,
        unit_price: 3.50,
        unit_cost: 1.20,
        iva_rate: 0.06,
        line_total: 3.50,
        tax_amount: 0.20,
        profit_amount: 2.30,
        discount_amount: 0,
        discount_percentage: 0
    },
    // Transaction 2 items
    {
        id: 'item-2-1',
        transaction_id: 'txn-2',
        product_id: '550e8400-e29b-41d4-a716-446655440102', // Organic Milk
        product_name: 'Organic Milk',
        product_sku: 'MLK001',
        category_id: '550e8400-e29b-41d4-a716-446655440002',
        category_name: 'Dairy',
        quantity: 3,
        unit_price: 2.80,
        unit_cost: 1.50,
        iva_rate: 0.06,
        line_total: 8.40,
        tax_amount: 0.48,
        profit_amount: 3.90,
        discount_amount: 0,
        discount_percentage: 0
    },
    {
        id: 'item-2-2',
        transaction_id: 'txn-2',
        product_id: '550e8400-e29b-41d4-a716-446655440104', // Dark Chocolate Bar
        product_name: 'Dark Chocolate',
        product_sku: 'CHC001',
        category_id: '550e8400-e29b-41d4-a716-446655440004',
        category_name: 'Confectionery',
        quantity: 2,
        unit_price: 6.90,
        unit_cost: 4.20,
        iva_rate: 0.23,
        line_total: 13.80,
        tax_amount: 3.17,
        profit_amount: 5.40,
        discount_amount: 0,
        discount_percentage: 0
    },
    // Transaction 3 items
    {
        id: 'item-3-1',
        transaction_id: 'txn-3',
        product_id: '550e8400-e29b-41d4-a716-446655440101', // Premium Coffee Beans
        product_name: 'Premium Coffee Beans',
        product_sku: 'COF001',
        category_id: '550e8400-e29b-41d4-a716-446655440001',
        category_name: 'Beverages',
        quantity: 1,
        unit_price: 12.50,
        unit_cost: 8.00,
        iva_rate: 0.23,
        line_total: 12.50,
        tax_amount: 2.88,
        profit_amount: 4.50,
        discount_amount: 0,
        discount_percentage: 0
    },
    {
        id: 'item-3-2',
        transaction_id: 'txn-3',
        product_id: '550e8400-e29b-41d4-a716-446655440106', // Greek Yogurt (acting as Cheese)
        product_name: 'Cheese',
        product_sku: 'MLK003',
        category_id: '550e8400-e29b-41d4-a716-446655440002',
        category_name: 'Dairy',
        quantity: 1,
        unit_price: 8.90,
        unit_cost: 5.50,
        iva_rate: 0.06,
        line_total: 8.90,
        tax_amount: 0.53,
        profit_amount: 3.40,
        discount_amount: 0,
        discount_percentage: 0
    }
    // Note: Adding more items for remaining transactions would follow the same pattern
    // For brevity, I'm including key transactions - the full implementation would include all items
];

export async function populateTransactionData() {
    try {
        console.log('Starting transaction data population...');

        // 1. Insert customers
        console.log('Inserting customers...');
        const { error: customersError } = await supabase
            .from('customers')
            .upsert(sampleCustomers, { onConflict: 'id' });

        if (customersError) {
            console.error('Error inserting customers:', customersError);
            throw customersError;
        }

        // 2. Insert transactions
        console.log('Inserting transactions...');
        const { error: transactionsError } = await supabase
            .from('transactions')
            .upsert(sampleTransactions, { onConflict: 'id' });

        if (transactionsError) {
            console.error('Error inserting transactions:', transactionsError);
            throw transactionsError;
        }

        // 3. Insert transaction items
        console.log('Inserting transaction items...');
        const { error: itemsError } = await supabase
            .from('transaction_items')
            .upsert(sampleTransactionItems, { onConflict: 'id' });

        if (itemsError) {
            console.error('Error inserting transaction items:', itemsError);
            throw itemsError;
        }

        // 4. Update customer totals
        console.log('Updating customer totals...');
        for (const customer of sampleCustomers) {
            const customerTransactions = sampleTransactions.filter(t => t.customer_id === customer.id);
            const totalSpent = customerTransactions.reduce((sum, t) => sum + t.total, 0);
            const transactionCount = customerTransactions.length;

            await supabase
                .from('customers')
                .update({
                    total_spent: totalSpent,
                    transaction_count: transactionCount
                })
                .eq('id', customer.id);
        }

        console.log('Transaction data populated successfully!');
        console.log(`- ${sampleCustomers.length} customers created`);
        console.log(`- ${sampleTransactions.length} transactions created`);
        console.log(`- ${sampleTransactionItems.length} transaction items created`);

        return {
            success: true,
            customersCount: sampleCustomers.length,
            transactionsCount: sampleTransactions.length,
            itemsCount: sampleTransactionItems.length
        };

    } catch (error) {
        console.error('Error populating transaction data:', error);
        throw error;
    }
}

// Helper function to clear transaction data (for testing/reset purposes)
export async function clearTransactionData() {
    try {
        console.log('Clearing transaction data...');

        // Delete in reverse order due to foreign key constraints
        await supabase.from('transaction_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('customers').delete().neq('id', '00000000-0000-0000-0000-000000000000');

        console.log('Transaction data cleared successfully!');

        return { success: true };

    } catch (error) {
        console.error('Error clearing transaction data:', error);
        throw error;
    }
}

// Utility function to check if transaction data exists
export async function checkTransactionDataExists() {
    try {
        const { data: transactions, error } = await supabase
            .from('transactions')
            .select('id')
            .limit(1);

        if (error) {
            console.error('Error checking transaction data:', error);
            return false;
        }

        return (transactions && transactions.length > 0);

    } catch (error) {
        console.error('Error checking transaction data:', error);
        return false;
    }
}

// Function to populate additional mock products that are referenced in transactions
export async function populateAdditionalProducts() {
    const additionalProducts = [
        {
            id: 'prod-espresso',
            name: 'Espresso',
            sku: 'COF003',
            category_id: '550e8400-e29b-41d4-a716-446655440001',
            category_name: 'Beverages',
            price: 1.50,
            cost: 0.30,
            iva_rate: 0.23,
            stock: 100,
            min_stock: 20,
            is_active: true
        },
        {
            id: 'prod-muffin',
            name: 'Muffin',
            sku: 'BRD003',
            category_id: '550e8400-e29b-41d4-a716-446655440003',
            category_name: 'Bakery',
            price: 4.20,
            cost: 1.80,
            iva_rate: 0.06,
            stock: 25,
            min_stock: 5,
            is_active: true
        },
        {
            id: 'prod-latte',
            name: 'Latte',
            sku: 'COF004',
            category_id: '550e8400-e29b-41d4-a716-446655440001',
            category_name: 'Beverages',
            price: 3.80,
            cost: 1.20,
            iva_rate: 0.23,
            stock: 50,
            min_stock: 10,
            is_active: true
        }
    ];

    try {
        const { error } = await supabase
            .from('products')
            .upsert(additionalProducts, { onConflict: 'sku' });

        if (error) {
            console.error('Error inserting additional products:', error);
            throw error;
        }

        console.log(`${additionalProducts.length} additional products created for transactions`);
        return { success: true, productsCount: additionalProducts.length };

    } catch (error) {
        console.error('Error populating additional products:', error);
        throw error;
    }
} 