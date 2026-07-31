// D-SAFT1: the SAF-T `<Header>` must describe the issuer as it was at issuance,
// not as the back office describes it today. Since 20260810000000 the company
// block is pulled from Supabase on every sync, so re-exporting a closed period
// could rewrite the header of a file already submitted to the AT.
//
// The second rule these tests carry: a period is ALWAYS exportable. Every
// ambiguity is disclosed and acknowledged, never refused — an operator who
// cannot produce a file cannot meet an AT deadline, and that outranks every
// header defect below.

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { buildSaftAuditFileXml } from '../../src/fiscal/saft/exportSaft';
import {
    deriveFiscalYear,
    deriveProductId,
    deriveSoftwareCertNumber,
    planSaftExport,
} from '../../src/fiscal/saft/saftHeaderProjection';
import { buildIssuerSnapshot } from '../../src/fiscal/issuerSnapshot';
import { APP_VERSION } from '../../src/lib/appVersion';
import {
    GOLDEN_SPECS,
    PERIOD_END,
    PERIOD_START,
    type DocSpec,
    headerSettings,
    issuerSnapshot,
    makeDocs,
    maskDateCreated,
} from './saftHeaderFixtures';

const GOLDEN = fs.readFileSync(path.join(__dirname, 'fixtures', 'saftGolden.xml'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
    version: string;
};

async function exportPeriod(
    specs: DocSpec[],
    period: { start: string; end: string } = { start: PERIOD_START, end: PERIOD_END }
): Promise<{ xml: string; plan: Awaited<ReturnType<typeof planSaftExport>>['plan'] }> {
    const { fiscalDocuments, loadTransaction } = makeDocs(specs);
    const { plan, loadTransactionCached } = await planSaftExport({
        settings: headerSettings,
        startDateYmd: period.start,
        endDateYmd: period.end,
        fiscalDocuments,
        loadTransaction,
    });
    const xml = await buildSaftAuditFileXml({
        settings: headerSettings,
        startDateYmd: period.start,
        endDateYmd: period.end,
        fiscalDocuments,
        loadTransaction: loadTransactionCached,
        loadCustomer: async () => undefined,
        productVersion: '0.1.0',
        headerIssuer: plan.headerIssuer,
    });
    return { xml, plan };
}

/** A second document in the golden period, one day later. */
function secondDoc(over: Partial<DocSpec> = {}): DocSpec {
    return {
        id: 'fid-g2',
        invoiceNo: 'FS A/0002',
        sequentialNumber: 2,
        invoiceDate: '2026-04-11',
        systemEntryDate: '2026-04-11T09:00:00',
        ...over,
    };
}

describe('D-SAFT1 — SAF-T Header frozen at issuance', () => {
    it('a period whose issuer never changed is byte-identical to the pre-fix export', async () => {
        // Legacy documents (no snapshot at all): must reproduce the committed golden,
        // which was generated from the exporter as it stood before this change.
        const legacy = await exportPeriod(GOLDEN_SPECS);
        expect(maskDateCreated(legacy.xml)).toBe(GOLDEN);
        expect(legacy.plan.headerIssuer).toBeUndefined();
        expect(legacy.plan.acknowledgement).toBeNull();

        // Snapshotted documents whose issuer equals today's settings: same file, to the
        // byte. Built with the production capture function so it cannot drift from the
        // fixture it is supposed to mirror.
        const captured = buildIssuerSnapshot(headerSettings);
        const snapshotted = await exportPeriod(GOLDEN_SPECS.map(s => ({ ...s, issuer: captured })));
        expect(snapshotted.plan.headerSource).toBe('snapshot');
        expect(snapshotted.plan.acknowledgement).toBeNull();
        expect(snapshotted.xml).toBe(legacy.xml);
    });

    it('the two ProductID inputs agree on shapes that can tell them apart', async () => {
        // One derivation now serves both branches, but the INPUTS still differ:
        // buildIssuerSnapshot pre-trims softwareInfo and the live company block does
        // not. Padding is the sharp case, and the byte-identity argument rests on it.
        const adversarial = [
            'Software ZSRest - www.zsrest.com',
            '  Padded POS  ',
            ' - leading hyphen',
            'x'.repeat(40),
            '',
            '   ',
        ];

        for (const softwareInfo of adversarial) {
            const settings = { ...headerSettings, company: { ...headerSettings.company, softwareInfo } };
            const { fiscalDocuments, loadTransaction } = makeDocs(GOLDEN_SPECS);
            const legacyXml = await buildSaftAuditFileXml({
                settings,
                startDateYmd: PERIOD_START,
                endDateYmd: PERIOD_END,
                fiscalDocuments,
                loadTransaction,
                loadCustomer: async () => undefined,
                productVersion: '0.1.0',
            });

            const captured = buildIssuerSnapshot(settings);
            const snap = makeDocs(GOLDEN_SPECS.map(s => ({ ...s, issuer: captured })));
            const { plan, loadTransactionCached } = await planSaftExport({
                settings,
                startDateYmd: PERIOD_START,
                endDateYmd: PERIOD_END,
                fiscalDocuments: snap.fiscalDocuments,
                loadTransaction: snap.loadTransaction,
            });
            const snapshotXml = await buildSaftAuditFileXml({
                settings,
                startDateYmd: PERIOD_START,
                endDateYmd: PERIOD_END,
                fiscalDocuments: snap.fiscalDocuments,
                loadTransaction: loadTransactionCached,
                loadCustomer: async () => undefined,
                productVersion: '0.1.0',
                headerIssuer: plan.headerIssuer,
            });

            expect(plan.headerSource).toBe('snapshot');
            expect(snapshotXml).toBe(legacyXml);
        }
    });

    it('a document issued under company A still exports as A after settings change to B', async () => {
        // headerSettings is company B (Test Lda / Rua 1 / 509999999 / TestPOS / cert 999).
        const { xml, plan } = await exportPeriod([
            {
                ...GOLDEN_SPECS[0],
                issuer: issuerSnapshot({
                    name: 'Old Name Lda',
                    address: 'Rua Antiga 9',
                    city: 'Porto',
                    postalCode: '4000-002',
                    taxNumber: '501234567',
                    softwareInfo: 'OldPOS',
                    softwareCertNumber: '77',
                }),
            },
        ]);

        expect(plan.headerSource).toBe('snapshot');
        expect(xml).toContain('<CompanyName>Old Name Lda</CompanyName>');
        expect(xml).toContain('<CompanyID>501234567</CompanyID>');
        expect(xml).toContain('<TaxRegistrationNumber>501234567</TaxRegistrationNumber>');
        expect(xml).toContain('<ProductCompanyTaxID>501234567</ProductCompanyTaxID>');
        expect(xml).toContain('<AddressDetail>Rua Antiga 9</AddressDetail>');
        expect(xml).toContain('<City>Porto</City>');
        expect(xml).toContain('<PostalCode>4000-002</PostalCode>');
        expect(xml).toContain('<ProductID>OldPOS</ProductID>');
        // Field 1.15 is frozen too: certifying the build must not rewrite the header of
        // a period that was closed before certification.
        expect(xml).toContain('<SoftwareCertificateNumber>77</SoftwareCertificateNumber>');

        // Not one byte of company B may reach a file describing company A.
        const header = xml.slice(xml.indexOf('<Header>'), xml.indexOf('</Header>'));
        expect(header).not.toContain('Test Lda');
        expect(header).not.toContain('509999999');
        expect(header).not.toContain('TestPOS');
        expect(header).not.toContain('Rua 1');
        expect(header).not.toContain('>999<');

        // Field 1.17 describes the build that PRODUCED the file, not the issuer, so it
        // is the one Header value that legitimately stays export-time live.
        expect(xml).toContain('<ProductVersion>0.1.0</ProductVersion>');
    });

    it('a period containing only legacy documents still exports, and says so', async () => {
        const { xml, plan } = await exportPeriod([GOLDEN_SPECS[0], secondDoc()]);

        expect(plan.headerSource).toBe('live-settings');
        expect(plan.headerIssuer).toBeUndefined();
        expect(plan.legacyCount).toBe(2);
        expect(plan.snapshotCount).toBe(0);
        expect(plan.documentCount).toBe(2);
        expect(plan.acknowledgement).toBeNull();
        expect(xml).toContain('<CompanyName>Test Lda</CompanyName>');
    });

    // FIX 1. The old behaviour threw SaftIssuerConflictError, which made the period
    // permanently unexportable — an operator legally obliged to file simply could not.
    it('two tax numbers in one period EXPORT after acknowledgement, and disclose both', async () => {
        const specs: DocSpec[] = [
            { ...GOLDEN_SPECS[0], issuer: issuerSnapshot({ taxNumber: '501234567', name: 'Old Name Lda' }) },
            secondDoc({ issuer: issuerSnapshot({ taxNumber: '509999999' }) }),
        ];

        const { xml, plan } = await exportPeriod(specs);
        const ack = plan.acknowledgement;

        expect(ack).not.toBeNull();
        expect(ack?.reasons).toContain('tax-number');
        expect(ack?.fields).toContain('taxNumber');
        expect(ack?.groups).toHaveLength(2);
        expect(ack?.groups.map(g => g.projection.taxNumberDigits)).toEqual(['501234567', '509999999']);
        expect(ack?.groups.map(g => g.count)).toEqual([1, 1]);
        expect(ack?.groups[0].firstInvoiceNo).toBe('FS A/0001');
        expect(ack?.groups[0].lastInvoiceNo).toBe('FS A/0001');
        expect(ack?.groups[1].firstInvoiceNo).toBe('FS A/0002');

        // The period-closing identity: the one the period ENDED under.
        expect(ack?.chosen?.taxNumberDigits).toBe('509999999');
        expect(ack?.rejected).toHaveLength(1);
        expect(ack?.rejected[0].projection.taxNumberDigits).toBe('501234567');
        expect(ack?.vouchingCount).toBe(1);

        // A file exists. That is the whole point of this fix.
        expect(xml).toContain('<CompanyID>509999999</CompanyID>');
        expect(xml).toContain('<CompanyName>Test Lda</CompanyName>');
    });

    it('a same-NIF change is reported and the period-closing identity wins', async () => {
        const { xml, plan } = await exportPeriod([
            { ...GOLDEN_SPECS[0], issuer: issuerSnapshot({ address: 'Rua Antiga 9' }) },
            secondDoc({ issuer: issuerSnapshot({ address: 'Rua Nova 4' }) }),
        ]);

        expect(plan.acknowledgement?.reasons).toEqual(['identity']);
        expect(plan.acknowledgement?.fields).toEqual(['address']);
        expect(plan.acknowledgement?.groups).toHaveLength(2);
        expect(plan.headerIssuer?.address).toBe('Rua Nova 4');
        expect(xml).toContain('<AddressDetail>Rua Nova 4</AddressDetail>');
    });

    it('the identity pick is order-independent when the emission sort ties', async () => {
        // Same day, same sequential_number on two different series: the emission sort
        // has a real tie, so only the total order makes the Header deterministic.
        const specs: DocSpec[] = [
            {
                id: 'fid-fs',
                invoiceNo: 'FS A/0001',
                sequentialNumber: 1,
                invoiceDate: '2026-04-10',
                systemEntryDate: '2026-04-10T08:00:00',
                issuer: issuerSnapshot({ name: 'Morning Lda' }),
            },
            {
                id: 'fid-nc',
                invoiceNo: 'NC A/0001',
                sequentialNumber: 1,
                invoiceType: 'NC',
                invoiceDate: '2026-04-10',
                systemEntryDate: '2026-04-10T17:00:00',
                issuer: issuerSnapshot({ name: 'Evening Lda' }),
            },
        ];

        const forward = await exportPeriod(specs);
        const reversed = await exportPeriod([...specs].reverse());

        expect(forward.plan.headerIssuer?.name).toBe('Evening Lda');
        expect(reversed.plan.headerIssuer).toEqual(forward.plan.headerIssuer);
        // FIX 10: the group representative follows the same total order, so reversing
        // the input cannot reorder or relabel what the operator is shown.
        expect(reversed.plan.acknowledgement?.groups).toEqual(forward.plan.acknowledgement?.groups);
    });

    // FIX 2. One snapshotted document among legacy ones used to set the whole Header
    // with no dialog at all.
    it('a minority snapshot sets the Header only behind an acknowledgement', async () => {
        const { xml, plan } = await exportPeriod([
            GOLDEN_SPECS[0],
            secondDoc({ issuer: issuerSnapshot({ name: 'Snapshot Lda' }) }),
        ]);

        expect(plan.headerSource).toBe('snapshot');
        expect(plan.snapshotCount).toBe(1);
        expect(plan.legacyCount).toBe(1);
        expect(plan.acknowledgement?.reasons).toEqual(['partial-snapshot']);
        // How many documents actually vouch for the header the file will carry.
        expect(plan.acknowledgement?.vouchingCount).toBe(1);
        expect(plan.acknowledgement?.documentCount).toBe(2);
        expect(xml).toContain('<CompanyName>Snapshot Lda</CompanyName>');
    });

    it('an all-snapshot period agreeing with itself needs no acknowledgement', async () => {
        const iss = issuerSnapshot({ name: 'Snapshot Lda' });
        const { plan } = await exportPeriod([
            { ...GOLDEN_SPECS[0], issuer: iss },
            secondDoc({ issuer: iss }),
        ]);

        expect(plan.acknowledgement).toBeNull();
        expect(plan.legacyCount).toBe(0);
    });

    it('an unusable snapshot falls to the legacy branch rather than emitting undefined', async () => {
        const cases: Array<Partial<DocSpec>> = [
            // A future v2 this build cannot read.
            { rawMetadata: JSON.stringify({ issuer: { ...issuerSnapshot(), v: 2 } }) },
            // Right version, wrong types.
            { rawMetadata: JSON.stringify({ issuer: { ...issuerSnapshot(), name: 123 } }) },
            // A v1 row written before softwareCertNumber joined the Header. Defaulting
            // it to '0' would rewrite a certified period's field 1.15 to uncertified.
            {
                rawMetadata: JSON.stringify({
                    issuer: (({ softwareCertNumber: _omitted, ...rest }) => rest)(issuerSnapshot()),
                }),
            },
            { rawMetadata: 'not json' },
            { rawMetadata: null },
        ];

        for (const over of cases) {
            const { xml, plan } = await exportPeriod([{ ...GOLDEN_SPECS[0], ...over }]);
            expect(plan.headerIssuer).toBeUndefined();
            expect(plan.legacyCount).toBe(1);
            expect(maskDateCreated(xml)).toBe(GOLDEN);
            expect(xml).not.toContain('undefined');
        }
    });

    // FIX 5. `typeof x === 'string'` accepted an all-blank snapshot, which emitted an
    // empty <CompanyID> into a legally submitted file.
    it('a blank identity is not an identity: the document falls back to legacy', async () => {
        const blanks: Array<Partial<Parameters<typeof issuerSnapshot>[0]>> = [
            { taxNumber: '   ' },
            { taxNumber: '' },
            { name: '' },
            { address: ' ' },
            { city: '' },
            { postalCode: '\t' },
            { name: '', address: '', city: '', postalCode: '', taxNumber: '' },
        ];

        for (const over of blanks) {
            const { xml, plan } = await exportPeriod([{ ...GOLDEN_SPECS[0], issuer: issuerSnapshot(over) }]);
            expect(plan.headerIssuer).toBeUndefined();
            expect(plan.snapshotCount).toBe(0);
            expect(plan.legacyCount).toBe(1);
            // The whole export still happens, and off the pre-fix code path.
            expect(maskDateCreated(xml)).toBe(GOLDEN);
            expect(xml).not.toContain('<CompanyID></CompanyID>');
        }
    });

    it('a blank NIF contributes no identity group, so it cannot manufacture a conflict', async () => {
        const { plan } = await exportPeriod([
            { ...GOLDEN_SPECS[0], issuer: issuerSnapshot({ taxNumber: '' }) },
            secondDoc({ issuer: issuerSnapshot({ taxNumber: '509999999' }) }),
        ]);

        expect(plan.acknowledgement?.reasons).toEqual(['partial-snapshot']);
        expect(plan.headerIssuer?.taxNumberDigits).toBe('509999999');
    });

    // The two fields that ship blank in SettingsContext's defaults must NOT disqualify
    // a snapshot, or a default-configured till silently reverts to live-settings
    // headers — the exact bug this module exists to prevent.
    it('a blank softwareInfo or certificate number still yields a usable snapshot', async () => {
        const { xml, plan } = await exportPeriod([
            { ...GOLDEN_SPECS[0], issuer: issuerSnapshot({ softwareInfo: '', softwareCertNumber: '' }) },
        ]);

        expect(plan.headerSource).toBe('snapshot');
        expect(plan.snapshotCount).toBe(1);
        expect(xml).toContain('<ProductID>POS</ProductID>');
        expect(xml).toContain('<SoftwareCertificateNumber>0</SoftwareCertificateNumber>');
    });

    it('a softwareInfo change raises the warning instead of silently rewriting ProductID', async () => {
        const { plan } = await exportPeriod([
            { ...GOLDEN_SPECS[0], issuer: issuerSnapshot({ softwareInfo: 'AlphaPOS' }) },
            secondDoc({ issuer: issuerSnapshot({ softwareInfo: 'BetaPOS' }) }),
        ]);

        expect(plan.acknowledgement?.fields).toEqual(['productId']);
    });

    // FIX 4. Certifying the build mid-period is a Header change like any other.
    it('a certificate-number change is disclosed and the closing value is used', async () => {
        const { xml, plan } = await exportPeriod([
            { ...GOLDEN_SPECS[0], issuer: issuerSnapshot({ softwareCertNumber: '0' }) },
            secondDoc({ issuer: issuerSnapshot({ softwareCertNumber: '1234' }) }),
        ]);

        expect(plan.acknowledgement?.fields).toEqual(['softwareCertNumber']);
        expect(xml).toContain('<SoftwareCertificateNumber>1234</SoftwareCertificateNumber>');
    });

    // FIX 3. FiscalYear used to come from the export form's end date, so a batch of
    // 2025 invoices could be filed under FiscalYear 2026.
    it('FiscalYear comes from the documents, not from the export form', async () => {
        const { xml, plan } = await exportPeriod(
            [
                {
                    id: 'fid-2025',
                    invoiceNo: 'FS A/0009',
                    sequentialNumber: 9,
                    invoiceDate: '2025-12-20',
                    systemEntryDate: '2025-12-20T12:00:00',
                },
            ],
            { start: '2025-12-01', end: '2026-04-30' }
        );

        expect(xml).toContain('<FiscalYear>2025</FiscalYear>');
        expect(xml).toContain('<InvoiceDate>2025-12-20</InvoiceDate>');
        expect(plan.fiscalYear).toBe('2025');
        expect(plan.fiscalYears).toEqual(['2025']);
        expect(plan.acknowledgement).toBeNull();
    });

    it('a batch spanning two fiscal years is surfaced instead of silently mislabelled', async () => {
        const { xml, plan } = await exportPeriod(
            [
                {
                    id: 'fid-2025',
                    invoiceNo: 'FS A/0009',
                    sequentialNumber: 9,
                    invoiceDate: '2025-12-20',
                    systemEntryDate: '2025-12-20T12:00:00',
                },
                GOLDEN_SPECS[0],
            ],
            { start: '2025-12-01', end: '2026-04-30' }
        );

        expect(plan.fiscalYears).toEqual(['2025', '2026']);
        expect(plan.acknowledgement?.reasons).toEqual(['multiple-fiscal-years']);
        expect(plan.acknowledgement?.fiscalYear).toBe('2026');
        expect(xml).toContain('<FiscalYear>2026</FiscalYear>');
    });

    it('an empty period keeps the end-date fallback, the one case that cannot contradict', () => {
        expect(deriveFiscalYear([], '2026-04-30')).toBe('2026');
    });

    // FIX 8. A document missing from a filed SAF-T is a fact the operator has to see.
    it('a fiscal row whose sale cannot be loaded is dropped and named', async () => {
        const { plan } = await exportPeriod([
            GOLDEN_SPECS[0],
            secondDoc({ missingTransaction: true }),
        ]);

        expect(plan.documentCount).toBe(1);
        expect(plan.droppedFiscalIds).toEqual(['fid-g2']);
        expect(plan.droppedInvoiceNos).toEqual(['FS A/0002']);
        expect(plan.includedFiscalIds).toEqual(['fid-g1']);
        // A drop must STOP the export for acknowledgement, not merely be
        // mentioned afterwards. Adversarial review found it could otherwise move
        // <FiscalYear> on its own: that field is derived from the documents that
        // loaded, so an unloadable December invoice silently relabels a Header
        // field of a file submitted to the AT. Reporting it in the post-export
        // success message is too late — the file is already written.
        expect(plan.acknowledgement?.reasons).toContain('dropped-documents');
        expect(plan.acknowledgement?.droppedInvoiceNos).toEqual(['FS A/0002']);
    });

    it('deriveProductId reproduces the live branch on every shape, trimmed or not', () => {
        // buildIssuerSnapshot pre-trims softwareInfo; the live company block does not.
        // The .trim() lands after the split, so both converge — which is why sourcing
        // ProductID from the snapshot cannot change a byte.
        for (const raw of ['', '  ', 'TestPOS', ' TestPOS ', 'Software ZSRest - www.zsrest.com', 'x'.repeat(40)]) {
            expect(deriveProductId(raw)).toBe(deriveProductId(raw.trim()));
        }
        expect(deriveProductId(undefined)).toBe('POS');
        expect(deriveProductId('')).toBe('POS');
        expect(deriveProductId('Software ZSRest - www.zsrest.com')).toBe('Software ZSRest');
    });

    it('deriveSoftwareCertNumber survives the same pre-trimmed/untrimmed pair', () => {
        // Whitespace-only is deliberately absent: it is the one input where the live
        // value ('' after stripping) and the pre-trimmed snapshot value ('0' via the
        // fallback) disagree. Keeping the pre-D-SAFT1 expression verbatim is worth
        // more than converging a value that is not schema-valid either way.
        for (const raw of ['', '999', ' 999 ', '0', '1/AT']) {
            expect(deriveSoftwareCertNumber(raw)).toBe(deriveSoftwareCertNumber(raw.trim()));
        }
        expect(deriveSoftwareCertNumber(undefined)).toBe('0');
        expect(deriveSoftwareCertNumber('')).toBe('0');
        expect(deriveSoftwareCertNumber(' 9 9 9 ')).toBe('999');
    });

    // FIX 6. Every filed document used to declare ProductVersion 0.1.0 against a
    // 0.1.10 build, misstating Portaria 302/2016 field 1.17.
    it('APP_VERSION is the real package version, resolved at runtime', () => {
        expect(APP_VERSION).toBe(pkg.version);
        expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    });
});
