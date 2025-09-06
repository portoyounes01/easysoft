import { describe, test, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Transactions from '../src/pages/Transactions';
import { LanguageProvider } from '../src/contexts/LanguageContext';

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
            items: [
                { id: 'i1', name: 'Coffee', quantity: 1, price: 1.5, total: 1.5 }
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
        }]))
    }
}));

const renderWithRouter = () => {
    localStorage.setItem('language', 'en');
    return render(
        <LanguageProvider>
            <MemoryRouter initialEntries={['/transactions']}>
                <Routes>
                    <Route path="/transactions" element={<Transactions />} />
                    <Route path="/receipt-demo/:id" element={<div>RECEIPT_VIEW</div>} />
                </Routes>
            </MemoryRouter>
        </LanguageProvider>
    );
};

describe('Transactions page - View receipt navigation', () => {
    test('navigates to receipt route when clicking View Receipt', async () => {
        renderWithRouter();

        // Wait for list item to render
        expect(await screen.findByText('TXN-001')).toBeInTheDocument();

        // Expand the transaction row
        const expandBtn = screen.getByRole('button', { name: /expand transaction details/i });
        fireEvent.click(expandBtn);

        // Click View Receipt
        const btn = await screen.findByText(/view receipt/i);
        fireEvent.click(btn);

        // Assert navigation
        await waitFor(() => {
            expect(screen.getByText('RECEIPT_VIEW')).toBeInTheDocument();
        });
    });
});


