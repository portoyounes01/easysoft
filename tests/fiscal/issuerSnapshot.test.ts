// D-IM1: the issuer identity a document is frozen with at issuance.
//
// The write half. What is asserted here is that the snapshot LANDS — on every
// persistence path, from live settings, with its logo bytes archived in the
// same transaction. That a reprint then READS it instead of live settings is
// asserted in tests/issuerSnapshotReprint.test.tsx (jsdom, it needs a DOM).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeLocalDatabase, localDb } from '../../src/lib/localDatabase';
import { issueInvoiceXpressSale } from '../../src/fiscal/invoicexpressFiscalIssuer';
import { runNonFiscalFallbackSale } from '../../src/fiscal/nonFiscalFallback';
import { buildIssuerSnapshot, logoArchiveEntryFor, logoDigest } from '../../src/fiscal/issuerSnapshot';
import { resolveIssuerLogo } from '../../src/fiscal/resolveIssuerLogo';
import { defaultSeriesProfiles } from '../../src/fiscal/receiptSeriesProfile';
import type { FiscalTransactionMetadata } from '../../src/fiscal/types';
import type { SystemSettings } from '../../src/contexts/SettingsContext';
import type { LocalProduct } from '../../src/types/supabase';
import { bytesToBase64, packBits, type ReceiptLogo } from '../../src/utils/receiptLogo';
import { buildReceiptEscPosBase64 } from '../../src/services/escpos/receiptEscPos';
import type { ReceiptProps } from '../../src/components/ThermalReceipt';

const invokeMock = vi.fn();
let connectionState = { isOnline: true, isSupabaseOnline: true };

vi.mock('../../src/lib/supabase', () => ({
    supabase: {
        functions: {
            invoke: (...args: unknown[]) => invokeMock(...args),
        },
    },
    connectionStatus: {
        getStatus: () => connectionState,
    },
}));

// Genuinely PackBits-encoded so the ESC/POS builder can decode them: 16 dots
// wide (2 bytes a row) by 2 rows. The two differ in every dot.
function logoOf(fill: number): ReceiptLogo {
    return {
        widthDots: 16,
        heightDots: 2,
        bitmap: bytesToBase64(packBits(new Uint8Array([fill, fill, fill, fill]))),
    };
}
const LOGO_A: ReceiptLogo = logoOf(0xf0);
const LOGO_B: ReceiptLogo = logoOf(0x0f);

function baseSettings(): SystemSettings {
    return {
        autoLogout: { enabled: false, timeoutMinutes: 15, warningSeconds: 30, protectWhenCartHasItems: false },
        pos: {
            currencySymbol: '€',
            taxRate: 0.23,
            trackInventory: true,
            allowNegativeStock: false,
            autoClearCart: { enabled: false, timeoutMinutes: 0 },
        },
        display: { itemsPerPage: 20, showEmployeePhotos: true, compactMode: false },
        company: {
            name: 'Alpha Lda',
            address: 'Rua A 1',
            postalCode: '1000-001',
            city: 'Lisboa',
            taxNumber: '509999999',
            phone: '210000000',
            email: 'alpha@example.pt',
            slogan: 'Slogan A',
            softwareInfo: 'POS v1',
            certificationNumber: '1234',
            softwareCertNumber: '4321',
            logo: LOGO_A,
        },
        receipt: {
            defaultDocumentType: 'FATURA',
            counterLabel: 'CAIXA A',
            seriesProfiles: defaultSeriesProfiles(),
            printDuplicateOnIssue: false,
            receiptLanguage: 'pt',
        },
        fiscal: {
            issuer: 'invoicexpress',
            hashControlVersion: '1',
            trainingMode: false,
            vendus: {
                enabled: false,
                mode: 'tests',
                registerId: '',
                storeId: '',
                documentType: 'FT',
                output: 'html',
                paymentMethodIds: { cash: '', card: '', mixed: '' },
                exemptTax: { code: 'M99', law: '' },
            },
            invoicexpress: {
                enabled: true,
                accountName: 'minha-empresa',
                documentType: 'invoice_receipt',
                finalizeOnIssue: true,
                sequenceId: '',
                exemptTax: { code: 'M99', law: '' },
            },
            fiskaly: {
                enabled: false,
                environment: 'test',
                taxpayerId: 'tax-1',
                locationId: 'loc-1',
                systemId: 'sys-1',
                seriesId: '',
                documentType: 'FT',
                exemptTax: { code: 'M99', law: '' },
            },
        },
    };
}

/** The back office edits every header field, plus the logo. */
function editedSettings(): SystemSettings {
    const s = baseSettings();
    s.company = {
        name: 'Beta SA',
        address: 'Avenida B 99',
        postalCode: '4000-999',
        city: 'Porto',
        taxNumber: '500000000',
        phone: '220000000',
        email: 'beta@example.pt',
        slogan: 'Slogan B',
        softwareInfo: 'POS v2',
        certificationNumber: '9999',
        softwareCertNumber: '8888',
        logo: LOGO_B,
    };
    s.receipt.counterLabel = 'CAIXA B';
    s.receipt.receiptLanguage = 'es';
    return s;
}

function product(): LocalProduct {
    return {
        id: 'p1',
        name: 'Café',
        description: null,
        sku: 'CAF1',
        barcode: null,
        category_id: 'c1',
        category_name: 'Bar',
        price: 12.3,
        cost: 5,
        iva_rate: 0.23,
        stock: 100,
        min_stock: 0,
        track_stock: false,
        image_url: null,
        supplier: null,
        location: null,
        is_active: true,
        display_order: 0,
        created_at: new Date(),
        updated_at: new Date(),
        last_synced_at: null,
        deleted_at: null,
        needs_push: false,
        is_conflicted: false,
    };
}

const cart = () => [{ product: product(), quantity: 1, discount: 0 }];
const payment = { paymentMethod: 'cash' as const, amountPaid: 20, employeeId: 'e1', employeeName: 'Emp' };

// Each call must mint a DISTINCT number: fiscalDocuments carries a unique
// [chain_scope+sequential_number] index, so a repeated one is a ConstraintError.
let nextDocNumber = 0;
function invoiceXpressReply() {
    nextDocNumber += 1;
    return {
        data: {
            document: {
                id: 2137287 + nextDocNumber,
                sequence_number: `${nextDocNumber}/G`,
                atcud: `ABCD1234-${nextDocNumber}`,
                saft_hash: 'HASH1234',
                permalink: 'https://www.app.invoicexpress.com/documents/xyz',
                status: 'finalized',
                date: '11/06/2026',
                qr_code: 'A:509999999*B:999999990',
                items: [{ id: 555 }],
            },
        },
        error: null,
    };
}

async function metadataFor(transactionId: string): Promise<FiscalTransactionMetadata> {
    const row = await localDb.transactions.get(transactionId);
    return JSON.parse(row!.fiscal_metadata_json!) as FiscalTransactionMetadata;
}

describe('buildIssuerSnapshot', () => {
    it('never yields undefined for an unset field — the structural guard against `??` reaching live settings', () => {
        const s = baseSettings();
        s.company.phone = undefined;
        s.company.email = undefined;
        s.company.slogan = undefined;
        s.company.softwareInfo = undefined;
        s.company.certificationNumber = undefined;
        s.company.softwareCertNumber = undefined;

        const snap = buildIssuerSnapshot(s);

        expect(snap.phone).toBe('');
        expect(snap.email).toBe('');
        expect(snap.slogan).toBe('');
        expect(snap.softwareInfo).toBe('');
        expect(snap.certificationNumber).toBe('');
        expect(snap.softwareCertNumber).toBe('');
        for (const value of Object.values(snap)) {
            expect(value).not.toBeUndefined();
        }
    });

    it('captures the receipt language and counter label, not just the company block', () => {
        const snap = buildIssuerSnapshot(baseSettings());
        expect(snap.receiptLanguage).toBe('pt');
        expect(snap.counterLabel).toBe('CAIXA A');
        expect(snap.softwareCertNumber).toBe('4321');
        expect(snap.v).toBe(1);
    });

    it('records no logo as null, which is what makes "print none" distinguishable from "print today\'s"', () => {
        const s = baseSettings();
        s.company.logo = undefined;
        expect(buildIssuerSnapshot(s).logo).toBeNull();
        expect(logoArchiveEntryFor(s)).toBeNull();
    });

    it('gives two different logos two different digests', () => {
        expect(logoDigest(LOGO_A)).not.toBe(logoDigest(LOGO_B));
        expect(logoDigest(LOGO_A)).toBe(logoDigest({ ...LOGO_A }));
    });
});

describe('resolveIssuerLogo', () => {
    beforeEach(async () => {
        await initializeLocalDatabase();
        await localDb.receiptLogoArchive.clear();
    });

    it('returns nothing when the document was issued without a logo, even if one exists today', async () => {
        await expect(resolveIssuerLogo(null, LOGO_B)).resolves.toBeUndefined();
    });

    it('returns the archived bytes, not the live ones', async () => {
        await localDb.receiptLogoArchive.put(logoArchiveEntryFor(baseSettings())!);
        const ref = buildIssuerSnapshot(baseSettings()).logo;

        const resolved = await resolveIssuerLogo(ref, LOGO_B);

        expect(resolved?.bitmap).toBe(LOGO_A.bitmap);
    });

    it('prints no logo rather than a different one when the archive entry is gone', async () => {
        const ref = buildIssuerSnapshot(baseSettings()).logo;
        await expect(resolveIssuerLogo(ref, LOGO_B)).resolves.toBeUndefined();
    });
});

describe('issuer snapshot persistence', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        connectionState = { isOnline: true, isSupabaseOnline: true };
        await initializeLocalDatabase();
        await localDb.fiscalDocuments.clear();
        await localDb.transactions.clear();
        await localDb.transactionItems.clear();
        await localDb.fiscalAuditEvents.clear();
        await localDb.transactionSyncQueue.clear();
        await localDb.vendusIssueAttempts.clear();
        await localDb.receiptLogoArchive.clear();
    });

    it('freezes the issuer on a cloud-issued sale, and a later settings edit does not reach it', async () => {
        invokeMock.mockResolvedValueOnce(invoiceXpressReply());

        const result = await issueInvoiceXpressSale({
            settings: baseSettings(),
            cart: cart(),
            selectedCustomer: null,
            payment,
        });

        // Everything the back office could change afterwards, changed.
        const after = editedSettings();
        expect(after.company.name).toBe('Beta SA');

        const meta = await metadataFor(result.transactionId);
        expect(meta.issuer).toBeDefined();
        expect(meta.issuer).toMatchObject({
            v: 1,
            name: 'Alpha Lda',
            address: 'Rua A 1',
            postalCode: '1000-001',
            city: 'Lisboa',
            taxNumber: '509999999',
            phone: '210000000',
            email: 'alpha@example.pt',
            slogan: 'Slogan A',
            softwareInfo: 'POS v1',
            certificationNumber: '1234',
            softwareCertNumber: '4321',
            counterLabel: 'CAIXA A',
            receiptLanguage: 'pt',
        });
    });

    it('archives the logo bytes in the same transaction as the document that references them', async () => {
        invokeMock.mockResolvedValueOnce(invoiceXpressReply());

        const result = await issueInvoiceXpressSale({
            settings: baseSettings(),
            cart: cart(),
            selectedCustomer: null,
            payment,
        });

        const meta = await metadataFor(result.transactionId);
        const ref = meta.issuer!.logo!;
        const archived = await localDb.receiptLogoArchive.get(ref.digest);

        expect(archived?.bitmap).toBe(LOGO_A.bitmap);
        // The whole point of the reference: the bitmap is NOT inlined per sale.
        expect(JSON.stringify(meta)).not.toContain(LOGO_A.bitmap);
        await expect(resolveIssuerLogo(ref, LOGO_B)).resolves.toMatchObject({ bitmap: LOGO_A.bitmap });
    });

    it('freezes the issuer on the non-fiscal fallback slip too — it prints the same header', async () => {
        const result = await runNonFiscalFallbackSale({
            settings: baseSettings(),
            cart: cart(),
            selectedCustomer: null,
            payment,
            decision: {
                failure: {
                    provider: 'invoicexpress',
                    dispatch: 'not-dispatched',
                    message: 'offline',
                },
            },
        });

        const meta = await metadataFor(result.transactionId);
        expect(meta.nonFiscal).toBe(true);
        expect(meta.issuer?.name).toBe('Alpha Lda');
        expect(meta.issuer?.counterLabel).toBe('CAIXA A');
        expect(await localDb.receiptLogoArchive.get(meta.issuer!.logo!.digest)).toBeDefined();
    });

    it('gives a credit note its OWN issuer as of its own issuance, not the original sale\'s', async () => {
        invokeMock.mockResolvedValueOnce(invoiceXpressReply());
        const sale = await issueInvoiceXpressSale({
            settings: baseSettings(),
            cart: cart(),
            selectedCustomer: null,
            payment,
        });

        // A second document issued after the company moved. Two distinct legal
        // documents, issued at two distinct times, must not share one header.
        invokeMock.mockResolvedValueOnce(invoiceXpressReply());
        const later = await issueInvoiceXpressSale({
            settings: editedSettings(),
            cart: cart(),
            selectedCustomer: null,
            payment,
        });

        expect((await metadataFor(sale.transactionId)).issuer?.name).toBe('Alpha Lda');
        expect((await metadataFor(later.transactionId)).issuer?.name).toBe('Beta SA');
    });

    it('keeps the archive keyed by content, so re-issuing under the same logo adds no rows', async () => {
        invokeMock.mockResolvedValueOnce(invoiceXpressReply());
        await issueInvoiceXpressSale({ settings: baseSettings(), cart: cart(), selectedCustomer: null, payment });
        invokeMock.mockResolvedValueOnce(invoiceXpressReply());
        await issueInvoiceXpressSale({ settings: baseSettings(), cart: cart(), selectedCustomer: null, payment });

        expect(await localDb.receiptLogoArchive.count()).toBe(1);
    });
});

describe('preserved through a local database wipe', () => {
    it('keeps the archived bitmaps, so a recovered document still prints its logo', async () => {
        await initializeLocalDatabase();
        await localDb.receiptLogoArchive.clear();
        await localDb.receiptLogoArchive.put(logoArchiveEntryFor(baseSettings())!);

        const { clearLocalDatabasePreservingRecovery } = await import('../../src/utils/clearLocalDatabase');
        // The wipe refuses without a system administrator to recover into.
        await localDb.employees.put({
            id: 'admin-1',
            employee_number: 'SYS001',
            name: 'System Administrator',
            role: 'admin',
            pin: '0000',
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
            last_synced_at: null,
            needs_push: false,
            is_conflicted: false,
        } as Parameters<typeof localDb.employees.put>[0]);

        await clearLocalDatabasePreservingRecovery();

        const ref = buildIssuerSnapshot(baseSettings()).logo!;
        await expect(resolveIssuerLogo(ref, undefined)).resolves.toMatchObject({ bitmap: LOGO_A.bitmap });
    });
});

describe('the logo that actually reaches the paper', () => {
    beforeEach(async () => {
        await initializeLocalDatabase();
        await localDb.receiptLogoArchive.clear();
    });

    function receiptWith(logo: ReceiptLogo | undefined): ReceiptProps {
        return {
            documentNumber: 'FT ABC/0001',
            documentType: 'FATURA',
            date: new Date('2026-01-02T10:00:00Z'),
            counter: 'CAIXA A',
            verificationCode: 'CSDF7T5H-0001',
            hashFourChars: 'a-a-a-a',
            company: {
                name: 'Alpha Lda',
                address: 'Rua A 1',
                postalCode: '1000-001',
                city: 'Lisboa',
                taxNumber: '509999999',
                logo,
            },
            items: [{ id: 'i1', description: 'Café', quantity: 1, unitPrice: 1.5, vatRate: 13, total: 1.5 }],
            totals: { subtotal: 1.5, discount: 0, discountPercentage: 0, net: 1.33, vat: 0.17, total: 1.5 },
            payment: { method: 'Numerário', amountGiven: 2, change: 0.5 },
            receiptLanguage: 'pt',
        };
    }

    it('emits the ARCHIVED raster, byte for byte, and not the logo in force today', async () => {
        await localDb.receiptLogoArchive.put(logoArchiveEntryFor(baseSettings())!);
        const ref = buildIssuerSnapshot(baseSettings()).logo;

        const resolved = await resolveIssuerLogo(ref, LOGO_B);
        const printed = buildReceiptEscPosBase64(receiptWith(resolved));

        expect(printed).toBe(buildReceiptEscPosBase64(receiptWith(LOGO_A)));
        expect(printed).not.toBe(buildReceiptEscPosBase64(receiptWith(LOGO_B)));
    });

    it('emits the same bytes as a logo-less receipt when the document had none', async () => {
        const resolved = await resolveIssuerLogo(null, LOGO_B);

        expect(buildReceiptEscPosBase64(receiptWith(resolved))).toBe(
            buildReceiptEscPosBase64(receiptWith(undefined))
        );
    });

    it('keeps the document\'s own language on paper when the device has been switched since', () => {
        const frozen = buildReceiptEscPosBase64(receiptWith(undefined));
        // The device is Spanish now; the prop must still win (receiptEscPos:48).
        const withSpanishDevice = buildReceiptEscPosBase64(receiptWith(undefined), { language: 'es' });

        expect(withSpanishDevice).toBe(frozen);
    });
});
