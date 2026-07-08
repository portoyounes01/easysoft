import type { SystemSettings } from '../contexts/SettingsContext';
import { transactionLocalService } from '../lib/localDatabase';
import { connectionStatus, supabase } from '../lib/supabase';
import type { LocalCustomer } from '../types/supabase';
import { generateUUID } from '../utils/uuid';
import type { ExternalFiscalSnapshot, FiscalCheckoutResult } from './types';
import {
    buildSaleCheckoutDraft,
    formatSystemEntryDate,
    type FiscalCartLine,
    type FiscalGlobalDiscount,
    type FiscalPaymentInput,
} from './saleCheckoutDraft';

/**
 * Spain — fiskaly SIGN ES (Veri*factu) issuer. The heavy lifting is SERVER-SIDE in the
 * `pos-checkout-es` edge fn (idempotency ledger, correlative numbering, SIGN ES call,
 * fiscal_documents archive); this module maps the till's cart to the ES invoice shape,
 * invokes the fn with the device session, and persists the immutable local snapshot so
 * receipts/history work exactly like the other external issuers.
 *
 * Contract facts (docs/es-sign-contract-capture.md): money fields are decimal STRINGS;
 * sum(items.full_amount) MUST equal invoice.full_amount; the response carries the AEAT
 * validation URL (the QR target), the mandatory legend and the async registration state.
 */

const EDGE_FUNCTION = 'pos-checkout-es';

// Strict Spanish NIF/CIF/NIE shape: 9 alphanumerics INCLUDING at least one letter — a pure
// 9-digit value (PT NIF, incl. the 999999990 consumer placeholder) never triggers COMPLETE.
const ES_NIF_STRICT = /^(?=.*[A-Z])[A-Z0-9]{9}$/;

interface SignEsIssueResponse {
    status?: string;
    registration?: string;
    fiscal_document?: {
        id: string;
        series: string;
        number: string;
        doc_type: string;
        invoice_kind: string | null;
        aeat_validation_url: string | null;
        compliance_legend: string | null;
        verifactu_registration: string | null;
        fiskaly_record_id: string | null;
        environment: string;
    };
    error?: string;
    detail?: unknown;
}

function assertOnline(): void {
    const state = connectionStatus.getStatus();
    if (!state.isOnline || !state.isSupabaseOnline) {
        throw new Error('SIGN ES é o emissor fiscal — a venda fica bloqueada até existir ligação ao servidor.');
    }
}

function certificationMode(settings: SystemSettings): 'production' | 'training' {
    return settings.fiscal.trainingMode ? 'training' : 'production';
}

const dec2 = (n: number): string => n.toFixed(2);
const dec8 = (n: number): string => n.toFixed(8);
/** 0.21 -> '21.0' (SIGN ES rate strings are percentages with decimals). */
const rateStr = (rate: number): string => (rate * 100).toFixed(1);

async function invokeSignEs(body: Record<string, unknown>): Promise<SignEsIssueResponse> {
    const { data, error } = await supabase.functions.invoke<SignEsIssueResponse>(EDGE_FUNCTION, { body });
    if (error) {
        // FunctionsHttpError hides the JSON body — surface it for actionable till errors.
        const ctx = (error as { context?: Response }).context;
        let detail = error.message;
        try {
            if (ctx && typeof ctx.json === 'function') {
                const e = await ctx.json();
                detail = e?.error ? `${e.error}${e.detail ? `: ${JSON.stringify(e.detail).slice(0, 200)}` : ''}` : detail;
            }
        } catch { /* keep default */ }
        throw new Error(`SIGN ES: ${detail}`);
    }
    if (!data) throw new Error('SIGN ES: resposta vazia do servidor.');
    if (data.error) throw new Error(`SIGN ES: ${data.error}`);
    return data;
}

function snapshotFrom(doc: NonNullable<SignEsIssueResponse['fiscal_document']>, params: {
    type: 'FS' | 'FT' | 'NC';
    txId: string;
    externalReference: string;
    amountGross: number;
    amountNet: number;
    transactionDate: string;
    systemEntryDate: string;
}): ExternalFiscalSnapshot {
    return {
        provider: 'sign_es',
        documentId: doc.id,                       // server fiscal_documents id (archive row)
        number: `${doc.series}/${doc.number}`,
        type: params.type,
        date: params.transactionDate,
        systemTime: params.systemEntryDate,
        localTime: params.systemEntryDate,
        amountGross: params.amountGross,
        amountNet: params.amountNet,
        hash: '',                                 // fiskaly owns the Veri*factu chain (huella)
        atcud: '',                                // ES has no ATCUD — receipt hides the line
        qrcodeData: doc.aeat_validation_url ?? '', // QR content = the AEAT validation URL
        outputFormat: 'none',
        txId: params.txId,
        externalReference: params.externalReference,
        chainScope: `sign_es::${doc.environment}::${doc.series}`,
        atValidationCode: 'VERIFACTU',
        items: [],
        providerMeta: {
            legend: doc.compliance_legend,        // 'QR tributario:|VERI*FACTU'
            aeatValidationUrl: doc.aeat_validation_url,
            verifactuRegistration: doc.verifactu_registration,
            invoiceKind: doc.invoice_kind,
            serverFiscalDocumentId: doc.id,
        },
        raw: doc,
    };
}

export async function issueSignEsSale(params: {
    settings: SystemSettings;
    cart: FiscalCartLine[];
    selectedCustomer: LocalCustomer | null;
    payment: FiscalPaymentInput;
    globalDiscount?: FiscalGlobalDiscount;
}): Promise<FiscalCheckoutResult> {
    const { settings, cart, selectedCustomer, payment, globalDiscount } = params;
    assertOnline();
    const draft = buildSaleCheckoutDraft({ cart, selectedCustomer, payment, globalDiscount });

    // Map till lines (tax-INCLUSIVE prices) to SIGN ES items. full_amount per line = the gross
    // line total the till charged; the invoice total is the exact sum of those (in cents), which
    // guarantees the server's items-sum==full_amount check. ⚠ unit_amount/discount are net values
    // derived by division — fiskaly's own cross-check tolerance is unverified for discounted lines
    // (ES-0 used clean numbers); the first discounted TEST sale confirms it.
    let sumCents = 0;
    const items = draft.transactionItems.map((it) => {
        const rate = it.iva_rate;
        const grossLine = Math.round(it.line_total * 100) / 100;
        sumCents += Math.round(grossLine * 100);
        const discountGross = it.discount_amount ?? 0;
        return {
            text: (it.product_name || 'Artículo').slice(0, 250),
            quantity: dec2(it.quantity),
            unit_amount: dec8(it.unit_price / (1 + rate)),
            ...(discountGross > 0 ? { discount: dec8(discountGross / (1 + rate)) } : {}),
            full_amount: dec2(grossLine),
            system: { type: 'REGULAR', category: { type: 'VAT', rate: rateStr(rate) } },
        };
    });
    const fullAmount = (sumCents / 100).toFixed(2);
    if (Math.abs(sumCents / 100 - draft.total) > 0.02) {
        throw new Error(`SIGN ES: soma das linhas (${fullAmount}) difere do total (${draft.total.toFixed(2)}).`);
    }

    const taxId = selectedCustomer?.tax_number?.replace(/\s/g, '').trim().toUpperCase() ?? '';
    const wantsComplete = ES_NIF_STRICT.test(taxId);
    const attemptId = generateUUID();
    const txId = `pos-es-${attemptId}`;
    const externalReference = `POS-ES-${attemptId}`;

    const request = {
        checkout_id: attemptId,
        doc_type: wantsComplete ? 'COMPLETE' : 'SIMPLIFIED',
        text: 'Venta TPV',
        full_amount: fullAmount,
        items,
        ...(wantsComplete ? { recipient: {
            nif: taxId,
            legal_name: selectedCustomer?.name?.trim() || 'Cliente',
            address_line: selectedCustomer?.address?.trim() || '-',
            postal_code: '-',
        } } : {}),
    };

    await transactionLocalService.createVendusIssueAttempt({
        id: attemptId, provider: 'sign_es', kind: 'sale', tx_id: txId, external_reference: externalReference,
        status: 'pending', vendus_document_id: null, local_transaction_id: null,
        request_json: JSON.stringify(request), response_json: null, error_message: null,
    });

    try {
        const response = await invokeSignEs(request);
        const doc = response.fiscal_document;
        if (!doc) throw new Error('SIGN ES não devolveu o documento emitido.');
        const external = snapshotFrom(doc, {
            type: wantsComplete ? 'FT' : 'FS',
            txId, externalReference,
            amountGross: draft.total,
            amountNet: Math.round((draft.total - draft.totalTax) * 100) / 100,
            transactionDate: draft.transactionDate,
            systemEntryDate: draft.systemEntryDate,
        });
        await transactionLocalService.updateVendusIssueAttempt(attemptId, {
            status: 'issued', vendus_document_id: doc.id, response_json: JSON.stringify(doc),
        });
        const result = await transactionLocalService.createExternalFiscalCheckoutAtomic({
            certificationMode: certificationMode(settings),
            transactionDate: draft.transactionDate,
            transactionTime: draft.transactionTime,
            systemEntryDate: draft.systemEntryDate,
            grossTotal: draft.total,
            netRounded: Math.round((draft.total - draft.totalTax) * 100) / 100,
            taxTotal: draft.totalTax,
            totalDiscountAmount: draft.totalDiscountAmount,
            originalSubtotal: draft.originalSubtotal,
            total: draft.total,
            changeGiven: draft.changeGiven,
            transactionBase: draft.transactionBase,
            transactionItems: draft.transactionItems,
            customerTaxId: draft.fiscalCustomer.taxIdForFiscalRow,
            payment,
            external,
        });
        await transactionLocalService.updateVendusIssueAttempt(attemptId, {
            status: 'persisted', vendus_document_id: doc.id, local_transaction_id: result.transactionId,
        });
        return result;
    } catch (error) {
        await transactionLocalService.updateVendusIssueAttempt(attemptId, {
            status: 'failed', error_message: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}

/**
 * ES "credit note" = factura rectificativa por SUSTITUCIÓN a 0 (full void of the original) —
 * the CORRECTING wrapper verified in ES-0. Issued server-side against the original archive row.
 */
export async function issueSignEsCreditNoteForTransaction(params: {
    settings: SystemSettings;
    originalTransactionId: string;
    payment: FiscalPaymentInput;
    creditReason?: string;
}): Promise<FiscalCheckoutResult> {
    const { settings, originalTransactionId, payment, creditReason } = params;
    assertOnline();

    const origTx = await transactionLocalService.getTransactionById(originalTransactionId);
    if (!origTx?.fiscal_document_id) throw new Error('Transação sem documento fiscal — não é possível rectificar.');
    const origFiscal = await transactionLocalService.getFiscalDocumentById(origTx.fiscal_document_id);
    if (!origFiscal) throw new Error('Documento fiscal original em falta.');
    if (origFiscal.fiscal_provider !== 'sign_es') throw new Error('O documento original não foi emitido via SIGN ES.');

    let metadata: { externalDocumentId?: string } | null = null;
    try { metadata = origTx.fiscal_metadata_json ? JSON.parse(origTx.fiscal_metadata_json) : null; } catch { metadata = null; }
    const originalServerDocId = metadata?.externalDocumentId;
    if (!originalServerDocId) throw new Error('Referência do documento SIGN ES original em falta.');

    const now = new Date();
    const transactionDate = now.toISOString().split('T')[0];
    const transactionTime = now.toTimeString().split(' ')[0];
    const systemEntryDate = formatSystemEntryDate(now);
    const reason = creditReason?.trim() || `Rectificativa de ${origFiscal.invoice_no}`;

    const attemptId = generateUUID();
    const txId = `pos-es-nc-${attemptId}`;
    const externalReference = `POS-ES-NC-${attemptId}`;
    const request = {
        checkout_id: attemptId,
        doc_type: 'CORRECTING',
        original_fiscal_document_id: originalServerDocId,
        correction_code: 'CORRECTION_1',
        text: reason.slice(0, 250),
        full_amount: '0.00',
        items: [{
            text: `Anulación ${origFiscal.invoice_no}`.slice(0, 250),
            quantity: '1.00', unit_amount: '0.00', full_amount: '0.00',
            system: { type: 'REGULAR', category: { type: 'VAT', rate: '21.0' } },
        }],
    };

    await transactionLocalService.createVendusIssueAttempt({
        id: attemptId, provider: 'sign_es', kind: 'credit_note', tx_id: txId, external_reference: externalReference,
        status: 'pending', vendus_document_id: null, local_transaction_id: null,
        request_json: JSON.stringify(request), response_json: null, error_message: null,
    });

    try {
        const response = await invokeSignEs(request);
        const doc = response.fiscal_document;
        if (!doc) throw new Error('SIGN ES não devolveu a rectificativa emitida.');

        const grossTotal = Math.abs(origFiscal.gross_total);
        const taxTotal = Math.abs(origFiscal.tax_total);
        const netRounded = Math.abs(origFiscal.net_total);
        const external = snapshotFrom(doc, {
            type: 'NC', txId, externalReference,
            amountGross: grossTotal, amountNet: netRounded,
            transactionDate, systemEntryDate,
        });
        await transactionLocalService.updateVendusIssueAttempt(attemptId, {
            status: 'issued', vendus_document_id: doc.id, response_json: JSON.stringify(doc),
        });
        const result = await transactionLocalService.createExternalFiscalCheckoutAtomic({
            certificationMode: certificationMode(settings),
            transactionDate, transactionTime, systemEntryDate,
            grossTotal, netRounded, taxTotal,
            totalDiscountAmount: Math.abs(origTx.discount || 0),
            originalSubtotal: Math.abs(origTx.subtotal),
            total: grossTotal, changeGiven: 0,
            transactionBase: {
                employee_id: payment.employeeId,
                employee_name: payment.employeeName,
                customer_id: origTx.customer_id,
                customer_name: origTx.customer_name,
                transaction_date: transactionDate,
                transaction_time: transactionTime,
                subtotal: Math.abs(origTx.subtotal),
                discount: Math.abs(origTx.discount || 0),
                discount_type: origTx.discount_type ?? 'none',
                discount_percentage: origTx.discount_percentage ?? 0,
                tax: taxTotal,
                total: grossTotal,
                payment_method: origTx.payment_method,
                amount_paid: null,
                change_given: 0,
                status: 'completed',
                notes: `NC referente ${origFiscal.invoice_no}. ${reason}`,
                deleted_at: null,
            },
            transactionItems: origTx.items.map((item) => ({
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
            })),
            customerTaxId: origFiscal.customer_tax_id,
            payment,
            external,
            settledInvoiceNo: origFiscal.invoice_no,
            settledInvoiceDateYmd: origFiscal.invoice_date,
        });
        await transactionLocalService.updateVendusIssueAttempt(attemptId, {
            status: 'persisted', vendus_document_id: doc.id, local_transaction_id: result.transactionId,
        });
        return result;
    } catch (error) {
        await transactionLocalService.updateVendusIssueAttempt(attemptId, {
            status: 'failed', error_message: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}
