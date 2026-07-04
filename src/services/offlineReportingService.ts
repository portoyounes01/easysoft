import { transactionLocalService, customerLocalService, employeeLocalService } from '../lib/localDatabase';
import { connectionStatus } from '../lib/supabase';
import { reportingService } from './transactionService';
import {
    LocalTransaction,
    LocalTransactionItem,
    LocalCustomer,
    LocalEmployee,
    ReportTransaction,
    ReportFilters,
    EmployeePerformance,
    ProductPerformance,
    OverviewMetrics
} from '../types/supabase';

// Keep only transactions whose start hour falls within an inclusive hour-of-day
// range. A missing/unparseable time is kept so it is never silently dropped.
export function filterByHour<T extends { transaction_time?: string }>(
    transactions: T[],
    hourRange?: ReportFilters['hourRange']
): T[] {
    if (!hourRange) return transactions;
    const { start, end } = hourRange;
    return transactions.filter(transaction => {
        const raw = (transaction.transaction_time ?? '').trim();
        // Keep rows with a missing/malformed time rather than treating them as 00:00.
        if (!/^\d{1,2}/.test(raw)) return true;
        const hour = Number(raw.slice(0, 2));
        return hour >= start && hour <= end;
    });
}

// Service for offline-first reporting using local data with server fallback
export class OfflineReportingService {

    // Check if we should use offline data or try server
    private async shouldUseOfflineData(): Promise<boolean> {
        const connectionState = connectionStatus.getStatus();
        
        // Use offline if not connected
        if (!connectionState.isOnline || !connectionState.isSupabaseOnline) {
            return true;
        }

        // Check if we have recent local data
        const recentTransactions = await transactionLocalService.getRecentTransactions(7);
        
        // If we have recent local data, prefer it for speed
        // Server can be used for comprehensive historical reports
        return recentTransactions.length > 0;
    }

    // Get transactions for reporting (offline-first)
    async getTransactionsForReporting(filters: ReportFilters): Promise<ReportTransaction[]> {
        // The hour-of-day filter needs row-level data; server aggregates can't honour
        // it, so force the local path whenever an hour range is set.
        const useOffline = (await this.shouldUseOfflineData()) || Boolean(filters.hourRange);
        
        if (useOffline) {
            console.log('OfflineReporting: Using local transaction data');
            return await this.getLocalTransactionsForReporting(filters);
        } else {
            try {
                console.log('OfflineReporting: Using server transaction data');
                return await reportingService.getTransactionsForReporting(filters);
            } catch (error) {
                console.warn('OfflineReporting: Server failed, falling back to local data:', error);
                return await this.getLocalTransactionsForReporting(filters);
            }
        }
    }

    // Get local transactions formatted for reporting
    private async getLocalTransactionsForReporting(filters: ReportFilters): Promise<ReportTransaction[]> {
        try {
            // Get transactions in date range, narrowed to the hour-of-day range
            const transactions = filterByHour(
                await transactionLocalService.getTransactionsByDateRange(
                    filters.dateRange.start,
                    filters.dateRange.end
                ),
                filters.hourRange
            );

            // Filter by employee if specified
            const filteredTransactions = filters.employeeId
                ? transactions.filter(t => t.employee_id === filters.employeeId)
                : transactions;

            // Filter by payment method if specified
            const paymentFilteredTransactions = filters.paymentMethod
                ? filteredTransactions.filter(t => t.payment_method === filters.paymentMethod)
                : filteredTransactions;

            // Get transaction items for all transactions
            const transactionIds = paymentFilteredTransactions.map(t => t.id);
            const allItems: LocalTransactionItem[] = [];
            
            for (const transactionId of transactionIds) {
                const transaction = await transactionLocalService.getTransactionById(transactionId);
                if (transaction?.items) {
                    allItems.push(...transaction.items);
                }
            }

            // Convert to ReportTransaction format
            const reportTransactions: ReportTransaction[] = paymentFilteredTransactions.map(transaction => {
                const transactionItems = allItems.filter(item => item.transaction_id === transaction.id);
                
                return {
                    id: transaction.id,
                    employeeId: transaction.employee_id,
                    employeeName: transaction.employee_name,
                    customerId: transaction.customer_id || undefined,
                    customerName: transaction.customer_name || undefined,
                    date: transaction.transaction_date,
                    time: transaction.transaction_time,
                    items: transactionItems.map(item => ({
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
                    status: transaction.status as 'completed' | 'refunded'
                };
            });

            // Apply category filter if specified
            if (filters.categoryId) {
                return reportTransactions.filter(transaction =>
                    transaction.items.some(item => item.categoryId === filters.categoryId)
                );
            }

            return reportTransactions;
        } catch (error) {
            console.error('OfflineReporting: Error getting local transactions:', error);
            return [];
        }
    }

    // Get employee performance metrics (offline-first)
    async getEmployeePerformance(filters: ReportFilters): Promise<EmployeePerformance[]> {
        // The hour-of-day filter needs row-level data; server aggregates can't honour
        // it, so force the local path whenever an hour range is set.
        const useOffline = (await this.shouldUseOfflineData()) || Boolean(filters.hourRange);
        
        if (useOffline) {
            console.log('OfflineReporting: Using local employee performance data');
            return await this.getLocalEmployeePerformance(filters);
        } else {
            try {
                console.log('OfflineReporting: Using server employee performance data');
                return await reportingService.getEmployeePerformance(filters);
            } catch (error) {
                console.warn('OfflineReporting: Server failed, falling back to local data:', error);
                return await this.getLocalEmployeePerformance(filters);
            }
        }
    }

    // Get local employee performance
    private async getLocalEmployeePerformance(filters: ReportFilters): Promise<EmployeePerformance[]> {
        try {
            // Get transactions in date range, narrowed to the hour-of-day range
            const transactions = filterByHour(
                await transactionLocalService.getTransactionsByDateRange(
                    filters.dateRange.start,
                    filters.dateRange.end
                ),
                filters.hourRange
            );

            // Filter completed transactions only
            const completedTransactions = transactions.filter(t => t.status === 'completed');

            // Get transaction items for quantity calculation
            const performanceMap = new Map<string, {
                employeeId: string;
                employeeName: string;
                totalSales: number;
                transactionCount: number;
                itemsSold: number;
            }>();

            for (const transaction of completedTransactions) {
                const existing = performanceMap.get(transaction.employee_id) || {
                    employeeId: transaction.employee_id,
                    employeeName: transaction.employee_name,
                    totalSales: 0,
                    transactionCount: 0,
                    itemsSold: 0
                };

                existing.totalSales += transaction.total;
                existing.transactionCount += 1;

                // Get items for this transaction to count quantity
                const transactionWithItems = await transactionLocalService.getTransactionById(transaction.id);
                if (transactionWithItems?.items) {
                    existing.itemsSold += transactionWithItems.items.reduce((sum, item) => sum + item.quantity, 0);
                }

                performanceMap.set(transaction.employee_id, existing);
            }

            return Array.from(performanceMap.values())
                .sort((a, b) => b.totalSales - a.totalSales);
        } catch (error) {
            console.error('OfflineReporting: Error getting local employee performance:', error);
            return [];
        }
    }

    // Get product performance metrics (offline-first)
    async getProductPerformance(filters: ReportFilters): Promise<ProductPerformance[]> {
        // The hour-of-day filter needs row-level data; server aggregates can't honour
        // it, so force the local path whenever an hour range is set.
        const useOffline = (await this.shouldUseOfflineData()) || Boolean(filters.hourRange);
        
        if (useOffline) {
            console.log('OfflineReporting: Using local product performance data');
            return await this.getLocalProductPerformance(filters);
        } else {
            try {
                console.log('OfflineReporting: Using server product performance data');
                return await reportingService.getProductPerformance(filters);
            } catch (error) {
                console.warn('OfflineReporting: Server failed, falling back to local data:', error);
                return await this.getLocalProductPerformance(filters);
            }
        }
    }

    // Get local product performance
    private async getLocalProductPerformance(filters: ReportFilters): Promise<ProductPerformance[]> {
        try {
            // Get transactions in date range, narrowed to the hour-of-day range
            const transactions = filterByHour(
                await transactionLocalService.getTransactionsByDateRange(
                    filters.dateRange.start,
                    filters.dateRange.end
                ),
                filters.hourRange
            );

            // Filter completed transactions only
            const completedTransactions = transactions.filter(t => t.status === 'completed');

            // Get all transaction items for these transactions
            const productMap = new Map<string, {
                productId: string;
                productName: string;
                categoryName: string;
                quantitySold: number;
                totalRevenue: number;
                transactionCount: number;
            }>();

            for (const transaction of completedTransactions) {
                const transactionWithItems = await transactionLocalService.getTransactionById(transaction.id);
                
                if (transactionWithItems?.items) {
                    for (const item of transactionWithItems.items) {
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
                    }
                }
            }

            return Array.from(productMap.values())
                .sort((a, b) => b.quantitySold - a.quantitySold);
        } catch (error) {
            console.error('OfflineReporting: Error getting local product performance:', error);
            return [];
        }
    }

    // Get overview metrics (offline-first)
    async getOverviewMetrics(filters: ReportFilters): Promise<OverviewMetrics> {
        // The hour-of-day filter needs row-level data; server aggregates can't honour
        // it, so force the local path whenever an hour range is set.
        const useOffline = (await this.shouldUseOfflineData()) || Boolean(filters.hourRange);
        
        if (useOffline) {
            console.log('OfflineReporting: Using local overview metrics');
            return await this.getLocalOverviewMetrics(filters);
        } else {
            try {
                console.log('OfflineReporting: Using server overview metrics');
                return await reportingService.getOverviewMetrics(filters);
            } catch (error) {
                console.warn('OfflineReporting: Server failed, falling back to local data:', error);
                return await this.getLocalOverviewMetrics(filters);
            }
        }
    }

    // Get local overview metrics
    private async getLocalOverviewMetrics(filters: ReportFilters): Promise<OverviewMetrics> {
        try {
            // Get transactions in date range, narrowed to the hour-of-day range
            const transactions = filterByHour(
                await transactionLocalService.getTransactionsByDateRange(
                    filters.dateRange.start,
                    filters.dateRange.end
                ),
                filters.hourRange
            );

            // Filter completed transactions only
            const completedTransactions = transactions.filter(t => t.status === 'completed');

            if (completedTransactions.length === 0) {
                return {
                    totalRevenue: 0,
                    totalTransactions: 0,
                    totalItems: 0,
                    avgTransaction: 0
                };
            }

            // Calculate totals
            const totalRevenue = completedTransactions.reduce((sum, t) => sum + t.total, 0);
            const totalTransactions = completedTransactions.length;

            // Count total items
            let totalItems = 0;
            for (const transaction of completedTransactions) {
                const transactionWithItems = await transactionLocalService.getTransactionById(transaction.id);
                if (transactionWithItems?.items) {
                    totalItems += transactionWithItems.items.reduce((sum, item) => sum + item.quantity, 0);
                }
            }

            const avgTransaction = totalRevenue / totalTransactions;

            return {
                totalRevenue,
                totalTransactions,
                totalItems,
                avgTransaction
            };
        } catch (error) {
            console.error('OfflineReporting: Error getting local overview metrics:', error);
            return {
                totalRevenue: 0,
                totalTransactions: 0,
                totalItems: 0,
                avgTransaction: 0
            };
        }
    }

    // Get comprehensive report data (offline-first)
    async getReportData(filters: ReportFilters) {
        const [
            transactions,
            employeePerformance,
            productPerformance,
            overviewMetrics
        ] = await Promise.all([
            this.getTransactionsForReporting(filters),
            this.getEmployeePerformance(filters),
            this.getProductPerformance(filters),
            this.getOverviewMetrics(filters)
        ]);

        return {
            transactions,
            employeePerformance,
            productPerformance,
            overviewMetrics,
            dataSource: await this.shouldUseOfflineData() ? 'local' : 'server'
        };
    }

    // Export transactions to CSV format (using local data)
    async generateCSVReport(filters: ReportFilters): Promise<string> {
        const transactions = await this.getLocalTransactionsForReporting(filters);
        
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

    // Get sync status for reporting data
    async getReportingSyncStatus(): Promise<{
        hasLocalData: boolean;
        localTransactionCount: number;
        oldestLocalTransaction: Date | null;
        newestLocalTransaction: Date | null;
        isOnline: boolean;
        recommendsSync: boolean;
    }> {
        try {
            const [stats, connectionState] = await Promise.all([
                transactionLocalService.getStats(),
                connectionStatus.getStatus()
            ]);

            const recentTransactions = await transactionLocalService.getRecentTransactions(30);
            const oldestTransaction = recentTransactions.length > 0 
                ? new Date(Math.min(...recentTransactions.map(t => new Date(t.transaction_date).getTime())))
                : null;
            const newestTransaction = recentTransactions.length > 0
                ? new Date(Math.max(...recentTransactions.map(t => new Date(t.transaction_date).getTime())))
                : null;

            const isOnline = connectionState.isOnline && connectionState.isSupabaseOnline;
            const recommendsSync = stats.pendingSync > 0 || (isOnline && stats.lastSync === null);

            return {
                hasLocalData: stats.totalTransactions > 0,
                localTransactionCount: stats.totalTransactions,
                oldestLocalTransaction: oldestTransaction,
                newestLocalTransaction: newestTransaction,
                isOnline,
                recommendsSync
            };
        } catch (error) {
            console.error('OfflineReporting: Error getting sync status:', error);
            return {
                hasLocalData: false,
                localTransactionCount: 0,
                oldestLocalTransaction: null,
                newestLocalTransaction: null,
                isOnline: false,
                recommendsSync: false
            };
        }
    }
}

// Export singleton instance
export const offlineReportingService = new OfflineReportingService();