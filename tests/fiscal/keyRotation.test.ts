import { describe, it, expect, beforeEach } from 'vitest';
import { nextHashControlVersion } from '../../src/fiscal/hashControl';
import { initializeLocalDatabase, localDb, transactionLocalService } from '../../src/lib/localDatabase';

describe('nextHashControlVersion', () => {
    it('increments non-negative integer strings', () => {
        expect(nextHashControlVersion('1')).toBe('2');
        expect(nextHashControlVersion('9')).toBe('10');
        expect(nextHashControlVersion('0')).toBe('1');
    });

    it('treats empty as first rotation from implicit 1 → 2', () => {
        expect(nextHashControlVersion('')).toBe('2');
        expect(nextHashControlVersion(undefined)).toBe('2');
    });

    it('resets non-numeric values to 2', () => {
        expect(nextHashControlVersion('abc')).toBe('2');
        expect(nextHashControlVersion('1a')).toBe('2');
    });
});

describe('KEY_ROTATED fiscal audit', () => {
    beforeEach(async () => {
        await initializeLocalDatabase();
        await localDb.fiscalAuditEvents.clear();
    });

    it('persists KEY_ROTATED with payload', async () => {
        await transactionLocalService.appendFiscalAuditEvent({
            event_type: 'KEY_ROTATED',
            payload_json: JSON.stringify({
                previousHashControl: '3',
                nextHashControl: '4',
            }),
            employee_id: 'admin-test',
        });
        const rows = await transactionLocalService.listFiscalAuditEvents(20);
        const hit = rows.find(r => r.event_type === 'KEY_ROTATED');
        expect(hit).toBeDefined();
        const p = JSON.parse(hit!.payload_json) as { previousHashControl: string; nextHashControl: string };
        expect(p.previousHashControl).toBe('3');
        expect(p.nextHashControl).toBe('4');
    });
});
