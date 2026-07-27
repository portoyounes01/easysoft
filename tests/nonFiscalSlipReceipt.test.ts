import { describe, expect, it } from 'vitest';

import { buildReceiptEscPos } from '../src/services/escpos/receiptEscPos';
import type { ReceiptProps } from '../src/components/ThermalReceipt';

/** Printable text of an ESC/POS stream, commands and rasters removed. */
function decodeLines(bytes: Uint8Array): string[] {
    const lines: string[] = [];
    let line = '';
    let i = 0;
    while (i < bytes.length) {
        const b = bytes[i];
        if (b === 0x1d && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x30) {
            const bytesPerRow = bytes[i + 4] | (bytes[i + 5] << 8);
            const rows = bytes[i + 6] | (bytes[i + 7] << 8);
            i += 8 + bytesPerRow * rows;
            continue;
        }
        if (b === 0x1b && bytes[i + 1] === 0x40) { i += 2; continue; }
        if (b === 0x1b || b === 0x1d) { i += 3; continue; }
        if (b === 0x0a) { lines.push(line); line = ''; i += 1; continue; }
        line += String.fromCharCode(b);
        i += 1;
    }
    if (line) lines.push(line);
    return lines;
}

/** Is there a QR raster command anywhere in the stream? */
function hasQrRaster(bytes: Uint8Array): boolean {
    for (let i = 0; i + 2 < bytes.length; i++) {
        if (bytes[i] === 0x1d && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x30) return true;
    }
    return false;
}

const fiscalReceipt: ReceiptProps = {
    documentNumber: 'FS 2026A/000137',
    documentType: 'FATURA_SIMPLIFICADA',
    date: new Date('2026-07-26T14:32:00'),
    counter: 'CX01',
    verificationCode: 'CSDF7T5H-0137',
    hashFourChars: 'AB1C',
    qrCodeData: 'A:509442013*B:999999990*C:PT*D:FS*E:N',
    company: {
        name: 'Padaria São João, Lda.',
        address: 'Rua das Flores nº 123',
        postalCode: '1200-192',
        city: 'Lisboa',
        taxNumber: '509 442 013',
    },
    customer: { taxNumber: '517404419', name: 'João Silva' },
    items: [{ id: '1', description: 'Pão de água', quantity: 3, unitPrice: 0.35, vatRate: 6, total: 1.05 }],
    totals: { subtotal: 1.05, discount: 0, discountPercentage: 0, net: 0.99, vat: 0.06, total: 1.05 },
    payment: { method: 'Numerário', amountGiven: 2, change: 0.95 },
    certificationNumber: '9999',
};

/** Same sale, completed on the fallback: the fiscal fields are empty by
 *  construction and the reference is the internal slip number. */
const slipReceipt: ReceiptProps = {
    ...fiscalReceipt,
    documentType: 'TALAO_NAO_FISCAL',
    documentNumber: 'TNF-3F9A21-000004',
    verificationCode: '',
    hashFourChars: '',
    qrCodeData: undefined,
    documentHash: undefined,
};

const linesOf = (receipt: ReceiptProps) =>
    decodeLines(buildReceiptEscPos(receipt, { language: 'pt' })).join('\n');

describe('non-fiscal slip (ESC/POS)', () => {
    it('never prints an ATCUD', () => {
        expect(linesOf(fiscalReceipt)).toContain('CSDF7T5H-0137');
        expect(linesOf(slipReceipt)).not.toContain('ATCUD');
    });

    it('never prints a QR code', () => {
        expect(hasQrRaster(buildReceiptEscPos(fiscalReceipt, { language: 'pt' }))).toBe(true);
        expect(hasQrRaster(buildReceiptEscPos(slipReceipt, { language: 'pt' }))).toBe(false);
    });

    // The AT certification phrase asserts the document came out of certified
    // software. It did not.
    it('replaces the certification line with the paper-book instruction', () => {
        const printed = linesOf(slipReceipt);
        expect(printed).not.toContain('9999');
        expect(printed.toLowerCase()).toContain('fatura');
    });

    // Accents come back as code-page bytes through the decoder, so assert on
    // the ASCII spine of the notice rather than on "NÃO"/"FATURA" verbatim.
    it('states plainly that the slip is not an invoice', () => {
        const printed = linesOf(slipReceipt).toUpperCase();
        expect(printed).toContain('ESTE TAL');
        expect(printed).toContain('SERVE COMO FATURA');
    });

    // Printing the customer's NIF suggests the document can be deducted
    // against it, which only the handwritten invoice can.
    it('suppresses the customer block', () => {
        expect(linesOf(fiscalReceipt)).toContain('517404419');
        expect(linesOf(slipReceipt)).not.toContain('517404419');
    });

    it('shows the slip reference, not a document number', () => {
        const printed = linesOf(slipReceipt);
        expect(printed).toContain('TNF-3F9A21-000004');
        expect(printed).not.toContain('FS 2026A/000137');
    });

    // Everything the customer needs to check what they paid still prints.
    it('keeps the commercial content of the sale', () => {
        const printed = linesOf(slipReceipt);
        expect(printed).toContain('de ');        // "Pão de água", accents aside
        expect(printed).toContain('Padaria S');
        expect(printed).toContain('1,05');       // total, pt decimal separator
        expect(printed.toUpperCase()).toContain('TOTAL');
    });
});
