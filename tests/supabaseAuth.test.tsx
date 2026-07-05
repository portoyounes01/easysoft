import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { SupabaseAuthProvider, useSupabaseAuth } from '../src/contexts/SupabaseAuthContext';
import type { Employee } from '../src/types/supabase';

const mocks = vi.hoisted(() => ({
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signOut: vi.fn(),
    rpc: vi.fn(),
    from: vi.fn(),
    getEmployeeById: vi.fn(),
}));

vi.mock('../src/lib/supabase', () => ({
    isSupabaseConfigured: () => true,
    supabase: {
        auth: {
            getSession: mocks.getSession,
            onAuthStateChange: mocks.onAuthStateChange,
            signInWithPassword: vi.fn(),
            signOut: mocks.signOut,
        },
        rpc: mocks.rpc,
        from: mocks.from,
    },
}));

vi.mock('../src/services/employeeService', () => ({
    employeeService: {
        getEmployeeById: mocks.getEmployeeById,
    },
}));

const deviceSession = {
    access_token: 'device-access-token',
    refresh_token: 'device-refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
        id: 'device-user-1',
        app_metadata: {
            tenant_id: 'tenant-1',
            store_id: 'store-1',
            device_id: 'device-1',
            app_role: 'device',
        },
        user_metadata: {},
        aud: 'authenticated',
        created_at: '2026-07-05T00:00:00.000Z',
    },
} as Session;

const rosterEmployee: Employee = {
    id: 'employee-1',
    tenant_id: 'tenant-1',
    employee_number: 'EMP001',
    name: 'Cashier',
    email: null,
    phone: null,
    password_hash: 'legacy-password-hash-must-not-survive',
    pin: 'legacy-pin-hash-must-not-survive',
    role: 'cashier',
    access_levels: ['sales'],
    is_active: true,
    hire_date: '2026-01-01',
    total_sales: 0,
    transaction_count: 0,
    average_transaction: 0,
    hours_worked: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    last_synced_at: null,
    deleted_at: null,
};

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <SupabaseAuthProvider>{children}</SupabaseAuthProvider>
);

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.getSession.mockResolvedValue({ data: { session: deviceSession } });
    mocks.onAuthStateChange.mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
    });
    mocks.getEmployeeById.mockResolvedValue(rosterEmployee);
});

describe('SupabaseAuthContext employee PIN login', () => {
    it('verifies credentials with employee_pin_login under the device session', async () => {
        mocks.rpc.mockResolvedValue({
            data: [{
                employee_id: rosterEmployee.id,
                employee_number: rosterEmployee.employee_number,
                name: rosterEmployee.name,
                role: rosterEmployee.role,
                success: true,
                error: null,
            }],
            error: null,
        });
        const { result } = renderHook(() => useSupabaseAuth(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            const login = await result.current.signInWithEmployeeCredentials('EMP001', '1234');
            expect(login.success).toBe(true);
        });

        expect(mocks.rpc).toHaveBeenCalledWith('employee_pin_login', {
            p_employee_number: 'EMP001',
            p_secret: '1234',
        });
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.session).toBe(deviceSession);
        expect(result.current.employee?.pin).toBeNull();
        expect(result.current.employee?.password_hash).toBeNull();
        expect(localStorage.getItem('employee_credential_hash')).toBeNull();
    });

    it('keeps the operator signed out when the RPC rejects credentials', async () => {
        mocks.rpc.mockResolvedValue({
            data: [{
                employee_id: null,
                employee_number: null,
                name: null,
                role: null,
                success: false,
                error: 'invalid_credentials',
            }],
            error: null,
        });
        const { result } = renderHook(() => useSupabaseAuth(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            const login = await result.current.signInWithEmployeeCredentials('EMP001', 'wrong');
            expect(login.success).toBe(false);
        });

        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.error).toBe('Invalid employee number or credentials.');
    });

    it('surfaces a PostgREST RPC error message', async () => {
        mocks.rpc.mockResolvedValue({
            data: null,
            error: { message: 'column reference employee_id is ambiguous' },
        });
        const { result } = renderHook(() => useSupabaseAuth(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            const login = await result.current.signInWithEmployeeCredentials('EMP001', '1234');
            expect(login.success).toBe(false);
        });

        expect(result.current.error).toBe('column reference employee_id is ambiguous');
    });

    it('falls back to the server roster when the fresh local cache read fails', async () => {
        mocks.rpc.mockImplementation((functionName: string) => {
            if (functionName === 'get_employee_profile') {
                return Promise.resolve({ data: [rosterEmployee], error: null });
            }
            return Promise.resolve({
                data: [{
                    employee_id: rosterEmployee.id,
                    employee_number: rosterEmployee.employee_number,
                    name: rosterEmployee.name,
                    role: rosterEmployee.role,
                    success: true,
                    error: null,
                }],
                error: null,
            });
        });
        mocks.getEmployeeById.mockRejectedValue(new Error('Dexie cache unavailable'));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const { result } = renderHook(() => useSupabaseAuth(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            const login = await result.current.signInWithEmployeeCredentials('EMP001', '1234');
            expect(login.success).toBe(true);
        });

        expect(mocks.rpc).toHaveBeenCalledWith('get_employee_profile', {
            p_employee_id: rosterEmployee.id,
        });
        expect(result.current.employee?.id).toBe(rosterEmployee.id);
        expect(result.current.employee?.pin).toBeNull();
        warn.mockRestore();
    });

    it('refuses employee login without a paired device session', async () => {
        mocks.getSession.mockResolvedValue({ data: { session: null } });
        const { result } = renderHook(() => useSupabaseAuth(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            const login = await result.current.signInWithEmployeeCredentials('EMP001', '1234');
            expect(login.success).toBe(false);
        });

        expect(mocks.rpc).not.toHaveBeenCalled();
        expect(result.current.error).toContain('not paired');
    });

    it('logs out the employee without discarding the paired device session', async () => {
        mocks.rpc.mockResolvedValue({
            data: [{
                employee_id: rosterEmployee.id,
                employee_number: rosterEmployee.employee_number,
                name: rosterEmployee.name,
                role: rosterEmployee.role,
                success: true,
                error: null,
            }],
            error: null,
        });
        const { result } = renderHook(() => useSupabaseAuth(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await act(async () => {
            await result.current.signInWithEmployeeCredentials('EMP001', '1234');
            await result.current.signOut();
        });

        expect(mocks.signOut).not.toHaveBeenCalled();
        expect(result.current.employee).toBeNull();
        expect(result.current.session).toBe(deviceSession);
        expect(result.current.isAuthenticated).toBe(false);
    });
});
