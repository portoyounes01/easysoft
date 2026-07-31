import i18n from '../i18n';
import type { LocalCustomer, LocalProduct } from '../types/supabase';
import { calculatePriceWithoutTax, calculateTaxAmount } from '../types/supabase';
import { buildFiscalCustomerFields, type FiscalCustomerFields } from './fiscalCustomer';
import type { FiscalCheckoutAtomicPayload } from './types';

export interface FiscalCartLine {
    product: LocalProduct;
    quantity: number;
    discount: number;
}

export interface FiscalGlobalDiscount {
    type: 'none' | 'percentage' | 'fixed';
    value: number;
    amount: number;
}

export interface FiscalPaymentInput {
    paymentMethod: 'cash' | 'card' | 'mixed';
    amountPaid?: number;
    employeeId: string;
    employeeName: string;
    employeeNumber?: string;
}

export interface SaleCheckoutDraft {
    now: Date;
    transactionDate: string;
    transactionTime: string;
    systemEntryDate: string;
    originalSubtotal: number;
    subtotalAfterItemDiscounts: number;
    totalTax: number;
    globalDiscountAmount: number;
    finalSubtotal: number;
    total: number;
    changeGiven: number;
    totalDiscountAmount: number;
    fiscalCustomer: FiscalCustomerFields;
    transactionBase: FiscalCheckoutAtomicPayload['transactionBase'];
    transactionItems: FiscalCheckoutAtomicPayload['transactionItems'];
}

/**
 * Sale checkout must not emit negative line totals (NC uses a separate path).
 */
function assertNoNegativeSaleLineTotals(cart: FiscalCartLine[]): void {
    for (const line of cart) {
        if (line.quantity <= 0) {
            throw new Error(i18n.t('checkout.invalidLineQuantity'));
        }
        if (line.product.price < 0) {
            throw new Error(i18n.t('checkout.invalidProductPrice'));
        }
        const itemTotal = line.product.price * line.quantity;
        const discountAmount = (itemTotal * line.discount) / 100;
        const discountedTotal = itemTotal - discountAmount;
        if (discountedTotal < 0) {
            throw new Error(
                i18n.t('checkout.negativeLineTotal')
            );
        }
    }
}

function assertDiscountGuards(cart: FiscalCartLine[], globalDiscount?: FiscalGlobalDiscount): void {
    for (const line of cart) {
        if (line.discount < 0 || line.discount > 100) {
            throw new Error(i18n.t('checkout.lineDiscountRange'));
        }
    }
    if (globalDiscount && globalDiscount.type === 'percentage') {
        if (globalDiscount.value < 0 || globalDiscount.value > 100) {
            throw new Error(i18n.t('checkout.globalPercentDiscountRange'));
        }
    }
    if (globalDiscount && globalDiscount.type === 'fixed' && globalDiscount.amount > 0) {
        const subAfterLines = cart.reduce((sum, item) => {
            const itemTotal = item.product.price * item.quantity;
            const discountAmount = (itemTotal * item.discount) / 100;
            return sum + (itemTotal - discountAmount);
        }, 0);
        if (globalDiscount.amount > subAfterLines + 1e-6) {
            throw new Error(i18n.t('checkout.globalFixedDiscountTooLarge'));
        }
    }
}

/** Money quantization: with 3-decimal weighed quantities, price×quantity has
 *  sub-cent precision (0.625 × 12.90 = 8.0625). Every line is rounded to
 *  cents ONCE here, and all aggregates are sums of those rounded lines — so
 *  the charged, printed, synced and fiscally-registered totals are identical
 *  by construction (SIGN ES full_amount is the sum of rounded lines). */
const round2 = (n: number): number => Math.round(n * 100) / 100;

function lineMoney(item: FiscalCartLine): { gross: number; discount: number; net: number } {
    const gross = round2(item.product.price * item.quantity);
    const discount = round2((gross * item.discount) / 100);
    return { gross, discount, net: round2(gross - discount) };
}

export function formatSystemEntryDate(d: Date): string {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${mo}-${da}T${h}:${mi}:${s}`;
}

export function buildSaleCheckoutDraft(params: {
    cart: FiscalCartLine[];
    selectedCustomer: LocalCustomer | null;
    payment: FiscalPaymentInput;
    globalDiscount?: FiscalGlobalDiscount;
    now?: Date;
}): SaleCheckoutDraft {
    const { cart, selectedCustomer, payment, globalDiscount } = params;

    assertDiscountGuards(cart, globalDiscount);
    assertNoNegativeSaleLineTotals(cart);

    const now = params.now ?? new Date();
    const transactionDate = now.toISOString().split('T')[0];
    const transactionTime = now.toTimeString().split(' ')[0];

    const originalSubtotal = round2(cart.reduce((sum, item) => sum + lineMoney(item).gross, 0));

    const subtotalAfterItemDiscounts = round2(
        cart.reduce((sum, item) => sum + lineMoney(item).net, 0)
    );

    const totalTax = cart.reduce(
        (sum, item) => sum + calculateTaxAmount(lineMoney(item).net, item.product.iva_rate),
        0
    );

    const globalDiscountAmount = globalDiscount?.amount || 0;
    const finalSubtotal = round2(subtotalAfterItemDiscounts - globalDiscountAmount);
    const total = finalSubtotal;

    if (total <= 0) {
        throw new Error(i18n.t('checkout.totalMustBePositive'));
    }

    const changeGiven =
        payment.paymentMethod === 'cash' && payment.amountPaid
            ? Math.max(0, payment.amountPaid - total)
            : 0;

    const totalDiscountAmount = originalSubtotal - finalSubtotal;
    const fiscalCustomer = buildFiscalCustomerFields(selectedCustomer);

    const transactionItems: FiscalCheckoutAtomicPayload['transactionItems'] = cart.map(item => {
        const { discount: discountAmount, net: discountedTotal } = lineMoney(item);
        const taxAmount = calculateTaxAmount(discountedTotal, item.product.iva_rate);
        const basePrice = calculatePriceWithoutTax(item.product.price, item.product.iva_rate);
        const profitAmount = (basePrice - item.product.cost) * item.quantity;
        return {
            product_id: item.product.id,
            product_name: item.product.name,
            product_sku: item.product.sku,
            category_id: item.product.category_id,
            category_name: item.product.category_name,
            quantity: item.quantity,
            unit: item.product.sold_by_weight ? ('kg' as const) : ('un' as const),
            unit_price: item.product.price,
            unit_cost: item.product.cost,
            iva_rate: item.product.iva_rate,
            line_total: discountedTotal,
            tax_amount: taxAmount,
            profit_amount: profitAmount,
            discount_amount: discountAmount,
            discount_percentage: item.discount,
            deleted_at: null,
        };
    });

    const transactionBase: FiscalCheckoutAtomicPayload['transactionBase'] = {
        employee_id: payment.employeeId,
        employee_name: payment.employeeName,
        customer_id: selectedCustomer?.id || null,
        customer_name: fiscalCustomer.transactionName,
        transaction_date: transactionDate,
        transaction_time: transactionTime,
        subtotal: originalSubtotal,
        discount: totalDiscountAmount,
        discount_type: (globalDiscount && globalDiscount.type !== 'none'
            ? globalDiscount.type
            : cart.some(i => i.discount > 0)
                ? 'percentage'
                : 'none') as 'none' | 'percentage' | 'fixed',
        discount_percentage:
            globalDiscount && globalDiscount.type === 'percentage'
                ? Number(globalDiscount.value)
                : cart.every(i => i.discount === cart[0]?.discount)
                    ? Number(cart[0]?.discount || 0)
                    : 0,
        tax: totalTax,
        total,
        payment_method: payment.paymentMethod,
        amount_paid: payment.amountPaid || null,
        change_given: changeGiven,
        status: 'completed',
        notes: null,
        deleted_at: null,
    };

    return {
        now,
        transactionDate,
        transactionTime,
        systemEntryDate: formatSystemEntryDate(now),
        originalSubtotal,
        subtotalAfterItemDiscounts,
        totalTax,
        globalDiscountAmount,
        finalSubtotal,
        total,
        changeGiven,
        totalDiscountAmount,
        fiscalCustomer,
        transactionBase,
        transactionItems,
    };
}
