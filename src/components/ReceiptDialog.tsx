import React, { useCallback, useEffect, useRef } from 'react';
import ThermalReceipt, { ReceiptProps } from './ThermalReceipt';
import { useTranslation } from 'react-i18next';
import { ActionButton } from './ui/ActionButton';
import { BaseDialog } from './ui/BaseDialog';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
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

const ReceiptDialog: React.FC<ReceiptDialogProps> = ({ open, onClose, receipt, postSalePrintAudit }) => {
    const { t } = useTranslation();
    const { employee } = useSupabaseAuth();
    const printedRef = useRef(false);
    const auditCtxRef = useRef(postSalePrintAudit);

    useEffect(() => {
        auditCtxRef.current = postSalePrintAudit;
    }, [postSalePrintAudit]);

    useEffect(() => {
        if (open) {
            printedRef.current = false;
        }
    }, [open, postSalePrintAudit?.documentNumber]);

    const handleClose = useCallback(() => {
        const ctx = auditCtxRef.current;
        if (ctx && !printedRef.current) {
            void logPostSaleReceiptNotPrinted(ctx, employee?.id);
        }
        onClose();
    }, [employee?.id, onClose]);

    const handlePrint = () => {
        const ctx = auditCtxRef.current;
        if (ctx) {
            printedRef.current = true;
            void logPostSaleReceiptPrinted(ctx, employee?.id);
        }
        window.print();
    };

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

    return (
        <BaseDialog
            open={open}
            onClose={handleClose}
            title={t('pos.receiptPreview') || 'Receipt Preview'}
            width="50vw"
            height="90vh"
            className="max-w-[95vw]"
            footer={
                <div className="flex items-center justify-end space-x-4">
                    <ActionButton
                        onClick={handleClose}
                        label={t('common.cancel') || 'Cancel'}
                        variant="secondary"
                        className="flex-1"
                        style={{ height: '5vh', fontSize: '1.6vh' }}
                    />
                    <ActionButton
                        onClick={handlePrint}
                        label={t('common.print') || 'Print'}
                        className="flex-1"
                        style={{ height: '5vh', fontSize: '1.6vh' }}
                    />
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

