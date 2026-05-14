/** SAFT sales families configured independently (NC = série registada na AT; NC fiscal continua a cadeia do documento original). */
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

/** Perfil para avisos ATCUD em função do tipo de documento por defeito. */
export function receiptProfileForDefaultDocumentType(receipt: SystemReceiptSettingsSlice): ReceiptSeriesProfile {
    return receipt.defaultDocumentType === 'FATURA' ? receipt.seriesProfiles.FT : receipt.seriesProfiles.FS;
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
        throw new Error('A data do documento é anterior ao início de vigência da série configurada.');
    }
    if (w === 'after_end') {
        throw new Error('A data do documento é posterior ao fim de vigência da série configurada.');
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
    };
}
