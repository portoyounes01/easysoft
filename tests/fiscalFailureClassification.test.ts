import { describe, expect, it } from 'vitest';
import {
    asUnresolvedIssueFailure,
    classifyFiscalIssueFailure,
    FiscalBackendUnavailableError,
    FiscalIssueUnresolvedError,
} from '../src/fiscal/fiscalFailure';

const unresolvedContext = {
    provider: 'vendus' as const,
    externalReference: 'POS-abc',
    attemptId: 'attempt-1',
};

describe('classifyFiscalIssueFailure', () => {
    it('recognises an unreachable backend as provably not dispatched', () => {
        const failure = classifyFiscalIssueFailure(
            new FiscalBackendUnavailableError('vendus', 'offline')
        );
        expect(failure?.dispatch).toBe('not-dispatched');
        expect(failure?.provider).toBe('vendus');
    });

    it('recognises a dispatched attempt with no usable document as unresolved', () => {
        const failure = classifyFiscalIssueFailure(
            new FiscalIssueUnresolvedError('fiskaly', 'POS-x', 'a1', 'gateway timeout')
        );
        expect(failure?.dispatch).toBe('unresolved');
    });

    // The fallback exists for outages, not for bad configuration: a missing
    // register id or an expired series is still there tomorrow, and a paper
    // invoice does not fix it.
    it('does not classify an ordinary error, so the sale stays blocked', () => {
        expect(classifyFiscalIssueFailure(new Error('Vendus register id missing'))).toBeNull();
        expect(classifyFiscalIssueFailure('boom')).toBeNull();
        expect(classifyFiscalIssueFailure(undefined)).toBeNull();
    });
});

describe('asUnresolvedIssueFailure', () => {
    it('keeps the lookup key the operator needs at the provider backoffice', () => {
        const failure = asUnresolvedIssueFailure(new Error('504'), unresolvedContext);
        expect(failure.externalReference).toBe('POS-abc');
        expect(failure.attemptId).toBe('attempt-1');
        expect(failure.message).toBe('504');
    });

    it('preserves an already-classified failure instead of nesting it', () => {
        const original = new FiscalIssueUnresolvedError('vendus', 'POS-1', 'a', 'first');
        expect(asUnresolvedIssueFailure(original, unresolvedContext)).toBe(original);
    });

    it('survives a non-Error rejection', () => {
        expect(asUnresolvedIssueFailure('socket hang up', unresolvedContext).message).toBe(
            'socket hang up'
        );
    });

    // A timeout, a 500 and an unparseable 200 are indistinguishable from the
    // till: in all three the request is already at the provider. Treating any
    // of them as a clean miss is what would double-invoice the sale.
    it('classifies every post-dispatch outcome the same way', () => {
        for (const raw of [new Error('timeout'), new Error('HTTP 500'), new Error('bad json')]) {
            expect(asUnresolvedIssueFailure(raw, unresolvedContext).dispatch).toBe('unresolved');
        }
    });
});
