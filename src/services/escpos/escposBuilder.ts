/** ESC/POS byte builder for 80 mm thermal receipt printers.
 *
 *  Deliberately lives in the renderer: the Electron shell exposes only
 *  `hardware.printRaw(base64)` and moves bytes onto the configured transport,
 *  so receipt layout ships as a UI deploy instead of a fleet update, and stays
 *  one source of truth with the on-screen ThermalReceipt.
 */
import { create as createQrMatrix } from 'qrcode';

/** Font A on an 80 mm head: 48 characters across, 576 addressable dots. */
export const RECEIPT_COLUMNS = 48;
export const PRINTER_DOT_WIDTH = 576;

/** Target printed QR width in dots. 280 dots ≈ 35 mm at 203 dpi, around the
 *  30 mm the AT guidance expects. */
const QR_TARGET_DOTS = 280;
/** Never print a module smaller than 4 dots (~0.5 mm): below that a thermal
 *  head's dot bleed makes the symbol unreliable to scan. Long payloads grow
 *  the symbol instead of shrinking the modules. */
const QR_MIN_MODULE_DOTS = 4;

export type EscPosCodePage = 'cp858' | 'cp1252';

/** `ESC t n` selector per page. */
const CODE_PAGE_SELECTOR: Record<EscPosCodePage, number> = {
    cp858: 19,
    cp1252: 16,
};

/** CP858 = CP850 with € at 0xD5. Only characters a PT/ES/EN receipt can
 *  realistically carry are listed; anything else transliterates. */
const CP858_BYTES: Record<string, number> = {
    'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ä': 0x84, 'à': 0x85, 'å': 0x86, 'ç': 0x87,
    'ê': 0x88, 'ë': 0x89, 'è': 0x8a, 'ï': 0x8b, 'î': 0x8c, 'ì': 0x8d, 'Ä': 0x8e, 'Å': 0x8f,
    'É': 0x90, 'æ': 0x91, 'Æ': 0x92, 'ô': 0x93, 'ö': 0x94, 'ò': 0x95, 'û': 0x96, 'ù': 0x97,
    'ÿ': 0x98, 'Ö': 0x99, 'Ü': 0x9a, 'ø': 0x9b, '£': 0x9c, 'Ø': 0x9d, '×': 0x9e, 'ƒ': 0x9f,
    'á': 0xa0, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3, 'ñ': 0xa4, 'Ñ': 0xa5, 'ª': 0xa6, 'º': 0xa7,
    '¿': 0xa8, '®': 0xa9, '¬': 0xaa, '½': 0xab, '¼': 0xac, '¡': 0xad, '«': 0xae, '»': 0xaf,
    'Á': 0xb5, 'Â': 0xb6, 'À': 0xb7, '©': 0xb8, '¢': 0xbd, '¥': 0xbe,
    'ã': 0xc6, 'Ã': 0xc7, '¤': 0xcf,
    'ð': 0xd0, 'Ð': 0xd1, 'Ê': 0xd2, 'Ë': 0xd3, 'È': 0xd4, '€': 0xd5, 'Í': 0xd6, 'Î': 0xd7,
    'Ï': 0xd8, '¦': 0xdd, 'Ì': 0xde,
    'Ó': 0xe0, 'ß': 0xe1, 'Ô': 0xe2, 'Ò': 0xe3, 'õ': 0xe4, 'Õ': 0xe5, 'µ': 0xe6, 'þ': 0xe7,
    'Þ': 0xe8, 'Ú': 0xe9, 'Û': 0xea, 'Ù': 0xeb, 'ý': 0xec, 'Ý': 0xed, '¯': 0xee, '´': 0xef,
    '±': 0xf1, '¾': 0xf3, '¶': 0xf4, '§': 0xf5, '÷': 0xf6, '¸': 0xf7, '°': 0xf8, '¨': 0xf9,
    '·': 0xfa, '¹': 0xfb, '³': 0xfc, '²': 0xfd,
};

/** CP1252: Latin-1 above 0xA0 plus the Windows specials block. */
const CP1252_BYTES: Record<string, number> = (() => {
    const table: Record<string, number> = {
        '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87,
        'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e,
        '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
        '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
    };
    for (let code = 0xa0; code <= 0xff; code += 1) {
        table[String.fromCharCode(code)] = code;
    }
    return table;
})();

const CODE_PAGE_TABLE: Record<EscPosCodePage, Record<string, number>> = {
    cp858: CP858_BYTES,
    cp1252: CP1252_BYTES,
};

/** Typographic characters no single-byte page carries usefully. */
const PRE_SUBSTITUTIONS: Array<[RegExp, string]> = [
    [/[‘’‛]/g, "'"],
    [/[“”‟]/g, '"'],
    [/…/g, '...'],
    [/[–—−]/g, '-'],
    [/\u00a0/g, ' '],
];

/** Encode one line of text for the given printer code page.
 *  Unmappable characters lose their diacritics rather than printing as noise
 *  (a mojibake customer name on a fiscal receipt is worse than a plain one). */
export function encodeTextForCodePage(value: string, page: EscPosCodePage): number[] {
    let normalized = value;
    for (const [pattern, replacement] of PRE_SUBSTITUTIONS) {
        normalized = normalized.replace(pattern, replacement);
    }

    const table = CODE_PAGE_TABLE[page];
    const out: number[] = [];
    for (const char of normalized) {
        const code = char.codePointAt(0) ?? 0x3f;
        if (code === 0x0a) {
            out.push(0x0a);
            continue;
        }
        if (code < 0x20) continue; // stray control characters would drive the printer
        if (code < 0x80) {
            out.push(code);
            continue;
        }
        const mapped = table[char];
        if (mapped !== undefined) {
            out.push(mapped);
            continue;
        }
        const stripped = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        let handled = false;
        for (const fallbackChar of stripped) {
            const fallbackCode = fallbackChar.codePointAt(0) ?? 0x3f;
            if (fallbackCode < 0x80 && fallbackCode >= 0x20) {
                out.push(fallbackCode);
                handled = true;
            } else {
                const fallbackMapped = table[fallbackChar];
                if (fallbackMapped !== undefined) {
                    out.push(fallbackMapped);
                    handled = true;
                }
            }
        }
        if (!handled) out.push(0x3f); // '?'
    }
    return out;
}

const charsOf = (value: string): string[] => Array.from(value);

/** Word-wrap to a column count, breaking words longer than the line. */
export function wrapText(value: string, width: number): string[] {
    if (width <= 0) return [value];
    const lines: string[] = [];
    for (const paragraph of value.split('\n')) {
        let current = '';
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            const candidate = current ? `${current} ${word}` : word;
            if (charsOf(candidate).length <= width) {
                current = candidate;
                continue;
            }
            if (current) {
                lines.push(current);
                current = '';
            }
            let remainder = word;
            while (charsOf(remainder).length > width) {
                lines.push(charsOf(remainder).slice(0, width).join(''));
                remainder = charsOf(remainder).slice(width).join('');
            }
            current = remainder;
        }
        lines.push(current);
    }
    return lines.length > 0 ? lines : [''];
}

export const padEnd = (value: string, width: number): string => {
    const chars = charsOf(value);
    if (chars.length >= width) return chars.slice(0, width).join('');
    return value + ' '.repeat(width - chars.length);
};

export const padStart = (value: string, width: number): string => {
    const chars = charsOf(value);
    if (chars.length >= width) return chars.slice(chars.length - width).join('');
    return ' '.repeat(width - chars.length) + value;
};

export type EscPosAlign = 'left' | 'center' | 'right';

export class EscPosBuilder {
    private readonly bytes: number[] = [];
    private readonly page: EscPosCodePage;
    readonly columns: number;

    constructor(options: { codePage?: EscPosCodePage; columns?: number } = {}) {
        this.page = options.codePage ?? 'cp858';
        this.columns = options.columns ?? RECEIPT_COLUMNS;
    }

    raw(...values: number[]): this {
        for (const value of values) this.bytes.push(value & 0xff);
        return this;
    }

    /** ESC @ (reset) + code page selection. Must be first. */
    init(): this {
        return this.raw(0x1b, 0x40)
            .raw(0x1b, 0x74, CODE_PAGE_SELECTOR[this.page])
            .raw(0x1b, 0x52, 0x00)
            .align('left')
            .bold(false)
            .size(1, 1);
    }

    align(mode: EscPosAlign): this {
        const n = mode === 'center' ? 1 : mode === 'right' ? 2 : 0;
        return this.raw(0x1b, 0x61, n);
    }

    bold(on: boolean): this {
        return this.raw(0x1b, 0x45, on ? 1 : 0);
    }

    /** GS ! — width/height multipliers, 1..8. Double width halves the usable
     *  column count, so padded rows must stay at 1. */
    size(width: number, height: number): this {
        const w = Math.max(1, Math.min(8, width)) - 1;
        const h = Math.max(1, Math.min(8, height)) - 1;
        return this.raw(0x1d, 0x21, (w << 4) | h);
    }

    /** Text with no trailing newline. */
    text(value: string): this {
        for (const byte of encodeTextForCodePage(value, this.page)) this.bytes.push(byte);
        return this;
    }

    /** One line, wrapped to the column count. `indent` prefixes continuations
     *  and the first line alike (used for the item description column). */
    line(value = '', indent = 0): this {
        if (value === '') return this.raw(0x0a);
        const prefix = ' '.repeat(indent);
        for (const wrapped of wrapText(value, this.columns - indent)) {
            this.text(prefix + wrapped).raw(0x0a);
        }
        return this;
    }

    /** One line printed verbatim — no word wrapping, so column padding
     *  survives (`line()` re-joins on whitespace and would collapse it). */
    fixed(value: string): this {
        const chars = charsOf(value);
        const clipped = chars.length > this.columns ? chars.slice(0, this.columns).join('') : value;
        return this.text(clipped).raw(0x0a);
    }

    /** Label left, value flush right, on one line. */
    pair(left: string, right: string): this {
        const rightChars = charsOf(right).length;
        return this.fixed(padEnd(left, Math.max(0, this.columns - rightChars)) + right);
    }

    /** Three columns: label, then two right-aligned numeric columns. */
    triple(left: string, middle: string, right: string, middleWidth: number, rightWidth: number): this {
        const leftWidth = Math.max(0, this.columns - middleWidth - rightWidth);
        return this.fixed(padEnd(left, leftWidth) + padStart(middle, middleWidth) + padStart(right, rightWidth));
    }

    rule(char = '-'): this {
        return this.fixed(char.repeat(this.columns));
    }

    feed(lines = 1): this {
        for (let i = 0; i < lines; i += 1) this.raw(0x0a);
        return this;
    }

    /** Same feed + full-cut sequence already proven on the till's TP80K. */
    cut(): this {
        return this.feed(4).raw(0x1d, 0x56, 0x00);
    }

    /** QR as a raster bitmap (GS v 0) rather than the native GS ( k symbol:
     *  a bitmap prints on any ESC/POS head, and it is centred by padding here
     *  instead of trusting the printer to honour alignment for images. */
    qr(data: string, options: { scale?: number; quietZone?: number } = {}): this {
        const matrix = createQrMatrix(data, { errorCorrectionLevel: 'M' }).modules;
        const quiet = options.quietZone ?? 4;
        const moduleSpan = matrix.size + quiet * 2;
        const scale = options.scale
            ?? Math.max(QR_MIN_MODULE_DOTS, Math.floor(QR_TARGET_DOTS / moduleSpan));
        const imageDots = Math.min(moduleSpan * scale, PRINTER_DOT_WIDTH);
        const bytesPerRow = PRINTER_DOT_WIDTH / 8;
        const leftPad = Math.max(0, Math.floor((PRINTER_DOT_WIDTH - imageDots) / 2));

        this.align('left').raw(
            0x1d, 0x76, 0x30, 0x00,
            bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
            imageDots & 0xff, (imageDots >> 8) & 0xff,
        );

        for (let y = 0; y < imageDots; y += 1) {
            const row = new Array<number>(bytesPerRow).fill(0);
            const moduleRow = Math.floor(y / scale) - quiet;
            if (moduleRow >= 0 && moduleRow < matrix.size) {
                for (let x = 0; x < imageDots; x += 1) {
                    const moduleCol = Math.floor(x / scale) - quiet;
                    if (moduleCol < 0 || moduleCol >= matrix.size) continue;
                    if (!matrix.data[moduleRow * matrix.size + moduleCol]) continue;
                    const dot = leftPad + x;
                    if (dot >= PRINTER_DOT_WIDTH) continue;
                    row[dot >> 3] |= 0x80 >> (dot & 7);
                }
            }
            for (const byte of row) this.bytes.push(byte);
        }
        return this;
    }

    build(): Uint8Array {
        return Uint8Array.from(this.bytes);
    }

    /** Chunked: a receipt with a QR runs to tens of thousands of bytes and a
     *  single spread would overflow the call stack. */
    toBase64(): string {
        const bytes = this.build();
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
    }
}
