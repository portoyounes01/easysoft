// D-SAFT1: which issuer the SAF-T `<Header>` declares, decided from the documents
// themselves rather than from whatever the company block happens to say today.
//
// Portaria 302/2016 Anexo I, tabela 1 defines the Header as "informação geral
// alusiva ao sujeito passivo a que respeita o SAF-T (PT)" — one taxable person,
// one Header, one file. Since 20260810000000 the company block is pulled from
// Supabase on every sync, so re-exporting a closed period could silently produce
// a file whose header disagrees with the paper the customer was handed.
//
// This module never refuses to produce a file. An operator under an AT deadline
// who cannot export at all has no remedy; an operator holding a file that
// discloses which identity it declared, and which it did not, has one. Every
// ambiguity therefore becomes an acknowledgement the operator must sign off,
// never a hard stop.
//
// This module imports no database and no React. It is pulled into a node-run test
// suite, and `exportSaft` was already broken once by an import that reached
// `supabase.ts`'s module-scope `window`. Keep it to types.

import type { SystemSettings } from '../../contexts/SettingsContext';
import type { LocalFiscalDocument, LocalTransaction, LocalTransactionItem } from '../../types/supabase';
import type { FiscalIssuerSnapshot, FiscalTransactionMetadata } from '../types';

type LoadedTransaction = LocalTransaction & { items: LocalTransactionItem[] };

/**
 * The Header values that come from a PER-DOCUMENT source, already rendered
 * exactly as `exportSaft` emits them (pre-XML-escape).
 *
 * THE RULE, and the reason `productId` is in here: two documents belong to the
 * same group IFF they would produce IDENTICAL Header bytes. Anything the Header
 * takes from a document must be in this tuple, or a change to it alters a closed
 * period's XML with no warning. `productVersion` is deliberately absent — it
 * describes the build that GENERATES the file (Portaria 302/2016 field 1.17),
 * not the issuer, and stays export-time live. Do not "tidy" the derived fields
 * out of this type.
 */
export interface SaftHeaderProjection {
    /** Feeds CompanyID, TaxRegistrationNumber and ProductCompanyTaxID alike. */
    taxNumberDigits: string;
    name: string;
    address: string;
    city: string;
    postalCode: string;
    /** ALREADY derived, not raw softwareInfo. */
    productId: string;
    /** ALREADY derived, not raw softwareCertNumber. */
    softwareCertNumber: string;
}

/** The one and only ProductID derivation; `exportSaft` calls this on both branches. */
export function deriveProductId(softwareInfo: string | null | undefined): string {
    return (softwareInfo || 'POS').split('-')[0].trim().slice(0, 32) || 'POS';
}

/**
 * The one and only SoftwareCertificateNumber derivation.
 *
 * Deliberately the pre-D-SAFT1 expression, character for character: the legacy
 * branch feeds it the same live value it always did, so a period with no
 * snapshots is byte-identical by construction rather than by comparison.
 */
export function deriveSoftwareCertNumber(raw: string | null | undefined): string {
    return (raw || '0').replace(/\s/g, '');
}

export function projectionFromSnapshot(iss: FiscalIssuerSnapshot): SaftHeaderProjection {
    return {
        taxNumberDigits: iss.taxNumber.replace(/\s/g, ''),
        name: iss.name,
        address: iss.address,
        city: iss.city,
        postalCode: iss.postalCode,
        productId: deriveProductId(iss.softwareInfo),
        softwareCertNumber: deriveSoftwareCertNumber(iss.softwareCertNumber),
    };
}

/** JSON.stringify of the ordered tuple — no separator can collide with a field value. */
export function projectionKey(p: SaftHeaderProjection): string {
    return JSON.stringify([
        p.taxNumberDigits,
        p.name,
        p.address,
        p.city,
        p.postalCode,
        p.productId,
        p.softwareCertNumber,
    ]);
}

/**
 * Every field `SaftHeaderProjection` reads. A snapshot missing one of these is
 * rejected whole, so a v1 row written before the field existed takes the legacy
 * branch and keeps the pre-D-SAFT1 bytes, rather than defaulting the Header to a
 * value nobody issued under.
 */
const SNAPSHOT_STRING_FIELDS = [
    'name',
    'address',
    'postalCode',
    'city',
    'taxNumber',
    'softwareInfo',
    'softwareCertNumber',
] as const;

/**
 * The snapshot fields the Header emits with NO fallback of their own. Blank in
 * any of them is not a captured identity, it is a missing one.
 *
 * `softwareInfo` and `softwareCertNumber` are deliberately out: both have a
 * defined fallback ('POS' / '0'), and `softwareInfo` ships blank in
 * SettingsContext's defaults — gating on it would reject every snapshot a
 * default-configured till ever wrote and quietly restore the very bug this
 * module exists to fix.
 */
const REQUIRED_IDENTITY_FIELDS = ['name', 'address', 'postalCode', 'city', 'taxNumber'] as const;

/**
 * Returns the snapshot ONLY if it is wholly usable; otherwise null (= legacy).
 *
 * The sweep is a validity GATE on the whole object, not a per-field fallback: a
 * malformed snapshot is rejected entirely and the document takes the live branch,
 * so neither the string "undefined" nor an empty `<CompanyID>` can reach a
 * submitted file. One branch on the whole snapshot is also D-IM1's rule —
 * `iss?.name ?? settings…` would be the original defect surviving inside its own
 * fix.
 */
export function readIssuerSnapshot(tx: LoadedTransaction): FiscalIssuerSnapshot | null {
    const src: unknown = (tx as { fiscal_metadata_json?: unknown }).fiscal_metadata_json;
    if (src == null) return null;
    let meta: FiscalTransactionMetadata | null = null;
    try {
        // Server column is JSONB (already parsed); the local Dexie column is TEXT.
        meta = (typeof src === 'string' ? JSON.parse(src) : src) as FiscalTransactionMetadata;
    } catch {
        return null;
    }
    const iss = meta?.issuer;
    if (!iss || typeof iss !== 'object') return null;
    // A future v2 falls to legacy rather than interpolating undefined into a
    // submitted file. Whoever writes v2 extends this in the same commit.
    if (iss.v !== 1) return null;
    const fields = iss as unknown as Record<string, unknown>;
    for (const f of SNAPSHOT_STRING_FIELDS) {
        if (typeof fields[f] !== 'string') return null;
    }
    for (const f of REQUIRED_IDENTITY_FIELDS) {
        if ((fields[f] as string).trim() === '') return null;
    }
    return iss;
}

/**
 * TOTAL order. `sequential_number` is per-series, so an FS and an NC on one day
 * have independent numbers and the emission sort has real ties — a non-total
 * order lets the Header flip between two re-exports of the same period, which
 * defeats the entire fix. `system_entry_date` is a full timestamp and
 * `invoice_no` is unique.
 *
 * THIS IS NOT THE EMISSION ORDER. `exportSaft`'s `(invoice_date,
 * sequential_number)` sort is untouched — changing it would reorder `<Invoice>`
 * blocks and break byte-identity on its own. Do not collapse the two.
 */
export function compareTotal(a: LocalFiscalDocument, b: LocalFiscalDocument): number {
    return (
        a.invoice_date.localeCompare(b.invoice_date) ||
        a.system_entry_date.localeCompare(b.system_entry_date) ||
        a.invoice_no.localeCompare(b.invoice_no)
    );
}

/** Distinct fiscal years among the documents that will actually be in the file, ascending. */
export function fiscalYearsOf(docs: LocalFiscalDocument[]): string[] {
    return [...new Set(docs.map(d => d.invoice_date.slice(0, 4)))].sort();
}

/**
 * `<FiscalYear>` (Portaria 302/2016 field 1.9) describes the documents in the
 * file, not the dates typed into the export form — those can disagree, and a
 * FiscalYear of 2026 over an InvoiceDate of 2025-12-20 is a filed contradiction.
 *
 * The period-closing year, matching the period-closing identity. The end-date
 * fallback only applies when there is nothing inside to describe, which is also
 * the one case where it cannot contradict anything.
 */
export function deriveFiscalYear(docs: LocalFiscalDocument[], endDateYmd: string): string {
    const years = fiscalYearsOf(docs);
    return years.length > 0 ? years[years.length - 1] : endDateYmd.slice(0, 4);
}

export interface SaftDocumentGroup {
    projection: SaftHeaderProjection;
    count: number;
    firstInvoiceNo: string;
    firstInvoiceDate: string;
    lastInvoiceNo: string;
    lastInvoiceDate: string;
}

export type SaftDivergentField =
    | 'taxNumber'
    | 'name'
    | 'address'
    | 'city'
    | 'postalCode'
    | 'productId'
    | 'softwareCertNumber';

/** Insertion order is the order the operator reads them in; keep it stable. */
const DIVERGENT_FIELD_READERS: Record<SaftDivergentField, (p: SaftHeaderProjection) => string> = {
    taxNumber: p => p.taxNumberDigits,
    name: p => p.name,
    address: p => p.address,
    city: p => p.city,
    postalCode: p => p.postalCode,
    productId: p => p.productId,
    softwareCertNumber: p => p.softwareCertNumber,
};

export type SaftAcknowledgementReason =
    /** Two taxable persons in one period. The file can only declare one. */
    | 'tax-number'
    /** One taxable person, but the company block changed mid-period. */
    | 'identity'
    /** The Header comes from a snapshot while documents that vouch for none are also in the file. */
    | 'partial-snapshot'
    /** SAF-T is one fiscal year per file; this batch is not. */
    | 'multiple-fiscal-years'
    /**
     * A document in range could not be loaded and is absent from the file.
     * Worth stopping for on its own, because the drop is not merely a missing
     * row: `<FiscalYear>` is derived from the documents that DID load, so an
     * unloadable December invoice can move a Header field with nothing else on
     * screen to explain it. A file submitted to the AT must not lose a document
     * silently.
     */
    | 'dropped-documents';

/**
 * What the operator must be told, and acknowledge, BEFORE a file exists.
 *
 * Every field here is also written to the SAFT_EXPORTED payload, so the audit
 * trail records the decision that was actually put in front of a human rather
 * than the bare fact that something was decided.
 */
export interface SaftExportAcknowledgement {
    reasons: SaftAcknowledgementReason[];
    /** Header fields that differ across the identities found; empty when none do. */
    fields: SaftDivergentField[];
    /** Every distinct identity found, ordered by `compareTotal` of its first document. */
    groups: SaftDocumentGroup[];
    /** The identity the Header will declare: the one the period ENDED under. */
    chosen: SaftHeaderProjection | undefined;
    /** The identities present in the period that the Header will NOT declare. */
    rejected: SaftDocumentGroup[];
    /** How many documents in the file actually vouch for `chosen`. */
    vouchingCount: number;
    documentCount: number;
    snapshotCount: number;
    legacyCount: number;
    /** Ascending. More than one is the `multiple-fiscal-years` reason. */
    fiscalYears: string[];
    /** The single year the file will declare. */
    fiscalYear: string;
    droppedInvoiceNos: string[];
}

export interface SaftExportPlan {
    headerSource: 'live-settings' | 'snapshot';
    /** undefined => exportSaft runs today's live-settings expressions verbatim. */
    headerIssuer: SaftHeaderProjection | undefined;
    /** Documents that will actually appear in the file. */
    documentCount: number;
    snapshotCount: number;
    legacyCount: number;
    fiscalYear: string;
    fiscalYears: string[];
    /** null => nothing to disclose, export straight through. */
    acknowledgement: SaftExportAcknowledgement | null;
    includedFiscalIds: string[];
    /** In range but no `transaction_id`, or the transaction did not load. */
    droppedFiscalIds: string[];
    /** The same documents by the number the operator would recognise them by. */
    droppedInvoiceNos: string[];
}

export interface PlanSaftExportParams {
    settings: SystemSettings;
    startDateYmd: string;
    endDateYmd: string;
    fiscalDocuments: LocalFiscalDocument[];
    loadTransaction: (transactionId: string) => Promise<LoadedTransaction | undefined>;
}

interface SnapshottedDoc {
    fiscal: LocalFiscalDocument;
    projection: SaftHeaderProjection;
}

/**
 * The representative is the `compareTotal`-first member, never insertion order.
 * Members are grouped by `projectionKey`, so they already hold equal projections;
 * reading it off the ordered head keeps that true if the key is ever narrowed.
 */
function summarize(members: SnapshottedDoc[]): SaftDocumentGroup {
    const ordered = [...members].sort((a, b) => compareTotal(a.fiscal, b.fiscal));
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    return {
        projection: first.projection,
        count: ordered.length,
        firstInvoiceNo: first.fiscal.invoice_no,
        firstInvoiceDate: first.fiscal.invoice_date,
        lastInvoiceNo: last.fiscal.invoice_no,
        lastInvoiceDate: last.fiscal.invoice_date,
    };
}

/**
 * One grouping pass, keyed by the whole projection. Every member of a group then
 * holds an identical projection by construction, so no representative can be
 * arbitrary — and the tax-number question is answered by reading the groups.
 */
function groupByProjection(docs: SnapshottedDoc[]): SaftDocumentGroup[] {
    const byKey = new Map<string, SnapshottedDoc[]>();
    for (const d of docs) {
        const k = projectionKey(d.projection);
        const bucket = byKey.get(k);
        if (bucket) bucket.push(d);
        else byKey.set(k, [d]);
    }
    return [...byKey.values()]
        .map(members => ({ members, ordered: [...members].sort((a, b) => compareTotal(a.fiscal, b.fiscal)) }))
        // Insertion order is the caller's array order, which is not a fact about the
        // period; `compareTotal` on the head document is.
        .sort((a, b) => compareTotal(a.ordered[0].fiscal, b.ordered[0].fiscal))
        .map(g => summarize(g.members));
}

/**
 * Decides which issuer the file's single `<Header>` declares, and reports
 * everything the operator has to be shown before the file is written.
 *
 * It never throws on divergent issuers. A period that cannot be exported is a
 * period that cannot be filed, and no header defect is worth an operator missing
 * an AT deadline over — so the ambiguity is disclosed, acknowledged and recorded
 * instead.
 */
export async function planSaftExport(params: PlanSaftExportParams): Promise<{
    plan: SaftExportPlan;
    /** Pass as `exportSaft`'s `loadTransaction`: zero extra I/O, identical objects. */
    loadTransactionCached: (transactionId: string) => Promise<LoadedTransaction | undefined>;
}> {
    const { startDateYmd, endDateYmd, fiscalDocuments, loadTransaction } = params;

    // Deliberately the same filter and sort `exportSaft` applies: the cache must be
    // populated over exactly the documents the builder will iterate.
    const docs = fiscalDocuments
        .filter(d => d.invoice_date >= startDateYmd && d.invoice_date <= endDateYmd)
        .sort((a, b) => {
            const c = a.invoice_date.localeCompare(b.invoice_date);
            return c !== 0 ? c : a.sequential_number - b.sequential_number;
        });

    const cache = new Map<string, LoadedTransaction>();
    const includedFiscalIds: string[] = [];
    const droppedFiscalIds: string[] = [];
    const droppedInvoiceNos: string[] = [];
    const loaded: { fiscal: LocalFiscalDocument; tx: LoadedTransaction }[] = [];

    for (const fiscal of docs) {
        const tx = fiscal.transaction_id ? await loadTransaction(fiscal.transaction_id) : undefined;
        if (!fiscal.transaction_id || !tx) {
            droppedFiscalIds.push(fiscal.id);
            droppedInvoiceNos.push(fiscal.invoice_no);
            continue;
        }
        cache.set(fiscal.transaction_id, tx);
        includedFiscalIds.push(fiscal.id);
        loaded.push({ fiscal, tx });
    }

    const loadTransactionCached = async (transactionId: string) => cache.get(transactionId);

    const includedDocs = loaded.map(l => l.fiscal);
    const fiscalYears = fiscalYearsOf(includedDocs);
    const fiscalYear = deriveFiscalYear(includedDocs, endDateYmd);

    const snapshotted: SnapshottedDoc[] = [];
    let legacyCount = 0;
    for (const { fiscal, tx } of loaded) {
        const iss = readIssuerSnapshot(tx);
        if (!iss) {
            legacyCount += 1;
            continue;
        }
        snapshotted.push({ fiscal, projection: projectionFromSnapshot(iss) });
    }

    const base = {
        documentCount: loaded.length,
        snapshotCount: snapshotted.length,
        legacyCount,
        fiscalYear,
        fiscalYears,
        includedFiscalIds,
        droppedFiscalIds,
        droppedInvoiceNos,
    };

    const groups = groupByProjection(snapshotted);
    // `undefined`, never a projection built from settings: absence is what makes the
    // all-legacy path byte-identical by construction rather than by comparison.
    const chosen =
        snapshotted.length > 0
            ? [...snapshotted].sort((a, b) => compareTotal(a.fiscal, b.fiscal))[snapshotted.length - 1].projection
            : undefined;
    const chosenKey = chosen ? projectionKey(chosen) : null;

    const reasons: SaftAcknowledgementReason[] = [];
    if (new Set(groups.map(g => g.projection.taxNumberDigits)).size > 1) reasons.push('tax-number');
    // Superseded by 'tax-number': a period spanning two taxable persons is one
    // statement to make, not two.
    else if (groups.length > 1) reasons.push('identity');
    // A single snapshotted document among legacy ones sets the whole Header. That
    // must never happen without the operator being told how thin the evidence is.
    if (chosen && legacyCount > 0) reasons.push('partial-snapshot');
    if (fiscalYears.length > 1) reasons.push('multiple-fiscal-years');
    if (droppedInvoiceNos.length > 0) reasons.push('dropped-documents');

    const acknowledgement: SaftExportAcknowledgement | null =
        reasons.length === 0
            ? null
            : {
                  reasons,
                  fields: (Object.keys(DIVERGENT_FIELD_READERS) as SaftDivergentField[]).filter(
                      f => new Set(groups.map(g => DIVERGENT_FIELD_READERS[f](g.projection))).size > 1
                  ),
                  groups,
                  chosen,
                  rejected: groups.filter(g => projectionKey(g.projection) !== chosenKey),
                  vouchingCount: snapshotted.filter(d => projectionKey(d.projection) === chosenKey).length,
                  documentCount: loaded.length,
                  snapshotCount: snapshotted.length,
                  legacyCount,
                  fiscalYears,
                  fiscalYear,
                  droppedInvoiceNos,
              };

    return {
        plan: {
            ...base,
            headerSource: chosen ? 'snapshot' : 'live-settings',
            headerIssuer: chosen,
            acknowledgement,
        },
        loadTransactionCached,
    };
}
