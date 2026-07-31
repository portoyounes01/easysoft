// Retry convergence for the cloud issuers.
//
// When an issue request is sent and no usable document comes back, the local
// attempt row is left in a non-`persisted` state and the provider MAY hold a
// document for that sale. Re-running the SAME sale must not mint a fresh
// identity: it must re-present the original one, so the provider can recognise
// the retry as the same transaction instead of issuing a second document.
//
// This is the shape fiskaly already uses (see fiskalyFiscalIssuer.ts, which
// keeps its own copy because its identity is entangled with the correlative
// number it also has to reserve). Vendus and InvoiceXpress had no equivalent
// and minted a new UUID per call — register D-FR2.
//
// What reuse buys differs by provider, and the difference matters:
//
//   Vendus          `tx_id` is a documented server-side guarantee — "this will
//                   ensure that only a document may be created using the same
//                   tx_id, even if multiple requests are made by mistake". So a
//                   retry of an identical sale is genuinely idempotent.
//   InvoiceXpress   no documented idempotency. Reuse makes the sale
//                   *identifiable* (stable `reference` / `proprietary_uid`) so a
//                   duplicate is detectable and the operator can find the sale,
//                   but it does not by itself prevent one.

import { localDb } from '../lib/localDatabase';
import { generateUUID } from '../utils/uuid';

/** Providers whose attempts this module reconciles. */
type ReusableProvider = 'vendus' | 'invoicexpress';

function parseRequest(json: string | null): Record<string, unknown> | null {
    try {
        return JSON.parse(json ?? 'null') as Record<string, unknown> | null;
    } catch {
        return null;
    }
}

/**
 * The id to issue this sale under: the open attempt's, if this exact sale has
 * already been attempted and left unresolved, otherwise a fresh one.
 *
 * `identity` must be derived ONLY from what defines the sale — never from the
 * attempt id itself, or from anything that varies between two runs of the same
 * cart. Two different sales must never collide onto one id; that would make the
 * provider's dedup swallow the second sale entirely.
 *
 * @param identityOfStored recomputes the identity from a stored `request_json`,
 *        so the comparison is against what was actually sent, not against what
 *        we would build today from possibly-changed settings.
 */
export async function resolveIssueAttemptId(params: {
    provider: ReusableProvider;
    kind: 'sale' | 'credit_note';
    identity: string;
    identityOfStored: (request: Record<string, unknown>) => string;
}): Promise<{ attemptId: string; reused: boolean }> {
    const { provider, kind, identity, identityOfStored } = params;

    const open = (await localDb.vendusIssueAttempts.toArray()).filter(attempt => {
        // Legacy rows predate the `provider` column and are all Vendus.
        const attemptProvider = attempt.provider ?? 'vendus';
        return attemptProvider === provider && attempt.kind === kind && attempt.status !== 'persisted';
    });

    for (const attempt of open) {
        const request = parseRequest(attempt.request_json);
        if (!request) continue;
        if (identityOfStored(request) === identity) {
            return { attemptId: attempt.id, reused: true };
        }
    }
    return { attemptId: generateUUID(), reused: false };
}

/** Stable string for an identity object. Key order is fixed by construction. */
export function identityKey(parts: Record<string, unknown>): string {
    return JSON.stringify(parts);
}
