import i18n from '../i18n';

export type ReceiptLanguage = 'en' | 'pt' | 'es';

export function normalizeReceiptLanguage(raw: unknown): ReceiptLanguage {
    if (raw === 'en' || raw === 'pt' || raw === 'es') return raw;
    return 'pt';
}

/** Receipt strings only — independent of app UI language (`i18n.language`). */
export function getReceiptT(language: ReceiptLanguage) {
    return i18n.getFixedT(language, 'translation');
}
