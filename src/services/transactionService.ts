import { supabase } from '../lib/supabase';
import { fetchAllPages } from '../lib/supabasePaging';
import {
    isPgrstMissingTransactionsColumnError,
    stripOptionalFiscalTransactionFields,
} from '../utils/transactionFiscalServerColumns';

// Coalesce concurrent getTransactionById calls per id
const getTransactionByIdInFlight = new Map<string, Promise<any>>();
import {
    TransactionInsert,
    TransactionUpdate,
    TransactionItemInsert,
    CustomerInsert,
    CustomerUpdate,
    ReportTransaction,
    ReportFilters,
    EmployeePerformance,
    ProductPerformance,
    OverviewMetrics
} from '../types/supabase';

// =====================================================
// TRANSACTION OPERATIONS
// =====================================================

export const transactionService = {
    // PWA report source: fully-assembled ReportTransaction[] via direct PostgREST, paginated
    // (past the 1000-row cap) and id-chunked (keeps transaction_id=in.(...) URL small so a
    // strict proxy can't 414). Completed-only + date/employee/payment filters; hourRange and
    // category are applied by the caller. (docs/pwa-read-surfaces-plan.md Step 1a)
    async getReportRows(filters: ReportFilters): Promise<ReportTransaction[]> {
        const txCols = 'id, employee_id, employee_name, customer_id, customer_name, transaction_date, transaction_time, subtotal, discount, tax, total, payment_method, status';
        const transactions = await fetchAllPages<any>((from, to) => {
            let q = supabase.from('transactions').select(txCols)
                .is('deleted_at', null).eq('status', 'completed')
                .gte('transaction_date', filters.dateRange.start)
                .lte('transaction_date', filters.dateRange.end)
                .order('transaction_date', { ascending: false }).order('id', { ascending: true })
                .range(from, to);
            if (filters.employeeId) q = q.eq('employee_id', filters.employeeId);
            if (filters.paymentMethod) q = q.eq('payment_method', filters.paymentMethod);
            return q;
        });
        if (transactions.length === 0) return [];
        const itemCols = 'transaction_id, product_id, product_name, category_id, category_name, quantity, unit_price, unit_cost, line_total, profit_amount';
        const ID_CHUNK = 100; // keep transaction_id=in.(...) URL ~4KB, under proxy header buffers
        const ids = transactions.map((t) => t.id);
        const items: any[] = [];
        for (let i = 0; i < ids.length; i += ID_CHUNK) {
            const slice = ids.slice(i, i + ID_CHUNK);
            const chunk = await fetchAllPages<any>((from, to) =>
                supabase.from('transaction_items').select(itemCols)
                    .in('transaction_id', slice).is('deleted_at', null)
                    .order('id', { ascending: true }).range(from, to));
            items.push(...chunk);
        }
        const byTx = new Map<string, any[]>();
        for (const it of items) { const a = byTx.get(it.transaction_id); if (a) a.push(it); else byTx.set(it.transaction_id, [it]); }
        return transactions.map((t) => ({
            id: t.id, employeeId: t.employee_id, employeeName: t.employee_name,
            customerId: t.customer_id || undefined, customerName: t.customer_name || undefined,
            date: t.transaction_date, time: t.transaction_time,
            items: (byTx.get(t.id) || []).map((it) => ({ productId: it.product_id, productName: it.product_name, categoryId: it.category_id || '', categoryName: it.category_name || '', quantity: it.quantity, unitPrice: it.unit_price, cost: it.unit_cost, total: it.line_total, profit: it.profit_amount })),
            subtotal: t.subtotal, discount: t.discount, tax: t.tax, total: t.total,
            paymentMethod: t.payment_method, status: t.status as 'completed' | 'refunded',
        }));
    },

    // Get all transactions with optional filters
    async getTransactions(filters?: {
        employeeId?: string;
        customerId?: string;
        paymentMethod?: string;
        status?: string;
        dateFrom?: string;
        dateTo?: string;
        limit?: number;
        offset?: number;
    }) {
        let query = supabase
            .from('transactions')
            .select('*')
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (filters?.employeeId) {
            query = query.eq('employee_id', filters.employeeId);
        }

        if (filters?.customerId) {
            query = query.eq('customer_id', filters.customerId);
        }

        if (filters?.paymentMethod) {
            query = query.eq('payment_method', filters.paymentMethod);
        }

        if (filters?.status) {
            query = query.eq('status', filters.status);
        }

        if (filters?.dateFrom) {
            query = query.gte('transaction_date', filters.dateFrom);
        }

        if (filters?.dateTo) {
            query = query.lte('transaction_date', filters.dateTo);
        }

        if (filters?.limit) {
            query = query.limit(filters.limit);
        }

        if (filters?.offset) {
            query = query.range(filters.offset, (filters.offset + (filters.limit || 50)) - 1);
        }

        const { data: transactions, error: transactionsError } = await query;

        if (transactionsError) {
            console.error('Error fetching transactions:', transactionsError);
            throw transactionsError;
        }

        if (!transactions || transactions.length === 0) {
            return [];
        }

        // Get transaction items for these transactions with more detailed logging
        const transactionIds = transactions.map(t => t.id);
        console.log('Fetching transaction items for transaction IDs:', transactionIds);

        const { data: transactionItems, error: itemsError } = await supabase
            .from('transaction_items')
            .select('*')
            .in('transaction_id', transactionIds)
            .is('deleted_at', null);

        if (itemsError) {
            console.error('Error fetching transaction items:', itemsError);
            throw itemsError;
        }

        console.log('Retrieved transaction items:', transactionItems);

        // Group items by transaction with more detailed logging
        const itemsByTransaction = new Map<string, any[]>();
        (transactionItems || []).forEach(item => {
            if (!itemsByTransaction.has(item.transaction_id)) {
                itemsByTransaction.set(item.transaction_id, []);
            }
            itemsByTransaction.get(item.transaction_id)!.push(item);
            console.log(`Adding item ${item.id} to transaction ${item.transaction_id}:`, item);
        });

        // Add items to transactions with logging
        const result = transactions.map(transaction => {
            const items = itemsByTransaction.get(transaction.id) || [];
            console.log(`Transaction ${transaction.id} (${transaction.transaction_number}) has ${items.length} items`);
            return {
                ...transaction,
                transaction_items: items
            };
        });

        console.log('Final transaction data with items:', result);
        return result;
    },

    // Get a single transaction by ID (coalesces concurrent calls per id)
    async getTransactionById(id: string) {
        if (!getTransactionByIdInFlight.has(id)) {
            const p = (async () => {
                console.log(`Fetching transaction ${id} by ID`);

                const { data: transaction, error: transactionError } = await supabase
                    .from('transactions')
                    .select('*')
                    .eq('id', id)
                    .is('deleted_at', null)
                    .single();

                if (transactionError) {
                    console.error('Error fetching transaction:', transactionError);
                    throw transactionError;
                }

                console.log('Retrieved transaction:', transaction);

                const { data: transactionItems, error: itemsError } = await supabase
                    .from('transaction_items')
                    .select('*')
                    .eq('transaction_id', id)
                    .is('deleted_at', null);

                if (itemsError) {
                    console.error('Error fetching transaction items:', itemsError);
                    throw itemsError;
                }

                console.log(`Retrieved ${transactionItems?.length || 0} items for transaction ${id}:`, transactionItems);

                let customer = null as any;
                if (transaction.customer_id) {
                    const { data: customerData } = await supabase
                        .from('customers')
                        .select('*')
                        .eq('id', transaction.customer_id)
                        .is('deleted_at', null)
                        .single();
                    customer = customerData;
                    console.log('Retrieved customer for transaction:', customer);
                }

                const result = {
                    ...transaction,
                    transaction_items: transactionItems || [],
                    customers: customer
                };

                console.log('Final transaction data with items:', result);
                return result;
            })().finally(() => {
                getTransactionByIdInFlight.delete(id);
            });

            getTransactionByIdInFlight.set(id, p);
        }

        return await getTransactionByIdInFlight.get(id)!;
    },

    // Create a new transaction with items
    async createTransaction(transactionData: TransactionInsert, items: TransactionItemInsert[]) {
        console.log('TransactionService: Creating transaction with data:', transactionData);
        console.log('TransactionService: Creating transaction items:', items);

        // Fiscal / caller may supply transaction_number (e.g. SAFT InvoiceNo); otherwise RPC
        let transactionNumber = transactionData.transaction_number?.trim();

        if (!transactionNumber) {
            try {
                const { data: rpcNumber, error: numberError } = await supabase
                    .rpc('generate_transaction_number');

                if (numberError || !rpcNumber) {
                    throw new Error('RPC failed: ' + (numberError?.message || 'null result'));
                }
                transactionNumber = rpcNumber;
            } catch (error) {
                console.warn('RPC generate_transaction_number failed, using client fallback:', error);
                const now = new Date();
                const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
                const timeStr = now.getTime().toString().slice(-4);
                const randomStr = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
                transactionNumber = `TXN${dateStr}${timeStr}${randomStr}`;
            }
        }

        // Create the transaction
        const insertPayload: Record<string, unknown> = {
            ...transactionData,
            transaction_number: transactionNumber,
        };

        let { data: transaction, error: transactionError } = await supabase
            .from('transactions')
            .insert(insertPayload)
            .select()
            .single();

        if (transactionError && isPgrstMissingTransactionsColumnError(transactionError)) {
            console.warn(
                'transactionService: Retrying without optional fiscal/discount columns. Run pending migrations (e.g. 20260413120000_transactions_fiscal_columns.sql, 2025-09-24_add_discount_metadata.sql) on Supabase so the server stores full data.'
            );
            const retry = await supabase
                .from('transactions')
                .insert(stripOptionalFiscalTransactionFields(insertPayload))
                .select()
                .single();
            transaction = retry.data;
            transactionError = retry.error;
        }

        if (transactionError) {
            console.error('Error creating transaction:', transactionError);
            throw transactionError;
        }

        console.log('TransactionService: Transaction created successfully:', transaction);

        // Create the transaction items
        const itemsWithTransactionId = items.map(item => ({
            ...item,
            transaction_id: transaction.id
        }));

        console.log('TransactionService: Inserting transaction items:', itemsWithTransactionId);

        const { data: transactionItems, error: itemsError } = await supabase
            .from('transaction_items')
            .insert(itemsWithTransactionId)
            .select();

        if (itemsError) {
            console.error('Error creating transaction items:', itemsError);
            console.error('Items error details:', {
                message: itemsError.message,
                details: itemsError.details,
                hint: itemsError.hint,
                code: itemsError.code
            });

            // Check if this is a foreign key constraint violation
            if (itemsError.code === '23503') {
                console.error('Foreign key constraint violation - product_id references products table');
                console.error('This might mean the product was created locally but not synced to server yet');

                // Check which products exist in the server
                for (const item of itemsWithTransactionId) {
                    try {
                        const { data: productExists } = await supabase
                            .from('products')
                            .select('id, name')
                            .eq('id', item.product_id)
                            .single();

                        if (!productExists) {
                            console.error(`Product ${item.product_id} (${item.product_name}) does not exist in server products table`);
                        } else {
                            console.log(`Product ${item.product_id} (${item.product_name}) exists in server products table`);
                        }
                    } catch (productCheckError) {
                        console.error(`Error checking if product ${item.product_id} exists:`, productCheckError);
                    }
                }
            }

            throw itemsError;
        }

        console.log('TransactionService: Transaction items created successfully:', transactionItems);

        const result = {
            transaction,
            items: transactionItems
        };

        console.log('TransactionService: Final result:', result);
        return result;
    },

    // Update a transaction
    async updateTransaction(id: string, updates: TransactionUpdate) {
        const { data, error } = await supabase
            .from('transactions')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating transaction:', error);
            throw error;
        }

        return data;
    },

    // Soft delete a transaction
    async deleteTransaction(id: string) {
        const { data, error } = await supabase
            .from('transactions')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error deleting transaction:', error);
            throw error;
        }

        return data;
    },

    // Get transactions for reporting (formatted for Reports page)
    async getTransactionsForReporting(filters: ReportFilters): Promise<ReportTransaction[]> {
        // First, get transactions
        let transactionsQuery = supabase
            .from('transactions')
            .select(`
                id,
                employee_id,
                employee_name,
                customer_id,
                customer_name,
                transaction_date,
                transaction_time,
                subtotal,
                discount,
                tax,
                total,
                payment_method,
                status
            `)
            .is('deleted_at', null)
            .eq('status', 'completed')
            .gte('transaction_date', filters.dateRange.start)
            .lte('transaction_date', filters.dateRange.end)
            .order('transaction_date', { ascending: false });

        if (filters.employeeId) {
            transactionsQuery = transactionsQuery.eq('employee_id', filters.employeeId);
        }

        if (filters.paymentMethod) {
            transactionsQuery = transactionsQuery.eq('payment_method', filters.paymentMethod);
        }

        const { data: transactions, error: transactionsError } = await transactionsQuery;

        if (transactionsError) {
            console.error('Error fetching transactions for reporting:', transactionsError);
            throw transactionsError;
        }

        if (!transactions || transactions.length === 0) {
            return [];
        }

        // Get transaction IDs
        const transactionIds = transactions.map(t => t.id);

        // Get transaction items for these transactions
        const { data: transactionItems, error: itemsError } = await supabase
            .from('transaction_items')
            .select(`
                id,
                transaction_id,
                product_id,
                product_name,
                product_sku,
                category_id,
                category_name,
                quantity,
                unit_price,
                unit_cost,
                line_total,
                tax_amount,
                profit_amount
            `)
            .in('transaction_id', transactionIds)
            .is('deleted_at', null);

        if (itemsError) {
            console.error('Error fetching transaction items for reporting:', itemsError);
            throw itemsError;
        }

        if (itemsError) {
            console.error('Error fetching transaction items for reporting:', itemsError);
            throw itemsError;
        }

        // Group items by transaction
        const itemsByTransaction = new Map<string, any[]>();
        (transactionItems || []).forEach(item => {
            if (!itemsByTransaction.has(item.transaction_id)) {
                itemsByTransaction.set(item.transaction_id, []);
            }
            itemsByTransaction.get(item.transaction_id)!.push(item);
        });

        // Transform the data to match the ReportTransaction interface
        const reportTransactions: ReportTransaction[] = transactions.map(transaction => ({
            id: transaction.id,
            employeeId: transaction.employee_id,
            employeeName: transaction.employee_name,
            customerId: transaction.customer_id || undefined,
            customerName: transaction.customer_name || undefined,
            date: transaction.transaction_date,
            time: transaction.transaction_time,
            items: (itemsByTransaction.get(transaction.id) || []).map((item: any) => ({
                productId: item.product_id,
                productName: item.product_name,
                categoryId: item.category_id || '',
                categoryName: item.category_name || '',
                quantity: item.quantity,
                unitPrice: item.unit_price,
                cost: item.unit_cost,
                total: item.line_total,
                profit: item.profit_amount
            })),
            subtotal: transaction.subtotal,
            discount: transaction.discount,
            tax: transaction.tax,
            total: transaction.total,
            paymentMethod: transaction.payment_method,
            status: transaction.status
        }));

        // Apply category filter if specified
        if (filters.categoryId) {
            return reportTransactions.filter(transaction =>
                transaction.items.some(item => item.categoryId === filters.categoryId)
            );
        }

        return reportTransactions;
    },

    // Get employee performance metrics
    async getEmployeePerformance(filters: ReportFilters): Promise<EmployeePerformance[]> {
        // First get transactions
        const { data: transactions, error: transactionsError } = await supabase
            .from('transactions')
            .select(`
                id,
                employee_id,
                employee_name,
                total
            `)
            .is('deleted_at', null)
            .eq('status', 'completed')
            .gte('transaction_date', filters.dateRange.start)
            .lte('transaction_date', filters.dateRange.end);

        if (transactionsError) {
            console.error('Error fetching employee performance transactions:', transactionsError);
            throw transactionsError;
        }

        if (!transactions || transactions.length === 0) {
            return [];
        }

        // Get transaction items for quantity calculation
        const transactionIds = transactions.map(t => t.id);
        const { data: transactionItems, error: itemsError } = await supabase
            .from('transaction_items')
            .select(`
                transaction_id,
                quantity
            `)
            .in('transaction_id', transactionIds)
            .is('deleted_at', null);

        if (itemsError) {
            console.error('Error fetching transaction items for employee performance:', itemsError);
            throw itemsError;
        }

        // Group items by transaction
        const itemsByTransaction = new Map<string, any[]>();
        (transactionItems || []).forEach(item => {
            if (!itemsByTransaction.has(item.transaction_id)) {
                itemsByTransaction.set(item.transaction_id, []);
            }
            itemsByTransaction.get(item.transaction_id)!.push(item);
        });

        // Aggregate performance by employee
        const performanceMap = new Map<string, {
            employeeId: string;
            employeeName: string;
            totalSales: number;
            transactionCount: number;
            itemsSold: number;
        }>();

        transactions.forEach(transaction => {
            const existing = performanceMap.get(transaction.employee_id) || {
                employeeId: transaction.employee_id,
                employeeName: transaction.employee_name,
                totalSales: 0,
                transactionCount: 0,
                itemsSold: 0
            };

            existing.totalSales += transaction.total;
            existing.transactionCount += 1;
            
            const items = itemsByTransaction.get(transaction.id) || [];
            existing.itemsSold += items.reduce((sum: number, item: any) => sum + item.quantity, 0);

            performanceMap.set(transaction.employee_id, existing);
        });

        return Array.from(performanceMap.values())
            .sort((a, b) => b.totalSales - a.totalSales);
    },

    // Get product performance metrics
    async getProductPerformance(filters: ReportFilters): Promise<ProductPerformance[]> {
        // First get transactions in date range
        const { data: transactions, error: transactionsError } = await supabase
            .from('transactions')
            .select('id')
            .is('deleted_at', null)
            .eq('status', 'completed')
            .gte('transaction_date', filters.dateRange.start)
            .lte('transaction_date', filters.dateRange.end);

        if (transactionsError) {
            console.error('Error fetching transactions for product performance:', transactionsError);
            throw transactionsError;
        }

        if (!transactions || transactions.length === 0) {
            return [];
        }

        const transactionIds = transactions.map(t => t.id);

        // Get transaction items for these transactions
        const { data: transactionItems, error: itemsError } = await supabase
            .from('transaction_items')
            .select(`
                product_id,
                product_name,
                category_name,
                quantity,
                line_total
            `)
            .in('transaction_id', transactionIds)
            .is('deleted_at', null);

        if (itemsError) {
            console.error('Error fetching product performance:', itemsError);
            throw itemsError;
        }

        if (itemsError) {
            console.error('Error fetching product performance:', itemsError);
            throw itemsError;
        }

        // Aggregate performance by product
        const productMap = new Map<string, {
            productId: string;
            productName: string;
            categoryName: string;
            quantitySold: number;
            totalRevenue: number;
            transactionCount: number;
        }>();

        (transactionItems || []).forEach(item => {
            const existing = productMap.get(item.product_id) || {
                productId: item.product_id,
                productName: item.product_name,
                categoryName: item.category_name || '',
                quantitySold: 0,
                totalRevenue: 0,
                transactionCount: 0
            };

            existing.quantitySold += item.quantity;
            existing.totalRevenue += item.line_total;
            existing.transactionCount += 1;

            productMap.set(item.product_id, existing);
        });

        return Array.from(productMap.values())
            .sort((a, b) => b.quantitySold - a.quantitySold);
    },

    // Get overview metrics
    async getOverviewMetrics(filters: ReportFilters): Promise<OverviewMetrics> {
        // First get transactions
        const { data: transactions, error: transactionsError } = await supabase
            .from('transactions')
            .select(`
                id,
                total
            `)
            .is('deleted_at', null)
            .eq('status', 'completed')
            .gte('transaction_date', filters.dateRange.start)
            .lte('transaction_date', filters.dateRange.end);

        if (transactionsError) {
            console.error('Error fetching overview metrics transactions:', transactionsError);
            throw transactionsError;
        }

        if (!transactions || transactions.length === 0) {
            return {
                totalRevenue: 0,
                totalTransactions: 0,
                totalItems: 0,
                avgTransaction: 0
            };
        }

        // Get transaction items for item count
        const transactionIds = transactions.map(t => t.id);
        const { data: transactionItems, error: itemsError } = await supabase
            .from('transaction_items')
            .select('quantity')
            .in('transaction_id', transactionIds)
            .is('deleted_at', null);

        if (itemsError) {
            console.error('Error fetching overview metrics items:', itemsError);
            throw itemsError;
        }

        const totalRevenue = transactions.reduce((sum, t) => sum + t.total, 0);
        const totalTransactions = transactions.length;
        const totalItems = (transactionItems || []).reduce((sum, item) => sum + item.quantity, 0);
        const avgTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

        return {
            totalRevenue,
            totalTransactions,
            totalItems,
            avgTransaction
        };
    }
};

// =====================================================
// CUSTOMER OPERATIONS
// =====================================================

export const customerService = {
    // Get all customers
    async getCustomers(filters?: {
        search?: string;
        isActive?: boolean;
        limit?: number;
        offset?: number;
    }) {
        let query = supabase
            .from('customers')
            .select('*')
            .eq('deleted_at', null)
            .order('name', { ascending: true });

        if (filters?.isActive !== undefined) {
            query = query.eq('is_active', filters.isActive);
        }

        if (filters?.search) {
            query = query.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`);
        }

        if (filters?.limit) {
            query = query.limit(filters.limit);
        }

        if (filters?.offset) {
            query = query.range(filters.offset, (filters.offset + (filters.limit || 50)) - 1);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching customers:', error);
            throw error;
        }

        return data || [];
    },

    // Get a single customer by ID
    async getCustomerById(id: string) {
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .eq('id', id)
            .eq('deleted_at', null)
            .single();

        if (error) {
            console.error('Error fetching customer:', error);
            throw error;
        }

        return data;
    },

    // Create a new customer
    async createCustomer(customerData: CustomerInsert) {
        const { data, error } = await supabase
            .from('customers')
            .insert(customerData)
            .select()
            .single();

        if (error) {
            console.error('Error creating customer:', error);
            throw error;
        }

        return data;
    },

    // Update a customer
    async updateCustomer(id: string, updates: CustomerUpdate) {
        const { data, error } = await supabase
            .from('customers')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating customer:', error);
            throw error;
        }

        return data;
    },

    // Soft delete a customer
    async deleteCustomer(id: string) {
        const { data, error } = await supabase
            .from('customers')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error deleting customer:', error);
            throw error;
        }

        return data;
    }
};

// =====================================================
// REPORTING HELPER FUNCTIONS
// =====================================================

export const reportingService = {
    // Get comprehensive report data
    async getReportData(filters: ReportFilters) {
        const [
            transactions,
            employeePerformance,
            productPerformance,
            overviewMetrics
        ] = await Promise.all([
            transactionService.getTransactionsForReporting(filters),
            transactionService.getEmployeePerformance(filters),
            transactionService.getProductPerformance(filters),
            transactionService.getOverviewMetrics(filters)
        ]);

        return {
            transactions,
            employeePerformance,
            productPerformance,
            overviewMetrics
        };
    },

    // Export transactions to CSV format
    generateCSVReport(transactions: ReportTransaction[]): string {
        const headers = [
            'Date', 'Time', 'Employee', 'Customer', 'Product', 'Category',
            'Quantity', 'Unit Price', 'Total', 'Payment Method'
        ];

        const rows = transactions.flatMap(transaction =>
            transaction.items.map(item => [
                transaction.date,
                transaction.time,
                transaction.employeeName,
                transaction.customerName || 'N/A',
                item.productName,
                item.categoryName,
                item.quantity.toString(),
                `€${item.unitPrice.toFixed(2)}`,
                `€${item.total.toFixed(2)}`,
                transaction.paymentMethod
            ])
        );

        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
}; 