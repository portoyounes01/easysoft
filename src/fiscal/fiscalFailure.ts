// How a cloud fiscal issuance failed — and, from that, whether the sale may
// lawfully fall back to a handwritten invoice from the AT-authorised book.
//
// The whole design turns on ONE question: can a document for this sale exist at
// the backend right now?
//
//   • Provably not  → the paper invoice is the only invoice. Fallback is safe.
//   • Possibly yes  → the backend may already hold a fatura for this sale.
//                     Writing a paper invoice too would double-invoice it: two
//                     legal documents, one sale, and a SAF-T that no longer
//                     reconciles. A human has to check first.
//
// Two independent facts answer that question — the request never left, or the
// provider answered "no" — so there are three outcomes.

import type { ExternalFiscalProvider } from './types';

export type FiscalIssueDispatch =
    /** The connectivity guard tripped before any network call and before any
     *  issue-attempt row existed. Nothing was sent; nothing can exist. */
    | 'not-dispatched'
    /** The provider was reached and definitively refused to create the
     *  document. It was reached — but nothing exists there either. */
    | 'rejected'
    /** The request was dispatched and did not come back as a usable document:
     *  timeout, 5xx, connection reset, or a success body we could not parse. A
     *  document MAY exist at the backend. */
    | 'unresolved';

/**
 * Provider HTTP statuses that PROVE no document was created.
 *
 * Deliberately a subtraction from 4xx rather than an allow-list: new
 * client-error codes are overwhelmingly "we refused your request". The
 * exclusions are the ones where a document might exist anyway.
 *
 *   408 Request Timeout — the provider stopped waiting, but may already have
 *       started processing what it did receive.
 *   409 Conflict        — frequently means "a document like this already
 *       exists", the opposite of proof that none does.
 *   425 Too Early       — the request is replayable and may yet be processed.
 *   429 Too Many        — usually refused before processing, but a gateway can
 *       emit it after forwarding upstream. Being wrong here double-invoices a
 *       sale, so it stays out.
 */
const AMBIGUOUS_PROVIDER_STATUSES = new Set([408, 409, 425, 429]);

export function providerRejectionProvesNoDocument(status: number | undefined): boolean {
    if (typeof status !== 'number') return false;
    if (status < 400 || status > 499) return false;
    return !AMBIGUOUS_PROVIDER_STATUSES.has(status);
}

/**
 * Is re-sending an identical sale safe after an unresolved outcome — will the
 * provider recognise the retry instead of issuing a second document?
 *
 *   vendus   `tx_id` is documented as exactly that guarantee: "this will ensure
 *            that only a document may be created using the same tx_id, even if
 *            multiple requests are made by mistake".
 *   fiskaly  the attempt's `checkoutId` seeds deterministic X-Idempotency-Keys,
 *            so fiskaly replays the original record.
 *   others   no documented guarantee — register D-FR2.
 *
 * Note this is about RETRYING, not about falling back: a safe retry does not
 * prove the first attempt created nothing, so the fallback still needs the
 * operator's attestation either way.
 */
export function retryIsIdempotent(provider: ExternalFiscalProvider): boolean {
    return provider === 'vendus' || provider === 'fiskaly';
}

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
 * The provider answered, and the answer was "no". Carries the upstream status
 * that justified the classification, so the audit trail records WHY a paper
 * invoice was permitted without the operator checking the backoffice.
 */
export class FiscalIssueRejectedError extends Error {
    readonly dispatch = 'rejected' as const;

    constructor(
        readonly provider: ExternalFiscalProvider,
        readonly externalReference: string,
        readonly attemptId: string,
        readonly providerStatus: number,
        message: string
    ) {
        super(message);
        this.name = 'FiscalIssueRejectedError';
        Object.setPrototypeOf(this, FiscalIssueRejectedError.prototype);
    }
}

/**
 * The request was sent and the sale did not come back with a usable document,
 * with no proof either way.
 *
 * The operator resolves it by looking the sale up at the provider under
 * {@link externalReference}, which the issuer sends with the request precisely
 * so it can be found again.
 */
export class FiscalIssueUnresolvedError extends Error {
    readonly dispatch = 'unresolved' as const;

    constructor(
        readonly provider: ExternalFiscalProvider,
        readonly externalReference: string,
        readonly attemptId: string,
        message: string
    ) {
        super(message);
        this.name = 'FiscalIssueUnresolvedError';
        Object.setPrototypeOf(this, FiscalIssueUnresolvedError.prototype);
    }
}

export type FiscalIssueFailure =
    | FiscalBackendUnavailableError
    | FiscalIssueRejectedError
    | FiscalIssueUnresolvedError;

/**
 * Raised by the edge-function callers when the response carries the provider's
 * own verdict. A transport detail only — {@link asUnresolvedIssueFailure} is
 * what turns it into a classified failure.
 */
export class ProviderRejectedError extends Error {
    constructor(
        readonly providerStatus: number,
        message: string
    ) {
        super(message);
        this.name = 'ProviderRejectedError';
        Object.setPrototypeOf(this, ProviderRejectedError.prototype);
    }
}

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
    if (error instanceof FiscalIssueRejectedError) return error;
    if (error instanceof FiscalIssueUnresolvedError) return error;
    return null;
}

/**
 * Classify whatever a dispatched issue attempt threw. Applied by the sale
 * issuers around the block that starts at the network call, so every failure
 * from that point on — including a parse failure on a 200 that DID create a
 * document — is classified.
 *
 * A provider rejection whose status proves nothing was created becomes
 * `rejected`; everything else stays `unresolved`. A response carrying NO
 * `providerStatus` — an edge function deployed before this contract existed —
 * also stays `unresolved`, so an out-of-date backend degrades to the safe
 * answer rather than the permissive one.
 */
export function asUnresolvedIssueFailure(
    error: unknown,
    context: { provider: ExternalFiscalProvider; externalReference: string; attemptId: string }
): FiscalIssueRejectedError | FiscalIssueUnresolvedError {
    if (error instanceof FiscalIssueUnresolvedError) return error;
    if (error instanceof FiscalIssueRejectedError) return error;

    if (error instanceof ProviderRejectedError && providerRejectionProvesNoDocument(error.providerStatus)) {
        return new FiscalIssueRejectedError(
            context.provider,
            context.externalReference,
            context.attemptId,
            error.providerStatus,
            error.message
        );
    }

    return new FiscalIssueUnresolvedError(
        context.provider,
        context.externalReference,
        context.attemptId,
        error instanceof Error ? error.message : String(error)
    );
}
