import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { Employee, EmployeeFormData, EmployeeFilters, SyncMetadata } from '../types/supabase';
import { employeeService } from '../services/employeeService';

// State interface
interface EmployeesState {
    employees: Employee[];
    isLoading: boolean;
    error: string | null;
    syncStatus: SyncMetadata & { isOnline: boolean; isSyncing: boolean } | null;
    lastUpdated: Date | null;
}

// Context interface
interface EmployeesContextType extends EmployeesState {
    // CRUD operations
    createEmployee: (data: EmployeeFormData) => Promise<string>;
    updateEmployee: (id: string, updates: Partial<EmployeeFormData>) => Promise<void>;
    deleteEmployee: (id: string) => Promise<void>;

    // Query operations
    refreshEmployees: () => Promise<void>;
    searchEmployees: (query: string) => Promise<Employee[]>;
    filterEmployees: (filters: EmployeeFilters) => Promise<Employee[]>;
    getEmployeeById: (id: string) => Promise<Employee | null>;
    getEmployeeByNumber: (employeeNumber: string) => Promise<Employee | null>;
    getEmployeesByRole: (role: string) => Promise<Employee[]>;

    // Sync operations
    forceSync: () => Promise<{ success: boolean; error?: string }>;

    // Utility
    clearError: () => void;
}

// Actions
type EmployeesAction =
    | { type: 'SET_LOADING'; payload: boolean }
    | { type: 'SET_EMPLOYEES'; payload: Employee[] }
    | { type: 'SET_ERROR'; payload: string | null }
    | { type: 'SET_SYNC_STATUS'; payload: EmployeesState['syncStatus'] }
    | { type: 'ADD_EMPLOYEE'; payload: Employee }
    | { type: 'UPDATE_EMPLOYEE'; payload: { id: string; updates: Partial<Employee> } }
    | { type: 'REMOVE_EMPLOYEE'; payload: string }
    | { type: 'SET_LAST_UPDATED'; payload: Date };

// Reducer
const employeesReducer = (state: EmployeesState, action: EmployeesAction): EmployeesState => {
    switch (action.type) {
        case 'SET_LOADING':
            return { ...state, isLoading: action.payload };

        case 'SET_EMPLOYEES':
            return {
                ...state,
                employees: action.payload,
                isLoading: false,
                error: null,
                lastUpdated: new Date()
            };

        case 'SET_ERROR':
            return { ...state, error: action.payload, isLoading: false };

        case 'SET_SYNC_STATUS':
            return { ...state, syncStatus: action.payload };

        case 'ADD_EMPLOYEE':
            return {
                ...state,
                employees: [...state.employees, action.payload],
                lastUpdated: new Date()
            };

        case 'UPDATE_EMPLOYEE':
            return {
                ...state,
                employees: state.employees.map(emp =>
                    emp.id === action.payload.id
                        ? { ...emp, ...action.payload.updates }
                        : emp
                ),
                lastUpdated: new Date()
            };

        case 'REMOVE_EMPLOYEE':
            return {
                ...state,
                employees: state.employees.filter(emp => emp.id !== action.payload),
                lastUpdated: new Date()
            };

        case 'SET_LAST_UPDATED':
            return { ...state, lastUpdated: action.payload };

        default:
            return state;
    }
};

// Initial state
const initialState: EmployeesState = {
    employees: [],
    isLoading: true,
    error: null,
    syncStatus: null,
    lastUpdated: null,
};

// Create context
const EmployeesContext = createContext<EmployeesContextType | undefined>(undefined);

// Provider component
export const EmployeesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(employeesReducer, initialState);

    // Load employees on mount
    useEffect(() => {
        loadEmployees();
        loadSyncStatus();

        // Subscribe to sync status changes
        const unsubscribe = employeeService.onSyncStatusChange((status, details) => {
            handleSyncStatusChange(status, details);
        });

        return unsubscribe;
    }, []);

    // Load all employees
    const loadEmployees = useCallback(async () => {
        try {
            dispatch({ type: 'SET_LOADING', payload: true });
            const employees = await employeeService.getAllEmployees();
            dispatch({ type: 'SET_EMPLOYEES', payload: employees });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to load employees';
            dispatch({ type: 'SET_ERROR', payload: errorMessage });
            console.error('Failed to load employees:', error);
        }
    }, []);

    // Load sync status
    const loadSyncStatus = useCallback(async () => {
        try {
            const syncStatus = await employeeService.getSyncStatus();
            dispatch({ type: 'SET_SYNC_STATUS', payload: syncStatus });
        } catch (error) {
            console.error('Failed to load sync status:', error);
        }
    }, []);

    // Handle sync status changes
    const handleSyncStatusChange = useCallback((status: 'syncing' | 'completed' | 'error', details?: any) => {
        loadSyncStatus();

        if (status === 'completed') {
            // Refresh employees list after successful sync
            loadEmployees();
        } else if (status === 'error') {
            console.error('Sync error:', details);
            dispatch({ type: 'SET_ERROR', payload: 'Sync failed: ' + (details?.message || 'Unknown error') });
        }
    }, [loadEmployees, loadSyncStatus]);

    // CRUD Operations
    const createEmployee = useCallback(async (data: EmployeeFormData): Promise<string> => {
        try {
            dispatch({ type: 'SET_ERROR', payload: null });
            const employeeId = await employeeService.createEmployee(data);

            // Refresh the list to get the new employee
            await loadEmployees();

            return employeeId;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to create employee';
            dispatch({ type: 'SET_ERROR', payload: errorMessage });
            throw error;
        }
    }, [loadEmployees]);

    const updateEmployee = useCallback(async (id: string, updates: Partial<EmployeeFormData>): Promise<void> => {
        try {
            dispatch({ type: 'SET_ERROR', payload: null });
            await employeeService.updateEmployee(id, updates);

            // Refresh the list to get updated data
            await loadEmployees();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to update employee';
            dispatch({ type: 'SET_ERROR', payload: errorMessage });
            throw error;
        }
    }, [loadEmployees]);

    const deleteEmployee = useCallback(async (id: string): Promise<void> => {
        try {
            dispatch({ type: 'SET_ERROR', payload: null });
            await employeeService.deleteEmployee(id);

            // Remove from local state immediately for better UX
            dispatch({ type: 'REMOVE_EMPLOYEE', payload: id });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to delete employee';
            dispatch({ type: 'SET_ERROR', payload: errorMessage });
            throw error;
        }
    }, []);

    // Query Operations
    const refreshEmployees = useCallback(async (): Promise<void> => {
        await loadEmployees();
    }, [loadEmployees]);

    const searchEmployees = useCallback(async (query: string): Promise<Employee[]> => {
        try {
            return await employeeService.searchEmployees(query);
        } catch (error) {
            console.error('Search failed:', error);
            return [];
        }
    }, []);

    const filterEmployees = useCallback(async (filters: EmployeeFilters): Promise<Employee[]> => {
        try {
            return await employeeService.filterEmployees(filters);
        } catch (error) {
            console.error('Filter failed:', error);
            return [];
        }
    }, []);

    const getEmployeeById = useCallback(async (id: string): Promise<Employee | null> => {
        try {
            return await employeeService.getEmployeeById(id);
        } catch (error) {
            console.error('Get employee by ID failed:', error);
            return null;
        }
    }, []);

    const getEmployeeByNumber = useCallback(async (employeeNumber: string): Promise<Employee | null> => {
        try {
            return await employeeService.getEmployeeByNumber(employeeNumber);
        } catch (error) {
            console.error('Get employee by number failed:', error);
            return null;
        }
    }, []);

    const getEmployeesByRole = useCallback(async (role: string): Promise<Employee[]> => {
        try {
            return await employeeService.getEmployeesByRole(role);
        } catch (error) {
            console.error('Get employees by role failed:', error);
            return [];
        }
    }, []);

    // Sync Operations
    const forceSync = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
        try {
            const result = await employeeService.forceSync();
            await loadSyncStatus();
            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Sync failed';
            return { success: false, error: errorMessage };
        }
    }, [loadSyncStatus]);

    // Utility
    const clearError = useCallback(() => {
        dispatch({ type: 'SET_ERROR', payload: null });
    }, []);

    // Context value
    const contextValue: EmployeesContextType = {
        ...state,
        createEmployee,
        updateEmployee,
        deleteEmployee,
        refreshEmployees,
        searchEmployees,
        filterEmployees,
        getEmployeeById,
        getEmployeeByNumber,
        getEmployeesByRole,
        forceSync,
        clearError,
    };

    return (
        <EmployeesContext.Provider value={contextValue}>
            {children}
        </EmployeesContext.Provider>
    );
};

// Custom hook
export const useEmployees = (): EmployeesContextType => {
    const context = useContext(EmployeesContext);
    if (context === undefined) {
        throw new Error('useEmployees must be used within an EmployeesProvider');
    }
    return context;
};

// Utility hooks for specific use cases
export const useEmployeeById = (id: string | null): Employee | null => {
    const { employees } = useEmployees();
    return id ? employees.find(emp => emp.id === id) || null : null;
};

export const useEmployeeByNumber = (employeeNumber: string | null): Employee | null => {
    const { employees } = useEmployees();
    return employeeNumber ? employees.find(emp => emp.employee_number === employeeNumber) || null : null;
};

export const useEmployeesByRole = (role: string): Employee[] => {
    const { employees } = useEmployees();
    return employees.filter(emp => emp.role === role && emp.is_active && !emp.deleted_at);
};

export const useActiveEmployees = (): Employee[] => {
    const { employees } = useEmployees();
    return employees.filter(emp => emp.is_active && !emp.deleted_at);
};

export const useSyncStatus = (): EmployeesState['syncStatus'] => {
    const { syncStatus } = useEmployees();
    return syncStatus;
}; 