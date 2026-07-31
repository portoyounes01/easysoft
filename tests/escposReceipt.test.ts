import { describe, expect, it } from 'vitest';

import { buildReceiptEscPos } from '../src/services/escpos/receiptEscPos';
import { encodeTextForCodePage, wrapText } from '../src/services/escpos/escposBuilder';
import type { ReceiptProps } from '../src/components/ThermalReceipt';

/** Decode the printable text of an ESC/POS stream back into lines, skipping
 *  command sequences and raster image payloads. */
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

const baseReceipt: ReceiptProps = {
    documentNumber: 'FS 2026A/000137',
    documentType: 'FATURA_SIMPLIFICADA',
    date: new Date('2026-07-26T14:32:00'),
    counter: 'CX01',
    verificationCode: 'CSDF7T5H-0137',
    hashFourChars: 'AB1C',
    company: {
        name: 'Padaria São João, Lda.',
        address: 'Rua das Flores nº 123',
        postalCode: '1200-192',
        city: 'Lisboa',
        taxNumber: '509 442 013',
    },
    items: [
        { id: '1', description: 'Pão de água', quantity: 3, unitPrice: 0.35, vatRate: 6, total: 1.05 },
        {
            id: '2',
            description: 'Queijo curado da Serra da Estrela DOP meia cura',
            quantity: 0.482,
            unit: 'kg',
            unitPrice: 18.9,
            vatRate: 6,
            total: 9.11,
        },
    ],
    totals: { subtotal: 10.16, discount: 0, discountPercentage: 0, net: 10.16, vat: 0.58, total: 10.16 },
    payment: { method: 'Numerário', amountGiven: 20, change: 9.84 },
    certificationNumber: '9999',
};

describe('ESC/POS receipt encoder', () => {
    it('opens with a reset + code page selection and ends with a cut', () => {
        const bytes = buildReceiptEscPos(baseReceipt, { language: 'pt' });
        expect(Array.from(bytes.subarray(0, 5))).toEqual([0x1b, 0x40, 0x1b, 0x74, 19]);
        expect(Array.from(bytes.subarray(-3))).toEqual([0x1d, 0x56, 0x00]);
    });

    it('never truncates a weighed quantity', () => {
        // Regression: a 4-wide qty column padded from the left, silently
        // turning 0.482 kg into .482 kg on a fiscal document.
        const lines = decodeLines(buildReceiptEscPos(baseReceipt, { language: 'pt' }));
        const weighed = lines.find(line => line.includes('Queijo'));
        expect(weighed).toBeDefined();
        expect(weighed).toContain('0.482');
    });

    it('keeps every printed line inside 48 columns', () => {
        const lines = decodeLines(buildReceiptEscPos(baseReceipt, { language: 'pt' }));
        const tooWide = lines.filter(line => line.length > 48);
        expect(tooWide).toEqual([]);
    });

    it('encodes PT/ES accents to single code-page bytes, never "?"', () => {
        const accents = 'áàâãçéêíóôõúüñÁÉÍÓÚÃÕÇÑºª€';
        const encoded = encodeTextForCodePage(accents, 'cp858');
        expect(encoded).toHaveLength(Array.from(accents).length);
        expect(encoded.some(byte => byte === 0x3f)).toBe(false);
        expect(encoded.every(byte => byte >= 0x80)).toBe(true);
    });

    it('transliterates characters the code page cannot carry', () => {
        // Latin letters with unsupported marks lose the diacritic rather than
        // printing as noise; genuinely foreign glyphs become '?'.
        expect(encodeTextForCodePage('ā', 'cp858')).toEqual([0x61]); // a-macron -> 'a'
        expect(encodeTextForCodePage('東', 'cp858')).toEqual([0x3f]); // '?'
    });

    it('does not emit a QR raster when the receipt carries no QR payload', () => {
        const withQr = buildReceiptEscPos({ ...baseReceipt, qrCodeData: 'A:509442013*B:999999990' }, { language: 'pt' });
        const withoutQr = buildReceiptEscPos(baseReceipt, { language: 'pt' });
        expect(withQr.length).toBeGreaterThan(withoutQr.length + 1000);
    });

    it('an unlabelled print defaults to a copy marking, never Original', () => {
        // The physical print path has its own header builder, so the on-screen
        // preview passing this is not evidence the printed slip does.
        const lines = decodeLines(buildReceiptEscPos(baseReceipt, { language: 'pt' }));
        expect(lines.some(line => line.includes('FS 2026A/000137'))).toBe(true);
        expect(lines.some(line => /Original/i.test(line))).toBe(false);
    });

    it('prints the marking a caller passes', () => {
        // ASCII label on purpose: decodeLines reads raw code-page bytes, so an
        // accented marking would compare against its encoded byte, not "ª".
        const lines = decodeLines(
            buildReceiptEscPos({ ...baseReceipt, documentLabel: 'DUPLICADO' }, { language: 'pt' })
        );
        expect(lines.some(line => line.includes('FS 2026A/000137') && line.includes('DUPLICADO'))).toBe(true);
    });

    it('wraps long words without dropping characters', () => {
        const wrapped = wrapText('Supercalifragilisticexpialidocious pão', 12);
        expect(wrapped.join('').replace(/\s/g, '')).toBe('Supercalifragilisticexpialidociouspão'.replace(/\s/g, ''));
        expect(wrapped.every(line => line.length <= 12)).toBe(true);
    });
});

describe('numeric columns', () => {
    it('never clips an oversized figure — the row runs long instead', () => {
        const heavy: ReceiptProps = {
            ...baseReceipt,
            items: [
                {
                    id: 'w',
                    description: 'Wholesale flour',
                    quantity: 1234.567,
                    unit: 'kg',
                    unitPrice: 0.92,
                    vatRate: 6,
                    total: 1135.8,
                },
            ],
            totals: { ...baseReceipt.totals, total: 1135.8, vat: 64.29 },
        };
        const lines = decodeLines(buildReceiptEscPos(heavy, { language: 'pt' }));
        const row = lines.find(line => line.includes('Wholesale'));
        expect(row).toBeDefined();
        expect(row).toContain('1234.567');
        // decodeLines reads raw code-page bytes, so € (0xD5) is not '€' here.
        expect(row).toContain('1135,80');
    });
});
