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
 * Fiskaly SIGN PT (cloud, AT-certified) fiscal issuer. Fiskaly owns series numbering,
 * ATCUD, hash, QR and AT communication via `POST /records`; we proxy through the
 * `fiskaly-fiscal` edge function (which holds the API key/secret and JWT exchange)
 * and persist an immutable snapshot.
 */

const EDGE_FUNCTION = 'fiskaly-fiscal';

interface FiskalyLine {
    name: string;
    sku?: string;
    quantity: number;
    unit_price: number;
    discount_percentage: number;
    tax_rate: number;
    tax_amount: number;
    line_total: number;
}

interface FiskalyCustomer {
    name?: string;
    tax_id?: string;
    country: string;
}

interface FiskalyRecordPayload {
    /** Fiskaly transaction type. */
    type: 'INVOICE' | 'CORRECTION' | 'CANCELLATION';
    document_type: SaftFiscalDocumentType;
    issued_at: string;
    series_id?: string;
    reason?: string;
    amount: {
        gross: number;
        net: number;
        tax: number;
    };
    customer?: FiskalyCustomer;
    lines: FiskalyLine[];
}

/** Normalised record returned by the edge function (after signing). */
interface FiskalyRecordResponse {
    id?: string;
    number?: string;
    atcud?: string;
    hash?: string;
    signature?: string;
    qr_code?: string;
    qr_code_data?: string;
    issued_at?: string;
    [key: string]: unknown;
}

interface FiskalyFunctionResponse {
    document?: FiskalyRecordResponse;
    xml?: string;
    ok?: boolean;
    organization?: unknown;
    system?: unknown;
    error?: string;
}

function assertFiskalyEnabled(settings: SystemSettings): void {
    if (settings.fiscal.issuer !== 'fiskaly' || !settings.fiscal.fiskaly.enabled) {
        throw new Error('Fiskaly não está ativo nas definições fiscais.');
    }
    const f = settings.fiscal.fiskaly;
    if (!f.taxpayerId.trim() || !f.locationId.trim() || !f.systemId.trim()) {
        throw new Error('Identificadores Fiskaly (taxpayer/location/system) em falta nas definições fiscais.');
    }
}

function assertOnline(): void {
    const state = connectionStatus.getStatus();
    if (!state.isOnline || !state.isSupabaseOnline) {
        throw new Error('Fiskaly está configurado como emissor fiscal. A venda fica bloqueada até existir ligação ao Supabase/Fiskaly.');
    }
}

function certificationMode(settings: SystemSettings): 'production' | 'training' {
    return settings.fiscal.trainingMode || settings.fiscal.fiskaly.environment === 'test' ? 'training' : 'production';
}

function normalizeMoney(n: number): number {
    return Number(n.toFixed(2));
}

function customerFor(customer: LocalCustomer | null): FiskalyCustomer | undefined {
    if (!customer) return undefined;
    const taxId = customer.tax_number?.replace(/\s/g, '').trim();
    return {
        name: customer.name?.trim() || undefined,
        ...(taxId ? { tax_id: taxId } : {}),
        country: (customer.country || 'PT').trim().slice(0, 2).toUpperCase() || 'PT',
    };
}

function linesFor(draft: ReturnType<typeof buildSaleCheckoutDraft>): FiskalyLine[] {
    return draft.transactionItems.map(item => ({
        name: item.product_name,
        sku: item.product_sku || undefined,
        quantity: item.quantity,
        unit_price: normalizeMoney(item.unit_price),
        discount_percentage: item.discount_percentage || 0,
        tax_rate: item.iva_rate,
        tax_amount: normalizeMoney(item.tax_amount),
        line_total: normalizeMoney(item.line_total),
    }));
}

function externalItemRefs(
    document: FiskalyRecordResponse,
    localItems: ReturnType<typeof buildSaleCheckoutDraft>['transactionItems']
): ExternalIssuedItemReference[] {
    const remoteItems = Array.isArray(document.lines) ? (document.lines as Array<Record<string, unknown>>) : [];
    return localItems.map((item, index) => {
        const remote = remoteItems[index] || {};
        return {
            localProductId: item.product_id,
            localSku: item.product_sku,
            externalItemId: remote.id == null ? null : String(remote.id),
            referenceId: remote.id == null ? null : String(remote.id),
            documentRow: index + 1,
        };
    });
}

async function invokeFunction(body: Record<string, unknown>): Promise<FiskalyFunctionResponse> {
    const { data, error } = await supabase.functions.invoke<FiskalyFunctionResponse>(EDGE_FUNCTION, { body });
    if (error) {
        throw new Error(`Fiskaly Edge Function falhou: ${error.message}`);
    }
    if (!data) {
        throw new Error('Fiskaly Edge Function não devolveu dados.');
    }
    if (data.error) {
        throw new Error(data.error);
    }
    return data;
}

function snapshotFrom(
    document: FiskalyRecordResponse,
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
    const number = document.number?.trim() || '';
    if (!id || !number) {
        throw new Error('Resposta Fiskaly inválida: registo sem id ou número.');
    }
    const f = params.settings.fiscal.fiskaly;
    const atcud = document.atcud?.trim() || '';
    const issuedAt = document.issued_at?.trim();
    return {
        provider: 'fiskaly',
        documentId: id,
        number,
        type: params.type,
        date: issuedAt ? issuedAt.slice(0, 10) : params.transactionDate,
        systemTime: issuedAt || params.systemEntryDate,
        localTime: issuedAt || params.systemEntryDate,
        amountGross: params.amountGross,
        amountNet: params.amountNet,
        hash: document.hash?.trim() || '',
        atcud,
        qrcodeData: document.qr_code_data || document.qr_code || undefined,
        outputFormat: 'none',
        output: undefined,
        outputData: undefined,
        txId: params.txId,
        externalReference: params.externalReference,
        chainScope: `fiskaly::${f.environment}::${f.systemId.trim()}::${params.type}`,
        atValidationCode: atcud.split('-')[0] || 'FISKALY',
        items: params.items,
        providerMeta: {
            environment: f.environment,
            taxpayerId: f.taxpayerId.trim(),
            locationId: f.locationId.trim(),
            systemId: f.systemId.trim(),
            seriesId: f.seriesId?.trim() || undefined,
            signature: document.signature,
        },
        raw: document,
    };
}

export async function issueFiskalySale(params: {
    settings: SystemSettings;
    cart: FiscalCartLine[];
    selectedCustomer: LocalCustomer | null;
    payment: FiscalPaymentInput;
    globalDiscount?: FiscalGlobalDiscount;
}): Promise<FiscalCheckoutResult> {
    const { settings, cart, selectedCustomer, payment, globalDiscount } = params;
    assertFiskalyEnabled(settings);
    assertOnline();

    const f = settings.fiscal.fiskaly;
    const draft = buildSaleCheckoutDraft({ cart, selectedCustomer, payment, globalDiscount });
    const type = f.documentType;
    const attemptId = generateUUID();
    const txId = `pos-sale-${attemptId}`;
    const externalReference = `POS-${attemptId}`;
    const amountGross = normalizeMoney(draft.total);
    const amountNet = Number((draft.total - draft.totalTax).toFixed(2));

    const record: FiskalyRecordPayload = {
        type: 'INVOICE',
        document_type: type,
        issued_at: draft.systemEntryDate,
        ...(f.seriesId?.trim() ? { series_id: f.seriesId.trim() } : {}),
        amount: {
            gross: amountGross,
            net: amountNet,
            tax: normalizeMoney(draft.totalTax),
        },
        customer: customerFor(selectedCustomer),
        lines: linesFor(draft),
    };

    const request = {
        action: 'issue_document' as const,
        environment: f.environment,
        taxpayerId: f.taxpayerId.trim(),
        locationId: f.locationId.trim(),
        systemId: f.systemId.trim(),
        idempotencyKey: attemptId,
        record,
    };

    await transactionLocalService.createVendusIssueAttempt({
        id: attemptId,
        provider: 'fiskaly',
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
            throw new Error('Fiskaly não devolveu o registo emitido.');
        }
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

export async function issueFiskalyCreditNoteForTransaction(params: {
    settings: SystemSettings;
    originalTransactionId: string;
    payment: FiscalPaymentInput;
    creditReason?: string;
}): Promise<FiscalCheckoutResult> {
    throw new Error(
        `Notas de crédito Fiskaly ainda não estão implementadas nesta fase de integração (transação ${params.originalTransactionId}).`
    );
}

export async function fetchFiskalySaftXml(params: {
    settings: SystemSettings;
    year: number;
    month: number;
}): Promise<string> {
    assertFiskalyEnabled(params.settings);
    assertOnline();
    const f = params.settings.fiscal.fiskaly;
    const response = await invokeFunction({
        action: 'saft',
        environment: f.environment,
        taxpayerId: f.taxpayerId.trim(),
        year: params.year,
        month: params.month,
    });
    if (!response.xml) {
        throw new Error('Fiskaly não devolveu SAF-T.');
    }
    return atob(response.xml);
}

export interface FiskalyHealthCheckResult {
    ok: boolean;
    organization: unknown;
    system: unknown;
}

export async function checkFiskalyFiscalHealth(settings: SystemSettings): Promise<FiskalyHealthCheckResult> {
    assertFiskalyEnabled(settings);
    assertOnline();
    const f = settings.fiscal.fiskaly;
    const response = await invokeFunction({
        action: 'health_check',
        environment: f.environment,
        taxpayerId: f.taxpayerId.trim(),
        systemId: f.systemId.trim(),
    });
    return {
        ok: Boolean(response.ok),
        organization: response.organization,
        system: response.system,
    };
}
