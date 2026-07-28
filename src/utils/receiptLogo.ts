// Company logo for printed receipts.
//
// ⚠️ The whole shape of this module follows from one constraint:
// `buildReceiptEscPos` is SYNCHRONOUS, and decoding an image on a canvas is
// not. So the 1-bit raster the thermal head needs cannot be produced at print
// time — it is computed ONCE here, when the operator picks the file, and stored
// alongside the settings. The printer path then only decodes base64 and emits
// bytes. Do not "simplify" this later by converting at print time; it cannot be
// done without making the receipt builder async, which every caller assumes it
// is not.
//
// The stored preview is the DITHERED image, not the original, so what the
// operator sees on screen is what the head actually prints.

/** Full print width of the supported heads, in dots. */
const PRINTER_DOT_WIDTH = 576;
/** Default target width — comfortably inside the paper with margin to spare. */
const DEFAULT_WIDTH_DOTS = 384;
/** Cap the height so a tall logo cannot eat a strip of paper per sale. */
const MAX_HEIGHT_DOTS = 240;

export interface ReceiptLogo {
    /** Dithered preview (PNG data URI) — what the operator sees is what prints. */
    dataUrl: string;
    widthDots: number;
    heightDots: number;
    /** Packed rows, ceil(width/8) bytes each, MSB = leftmost dot, 1 = black. */
    bitmapBase64: string;
}

export const RECEIPT_LOGO_MAX_WIDTH_DOTS = PRINTER_DOT_WIDTH;
export const RECEIPT_LOGO_DEFAULT_WIDTH_DOTS = DEFAULT_WIDTH_DOTS;
export const RECEIPT_LOGO_MAX_HEIGHT_DOTS = MAX_HEIGHT_DOTS;

export function bytesToBase64(bytes: Uint8Array): string {
    // Chunked: String.fromCharCode(...bytes) overflows the call stack on
    // anything bigger than a few tens of KB, which a logo easily is.
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/** Row stride of the packed bitmap, in bytes. */
export function packedRowBytes(widthDots: number): number {
    return Math.ceil(widthDots / 8);
}

/**
 * Floyd–Steinberg dither of a greyscale buffer to 1 bit, packed for ESC/POS.
 *
 * Dithered rather than hard-thresholded because a threshold turns any logo with
 * a gradient or an anti-aliased edge into a blotch on a 1-bit head.
 *
 * Pure and DOM-free so it can be tested without a canvas.
 *
 * @param gray one luminance byte per pixel, row-major, 0 = black.
 * @returns `bits` packed rows plus the `black` mask (true = print this dot).
 */
export function ditherToMonochrome(
    gray: Uint8ClampedArray | Uint8Array | number[],
    width: number,
    height: number
): { bits: Uint8Array; black: boolean[] } {
    // Copy to a signed working buffer: error diffusion pushes values out of
    // 0..255 and clamping mid-diffusion would lose the error.
    const buffer = new Float32Array(width * height);
    for (let i = 0; i < width * height; i += 1) buffer[i] = gray[i];

    const black: boolean[] = new Array(width * height).fill(false);
    const stride = packedRowBytes(width);
    const bits = new Uint8Array(stride * height);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const i = y * width + x;
            const old = buffer[i];
            const isBlack = old < 128;
            const next = isBlack ? 0 : 255;
            const error = old - next;

            if (isBlack) {
                black[i] = true;
                bits[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
            }

            // Distribute the quantisation error to the not-yet-visited pixels.
            if (x + 1 < width) buffer[i + 1] += (error * 7) / 16;
            if (y + 1 < height) {
                if (x > 0) buffer[i + width - 1] += (error * 3) / 16;
                buffer[i + width] += (error * 5) / 16;
                if (x + 1 < width) buffer[i + width + 1] += (error * 1) / 16;
            }
        }
    }

    return { bits, black };
}

/** Dots the logo should occupy, preserving aspect and honouring both caps. */
export function fitLogoDots(
    sourceWidth: number,
    sourceHeight: number,
    targetWidth = DEFAULT_WIDTH_DOTS
): { widthDots: number; heightDots: number } {
    if (sourceWidth <= 0 || sourceHeight <= 0) {
        return { widthDots: 0, heightDots: 0 };
    }
    const width = Math.min(Math.max(1, Math.round(targetWidth)), PRINTER_DOT_WIDTH);
    let heightDots = Math.max(1, Math.round((sourceHeight / sourceWidth) * width));
    let widthDots = width;
    if (heightDots > MAX_HEIGHT_DOTS) {
        // Too tall for its width — bound by height instead.
        widthDots = Math.max(1, Math.round((sourceWidth / sourceHeight) * MAX_HEIGHT_DOTS));
        heightDots = MAX_HEIGHT_DOTS;
    }
    return { widthDots, heightDots };
}

/**
 * Decode, scale and dither an operator-chosen image into a printable logo.
 * DOM-bound (canvas); called only from the settings UI, never at print time.
 */
export async function prepareReceiptLogo(
    file: Blob,
    targetWidth = DEFAULT_WIDTH_DOTS
): Promise<ReceiptLogo> {
    const objectUrl = URL.createObjectURL(file);
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('The image could not be read.'));
            img.src = objectUrl;
        });

        const { widthDots, heightDots } = fitLogoDots(
            image.naturalWidth,
            image.naturalHeight,
            targetWidth
        );
        if (!widthDots || !heightDots) {
            throw new Error('The image has no usable dimensions.');
        }

        const canvas = document.createElement('canvas');
        canvas.width = widthDots;
        canvas.height = heightDots;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas is unavailable.');

        // White ground first: a transparent PNG would otherwise read as black
        // and dither into a solid rectangle.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, widthDots, heightDots);
        ctx.drawImage(image, 0, 0, widthDots, heightDots);

        const { data } = ctx.getImageData(0, 0, widthDots, heightDots);
        const gray = new Uint8ClampedArray(widthDots * heightDots);
        for (let i = 0; i < gray.length; i += 1) {
            const p = i * 4;
            // Rec. 601 luma, composited over the white ground already drawn.
            gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
        }

        const { bits, black } = ditherToMonochrome(gray, widthDots, heightDots);

        // Preview from the DITHERED pixels, so the operator approves the real thing.
        for (let i = 0; i < black.length; i += 1) {
            const p = i * 4;
            const value = black[i] ? 0 : 255;
            data[p] = value;
            data[p + 1] = value;
            data[p + 2] = value;
            data[p + 3] = 255;
        }
        ctx.putImageData(new ImageData(data, widthDots, heightDots), 0, 0);

        return {
            dataUrl: canvas.toDataURL('image/png'),
            widthDots,
            heightDots,
            bitmapBase64: bytesToBase64(bits),
        };
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}
