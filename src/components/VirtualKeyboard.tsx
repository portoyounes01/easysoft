import React, { useState, useRef } from 'react';
import { Delete, X, Undo2 } from 'lucide-react';

interface VirtualKeyboardProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (value: string) => void;
    title: string;
    initialValue?: string;
    placeholder?: string;
    maxLength?: number;
    allowNumbers?: boolean;
    allowLetters?: boolean;
}

const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
    isOpen,
    onConfirm,
    initialValue = '',
    maxLength = 50,
    allowNumbers = true,
    allowLetters = true
}) => {
    const [value, setValue] = useState(initialValue);
    const [isCapsLock, setIsCapsLock] = useState(false);
    const [isSpecialMode, setIsSpecialMode] = useState(false);
    const historyRef = useRef<string[]>([initialValue]);

    // Sync value with initialValue when it changes
    React.useEffect(() => {
        setValue(initialValue);
        historyRef.current = [initialValue];
    }, [initialValue]);

    const handleCharClick = (char: string) => {
        if (value.length >= maxLength) return;
        historyRef.current.push(value);
        const newValue = value + char;
        setValue(newValue);
        onConfirm(newValue);
    };

    const handleDelete = () => {
        historyRef.current.push(value);
        const newValue = value.slice(0, -1);
        setValue(newValue);
        onConfirm(newValue);
    };

    const handleClear = () => {
        historyRef.current.push(value);
        setValue('');
        onConfirm('');
    };

    const handleUndo = () => {
        if (historyRef.current.length > 1) {
            historyRef.current.pop();
            const previousValue = historyRef.current[historyRef.current.length - 1] || '';
            setValue(previousValue);
            onConfirm(previousValue);
        }
    };

    const handleSpace = () => {
        if (value.length >= maxLength) return;
        historyRef.current.push(value);
        const newValue = value + ' ';
        setValue(newValue);
        onConfirm(newValue);
    };

    const toggleCapsLock = () => {
        setIsCapsLock(prev => !prev);
    };

    const toggleSpecialMode = () => {
        setIsSpecialMode(prev => !prev);
    };

    if (!isOpen) return null;

    // Phone-style keyboard layout
    const numberRow = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    const row1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
    const row2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', '.'];
    const row3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M'];

    // Special characters layout
    const specialRow1 = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'];
    const specialRow2 = ['-', '_', '=', '+', '[', ']', '{', '}', '|', '\\'];
    const specialRow3 = [':', ';', '"', "'", '<', '>', ','];

    // Common button styles
    const baseButtonClass = "flex items-center justify-center transition-all duration-150 font-medium";
    const keyButtonClass = `${baseButtonClass} bg-white hover:bg-gray-50 text-gray-900 border-r border-b border-gray-300`;
    const actionButtonClass = `${baseButtonClass} bg-gray-100 hover:bg-gray-200 text-gray-700 border-r border-b border-gray-300`;
    const capsButtonClass = (active: boolean) =>
        `${baseButtonClass} ${active ? 'bg-primary-500 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} border-r border-b border-gray-300`;
    const specialToggleClass = (active: boolean) =>
        `${baseButtonClass} ${active ? 'bg-primary-500 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} border-r border-b border-gray-300`;

    // Determine what to show based on what's allowed
    const showNumbers = allowNumbers;
    const showLetters = allowLetters;

    return (
        <div className="rounded-2xl ring-2 ring-gray-300 overflow-hidden h-full flex flex-col">
            {/* Number row */}
            {showNumbers && (
                <div className="flex flex-1">
                    {numberRow.map((num, index) => (
                        <button
                            key={num}
                            onClick={() => handleCharClick(num)}
                            className={`${keyButtonClass} flex-1 ${index === numberRow.length - 1 ? 'border-r-0' : ''}`}
                            style={{ fontSize: '2vh' }}
                        >
                            {num}
                        </button>
                    ))}
                </div>
            )}

            {showLetters && !isSpecialMode && (
                <>
                    {/* QWERTY Row 1 */}
                    <div className="flex flex-1">
                        {row1.map((letter, index) => (
                            <button
                                key={letter}
                                onClick={() => handleCharClick(isCapsLock ? letter : letter.toLowerCase())}
                                className={`${keyButtonClass} flex-1 ${index === row1.length - 1 ? 'border-r-0' : ''}`}
                                style={{ fontSize: '1.8vh' }}
                            >
                                {isCapsLock ? letter : letter.toLowerCase()}
                            </button>
                        ))}
                    </div>

                    {/* QWERTY Row 2: ASDFGHJKL. */}
                    <div className="flex flex-1">
                        {row2.map((char, index) => (
                            <button
                                key={char}
                                onClick={() => handleCharClick(char === '.' ? char : (isCapsLock ? char : char.toLowerCase()))}
                                className={`${keyButtonClass} flex-1 ${index === row2.length - 1 ? 'border-r-0' : ''}`}
                                style={{ fontSize: '1.8vh' }}
                            >
                                {char === '.' ? char : (isCapsLock ? char : char.toLowerCase())}
                            </button>
                        ))}
                    </div>

                    {/* QWERTY Row 3: Caps + ZXCVBNM + Delete */}
                    <div className="flex flex-1">
                        <button
                            onClick={toggleCapsLock}
                            className={`${capsButtonClass(isCapsLock)} flex-[1.5]`}
                            style={{ fontSize: '1.4vh' }}
                        >
                            ⇧
                        </button>
                        {row3.map((letter) => (
                            <button
                                key={letter}
                                onClick={() => handleCharClick(isCapsLock ? letter : letter.toLowerCase())}
                                className={`${keyButtonClass} flex-1`}
                                style={{ fontSize: '1.8vh' }}
                            >
                                {isCapsLock ? letter : letter.toLowerCase()}
                            </button>
                        ))}
                        <button
                            onClick={handleDelete}
                            className={`${actionButtonClass} flex-[1.5] border-r-0`}
                        >
                            <Delete style={{ width: '2vh', height: '2vh' }} />
                        </button>
                    </div>

                    {/* Bottom row: Undo + Special toggle + Space + Clear */}
                    {/* Row 4 total: 1.5 + 7 + 1.5 = 10, so bottom row should also total 10 */}
                    <div className="flex flex-1">
                        <button
                            onClick={handleUndo}
                            className={`${actionButtonClass} flex-[1.5]`}
                        >
                            <Undo2 style={{ width: '2vh', height: '2vh' }} />
                        </button>
                        <button
                            onClick={toggleSpecialMode}
                            className={`${specialToggleClass(isSpecialMode)} flex-[1.5]`}
                            style={{ fontSize: '1.6vh' }}
                        >
                            #+=
                        </button>
                        <button
                            onClick={handleSpace}
                            className={`${keyButtonClass} flex-[5.5]`}
                            style={{ fontSize: '1.4vh' }}
                        >
                            space
                        </button>
                        <button
                            onClick={handleClear}
                            className={`${actionButtonClass} flex-[1.5] border-r-0`}
                        >
                            <X style={{ width: '2vh', height: '2vh' }} />
                        </button>
                    </div>
                </>
            )}

            {/* Special characters mode */}
            {showLetters && isSpecialMode && (
                <>
                    {/* Special Row 1 */}
                    <div className="flex flex-1">
                        {specialRow1.map((char, index) => (
                            <button
                                key={char}
                                onClick={() => handleCharClick(char)}
                                className={`${keyButtonClass} flex-1 ${index === specialRow1.length - 1 ? 'border-r-0' : ''}`}
                                style={{ fontSize: '1.8vh' }}
                            >
                                {char}
                            </button>
                        ))}
                    </div>

                    {/* Special Row 2 */}
                    <div className="flex flex-1">
                        {specialRow2.map((char, index) => (
                            <button
                                key={char}
                                onClick={() => handleCharClick(char)}
                                className={`${keyButtonClass} flex-1 ${index === specialRow2.length - 1 ? 'border-r-0' : ''}`}
                                style={{ fontSize: '1.8vh' }}
                            >
                                {char}
                            </button>
                        ))}
                    </div>

                    {/* Special Row 3 */}
                    <div className="flex flex-1">
                        <div className="flex-[1.5] border-r border-b border-gray-300" />
                        {specialRow3.map((char) => (
                            <button
                                key={char}
                                onClick={() => handleCharClick(char)}
                                className={`${keyButtonClass} flex-1`}
                                style={{ fontSize: '1.8vh' }}
                            >
                                {char}
                            </button>
                        ))}
                        <button
                            onClick={handleDelete}
                            className={`${actionButtonClass} flex-[1.5] border-r-0`}
                        >
                            <Delete style={{ width: '2vh', height: '2vh' }} />
                        </button>
                    </div>

                    {/* Bottom row: Undo + ABC toggle + Space + Clear */}
                    <div className="flex flex-1">
                        <button
                            onClick={handleUndo}
                            className={`${actionButtonClass} flex-[1.5]`}
                        >
                            <Undo2 style={{ width: '2vh', height: '2vh' }} />
                        </button>
                        <button
                            onClick={toggleSpecialMode}
                            className={`${specialToggleClass(!isSpecialMode)} flex-[1.5]`}
                            style={{ fontSize: '1.6vh' }}
                        >
                            ABC
                        </button>
                        <button
                            onClick={handleSpace}
                            className={`${keyButtonClass} flex-[5.5]`}
                            style={{ fontSize: '1.4vh' }}
                        >
                            space
                        </button>
                        <button
                            onClick={handleClear}
                            className={`${actionButtonClass} flex-[1.5] border-r-0`}
                        >
                            <X style={{ width: '2vh', height: '2vh' }} />
                        </button>
                    </div>
                </>
            )}

            {/* Numbers only mode (no letters) */}
            {!showLetters && showNumbers && (
                <div className="flex flex-1">
                    <button onClick={handleClear} className={`${actionButtonClass} flex-1`}>
                        <X style={{ width: '2vh', height: '2vh' }} />
                    </button>
                    <button onClick={() => handleCharClick('+')} className={`${keyButtonClass} flex-1`} style={{ fontSize: '2vh' }}>+</button>
                    <button onClick={handleDelete} className={`${actionButtonClass} flex-1 border-r-0`}>
                        <Delete style={{ width: '2vh', height: '2vh' }} />
                    </button>
                </div>
            )}
        </div>
    );
};

export default VirtualKeyboard;
