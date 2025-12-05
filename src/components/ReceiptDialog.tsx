import React from 'react';
import ThermalReceipt, { ReceiptProps } from './ThermalReceipt';
import { useTranslation } from 'react-i18next';
import { ActionButton } from './ui/ActionButton';
import { BaseDialog } from './ui/BaseDialog';

interface ReceiptDialogProps {
    open: boolean;
    onClose: () => void;
    receipt: ReceiptProps;
}

const ReceiptDialog: React.FC<ReceiptDialogProps> = ({ open, onClose, receipt }) => {
    const { t } = useTranslation();

    const handlePrint = () => {
        window.print();
    };

    return (
        <BaseDialog
            open={open}
            onClose={onClose}
            title={t('pos.receiptPreview') || 'Receipt Preview'}
            width="50vw"
            height="90vh"
            className="max-w-[95vw]"
            footer={
                <div className="flex items-center justify-end space-x-4">
                    <ActionButton
                        onClick={onClose}
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
                <ThermalReceipt {...receipt} />
            </div>
        </BaseDialog>
    );
};

export default React.memo(ReceiptDialog);


