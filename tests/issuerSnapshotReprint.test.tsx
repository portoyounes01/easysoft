// D-IM1: the read half. An issued document reprints as ITSELF.
//
// Every assertion here is paired: the frozen value is present AND the live one
// is absent. Presence alone would still pass with a per-field `?? settings.…`
// chain, which is the one implementation mistake this whole design is shaped to
// prevent — only absence-of-live discriminates.

import { describe, test, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Transactions from '../src/pages/Transactions';
import { LanguageProvider } from '../src/contexts/LanguageContext';
import { SettingsProvider } from '../src/contexts/SettingsContext';
import { DesignSystem2CustomizationProvider } from '../src/contexts/DesignSystem2CustomizationContext';
import type { FiscalIssuerSnapshot } from '../src/fiscal/types';

vi.mock('../src/lib/supabase', () => ({
    isSupabaseConfigured: () => true,
}));

vi.mock('../src/contexts/SupabaseAuthContext', () => ({
    useSupabaseAuth: () => ({
        employee: { id: 'EMP003', name: 'Cashier 1', employee_number: '003' },
        isAuthenticated: true,
        isLoading: false,
        error: null,
        user: null,
        session: null,
        signInWithEmailAndPassword: vi.fn(),
        signInWithEmployeeCredentials: vi.fn(),
        signOut: vi.fn(),
        hasPermission: () => true,
        refreshEmployeeSession: vi.fn(),
        clearError: vi.fn(),
    }),
}));

vi.mock('../src/utils/qrCode', () => ({
    generateQRCodeImage: vi.fn().mockResolvedValue('data:image/png;base64,xx'),
}));

vi.mock('../src/contexts/POSContext', () => ({
    usePOS: () => ({ processTransaction: vi.fn() }),
}));

const archiveGet = vi.fn();

vi.mock('../src/lib/localDatabase', () => ({
    initializeLocalDatabase: vi.fn().mockResolvedValue(undefined),
    localDb: {
        receiptLogoArchive: { get: (...args: unknown[]) => archiveGet(...args) },
    },
    customerLocalService: {
        getCustomerById: vi.fn().mockResolvedValue(undefined),
    },
    transactionLocalService: {
        getAllTransactions: vi.fn().mockResolvedValue([]),
        getTransactionById: vi.fn().mockResolvedValue(undefined),
        getFiscalDocumentById: vi.fn().mockResolvedValue(undefined),
        hasCreditNoteForOriginalTransaction: vi.fn().mockResolvedValue(false),
        hasReciboForOriginalTransaction: vi.fn().mockResolvedValue(false),
        appendFiscalAuditEvent: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('../src/fiscal/creditNoteCheckout', () => ({
    runFiscalCreditNoteForTransaction: vi.fn(),
}));

import { transactionLocalService } from '../src/lib/localDatabase';

const REMOTE_ROW = {
    id: 'trx-1',
    transaction_number: 'TXN-001',
    receipt_number: 'ABC-202508-1001',
    transaction_date: '2025-08-25',
    transaction_time: '12:34',
    customer_name: '',
    customer_id: null,
    transaction_items: [
        { id: 'i1', product_name: 'Coffee', quantity: 1, unit_price: 1.5, line_total: 1.5, iva_rate: 0.13 },
    ],
    subtotal: 1.5,
    discount: 0,
    tax: 0.35,
    total: 1.85,
    payment_method: 'cash',
    amount_paid: 2,
    change_given: 0.15,
    status: 'completed',
    employee_name: 'Cashier 1',
    employee_id: 'EMP003',
};

vi.mock('../src/services/transactionService', () => ({
    transactionService: {
        getTransactions: vi.fn(async () => [REMOTE_ROW]),
        getTransactionById: vi.fn(async () => REMOTE_ROW),
    },
}));

const LOGO_A_BITMAP = 'QUFBQUFBQUE=';

/** Company A, as the document was issued. */
const ISSUER_A: FiscalIssuerSnapshot = {
    v: 1,
    name: 'Alpha Lda',
    address: 'Rua Alpha 1',
    postalCode: '1000-001',
    city: 'Lisboa',
    taxNumber: '509999999',
    phone: '210000000',
    email: 'alpha@example.pt',
    slogan: 'Slogan Alpha',
    softwareInfo: 'POS Alpha',
    certificationNumber: '1111',
    softwareCertNumber: '4321',
    counterLabel: 'CAIXA ALPHA',
    receiptLanguage: 'pt',
    logo: { widthDots: 384, heightDots: 96, digest: 'digest-a' },
};

/** Company B, as the back office has since rewritten live settings. */
function writeLiveSettingsAsCompanyB() {
    localStorage.setItem(
        'pos_system_settings',
        JSON.stringify({
            company: {
                name: 'Beta SA',
                address: 'Avenida Beta 99',
                postalCode: '4000-999',
                city: 'Porto',
                taxNumber: '500000000',
                phone: '220000000',
                email: 'beta@example.pt',
                slogan: 'Slogan Beta',
                softwareInfo: 'POS Beta',
                certificationNumber: '9999',
            },
            receipt: { counterLabel: 'CAIXA BETA', receiptLanguage: 'pt' },
        })
    );
}

function localRow(metadata: Record<string, unknown> | null) {
    return {
        id: 'trx-1',
        transaction_number: 'TXN-001',
        receipt_number: 'ABC-202508-1001',
        transaction_date: '2025-08-25',
        transaction_time: '12:34',
        customer_id: null,
        customer_name: '',
        subtotal: 1.5,
        discount: 0,
        tax: 0.35,
        total: 1.85,
        payment_method: 'cash',
        amount_paid: 2,
        change_given: 0.15,
        status: 'completed',
        deleted_at: null,
        employee_name: 'Cashier 1',
        employee_id: 'EMP003',
        fiscal_document_id: null,
        fiscal_metadata_json: metadata ? JSON.stringify(metadata) : null,
        items: REMOTE_ROW.transaction_items,
    };
}

const BASE_META = {
    invoiceNo: 'FT ABC/0001',
    atcudBody: 'CSDF7T5H-0001',
    hashBase64: 'aaaa',
    hashFourChars: 'a-a-a-a',
    hashControl: '1',
    qrPayload: 'A:509999999*B:999999990',
    chainScope: 'CSDF7T5H::FT',
    sequentialNumber: 1,
    certificationMode: 'production' as const,
};

const renderPage = () => {
    localStorage.setItem('language', 'en');
    return render(
        <SettingsProvider>
            <LanguageProvider>
                <DesignSystem2CustomizationProvider>
                    <Transactions />
                </DesignSystem2CustomizationProvider>
            </LanguageProvider>
        </SettingsProvider>
    );
};

async function openReceipt() {
    renderPage();
    expect(await screen.findByText('TXN-001')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /expand transaction details/i }));
    fireEvent.click(await screen.findByText(/view receipt/i));
    expect(await screen.findByText(/receipt preview/i)).toBeInTheDocument();
}

describe('D-IM1 — reprint of an issued document', () => {
    beforeEach(() => {
        localStorage.clear();
        archiveGet.mockReset();
        vi.mocked(transactionLocalService.getTransactionById).mockResolvedValue(undefined);
    });

    test('a document issued under company A still reprints as A after settings change to B', async () => {
        writeLiveSettingsAsCompanyB();
        archiveGet.mockResolvedValue({
            digest: 'digest-a',
            widthDots: 384,
            heightDots: 96,
            bitmap: LOGO_A_BITMAP,
            created_at: '2025-08-25T12:34:00.000Z',
        });
        vi.mocked(transactionLocalService.getTransactionById).mockResolvedValue(
            localRow({ ...BASE_META, issuer: ISSUER_A }) as never
        );

        await openReceipt();

        // The frozen header is what comes out …
        expect(await screen.findByText('Alpha Lda')).toBeInTheDocument();
        expect(screen.getByText('Rua Alpha 1')).toBeInTheDocument();
        expect(screen.getByText('1000-001 Lisboa')).toBeInTheDocument();
        expect(screen.getByText(/509999999/)).toBeInTheDocument();
        expect(screen.getByText(/210000000/)).toBeInTheDocument();
        expect(screen.getByText('alpha@example.pt')).toBeInTheDocument();
        expect(screen.getByText(/Slogan Alpha/)).toBeInTheDocument();
        expect(screen.getByText(/POS Alpha/)).toBeInTheDocument();

        // … and none of today's values leak in anywhere on the document.
        expect(screen.queryByText('Beta SA')).toBeNull();
        expect(screen.queryByText('Avenida Beta 99')).toBeNull();
        expect(screen.queryByText('4000-999 Porto')).toBeNull();
        expect(screen.queryByText(/500000000/)).toBeNull();
        expect(screen.queryByText(/220000000/)).toBeNull();
        expect(screen.queryByText('beta@example.pt')).toBeNull();
        expect(screen.queryByText(/Slogan Beta/)).toBeNull();
        expect(screen.queryByText(/POS Beta/)).toBeNull();
        expect(screen.queryByText(/CAIXA BETA/)).toBeNull();
    });

    // The logo BYTES that come out are asserted in tests/fiscal/issuerSnapshot.test.ts,
    // against the ESC/POS builder: jsdom has no canvas 2D context, so
    // receiptLogoDataUrl returns null here and no <img> is ever rendered. What
    // is worth asserting in this environment is which logo the reprint goes
    // looking for.
    test('looks the logo up by the digest the document was issued with', async () => {
        writeLiveSettingsAsCompanyB();
        archiveGet.mockResolvedValue({
            digest: 'digest-a',
            widthDots: 384,
            heightDots: 96,
            bitmap: LOGO_A_BITMAP,
            created_at: '2025-08-25T12:34:00.000Z',
        });
        vi.mocked(transactionLocalService.getTransactionById).mockResolvedValue(
            localRow({ ...BASE_META, issuer: ISSUER_A }) as never
        );

        await openReceipt();

        expect(archiveGet).toHaveBeenCalledWith('digest-a');
    });

    test('a document issued with no logo never even looks one up', async () => {
        writeLiveSettingsAsCompanyB();
        vi.mocked(transactionLocalService.getTransactionById).mockResolvedValue(
            localRow({ ...BASE_META, issuer: { ...ISSUER_A, logo: null } }) as never
        );

        await openReceipt();

        expect(await screen.findByText('Alpha Lda')).toBeInTheDocument();
        expect(archiveGet).not.toHaveBeenCalled();
    });

    test('a blank captured field stays blank instead of falling through to today\'s value', async () => {
        writeLiveSettingsAsCompanyB();
        archiveGet.mockResolvedValue(undefined);
        vi.mocked(transactionLocalService.getTransactionById).mockResolvedValue(
            localRow({
                ...BASE_META,
                issuer: { ...ISSUER_A, logo: null, phone: '', email: '', slogan: '', softwareInfo: '' },
            }) as never
        );

        await openReceipt();

        expect(await screen.findByText('Alpha Lda')).toBeInTheDocument();
        expect(screen.queryByText(/220000000/)).toBeNull();
        expect(screen.queryByText('beta@example.pt')).toBeNull();
        expect(screen.queryByText(/Slogan Beta/)).toBeNull();
        expect(screen.queryByText(/POS Beta/)).toBeNull();
    });

    test('a legacy row with no snapshot still renders, from live settings, exactly as before', async () => {
        writeLiveSettingsAsCompanyB();
        vi.mocked(transactionLocalService.getTransactionById).mockResolvedValue(
            localRow(BASE_META) as never
        );

        await openReceipt();

        // A missing snapshot is not an error: the whole header comes from live
        // settings, which is the pre-D-IM1 behaviour, unchanged.
        expect(await screen.findByText('Beta SA')).toBeInTheDocument();
        expect(screen.getByText('Avenida Beta 99')).toBeInTheDocument();
        expect(screen.getByText('4000-999 Porto')).toBeInTheDocument();
        expect(screen.queryByText('Alpha Lda')).toBeNull();
        expect(archiveGet).not.toHaveBeenCalled();
    });

    test('a row with no fiscal metadata at all still renders', async () => {
        writeLiveSettingsAsCompanyB();
        vi.mocked(transactionLocalService.getTransactionById).mockResolvedValue(
            localRow(null) as never
        );

        await openReceipt();

        expect(await screen.findByText('Beta SA')).toBeInTheDocument();
    });
});
