// Regression test for the boundary that broke the whole fallback in practice.
//
// `classifyFiscalIssueFailure` worked, the dialog worked, the slip worked — but
// `processTransaction` wrapped every error in a plain `new Error(...)` on the
// way out, so by the time POS.tsx tried to classify it the type was gone. The
// operator saw "Transaction failed: Fiskaly is set as the fiscal issuer…" and
// was never offered the paper-invoice fallback.
//
// Unit tests of the classifier could not catch this: the defect lives in the
// hand-off between two modules that were each correct on their own.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { POSProvider, usePOS } from '../src/contexts/POSContext';
import { FiscalBackendUnavailableError, classifyFiscalIssueFailure } from '../src/fiscal/fiscalFailure';
import type { SystemSettings } from '../src/contexts/SettingsContext';

const runFiscalCheckout = vi.fn();

vi.mock('../src/fiscal/checkoutOrchestrator', () => ({
    runFiscalCheckout: (...args: unknown[]) => runFiscalCheckout(...args),
}));

vi.mock('../src/lib/supabase', () => ({
    supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } },
    isSupabaseConfigured: vi.fn(() => true),
    connectionStatus: {
        getStatus: vi.fn(() => ({ isOnline: false, isSupabaseOnline: false })),
        addListener: vi.fn(),
        removeListener: vi.fn(),
    },
}));

const payment = {
    paymentMethod: 'cash' as const,
    amountPaid: 5,
    employeeId: 'emp-1',
    employeeName: 'Ana',
};

/** Only the fields the fiscal branch of processTransaction touches. */
const fiscalContext = {
    settings: {
        fiscal: { issuer: 'fiskaly', trainingMode: true },
        receipt: { seriesProfiles: {} },
    } as unknown as SystemSettings,
    updateSettings: vi.fn(),
};

/** Drives processTransaction once and hands the thrown value back. */
const Harness: React.FC<{ onResult: (thrown: unknown) => void }> = ({ onResult }) => {
    const { processTransaction } = usePOS();
    React.useEffect(() => {
        void processTransaction(
            payment,
            undefined,
            undefined,
            fiscalContext,
            undefined,
            // An override cart keeps the test off the live POS cart.
            { cart: [], customer: null }
        )
            .then(() => onResult(null))
            .catch(onResult);
    }, []);
    return null;
};

const thrownFromCheckout = async (): Promise<unknown> => {
    let thrown: unknown;
    let settled = false;
    render(
        <POSProvider>
            <Harness
                onResult={value => {
                    thrown = value;
                    settled = true;
                }}
            />
        </POSProvider>
    );
    await waitFor(() => expect(settled).toBe(true));
    return thrown;
};

beforeEach(() => {
    runFiscalCheckout.mockReset();
});

describe('a classified fiscal failure crossing processTransaction', () => {
    it('reaches the caller intact, so the fallback can still be offered', async () => {
        runFiscalCheckout.mockRejectedValue(
            new FiscalBackendUnavailableError('fiskaly', 'Fiskaly is set as the fiscal issuer.')
        );

        const thrown = await thrownFromCheckout();
        const failure = classifyFiscalIssueFailure(thrown);

        expect(failure).not.toBeNull();
        expect(failure?.provider).toBe('fiskaly');
        expect(failure?.dispatch).toBe('not-dispatched');
    });

    // The old wrapper produced exactly this shape. If it ever comes back, the
    // sale silently loses its fallback again.
    it('is not re-wrapped into a generic "Transaction failed" error', async () => {
        runFiscalCheckout.mockRejectedValue(
            new FiscalBackendUnavailableError('vendus', 'Vendus offline.')
        );

        const thrown = await thrownFromCheckout();

        expect((thrown as Error).message).not.toMatch(/Transaction failed/i);
        expect(thrown).toBeInstanceOf(FiscalBackendUnavailableError);
    });

    // The wrapper still earns its keep for everything else — it is what turns a
    // raw Dexie or network error into something an operator can read.
    it('still wraps an unclassified error', async () => {
        runFiscalCheckout.mockRejectedValue(new Error('IndexedDB is closed'));

        const thrown = await thrownFromCheckout();

        expect(classifyFiscalIssueFailure(thrown)).toBeNull();
        expect((thrown as Error).message).toContain('IndexedDB is closed');
    });
});
