// The non-fiscal fallback: completing a sale when the cloud fiscal backend
// cannot issue, so the customer walks away with a slip and the LEGAL invoice is
// the one the cashier writes by hand in the AT-authorised tipografia book.
//
// Legal basis and the per-provider recovery steps: docs/fiscal-fallback-legal-brief.md.
//
// Three rules this module exists to enforce:
//
//   1. It NEVER takes a number from a fatura series. The slip has its own
//      per-till counter and a prefix that cannot be mistaken for a document
//      number. A série that skips numbers is a defect; a série that numbers a
//      document which does not exist is a fiscal one.
//   2. It NEVER runs by itself. The operator confirms, because the confirmation
//      IS the moment they take on the obligation to write the paper invoice.
//   3. It NEVER runs when the backend might already hold a document for the
//      sale, unless a human has checked and says otherwise (see fiscalFailure.ts).

import i18n from '../i18n';
import type { SystemSettings } from '../contexts/SettingsContext';
import type { LocalCustomer } from '../types/supabase';
import { transactionLocalService } from '../lib/localDatabase';
import { readDevicePairingScope } from '../utils/devicePairingStorage';
import type { CertificationMode, ExternalFiscalProvider, FiscalCheckoutResult, FiscalProvider } from './types';
import type { FiscalIssueFailure } from './fiscalFailure';
import {
    buildSaleCheckoutDraft,
    type FiscalCartLine,
    type FiscalGlobalDiscount,
    type FiscalPaymentInput,
} from './saleCheckoutDraft';

/** Marks the reference as a talão não fiscal. Never a série prefix (FS/FT/NC). */
const SLIP_PREFIX = 'TNF';
const SLIP_NUMERIC_WIDTH = 6;

/**
 * Backends the fallback covers.
 *
 * `local_at` is excluded because it signs locally and therefore cannot be
 * "unreachable" — an offline till still issues a fully valid fatura, so a
 * fallback there would replace a legal document with a slip for no reason.
 *
 * `sign_es` is excluded because Spain is not this regime. Veri*factu has its own
 * contingency route (records generated locally and remitted afterwards), and
 * folding it into the Portuguese paper-book flow would be wrong in both
 * jurisdictions. Spanish sales still block on failure, as today.
 */
const FALLBACK_PROVIDERS: ExternalFiscalProvider[] = ['vendus', 'invoicexpress', 'fiskaly'];

export function isNonFiscalFallbackProvider(provider: FiscalProvider): provider is ExternalFiscalProvider {
    return (FALLBACK_PROVIDERS as FiscalProvider[]).includes(provider);
}

/**
 * Per-till slip prefix, e.g. `TNF-3F9A21-`.
 *
 * The till discriminator matters for reconciliation: the fiscal audit log is
 * local to each device, and two tills in one store that go offline together
 * would otherwise both mint `TNF-000001`. Recording the paper invoice for one
 * would then clear the other's reminder as well.
 */
export function nonFiscalSlipPrefix(): string {
    const deviceId = readDevicePairingScope()?.deviceId;
    const till = deviceId ? deviceId.replace(/-/g, '').slice(-6).toUpperCase() : 'LOCAL';
    return `${SLIP_PREFIX}-${till}-`;
}

/** Does this reference belong to a non-fiscal slip rather than a document? */
export function isNonFiscalSlipReference(reference: string | null | undefined): boolean {
    return typeof reference === 'string' && reference.startsWith(`${SLIP_PREFIX}-`);
}

export interface NonFiscalFallbackDecision {
    /** The classified failure that made a fiscal document impossible. */
    failure: FiscalIssueFailure;
    /**
     * Required when `failure.dispatch === 'unresolved'`: the operator states
     * they looked the sale up at the provider under its external reference and
     * no document exists there. Recorded in the audit event, because it is the
     * grounds on which a second (paper) document is being created.
     */
    operatorAttested?: boolean;
}

/**
 * May this failure be resolved with a handwritten invoice right now?
 *
 * An unresolved failure needs the operator's attestation first — otherwise the
 * sale could end up with both a cloud fatura and a paper one.
 */
export function canIssueNonFiscalFallback(decision: NonFiscalFallbackDecision): boolean {
    if (!isNonFiscalFallbackProvider(decision.failure.provider)) return false;
    if (decision.failure.dispatch === 'not-dispatched') return true;
    return decision.operatorAttested === true;
}

/**
 * Complete the sale on a non-fiscal slip.
 *
 * Mirrors `runFiscalCheckout`'s inputs so the caller can retry the identical
 * sale down this path, and reuses the same draft builder so the slip's lines,
 * discounts, IVA and change are computed exactly as the fatura's would have
 * been. What differs is only what is NOT produced: no série, no number, no
 * ATCUD, no QR, no hash chain entry, no SAF-T row.
 */
export async function runNonFiscalFallbackSale(params: {
    settings: SystemSettings;
    cart: FiscalCartLine[];
    selectedCustomer: LocalCustomer | null;
    payment: FiscalPaymentInput;
    globalDiscount?: FiscalGlobalDiscount;
    decision: NonFiscalFallbackDecision;
}): Promise<FiscalCheckoutResult> {
    const { settings, cart, selectedCustomer, payment, globalDiscount, decision } = params;

    if (!canIssueNonFiscalFallback(decision)) {
        throw new Error(i18n.t('checkout.nonFiscalFallbackNotPermitted'));
    }

    const draft = buildSaleCheckoutDraft({ cart, selectedCustomer, payment, globalDiscount });
    const certificationMode: CertificationMode = settings.fiscal.trainingMode ? 'training' : 'production';
    const failure = decision.failure;

    return transactionLocalService.createNonFiscalFallbackAtomic({
        slipPrefix: nonFiscalSlipPrefix(),
        slipNumericWidth: SLIP_NUMERIC_WIDTH,
        certificationMode,
        transactionDate: draft.transactionDate,
        transactionTime: draft.transactionTime,
        systemEntryDate: draft.systemEntryDate,
        grossTotal: Number(draft.total.toFixed(2)),
        netRounded: Number((draft.total - draft.totalTax).toFixed(2)),
        taxTotal: Number(draft.totalTax.toFixed(2)),
        totalDiscountAmount: draft.totalDiscountAmount,
        originalSubtotal: draft.originalSubtotal,
        total: draft.total,
        changeGiven: draft.changeGiven,
        transactionBase: draft.transactionBase,
        transactionItems: draft.transactionItems,
        customerTaxId: draft.fiscalCustomer.taxIdForFiscalRow,
        payment,
        failure: {
            provider: failure.provider,
            dispatch: failure.dispatch,
            reason: failure.message,
            externalReference: 'externalReference' in failure ? failure.externalReference : undefined,
            attemptId: 'attemptId' in failure ? failure.attemptId : undefined,
            operatorAttested: decision.operatorAttested ?? false,
        },
    });
}
