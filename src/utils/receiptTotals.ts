/** Receipt money arithmetic, shared by every renderer of a receipt.
 *
 *  Extracted from ThermalReceipt so the on-screen receipt and the ESC/POS one
 *  sent to the thermal head compute identical figures. Two copies of this
 *  arithmetic would be a fiscal defect waiting for the first rounding edge
 *  case, so it lives here and nowhere else.
 */

export interface ReceiptTotalsItem {
    quantity: number;
    unitPrice: number;
    vatRate: number;
    total: number;
}

export interface ReceiptTotalsSummary {
    subtotal: number;
    discount: number;
    discountPercentage: number;
    net: number;
    vat: number;
    total: number;
}

export interface ComputedReceiptTotals {
    /** Discount percentage as given (0 when the discount is a fixed amount). */
    discountPct: number;
    /** Factor applied to each item's tax-included total. */
    grossFactor: number;
    /** Final tax-included amount charged. */
    totalGross: number;
    /** Taxable base after discount. */
    totalBase: number;
    /** VAT after discount. */
    totalVat: number;
    /** Taxable base BEFORE discount (printed as NET / ILÍQUIDO). */
    subtotalBeforeDiscount: number;
    /** One row per VAT rate; `rate` stays the string key so displays match. */
    vatGroups: Array<{ rate: string; incidence: number; vat: number }>;
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** 12.3 → "12,30 €" — the receipt's only money format. */
export const formatReceiptCurrency = (amount: number): string =>
    amount.toFixed(2).replace('.', ',') + ' €';

export function computeReceiptTotals(
    items: ReceiptTotalsItem[],
    totals: ReceiptTotalsSummary
): ComputedReceiptTotals {
    const discountPct = totals.discountPercentage || 0;

    // 1) Discount factor applied to item totals (tax-included)
    const grossBefore = items.reduce((s, it) => s + (it.total || 0), 0);
    let grossFactor = 1;
    if (discountPct > 0) {
        grossFactor = 1 - discountPct / 100;
    } else if ((totals.discount || 0) > 0 && grossBefore > 0) {
        // For a fixed discount, scale item totals so their sum matches totals.total.
        // Clamp to [0,1] to avoid accidental overflows.
        const desiredGross = typeof totals.total === 'number' ? totals.total : grossBefore;
        const computed = desiredGross / grossBefore;
        grossFactor = Math.max(0, Math.min(1, computed));
    }

    // 2) Aggregate from items AFTER discount
    const recomputed = items.reduce(
        (acc, item) => {
            const rate = (item.vatRate || 0) / 100;
            const grossAfterDiscount = (item.total || 0) * grossFactor; // tax-included
            const base = grossAfterDiscount / (1 + rate);
            const vat = grossAfterDiscount - base;
            acc.gross += grossAfterDiscount;
            acc.base += base;
            acc.vat += vat;
            return acc;
        },
        { gross: 0, base: 0, vat: 0 }
    );

    // 3) Original (BEFORE discount) base, for the NET / ILÍQUIDO line
    const original = items.reduce(
        (acc, item) => {
            const rate = (item.vatRate || 0) / 100;
            const gross = item.total || 0;
            const base = gross / (1 + rate);
            const vat = gross - base;
            acc.gross += gross;
            acc.base += base;
            acc.vat += vat;
            return acc;
        },
        { gross: 0, base: 0, vat: 0 }
    );

    const vatRecord = items.reduce((acc, item) => {
        const key = item.vatRate;
        if (!acc[key]) {
            acc[key] = { incidence: 0, vat: 0 };
        }
        const rateFraction = (item.vatRate || 0) / 100;
        const grossAfterDiscount = item.total * grossFactor;
        const base = grossAfterDiscount / (1 + rateFraction);
        const vat = grossAfterDiscount - base;
        acc[key].incidence += base;
        acc[key].vat += vat;
        return acc;
    }, {} as Record<number, { incidence: number; vat: number }>);

    return {
        discountPct,
        grossFactor,
        // Prefer provided totals for final amounts, fall back to recomputed when missing
        totalGross: typeof totals.total === 'number' ? round2(totals.total) : round2(recomputed.gross),
        totalBase: round2(recomputed.base),
        totalVat: typeof totals.vat === 'number' ? round2(totals.vat) : round2(recomputed.vat),
        subtotalBeforeDiscount: round2(original.base),
        vatGroups: Object.entries(vatRecord).map(([rate, amounts]) => ({
            rate,
            incidence: amounts.incidence,
            vat: amounts.vat,
        })),
    };
}
