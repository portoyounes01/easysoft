import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, test, expect } from 'vitest';
import '@testing-library/jest-dom';
import ThermalReceipt, { ReceiptProps } from '../src/components/ThermalReceipt';

const base: ReceiptProps = {
    documentNumber: 'ABC-202508-1001',
    documentType: 'FATURA_SIMPLIFICADA',
    date: new Date('2025-08-25T12:34:00Z'),
    counter: 'BALCÃO 1',
    verificationCode: 'ATCUD-ABC-202508-1001',
    company: { name: 'Co', address: 'Addr', postalCode: '1000-001', city: 'Lisboa', taxNumber: '123456789' },
    items: [],
    totals: { subtotal: 0, discount: 0, discountPercentage: 0, net: 0, vat: 0, total: 0 },
    payment: { method: 'Multibanco', amountGiven: 0, change: 0 }
};

describe('ThermalReceipt documentLabel', () => {
    test('defaults to Original', () => {
        render(<ThermalReceipt {...base} />);
        expect(screen.getByText(/ABC-202508-1001 Original/)).toBeInTheDocument();
    });

    test('renders custom label Segunda via', () => {
        render(<ThermalReceipt {...base} documentLabel="Segunda via" />);
        expect(screen.getByText(/ABC-202508-1001 Segunda via/)).toBeInTheDocument();
    });
});


