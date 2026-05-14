import type { ReceiptSeriesProfile } from './receiptSeriesProfile';

/** Segment used in invoice numbers: `FS {segment}/{seq}` — must not contain "/". */
export function invoiceSeriesSegment(profile: ReceiptSeriesProfile): string {
    return (profile.series || '').trim();
}

export function assertInvoiceSeriesSegment(segment: string): void {
    const s = segment.trim();
    if (!s) {
        throw new Error('Nome da série em falta (Definições > Numeração).');
    }
    if (s.includes('/')) {
        throw new Error('O nome da série não pode conter o carácter "/".');
    }
}

export function computeSeriesKey(profile: ReceiptSeriesProfile, now: Date): string {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const seg = invoiceSeriesSegment(profile).replace(/\//g, '-');
    return profile.resetPolicy === 'monthly' ? `${seg}-${y}${m}` : `${seg}-${y}`;
}

export function computeNextSequential(
    lastSequential: number | undefined,
    settingsCurrentNumber: number
): number {
    if (lastSequential !== undefined && lastSequential >= 0) {
        return lastSequential + 1;
    }
    return settingsCurrentNumber + 1;
}

export function formatSequential(profile: ReceiptSeriesProfile, sequential: number): string {
    return String(sequential).padStart(profile.numericWidth, '0');
}

export function buildInvoiceNo(
    invoiceType: string,
    seriesSegment: string,
    sequential: number,
    numericWidth: number
): string {
    const padded = String(sequential).padStart(numericWidth, '0');
    return `${invoiceType} ${seriesSegment}/${padded}`;
}

export function buildChainScope(atValidationCode: string, seriesKey: string): string {
    return `${atValidationCode}::${seriesKey}`;
}
