import React from 'react';
import ThermalReceipt, { ReceiptProps } from './ThermalReceipt';
import { useTranslation } from 'react-i18next';

interface ReceiptDialogProps {
    open: boolean;
    onClose: () => void;
    receipt: ReceiptProps;
}

const ReceiptDialog: React.FC<ReceiptDialogProps> = ({ open, onClose, receipt }) => {
    const { t } = useTranslation();

    if (!open) return null;

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
            <div className="bg-white rounded-3xl w-[800px] max-w-[95vw] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] min-h-0">
                <div className="px-8 py-6 border-b">
                    <h3 className="text-2xl font-bold text-center text-gray-800">{t('pos.receiptPreview') || 'Receipt Preview'}</h3>
                </div>
                <div className="px-6 py-6 flex-1 min-h-0 overflow-y-auto bg-gray-50">
                    <ThermalReceipt {...receipt} />
                </div>
                <div className="px-6 py-6 border-t bg-white flex items-center justify-end space-x-4">
                    <button
                        onClick={onClose}
                        className="min-h-[60px] px-6 rounded-2xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium transition-colors"
                    >
                        {t('common.cancel') || 'Cancel'}
                    </button>
                    <button
                        onClick={handlePrint}
                        className="min-h-[60px] px-6 rounded-2xl bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold transition-colors"
                    >
                        {t('common.print') || 'Print'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default React.memo(ReceiptDialog);


