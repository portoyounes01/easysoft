import { describe, it, expect, vi, beforeEach } from 'vitest';

const { appendFiscalAuditEvent } = vi.hoisted(() => ({
    appendFiscalAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/localDatabase', () => ({
    transactionLocalService: {
        appendFiscalAuditEvent,
    },
}));

import type { SystemSettings } from '../../src/contexts/SettingsContext';
import { defaultSeriesProfiles } from '../../src/fiscal/receiptSeriesProfile';
import {
    collectCompanyInfoChanges,
    collectSeriesProfileChanges,
    logCommittedSettingsChanges,
    logPostSaleReceiptNotPrinted,
    logPostSaleReceiptPrinted,
    logReproducedDocument,
} from '../../src/fiscal/fiscalAuditLog';

function minimalSettings(overrides?: Partial<SystemSettings>): SystemSettings {
    return {
        autoLogout: {
            enabled: true,
            timeoutMinutes: 15,
            warningSeconds: 30,
            protectWhenCartHasItems: true,
        },
        pos: {
            currencySymbol: '€',
            taxRate: 0.23,
            trackInventory: true,
            allowNegativeStock: false,
            autoClearCart: { enabled: false, timeoutMinutes: 0 },
        },
        display: { itemsPerPage: 20, showEmployeePhotos: true, compactMode: false },
        company: {
            name: 'Old Name',
            address: 'Addr',
            postalCode: '1000-001',
            city: 'Lisboa',
            taxNumber: '123',
            phone: '',
            email: '',
            slogan: '',
            softwareInfo: '',
        },
        receipt: {
            defaultDocumentType: 'FATURA_SIMPLIFICADA',
            counterLabel: 'BALCÃO 1',
            seriesProfiles: defaultSeriesProfiles(),
            printDuplicateOnIssue: false,
        },
        fiscal: { hashControlVersion: '1', trainingMode: false },
        ...overrides,
    };
}

describe('fiscalAuditLog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('collectCompanyInfoChanges returns only changed fields', () => {
        const before = minimalSettings();
        const after = minimalSettings({
            company: { ...before.company, name: 'New Name' },
        });
        const changes = collectCompanyInfoChanges(before.company, after.company);
        expect(changes).toHaveLength(1);
        expect(changes[0]).toEqual({
            field: 'name',
            previousValue: 'Old Name',
            value: 'New Name',
        });
    });

    it('collectSeriesProfileChanges detects série edits', () => {
        const before = minimalSettings();
        const profiles = defaultSeriesProfiles();
        profiles.FS = { ...profiles.FS, series: 'SERIE-A' };
        const after = minimalSettings({
            receipt: { ...before.receipt, seriesProfiles: profiles },
        });
        const changes = collectSeriesProfileChanges(before.receipt.seriesProfiles, after.receipt.seriesProfiles);
        expect(changes.some(c => c.docKey === 'FS' && c.field === 'series')).toBe(true);
        expect(changes.find(c => c.docKey === 'FS' && c.field === 'series')).toMatchObject({
            previousValue: 'FAT2026',
            value: 'SERIE-A',
        });
    });

    it('logCommittedSettingsChanges groups company fields into one audit row on save', async () => {
        const before = minimalSettings();
        const after = minimalSettings({
            company: {
                ...before.company,
                name: 'Saved Name',
                taxNumber: '999999999',
            },
        });
        await logCommittedSettingsChanges(before, after, 'emp-1');
        expect(appendFiscalAuditEvent).toHaveBeenCalledTimes(1);
        const payload = JSON.parse(appendFiscalAuditEvent.mock.calls[0][0].payload_json);
        expect(appendFiscalAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                event_type: 'COMPANY_INFO_CHANGED',
            })
        );
        expect(payload.changes).toHaveLength(2);
        expect(payload.changes).toEqual(
            expect.arrayContaining([
                { field: 'name', previousValue: 'Old Name', value: 'Saved Name' },
                { field: 'taxNumber', previousValue: '123', value: '999999999' },
            ])
        );
    });

    it('logCommittedSettingsChanges groups series edits into one audit row on save', async () => {
        const before = minimalSettings();
        const profiles = defaultSeriesProfiles();
        profiles.FS = { ...profiles.FS, series: 'SERIE-A', atValidationCode: 'AT999' };
        const after = minimalSettings({
            receipt: { ...before.receipt, seriesProfiles: profiles },
        });
        await logCommittedSettingsChanges(before, after, 'emp-1');
        expect(appendFiscalAuditEvent).toHaveBeenCalledTimes(1);
        const payload = JSON.parse(appendFiscalAuditEvent.mock.calls[0][0].payload_json);
        expect(payload.changes.length).toBeGreaterThanOrEqual(2);
    });

    it('logs post-sale printed', async () => {
        await logPostSaleReceiptPrinted(
            { documentNumber: 'FS 1/1', transactionId: 'tx-1' },
            'emp-1'
        );
        expect(appendFiscalAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                event_type: 'POST_SALE_RECEIPT_PRINTED',
                employee_id: 'emp-1',
            })
        );
    });

    it('logs post-sale not printed', async () => {
        await logPostSaleReceiptNotPrinted({ documentNumber: 'FS 1/2' }, null);
        expect(appendFiscalAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                event_type: 'POST_SALE_RECEIPT_NOT_PRINTED',
                employee_id: null,
            })
        );
    });

    // Reproducing an issued document is three distinct facts, and the log has
    // to be able to tell them apart: opening the 2.ª via preview, that preview
    // reaching the printer, and the Original preview reaching the printer.
    it.each([
        ['SECOND_COPY_VIEWED'],
        ['REPRINT_REQUESTED'],
        ['ORIGINAL_REPRINTED'],
    ] as const)('logs %s with the document it refers to', async event => {
        await logReproducedDocument(event, { documentNumber: 'FS 1/7', transactionId: 'tx-7' }, 'emp-2');
        expect(appendFiscalAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({ event_type: event, employee_id: 'emp-2' })
        );
        const call = appendFiscalAuditEvent.mock.calls.at(-1)?.[0] as { payload_json: string };
        expect(JSON.parse(call.payload_json)).toEqual({ documentNumber: 'FS 1/7', transactionId: 'tx-7' });
    });
});
