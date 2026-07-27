/**
 * BCP-47 tag to format on-screen dates and numbers with.
 *
 * The UI language is stored as a bare code ('en' | 'pt' | 'es'), but Intl needs
 * a region before it will pick a format. English maps to en-GB rather than
 * en-US so an English-speaking manager still reads the day-first dates the rest
 * of the shop sees.
 *
 * Receipts, fiscal exports and SAF-T do NOT use this: their locale is fixed by
 * the document, not by whoever happens to be looking at the screen.
 */
export const uiLocale = (language: string | undefined | null): string => {
    if (language?.startsWith('pt')) return 'pt-PT';
    if (language?.startsWith('es')) return 'es-ES';
    return 'en-GB';
};
