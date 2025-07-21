import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { Employee } from '../types/supabase';
import { useEmployees } from './EmployeesContext';

interface AuthState {
  user: Employee | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (employeeNumber: string, password: string) => Promise<boolean>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: Employee }
  | { type: 'LOGIN_FAILURE' }
  | { type: 'LOGOUT' }
  | { type: 'INIT_COMPLETE' };

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, isLoading: true };
    case 'LOGIN_SUCCESS':
      return { user: action.payload, isAuthenticated: true, isLoading: false };
    case 'LOGIN_FAILURE':
      return { user: null, isAuthenticated: false, isLoading: false };
    case 'LOGOUT':
      return { user: null, isAuthenticated: false, isLoading: false };
    case 'INIT_COMPLETE':
      return { ...state, isLoading: false };
    default:
      return state;
  }
};

// Hash password function (matching the one in employeeService)
const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    isAuthenticated: false,
    isLoading: true
  });

  // Access the employees context
  const employeesContext = useEmployees();

  const login = async (employeeNumber: string, password: string): Promise<boolean> => {
    dispatch({ type: 'LOGIN_START' });

    try {
      // Wait for employees to be loaded
      if (employeesContext.isLoading) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Find the employee by employee number
      const employee = employeesContext.employees.find(emp => emp.employee_number === employeeNumber);

      if (!employee) {
        dispatch({ type: 'LOGIN_FAILURE' });
        return false;
      }

      // Check if employee is active
      if (!employee.is_active) {
        dispatch({ type: 'LOGIN_FAILURE' });
        return false;
      }

      let isValidCredentials = false;

      // Admin uses password, employees use PIN
      if (employee.role === 'admin') {
        // Hash the provided password and compare with stored hash
        const hashedPassword = await hashPassword(password);
        // Temporary fix for demo: if stored hash is the dummy hash, use the correct SHA-256 hash
        const correctPasswordHash = '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8';

        if (employee.password_hash === '$2b$10$dummy_hash_for_password') {
          // Demo admin - compare with correct SHA-256 hash
          isValidCredentials = hashedPassword === correctPasswordHash;
        } else {
          // Production - use stored hash
          isValidCredentials = hashedPassword === employee.password_hash;
        }
      } else {
        // Employees (cashier, manager) use PIN
        isValidCredentials = password === employee.pin;
      }

      if (isValidCredentials) {
        dispatch({ type: 'LOGIN_SUCCESS', payload: employee });
        localStorage.setItem('pos_user', JSON.stringify(employee));
        return true;
      }

      dispatch({ type: 'LOGIN_FAILURE' });
      return false;
    } catch (error) {
      console.error('Login error:', error);
      dispatch({ type: 'LOGIN_FAILURE' });
      return false;
    }
  };

  const logout = () => {
    dispatch({ type: 'LOGOUT' });
    localStorage.removeItem('pos_user');
  };

  const hasPermission = (permission: string): boolean => {
    if (!state.user) return false;
    if (state.user.role === 'admin') return true;
    return state.user.access_levels.includes(permission) || state.user.access_levels.includes('all');
  };

  useEffect(() => {
    const initAuth = () => {
      const storedUser = localStorage.getItem('pos_user');
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          dispatch({ type: 'LOGIN_SUCCESS', payload: user });
        } catch (error) {
          localStorage.removeItem('pos_user');
          dispatch({ type: 'INIT_COMPLETE' });
        }
      } else {
        dispatch({ type: 'INIT_COMPLETE' });
      }
    };

    initAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};