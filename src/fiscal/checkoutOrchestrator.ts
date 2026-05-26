import type { SystemSettings } from '../contexts/SettingsContext';
import type { LocalCustomer, LocalProduct } from '../types/supabase';
import { calculateTaxAmount, calculatePriceWithoutTax } from '../types/supabase';
import { transactionLocalService } from '../lib/localDatabase';
import { SALE_INVOICE_TYPE_SAFT } from './spec';
import { buildFiscalCustomerFields } from './fiscalCustomer';
import { createSignerFromSettings, type FiscalSigner } from './signing';
import { receiptProfileForSale, assertIssueDateInSeriesWindow } from './receiptSeriesProfile';
import { buildChainScope, computeSeriesKey } from './seriesUtils';
import type { CertificationMode, FiscalCheckoutAtomicPayload, FiscalCheckoutResult } from './types';

export type { FiscalCheckoutResult } from './types';

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

/**
 * Sale checkout must not emit negative line totals (NC uses a separate path).
 */
function assertNoNegativeSaleLineTotals(cart: FiscalCartLine[]): void {
    for (const line of cart) {
        if (line.quantity <= 0) {
            throw new Error('Quantidade inválida numa linha do carrinho.');
        }
        if (line.product.price < 0) {
            throw new Error('Preço de produto inválido (negativo).');
        }
        const itemTotal = line.product.price * line.quantity;
        const discountAmount = (itemTotal * line.discount) / 100;
        const discountedTotal = itemTotal - discountAmount;
        if (discountedTotal < 0) {
            throw new Error(
                'Total de linha negativo não é permitido em venda — use nota de crédito para corrigir documentos.'
            );
        }
    }
}

function assertDiscountGuards(cart: FiscalCartLine[], globalDiscount?: FiscalGlobalDiscount): void {
    for (const line of cart) {
        if (line.discount < 0 || line.discount > 100) {
            throw new Error('Desconto por linha deve estar entre 0% e 100%.');
        }
    }
    if (globalDiscount && globalDiscount.type === 'percentage') {
        if (globalDiscount.value < 0 || globalDiscount.value > 100) {
            throw new Error('Desconto global em percentagem deve estar entre 0% e 100%.');
        }
    }
    if (globalDiscount && globalDiscount.type === 'fixed' && globalDiscount.amount > 0) {
        const subAfterLines = cart.reduce((sum, item) => {
            const itemTotal = item.product.price * item.quantity;
            const discountAmount = (itemTotal * item.discount) / 100;
            return sum + (itemTotal - discountAmount);
        }, 0);
        if (globalDiscount.amount > subAfterLines + 1e-6) {
            throw new Error('Desconto global fixo não pode exceder o subtotal após descontos por linha.');
        }
    }
}

function formatSystemEntryDate(d: Date): string {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${mo}-${da}T${h}:${mi}:${s}`;
}

/**
 * Full fiscal checkout: guards, AT hash chain, Dexie persistence (transaction + fiscal + audit).
 */
export async function runFiscalCheckout(params: {
    settings: SystemSettings;
    cart: FiscalCartLine[];
    selectedCustomer: LocalCustomer | null;
    payment: FiscalPaymentInput;
    globalDiscount?: FiscalGlobalDiscount;
    signer?: FiscalSigner;
}): Promise<FiscalCheckoutResult> {
    const { settings, cart, selectedCustomer, payment, globalDiscount } = params;

    assertDiscountGuards(cart, globalDiscount);
    assertNoNegativeSaleLineTotals(cart);

    const now = new Date();
    const transactionDate = now.toISOString().split('T')[0];
    const transactionTime = now.toTimeString().split(' ')[0];

    const originalSubtotal = cart.reduce((sum, item) => {
        const itemTotal = item.product.price * item.quantity;
        return sum + itemTotal;
    }, 0);

    const subtotalAfterItemDiscounts = cart.reduce((sum, item) => {
        const itemTotal = item.product.price * item.quantity;
        const discountAmount = (itemTotal * item.discount) / 100;
        return sum + (itemTotal - discountAmount);
    }, 0);

    const totalTax = cart.reduce((sum, item) => {
        const itemTotal = item.product.price * item.quantity;
        const discountAmount = (itemTotal * item.discount) / 100;
        const discountedTotal = itemTotal - discountAmount;
        return sum + calculateTaxAmount(discountedTotal, item.product.iva_rate);
    }, 0);

    const globalDiscountAmount = globalDiscount?.amount || 0;
    const finalSubtotal = subtotalAfterItemDiscounts - globalDiscountAmount;
    const total = finalSubtotal;

    if (total <= 0) {
        throw new Error('O total do documento de venda deve ser superior a zero.');
    }

    const changeGiven =
        payment.paymentMethod === 'cash' && payment.amountPaid
            ? Math.max(0, payment.amountPaid - total)
            : 0;

    const totalDiscountAmount = originalSubtotal - finalSubtotal;

    const invoiceTypeSaft = SALE_INVOICE_TYPE_SAFT;
    const receiptProfile = receiptProfileForSale(settings.receipt, invoiceTypeSaft);
    const fiscalCustomer = buildFiscalCustomerFields(selectedCustomer);

    assertIssueDateInSeriesWindow(transactionDate, receiptProfile);

    const certificationMode: CertificationMode = settings.fiscal.trainingMode ? 'training' : 'production';

    const seriesKey = computeSeriesKey(receiptProfile, now);
    const atCode = receiptProfile.atValidationCode.trim();
    if (!atCode) {
        throw new Error('Código de validação AT da série em falta (Definições > Numeração por tipo de documento).');
    }

    const chainScope = buildChainScope(atCode, seriesKey);

    const grossTotal = Number(total.toFixed(2));
    const taxTotal = Number(totalTax.toFixed(2));
    const netRounded = Number((grossTotal - taxTotal).toFixed(2));
    const systemEntryDate = formatSystemEntryDate(now);

    const signer = params.signer ?? (await createSignerFromSettings(settings));

    const transactionItems: FiscalCheckoutAtomicPayload['transactionItems'] = cart.map(item => {
        const itemTotal = item.product.price * item.quantity;
        const discountAmount = (itemTotal * item.discount) / 100;
        const discountedTotal = itemTotal - discountAmount;
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

    const atomicPayload: FiscalCheckoutAtomicPayload = {
        settings,
        receiptProfile,
        certificationMode,
        transactionDate,
        transactionTime,
        systemEntryDate,
        seriesKey,
        chainScope,
        atCode,
        invoiceTypeSaft,
        grossTotal,
        netRounded,
        taxTotal,
        totalDiscountAmount,
        originalSubtotal,
        total,
        changeGiven,
        transactionBase,
        transactionItems,
        customerTaxId: fiscalCustomer.taxIdForFiscalRow,
        customerTaxNumberForQr: fiscalCustomer.taxNumberForQr,
        customerCountryForQr: fiscalCustomer.country,
        payment,
        signer,
    };

    return transactionLocalService.createFiscalCheckoutAtomic(atomicPayload);
}
