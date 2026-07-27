import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import i18n from '../i18n';
import { Employee, EmployeeFormData, EmployeeFilters, SyncMetadata } from '../types/supabase';
import { employeeService } from '../services/employeeService';

/** Local IndexedDB / list load failure — blocks login until resolved. */
interface EmployeesState {
    employees: Employee[];
    isLoading: boolean;
    loadError: string | null;
    /** Background Supabase sync failure — non-blocking for login and list. */
    syncError: string | null;
    /** CRUD / mutation failure — shown on admin Employees page, not login. */
    operationError: string | null;
    syncStatus: SyncMetadata & { isOnline: boolean; isSyncing: boolean } | null;
    lastUpdated: Date | null;
}

interface EmployeesContextType extends EmployeesState {
    createEmployee: (data: EmployeeFormData) => Promise<string>;
    updateEmployee: (id: string, updates: Partial<EmployeeFormData>) => Promise<void>;
    deleteEmployee: (id: string) => Promise<void>;

    refreshEmployees: () => Promise<void>;
    searchEmployees: (query: string) => Promise<Employee[]>;
    filterEmployees: (filters: EmployeeFilters) => Promise<Employee[]>;
    getEmployeeById: (id: string) => Promise<Employee | null>;
    getEmployeeByNumber: (employeeNumber: string) => Promise<Employee | null>;
    getEmployeesByRole: (role: string) => Promise<Employee[]>;

    forceSync: () => Promise<{ success: boolean; error?: string }>;

    clearLoadError: () => void;
    clearSyncError: () => void;
    clearOperationError: () => void;
}

type EmployeesAction =
    | { type: 'SET_LOADING'; payload: boolean }
    | { type: 'SET_EMPLOYEES'; payload: Employee[] }
    | { type: 'SET_LOAD_ERROR'; payload: string | null }
    | { type: 'SET_SYNC_ERROR'; payload: string | null }
    | { type: 'SET_OPERATION_ERROR'; payload: string | null }
    | { type: 'SET_SYNC_STATUS'; payload: EmployeesState['syncStatus'] }
    | { type: 'ADD_EMPLOYEE'; payload: Employee }
    | { type: 'UPDATE_EMPLOYEE'; payload: { id: string; updates: Partial<Employee> } }
    | { type: 'REMOVE_EMPLOYEE'; payload: string }
    | { type: 'SET_LAST_UPDATED'; payload: Date };

export const employeesReducer = (state: EmployeesState, action: EmployeesAction): EmployeesState => {
    switch (action.type) {
        case 'SET_LOADING':
            return { ...state, isLoading: action.payload };

        case 'SET_EMPLOYEES':
            return {
                ...state,
                employees: action.payload,
                isLoading: false,
                loadError: null,
                lastUpdated: new Date()
            };

        case 'SET_LOAD_ERROR':
            // Clearing loadError (null) must not force isLoading false — loadEmployees dispatches
            // SET_LOADING true then SET_LOAD_ERROR null; the old "always isLoading false" caused a
            // one-frame gap where the login grid rendered before the fetch failed.
            return {
                ...state,
                loadError: action.payload,
                isLoading: action.payload !== null ? false : state.isLoading
            };

        case 'SET_SYNC_ERROR':
            return { ...state, syncError: action.payload };

        case 'SET_OPERATION_ERROR':
            return { ...state, operationError: action.payload };

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

const initialState: EmployeesState = {
    employees: [],
    isLoading: true,
    loadError: null,
    syncError: null,
    operationError: null,
    syncStatus: null,
    lastUpdated: null,
};

const EmployeesContext = createContext<EmployeesContextType | undefined>(undefined);

export const EmployeesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(employeesReducer, initialState);

    useEffect(() => {
        loadEmployees();
        loadSyncStatus();

        const unsubscribe = employeeService.onSyncStatusChange((status, details) => {
            handleSyncStatusChange(status, details);
        });

        return unsubscribe;
    }, []);

    const loadEmployees = useCallback(async (options?: { afterSync?: boolean }) => {
        const afterSync = options?.afterSync === true;
        try {
            if (!afterSync) {
                dispatch({ type: 'SET_LOADING', payload: true });
                dispatch({ type: 'SET_LOAD_ERROR', payload: null });
            }
            const employees = await employeeService.getAllEmployees();
            dispatch({ type: 'SET_EMPLOYEES', payload: employees });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : i18n.t('employees.loadFailed');
            if (afterSync) {
                // Post-sync refresh must not block login: keep in-memory list, surface as sync-only
                dispatch({
                    type: 'SET_SYNC_ERROR',
                    payload: i18n.t('employees.refreshAfterSyncFailed', { error: errorMessage })
                });
                console.error('Failed to reload employees after sync:', error);
            } else {
                dispatch({ type: 'SET_LOAD_ERROR', payload: errorMessage });
                console.error('Failed to load employees:', error);
            }
        }
    }, []);

    const loadSyncStatus = useCallback(async () => {
        try {
            const syncStatus = await employeeService.getSyncStatus();
            dispatch({ type: 'SET_SYNC_STATUS', payload: syncStatus });
        } catch (error) {
            console.error('Failed to load sync status:', error);
        }
    }, []);

    const handleSyncStatusChange = useCallback((status: 'syncing' | 'completed' | 'error', details?: { message?: string }) => {
        loadSyncStatus();

        if (status === 'completed') {
            dispatch({ type: 'SET_SYNC_ERROR', payload: null });
            void loadEmployees({ afterSync: true });
        } else if (status === 'error') {
            console.error('Sync error:', details);
            dispatch({
                type: 'SET_SYNC_ERROR',
                payload: i18n.t('employees.syncFailedWithReason', { error: details?.message || i18n.t('common.unknownError') })
            });
        }
    }, [loadEmployees, loadSyncStatus]);

    const createEmployee = useCallback(async (data: EmployeeFormData): Promise<string> => {
        try {
            dispatch({ type: 'SET_OPERATION_ERROR', payload: null });
            const employeeId = await employeeService.createEmployee(data);
            await loadEmployees();
            return employeeId;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : i18n.t('employees.createFailed');
            dispatch({ type: 'SET_OPERATION_ERROR', payload: errorMessage });
            throw error;
        }
    }, [loadEmployees]);

    const updateEmployee = useCallback(async (id: string, updates: Partial<EmployeeFormData>): Promise<void> => {
        try {
            dispatch({ type: 'SET_OPERATION_ERROR', payload: null });
            await employeeService.updateEmployee(id, updates);
            await loadEmployees();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : i18n.t('employees.updateFailed');
            dispatch({ type: 'SET_OPERATION_ERROR', payload: errorMessage });
            throw error;
        }
    }, [loadEmployees]);

    const deleteEmployee = useCallback(async (id: string): Promise<void> => {
        try {
            dispatch({ type: 'SET_OPERATION_ERROR', payload: null });
            await employeeService.deleteEmployee(id);
            dispatch({ type: 'REMOVE_EMPLOYEE', payload: id });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : i18n.t('employees.deleteFailed');
            dispatch({ type: 'SET_OPERATION_ERROR', payload: errorMessage });
            throw error;
        }
    }, []);

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

    const forceSync = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
        try {
            const result = await employeeService.forceSync();
            await loadSyncStatus();
            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : i18n.t('employees.syncFailed');
            return { success: false, error: errorMessage };
        }
    }, [loadSyncStatus]);

    const clearLoadError = useCallback(() => {
        dispatch({ type: 'SET_LOAD_ERROR', payload: null });
    }, []);

    const clearSyncError = useCallback(() => {
        dispatch({ type: 'SET_SYNC_ERROR', payload: null });
    }, []);

    const clearOperationError = useCallback(() => {
        dispatch({ type: 'SET_OPERATION_ERROR', payload: null });
    }, []);

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
        clearLoadError,
        clearSyncError,
        clearOperationError,
    };

    return (
        <EmployeesContext.Provider value={contextValue}>
            {children}
        </EmployeesContext.Provider>
    );
};

export const useEmployees = (): EmployeesContextType => {
    const context = useContext(EmployeesContext);
    if (context === undefined) {
        throw new Error('useEmployees must be used within an EmployeesProvider');
    }
    return context;
};

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

export const useSyncStatus = (): EmployeesContextType['syncStatus'] => {
    const { syncStatus } = useEmployees();
    return syncStatus;
};
