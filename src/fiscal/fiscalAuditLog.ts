import { transactionLocalService } from '../lib/localDatabase';
import type { SystemSettings } from '../contexts/SettingsContext';
import type { FiscalAuditEventType } from './types';
import type { FiscalSeriesDocKey, ReceiptSeriesProfile } from './receiptSeriesProfile';

export interface PostSalePrintAuditContext {
    documentNumber: string;
    transactionId?: string;
    fiscalDocumentId?: string;
}

const COMPANY_AUDIT_FIELDS = [
    'name',
    'address',
    'postalCode',
    'city',
    'taxNumber',
    'phone',
    'email',
    'slogan',
    'softwareInfo',
] as const;

type CompanyAuditField = (typeof COMPANY_AUDIT_FIELDS)[number];

const SERIES_AUDIT_FIELDS: (keyof ReceiptSeriesProfile)[] = [
    'series',
    'seriesDescription',
    'numericWidth',
    'currentNumber',
    'seriesStartDate',
    'seriesEndDate',
    'atValidationCode',
];

const SERIES_DOC_KEYS: FiscalSeriesDocKey[] = ['FS', 'FT', 'NC'];

function normalizeAuditScalar(value: unknown): string | number | boolean {
    if (typeof value === 'boolean' || typeof value === 'number') {
        return value;
    }
    if (value === undefined || value === null) {
        return '';
    }
    return String(value);
}

function auditValuesEqual(before: unknown, after: unknown): boolean {
    return normalizeAuditScalar(before) === normalizeAuditScalar(after);
}

export function cloneSettingsSnapshot(settings: SystemSettings): SystemSettings {
    return JSON.parse(JSON.stringify(settings)) as SystemSettings;
}

export function collectCompanyInfoChanges(
    before: SystemSettings['company'],
    after: SystemSettings['company']
): Array<{ field: CompanyAuditField; previousValue: string | number | boolean; value: string | number | boolean }> {
    const changes: Array<{
        field: CompanyAuditField;
        previousValue: string | number | boolean;
        value: string | number | boolean;
    }> = [];
    for (const field of COMPANY_AUDIT_FIELDS) {
        const prev = before[field];
        const next = after[field];
        if (!auditValuesEqual(prev, next)) {
            changes.push({
                field,
                previousValue: normalizeAuditScalar(prev),
                value: normalizeAuditScalar(next),
            });
        }
    }
    return changes;
}

export function collectSeriesProfileChanges(
    before: Record<FiscalSeriesDocKey, ReceiptSeriesProfile>,
    after: Record<FiscalSeriesDocKey, ReceiptSeriesProfile>
): Array<{
    docKey: FiscalSeriesDocKey;
    field: keyof ReceiptSeriesProfile;
    previousValue: string | number | boolean;
    value: string | number | boolean;
}> {
    const changes: Array<{
        docKey: FiscalSeriesDocKey;
        field: keyof ReceiptSeriesProfile;
        previousValue: string | number | boolean;
        value: string | number | boolean;
    }> = [];
    for (const docKey of SERIES_DOC_KEYS) {
        const prevProf = before[docKey];
        const nextProf = after[docKey];
        for (const field of SERIES_AUDIT_FIELDS) {
            const prev = prevProf[field];
            const next = nextProf[field];
            if (!auditValuesEqual(prev, next)) {
                changes.push({
                    docKey,
                    field,
                    previousValue: normalizeAuditScalar(prev),
                    value: normalizeAuditScalar(next),
                });
            }
        }
    }
    return changes;
}

export async function appendFiscalAuditEventTyped(
    event_type: FiscalAuditEventType,
    payload: Record<string, unknown>,
    employeeId: string | null | undefined
): Promise<void> {
    await transactionLocalService.appendFiscalAuditEvent({
        event_type,
        payload_json: JSON.stringify(payload),
        employee_id: employeeId ?? null,
    });
}

export async function logPostSaleReceiptPrinted(
    ctx: PostSalePrintAuditContext,
    employeeId: string | null | undefined
): Promise<void> {
    await appendFiscalAuditEventTyped('POST_SALE_RECEIPT_PRINTED', ctx, employeeId);
}

export async function logPostSaleReceiptNotPrinted(
    ctx: PostSalePrintAuditContext,
    employeeId: string | null | undefined
): Promise<void> {
    await appendFiscalAuditEventTyped('POST_SALE_RECEIPT_NOT_PRINTED', ctx, employeeId);
}

/** Log company + series edits once, when settings are saved (diff vs last saved baseline). */
export async function logCommittedSettingsChanges(
    before: SystemSettings,
    after: SystemSettings,
    employeeId: string | null | undefined
): Promise<void> {
    const companyChanges = collectCompanyInfoChanges(before.company, after.company);
    if (companyChanges.length > 0) {
        await appendFiscalAuditEventTyped(
            'COMPANY_INFO_CHANGED',
            { changes: companyChanges },
            employeeId
        );
    }

    const seriesChanges = collectSeriesProfileChanges(before.receipt.seriesProfiles, after.receipt.seriesProfiles);
    if (seriesChanges.length > 0) {
        await appendFiscalAuditEventTyped(
            'SERIES_PROFILE_CHANGED',
            { changes: seriesChanges },
            employeeId
        );
    }
}
