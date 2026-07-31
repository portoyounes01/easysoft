/** One implementation of "print this receipt on the thermal head".
 *
 *  Used by the post-sale auto-print in POS and by ReceiptDialog's Print
 *  button, so both agree on what is printable, what the outcome means, and how
 *  an ambiguous outcome is reported.
 */
import type { ReceiptProps } from '../components/ThermalReceipt';
import type { FiscalCheckoutResult } from '../fiscal/types';
import { buildReceiptEscPosBase64 } from './escpos/receiptEscPos';
import { normalizeReceiptLanguage, type ReceiptLanguage } from '../utils/receiptLanguage';

export type ThermalPrintStatus =
    /** Spooler accepted and acknowledged the job. */
    | 'printed'
    /** Delivered but unacknowledged — the paper MAY already be out. Never resend automatically. */
    | 'unknown'
    /** Provably not printed; an OS-print fallback is safe. */
    | 'failed'
    /** No thermal transport for this receipt (no printer, older shell, provider-rendered doc). */
    | 'unavailable';

export interface ThermalPrintResult {
    status: ThermalPrintStatus;
    printer?: string;
    error?: string;
}

/** Vendus returns the official document already rendered; ESC/POS cannot
 *  reproduce it, so those receipts stay on the OS print path. */
export function providerOutputKind(receipt: ReceiptProps): 'html' | 'pdf_url' | null {
    const output = receipt.officialOutput;
    if (output?.provider !== 'vendus') return null;
    if (output.format === 'html' && typeof output.data === 'string' && output.data.trim()) return 'html';
    if (output.format === 'pdf_url' && typeof output.url === 'string' && output.url.trim()) return 'pdf_url';
    return null;
}

/** Ask the shell which printer holds the receipt role, at the moment of use.
 *  `usePrinterConfig` pulls once on mount and the POS page stays mounted for a
 *  whole shift, so a config that arrived late — or an initial pull that failed
 *  — would silently disable auto-print with nothing to diagnose from the till. */
export async function resolveReceiptPrinterName(fallback?: string | null): Promise<string | null> {
    try {
        const result = await window.electronAPI?.hardware?.getPrinterConfig?.();
        if (result?.success && result.config) return result.config.receiptPrinter;
    } catch {
        /* older shells / browser hosts: fall through */
    }
    return fallback ?? null;
}

export function canPrintThermally(receipt: ReceiptProps, printerName: string | null | undefined): boolean {
    return (
        providerOutputKind(receipt) === null &&
        typeof window.electronAPI?.hardware?.printRaw === 'function' &&
        Boolean(printerName)
    );
}

/** Is the fiscal issuance complete enough to hand a customer the printed
 *  document unseen? A sale that fell back to a non-fiscal receipt, or one
 *  missing its ATCUD/QR, must NOT be auto-printed — it goes to the dialog so
 *  the operator sees what they are handing over. */
export function isFiscalResultPrintable(
    fiscal: FiscalCheckoutResult | undefined,
    options: { spain: boolean }
): boolean {
    if (!fiscal) return false;
    if (!fiscal.invoiceNo?.trim()) return false;
    if (!fiscal.qrPayload?.trim()) return false;

    if (options.spain) {
        // Veri*factu: the AEAT QR plus the compliance legend; ATCUD is a PT
        // concept and is empty by design here.
        return Boolean(fiscal.verifactuLegend?.trim());
    }
    // Portugal AT: ATCUD and the four signature characters are both printed.
    return Boolean(fiscal.atcudBody?.trim()) && Boolean(fiscal.hashFourChars?.trim());
}

export async function printReceiptThermally(
    receipt: ReceiptProps,
    options: { printerName: string | null | undefined; language: ReceiptLanguage }
): Promise<ThermalPrintResult> {
    const printer = options.printerName ?? undefined;
    if (!canPrintThermally(receipt, options.printerName)) {
        return { status: 'unavailable', printer };
    }

    try {
        const payload = buildReceiptEscPosBase64(receipt, {
            language: normalizeReceiptLanguage(receipt.receiptLanguage ?? options.language),
        });
        const result = await window.electronAPI?.hardware?.printRaw?.(payload);

        if (result?.success) return { status: 'printed', printer };
        if (result?.outcomeUnknown) return { status: 'unknown', printer, error: result.error };
        return { status: 'failed', printer, error: result?.error };
    } catch (error) {
        return {
            status: 'failed',
            printer,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
