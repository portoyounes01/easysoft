import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Employee } from '../types/supabase';

interface AuthState {
  user: User | null;
  employee: Employee | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  signInWithEmailAndPassword: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signInWithEmployeeCredentials: (employeeNumber: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  refreshEmployeeSession: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const SupabaseAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    employee: null,
    session: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });

  // Session persistence keys
  const EMPLOYEE_SESSION_KEY = 'employee_session';
  const EMPLOYEE_SESSION_TIMESTAMP_KEY = 'employee_session_timestamp';
  const SESSION_TIMEOUT = 8 * 60 * 60 * 1000; // 8 hours in milliseconds

  // Save employee session to localStorage
  const saveEmployeeSession = (employee: Employee) => {
    try {
      localStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(employee));
      localStorage.setItem(EMPLOYEE_SESSION_TIMESTAMP_KEY, Date.now().toString());
    } catch (error) {
      console.error('Error saving employee session:', error);
    }
  };

  // Load employee session from localStorage
  const loadEmployeeSession = (): Employee | null => {
    try {
      const sessionData = localStorage.getItem(EMPLOYEE_SESSION_KEY);
      const timestamp = localStorage.getItem(EMPLOYEE_SESSION_TIMESTAMP_KEY);

      if (!sessionData || !timestamp) {
        return null;
      }

      // Check if session has expired
      const sessionTime = parseInt(timestamp);
      const currentTime = Date.now();
      
      if (currentTime - sessionTime > SESSION_TIMEOUT) {
        // Session expired, clear it
        clearEmployeeSession();
        return null;
      }

      return JSON.parse(sessionData);
    } catch (error) {
      console.error('Error loading employee session:', error);
      clearEmployeeSession();
      return null;
    }
  };

  // Clear employee session from localStorage
  const clearEmployeeSession = () => {
    try {
      localStorage.removeItem(EMPLOYEE_SESSION_KEY);
      localStorage.removeItem(EMPLOYEE_SESSION_TIMESTAMP_KEY);
    } catch (error) {
      console.error('Error clearing employee session:', error);
    }
  };

  // Fetch employee data based on authenticated user
  const fetchEmployeeData = async (userId: string): Promise<Employee | null> => {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching employee data:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error fetching employee data:', error);
      return null;
    }
  };

  // Sign in with email and password (for Supabase Auth users)
  const signInWithEmailAndPassword = async (email: string, password: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setState(prev => ({ ...prev, isLoading: false, error: error.message }));
        return { success: false, error: error.message };
      }

      // Employee data will be fetched in the auth state change listener
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
      return { success: false, error: errorMessage };
    }
  };

  // Sign in with employee credentials (offline-first approach)
  const signInWithEmployeeCredentials = async (employeeNumber: string, password: string) => {
    console.log('🔍 signInWithEmployeeCredentials called with:', { employeeNumber, passwordLength: password.length });
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Use employeeService for offline-first employee lookup
      console.log('🔎 Searching for employee using employeeService...');
      const { employeeService } = await import('../services/employeeService');
      const employee = await employeeService.getEmployeeByNumber(employeeNumber);

      console.log('👤 Employee query result:', { employee: !!employee });
      if (employee) {
        console.log('📋 Found employee:', { id: employee.id, number: employee.employee_number, role: employee.role });
      }

      if (!employee || !employee.is_active) {
        console.log('❌ Employee not found or inactive');
        setState(prev => ({ ...prev, isLoading: false, error: 'Invalid employee number or account inactive' }));
        return { success: false, error: 'Invalid employee number or account inactive' };
      }

      // Verify credentials using proper hash comparison
      console.log('🔐 Starting credential verification...');
      console.log('Employee role:', employee.role);
      console.log('Has password_hash:', !!employee.password_hash);
      console.log('Has pin:', !!employee.pin);
      
      let isValidCredentials = false;

      if (employee.role === 'admin' || employee.role === 'manager') {
        // For admin/manager, check password_hash
        if (employee.password_hash) {
          console.log('🔑 Verifying password hash for admin/manager...');
          const { verifyPasswordHash } = await import('../utils/hashUtils');
          isValidCredentials = await verifyPasswordHash(password, employee.password_hash);
          console.log('Password verification result:', isValidCredentials);
        } else {
          console.log('❌ No password_hash found for admin/manager');
        }
      } else {
        // For other employees, check PIN
        if (employee.pin) {
          console.log('🔢 Verifying PIN for employee...');
          const { verifyPasswordHash } = await import('../utils/hashUtils');
          isValidCredentials = await verifyPasswordHash(password, employee.pin);
          console.log('PIN verification result:', isValidCredentials);
        } else {
          console.log('❌ No PIN found for employee');
        }
      }

      if (!isValidCredentials) {
        console.log('❌ Credential verification failed');
        setState(prev => ({ ...prev, isLoading: false, error: 'Invalid credentials' }));
        return { success: false, error: 'Invalid credentials' };
      }
      
      console.log('✅ Credentials verified successfully!');

      // Create a mock session for employee login and save it
      console.log('💾 Setting authentication state...');
      setState(prev => ({
        ...prev,
        user: null, // No Supabase user for employee login
        employee,
        session: null,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      }));

      // Save session for persistence across page reloads
      console.log('💾 Saving employee session to localStorage...');
      saveEmployeeSession(employee);
      console.log('🎉 Login process completed successfully!');

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.log('💥 Login exception:', error);
      setState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
      return { success: false, error: errorMessage };
    }
  };

  // Sign out
  const signOut = async () => {
    setState(prev => ({ ...prev, isLoading: true }));

    // Sign out from Supabase if there's a session
    if (state.session) {
      await supabase.auth.signOut();
    }

    // Clear employee session from localStorage
    clearEmployeeSession();

    // Clear local state
    setState({
      user: null,
      employee: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  };

  // Check permissions
  const hasPermission = (permission: string): boolean => {
    if (!state.employee) return false;
    if (state.employee.role === 'admin') return true;
    return state.employee.access_levels.includes(permission) || state.employee.access_levels.includes('all');
  };

  // Refresh employee session timestamp (keep session alive)
  const refreshEmployeeSession = () => {
    if (state.employee && !state.session) {
      // Only for employee sessions (not Supabase auth sessions)
      saveEmployeeSession(state.employee);
    }
  };

  // Clear error
  const clearError = () => {
    setState(prev => ({ ...prev, error: null }));
  };

  // Listen for auth state changes
  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_IN' && session) {
        // Fetch employee data for the authenticated user
        const employee = await fetchEmployeeData(session.user.id);
        
        setState({
          user: session.user,
          employee,
          session,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } else if (event === 'SIGNED_OUT') {
        setState({
          user: null,
          employee: null,
          session: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
      } else if (event === 'TOKEN_REFRESHED' && session) {
        setState(prev => ({
          ...prev,
          user: session.user,
          session,
        }));
      }
    });

    // Periodic session validation for employee sessions
    const sessionValidationInterval = setInterval(() => {
      if (state.employee && !state.session) {
        // This is an employee session, check if it's still valid
        const employeeSession = loadEmployeeSession();
        if (!employeeSession) {
          // Session expired, log out
          setState({
            user: null,
            employee: null,
            session: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        }
      }
    }, 60000); // Check every minute

    // Initial session check
    const initializeAuth = async () => {
      // First, check for Supabase auth session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        const employee = await fetchEmployeeData(session.user.id);
        setState({
          user: session.user,
          employee,
          session,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } else {
        // Check for employee session in localStorage
        const employeeSession = loadEmployeeSession();
        
        if (employeeSession) {
          setState({
            user: null,
            employee: employeeSession,
            session: null,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } else {
          setState(prev => ({ ...prev, isLoading: false }));
        }
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearInterval(sessionValidationInterval);
    };
  }, [state.employee, state.session]); // Add dependencies

  const value: AuthContextType = {
    ...state,
    signInWithEmailAndPassword,
    signInWithEmployeeCredentials,
    signOut,
    hasPermission,
    refreshEmployeeSession,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useSupabaseAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useSupabaseAuth must be used within a SupabaseAuthProvider');
  }
  return context;
};
