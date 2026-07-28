import { describe, expect, it } from 'vitest';
import {
    base64ToBytes,
    bytesToBase64,
    ditherToMonochrome,
    fitLogoDots,
    packedRowBytes,
    RECEIPT_LOGO_MAX_HEIGHT_DOTS,
    RECEIPT_LOGO_MAX_WIDTH_DOTS,
} from '../src/utils/receiptLogo';

describe('fitLogoDots', () => {
    it('scales to the requested width and keeps the aspect ratio', () => {
        expect(fitLogoDots(1000, 500, 384)).toEqual({ widthDots: 384, heightDots: 192 });
    });

    it('never exceeds the printable width', () => {
        const { widthDots } = fitLogoDots(4000, 100, 2000);
        expect(widthDots).toBeLessThanOrEqual(RECEIPT_LOGO_MAX_WIDTH_DOTS);
    });

    // A tall logo bound only by width would eat a strip of paper per sale.
    it('falls back to the height cap for a very tall image, keeping the ratio', () => {
        const { widthDots, heightDots } = fitLogoDots(100, 1000, 384);
        expect(heightDots).toBe(RECEIPT_LOGO_MAX_HEIGHT_DOTS);
        expect(widthDots).toBe(Math.round((100 / 1000) * RECEIPT_LOGO_MAX_HEIGHT_DOTS));
    });

    it('returns nothing usable for a degenerate image', () => {
        expect(fitLogoDots(0, 0)).toEqual({ widthDots: 0, heightDots: 0 });
    });
});

describe('packing', () => {
    // An off-by-one in the stride shears the logo diagonally and no type catches it.
    it('uses ceil(width / 8) bytes per row', () => {
        expect(packedRowBytes(8)).toBe(1);
        expect(packedRowBytes(9)).toBe(2);
        expect(packedRowBytes(384)).toBe(48);
        expect(packedRowBytes(1)).toBe(1);
    });

    it('emits exactly stride × height bytes', () => {
        const width = 13;
        const height = 7;
        const { bits } = ditherToMonochrome(new Uint8ClampedArray(width * height).fill(255), width, height);
        expect(bits.length).toBe(packedRowBytes(width) * height);
    });

    it('round-trips through base64', () => {
        const bytes = new Uint8Array([0, 1, 127, 128, 255, 42]);
        expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
    });

    it('survives a payload large enough to blow a spread call', () => {
        const big = new Uint8Array(200_000).map((_, i) => i % 256);
        expect(base64ToBytes(bytesToBase64(big)).length).toBe(big.length);
    });
});

describe('ditherToMonochrome', () => {
    it('leaves white white and black black', () => {
        const white = ditherToMonochrome(new Uint8ClampedArray(64).fill(255), 8, 8);
        expect(white.black.every(v => v === false)).toBe(true);
        expect(Array.from(white.bits).every(b => b === 0)).toBe(true);

        const black = ditherToMonochrome(new Uint8ClampedArray(64).fill(0), 8, 8);
        expect(black.black.every(v => v === true)).toBe(true);
        expect(Array.from(black.bits).every(b => b === 0xff)).toBe(true);
    });

    // MSB is the leftmost dot — reversing this mirrors the logo.
    it('puts the leftmost pixel in the high bit', () => {
        const pixels = new Uint8ClampedArray(8).fill(255);
        pixels[0] = 0;
        const { bits } = ditherToMonochrome(pixels, 8, 1);
        expect(bits[0] & 0x80).toBe(0x80);
        expect(bits[0] & 0x01).toBe(0);
    });

    // A flat mid-grey is exactly what a hard threshold would flatten to one
    // solid block; error diffusion has to produce a mix.
    it('renders mid-grey as a mix rather than a solid block', () => {
        const { black } = ditherToMonochrome(new Uint8ClampedArray(32 * 32).fill(128), 32, 32);
        const set = black.filter(Boolean).length;
        expect(set).toBeGreaterThan(0);
        expect(set).toBeLessThan(black.length);
    });
});
