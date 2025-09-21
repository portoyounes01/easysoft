import React, { useCallback } from 'react';
import { Delete } from 'lucide-react';

export interface QuickNumpadProps {
    value: string;
    onChange: (next: string) => void;
    allowDecimal?: boolean;
    quickValues?: number[]; // Right column quick-set values (top→bottom)
    className?: string;
}

const QuickNumpad: React.FC<QuickNumpadProps> = ({
    value,
    onChange,
    allowDecimal = false,
    quickValues = [100, 50, 20, 10],
    className = ''
}) => {
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

    const handleQuickSet = useCallback((num: number) => {
        onChange(String(num));
    }, [onChange]);

    // 3. Computed values - none

    // 4. Effects - none

    // 5. Render
    return (
        <div className={`rounded-2xl border border-gray-200 overflow-hidden ${className}`}>
            <div className="grid grid-cols-4 h-full">
                {/* Left 3x3 + bottom row */}
                <div className="col-span-3 h-full">
                    <div className="grid grid-cols-3 divide-x divide-y divide-gray-200 h-full" style={{ gridTemplateRows: 'repeat(4, 1fr)' }}>
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
                            <button
                                key={n}
                                onClick={() => appendToken(n)}
                                className="bg-white hover:bg-gray-50 text-gray-900 min-h-[6vh] flex items-center justify-center"
                                style={{ fontSize: '2vh' }}
                            >
                                {n}
                            </button>
                        ))}
                        {/* Bottom row: 00, 0, delete */}
                        <button
                            onClick={() => appendToken('00')}
                            className="bg-gray-50 hover:bg-gray-100 text-gray-900 flex items-center justify-center"
                            style={{ fontSize: '2vh' }}
                        >
                            00
                        </button>
                        <button
                            onClick={() => appendToken('0')}
                            className="bg-white hover:bg-gray-50 text-gray-900 flex items-center justify-center"
                            style={{ fontSize: '2vh' }}
                        >
                            0
                        </button>
                        <button
                            onClick={handleDelete}
                            className="bg-white hover:bg-gray-50 text-gray-900 flex items-center justify-center"
                        >
                            <Delete className="text-gray-800" style={{ width: '2.2vh', height: '2.2vh' }} />
                        </button>
                    </div>
                </div>

                {/* Right quick values column */}
                <div className="bg-gray-100 divide-y divide-gray-200 h-full flex flex-col">
                    {quickValues.map((q) => (
                        <button
                            key={q}
                            onClick={() => handleQuickSet(q)}
                            className="w-full flex-1 flex items-center justify-center hover:bg-gray-200"
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



