import React, { useCallback } from 'react';
import { useDialogTokens } from './ui/dialogParts';
import { Delete, X } from 'lucide-react';

export interface QuickNumpadProps {
    value: string;
    onChange: (next: string) => void;
    allowDecimal?: boolean;
    quickValues?: number[]; // Right column quick-set values (top→bottom)
    className?: string;
    disabled?: boolean;
}

const QuickNumpad: React.FC<QuickNumpadProps> = ({
    value,
    onChange,
    allowDecimal = false,
    quickValues = [100, 50, 20, 10],
    className = '',
    disabled = false
}) => {
    const tk = useDialogTokens();
    // 1. Hooks - none

    // 2. Event handlers
    const appendToken = useCallback((token: string) => {
        if (token === '.' && !allowDecimal) return;
        if (token === '.' && value.includes('.')) return;
        const next = (value + token).replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, '');
        onChange(next);
    }, [allowDecimal, onChange, value]);

    const handleDelete = useCallback(() => {
        onChange(value.slice(0, -1));
    }, [onChange, value]);

    const handleClear = useCallback(() => {
        onChange('');
    }, [onChange]);

    const handleQuickSet = useCallback((num: number) => {
        onChange(String(num));
    }, [onChange]);

    // 3. Computed values - none

    // 4. Effects - none

    // 5. Render
    return (
        <div className={`rounded-2xl ring-2 ${tk.cfg ? 'ring-transparent border ' + tk.p.border : 'ring-gray-300'} overflow-hidden ${className}`}>
            <div className="grid grid-cols-4 h-full">
                {/* Left 3x3 + bottom row */}
                <div className="col-span-3 h-full">
                    <div className="grid grid-cols-3 h-full" style={{ gridTemplateRows: 'repeat(4, 1fr)' }}>
                        {[
                            '1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'delete'
                        ].map((token, index) => {
                            const rowIndex = Math.floor(index / 3);
                            const colIndex = index % 3;
                            const withTop = rowIndex > 0;
                            const withLeft = colIndex > 0;
                            const dividerClasses = `${withTop ? 'border-t' : ''} ${withLeft ? 'border-l' : ''} ${withTop || withLeft ? (tk.cfg ? tk.p.border : 'border-gray-300') : ''}`.trim();

                            if (token === 'delete') {
                                return (
                                    <button
                                        key={token}
                                        onClick={handleDelete}
                                        disabled={disabled}
                                        className={`bg-white ${tk.p.titleText} flex items-center justify-center ${dividerClasses} ${disabled ? 'cursor-not-allowed' : `hover:${tk.p.tintBg}`}`}
                                    >
                                        <Delete className="text-gray-800" style={{ width: '2.2vh', height: '2.2vh' }} />
                                    </button>
                                );
                            }

                            if (token === 'clear') {
                                return (
                                    <button
                                        key={token}
                                        onClick={handleClear}
                                        disabled={disabled}
                                        className={`${tk.cfg ? tk.p.tintBg : 'bg-gray-50'} ${tk.p.titleText} flex items-center justify-center ${dividerClasses} ${disabled ? 'cursor-not-allowed' : ''}`}
                                    >
                                        <X className="text-gray-800" style={{ width: '2.2vh', height: '2.2vh' }} />
                                    </button>
                                );
                            }

                            return (
                                <button
                                    key={token}
                                    onClick={() => appendToken(String(token))}
                                    disabled={disabled}
                                    className={`${tk.p.titleText} flex items-center justify-center bg-white ${dividerClasses} ${disabled ? 'cursor-not-allowed' : `hover:${tk.p.tintBg}`}`}
                                    style={{ fontSize: '2vh' }}
                                >
                                    {token}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Right quick values column */}
                <div className={`${tk.cfg ? tk.p.tintBg : 'bg-gray-100'} h-full grid grid-rows-4 border-l ${tk.cfg ? tk.p.border : 'border-gray-300'}`}>
                    {quickValues.map((q, idx) => (
                        <button
                            key={q}
                            onClick={() => handleQuickSet(q)}
                            disabled={disabled}
                            className={`w-full flex items-center justify-center ${idx > 0 ? 'border-t border-gray-300' : ''} ${disabled ? 'cursor-not-allowed' : 'hover:bg-gray-200'}`}
                            style={{ fontSize: '2vh' }}
                        >
                            {q}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default React.memo(QuickNumpad);



