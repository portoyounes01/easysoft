// How a cloud fiscal issuance failed — and, from that, whether the sale may
// lawfully fall back to a handwritten invoice from the AT-authorised book.
//
// The whole design turns on ONE question: did the issue request leave the till?
//
//   • It provably did NOT  → no document can exist at the backend, so the paper
//                            invoice is the only invoice. Fallback is safe.
//   • It MAY have arrived  → the backend may already hold a fatura for this
//                            sale. Writing a paper invoice too would double-
//                            invoice it: two legal documents, one sale, and a
//                            SAF-T that no longer reconciles. Fallback is NOT
//                            safe on its own — a human has to check first.
//
// Everything else (which HTTP status, which provider message) is diagnostics.
// It never widens eligibility on its own, because a 500 and a timeout look the
// same from here: the request was already in flight.

import type { ExternalFiscalProvider } from './types';

export type FiscalIssueDispatch =
    /** The connectivity guard tripped before any network call and before any
     *  issue-attempt row existed. Nothing was sent; nothing can exist. */
    | 'not-dispatched'
    /** The request was dispatched and did not come back as a usable document:
     *  timeout, 5xx, connection reset, provider rejection, or a success body we
     *  could not parse. A document MAY exist at the backend. */
    | 'unresolved';

/**
 * The backend could not be reached at all — offline till, or Supabase (which
 * fronts every cloud issuer) unreachable. Thrown by the issuers' connectivity
 * guards, which run BEFORE the attempt row is written, so this error carries a
 * hard guarantee of no side effects anywhere.
 */
export class FiscalBackendUnavailableError extends Error {
    readonly dispatch = 'not-dispatched' as const;

    constructor(
        readonly provider: ExternalFiscalProvider,
        message: string
    ) {
        super(message);
        this.name = 'FiscalBackendUnavailableError';
        Object.setPrototypeOf(this, FiscalBackendUnavailableError.prototype);
    }
}

/**
 * The request was sent and the sale did not come back with a usable document.
 *
 * Deliberately does NOT distinguish "provider said no" from "we never heard
 * back": the till cannot tell those apart from the outside, and guessing wrong
 * in the optimistic direction is what produces a double-invoiced sale. The
 * operator resolves it by looking the sale up at the provider under
 * {@link externalReference}, which the issuer sent with the request precisely
 * so it can be found again.
 */
export class FiscalIssueUnresolvedError extends Error {
    readonly dispatch = 'unresolved' as const;

    constructor(
        readonly provider: ExternalFiscalProvider,
        /** Lookup key the operator searches for in the provider's backoffice. */
        readonly externalReference: string,
        /** Local issue-attempt row holding the request/response for support. */
        readonly attemptId: string,
        message: string
    ) {
        super(message);
        this.name = 'FiscalIssueUnresolvedError';
        Object.setPrototypeOf(this, FiscalIssueUnresolvedError.prototype);
    }
}

export type FiscalIssueFailure = FiscalBackendUnavailableError | FiscalIssueUnresolvedError;

/**
 * Is this failure one the non-fiscal fallback knows how to handle?
 *
 * `null` for everything else — a missing register id, an expired series, an
 * invalid line price. Those are configuration or data faults that a paper
 * invoice does not fix and that will still be there tomorrow, so they keep the
 * existing behaviour: the sale is blocked and the operator fixes the cause.
 */
export function classifyFiscalIssueFailure(error: unknown): FiscalIssueFailure | null {
    if (error instanceof FiscalBackendUnavailableError) return error;
    if (error instanceof FiscalIssueUnresolvedError) return error;
    return null;
}

/**
 * Wrap whatever a dispatched issue attempt threw. Applied by the sale issuers
 * around the block that starts at the network call, so that every failure from
 * that point on — including a parse failure on a 200 that DID create a document
 * — is classified as unresolved rather than as a clean miss.
 */
export function asUnresolvedIssueFailure(
    error: unknown,
    context: { provider: ExternalFiscalProvider; externalReference: string; attemptId: string }
): FiscalIssueUnresolvedError {
    if (error instanceof FiscalIssueUnresolvedError) return error;
    return new FiscalIssueUnresolvedError(
        context.provider,
        context.externalReference,
        context.attemptId,
        error instanceof Error ? error.message : String(error)
    );
}
