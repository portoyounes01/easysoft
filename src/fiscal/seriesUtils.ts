import type { ReceiptSeriesProfile } from './receiptSeriesProfile';

export function computeSeriesKey(profile: ReceiptSeriesProfile, now: Date): string {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return profile.resetPolicy === 'monthly'
        ? `${profile.seriesPrefix}-${y}${m}`
        : `${profile.seriesPrefix}-${y}`;
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
    seriesPrefix: string,
    sequential: number,
    numericWidth: number
): string {
    const padded = String(sequential).padStart(numericWidth, '0');
    return `${invoiceType} ${seriesPrefix}/${padded}`;
}

export function buildChainScope(atValidationCode: string, seriesKey: string): string {
    return `${atValidationCode}::${seriesKey}`;
}
