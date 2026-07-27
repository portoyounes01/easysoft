import { transactionLocalService } from '../lib/localDatabase';
import type { SystemSettings } from '../contexts/SettingsContext';
import type { FiscalAuditEventType, FiscalProvider } from './types';
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

// ---------------------------------------------------------------------------
// Non-fiscal fallback (offline / fiscal backend unreachable / no valid ATCUD+QR)
//
// Legal basis and the per-provider recovery rules are in
// docs/fiscal-fallback-legal-brief.md. The short version: the legal invoice for
// such a sale is the handwritten one from the AT-authorised paper book, so the
// till NEVER re-issues it online afterwards. It only records what happened.
// ---------------------------------------------------------------------------

export interface NonFiscalFallbackAuditContext {
    /** Internal, non-fiscal reference printed on the slip. Never a fatura number. */
    slipReference: string;
    transactionId: string | null;
    /** Which backend could not issue, so the reminder can name the right steps. */
    provider: FiscalProvider;
    /** Why issuance was impossible — offline, backend error, missing ATCUD/QR. */
    reason: string;
    totalGross: number;
    /** Queue/order number shown to the customer, when the till issues one. */
    ticketNumber?: string | null;
}

/** The sale completed on a non-fiscal slip; a paper invoice is now owed. */
export async function logNonFiscalFallbackIssued(
    ctx: NonFiscalFallbackAuditContext,
    employeeId: string | null | undefined
): Promise<void> {
    await appendFiscalAuditEventTyped('NON_FISCAL_FALLBACK_ISSUED', { ...ctx }, employeeId);
}

export interface ManualDocumentAuditContext {
    /** Slip this paper document covers, tying the two together. */
    slipReference: string;
    transactionId: string | null;
    /** Series of the AT-authorised book — its own, never the software series. */
    manualSeries: string;
    manualNumber: string;
    /** ATCUD pre-printed in the book by the tipografia; we capture, never generate. */
    manualAtcud: string | null;
    issuedAt: string;
}

/** The operator recorded which paper document covered a fallback sale. */
export async function logManualDocumentRecorded(
    ctx: ManualDocumentAuditContext,
    employeeId: string | null | undefined
): Promise<void> {
    await appendFiscalAuditEventTyped('MANUAL_DOCUMENT_RECORDED', { ...ctx }, employeeId);
}

/**
 * Fallback slips still waiting for their paper document to be recorded.
 * Pairs NON_FISCAL_FALLBACK_ISSUED against MANUAL_DOCUMENT_RECORDED by
 * `slipReference`, so the reminder disappears as each one is reconciled.
 */
export function outstandingManualDocuments(
    events: { event_type: string; payload_json: string }[]
): NonFiscalFallbackAuditContext[] {
    const recorded = new Set<string>();
    const issued = new Map<string, NonFiscalFallbackAuditContext>();

    for (const event of events) {
        let payload: Record<string, unknown>;
        try {
            payload = JSON.parse(event.payload_json) as Record<string, unknown>;
        } catch {
            continue; // A malformed row must not hide the rest of the reminder.
        }
        const reference = typeof payload.slipReference === 'string' ? payload.slipReference : null;
        if (!reference) continue;

        if (event.event_type === 'MANUAL_DOCUMENT_RECORDED') recorded.add(reference);
        if (event.event_type === 'NON_FISCAL_FALLBACK_ISSUED') {
            issued.set(reference, payload as unknown as NonFiscalFallbackAuditContext);
        }
    }

    return [...issued.entries()]
        .filter(([reference]) => !recorded.has(reference))
        .map(([, context]) => context);
}
