/**
 * Database debugging utility
 * This utility helps diagnose and fix database issues in the POS system
 */

import { localDb, initializeLocalDatabase } from '../lib/localDatabase';
import { clearAndReinitializeDatabase } from './clearLocalDatabase';

export interface DatabaseDiagnostics {
    isIndexedDBSupported: boolean;
    isDatabaseOpen: boolean;
    tables: string[];
    errors: string[];
    recommendations: string[];
    hasData: boolean;
    version: number | null;
}

export const runDatabaseDiagnostics = async (): Promise<DatabaseDiagnostics> => {
    const diagnostics: DatabaseDiagnostics = {
        isIndexedDBSupported: true,
        isDatabaseOpen: false,
        tables: [],
        errors: [],
        recommendations: [],
        hasData: false,
        version: null
    };

    try {
        // 1. Check IndexedDB support
        if (!window.indexedDB) {
            diagnostics.isIndexedDBSupported = false;
            diagnostics.errors.push('IndexedDB is not supported in this browser');
            diagnostics.recommendations.push('Use a modern browser that supports IndexedDB');
            return diagnostics;
        }

        // 2. Try to open the database
        try {
            await localDb.open();
            diagnostics.isDatabaseOpen = true;
            diagnostics.version = localDb.verno;

            // 3. Check available tables
            if (localDb.isOpen()) {
                diagnostics.tables = Array.from(localDb.tables.map(table => table.name));
            }

            // 4. Check for data in tables
            const [employeeCount, categoryCount, productCount] = await Promise.all([
                localDb.employees?.count() || 0,
                localDb.categories?.count() || 0,
                localDb.products?.count() || 0
            ]);

            diagnostics.hasData = (employeeCount + categoryCount + productCount) > 0;

            console.log('Database diagnostics:');
            console.log('- Employees:', employeeCount);
            console.log('- Categories:', categoryCount);
            console.log('- Products:', productCount);

        } catch (dbError) {
            diagnostics.errors.push(`Database open error: ${dbError}`);
            diagnostics.recommendations.push('Try resetting the database');

            // Check for specific error types
            if (dbError instanceof Error) {
                if (dbError.message.includes('object store') ||
                    dbError.message.includes('NotFoundError') ||
                    dbError.message.includes('IDBTransaction')) {
                    diagnostics.errors.push('Database schema mismatch detected');
                    diagnostics.recommendations.push('Database reset is required to fix schema issues');
                }
            }
        }

        // 5. Check for specific table issues
        try {
            await Promise.all([
                localDb.employees?.limit(1).toArray(),
                localDb.categories?.limit(1).toArray(),
                localDb.products?.limit(1).toArray(),
            ]);
        } catch (tableError) {
            diagnostics.errors.push(`Table access error: ${tableError}`);
            diagnostics.recommendations.push('Table structure may be corrupted');
        }

    } catch (error) {
        diagnostics.errors.push(`General error: ${error}`);
        diagnostics.recommendations.push('Check browser console for more details');
    }

    return diagnostics;
};

export const fixDatabaseIssues = async (): Promise<{ success: boolean; message: string }> => {
    try {
        const diagnostics = await runDatabaseDiagnostics();

        if (diagnostics.errors.length === 0) {
            return { success: true, message: 'Database is healthy, no fixes needed' };
        }

        // If there are schema errors, reset the database
        const hasSchemaErrors = diagnostics.errors.some(error =>
            error.includes('object store') ||
            error.includes('schema') ||
            error.includes('NotFoundError')
        );

        if (hasSchemaErrors || !diagnostics.isDatabaseOpen) {
            console.log('Resetting database due to schema issues...');
            await clearAndReinitializeDatabase();
            return { success: true, message: 'Database reset completed successfully' };
        }

        // Try to reinitialize
        await initializeLocalDatabase();
        return { success: true, message: 'Database reinitialized successfully' };

    } catch (error) {
        return {
            success: false,
            message: `Failed to fix database: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
};

export const logDatabaseInfo = async (): Promise<void> => {
    const diagnostics = await runDatabaseDiagnostics();

    console.group('🗄️ Database Diagnostics');
    console.log('IndexedDB Supported:', diagnostics.isIndexedDBSupported);
    console.log('Database Open:', diagnostics.isDatabaseOpen);
    console.log('Database Version:', diagnostics.version);
    console.log('Available Tables:', diagnostics.tables);
    console.log('Has Data:', diagnostics.hasData);

    if (diagnostics.errors.length > 0) {
        console.group('❌ Errors');
        diagnostics.errors.forEach(error => console.error(error));
        console.groupEnd();
    }

    if (diagnostics.recommendations.length > 0) {
        console.group('💡 Recommendations');
        diagnostics.recommendations.forEach(rec => console.warn(rec));
        console.groupEnd();
    }

    console.groupEnd();
};

// Auto-run diagnostics on import
if (typeof window !== 'undefined') {
    // Run diagnostics automatically when imported in browser
    logDatabaseInfo().catch(console.error);
} 