import React, { useState } from 'react';
import { Delete, Check, X } from 'lucide-react';
import { NumpadButton } from './ui/NumpadButton';

interface VirtualNumpadProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (value: string) => void;
    title: string;
    initialValue?: string;
    placeholder?: string;
    prefix?: string;
    suffix?: string;
    maxLength?: number;
    allowDecimal?: boolean;
}

const VirtualNumpad: React.FC<VirtualNumpadProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    initialValue = '',
    placeholder = '0.00',
    prefix = '',
    suffix = '',
    maxLength = 10,
    allowDecimal = true
}) => {
    const [value, setValue] = useState(initialValue);

    const handleNumberClick = (num: string) => {
        if (value.length >= maxLength) return;

        // Prevent multiple decimal points
        if (num === '.' && (!allowDecimal || value.includes('.'))) return;

        setValue(prev => prev + num);
    };

    const handleDelete = () => {
        setValue(prev => prev.slice(0, -1));
    };

    const handleConfirm = () => {
        if (value.trim() !== '') {
            onConfirm(value);
        }
        onClose();
    };

    const formatDisplayValue = () => {
        if (value === '') return placeholder;
        return `${prefix}${value}${suffix}`;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-3xl p-8 w-[400px] max-w-md shadow-2xl">
                <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">{title}</h3>

                {/* Display */}
                <div className="mb-6">
                    <div className="bg-gray-100 rounded-2xl p-6 text-center">
                        <div className="text-4xl font-bold text-gray-800 min-h-[60px] flex items-center justify-center">
                            {formatDisplayValue()}
                        </div>
                    </div>
                </div>

                {/* Numpad Grid */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                    {/* Row 1 */}
                    <NumpadButton label="1" onClick={() => handleNumberClick('1')} />
                    <NumpadButton label="2" onClick={() => handleNumberClick('2')} />
                    <NumpadButton label="3" onClick={() => handleNumberClick('3')} />

                    {/* Row 2 */}
                    <NumpadButton label="4" onClick={() => handleNumberClick('4')} />
                    <NumpadButton label="5" onClick={() => handleNumberClick('5')} />
                    <NumpadButton label="6" onClick={() => handleNumberClick('6')} />

                    {/* Row 3 */}
                    <NumpadButton label="7" onClick={() => handleNumberClick('7')} />
                    <NumpadButton label="8" onClick={() => handleNumberClick('8')} />
                    <NumpadButton label="9" onClick={() => handleNumberClick('9')} />

                    {/* Row 4 */}
                    {allowDecimal ? (
                        <NumpadButton label="." onClick={() => handleNumberClick('.')} />
                    ) : (
                        <div></div>
                    )}

                    <NumpadButton label="0" onClick={() => handleNumberClick('0')} />

                    <NumpadButton variant="action" icon={Delete} onClick={handleDelete} />
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-4">
                    <button
                        onClick={onClose}
                        className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-bold py-4 rounded-2xl min-h-[60px] transition-colors flex items-center justify-center space-x-2"
                    >
                        <X className="w-5 h-5" />
                        <span>Cancel</span>
                    </button>
                    <NumpadButton
                        variant="confirm"
                        label="Confirm"
                        icon={Check}
                        onClick={handleConfirm}
                        className="flex-1 py-4"
                    />
                </div>
            </div>
        </div>
    );
};

export default VirtualNumpad; 