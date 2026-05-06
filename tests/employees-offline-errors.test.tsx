import { describe, it, expect } from 'vitest';
import { employeesReducer } from '../src/contexts/EmployeesContext';
import type { Employee } from '../src/types/supabase';

const baseState = {
    employees: [] as Employee[],
    isLoading: false,
    loadError: null as string | null,
    syncError: null as string | null,
    operationError: null as string | null,
    syncStatus: null,
    lastUpdated: null as Date | null,
};

describe('employeesReducer offline / sync semantics', () => {
    it('SET_SYNC_ERROR does not set loadError', () => {
        const after = employeesReducer(baseState, { type: 'SET_SYNC_ERROR', payload: 'Sync failed: network' });
        expect(after.syncError).toBe('Sync failed: network');
        expect(after.loadError).toBeNull();
    });

    it('SET_LOAD_ERROR sets loadError and clears loading', () => {
        const loading = { ...baseState, isLoading: true };
        const after = employeesReducer(loading, { type: 'SET_LOAD_ERROR', payload: 'IndexedDB unavailable' });
        expect(after.loadError).toBe('IndexedDB unavailable');
        expect(after.isLoading).toBe(false);
    });

    it('SET_LOAD_ERROR null does not clear isLoading (retry start: loading then clear error)', () => {
        let s = employeesReducer(baseState, { type: 'SET_LOADING', payload: true });
        expect(s.isLoading).toBe(true);
        s = employeesReducer(s, { type: 'SET_LOAD_ERROR', payload: null });
        expect(s.loadError).toBeNull();
        expect(s.isLoading).toBe(true);
    });

    it('SET_EMPLOYEES clears loadError', () => {
        const withLoadErr = { ...baseState, loadError: 'bad', isLoading: true };
        const after = employeesReducer(withLoadErr, { type: 'SET_EMPLOYEES', payload: [] });
        expect(after.loadError).toBeNull();
        expect(after.isLoading).toBe(false);
    });
});
