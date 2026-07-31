import { beforeEach, describe, expect, it } from 'vitest';
import { initializeLocalDatabase, localDb } from '../src/lib/localDatabase';
import { identityKey, resolveIssueAttemptId } from '../src/fiscal/issueAttemptReuse';

/** The sale-defining part of a Vendus request, as the issuer builds it. */
const saleRequest = (overrides: Record<string, unknown> = {}) => ({
    register_id: 7,
    type: 'FS',
    mode: 'tests',
    items: [{ reference: 'SKU1', qty: 1, gross_price: 1.05 }],
    payments: [{ id: 'cash', amount: 1.05 }],
    tx_id: 'pos-sale-IGNORED',
    external_reference: 'POS-IGNORED',
    ...overrides,
});

/** Mirrors the issuer: identity excludes the id-derived fields. */
const identityOfStored = (r: Record<string, unknown>): string =>
    identityKey({
        register_id: r.register_id,
        type: r.type,
        mode: r.mode,
        items: r.items,
        payments: r.payments,
    });

const putAttempt = async (params: {
    id: string;
    provider?: 'vendus' | 'invoicexpress' | 'fiskaly';
    kind?: 'sale' | 'credit_note';
    status: 'pending' | 'issued' | 'persisted' | 'failed';
    request: Record<string, unknown>;
}) => {
    await localDb.vendusIssueAttempts.put({
        id: params.id,
        provider: params.provider,
        kind: params.kind ?? 'sale',
        tx_id: `pos-sale-${params.id}`,
        external_reference: `POS-${params.id}`,
        status: params.status,
        vendus_document_id: null,
        local_transaction_id: null,
        request_json: JSON.stringify(params.request),
        response_json: null,
        error_message: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    });
};

const resolve = (provider: 'vendus' | 'invoicexpress' = 'vendus', request = saleRequest()) =>
    resolveIssueAttemptId({
        provider,
        kind: 'sale',
        identity: identityOfStored(request),
        identityOfStored,
    });

beforeEach(async () => {
    await initializeLocalDatabase();
    await localDb.vendusIssueAttempts.clear();
});

describe('resolveIssueAttemptId', () => {
    it('mints a fresh id when this sale has never been attempted', async () => {
        const { attemptId, reused } = await resolve();
        expect(reused).toBe(false);
        expect(attemptId).toMatch(/^[0-9a-f-]{36}$/i);
    });

    // The point of the whole module: re-presenting the SAME tx_id is what makes
    // Vendus return the first document instead of signing a second.
    it('reuses the id of an unresolved attempt for the identical sale', async () => {
        await putAttempt({ id: 'attempt-1', provider: 'vendus', status: 'failed', request: saleRequest() });
        const { attemptId, reused } = await resolve();
        expect(reused).toBe(true);
        expect(attemptId).toBe('attempt-1');
    });

    it('reuses across every non-final state, not just failed', async () => {
        for (const status of ['pending', 'issued', 'failed'] as const) {
            await localDb.vendusIssueAttempts.clear();
            await putAttempt({ id: `a-${status}`, provider: 'vendus', status, request: saleRequest() });
            expect((await resolve()).attemptId).toBe(`a-${status}`);
        }
    });

    // A persisted attempt is a finished sale. Reusing it would make the provider
    // dedup swallow the NEXT sale of the same basket entirely.
    it('never reuses a persisted attempt', async () => {
        await putAttempt({ id: 'done', provider: 'vendus', status: 'persisted', request: saleRequest() });
        expect((await resolve()).reused).toBe(false);
    });

    it('does not reuse across a different sale', async () => {
        await putAttempt({
            id: 'other',
            provider: 'vendus',
            status: 'failed',
            request: saleRequest({ items: [{ reference: 'SKU9', qty: 3, gross_price: 9 }] }),
        });
        expect((await resolve()).reused).toBe(false);
    });

    it('does not reuse across providers', async () => {
        await putAttempt({ id: 'ix', provider: 'invoicexpress', status: 'failed', request: saleRequest() });
        expect((await resolve('vendus')).reused).toBe(false);
    });

    it('does not reuse a credit-note attempt for a sale', async () => {
        await putAttempt({
            id: 'nc',
            provider: 'vendus',
            kind: 'credit_note',
            status: 'failed',
            request: saleRequest(),
        });
        expect((await resolve()).reused).toBe(false);
    });

    // Rows written before the provider column existed are all Vendus.
    it('treats a legacy row with no provider as Vendus', async () => {
        await putAttempt({ id: 'legacy', status: 'failed', request: saleRequest() });
        expect((await resolve('vendus')).attemptId).toBe('legacy');
        expect((await resolve('invoicexpress')).reused).toBe(false);
    });

    it('ignores a row whose stored request is unparseable', async () => {
        await putAttempt({ id: 'broken', provider: 'vendus', status: 'failed', request: saleRequest() });
        await localDb.vendusIssueAttempts.update('broken', { request_json: '{not json' });
        expect((await resolve()).reused).toBe(false);
    });

    // The id-derived fields differ on every attempt by construction; if they
    // leaked into the identity nothing would ever match.
    it('ignores tx_id and external_reference when matching', async () => {
        await putAttempt({
            id: 'attempt-2',
            provider: 'vendus',
            status: 'failed',
            request: saleRequest({ tx_id: 'pos-sale-something-else', external_reference: 'POS-else' }),
        });
        expect((await resolve()).attemptId).toBe('attempt-2');
    });
});
