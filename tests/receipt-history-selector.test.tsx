import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import ReceiptHistorySelector from '../src/components/ReceiptHistorySelector';
import type { ReceiptProps } from '../src/components/ThermalReceipt';

const mk = (n: number): ReceiptProps => ({
    documentNumber: `ABC-${n}`,
    documentType: 'FATURA_SIMPLIFICADA',
    date: new Date('2025-08-25T12:00:00Z'),
    counter: 'BALCÃO 1',
    verificationCode: `ATCUD-ABC-${n}`,
    company: { name: 'Co', address: 'Addr', postalCode: '1000-001', city: 'Lisboa', taxNumber: '123' },
    items: [],
    totals: { subtotal: 0, discount: 0, discountPercentage: 0, net: 0, vat: 0, total: 0 },
    payment: { method: 'Multibanco', amountGiven: 0, change: 0 }
});

describe('ReceiptHistorySelector', () => {
    test('renders list and selects item', () => {
        const receipts = [mk(1), mk(2)];
        const onSelect = vi.fn();
        const onClose = vi.fn();

        render(
            <ReceiptHistorySelector open receipts={receipts} onSelect={onSelect} onClose={onClose} />
        );

        expect(screen.getByText('ABC-1')).toBeInTheDocument();
        const row = screen.getByText('ABC-2').closest('button')!;
        fireEvent.click(row);
        expect(onSelect).toHaveBeenCalledTimes(1);
    });
});


