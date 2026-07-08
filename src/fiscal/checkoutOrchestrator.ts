import type { SystemSettings } from '../contexts/SettingsContext';
import type { LocalCustomer } from '../types/supabase';
import { transactionLocalService } from '../lib/localDatabase';
import { SALE_INVOICE_TYPE_SAFT } from './spec';
import { createSignerFromSettings, type FiscalSigner } from './signing';
import { receiptProfileForSale, assertIssueDateInSeriesWindow } from './receiptSeriesProfile';
import { buildChainScope, computeSeriesKey } from './seriesUtils';
import type { CertificationMode, FiscalCheckoutAtomicPayload, FiscalCheckoutResult } from './types';
import {
    buildSaleCheckoutDraft,
    type FiscalCartLine,
    type FiscalGlobalDiscount,
    type FiscalPaymentInput,
} from './saleCheckoutDraft';

export type { FiscalCheckoutResult } from './types';
export type { FiscalCartLine, FiscalGlobalDiscount, FiscalPaymentInput } from './saleCheckoutDraft';

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

    if (settings.fiscal.issuer === 'vendus') {
        const { issueVendusSale } = await import('./vendusFiscalIssuer');
        return issueVendusSale({
            settings,
            cart,
            selectedCustomer,
            payment,
            globalDiscount,
        });
    }

    if (settings.fiscal.issuer === 'invoicexpress') {
        const { issueInvoiceXpressSale } = await import('./invoicexpressFiscalIssuer');
        return issueInvoiceXpressSale({
            settings,
            cart,
            selectedCustomer,
            payment,
            globalDiscount,
        });
    }

    if (settings.fiscal.issuer === 'fiskaly') {
        const { issueFiskalySale } = await import('./fiskalyFiscalIssuer');
        return issueFiskalySale({
            settings,
            cart,
            selectedCustomer,
            payment,
            globalDiscount,
        });
    }

    if (settings.fiscal.issuer === 'sign_es') {
        const { issueSignEsSale } = await import('./signEsFiscalIssuer');
        return issueSignEsSale({
            settings,
            cart,
            selectedCustomer,
            payment,
            globalDiscount,
        });
    }

    const invoiceTypeSaft = SALE_INVOICE_TYPE_SAFT;
    const receiptProfile = receiptProfileForSale(settings.receipt, invoiceTypeSaft);
    const draft = buildSaleCheckoutDraft({ cart, selectedCustomer, payment, globalDiscount });

    assertIssueDateInSeriesWindow(draft.transactionDate, receiptProfile);

    const certificationMode: CertificationMode = settings.fiscal.trainingMode ? 'training' : 'production';

    const seriesKey = computeSeriesKey(receiptProfile, draft.now);
    const atCode = receiptProfile.atValidationCode.trim();
    if (!atCode) {
        throw new Error('Código de validação AT da série em falta (Definições > Numeração por tipo de documento).');
    }

    const chainScope = buildChainScope(atCode, seriesKey);

    const grossTotal = Number(draft.total.toFixed(2));
    const taxTotal = Number(draft.totalTax.toFixed(2));
    const netRounded = Number((grossTotal - taxTotal).toFixed(2));

    const signer = params.signer ?? (await createSignerFromSettings(settings));

    const atomicPayload: FiscalCheckoutAtomicPayload = {
        settings,
        receiptProfile,
        certificationMode,
        transactionDate: draft.transactionDate,
        transactionTime: draft.transactionTime,
        systemEntryDate: draft.systemEntryDate,
        seriesKey,
        chainScope,
        atCode,
        invoiceTypeSaft,
        grossTotal,
        netRounded,
        taxTotal,
        totalDiscountAmount: draft.totalDiscountAmount,
        originalSubtotal: draft.originalSubtotal,
        total: draft.total,
        changeGiven: draft.changeGiven,
        transactionBase: draft.transactionBase,
        transactionItems: draft.transactionItems,
        customerTaxId: draft.fiscalCustomer.taxIdForFiscalRow,
        customerTaxNumberForQr: draft.fiscalCustomer.taxNumberForQr,
        customerCountryForQr: draft.fiscalCustomer.country,
        payment,
        signer,
    };

    return transactionLocalService.createFiscalCheckoutAtomic(atomicPayload);
}
