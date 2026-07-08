import type { SystemSettings } from '../contexts/SettingsContext';
import { customerLocalService, transactionLocalService } from '../lib/localDatabase';
import { CONSUMER_FINAL_CUSTOMER_TAX_ID } from './spec';
import { createSignerFromSettings, type FiscalSigner } from './signing';
import type { FiscalCheckoutAtomicPayload, FiscalCheckoutResult } from './types';
import { assertIssueDateInSeriesWindow } from './receiptSeriesProfile';
import { buildChainScope, computeSeriesKey } from './seriesUtils';

function formatSystemEntryDate(d: Date): string {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${mo}-${da}T${h}:${mi}:${s}`;
}

function normalizeTaxIdForQr(raw: string | null | undefined): string | null {
    if (raw == null || !String(raw).trim()) return null;
    const n = String(raw).replace(/\s/g, '');
    if (n === CONSUMER_FINAL_CUSTOMER_TAX_ID) return null;
    return n;
}

/**
 * Emit a fiscal credit note (SAFT NC) that mirrors an original fiscal sale on the NC série / hash chain from settings.
 */
export async function runFiscalCreditNoteForTransaction(params: {
    settings: SystemSettings;
    originalTransactionId: string;
    payment: FiscalCheckoutAtomicPayload['payment'];
    /** Shown on receipt / audit; stored after `NC referente …` in transaction notes. */
    creditReason?: string;
    signer?: FiscalSigner;
}): Promise<FiscalCheckoutResult> {
    const { settings, originalTransactionId, payment, creditReason } = params;
    const origTx = await transactionLocalService.getTransactionById(originalTransactionId);
    if (!origTx?.fiscal_document_id) {
        throw new Error('Transação sem documento fiscal — não é possível emitir nota de crédito.');
    }
    const origFiscal = await transactionLocalService.getFiscalDocumentById(origTx.fiscal_document_id);
    if (!origFiscal) {
        throw new Error('Documento fiscal original em falta.');
    }
    if (origFiscal.invoice_type === 'NC') {
        throw new Error('Notas de crédito sobre notas de crédito não são suportadas.');
    }
    if (origFiscal.invoice_type === 'RG' || origFiscal.invoice_type === 'RC') {
        throw new Error('Nota de crédito deve referenciar uma fatura (FT ou FS), não um recibo.');
    }
    if (origFiscal.cancelled_at) {
        throw new Error('Não é possível emitir nota de crédito sobre um documento anulado.');
    }
    if (origFiscal.fiscal_provider === 'vendus') {
        const { issueVendusCreditNoteForTransaction } = await import('./vendusFiscalIssuer');
        return issueVendusCreditNoteForTransaction({
            settings,
            originalTransactionId,
            payment,
            creditReason,
        });
    }

    if (origFiscal.fiscal_provider === 'invoicexpress') {
        const { issueInvoiceXpressCreditNoteForTransaction } = await import('./invoicexpressFiscalIssuer');
        return issueInvoiceXpressCreditNoteForTransaction({
            settings,
            originalTransactionId,
            payment,
            creditReason,
        });
    }

    if (origFiscal.fiscal_provider === 'fiskaly') {
        const { issueFiskalyCreditNoteForTransaction } = await import('./fiskalyFiscalIssuer');
        return issueFiskalyCreditNoteForTransaction({
            settings,
            originalTransactionId,
            payment,
            creditReason,
        });
    }

    if (origFiscal.fiscal_provider === 'sign_es') {
        const { issueSignEsCreditNoteForTransaction } = await import('./signEsFiscalIssuer');
        return issueSignEsCreditNoteForTransaction({
            settings,
            originalTransactionId,
            payment,
            creditReason,
        });
    }

    const now = new Date();
    const transactionDate = now.toISOString().split('T')[0];
    const transactionTime = now.toTimeString().split(' ')[0];
    const systemEntryDate = formatSystemEntryDate(now);

    /** NC amounts are positive; InvoiceType NC + SAFT CreditAmount convey the credit. */
    const grossTotal = Math.abs(origFiscal.gross_total);
    const taxTotal = Math.abs(origFiscal.tax_total);
    const netRounded = Math.abs(origFiscal.net_total);
    const total = grossTotal;
    const originalSubtotal = Math.abs(origTx.subtotal);
    const totalDiscountAmount = Math.abs(origTx.discount);
    const discountAmount = origTx.discount ? Math.abs(origTx.discount) : 0;

    const certificationMode = settings.fiscal.trainingMode ? 'training' : 'production';

    const receiptProfile = settings.receipt.seriesProfiles.NC;

    assertIssueDateInSeriesWindow(transactionDate, receiptProfile);

    const seriesKey = computeSeriesKey(receiptProfile, now);
    const atCode = receiptProfile.atValidationCode.trim();
    if (!atCode) {
        throw new Error('Código de validação AT da série NC em falta (Definições > Numeração > NC).');
    }
    const chainScope = buildChainScope(atCode, seriesKey);

    const customerTaxIdForRow = origFiscal.customer_tax_id ?? CONSUMER_FINAL_CUSTOMER_TAX_ID;
    const customerTaxNumberForQr = normalizeTaxIdForQr(origFiscal.customer_tax_id);

    const transactionItems: FiscalCheckoutAtomicPayload['transactionItems'] = origTx.items.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        product_sku: item.product_sku,
        category_id: item.category_id,
        category_name: item.category_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        unit_cost: item.unit_cost,
        iva_rate: item.iva_rate,
        line_total: Math.abs(item.line_total),
        tax_amount: Math.abs(item.tax_amount),
        profit_amount: Math.abs(item.profit_amount),
        discount_amount: item.discount_amount ? Math.abs(item.discount_amount) : 0,
        discount_percentage: item.discount_percentage,
        deleted_at: null,
    }));

    const transactionBase: FiscalCheckoutAtomicPayload['transactionBase'] = {
        employee_id: payment.employeeId,
        employee_name: payment.employeeName,
        customer_id: origTx.customer_id,
        customer_name: origTx.customer_name,
        transaction_date: transactionDate,
        transaction_time: transactionTime,
        subtotal: originalSubtotal,
        discount: discountAmount,
        discount_type: origTx.discount_type ?? 'none',
        discount_percentage: origTx.discount_percentage ?? 0,
        tax: taxTotal,
        total,
        payment_method: origTx.payment_method,
        amount_paid: null,
        change_given: 0,
        status: 'completed',
        notes: (() => {
            const base = `NC referente ${origFiscal.invoice_no}`;
            const r = creditReason?.trim();
            return r ? `${base}. ${r}` : base;
        })(),
        deleted_at: null,
    };

    const signer = params.signer ?? (await createSignerFromSettings(settings));

    let customerCountryForQr = 'PT';
    if (origTx.customer_id) {
        const cust = await customerLocalService.getCustomerById(origTx.customer_id);
        const c = cust?.country?.trim();
        if (c) {
            customerCountryForQr = c.slice(0, 2).toUpperCase() || 'PT';
        }
    }

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
        invoiceTypeSaft: 'NC',
        grossTotal,
        netRounded,
        taxTotal,
        totalDiscountAmount,
        originalSubtotal,
        total,
        changeGiven: 0,
        transactionBase,
        transactionItems,
        customerTaxId: customerTaxIdForRow,
        customerTaxNumberForQr,
        customerCountryForQr,
        payment,
        signer,
        settledInvoiceNo: origFiscal.invoice_no,
        settledInvoiceDateYmd: origFiscal.invoice_date,
    };

    const result = await transactionLocalService.createFiscalCheckoutAtomic(atomicPayload);

    await transactionLocalService.appendFiscalAuditEvent({
        event_type: 'CREDIT_NOTE_ISSUED',
        payload_json: JSON.stringify({
            originalTransactionId,
            originalInvoiceNo: origFiscal.invoice_no,
            originalInvoiceDate: origFiscal.invoice_date,
            creditTransactionId: result.transactionId,
            creditFiscalId: result.fiscalId,
            creditInvoiceNo: result.invoiceNo,
            ...(creditReason?.trim() ? { creditReason: creditReason.trim() } : {}),
        }),
        employee_id: payment.employeeId,
    });

    return result;
}
