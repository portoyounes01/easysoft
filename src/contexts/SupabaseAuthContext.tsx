import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Employee, EmployeeLoginResult } from '../types/supabase';
import { hasEmployeePermission } from '../utils/accessPermissions';
import type { Principal, MembershipRole } from '../types/principal';
import { ROLE_CAPABILITIES, humanHasCapability } from '../utils/roleCapabilities';
import { isPwaHost } from '../lib/host';

// Keep the Realtime socket's auth token in lockstep with the session so the RLS-scoped
// notification channel authorizes as the signed-in user (setAuth is realtime-only — no
// PostgREST/getSession — so it's safe to call inside the auth-state callbacks that hold the
// auth lock). PWA host only: the till has no notification feed. On sign-out we pass no token
// (falls back to anon, which RLS denies — fail-closed) and drop every open channel.
// See docs/pwa-notifications-plan.md P3a Step 4.
function syncRealtimeAuth(session: Session | null): void {
  if (!isPwaHost) return;
  void supabase.realtime.setAuth(session?.access_token);
}
function clearRealtimeAuth(): void {
  if (!isPwaHost) return;
  void supabase.realtime.setAuth();
  supabase.removeAllChannels();
}

interface AuthState {
  user: User | null;
  employee: Employee | null;
  // Normalized identity for BOTH hosts. isAuthenticated keys on this, not on `employee`
  // (a PWA human has a principal but no employee row). See docs/pwa-p1-refactor-plan.md.
  principal: Principal | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  /** @deprecated unused (zero callers). Reviving email-employee login requires gating the
   *  human branch on the ABSENCE of an employees row, not app_role, to preserve operator
   *  attribution on the till. Prefer signInWithPwaCredentials for humans. */
  signInWithEmailAndPassword: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signInWithEmployeeCredentials: (employeeNumber: string, password: string) => Promise<{ success: boolean; error?: string }>;
  // PWA human login (username OR email + password) via the pwa-login edge fn.
  signInWithPwaCredentials: (identifier: string, password: string, tenantId?: string) => Promise<{ success: boolean; error?: string; memberships?: { tenant_id: string; role: string }[] }>;
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
    principal: null,
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

  // Till principal — derived from the resolved employee row. `employee` stays populated
  // for attribution; capabilities is unused here (hasPermission delegates to the employee).
  const deriveEmployeePrincipal = (employee: Employee, session: Session): Principal => {
    const meta = (session.user.app_metadata ?? {}) as Record<string, unknown>;
    const storeId = typeof meta.store_id === 'string' ? meta.store_id : null;
    return {
      source: 'employee',
      userId: session.user.id,
      displayName: employee.name,
      role: employee.role,
      tenantId: typeof meta.tenant_id === 'string' ? meta.tenant_id : null,
      storeIds: storeId ? [storeId] : [],
      capabilities: new Set<string>(),
    };
  };

  // PWA human principal — PURE + SYNCHRONOUS (reads only app_metadata already in memory;
  // no PostgREST/getSession, so it can run inside the SIGNED_IN callback without deadlock).
  // Returns null unless the JWT carries a human app_role + tenant_id — so a 'device' or
  // claim-less session NEVER becomes a human principal (this is what makes the
  // TOKEN_REFRESHED fallback safe on the till).
  const deriveMembershipPrincipal = (session: Session): Principal | null => {
    const meta = (session.user.app_metadata ?? {}) as Record<string, unknown>;
    const role = typeof meta.app_role === 'string' ? meta.app_role : '';
    const tenantId = typeof meta.tenant_id === 'string' ? meta.tenant_id : '';
    if (!tenantId || !(role === 'owner' || role === 'admin' || role === 'manager')) return null;
    const storeIds = Array.isArray(meta.store_ids)
      ? (meta.store_ids as unknown[]).filter((s): s is string => typeof s === 'string')
      : [];
    return {
      source: 'membership',
      userId: session.user.id,
      displayName: session.user.email ?? '',
      role,
      tenantId,
      storeIds,
      capabilities: ROLE_CAPABILITIES[role as MembershipRole] ?? new Set<string>(),
    };
  };

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
        principal: deriveEmployeePrincipal(employee, deviceSession),
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

  // PWA human login: resolve username-OR-email + password server-side via the pwa-login
  // edge fn, then set the returned session (which fires SIGNED_IN -> membership principal).
  const signInWithPwaCredentials = async (identifier: string, password: string, tenantId?: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      if (!isSupabaseConfigured()) {
        const msg = 'Supabase is not configured.';
        setState(prev => ({ ...prev, isLoading: false, error: msg }));
        return { success: false, error: msg };
      }
      const url = import.meta.env.VITE_SUPABASE_URL as string;
      const anon = import.meta.env.VITE_SUPABASE_ANON as string;
      const res = await fetch(`${url}/functions/v1/pwa-login`, {
        method: 'POST',
        headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, ...(tenantId ? { tenant_id: tenantId } : {}) }),
      });
      const body = await res.json().catch(() => ({} as Record<string, unknown>));

      // multi-tenant: no session yet — the UI must let the user pick a tenant, then re-call.
      if (body?.status === 'select_tenant') {
        setState(prev => ({ ...prev, isLoading: false }));
        return { success: false, memberships: body.memberships as { tenant_id: string; role: string }[] };
      }
      // success: set the session; SIGNED_IN derives the membership principal synchronously.
      if (body?.status === 'ok' && body?.session?.access_token) {
        await supabase.auth.setSession({
          access_token: body.session.access_token,
          refresh_token: body.session.refresh_token,
        });
        return { success: true };
      }
      // errors — keep them friendly + generic (no enumeration signal).
      const msg = res.status === 401
        ? 'Invalid username/email or password.'
        : (body?.error === 'no_membership' || body?.error === 'not_a_member')
          ? 'This account has no access to a workspace.'
          : (typeof body?.error === 'string' ? body.error : 'Login failed.');
      setState(prev => ({ ...prev, isLoading: false, error: msg }));
      return { success: false, error: msg };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Login failed.';
      setState(prev => ({ ...prev, isLoading: false, error: msg }));
      return { success: false, error: msg };
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
      principal: null,
      session: isDeviceSession ? state.session : null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  };

  // Check permissions — membership humans use the role→capability map; the till path
  // (employee, or a bare device session with principal null) is unchanged.
  const hasPermission = (permission: string): boolean => {
    if (state.principal?.source === 'membership') {
      return humanHasCapability(state.principal.role, permission);
    }
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
        const appRole = session.user.app_metadata?.app_role;
        if (appRole === 'owner' || appRole === 'admin' || appRole === 'manager') {
          // PWA human: derive the principal SYNCHRONOUSLY from app_metadata (no PostgREST,
          // so no deadlock, no employees read — a human has no employee row).
          const principal = deriveMembershipPrincipal(session);
          setState({
            user: session.user,
            employee: null,
            principal,
            session,
            isAuthenticated: !!principal,
            isLoading: false,
            error: null,
          });
          syncRealtimeAuth(session);
        } else {
          // Device/undefined: defer the employee lookup outside this callback.
          // fetchEmployeeData issues a PostgREST query whose internal getSession() would
          // deadlock against the auth lock held while this SIGNED_IN callback runs (e.g.
          // right after setSession during device pairing). setTimeout(0) runs it after the
          // lock releases. isAuthenticated gates on a resolved PRINCIPAL: a bare device
          // session (no employee yet) stays on the login screen.
          setTimeout(async () => {
            if (!mounted) return;
            const employee = await fetchEmployeeData(session);
            const principal = employee ? deriveEmployeePrincipal(employee, session) : null;
            setState({
              user: session.user,
              employee,
              principal,
              session,
              isAuthenticated: !!principal,
              isLoading: false,
              error: null,
            });
          }, 0);
        }
      } else if (event === 'SIGNED_OUT') {
        setState({
          user: null,
          employee: null,
          principal: null,
          session: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
        clearRealtimeAuth();
      } else if (event === 'TOKEN_REFRESHED' && session) {
        // SAFETY-CRITICAL: isAuthenticated now keys on principal, and the till's ~hourly
        // device token refresh arrives here. deriveMembershipPrincipal returns null for a
        // device session, so fall back to prev.principal (the employee-derived one) and
        // keep ...prev — never null the till's principal / isAuthenticated mid-shift. For a
        // human switch-tenant refresh, the fresh app_metadata yields a new membership
        // principal (active tenant updates). Do NOT recompute isAuthenticated here.
        setState(prev => ({
          ...prev,
          user: session.user,
          session,
          principal: deriveMembershipPrincipal(session) ?? prev.principal,
        }));
        syncRealtimeAuth(session);
      }
    });

    // Periodic session validation for employee sessions
    const sessionValidationInterval = setInterval(() => {
      const employeeSession = loadEmployeeSession();
      if (!employeeSession) {
        // Only affects the till (employee) path — a human has no localStorage employee
        // session, so prev.employee is null and this is a no-op for them.
        setState(prev => prev.employee ? {
          ...prev,
          employee: null,
          principal: null,
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
        const appRole = session.user.app_metadata?.app_role;
        if (appRole === 'owner' || appRole === 'admin' || appRole === 'manager') {
          // Human reload: derive synchronously; skip the employees read (returns null anyway).
          const principal = deriveMembershipPrincipal(session);
          setState({
            user: session.user,
            employee: null,
            principal,
            session,
            isAuthenticated: !!principal,
            isLoading: false,
            error: null,
          });
          syncRealtimeAuth(session);
        } else {
          const employee = await fetchEmployeeData(session);
          const principal = employee ? deriveEmployeePrincipal(employee, session) : null;
          setState({
            user: session.user,
            employee,
            principal,
            session,
            // A device session with no employee is "paired but not signed in" -> stay on login.
            isAuthenticated: !!principal,
            isLoading: false,
            error: null,
          });
        }
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
    signInWithPwaCredentials,
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
