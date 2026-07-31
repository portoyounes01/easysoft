import i18n from '../i18n';

/** SAFT sales families configured independently (FS, FT, NC each with own série, ATCUD and hash chain). */
export type FiscalSeriesDocKey = 'FS' | 'FT' | 'NC';

export interface ReceiptSeriesProfile {
    /** AT series id — also the segment before "/" on the invoice (e.g. FS FAT2026/0001). Do not use "/". */
    series: string;
    seriesDescription?: string;
    numericWidth: number;
    /** Interno: chave de série por mês/ano (não exposto nas Definições). */
    resetPolicy: 'monthly' | 'yearly';
    lastSeriesKey: string;
    currentNumber: number;
    atValidationCode: string;
    /** Período de vigência da série (registo AT), YYYY-MM-DD inclusive. */
    seriesStartDate?: string;
    seriesEndDate?: string;
    seriesDiscontinued?: boolean;
}

/** Slice of system settings used by série helpers (evita import circular com SettingsContext). */
export interface SystemReceiptSettingsSlice {
    defaultDocumentType: 'FATURA' | 'FATURA_SIMPLIFICADA';
    seriesProfiles: Record<FiscalSeriesDocKey, ReceiptSeriesProfile>;
}

export function defaultReceiptSeriesProfile(partial?: Partial<ReceiptSeriesProfile>): ReceiptSeriesProfile {
    const base: ReceiptSeriesProfile = {
        series: 'FAT2026',
        seriesDescription: '',
        numericWidth: 4,
        resetPolicy: 'yearly',
        lastSeriesKey: '',
        /** Baseline when no docs exist on chain: next sequential = currentNumber + 1 (0 → first doc …/0001). */
        currentNumber: 0,
        atValidationCode: 'AT0000001',
        seriesDiscontinued: false,
    };
    return partial ? { ...base, ...partial } : base;
}

export function defaultSeriesProfiles(): Record<FiscalSeriesDocKey, ReceiptSeriesProfile> {
    const s = defaultReceiptSeriesProfile();
    return {
        FS: { ...s },
        FT: { ...s },
        NC: { ...s },
    };
}

/** Venda POS: FS ou FT conforme tipo resolvido. */
export function saleProfileKeyFromSaft(saft: 'FS' | 'FT'): FiscalSeriesDocKey {
    return saft;
}

export function receiptProfileForSale(receipt: SystemReceiptSettingsSlice, saft: 'FS' | 'FT'): ReceiptSeriesProfile {
    return receipt.seriesProfiles[saleProfileKeyFromSaft(saft)];
}

/** Perfil para avisos ATCUD / checkout (sempre FT para novas vendas). */
export function receiptProfileForDefaultDocumentType(receipt: SystemReceiptSettingsSlice): ReceiptSeriesProfile {
    return receipt.seriesProfiles.FT;
}

/** Nota de crédito: série e cadeia AT próprias (Definições > NC). */
export function receiptProfileForCreditNote(receipt: SystemReceiptSettingsSlice): ReceiptSeriesProfile {
    return receipt.seriesProfiles.NC;
}

/**
 * Extrai prefixo e largura numérica a partir de `invoiceNo` (ex. `FS ABC/0123`).
 */
export function parseInvoicePrefixWidthFromSaftNo(invoiceNo: string): { prefix: string; width: number } | null {
    const m = String(invoiceNo).trim().match(/^(FS|FT|NC|RG|RC) (.+)\/(\d+)$/);
    if (!m) return null;
    return { prefix: m[2], width: m[3].length };
}

/** Inclusive YYYY-MM-DD window; omit optional bounds. */
export function isIssueDateOutsideSeriesWindow(
    issueDateYmd: string,
    profile: Pick<ReceiptSeriesProfile, 'seriesStartDate' | 'seriesEndDate'>
): 'before_start' | 'after_end' | null {
    const start = profile.seriesStartDate?.trim();
    const end = profile.seriesEndDate?.trim();
    if (start && issueDateYmd < start) return 'before_start';
    if (end && issueDateYmd > end) return 'after_end';
    return null;
}

export function assertIssueDateInSeriesWindow(
    issueDateYmd: string,
    profile: Pick<ReceiptSeriesProfile, 'seriesStartDate' | 'seriesEndDate'>
): void {
    const w = isIssueDateOutsideSeriesWindow(issueDateYmd, profile);
    if (w === 'before_start') {
        throw new Error(i18n.t('checkout.issueDateBeforeSeriesStart'));
    }
    if (w === 'after_end') {
        throw new Error(i18n.t('checkout.issueDateAfterSeriesEnd'));
    }
}

/** Migrate legacy `atValidationCodeIssuedAt` into `seriesStartDate` when needed. */
export type LegacyReceiptSeriesProfile = ReceiptSeriesProfile & {
    atValidationCodeIssuedAt?: string;
    /** Removed — migrated into `series` when present */
    seriesPrefix?: string;
};

export function normalizeStoredSeriesProfile(
    profile: LegacyReceiptSeriesProfile,
    defaults: ReceiptSeriesProfile
): ReceiptSeriesProfile {
    const { atValidationCodeIssuedAt: legacyIssued, seriesPrefix: legacyPrefix, ...rest } = profile;
    const merged = { ...defaults, ...rest };
    const legacyP = typeof legacyPrefix === 'string' ? legacyPrefix.trim() : '';
    const seriesTrim = (merged.series ?? '').trim();
    merged.series = seriesTrim || legacyP || defaults.series;
    const startRaw = merged.seriesStartDate?.trim();
    const legacyStart = typeof legacyIssued === 'string' ? legacyIssued.trim() : '';
    const seriesStartDate = startRaw || legacyStart || undefined;
    const seriesEndDate = merged.seriesEndDate?.trim() || undefined;
    return {
        ...merged,
        seriesStartDate,
        seriesEndDate,
        resetPolicy:
            merged.resetPolicy === 'monthly' || merged.resetPolicy === 'yearly'
                ? merged.resetPolicy
                : defaults.resetPolicy,
        /** Legacy flag ignored — use a new `series` name (+ ATCUD) when AT registers a replacement. */
        seriesDiscontinued: false,
    };
}
