import type { SystemSettings } from '../contexts/SettingsContext';
import { transactionLocalService } from '../lib/localDatabase';
import { connectionStatus, supabase } from '../lib/supabase';
import type { LocalCustomer, LocalTransactionItem } from '../types/supabase';
import { generateUUID } from '../utils/uuid';
import { mapIvaDecimalToSaftTaxCode } from './saft/exportSaft';
import type {
    FiscalCheckoutResult,
    FiscalTransactionMetadata,
    VendusFiscalCheckoutPersistencePayload,
    VendusFiscalSnapshot,
    VendusIssuedItemReference,
} from './types';
import {
    buildSaleCheckoutDraft,
    type FiscalCartLine,
    type FiscalGlobalDiscount,
    type FiscalPaymentInput,
    formatSystemEntryDate,
} from './saleCheckoutDraft';

type VendusDocumentType = 'FT' | 'FS' | 'FR' | 'NC';
type VendusMode = 'normal' | 'tests';

interface VendusClient {
    id?: number | string;
    name?: string;
    fiscal_id?: string;
    address?: string;
    postalcode?: string;
    city?: string;
    country?: string;
}

interface VendusDocumentItem {
    id?: string;
    reference?: string;
    gross_price?: number;
    qty: number;
    type_id?: 'P';
    title?: string;
    discount_percentage?: string;
    tax_id: string;
    tax_exemption?: string;
    tax_exemption_law?: string;
    reference_document?: {
        document_number: string;
        document_row: number;
        reference_id?: string;
        reference_relation?: string;
    };
}

interface VendusIssueDocumentPayload {
    register_id: number;
    store_id?: number;
    type: VendusDocumentType;
    mode: VendusMode;
    output: SystemSettings['fiscal']['vendus']['output'];
    tx_id: string;
    external_reference: string;
    return_qrcode: 1;
    errors_full: 'yes';
    discount_amount?: number;
    notes?: string;
    client?: VendusClient;
    payments?: Array<{ id: string; amount: number }>;
    items: VendusDocumentItem[];
}

interface VendusDocumentResponse {
    id?: number | string;
    type?: VendusDocumentType;
    number?: string;
    date?: string;
    system_time?: string;
    local_time?: string;
    amount_gross?: number | string;
    amount_net?: number | string;
    hash?: string;
    atcud?: string;
    output?: string;
    output_data?: unknown;
    qrcode?: string;
    qrcode_data?: string;
    items?: Array<Record<string, unknown>>;
    external_reference?: string;
}

interface VendusFunctionResponse {
    document?: VendusDocumentResponse;
    xml?: string;
    ok?: boolean;
    account?: unknown;
    taxes?: unknown;
    paymentMethods?: unknown;
    error?: string;
}

function assertVendusEnabled(settings: SystemSettings): void {
    if (settings.fiscal.issuer !== 'vendus' || !settings.fiscal.vendus.enabled) {
        throw new Error('Vendus não está ativo nas definições fiscais.');
    }
    if (!settings.fiscal.vendus.registerId.trim()) {
        throw new Error('Register ID Vendus em falta nas definições fiscais.');
    }
}

function assertOnlineForVendus(): void {
    const state = connectionStatus.getStatus();
    if (!state.isOnline || !state.isSupabaseOnline) {
        throw new Error('Vendus está configurado como emissor fiscal. A venda fica bloqueada até existir ligação ao Supabase/Vendus.');
    }
}

function parseOptionalInt(raw: string | undefined): number | undefined {
    const trimmed = raw?.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`Identificador Vendus inválido: ${raw}`);
    }
    return n;
}

function paymentMethodIdFor(settings: SystemSettings, method: FiscalPaymentInput['paymentMethod']): string {
    const id = settings.fiscal.vendus.paymentMethodIds[method]?.trim();
    if (!id) {
        throw new Error(`Método de pagamento Vendus em falta para ${method}.`);
    }
    return id;
}

function vendusMode(settings: SystemSettings): VendusMode {
    return settings.fiscal.vendus.mode === 'normal' ? 'normal' : 'tests';
}

function certificationModeForVendus(settings: SystemSettings): 'production' | 'training' {
    return settings.fiscal.trainingMode || vendusMode(settings) === 'tests' ? 'training' : 'production';
}

function normalizeMoney(n: number): number {
    return Number(n.toFixed(2));
}

function clientForVendus(customer: LocalCustomer | null): VendusClient | undefined {
    if (!customer) return undefined;
    const fiscalId = customer.tax_number?.replace(/\s/g, '').trim();
    return {
        name: customer.name?.trim() || undefined,
        ...(fiscalId ? { fiscal_id: fiscalId } : {}),
        address: customer.address?.trim() || undefined,
        postalcode: customer.postal_code?.trim() || undefined,
        city: customer.city?.trim() || undefined,
        country: (customer.country || 'PT').trim().slice(0, 2).toUpperCase() || 'PT',
    };
}

function itemTaxFields(settings: SystemSettings, ivaRate: number): Pick<VendusDocumentItem, 'tax_id' | 'tax_exemption' | 'tax_exemption_law'> {
    const taxId = mapIvaDecimalToSaftTaxCode(ivaRate);
    if (taxId !== 'ISE') {
        return { tax_id: taxId };
    }
    const code = settings.fiscal.vendus.exemptTax.code?.trim() || 'M99';
    const law = settings.fiscal.vendus.exemptTax.law?.trim();
    return {
        tax_id: taxId,
        tax_exemption: code,
        ...(law ? { tax_exemption_law: law } : {}),
    };
}

function vendusItemsForSale(settings: SystemSettings, cart: FiscalCartLine[]): VendusDocumentItem[] {
    return cart.map(line => ({
        reference: line.product.sku || line.product.id,
        gross_price: normalizeMoney(line.product.price),
        qty: line.quantity,
        type_id: 'P',
        title: line.product.name,
        discount_percentage: String(line.discount || 0),
        ...itemTaxFields(settings, line.product.iva_rate),
    }));
}

function extractIssuedItemRefs(
    document: VendusDocumentResponse,
    localItems: VendusFiscalCheckoutPersistencePayload['transactionItems']
): VendusIssuedItemReference[] {
    const remoteItems = Array.isArray(document.items) ? document.items : [];
    return localItems.map((item, index) => {
        const remote = remoteItems[index] || {};
        const documentRowRaw = remote.document_row ?? remote.row ?? remote.line ?? index + 1;
        const documentRow = Number(documentRowRaw);
        return {
            localProductId: item.product_id,
            localSku: item.product_sku,
            vendusItemId: remote.id == null ? null : String(remote.id),
            referenceId: remote.reference_id == null ? (remote.id == null ? null : String(remote.id)) : String(remote.reference_id),
            documentRow: Number.isFinite(documentRow) && documentRow > 0 ? documentRow : index + 1,
        };
    });
}

function parseVendusDocument(
    document: VendusDocumentResponse,
    request: VendusIssueDocumentPayload,
    localItems: VendusFiscalCheckoutPersistencePayload['transactionItems']
): VendusFiscalSnapshot {
    const id = document.id == null ? '' : String(document.id);
    const number = document.number?.trim() || '';
    if (!id || !number) {
        throw new Error('Resposta Vendus inválida: documento sem id ou número.');
    }
    const amountGross = Number(document.amount_gross);
    const amountNet = Number(document.amount_net);
    if (!Number.isFinite(amountGross) || !Number.isFinite(amountNet)) {
        throw new Error('Resposta Vendus inválida: totais ausentes.');
    }
    return {
        documentId: id,
        number,
        type: document.type || request.type,
        date: document.date || new Date().toISOString().slice(0, 10),
        systemTime: document.system_time || new Date().toISOString(),
        localTime: document.local_time || document.system_time || new Date().toISOString(),
        amountGross,
        amountNet,
        hash: document.hash || '',
        atcud: document.atcud || '',
        qrcodeSvg: document.qrcode,
        qrcodeData: document.qrcode_data,
        outputFormat: request.output,
        output: document.output,
        outputData: document.output_data,
        txId: request.tx_id,
        externalReference: document.external_reference || request.external_reference,
        registerId: String(request.register_id),
        storeId: request.store_id == null ? undefined : String(request.store_id),
        mode: request.mode,
        items: extractIssuedItemRefs(document, localItems),
        raw: document,
    };
}

async function invokeVendusFunction(body: Record<string, unknown>): Promise<VendusFunctionResponse> {
    const { data, error } = await supabase.functions.invoke<VendusFunctionResponse>('vendus-fiscal', {
        body,
    });
    if (error) {
        throw new Error(`Vendus Edge Function falhou: ${error.message}`);
    }
    if (!data) {
        throw new Error('Vendus Edge Function não devolveu dados.');
    }
    if (data.error) {
        throw new Error(data.error);
    }
    return data;
}

export async function issueVendusSale(params: {
    settings: SystemSettings;
    cart: FiscalCartLine[];
    selectedCustomer: LocalCustomer | null;
    payment: FiscalPaymentInput;
    globalDiscount?: FiscalGlobalDiscount;
}): Promise<FiscalCheckoutResult> {
    const { settings, cart, selectedCustomer, payment, globalDiscount } = params;
    assertVendusEnabled(settings);
    assertOnlineForVendus();

    const draft = buildSaleCheckoutDraft({ cart, selectedCustomer, payment, globalDiscount });
    const attemptId = generateUUID();
    const txId = `pos-sale-${attemptId}`;
    const externalReference = `POS-${attemptId}`;
    const request: VendusIssueDocumentPayload = {
        register_id: parseOptionalInt(settings.fiscal.vendus.registerId) ?? 0,
        store_id: parseOptionalInt(settings.fiscal.vendus.storeId),
        type: settings.fiscal.vendus.documentType,
        mode: vendusMode(settings),
        output: settings.fiscal.vendus.output,
        tx_id: txId,
        external_reference: externalReference,
        return_qrcode: 1,
        errors_full: 'yes',
        ...(draft.globalDiscountAmount > 0 ? { discount_amount: normalizeMoney(draft.globalDiscountAmount) } : {}),
        client: clientForVendus(selectedCustomer),
        payments: [{ id: paymentMethodIdFor(settings, payment.paymentMethod), amount: normalizeMoney(draft.total) }],
        items: vendusItemsForSale(settings, cart),
    };

    await transactionLocalService.createVendusIssueAttempt({
        id: attemptId,
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
        const response = await invokeVendusFunction({ action: 'issue_document', document: request });
        if (!response.document) {
            throw new Error('Vendus não devolveu o documento emitido.');
        }
        const vendus = parseVendusDocument(response.document, request, draft.transactionItems);
        await transactionLocalService.updateVendusIssueAttempt(attemptId, {
            status: 'issued',
            vendus_document_id: vendus.documentId,
            response_json: JSON.stringify(response.document),
        });
        const result = await transactionLocalService.createVendusFiscalCheckoutAtomic({
            certificationMode: certificationModeForVendus(settings),
            transactionDate: draft.transactionDate,
            transactionTime: draft.transactionTime,
            systemEntryDate: draft.systemEntryDate,
            grossTotal: draft.total,
            netRounded: Number((draft.total - draft.totalTax).toFixed(2)),
            taxTotal: draft.totalTax,
            totalDiscountAmount: draft.totalDiscountAmount,
            originalSubtotal: draft.originalSubtotal,
            total: draft.total,
            changeGiven: draft.changeGiven,
            transactionBase: draft.transactionBase,
            transactionItems: draft.transactionItems,
            customerTaxId: draft.fiscalCustomer.taxIdForFiscalRow,
            payment,
            vendus,
        });
        await transactionLocalService.updateVendusIssueAttempt(attemptId, {
            status: 'persisted',
            vendus_document_id: vendus.documentId,
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

function parseMetadata(raw: string | null | undefined): FiscalTransactionMetadata | null {
    if (!raw) return null;
    try {
        return JSON.parse(raw) as FiscalTransactionMetadata;
    } catch {
        return null;
    }
}

export async function issueVendusCreditNoteForTransaction(params: {
    settings: SystemSettings;
    originalTransactionId: string;
    payment: FiscalPaymentInput;
    creditReason?: string;
}): Promise<FiscalCheckoutResult> {
    const { settings, originalTransactionId, payment, creditReason } = params;
    assertVendusEnabled(settings);
    assertOnlineForVendus();

    const origTx = await transactionLocalService.getTransactionById(originalTransactionId);
    if (!origTx?.fiscal_document_id) {
        throw new Error('Transação sem documento fiscal — não é possível emitir nota de crédito.');
    }
    const origFiscal = await transactionLocalService.getFiscalDocumentById(origTx.fiscal_document_id);
    if (!origFiscal) {
        throw new Error('Documento fiscal original em falta.');
    }
    if (origFiscal.fiscal_provider !== 'vendus') {
        throw new Error('O documento original não foi emitido pela Vendus.');
    }
    const meta = parseMetadata(origTx.fiscal_metadata_json);
    const refs = meta?.vendus?.items || [];
    if (refs.length === 0) {
        throw new Error('Referências de linhas Vendus em falta para emitir nota de crédito.');
    }

    const now = new Date();
    const transactionDate = now.toISOString().split('T')[0];
    const transactionTime = now.toTimeString().split(' ')[0];
    const systemEntryDate = formatSystemEntryDate(now);
    const grossTotal = Math.abs(origFiscal.gross_total);
    const taxTotal = Math.abs(origFiscal.tax_total);
    const netRounded = Math.abs(origFiscal.net_total);
    const reason = creditReason?.trim() || `Nota de crédito referente ${origFiscal.invoice_no}`;

    const transactionItems: VendusFiscalCheckoutPersistencePayload['transactionItems'] = origTx.items.map(item => ({
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

    const requestItems: VendusDocumentItem[] = origTx.items.map((item: LocalTransactionItem, index) => {
        const ref = refs[index];
        if (!ref) {
            throw new Error(`Referência Vendus em falta para a linha ${index + 1}.`);
        }
        return {
            id: ref.vendusItemId || undefined,
            reference: item.product_sku || item.product_id,
            gross_price: normalizeMoney(item.unit_price),
            qty: item.quantity,
            type_id: 'P',
            title: item.product_name,
            discount_percentage: String(item.discount_percentage || 0),
            ...itemTaxFields(settings, item.iva_rate),
            reference_document: {
                document_number: origFiscal.invoice_no,
                document_row: ref.documentRow,
                ...(ref.referenceId ? { reference_id: ref.referenceId } : {}),
                reference_relation: 'credit_note',
            },
        };
    });

    const attemptId = generateUUID();
    const txId = `pos-nc-${attemptId}`;
    const externalReference = `POS-NC-${attemptId}`;
    const request: VendusIssueDocumentPayload = {
        register_id: parseOptionalInt(settings.fiscal.vendus.registerId) ?? 0,
        store_id: parseOptionalInt(settings.fiscal.vendus.storeId),
        type: 'NC',
        mode: vendusMode(settings),
        output: settings.fiscal.vendus.output,
        tx_id: txId,
        external_reference: externalReference,
        return_qrcode: 1,
        errors_full: 'yes',
        notes: reason,
        client: undefined,
        items: requestItems,
    };

    await transactionLocalService.createVendusIssueAttempt({
        id: attemptId,
        kind: 'credit_note',
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
        const response = await invokeVendusFunction({ action: 'issue_document', document: request });
        if (!response.document) {
            throw new Error('Vendus não devolveu a nota de crédito emitida.');
        }
        const vendus = parseVendusDocument(response.document, request, transactionItems);
        await transactionLocalService.updateVendusIssueAttempt(attemptId, {
            status: 'issued',
            vendus_document_id: vendus.documentId,
            response_json: JSON.stringify(response.document),
        });
        const result = await transactionLocalService.createVendusFiscalCheckoutAtomic({
            certificationMode: certificationModeForVendus(settings),
            transactionDate,
            transactionTime,
            systemEntryDate,
            grossTotal,
            netRounded,
            taxTotal,
            totalDiscountAmount: Math.abs(origTx.discount || 0),
            originalSubtotal: Math.abs(origTx.subtotal),
            total: grossTotal,
            changeGiven: 0,
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
                notes: reason,
                deleted_at: null,
            },
            transactionItems,
            customerTaxId: origFiscal.customer_tax_id,
            payment,
            vendus,
            settledInvoiceNo: origFiscal.invoice_no,
            settledInvoiceDateYmd: origFiscal.invoice_date,
        });
        await transactionLocalService.updateVendusIssueAttempt(attemptId, {
            status: 'persisted',
            vendus_document_id: vendus.documentId,
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

export async function fetchVendusSaftXml(params: {
    settings: SystemSettings;
    year: number;
    month: number;
}): Promise<string> {
    assertVendusEnabled(params.settings);
    assertOnlineForVendus();
    const response = await invokeVendusFunction({
        action: 'saft',
        year: params.year,
        month: params.month,
        mode: vendusMode(params.settings),
    });
    if (!response.xml) {
        throw new Error('Vendus não devolveu SAF-T.');
    }
    return atob(response.xml);
}

export interface VendusHealthCheckResult {
    ok: boolean;
    account: unknown;
    taxes: unknown;
    paymentMethods: unknown;
}

export async function checkVendusFiscalHealth(settings: SystemSettings): Promise<VendusHealthCheckResult> {
    assertVendusEnabled(settings);
    assertOnlineForVendus();
    const response = await invokeVendusFunction({
        action: 'health_check',
    });
    return {
        ok: Boolean(response.ok),
        account: response.account,
        taxes: response.taxes,
        paymentMethods: response.paymentMethods,
    };
}
