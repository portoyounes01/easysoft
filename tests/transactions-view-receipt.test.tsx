import { describe, test, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Transactions from '../src/pages/Transactions';
import { LanguageProvider } from '../src/contexts/LanguageContext';
import { SettingsProvider } from '../src/contexts/SettingsContext';
import { DesignSystem2CustomizationProvider } from '../src/contexts/DesignSystem2CustomizationContext';

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

vi.mock('../src/lib/localDatabase', () => ({
    initializeLocalDatabase: vi.fn().mockResolvedValue(undefined),
    customerLocalService: {
        getCustomerById: vi.fn().mockResolvedValue(undefined),
    },
    transactionLocalService: {
        getAllTransactions: vi.fn().mockResolvedValue([]),
        getTransactionById: vi.fn().mockResolvedValue(undefined),
        getFiscalDocumentById: vi.fn(),
        hasCreditNoteForOriginalTransaction: vi.fn().mockResolvedValue(false),
        hasReciboForOriginalTransaction: vi.fn().mockResolvedValue(false),
        appendFiscalAuditEvent: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('../src/fiscal/creditNoteCheckout', () => ({
    runFiscalCreditNoteForTransaction: vi.fn(),
}));

import { transactionLocalService } from '../src/lib/localDatabase';

// Mock transactionService
vi.mock('../src/services/transactionService', () => ({
    transactionService: {
        getTransactions: vi.fn(async () => ([{
            id: 'trx-1',
            transaction_number: 'TXN-001',
            transaction_date: '2025-08-25',
            transaction_time: '12:34',
            customer_name: 'John Doe',
            customer_id: '517404419',
            transaction_items: [
                { id: 'i1', product_name: 'Coffee', quantity: 1, unit_price: 1.5, line_total: 1.5, iva_rate: 0.13 }
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
            employee_id: 'EMP003'
        }])),
        getTransactionById: vi.fn(async (id: string) => ({
            id,
            receipt_number: 'ABC-202508-1001',
            transaction_number: 'TXN-001',
            transaction_date: '2025-08-25',
            transaction_time: '12:34',
            customer_id: '517404419',
            customer_name: 'John Doe',
            transaction_items: [
                { id: 'i1', product_name: 'Coffee', quantity: 1, unit_price: 1.5, line_total: 1.5, iva_rate: 0.13 }
            ],
            subtotal: 1.5,
            discount: 0,
            tax: 0.35,
            total: 1.85,
            payment_method: 'cash',
            amount_paid: 2,
            change_given: 0.15
        }))
    }
}));

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

describe('Transactions page - View receipt dialog', () => {
    beforeEach(() => {
        vi.mocked(transactionLocalService.getTransactionById).mockResolvedValue(undefined);
        vi.mocked(transactionLocalService.getFiscalDocumentById).mockReset();
    });

    test('opens receipt dialog when clicking View Receipt', async () => {
        renderPage();

        // Wait for list item to render
        expect(await screen.findByText('TXN-001')).toBeInTheDocument();

        // Expand the transaction row
        const expandBtn = screen.getByRole('button', { name: /expand transaction details/i });
        fireEvent.click(expandBtn);

        // Click View Receipt
        const btn = await screen.findByText(/view receipt/i);
        fireEvent.click(btn);

        // Assert dialog appears with heading
        expect(await screen.findByText(/receipt preview/i)).toBeInTheDocument();
    });

    test('shows Credit note (NC) when local Dexie has a non-NC fiscal document', async () => {
        vi.mocked(transactionLocalService.getTransactionById).mockImplementation(async id => {
            if (id !== 'trx-1') return undefined;
            return {
                id: 'trx-1',
                fiscal_document_id: 'fd-1',
                status: 'completed',
                deleted_at: null,
                total: 1.85,
                items: [],
            } as Awaited<ReturnType<typeof transactionLocalService.getTransactionById>>;
        });
        vi.mocked(transactionLocalService.getFiscalDocumentById).mockResolvedValue({
            invoice_type: 'FT',
        } as Awaited<ReturnType<typeof transactionLocalService.getFiscalDocumentById>>);

        renderPage();
        expect(await screen.findByText('TXN-001')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /expand transaction details/i }));
        expect(await screen.findByRole('button', { name: /credit note \(nc\)/i })).toBeInTheDocument();
    });
});

