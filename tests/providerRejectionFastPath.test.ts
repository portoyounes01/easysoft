import { describe, expect, it } from 'vitest';
import {
    asUnresolvedIssueFailure,
    providerRejectionProvesNoDocument,
    ProviderRejectedError,
    retryIsIdempotent,
} from '../src/fiscal/fiscalFailure';
import { canIssueNonFiscalFallback } from '../src/fiscal/nonFiscalFallback';

const context = { provider: 'vendus' as const, externalReference: 'POS-1', attemptId: 'a1' };
const rejectWith = (status: number) =>
    asUnresolvedIssueFailure(new ProviderRejectedError(status, `HTTP ${status}`), context);

describe('providerRejectionProvesNoDocument', () => {
    it('accepts ordinary client errors — the provider refused before creating anything', () => {
        for (const status of [400, 401, 403, 404, 415, 422]) {
            expect(providerRejectionProvesNoDocument(status)).toBe(true);
        }
    });

    // These four are the whole reason this is a subtraction and not `status < 500`.
    it('rejects the four statuses under which a document might exist anyway', () => {
        expect(providerRejectionProvesNoDocument(408)).toBe(false); // may have begun processing
        expect(providerRejectionProvesNoDocument(409)).toBe(false); // often means one exists
        expect(providerRejectionProvesNoDocument(425)).toBe(false); // replayable
        expect(providerRejectionProvesNoDocument(429)).toBe(false); // a gateway can emit it late
    });

    it('rejects server errors — a 5xx says nothing about what was created', () => {
        for (const status of [500, 502, 503, 504]) {
            expect(providerRejectionProvesNoDocument(status)).toBe(false);
        }
    });

    it('rejects a missing status, so an out-of-date edge function stays safe', () => {
        expect(providerRejectionProvesNoDocument(undefined)).toBe(false);
    });
});

describe('classification of a dispatched failure', () => {
    it('marks a proven refusal as rejected and keeps the justifying status', () => {
        const failure = rejectWith(422);
        expect(failure.dispatch).toBe('rejected');
        expect('providerStatus' in failure && failure.providerStatus).toBe(422);
    });

    it('leaves an ambiguous status unresolved', () => {
        expect(rejectWith(409).dispatch).toBe('unresolved');
        expect(rejectWith(429).dispatch).toBe('unresolved');
    });

    // The fast path must not activate against an edge function that predates the
    // providerStatus contract: no status means no proof.
    it('leaves a plain error unresolved', () => {
        expect(asUnresolvedIssueFailure(new Error('Vendus HTTP 400'), context).dispatch).toBe('unresolved');
    });
});

describe('what each classification unlocks', () => {
    it('lets a proven refusal take the slip in one click', () => {
        expect(canIssueNonFiscalFallback({ failure: rejectWith(400) })).toBe(true);
    });

    it('still gates an ambiguous outcome behind the operator', () => {
        expect(canIssueNonFiscalFallback({ failure: rejectWith(409) })).toBe(false);
        expect(canIssueNonFiscalFallback({ failure: rejectWith(409), operatorAttested: true })).toBe(true);
    });
});

describe('retryIsIdempotent', () => {
    // Vendus documents tx_id as the guarantee; fiskaly replays via checkoutId.
    it('is true only where the provider recognises a re-sent sale', () => {
        expect(retryIsIdempotent('vendus')).toBe(true);
        expect(retryIsIdempotent('fiskaly')).toBe(true);
        expect(retryIsIdempotent('invoicexpress')).toBe(false);
    });
});
