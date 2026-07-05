import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Employee, EmployeeLoginResult } from '../types/supabase';
import { hasEmployeePermission } from '../utils/accessPermissions';

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
      // Remove hashes persisted by pre-Phase-2 builds.
      localStorage.removeItem('employee_credential_hash');
    } catch (error) {
      console.error('Error clearing employee session:', error);
    }
  };

  const sanitizeEmployee = (employee: Employee): Employee => ({
    ...employee,
    password_hash: null,
    pin: null,
  });

  const fetchEmployeeDataForId = async (session: Session, employeeId: string): Promise<Employee | null> => {
    try {
      const tenantId = session.user.app_metadata.tenant_id;
      if (typeof tenantId !== 'string' || !tenantId) return null;
      const { data, error } = await supabase.rpc('get_employee_profile', {
        p_employee_id: employeeId,
      });

      if (error) {
        console.error('Error fetching employee data:', error);
        return null;
      }

      const employee = (data as Employee[] | null)?.[0];
      return employee ? sanitizeEmployee(employee) : null;
    } catch (error) {
      console.error('Error fetching employee data:', error);
      return null;
    }
  };

  // Resolve operator attribution under the authenticated tenant principal.
  const fetchEmployeeData = async (session: Session): Promise<Employee | null> => {
    const appRole = session.user.app_metadata.app_role;
    if (appRole === 'device') {
      const savedEmployee = loadEmployeeSession();
      return savedEmployee ? fetchEmployeeDataForId(session, savedEmployee.id) : null;
    }

    const tenantId = session.user.app_metadata.tenant_id;
    if (typeof tenantId !== 'string' || !tenantId) return null;
    try {
      const employeeSelect = [
        'id', 'tenant_id', 'employee_number', 'name', 'email', 'phone', 'role',
        'access_levels', 'is_active', 'hire_date', 'total_sales', 'transaction_count',
        'average_transaction', 'hours_worked', 'auth_id', 'created_at', 'updated_at',
        'last_synced_at', 'deleted_at',
      ].join(',');
      const { data, error } = await supabase
        .from('employees')
        .select(employeeSelect)
        .eq('tenant_id', tenantId)
        .eq('auth_id', session.user.id)
        .maybeSingle();
      if (error) {
        console.error('Error fetching employee data:', error);
        return null;
      }
      return data ? sanitizeEmployee(data as Employee) : null;
    } catch (error) {
      console.error('Error fetching employee data:', error);
      return null;
    }
  };

  // Sign in with email and password (for Supabase Auth users)
  const signInWithEmailAndPassword = async (email: string, password: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Guard: only attempt Supabase auth when properly configured
      if (!isSupabaseConfigured()) {
        const msg = 'Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON.';
        setState(prev => ({ ...prev, isLoading: false, error: msg }));
        return { success: false, error: msg };
      }
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

  // Employee credentials are verified server-side under the paired device JWT.
  const signInWithEmployeeCredentials = async (employeeNumber: string, password: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      if (!isSupabaseConfigured()) {
        throw new Error('Supabase is not configured. Device pairing and online login are required.');
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const deviceSession = sessionData.session;
      if (!deviceSession || deviceSession.user.app_metadata.app_role !== 'device') {
        throw new Error('This till is not paired. Pair the device before employee login.');
      }

      const { data, error } = await supabase.rpc('employee_pin_login', {
        p_employee_number: employeeNumber,
        p_secret: password,
      });
      if (error) throw new Error(error.message || 'Employee credential verification failed.');

      const loginResult = (data as EmployeeLoginResult[] | null)?.[0];
      if (!loginResult?.success || !loginResult.employee_id) {
        const message = loginResult?.error === 'locked'
          ? 'Too many failed attempts. Try again in 15 minutes.'
          : 'Invalid employee number or credentials.';
        setState(prev => ({ ...prev, isLoading: false, error: message }));
        return { success: false, error: message };
      }

      const { employeeService } = await import('../services/employeeService');
      // A freshly paired till may still be opening/hydrating its Dexie cache. A
      // local read failure must not discard a credential result already verified
      // by the server; fall back to the tenant-scoped roster row instead.
      let localEmployee: Employee | null = null;
      try {
        localEmployee = await employeeService.getEmployeeById(loginResult.employee_id);
      } catch (localError) {
        console.warn('Local employee cache unavailable during login; using server roster.', localError);
      }
      const employee = localEmployee
        ? sanitizeEmployee(localEmployee)
        : await fetchEmployeeDataForId(deviceSession, loginResult.employee_id);
      if (!employee || !employee.is_active) {
        throw new Error('Employee roster is out of date. Sync this till and try again.');
      }

      setState(prev => ({
        ...prev,
        user: deviceSession.user,
        employee,
        session: deviceSession,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      }));
      saveEmployeeSession(employee);

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
      return { success: false, error: errorMessage };
    }
  };

  // Sign out
  const signOut = async () => {
    setState(prev => ({ ...prev, isLoading: true }));

    const isDeviceSession = state.session?.user.app_metadata.app_role === 'device';
    if (state.session && !isDeviceSession) {
      await supabase.auth.signOut();
    }

    // Clear employee session from localStorage
    clearEmployeeSession();

    // Clear local state
    setState({
      user: isDeviceSession ? state.session?.user ?? null : null,
      employee: null,
      session: isDeviceSession ? state.session : null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  };

  // Check permissions
  const hasPermission = (permission: string): boolean => {
    return hasEmployeePermission(state.employee, permission);
  };

  // Refresh employee session timestamp (keep session alive)
  const refreshEmployeeSession = () => {
    if (state.employee) {
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
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_IN' && session) {
        // Defer the employee lookup outside this callback. fetchEmployeeData issues a
        // PostgREST query that internally calls supabase.auth.getSession() to attach the
        // token; getSession would deadlock against the auth lock held while this SIGNED_IN
        // callback runs (e.g. immediately after setSession during device pairing).
        // setTimeout(0) runs it after the lock is released.
        // isAuthenticated is gated on resolving an EMPLOYEE: a bare device session (no
        // employee yet) must leave the app on the login screen, not count as logged-in.
        setTimeout(async () => {
          if (!mounted) return;
          const employee = await fetchEmployeeData(session);
          setState({
            user: session.user,
            employee,
            session,
            isAuthenticated: !!employee,
            isLoading: false,
            error: null,
          });
        }, 0);
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
      const employeeSession = loadEmployeeSession();
      if (!employeeSession) {
        setState(prev => prev.employee ? {
          ...prev,
          employee: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        } : prev);
      }
    }, 60000); // Check every minute

    // Initial session check
    const initializeAuth = async () => {
      // First, check for Supabase auth session
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        const employee = await fetchEmployeeData(session);
        setState({
          user: session.user,
          employee,
          session,
          // A device session with no employee is "paired but not signed in" -> stay on login.
          isAuthenticated: !!employee,
          isLoading: false,
          error: null,
        });
      } else {
        clearEmployeeSession();
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearInterval(sessionValidationInterval);
    };
    // Auth subscription owns subsequent session changes; recreating it on each
    // employee state change races the post-PIN attribution update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
