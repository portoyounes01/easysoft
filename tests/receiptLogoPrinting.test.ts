import { describe, expect, it } from 'vitest';
import { buildReceiptEscPos } from '../src/services/escpos/receiptEscPos';
import { bytesToBase64, ditherToMonochrome, packedRowBytes } from '../src/utils/receiptLogo';
import type { ReceiptProps } from '../src/components/ThermalReceipt';

const HEAD_BYTES_PER_ROW = 576 / 8;

/** All GS v 0 raster blocks in the stream, with their declared geometry. */
function rasters(bytes: Uint8Array): { bytesPerRow: number; height: number; payload: number }[] {
    const found: { bytesPerRow: number; height: number; payload: number }[] = [];
    for (let i = 0; i + 7 < bytes.length; i += 1) {
        if (bytes[i] !== 0x1d || bytes[i + 1] !== 0x76 || bytes[i + 2] !== 0x30) continue;
        const bytesPerRow = bytes[i + 4] | (bytes[i + 5] << 8);
        const height = bytes[i + 6] | (bytes[i + 7] << 8);
        found.push({ bytesPerRow, height, payload: bytesPerRow * height });
        i += 7 + bytesPerRow * height;
    }
    return found;
}

/** Printable text, rasters skipped — the same decoder the other receipt tests use. */
function decodeLines(bytes: Uint8Array): string[] {
    const lines: string[] = [];
    let line = '';
    let i = 0;
    while (i < bytes.length) {
        const b = bytes[i];
        if (b === 0x1d && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x30) {
            const w = bytes[i + 4] | (bytes[i + 5] << 8);
            const r = bytes[i + 6] | (bytes[i + 7] << 8);
            i += 8 + w * r;
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

const LOGO_W = 200;
const LOGO_H = 64;
const logo = (() => {
    // A recognisable pattern: left half black, right half white.
    const gray = new Uint8ClampedArray(LOGO_W * LOGO_H);
    for (let y = 0; y < LOGO_H; y += 1) {
        for (let x = 0; x < LOGO_W; x += 1) gray[y * LOGO_W + x] = x < LOGO_W / 2 ? 0 : 255;
    }
    const { bits } = ditherToMonochrome(gray, LOGO_W, LOGO_H);
    return { dataUrl: 'data:image/png;base64,AA', widthDots: LOGO_W, heightDots: LOGO_H, bitmapBase64: bytesToBase64(bits) };
})();

const base: ReceiptProps = {
    documentNumber: 'FS 2026A/000137',
    documentType: 'FATURA_SIMPLIFICADA',
    date: new Date('2026-07-28T14:32:00'),
    counter: 'CX01',
    verificationCode: 'CSDF7T5H-0137',
    hashFourChars: 'AB1C',
    qrCodeData: 'A:509442013*B:999999990*C:PT*D:FS*E:N',
    company: {
        name: 'Padaria Sao Joao, Lda.',
        address: 'Rua X',
        postalCode: '1200-192',
        city: 'Lisboa',
        taxNumber: '509 442 013',
    },
    items: [{ id: '1', description: 'Pao', quantity: 1, unitPrice: 1, vatRate: 6, total: 1 }],
    totals: { subtotal: 1, discount: 0, discountPercentage: 0, net: 0.94, vat: 0.06, total: 1 },
    payment: { method: 'Numerario', amountGiven: 1, change: 0 },
    certificationNumber: '9999',
};

const withLogo = (r: ReceiptProps): ReceiptProps => ({ ...r, company: { ...r.company, logo } });
const slip: ReceiptProps = { ...base, documentType: 'TALAO_NAO_FISCAL', documentNumber: 'TNF-A-000001', verificationCode: '', qrCodeData: undefined };

const build = (r: ReceiptProps) => buildReceiptEscPos(r, { language: 'pt' });

describe('printing the company logo', () => {
    // The defect this replaces: the literal text "[LOGO]" on a customer receipt.
    it('never prints a placeholder when no logo is configured', () => {
        for (const receipt of [base, slip]) {
            expect(decodeLines(build(receipt)).join('\n')).not.toContain('[LOGO]');
        }
    });

    it('emits no raster at all without a logo on the slip (which has no QR either)', () => {
        expect(rasters(build(slip))).toHaveLength(0);
    });

    it('emits the logo raster at full head width with the declared height', () => {
        const block = rasters(build(withLogo(slip)));
        expect(block).toHaveLength(1);
        // Rows are padded to the full head width and centred here, not by the
        // printer — a head that ignores alignment for images would otherwise
        // print the logo flush left.
        expect(block[0].bytesPerRow).toBe(HEAD_BYTES_PER_ROW);
        expect(block[0].height).toBe(LOGO_H);
        expect(block[0].payload).toBe(HEAD_BYTES_PER_ROW * LOGO_H);
    });

    it('reaches both a fatura and a non-fiscal slip', () => {
        // The fatura also carries a QR, so it has two rasters; the slip has one.
        expect(rasters(build(withLogo(base))).length).toBe(2);
        expect(rasters(build(withLogo(slip))).length).toBe(1);
    });

    it('leaves the company block and the rest of the receipt untouched', () => {
        const withoutLogo = decodeLines(build(slip)).join('\n');
        const printed = decodeLines(build(withLogo(slip))).join('\n');
        // Rasters are stripped by the decoder, so the text must be identical.
        expect(printed).toBe(withoutLogo);
    });

    it('packs the source bitmap at ceil(width / 8) per row', () => {
        expect(Math.ceil(LOGO_W / 8)).toBe(packedRowBytes(LOGO_W));
    });
});
