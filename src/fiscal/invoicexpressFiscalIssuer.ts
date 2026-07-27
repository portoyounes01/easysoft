import i18n from '../i18n';
import type { SystemSettings } from '../contexts/SettingsContext';
import { transactionLocalService } from '../lib/localDatabase';
import { connectionStatus, supabase } from '../lib/supabase';
import type { LocalCustomer } from '../types/supabase';
import { generateUUID } from '../utils/uuid';
import type {
    ExternalFiscalSnapshot,
    ExternalIssuedItemReference,
    FiscalCheckoutResult,
} from './types';
import {
    buildSaleCheckoutDraft,
    type FiscalCartLine,
    type FiscalGlobalDiscount,
    type FiscalPaymentInput,
} from './saleCheckoutDraft';
import type { SaftFiscalDocumentType } from './spec';

/**
 * InvoiceXpress (cloud, PT-certified) fiscal issuer. Mirrors the Vendus flow:
 * build a document → proxy through the `invoicexpress-fiscal` edge function
 * (which holds the API key) → persist an immutable snapshot.
 */

const EDGE_FUNCTION = 'invoicexpress-fiscal';

/** InvoiceXpress document endpoint + the SAF-T document type it produces. */
const DOCUMENT_TYPE_TO_SAFT: Record<SystemSettings['fiscal']['invoicexpress']['documentType'], SaftFiscalDocumentType> = {
    invoice_receipt: 'FR',
    simplified_invoice: 'FS',
    invoice: 'FT',
};

interface InvoiceXpressTax {
    name: string;
}

interface InvoiceXpressItem {
    name: string;
    description?: string;
    unit_price: number;
    quantity: number;
    /** Per-line discount percentage. */
    discount?: number;
    tax: InvoiceXpressTax;
}

interface InvoiceXpressClient {
    name?: string;
    code?: string;
    fiscal_id?: string;
    address?: string;
    city?: string;
    postal_code?: string;
    country?: string;
}

interface InvoiceXpressDocumentPayload {
    date: string;
    due_date: string;
    reference?: string;
    tax_exemption?: string;
    tax_exemption_reason?: string;
    sequence_id?: string;
    client?: InvoiceXpressClient;
    items: InvoiceXpressItem[];
}

/** Normalised document returned by the edge function after create (+finalize +qrcode). */
interface InvoiceXpressDocumentResponse {
    id?: number | string;
    sequence_number?: string;
    atcud?: string;
    saft_hash?: string;
    permalink?: string;
    status?: string;
    date?: string;
    qr_code_url?: string;
    qr_code?: string;
    items?: Array<Record<string, unknown>>;
    [key: string]: unknown;
}

interface InvoiceXpressFunctionResponse {
    document?: InvoiceXpressDocumentResponse;
    xml?: string;
    ok?: boolean;
    account?: unknown;
    sequences?: unknown;
    error?: string;
}

function assertInvoiceXpressEnabled(settings: SystemSettings): void {
    if (settings.fiscal.issuer !== 'invoicexpress' || !settings.fiscal.invoicexpress.enabled) {
        throw new Error(i18n.t('checkout.invoiceXpressNotEnabled'));
    }
    if (!settings.fiscal.invoicexpress.accountName.trim()) {
        throw new Error(i18n.t('checkout.invoiceXpressMissingAccountName'));
    }
}

function assertOnline(): void {
    const state = connectionStatus.getStatus();
    if (!state.isOnline || !state.isSupabaseOnline) {
        throw new Error(i18n.t('checkout.invoiceXpressOffline'));
    }
}

function certificationMode(settings: SystemSettings): 'production' | 'training' {
    return settings.fiscal.trainingMode ? 'training' : 'production';
}

function normalizeMoney(n: number): number {
    return Number(n.toFixed(2));
}

/** DD/MM/YYYY for the InvoiceXpress request. */
function toInvoiceXpressDate(ymd: string): string {
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
}

/** InvoiceXpress DD/MM/YYYY (or already-ISO) back to YYYY-MM-DD. */
function fromInvoiceXpressDate(raw: string | undefined, fallbackYmd: string): string {
    if (!raw) return fallbackYmd;
    const slash = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (slash) return `${slash[3]}-${slash[2]}-${slash[1]}`;
    const iso = raw.match(/^\d{4}-\d{2}-\d{2}/);
    return iso ? raw.slice(0, 10) : fallbackYmd;
}

/**
 * Maps an IVA decimal rate to the conventional InvoiceXpress tax name. Assumes the
 * account uses the default Portuguese tax names (IVA23/IVA13/IVA6/ISENTA).
 */
function invoiceXpressTaxName(ivaRate: number): string {
    const pct = Math.round(ivaRate * 100);
    if (pct <= 0) return 'ISENTA';
    return `IVA${pct}`;
}

function clientFor(customer: LocalCustomer | null): InvoiceXpressClient | undefined {
    if (!customer) return undefined;
    const fiscalId = customer.tax_number?.replace(/\s/g, '').trim();
    return {
        name: customer.name?.trim() || 'Consumidor Final',
        ...(customer.id ? { code: customer.id.slice(0, 30) } : {}),
        ...(fiscalId ? { fiscal_id: fiscalId } : {}),
        address: customer.address?.trim() || undefined,
        city: customer.city?.trim() || undefined,
        postal_code: customer.postal_code?.trim() || undefined,
        country: (customer.country || 'Portugal').trim() || 'Portugal',
    };
}

function itemsForSale(cart: FiscalCartLine[]): InvoiceXpressItem[] {
    return cart.map(line => ({
        name: line.product.name,
        description: line.product.sku || undefined,
        unit_price: normalizeMoney(line.product.price),
        quantity: line.quantity,
        ...(line.discount ? { discount: line.discount } : {}),
        tax: { name: invoiceXpressTaxName(line.product.iva_rate) },
    }));
}

function hasExemptLine(cart: FiscalCartLine[]): boolean {
    return cart.some(line => Math.round(line.product.iva_rate * 100) <= 0);
}

function externalItemRefs(
    document: InvoiceXpressDocumentResponse,
    localItems: ReturnType<typeof buildSaleCheckoutDraft>['transactionItems']
): ExternalIssuedItemReference[] {
    const remoteItems = Array.isArray(document.items) ? document.items : [];
    return localItems.map((item, index) => {
        const remote = (remoteItems[index] || {}) as Record<string, unknown>;
        return {
            localProductId: item.product_id,
            localSku: item.product_sku,
            externalItemId: remote.id == null ? null : String(remote.id),
            referenceId: remote.id == null ? null : String(remote.id),
            documentRow: index + 1,
        };
    });
}

async function invokeFunction(body: Record<string, unknown>): Promise<InvoiceXpressFunctionResponse> {
    const { data, error } = await supabase.functions.invoke<InvoiceXpressFunctionResponse>(EDGE_FUNCTION, { body });
    if (error) {
        throw new Error(`InvoiceXpress Edge Function falhou: ${error.message}`);
    }
    if (!data) {
        throw new Error('InvoiceXpress Edge Function não devolveu dados.');
    }
    if (data.error) {
        throw new Error(data.error);
    }
    return data;
}

function snapshotFrom(
    document: InvoiceXpressDocumentResponse,
    params: {
        settings: SystemSettings;
        type: SaftFiscalDocumentType;
        txId: string;
        externalReference: string;
        amountGross: number;
        amountNet: number;
        transactionDate: string;
        systemEntryDate: string;
        items: ExternalIssuedItemReference[];
    }
): ExternalFiscalSnapshot {
    const id = document.id == null ? '' : String(document.id);
    const number = document.sequence_number?.trim() || '';
    if (!id || !number) {
        throw new Error('Resposta InvoiceXpress inválida: documento sem id ou número.');
    }
    const accountName = params.settings.fiscal.invoicexpress.accountName.trim();
    const atcud = document.atcud?.trim() || '';
    const permalink = document.permalink?.trim();
    return {
        provider: 'invoicexpress',
        documentId: id,
        number,
        type: params.type,
        date: fromInvoiceXpressDate(document.date, params.transactionDate),
        systemTime: params.systemEntryDate,
        localTime: params.systemEntryDate,
        amountGross: params.amountGross,
        amountNet: params.amountNet,
        hash: document.saft_hash?.trim() || '',
        atcud,
        qrcodeData: document.qr_code || document.qr_code_url || undefined,
        outputFormat: permalink ? 'pdf_url' : 'none',
        output: permalink,
        outputData: undefined,
        txId: params.txId,
        externalReference: params.externalReference,
        chainScope: `invoicexpress::${accountName}::${params.type}`,
        atValidationCode: atcud.split('-')[0] || 'INVOICEXPRESS',
        items: params.items,
        providerMeta: {
            accountName,
            permalink,
            status: document.status,
            sequenceNumber: number,
        },
        raw: document,
    };
}

export async function issueInvoiceXpressSale(params: {
    settings: SystemSettings;
    cart: FiscalCartLine[];
    selectedCustomer: LocalCustomer | null;
    payment: FiscalPaymentInput;
    globalDiscount?: FiscalGlobalDiscount;
}): Promise<FiscalCheckoutResult> {
    const { settings, cart, selectedCustomer, payment, globalDiscount } = params;
    assertInvoiceXpressEnabled(settings);
    assertOnline();

    const ix = settings.fiscal.invoicexpress;
    const draft = buildSaleCheckoutDraft({ cart, selectedCustomer, payment, globalDiscount });
    const type = DOCUMENT_TYPE_TO_SAFT[ix.documentType];
    const attemptId = generateUUID();
    const txId = `pos-sale-${attemptId}`;
    const externalReference = `POS-${attemptId}`;

    const document: InvoiceXpressDocumentPayload = {
        date: toInvoiceXpressDate(draft.transactionDate),
        due_date: toInvoiceXpressDate(draft.transactionDate),
        reference: externalReference,
        ...(ix.sequenceId?.trim() ? { sequence_id: ix.sequenceId.trim() } : {}),
        ...(hasExemptLine(cart) && ix.exemptTax.code?.trim()
            ? {
                  tax_exemption: ix.exemptTax.code.trim(),
                  ...(ix.exemptTax.law?.trim() ? { tax_exemption_reason: ix.exemptTax.law.trim() } : {}),
              }
            : {}),
        client: clientFor(selectedCustomer),
        items: itemsForSale(cart),
    };

    const request = {
        action: 'issue_document' as const,
        accountName: ix.accountName.trim(),
        documentType: ix.documentType,
        finalize: ix.finalizeOnIssue,
        idempotencyKey: attemptId,
        document,
    };

    await transactionLocalService.createVendusIssueAttempt({
        id: attemptId,
        provider: 'invoicexpress',
        kind: 'sale',
        tx_id: txId,
        external_reference: externalReference,
        status: 'pending',
        vendus_document_id: null,
        local_transaction_id: null,
        request_json: JSON.stringify(request),
        response_json: null,
        error_message: null,
    });

    try {
        const response = await invokeFunction(request);
        if (!response.document) {
            throw new Error('InvoiceXpress não devolveu o documento emitido.');
        }
        const amountGross = normalizeMoney(draft.total);
        const amountNet = Number((draft.total - draft.totalTax).toFixed(2));
        const external = snapshotFrom(response.document, {
            settings,
            type,
            txId,
            externalReference,
            amountGross,
            amountNet,
            transactionDate: draft.transactionDate,
            systemEntryDate: draft.systemEntryDate,
            items: externalItemRefs(response.document, draft.transactionItems),
        });
        await transactionLocalService.updateVendusIssueAttempt(attemptId, {
            status: 'issued',
            vendus_document_id: external.documentId,
            response_json: JSON.stringify(response.document),
        });
        const result = await transactionLocalService.createExternalFiscalCheckoutAtomic({
            certificationMode: certificationMode(settings),
            transactionDate: draft.transactionDate,
            transactionTime: draft.transactionTime,
            systemEntryDate: draft.systemEntryDate,
            grossTotal: draft.total,
            netRounded: amountNet,
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
            status: 'persisted',
            vendus_document_id: external.documentId,
            local_transaction_id: result.transactionId,
        });
        return result;
    } catch (error) {
        await transactionLocalService.updateVendusIssueAttempt(attemptId, {
            status: 'failed',
            error_message: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}

export async function issueInvoiceXpressCreditNoteForTransaction(params: {
    settings: SystemSettings;
    originalTransactionId: string;
    payment: FiscalPaymentInput;
    creditReason?: string;
}): Promise<FiscalCheckoutResult> {
    throw new Error(
        i18n.t('checkout.invoiceXpressCreditNotesUnavailable', { transactionId: params.originalTransactionId })
    );
}

export async function fetchInvoiceXpressSaftXml(params: {
    settings: SystemSettings;
    year: number;
    month: number;
}): Promise<string> {
    assertInvoiceXpressEnabled(params.settings);
    assertOnline();
    const response = await invokeFunction({
        action: 'saft',
        accountName: params.settings.fiscal.invoicexpress.accountName.trim(),
        year: params.year,
        month: params.month,
    });
    if (!response.xml) {
        throw new Error(i18n.t('checkout.invoiceXpressNoSaft'));
    }
    return atob(response.xml);
}

export interface InvoiceXpressHealthCheckResult {
    ok: boolean;
    account: unknown;
    sequences: unknown;
}

export async function checkInvoiceXpressFiscalHealth(settings: SystemSettings): Promise<InvoiceXpressHealthCheckResult> {
    assertInvoiceXpressEnabled(settings);
    assertOnline();
    const response = await invokeFunction({
        action: 'health_check',
        accountName: settings.fiscal.invoicexpress.accountName.trim(),
    });
    return {
        ok: Boolean(response.ok),
        account: response.account,
        sequences: response.sequences,
    };
}
