import React, { useCallback, useContext } from 'react';
import { DialogShellStyleContext, DIALOG_PALETTES } from '../theme/dialogStyle';
import { Delete, X } from 'lucide-react';

export interface SimpleNumpadProps {
    value: string;
    onChange: (next: string) => void;
    onButtonClick?: () => void;
    className?: string;
}

const SimpleNumpad: React.FC<SimpleNumpadProps> = ({
    value,
    onChange,
    onButtonClick,
    className = ''
}) => {
    const appendToken = useCallback((token: string) => {
        onButtonClick?.();
        const next = (value + token).replace(/[^0-9]/g, '');
        onChange(next);
    }, [onChange, onButtonClick, value]);

    const handleDelete = useCallback(() => {
        onButtonClick?.();
        onChange(value.slice(0, -1));
    }, [onChange, onButtonClick, value]);

    const handleClear = useCallback(() => {
        onButtonClick?.();
        onChange('');
    }, [onChange, onButtonClick]);

    // Inside an applied dialog shell the numpad follows the style's numpad
    // axis; 'keys' renders the simple bordered grid, 'legacy' (and unstyled
    // dialogs / page surfaces) keep the original framed grid below.
    const shellStyle = useContext(DialogShellStyleContext);
    if (shellStyle && shellStyle.numpad === 'keys') {
        const p = DIALOG_PALETTES[shellStyle.palette];
        const key = `flex min-h-touch-sm items-center justify-center rounded-xl border ${p.border} bg-white font-semibold ${p.titleText} hover:${p.tintBg}`;
        return (
            <div className={`grid grid-cols-3 gap-2 ${className}`}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
                    <button key={digit} type="button" onClick={() => appendToken(digit)} className={key}>{digit}</button>
                ))}
                <button type="button" onClick={handleClear} className={key} aria-label="Clear">×</button>
                <button type="button" onClick={() => appendToken('0')} className={key}>0</button>
                <button type="button" onClick={handleDelete} className={key} aria-label="Delete">⌫</button>
            </div>
        );
    }

    return (
        <div className={`rounded-2xl ring-2 ring-gray-300 overflow-hidden ${className}`}>
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
                                className={`bg-white hover:bg-gray-50 text-gray-900 flex items-center justify-center ${dividerClasses}`}
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
                                className={`bg-gray-50 hover:bg-gray-100 text-gray-900 flex items-center justify-center ${dividerClasses}`}
                            >
                                <X className="text-gray-800" style={{ width: '2.2vh', height: '2.2vh' }} />
                            </button>
                        );
                    }

                    return (
                        <button
                            key={token}
                            onClick={() => appendToken(String(token))}
                            className={`text-gray-900 flex items-center justify-center bg-white hover:bg-gray-50 ${dividerClasses}`}
                            style={{ fontSize: '2vh' }}
                        >
                            {token}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default React.memo(SimpleNumpad);
