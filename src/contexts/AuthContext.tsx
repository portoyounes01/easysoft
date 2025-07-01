import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { Employee } from '../types';

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

// Mock employee data
const mockEmployees: Employee[] = [
  {
    id: '1',
    employeeNumber: 'EMP001',
    name: 'Admin User',
    role: 'admin',
    email: 'admin@pos.com',
    phone: '+351 123 456 789',
    isActive: true,
    hireDate: '2024-01-01',
    accessLevels: ['all'],
    performance: {
      totalSales: 15420.50,
      transactionCount: 89,
      averageTransaction: 173.26
    },
    loginHistory: []
  },
  {
    id: '2',
    employeeNumber: 'EMP002',
    name: 'Manager Silva',
    role: 'manager',
    email: 'manager@pos.com',
    phone: '+351 123 456 788',
    isActive: true,
    hireDate: '2024-02-01',
    accessLevels: ['sales', 'inventory', 'reports'],
    performance: {
      totalSales: 12350.75,
      transactionCount: 67,
      averageTransaction: 184.34
    },
    loginHistory: []
  }
];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    isAuthenticated: false,
    isLoading: true
  });

  const login = async (employeeNumber: string, password: string): Promise<boolean> => {
    dispatch({ type: 'LOGIN_START' });
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const employee = mockEmployees.find(emp => emp.employeeNumber === employeeNumber);
    
    if (employee && password === 'password') {
      dispatch({ type: 'LOGIN_SUCCESS', payload: employee });
      localStorage.setItem('pos_user', JSON.stringify(employee));
      return true;
    } else {
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
    return state.user.accessLevels.includes(permission) || state.user.accessLevels.includes('all');
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