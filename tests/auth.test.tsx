import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { EmployeesProvider, useEmployees } from '../src/contexts/EmployeesContext';
import { Employee } from '../src/types/supabase';
import React from 'react';

// Mock the employee service to avoid database dependencies
vi.mock('../src/services/employeeService', () => ({
    employeeService: {
        getEmployeeByNumber: vi.fn(),
        getAllEmployees: vi.fn(),
        createEmployee: vi.fn(),
        updateEmployee: vi.fn(),
        deleteEmployee: vi.fn(),
        getSyncStatus: vi.fn(),
        onSyncStatusChange: vi.fn(),
        forceSync: vi.fn(),
        getStats: vi.fn(),
    }
}));

// Import the mocked service
import { employeeService } from '../src/services/employeeService';

// Mock employees data
const mockEmployees: Employee[] = [
    {
        id: 'emp1',
        employee_number: 'EMP001',
        name: 'Admin User',
        role: 'admin',
        pin: null,
        password_hash: null,
        access_levels: ['all'],
        email: 'admin@pos.com',
        phone: null,
        is_active: true,
        hire_date: '2024-01-01',
        total_sales: 0,
        transaction_count: 0,
        average_transaction: 0,
        hours_worked: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        last_synced_at: null,
    },
    {
        id: 'emp3',
        employee_number: 'EMP003',
        name: 'Cashier',
        role: 'cashier',
        pin: null,
        password_hash: null,
        access_levels: ['sales'],
        email: null,
        phone: null,
        is_active: true,
        hire_date: '2024-01-02',
        total_sales: 0,
        transaction_count: 0,
        average_transaction: 0,
        hours_worked: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        last_synced_at: null,
    },
];

beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup default mock implementations
    vi.mocked(employeeService.getEmployeeByNumber).mockImplementation((empNum: string) => {
        return Promise.resolve(mockEmployees.find(emp => emp.employee_number === empNum) || null);
    });
    vi.mocked(employeeService.getAllEmployees).mockResolvedValue(mockEmployees);
    vi.mocked(employeeService.getSyncStatus).mockResolvedValue({
        lastPulledAt: null,
        lastPushedAt: null,
        pendingOperations: 0,
        conflictCount: 0,
        isOnline: false,
        isSyncing: false,
    });
    vi.mocked(employeeService.onSyncStatusChange).mockReturnValue(() => { });
    vi.mocked(employeeService.forceSync).mockResolvedValue({ success: true });
    vi.mocked(employeeService.getStats).mockResolvedValue({
        totalEmployees: 2,
        activeEmployees: 2,
        deletedEmployees: 0,
        pendingSync: 0,
        lastSync: null
    });
});

describe('EmployeesContext', () => {
    it('loads employees successfully', async () => {
        const { result } = renderHook(() => useEmployees(), {
            wrapper: ({ children }) => <EmployeesProvider>{children}</EmployeesProvider>
        });

        // Wait for employees to load
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
        });

        expect(result.current.employees).toHaveLength(2);
        expect(result.current.employees[0].name).toBe('Admin User');
        expect(result.current.employees[1].name).toBe('Cashier');
        expect(result.current.isLoading).toBe(false);
    });
});
