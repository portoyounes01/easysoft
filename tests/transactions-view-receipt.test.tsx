import { describe, test, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Transactions from '../src/pages/Transactions';
import { LanguageProvider } from '../src/contexts/LanguageContext';
import { SettingsProvider } from '../src/contexts/SettingsContext';

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
                <Transactions />
            </LanguageProvider>
        </SettingsProvider>
    );
};

describe('Transactions page - View receipt dialog', () => {
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
});


