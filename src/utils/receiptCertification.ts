/** AT certification-number formatting for the receipt footer.
 *  Lives outside the React component so the ESC/POS renderer can use it
 *  without pulling the component tree in. */

/** Shown on receipt when `certificationNumber` is unset (AT placeholder until assigned). */
export const RECEIPT_CERTIFICATION_PLACEHOLDER = 'xxxx';

export function certificationNumberForReceiptDisplay(cert?: string): string {
    const trimmed = cert?.trim();
    if (!trimmed) {
        return RECEIPT_CERTIFICATION_PLACEHOLDER;
    }
    const withoutSuffix = trimmed.replace(/\s*\/AT\s*$/i, '').trim();
    return withoutSuffix || RECEIPT_CERTIFICATION_PLACEHOLDER;
}
