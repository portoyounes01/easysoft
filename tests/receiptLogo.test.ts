import { describe, expect, it } from 'vitest';
import {
    base64ToBytes,
    bytesToBase64,
    decodeReceiptLogo,
    ditherToMonochrome,
    fitLogoDots,
    packBits,
    packedRowBytes,
    unpackBits,
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


describe('PackBits codec', () => {
    const roundTrip = (bytes: number[]) => {
        const input = Uint8Array.from(bytes);
        return Array.from(unpackBits(packBits(input)));
    };

    it('round-trips random noise (the incompressible case)', () => {
        let seed = 12345;
        const noise = Array.from({ length: 5000 }, () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed % 256;
        });
        expect(roundTrip(noise)).toEqual(noise);
    });

    it('round-trips a long uniform run', () => {
        const run = new Array(5000).fill(0xff);
        expect(roundTrip(run)).toEqual(run);
    });

    it('round-trips alternating bytes, which must not be coded as runs', () => {
        const alt = Array.from({ length: 1000 }, (_, i) => (i % 2 ? 0xff : 0x00));
        expect(roundTrip(alt)).toEqual(alt);
    });

    it('round-trips the empty and single-byte cases', () => {
        expect(roundTrip([])).toEqual([]);
        expect(roundTrip([0x5a])).toEqual([0x5a]);
    });

    // 128 is the no-op control byte and the classic PackBits bug site: a codec
    // correct on real logos can still be wrong exactly at the run boundaries.
    it('round-trips runs of exactly 127, 128 and 129', () => {
        for (const length of [127, 128, 129]) {
            const run = new Array(length).fill(0x42);
            expect(roundTrip(run)).toEqual(run);
        }
    });

    it('round-trips a boundary-length literal stretch', () => {
        for (const length of [127, 128, 129]) {
            const literal = Array.from({ length }, (_, i) => i % 251);
            expect(roundTrip(literal)).toEqual(literal);
        }
    });

    it('actually compresses a logo-shaped payload', () => {
        const mostlyWhite = new Uint8Array(48 * 200);
        mostlyWhite.fill(0xff, 1000, 1100);
        expect(packBits(mostlyWhite).length).toBeLessThan(mostlyWhite.length / 10);
    });

    it('never grows beyond the worst case the format guarantees', () => {
        let seed = 999;
        const noise = Uint8Array.from({ length: 4096 }, () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed % 256;
        });
        expect(packBits(noise).length).toBeLessThanOrEqual(noise.length + Math.ceil(noise.length / 128) + 1);
    });

    it('throws on truncated input rather than returning a short buffer', () => {
        expect(() => unpackBits(Uint8Array.from([0x05, 0x01, 0x02]))).toThrow();
        expect(() => unpackBits(Uint8Array.from([0xfe]))).toThrow();
    });

    it('throws when the decoded length is not what the geometry demands', () => {
        const bits = packBits(new Uint8Array(48 * 10));
        expect(() => unpackBits(bits, 48 * 11)).toThrow();
    });
});

describe('decodeReceiptLogo', () => {
    const good = (() => {
        const bits = new Uint8Array(packedRowBytes(64) * 32);
        bits.fill(0b10101010);
        return { widthDots: 64, heightDots: 32, bitmap: bytesToBase64(packBits(bits)) };
    })();

    it('decodes a well-formed logo', () => {
        expect(decodeReceiptLogo(good)?.bits.length).toBe(packedRowBytes(64) * 32);
    });

    // The payload now arrives over the network, so every malformed shape has to
    // degrade to "no logo" rather than throwing on the print path.
    it('returns null for anything malformed instead of throwing', () => {
        expect(decodeReceiptLogo(undefined)).toBeNull();
        expect(decodeReceiptLogo({ ...good, bitmap: 'not base64 !!!' })).toBeNull();
        expect(decodeReceiptLogo({ ...good, bitmap: '' })).toBeNull();
        expect(decodeReceiptLogo({ ...good, heightDots: 31 })).toBeNull();   // geometry mismatch
        expect(decodeReceiptLogo({ ...good, widthDots: 0 })).toBeNull();
        expect(decodeReceiptLogo({ ...good, widthDots: 9999 })).toBeNull();  // beyond the head
        expect(decodeReceiptLogo({ ...good, heightDots: 9999 })).toBeNull();
        expect(decodeReceiptLogo({ ...good, widthDots: 12.5 })).toBeNull();
    });

    // The shape shipped before compression had `bitmapBase64` + `dataUrl`.
    it('treats a pre-compression stored logo as no logo', () => {
        const legacy = { widthDots: 64, heightDots: 32, bitmapBase64: 'AAAA', dataUrl: 'data:,' };
        expect(decodeReceiptLogo(legacy as never)).toBeNull();
    });
});
