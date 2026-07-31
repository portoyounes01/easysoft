import { describe, expect, it } from 'vitest';
import { outstandingManualDocuments } from '../src/fiscal/fiscalAuditLog';

const issued = (slipReference: string, provider = 'vendus') => ({
    event_type: 'NON_FISCAL_FALLBACK_ISSUED',
    payload_json: JSON.stringify({ slipReference, provider, reason: 'offline', totalGross: 1.9 }),
});

const recorded = (slipReference: string) => ({
    event_type: 'MANUAL_DOCUMENT_RECORDED',
    payload_json: JSON.stringify({ slipReference, manualSeries: 'M2026', manualNumber: '17' }),
});

describe('outstandingManualDocuments', () => {
    it('reports a fallback slip that has no paper document yet', () => {
        const out = outstandingManualDocuments([issued('SLIP-1')]);
        expect(out.map(o => o.slipReference)).toEqual(['SLIP-1']);
    });

    it('drops a slip once its paper document is recorded', () => {
        const out = outstandingManualDocuments([issued('SLIP-1'), recorded('SLIP-1')]);
        expect(out).toEqual([]);
    });

    it('pairs by reference, not by order or position', () => {
        const out = outstandingManualDocuments([
            recorded('SLIP-2'),
            issued('SLIP-1'),
            issued('SLIP-2'),
            issued('SLIP-3'),
        ]);
        expect(out.map(o => o.slipReference).sort()).toEqual(['SLIP-1', 'SLIP-3']);
    });

    it('keeps the provider so the reminder can name the right follow-up', () => {
        const out = outstandingManualDocuments([
            issued('SLIP-1', 'fiskaly'),
            issued('SLIP-2', 'invoicexpress'),
        ]);
        expect(new Set(out.map(o => o.provider))).toEqual(new Set(['fiskaly', 'invoicexpress']));
    });

    it('ignores unrelated audit events', () => {
        const out = outstandingManualDocuments([
            { event_type: 'FISCAL_DOCUMENT_CREATED', payload_json: JSON.stringify({ id: 'x' }) },
            issued('SLIP-1'),
        ]);
        expect(out.map(o => o.slipReference)).toEqual(['SLIP-1']);
    });

    it('survives a malformed payload instead of hiding every other reminder', () => {
        const out = outstandingManualDocuments([
            { event_type: 'NON_FISCAL_FALLBACK_ISSUED', payload_json: '{not json' },
            issued('SLIP-1'),
        ]);
        expect(out.map(o => o.slipReference)).toEqual(['SLIP-1']);
    });

    it('is empty when nothing has ever fallen back', () => {
        expect(outstandingManualDocuments([])).toEqual([]);
    });
});
