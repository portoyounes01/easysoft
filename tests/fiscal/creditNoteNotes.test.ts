import { describe, it, expect } from 'vitest';
import { parseCreditNoteNotesFields } from '../../src/fiscal/creditNoteNotes';

describe('parseCreditNoteNotesFields', () => {
    it('returns ref and reason when notes match settled invoice', () => {
        expect(
            parseCreditNoteNotesFields('NC referente FS A/1. Artigo danificado', 'FS A/1')
        ).toEqual({ originalRef: 'FS A/1', reason: 'Artigo danificado' });
    });

    it('returns only ref when no reason and matches settled', () => {
        expect(parseCreditNoteNotesFields('NC referente FS A/1', 'FS A/1')).toEqual({
            originalRef: 'FS A/1',
        });
    });

    it('parses without settled_invoice_no (legacy notes)', () => {
        expect(parseCreditNoteNotesFields('NC referente FT B/2. Return', null)).toEqual({
            originalRef: 'FT B/2',
            reason: 'Return',
        });
    });
});
