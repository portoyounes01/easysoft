import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, connectionStatus, isSupabaseConfigured } from '../lib/supabase';
import { Employee } from '../types/supabase';
import { hasEmployeePermission } from '../utils/accessPermissions';

interface AuthState {
  user: User | null;
  employee: Employee | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  credentialHash?: string | null; // ephemeral hash of PIN/password for edge function proofs
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
    credentialHash: null,
  });

  // Session persistence keys
  const EMPLOYEE_SESSION_KEY = 'employee_session';
  const EMPLOYEE_SESSION_TIMESTAMP_KEY = 'employee_session_timestamp';
  const EMPLOYEE_CREDENTIAL_HASH_KEY = 'employee_credential_hash';
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

  // Save credential hash (PIN/password hash) for edge-function proofs (never store plaintext)
  const saveCredentialHash = (hash: string | null) => {
    try {
      if (hash) {
        localStorage.setItem(EMPLOYEE_CREDENTIAL_HASH_KEY, hash);
      } else {
        localStorage.removeItem(EMPLOYEE_CREDENTIAL_HASH_KEY);
      }
    } catch (error) {
      console.error('Error saving credential hash:', error);
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
      localStorage.removeItem(EMPLOYEE_CREDENTIAL_HASH_KEY);
    } catch (error) {
      console.error('Error clearing employee session:', error);
    }
  };

  // Fetch employee data based on authenticated user
  const fetchEmployeeData = async (userId: string): Promise<Employee | null> => {
    try {
      // maybeSingle (not single): a session whose user is NOT an employee — e.g. a bare
      // device session between pairing and PIN login — legitimately matches 0 rows. single()
      // would 406/PGRST116 and log a spurious error on that normal path.
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

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
      const { verifyPasswordHash } = await import('../utils/hashUtils');

      if (employee.role === 'admin') {
        // Admins use password_hash only (form collects password, not PIN)
        if (employee.password_hash) {
          console.log('🔑 Verifying password hash for admin...');
          isValidCredentials = await verifyPasswordHash(password, employee.password_hash);
          console.log('Password verification result:', isValidCredentials);
        } else {
          console.log('❌ No password_hash found for admin');
        }
      } else if (employee.role === 'manager') {
        // Managers: password if set; otherwise PIN (UI only collects PIN for non-admin roles)
        if (employee.password_hash) {
          console.log('🔑 Verifying password hash for manager...');
          isValidCredentials = await verifyPasswordHash(password, employee.password_hash);
          console.log('Password verification result:', isValidCredentials);
        } else if (employee.pin) {
          console.log('🔢 Verifying PIN for manager (no password_hash)...');
          isValidCredentials = await verifyPasswordHash(password, employee.pin);
          console.log('PIN verification result:', isValidCredentials);
        } else {
          console.log('❌ Manager has neither password_hash nor pin');
        }
      } else {
        // Cashier / trainee / etc. — PIN
        if (employee.pin) {
          console.log('🔢 Verifying PIN for employee...');
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

      // 🌐 Ensure the employee record is synchronized with the server before proceeding.
      //    This avoids foreign-key errors (e.g., when creating transactions) if the local
      //    employee has not yet been pushed to Supabase.
      if (connectionStatus.getStatus().isSupabaseOnline) {
        try {
          console.log('🔄 Performing employee forceSync to ensure server record…');
          await employeeService.forceSync();
        } catch (syncError) {
          console.warn('⚠️  Employee sync failed (continuing anyway):', syncError);
        }
      }

      console.log('✅ Credentials verified successfully!');

      // If employee has inventory access and has a linked auth_id, also sign in with Supabase
      let supabaseUser = null;
      let supabaseSession = null;

      if (employee.access_levels.includes('inventory') || employee.access_levels.includes('all')) {
        console.log('📧 Employee has inventory access, checking for Supabase auth...');
        const isOnline = connectionStatus.getStatus().isSupabaseOnline;
        const isConfigured = isSupabaseConfigured();
        const hasAuthLink = Boolean((employee as any).auth_id); // optional field

        if (!isConfigured) {
          console.log('ℹ️  Skipping Supabase auth: not configured');
        } else if (!isOnline) {
          console.log('ℹ️  Skipping Supabase auth: Supabase appears offline');
        } else if (!hasAuthLink) {
          console.log('ℹ️  Skipping Supabase auth: employee not provisioned (no auth_id)');
        } else if (employee.email) {
          try {
            console.log('🔐 Attempting Supabase authentication...');
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
              email: employee.email,
              password: password
            });

            if (!authError && authData.user) {
              console.log('✅ Supabase authentication successful');
              supabaseUser = authData.user;
              supabaseSession = authData.session;
            } else {
              console.log('⚠️ Supabase authentication failed, but continuing with employee auth:', authError?.message);
            }
          } catch (supabaseError) {
            console.log('⚠️ Supabase authentication error, continuing with employee auth:', supabaseError);
          }
        } else {
          console.log('⚠️ Employee has inventory access but no email configured for Supabase auth');
        }
      }

      // Create a session for employee login and save it
      console.log('💾 Setting authentication state...');
      // Compute credential hash equal to stored hash to avoid sending raw pin/password later
      let credentialHash: string | null = null;
      try {
        const { hashPassword } = await import('../utils/hashUtils');
        if (employee.role === 'admin') {
          credentialHash = employee.password_hash ?? (await hashPassword(password));
        } else if (employee.role === 'manager') {
          credentialHash = employee.password_hash ?? employee.pin ?? (await hashPassword(password));
        } else {
          credentialHash = employee.pin ?? (await hashPassword(password));
        }
      } catch (e) {
        console.warn('Failed to compute credential hash, proceeding without it');
      }

      setState(prev => ({
        ...prev,
        user: supabaseUser, // Include Supabase user if authenticated
        employee,
        session: supabaseSession, // Include Supabase session if available
        isAuthenticated: true,
        isLoading: false,
        error: null,
        credentialHash,
      }));

      // Save session for persistence across page reloads
      console.log('💾 Saving employee session to localStorage...');
      saveEmployeeSession(employee);
      saveCredentialHash(credentialHash);
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
    return hasEmployeePermission(state.employee, permission);
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
          const employee = await fetchEmployeeData(session.user.id);
          setState({
            user: session.user,
            employee,
            session,
            isAuthenticated: !!employee,
            isLoading: false,
            error: null,
            credentialHash: null,
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
            credentialHash: null,
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
          // A device session with no employee is "paired but not signed in" -> stay on login.
          isAuthenticated: !!employee,
          isLoading: false,
          error: null,
          credentialHash: null,
        });
      } else {
        // Check for employee session in localStorage
        const employeeSession = loadEmployeeSession();

        if (employeeSession) {
          // Load saved credential hash for PIN/password proof
          let savedHash: string | null = null;
          try {
            savedHash = localStorage.getItem(EMPLOYEE_CREDENTIAL_HASH_KEY);
          } catch (e) {
            savedHash = null;
          }
          setState({
            user: null,
            employee: employeeSession,
            session: null,
            isAuthenticated: true,
            isLoading: false,
            error: null,
            credentialHash: savedHash,
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
