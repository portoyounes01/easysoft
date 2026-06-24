import { localDb } from '../lib/localDatabase';
import { isSystemAdministrator } from './systemAdmin';

export interface LocalDatabaseClearResult {
    preservedSystemAdmins: number;
    preservedFiscalIssueAttempts: number;
    preservedFiscalDocuments: number;
    preservedFiscalTransactions: number;
}

/**
 * Clear and reinitialize the local database
 * This will fix any schema mismatches or corrupted data
 */
export const clearAndReinitializeDatabase = async (): Promise<void> => {
    try {
        console.log('Clearing local database...');

        // Close the database connection
        localDb.close();

        // Delete the entire database
        await localDb.delete();

        // Reopen and recreate the database with the current schema
        await localDb.open();

        console.log('Local database cleared and reinitialized successfully');
    } catch (error) {
        console.error('Failed to clear and reinitialize database:', error);
        throw error;
    }
};

/**
 * Clear the active IndexedDB slot while retaining login recovery and external
 * fiscal issuance reconciliation records.
 */
export const clearLocalDatabasePreservingRecovery = async (): Promise<LocalDatabaseClearResult> => {
    if (!localDb.isOpen()) {
        await localDb.open();
    }

    const [
        employees,
        customers,
        transactions,
        transactionItems,
        fiscalDocuments,
        fiscalAuditEvents,
        fiscalIssueAttempts,
        transactionSyncQueue,
        syncMetadata,
    ] = await Promise.all([
        localDb.employees.toArray(),
        localDb.customers.toArray(),
        localDb.transactions.toArray(),
        localDb.transactionItems.toArray(),
        localDb.fiscalDocuments.toArray(),
        localDb.fiscalAuditEvents.toArray(),
        localDb.vendusIssueAttempts.toArray(),
        localDb.transactionSyncQueue.toArray(),
        localDb.syncMetadata.toArray(),
    ]);

    const fiscalTransactionIds = new Set(
        fiscalDocuments
            .map(document => document.transaction_id)
            .filter((transactionId): transactionId is string => Boolean(transactionId))
    );
    for (const transaction of transactions) {
        if (transaction.fiscal_document_id) {
            fiscalTransactionIds.add(transaction.id);
        }
    }

    const fiscalTransactions = transactions.filter(transaction => fiscalTransactionIds.has(transaction.id));
    const fiscalTransactionItems = transactionItems.filter(item => fiscalTransactionIds.has(item.transaction_id));
    const referencedEmployeeIds = new Set([
        ...fiscalTransactions.map(transaction => transaction.employee_id),
        ...fiscalAuditEvents
            .map(event => event.employee_id)
            .filter((employeeId): employeeId is string => Boolean(employeeId)),
    ]);
    const referencedCustomerIds = new Set(
        fiscalTransactions
            .map(transaction => transaction.customer_id)
            .filter((customerId): customerId is string => Boolean(customerId))
    );
    const preservedEmployees = employees.filter(
        employee => isSystemAdministrator(employee) || referencedEmployeeIds.has(employee.id)
    );
    const preservedCustomers = customers.filter(customer => referencedCustomerIds.has(customer.id));
    const preservedTransactionQueue = transactionSyncQueue.filter(operation =>
        fiscalTransactionIds.has(operation.transactionId)
    );
    const preservedTransactionSyncMetadata = syncMetadata
        .filter(metadata => metadata.id === 'transactions')
        .map(metadata => ({
            ...metadata,
            pendingOperations: preservedTransactionQueue.length,
        }));
    const systemAdmins = preservedEmployees.filter(employee => isSystemAdministrator(employee));
    if (systemAdmins.length === 0) {
        throw new Error('No local system administrator account was found. The database was not cleared.');
    }

    await clearAndReinitializeDatabase();

    await localDb.transaction(
        'rw',
        [
            localDb.employees,
            localDb.customers,
            localDb.transactions,
            localDb.transactionItems,
            localDb.fiscalDocuments,
            localDb.fiscalAuditEvents,
            localDb.vendusIssueAttempts,
            localDb.transactionSyncQueue,
            localDb.syncMetadata,
        ],
        async () => {
            await localDb.employees.bulkPut(preservedEmployees);
            await localDb.customers.bulkPut(preservedCustomers);
            await localDb.transactions.bulkPut(fiscalTransactions);
            await localDb.transactionItems.bulkPut(fiscalTransactionItems);
            await localDb.fiscalDocuments.bulkPut(fiscalDocuments);
            await localDb.fiscalAuditEvents.bulkPut(fiscalAuditEvents);
            await localDb.vendusIssueAttempts.bulkPut(fiscalIssueAttempts);
            await localDb.transactionSyncQueue.bulkPut(preservedTransactionQueue);
            await localDb.syncMetadata.bulkPut(preservedTransactionSyncMetadata);
        }
    );

    return {
        preservedSystemAdmins: systemAdmins.length,
        preservedFiscalIssueAttempts: fiscalIssueAttempts.length,
        preservedFiscalDocuments: fiscalDocuments.length,
        preservedFiscalTransactions: fiscalTransactions.length,
    };
};

/**
 * Clear all employee data only (keep schema)
 */
export const clearEmployeeData = async (): Promise<void> => {
    try {
        console.log('Clearing employee data...');

        await localDb.transaction('rw', [
            localDb.employees,
            localDb.employeeSyncQueue,
            localDb.syncMetadata
        ], async () => {
            await localDb.employees.clear();
            await localDb.employeeSyncQueue.clear();
            await localDb.syncMetadata.clear();

            // Reinitialize sync metadata
            await localDb.syncMetadata.add({
                id: 'employees',
                lastPulledAt: null,
                lastPushedAt: null,
                pendingOperations: 0,
                conflictCount: 0,
            });
        });

        console.log('Employee data cleared successfully');
    } catch (error) {
        console.error('Failed to clear employee data:', error);
        throw error;
    }
};

// Main execution block - runs when script is called directly
if (typeof window === 'undefined' && import.meta.url) {
    // This is a Node.js environment and we can check if this is the main module
    const currentFilePath = new URL(import.meta.url).pathname;
    const isMainModule = process.argv[1] && process.argv[1].endsWith(currentFilePath.split('/').pop() || '');

    if (isMainModule) {
        console.log('🚀 Running clear local database script...');
        clearAndReinitializeDatabase()
            .then(() => {
                console.log('✅ Script completed successfully');
                process.exit(0);
            })
            .catch((error: Error) => {
                console.error('💥 Script failed:', error);
                process.exit(1);
            });
    }
}
