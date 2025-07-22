/**
 * Comprehensive test script for POS system
 * Run this in the browser console to test database operations
 */

import { populateSampleData } from './populateSampleData';
import { runDatabaseDiagnostics, fixDatabaseIssues } from './debugDatabase';
import { clearAndReinitializeDatabase } from './clearLocalDatabase';
import { localDb, employeeLocalService } from '../lib/localDatabase';
import { hashPassword } from './hashUtils';

export interface TestResults {
    timestamp: string;
    tests: {
        name: string;
        status: 'pass' | 'fail' | 'skip';
        message: string;
        duration: number;
    }[];
    summary: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
    };
}

class POSTestSuite {
    private results: TestResults = {
        timestamp: new Date().toISOString(),
        tests: [],
        summary: { total: 0, passed: 0, failed: 0, skipped: 0 }
    };

    private async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
        const startTime = Date.now();
        let status: 'pass' | 'fail' | 'skip' = 'pass';
        let message = 'Test passed';

        try {
            await testFn();
        } catch (error) {
            status = 'fail';
            message = error instanceof Error ? error.message : 'Test failed';
        }

        const duration = Date.now() - startTime;

        this.results.tests.push({ name, status, message, duration });
        this.results.summary.total++;
        this.results.summary[status === 'pass' ? 'passed' : status === 'fail' ? 'failed' : 'skipped']++;

        console.log(`${status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⏭️'} ${name} (${duration}ms)`);
        if (status === 'fail') {
            console.error(`   Error: ${message}`);
        }
    }

    async runAllTests(): Promise<TestResults> {
        console.log('🧪 Starting POS System Test Suite...');
        console.log('=====================================');

        // 1. Database Diagnostics
        await this.runTest('Database Diagnostics', async () => {
            const diagnostics = await runDatabaseDiagnostics();
            if (!diagnostics.isIndexedDBSupported) {
                throw new Error('IndexedDB not supported');
            }
            if (diagnostics.errors.length > 0) {
                console.warn('Database issues detected:', diagnostics.errors);
            }
        });

        // 2. Database Connection
        await this.runTest('Database Connection', async () => {
            if (!localDb.isOpen()) {
                await localDb.open();
            }
            if (!localDb.isOpen()) {
                throw new Error('Failed to open database');
            }
        });

        // 3. Employee Service Basic Operations
        await this.runTest('Employee Service - Get All', async () => {
            const employees = await employeeLocalService.getAllEmployees();
            // This might be empty initially, which is fine
            console.log(`Found ${employees.length} employees`);
        });

        // 4. Database Tables Access
        await this.runTest('Database Tables Access', async () => {
            const [empCount, catCount, prodCount] = await Promise.all([
                localDb.employees.count(),
                localDb.categories.count(),
                localDb.products.count()
            ]);
            console.log(`Table counts - Employees: ${empCount}, Categories: ${catCount}, Products: ${prodCount}`);
        });

        // 5. Sample Data Population (if no data exists)
        await this.runTest('Sample Data Population', async () => {
            const employeeCount = await localDb.employees.count();
            const categoryCount = await localDb.categories.count();
            const productCount = await localDb.products.count();

            if (employeeCount === 0 && categoryCount === 0 && productCount === 0) {
                await populateSampleData();
                console.log('Sample data populated successfully');
            } else {
                console.log('Data already exists, skipping population');
            }
        });

        // 6. Employee Creation Test
        await this.runTest('Employee Creation', async () => {
            const existingCount = await localDb.employees.count();

            const testEmployeeData = {
                employee_number: `TEST${Date.now()}`,
                name: 'Test Employee',
                email: `test${Date.now()}@example.com`,
                phone: '+351 999 999 999',
                role: 'cashier' as const,
                access_levels: ['sales' as const],
                is_active: true,
                hire_date: new Date().toISOString().split('T')[0],
                password_hash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8', // SHA-256 hash of "password"
                pin: '1234',
                total_sales: 0,
                transaction_count: 0,
                average_transaction: 0,
                hours_worked: 0,
                deleted_at: null,
            };

            const employeeId = await employeeLocalService.createEmployee(testEmployeeData);

            const newCount = await localDb.employees.count();
            if (newCount !== existingCount + 1) {
                throw new Error('Employee count did not increase');
            }

            // Clean up test employee
            await employeeLocalService.deleteEmployee(employeeId);
            console.log('Test employee created and cleaned up successfully');
        });

        // 7. Hash Consistency Test (crypto.subtle vs js-sha256)
        await this.runTest('Hash Consistency', async () => {
            const testPassword = 'password';
            const expectedHash = '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8';

            // Test the shared hash utility
            const actualHash = await hashPassword(testPassword);

            if (actualHash !== expectedHash) {
                throw new Error(`Hash mismatch: got ${actualHash}, expected ${expectedHash}`);
            }

            console.log(`✅ Hash consistency verified: ${actualHash}`);
            console.log(`   Using method: crypto.subtle = ${!!(window.crypto && window.crypto.subtle)}`);
        });

        // 8. Database Reset Test (optional - commented out for safety)
        // await this.runTest('Database Reset', async () => {
        //     await clearAndReinitializeDatabase();
        //     console.log('Database reset completed');
        // });

        console.log('\n=====================================');
        console.log('🏁 Test Suite Complete');
        console.log(`Results: ${this.results.summary.passed}/${this.results.summary.total} passed`);

        if (this.results.summary.failed > 0) {
            console.log(`❌ ${this.results.summary.failed} tests failed`);
        }

        return this.results;
    }
}

// Export functions for manual testing
export const runPOSTests = async (): Promise<TestResults> => {
    const testSuite = new POSTestSuite();
    return await testSuite.runAllTests();
};

export const quickDatabaseTest = async (): Promise<boolean> => {
    try {
        const diagnostics = await runDatabaseDiagnostics();
        console.log('Quick Database Test Results:', diagnostics);
        return diagnostics.errors.length === 0;
    } catch (error) {
        console.error('Quick database test failed:', error);
        return false;
    }
};

export const populateDataIfEmpty = async (): Promise<void> => {
    const [empCount, catCount, prodCount] = await Promise.all([
        localDb.employees.count(),
        localDb.categories.count(),
        localDb.products.count()
    ]);

    if (empCount === 0 && catCount === 0 && prodCount === 0) {
        console.log('Database is empty, populating sample data...');
        await populateSampleData();
        console.log('Sample data populated!');
    } else {
        console.log('Database already has data:', { empCount, catCount, prodCount });
    }
};

export const fixDatabaseIfNeeded = async (): Promise<void> => {
    const diagnostics = await runDatabaseDiagnostics();
    if (diagnostics.errors.length > 0) {
        console.log('Database issues detected, attempting to fix...');
        const result = await fixDatabaseIssues();
        console.log('Fix result:', result);
    } else {
        console.log('Database is healthy, no fixes needed');
    }
};

// Auto-expose to window for easy console access
if (typeof window !== 'undefined') {
    (window as any).POSTests = {
        runTests: runPOSTests,
        quickTest: quickDatabaseTest,
        populateData: populateDataIfEmpty,
        fixDatabase: fixDatabaseIfNeeded,
        diagnostics: runDatabaseDiagnostics,
    };

    console.log('🧪 POS Test utilities loaded!');
    console.log('Available commands:');
    console.log('  POSTests.runTests() - Run full test suite');
    console.log('  POSTests.quickTest() - Quick database check');
    console.log('  POSTests.populateData() - Add sample data if empty');
    console.log('  POSTests.fixDatabase() - Fix database issues');
    console.log('  POSTests.diagnostics() - Run database diagnostics');
} 