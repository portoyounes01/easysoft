import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, test, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import ThermalReceipt, { ReceiptProps } from '../src/components/ThermalReceipt';
import { SettingsProvider } from '../src/contexts/SettingsContext';
import i18n from '../src/i18n';

function renderReceipt(props: Partial<ReceiptProps> = {}) {
    return render(
        <SettingsProvider>
            <ThermalReceipt {...base} {...props} />
        </SettingsProvider>
    );
}

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
    beforeEach(async () => {
        await i18n.changeLanguage('en');
    });

    test('defaults to Original', () => {
        renderReceipt();
        expect(screen.getByText(/ABC-202508-1001 Original/)).toBeInTheDocument();
    });

    test('renders second-copy label (2.ª via)', async () => {
        await i18n.changeLanguage('pt');
        renderReceipt({ documentLabel: i18n.t('thermalReceipt.secondCopy') });
        expect(screen.getByText(/ABC-202508-1001 2\.ª via/)).toBeInTheDocument();
    });

    test('renders certification placeholder when number is unset', async () => {
        await i18n.changeLanguage('pt');
        renderReceipt();
        expect(
            screen.getByText(
                i18n.t('thermalReceipt.certifiedLine', {
                    hashPrefix: '',
                    num: 'xxxx',
                })
            )
        ).toBeInTheDocument();
    });

    test('renders certification phrase with /AT suffix', async () => {
        await i18n.changeLanguage('pt');
        renderReceipt({ certificationNumber: '196/AT' });
        expect(
            screen.getByText(
                i18n.t('thermalReceipt.certifiedLine', {
                    hashPrefix: '',
                    num: '196',
                })
            )
        ).toBeInTheDocument();
    });

    test('prints four hash chars before certification line (LogicPOS layout)', async () => {
        await i18n.changeLanguage('pt');
        const hashFour = 'sFUH';
        renderReceipt({ hashFourChars: hashFour, certificationNumber: '196/AT' });
        expect(
            screen.getByText(
                i18n.t('thermalReceipt.certifiedLine', {
                    hashPrefix: `${hashFour}-`,
                    num: '196',
                })
            )
        ).toBeInTheDocument();
        expect(screen.queryByText(/^Q:/)).not.toBeInTheDocument();
    });
});


