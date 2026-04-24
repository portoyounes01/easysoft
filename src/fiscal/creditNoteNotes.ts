/**
 * Parse structured fields from `transactions.notes` for fiscal credit notes
 * (format: `NC referente {originalInvoiceNo}.` optional free-text reason).
 */
export function parseCreditNoteNotesFields(
    notes: string | null | undefined,
    settledInvoiceNo: string | null | undefined
): { originalRef?: string; reason?: string } {
    if (!notes?.trim()) {
        return {};
    }
    const t = notes.trim();
    if (!t.startsWith('NC referente ')) {
        return {};
    }
    if (settledInvoiceNo?.trim()) {
        const no = settledInvoiceNo.trim();
        const prefix = `NC referente ${no}`;
        if (t === prefix) {
            return { originalRef: no };
        }
        if (t.startsWith(prefix + '.')) {
            return {
                originalRef: no,
                reason: t.slice(prefix.length + 1).trim() || undefined,
            };
        }
    }
    const after = t.slice('NC referente '.length);
    const firstDot = after.indexOf('.');
    if (firstDot === -1) {
        return { originalRef: after.trim() || undefined };
    }
    return {
        originalRef: after.slice(0, firstDot).trim() || undefined,
        reason: after.slice(firstDot + 1).trim() || undefined,
    };
}
