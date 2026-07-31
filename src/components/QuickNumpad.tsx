import React, { useCallback, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogShellStyleContext, DIALOG_PALETTES } from '../theme/dialogStyle';
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
    const { t } = useTranslation();
    // Inside an applied dialog shell the numpad follows the style's numpad
    // axis; 'keys' renders the simple bordered grid, 'legacy' (and page
    // surfaces / unstyled dialogs) keep the original framed grid below.
    const shellStyle = useContext(DialogShellStyleContext);

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
    if (shellStyle && shellStyle.numpad === 'keys') {
        const p = DIALOG_PALETTES[shellStyle.palette];
        const key = `flex min-h-touch-sm items-center justify-center rounded-xl border ${p.border} bg-white font-semibold ${p.titleText} ${disabled ? 'cursor-not-allowed opacity-50' : `hover:${p.tintBg}`}`;
        const quickKey = `flex min-h-touch-sm items-center justify-center rounded-xl border ${p.border} ${p.tintBg} font-semibold ${p.titleText} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`;
        return (
            <div className={`grid grid-cols-4 gap-2 ${className}`}>
                {['1', '2', '3'].map(d => (
                    <button key={d} type="button" disabled={disabled} onClick={() => appendToken(d)} className={key}>{d}</button>
                ))}
                <button type="button" disabled={disabled} onClick={() => handleQuickSet(quickValues[0])} className={quickKey}>{quickValues[0]}</button>
                {['4', '5', '6'].map(d => (
                    <button key={d} type="button" disabled={disabled} onClick={() => appendToken(d)} className={key}>{d}</button>
                ))}
                <button type="button" disabled={disabled} onClick={() => handleQuickSet(quickValues[1])} className={quickKey}>{quickValues[1]}</button>
                {['7', '8', '9'].map(d => (
                    <button key={d} type="button" disabled={disabled} onClick={() => appendToken(d)} className={key}>{d}</button>
                ))}
                <button type="button" disabled={disabled} onClick={() => handleQuickSet(quickValues[2])} className={quickKey}>{quickValues[2]}</button>
                <button type="button" disabled={disabled} onClick={handleClear} className={key} aria-label={t('common.clear')}>×</button>
                <button type="button" disabled={disabled} onClick={() => appendToken('0')} className={key}>0</button>
                <button type="button" disabled={disabled} onClick={handleDelete} className={key} aria-label={t('common.delete')}>⌫</button>
                <button type="button" disabled={disabled} onClick={() => handleQuickSet(quickValues[3])} className={quickKey}>{quickValues[3]}</button>
            </div>
        );
    }

    return (
        <div className={`rounded-2xl ring-2 ring-gray-300 overflow-hidden ${className}`}>
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
                            const dividerClasses = `${withTop ? 'border-t' : ''} ${withLeft ? 'border-l' : ''} ${withTop || withLeft ? 'border-gray-300' : ''}`.trim();

                            if (token === 'delete') {
                                return (
                                    <button
                                        key={token}
                                        onClick={handleDelete}
                                        disabled={disabled}
                                        className={`bg-white text-gray-900 flex items-center justify-center ${dividerClasses} ${disabled ? 'cursor-not-allowed' : 'hover:bg-gray-50'}`}
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
                                        className={`bg-gray-50 text-gray-900 flex items-center justify-center ${dividerClasses} ${disabled ? 'cursor-not-allowed' : 'hover:bg-gray-100'}`}
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
                                    className={`text-gray-900 flex items-center justify-center bg-white ${dividerClasses} ${disabled ? 'cursor-not-allowed' : 'hover:bg-gray-50'}`}
                                    style={{ fontSize: '2vh' }}
                                >
                                    {token}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Right quick values column */}
                <div className="bg-gray-100 h-full grid grid-rows-4 border-l border-gray-300">
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



