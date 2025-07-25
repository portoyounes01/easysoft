// Utility script to set up reports data
// This can be run to populate the database with sample transaction data

import { populateTransactionData, checkTransactionDataExists, clearTransactionData } from './populateTransactionData';
import { supabase } from '../lib/supabase';

export async function setupReportsData(options: {
    clearExisting?: boolean;
    verbose?: boolean;
} = {}) {
    const { clearExisting = false, verbose = true } = options;

    try {
        if (verbose) {
            console.log('🚀 Setting up Reports data...');
        }

        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            throw new Error('Authentication required to setup data. Please ensure you are logged in.');
        }

        // Clear existing data if requested
        if (clearExisting) {
            if (verbose) {
                console.log('🗑️  Clearing existing transaction data...');
            }
            await clearTransactionData();
        }

        // Check if data already exists
        const dataExists = await checkTransactionDataExists();
        if (dataExists && !clearExisting) {
            if (verbose) {
                console.log('✅ Transaction data already exists. Use clearExisting=true to reset.');
            }
            return {
                success: true,
                message: 'Transaction data already exists',
                skipped: true
            };
        }

        // Populate transaction data (includes all dependencies)
        if (verbose) {
            console.log('� Populating all data (employees, categories, products, customers, transactions)...');
        }
        const result = await populateTransactionData();

        if (verbose) {
            console.log('✅ Reports data setup completed successfully!');
            console.log(`   - ${result.customersCount} customers created`);
            console.log(`   - ${result.transactionsCount} transactions created`);
            console.log(`   - ${result.itemsCount} transaction items created`);
            console.log('');
            console.log('🎯 You can now view comprehensive reports with real data!');
        }

        return {
            success: true,
            message: 'Reports data setup completed successfully',
            data: result
        };

    } catch (error) {
        console.error('❌ Error setting up reports data:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error occurred',
            error
        };
    }
}

// Function to verify reports setup
export async function verifyReportsSetup() {
    try {
        console.log('🔍 Verifying reports setup...');

        // Check transactions
        const { data: transactions, error: txnError } = await supabase
            .from('transactions')
            .select('id, total, status')
            .limit(5);

        if (txnError) {
            throw new Error(`Transaction table error: ${txnError.message}`);
        }

        // Check transaction items
        const { data: items, error: itemsError } = await supabase
            .from('transaction_items')
            .select('id, transaction_id, product_name')
            .limit(5);

        if (itemsError) {
            throw new Error(`Transaction items table error: ${itemsError.message}`);
        }

        // Check customers
        const { data: customers, error: customersError } = await supabase
            .from('customers')
            .select('id, name, total_spent')
            .limit(5);

        if (customersError) {
            throw new Error(`Customers table error: ${customersError.message}`);
        }

        const stats = {
            transactions: transactions?.length || 0,
            items: items?.length || 0,
            customers: customers?.length || 0,
            totalRevenue: transactions?.reduce((sum, t) => sum + (t.total || 0), 0) || 0
        };

        console.log('✅ Reports setup verification successful!');
        console.log(`   - ${stats.transactions} transactions found`);
        console.log(`   - ${stats.items} transaction items found`);
        console.log(`   - ${stats.customers} customers found`);
        console.log(`   - Total revenue: €${stats.totalRevenue.toFixed(2)}`);

        return {
            success: true,
            stats
        };

    } catch (error) {
        console.error('❌ Reports setup verification failed:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Verification failed'
        };
    }
}

// Helper function to reset and repopulate all data
export async function resetReportsData() {
    console.log('🔄 Resetting all reports data...');

    const result = await setupReportsData({
        clearExisting: true,
        verbose: true
    });

    if (result.success) {
        await verifyReportsSetup();
    }

    return result;
}

// Browser-friendly function that can be called from console
if (typeof window !== 'undefined') {
    // Make functions available in browser console for easy testing
    (window as any).setupReportsData = setupReportsData;
    (window as any).verifyReportsSetup = verifyReportsSetup;
    (window as any).resetReportsData = resetReportsData;
} 