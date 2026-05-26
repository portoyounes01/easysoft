/** Sanitize free-text money input: digits plus at most one `.` or `,`. */
export function sanitizeMoneyInput(raw: string): string {
    let sepUsed = false;
    let out = '';
    for (const ch of raw) {
        if (ch >= '0' && ch <= '9') {
            out += ch;
            continue;
        }
        if ((ch === '.' || ch === ',') && !sepUsed) {
            out += ch;
            sepUsed = true;
        }
    }
    return out;
}

/** Parse locale money string to number (empty / lone separator → 0). */
export function parseMoneyInput(raw: string): number {
    const trimmed = raw.trim().replace(',', '.');
    if (trimmed === '' || trimmed === '.') {
        return 0;
    }
    const n = parseFloat(trimmed);
    return Number.isFinite(n) ? n : 0;
}

/** Display string for money field (0 → empty so the field can be cleared). */
export function formatMoneyInputValue(amount: number): string {
    if (amount <= 0) {
        return '';
    }
    return String(amount);
}

export function moneyInputHasDecimalSeparator(value: string): boolean {
    return /[.,]/.test(value);
}
