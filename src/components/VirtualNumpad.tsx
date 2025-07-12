import React, { useState } from 'react';
import { Delete, Check, X } from 'lucide-react';

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
                    <button
                        onClick={() => handleNumberClick('1')}
                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                    >
                        1
                    </button>
                    <button
                        onClick={() => handleNumberClick('2')}
                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                    >
                        2
                    </button>
                    <button
                        onClick={() => handleNumberClick('3')}
                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                    >
                        3
                    </button>

                    {/* Row 2 */}
                    <button
                        onClick={() => handleNumberClick('4')}
                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                    >
                        4
                    </button>
                    <button
                        onClick={() => handleNumberClick('5')}
                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                    >
                        5
                    </button>
                    <button
                        onClick={() => handleNumberClick('6')}
                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                    >
                        6
                    </button>

                    {/* Row 3 */}
                    <button
                        onClick={() => handleNumberClick('7')}
                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                    >
                        7
                    </button>
                    <button
                        onClick={() => handleNumberClick('8')}
                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                    >
                        8
                    </button>
                    <button
                        onClick={() => handleNumberClick('9')}
                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                    >
                        9
                    </button>

                    {/* Row 4 */}
                    {allowDecimal ? (
                        <button
                            onClick={() => handleNumberClick('.')}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                        >
                            .
                        </button>
                    ) : (
                        <div></div>
                    )}

                    <button
                        onClick={() => handleNumberClick('0')}
                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                    >
                        0
                    </button>

                    <button
                        onClick={handleDelete}
                        className="bg-red-500 hover:bg-red-600 text-white font-bold py-4 rounded-2xl transition-colors min-h-[60px] flex items-center justify-center"
                    >
                        <Delete className="w-6 h-6" />
                    </button>
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
                    <button
                        onClick={handleConfirm}
                        className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-4 rounded-2xl min-h-[60px] transition-colors flex items-center justify-center space-x-2"
                    >
                        <Check className="w-5 h-5" />
                        <span>Confirm</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VirtualNumpad; 