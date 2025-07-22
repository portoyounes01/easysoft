import { localDb } from '../lib/localDatabase';

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