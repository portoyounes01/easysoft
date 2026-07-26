import React, { useCallback, useEffect, useRef, useState } from 'react';
import ThermalReceipt, { ReceiptProps } from './ThermalReceipt';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { ActionButton } from './ui/ActionButton';
import { BaseDialog } from './ui/BaseDialog';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { usePrinterConfig } from '../hooks/usePrinterConfig';
import { buildReceiptEscPosBase64 } from '../services/escpos/receiptEscPos';
import { normalizeReceiptLanguage } from '../utils/receiptLanguage';
import {
    logPostSaleReceiptNotPrinted,
    logPostSaleReceiptPrinted,
    type PostSalePrintAuditContext,
} from '../fiscal/fiscalAuditLog';

interface ReceiptDialogProps {
    open: boolean;
    onClose: () => void;
    receipt: ReceiptProps;
    /** When set, closing without print logs POST_SALE_RECEIPT_NOT_PRINTED; print logs POST_SALE_RECEIPT_PRINTED. */
    postSalePrintAudit?: PostSalePrintAuditContext | null;
}

/** 'unknown' = the bytes reached the spooler but it never acknowledged them.
 *  Distinct from 'failed' on purpose: the paper may already be out. */
type DirectPrintState = 'idle' | 'printing' | 'printed' | 'unknown' | 'failed';

const ReceiptDialog: React.FC<ReceiptDialogProps> = ({ open, onClose, receipt, postSalePrintAudit }) => {
    const { t } = useTranslation();
    const { employee } = useSupabaseAuth();
    const { settings } = useSettings();
    const printerConfig = usePrinterConfig();
    const printedRef = useRef(false);
    const auditCtxRef = useRef(postSalePrintAudit);
    const [printState, setPrintState] = useState<DirectPrintState>('idle');
    const [printError, setPrintError] = useState('');

    useEffect(() => {
        auditCtxRef.current = postSalePrintAudit;
    }, [postSalePrintAudit]);

    useEffect(() => {
        if (open) {
            printedRef.current = false;
            setPrintState('idle');
            setPrintError('');
        }
    }, [open, postSalePrintAudit?.documentNumber]);

    const handleClose = useCallback(() => {
        const ctx = auditCtxRef.current;
        if (ctx && !printedRef.current) {
            void logPostSaleReceiptNotPrinted(ctx, employee?.id);
        }
        onClose();
    }, [employee?.id, onClose]);

    const officialOutput = receipt.officialOutput;
    const hasProviderHtml =
        officialOutput?.provider === 'vendus' &&
        officialOutput.format === 'html' &&
        typeof officialOutput.data === 'string' &&
        officialOutput.data.trim().length > 0;
    const hasProviderPdfUrl =
        officialOutput?.provider === 'vendus' &&
        officialOutput.format === 'pdf_url' &&
        typeof officialOutput.url === 'string' &&
        officialOutput.url.trim().length > 0;

    /** Provider-rendered documents (Vendus HTML/PDF) must print exactly as the
     *  provider produced them — ESC/POS cannot reproduce them, so those keep
     *  the OS print path. Everything else goes straight to the thermal head
     *  when one is configured. */
    const printerName = printerConfig?.receiptPrinter ?? '';
    const canPrintDirect =
        !hasProviderHtml &&
        !hasProviderPdfUrl &&
        typeof window.electronAPI?.hardware?.printRaw === 'function' &&
        printerName.length > 0;

    const printViaOs = useCallback(() => {
        const ctx = auditCtxRef.current;
        if (ctx) {
            printedRef.current = true;
            void logPostSaleReceiptPrinted(ctx, employee?.id);
        }
        window.print();
    }, [employee?.id]);

    const printDirect = async () => {
        setPrintState('printing');
        setPrintError('');
        try {
            const payload = buildReceiptEscPosBase64(receipt, {
                language: normalizeReceiptLanguage(
                    receipt.receiptLanguage ?? settings.receipt.receiptLanguage
                ),
            });
            const result = await window.electronAPI?.hardware?.printRaw?.(payload);

            if (result?.success) {
                printedRef.current = true;
                const ctx = auditCtxRef.current;
                if (ctx) void logPostSaleReceiptPrinted(ctx, employee?.id);
                setPrintState('printed');
                return;
            }

            if (result?.outcomeUnknown) {
                // Delivered but unacknowledged: the receipt may already be on
                // paper. Log NEITHER printed nor not-printed — both would be an
                // assertion we cannot make — and offer no one-tap resend, since
                // a duplicated fiscal document is worse than one the operator
                // reprints deliberately from receipt history.
                printedRef.current = true;
                setPrintState('unknown');
                setPrintError(result.error ?? '');
                return;
            }

            setPrintState('failed');
            setPrintError(result?.error ?? t('receiptPrint.unknownError'));
        } catch (error) {
            setPrintState('failed');
            setPrintError(error instanceof Error ? error.message : String(error));
        }
    };

    const handlePrint = () => {
        if (canPrintDirect) {
            void printDirect();
            return;
        }
        printViaOs();
    };

    return (
        <BaseDialog
            open={open}
            onClose={handleClose}
            title={t('pos.receiptPreview') || 'Receipt Preview'}
            // 50vw broke on phones (≈195px, receipt crushed). max() keeps desktop at exactly
            // 50vw (720px@1440 wins the max) while phones get min(95vw, 640px).
            width="max(50vw, min(95vw, 640px))"
            height="90vh"
            className="max-w-[95vw]"
            footer={
                <div className="flex flex-col gap-3">
                    {printState !== 'idle' && (
                        <div
                            className={`flex items-start gap-2 rounded-xl px-3 py-2 text-left ${
                                printState === 'printed'
                                    ? 'bg-emerald-50 text-emerald-800'
                                    : printState === 'printing'
                                        ? 'bg-slate-50 text-slate-700'
                                        : printState === 'unknown'
                                            ? 'bg-amber-50 text-amber-900'
                                            : 'bg-red-50 text-red-700'
                            }`}
                            style={{ fontSize: '1.5vh' }}
                        >
                            {printState === 'printing' && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />}
                            {printState === 'printed' && <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                            {(printState === 'unknown' || printState === 'failed') && (
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            )}
                            <span>
                                {printState === 'printing' && t('receiptPrint.printing', { printer: printerName })}
                                {printState === 'printed' && t('receiptPrint.printed', { printer: printerName })}
                                {printState === 'unknown' && (
                                    <>
                                        {t('receiptPrint.outcomeUnknown')}
                                        {printError ? ` (${printError})` : ''}
                                    </>
                                )}
                                {printState === 'failed' && t('receiptPrint.failed', { error: printError })}
                            </span>
                        </div>
                    )}
                    <div className="flex items-center justify-end space-x-4">
                        <ActionButton
                            onClick={handleClose}
                            label={t('common.cancel') || 'Cancel'}
                            variant="secondary"
                            className="flex-1"
                            style={{ height: '5vh', fontSize: '1.6vh' }}
                        />
                        {/* Escape hatch on a clean failure only — nothing was
                            printed, so the OS path cannot duplicate anything.
                            Deliberately absent for 'unknown'. */}
                        {printState === 'failed' && (
                            <ActionButton
                                onClick={printViaOs}
                                label={t('receiptPrint.viaWindows')}
                                variant="secondary"
                                className="flex-1"
                                style={{ height: '5vh', fontSize: '1.6vh' }}
                            />
                        )}
                        <ActionButton
                            onClick={handlePrint}
                            label={t('common.print') || 'Print'}
                            className="flex-1"
                            disabled={printState === 'printing'}
                            style={{ height: '5vh', fontSize: '1.6vh' }}
                        />
                    </div>
                </div>
            }
        >
            <div className="px-6 py-6 flex-1 min-h-0 overflow-y-auto bg-gray-50">
                {hasProviderHtml ? (
                    <iframe
                        title="Vendus official receipt"
                        srcDoc={officialOutput.data}
                        className="min-h-[70vh] w-full rounded-lg border border-gray-200 bg-white"
                    />
                ) : hasProviderPdfUrl ? (
                    <iframe
                        title="Vendus official receipt PDF"
                        src={officialOutput.url}
                        className="min-h-[70vh] w-full rounded-lg border border-gray-200 bg-white"
                    />
                ) : (
                    <ThermalReceipt {...receipt} />
                )}
            </div>
        </BaseDialog>
    );
};

export default React.memo(ReceiptDialog);

