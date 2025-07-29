// Bootstrap loader for offline admin initialization
// This should be called during app startup before the main app loads

import { initializeLocalDatabase, employeeLocalService } from '../lib/localDatabase';
import { LocalEmployee } from '../types/supabase';

export async function loadBootstrapData(): Promise<boolean> {
    try {
        // Check if bootstrap data exists
        const response = await fetch('/bootstrap-data.json');
        if (!response.ok) {
            console.log('No bootstrap data found - normal startup');
            return false;
        }
        
        const bootstrapData = await response.json();
        console.log('📥 Bootstrap data found, checking if admin exists...');
        
        // Initialize local database
        await initializeLocalDatabase();
        
        // Check if bootstrap employees already exist (by employee_number)
        const existingEmployeeNumbers = new Set();
        const allExistingEmployees = await employeeLocalService.getAllEmployees();
        for (const emp of allExistingEmployees) {
            existingEmployeeNumbers.add(emp.employee_number);
        }
        
        // Filter out employees that already exist
        const newEmployees = bootstrapData.employees.filter((emp: any) => 
            !existingEmployeeNumbers.has(emp.employee_number)
        );
        
        if (newEmployees.length === 0) {
            console.log('✅ All bootstrap employees already exist locally - skipping bootstrap');
            return false;
        }
        
        // Load only new bootstrap employees
        for (const empData of newEmployees) {
            // Convert the JSON data to match LocalEmployee interface
            const localEmpData: Omit<LocalEmployee, 'id' | 'created_at' | 'updated_at' | 'needs_push' | 'is_conflicted' | 'last_synced_at'> = {
                employee_number: empData.employee_number,
                name: empData.name,
                email: empData.email,
                phone: empData.phone,
                password_hash: empData.password_hash,
                pin: empData.pin,
                role: empData.role,
                access_levels: empData.access_levels,
                is_active: empData.is_active,
                hire_date: empData.hire_date,
                total_sales: empData.total_sales,
                transaction_count: empData.transaction_count,
                average_transaction: empData.average_transaction,
                hours_worked: empData.hours_worked,
                deleted_at: empData.deleted_at ? new Date(empData.deleted_at) : null
            };
            
            await employeeLocalService.createEmployee(localEmpData);
            console.log(`✅ Loaded bootstrap employee: ${empData.name} (${empData.employee_number})`);
        }
        
        console.log('🎉 Bootstrap complete! Admin user is ready for offline use.');
        return true;
        
    } catch (error) {
        console.error('❌ Bootstrap loading failed:', error);
        return false;
    }
}

// Helper function to check if bootstrap data exists
export async function hasBootstrapData(): Promise<boolean> {
    try {
        const response = await fetch('/bootstrap-data.json');
        return response.ok;
    } catch {
        return false;
    }
}

// Helper function to clear bootstrap data (after successful sync)
export async function clearBootstrapData(): Promise<void> {
    try {
        // This would need to be implemented on the server side
        // For now, just log that it should be cleared
        console.log('💡 Bootstrap data should be cleared from public folder after successful sync');
    } catch (error) {
        console.error('❌ Failed to clear bootstrap data:', error);
    }
}
