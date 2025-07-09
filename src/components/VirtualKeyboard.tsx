import React, { useState } from 'react';
import { Delete, Check, X } from 'lucide-react';

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
    onClose,
    onConfirm,
    title,
    initialValue = '',
    placeholder = 'Enter text...',
    maxLength = 50,
    allowNumbers = true,
    allowLetters = true
}) => {
    const [value, setValue] = useState(initialValue);
    const [isNumericMode, setIsNumericMode] = useState(allowNumbers);
    const [isSpecialCharsMode, setIsSpecialCharsMode] = useState(false);
    const [isCapsLock, setIsCapsLock] = useState(false);

    // Sync value with initialValue when it changes
    React.useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    // Set appropriate mode when field capabilities change
    React.useEffect(() => {
        if (allowNumbers && !allowLetters) {
            // Numbers only field - use numeric mode
            setIsNumericMode(true);
        } else if (allowLetters && !allowNumbers) {
            // Letters only field - use alphabetic mode
            setIsNumericMode(false);
        }
        // For fields that allow both, keep current mode
    }, [allowNumbers, allowLetters]);

    const handleCharClick = (char: string) => {
        if (value.length >= maxLength) return;
        const newValue = value + char;
        setValue(newValue);
        onConfirm(newValue);
    };

    const handleDelete = () => {
        const newValue = value.slice(0, -1);
        setValue(newValue);
        onConfirm(newValue);
    };

    const handleClear = () => {
        setValue('');
        onConfirm('');
    };

    const handleSpace = () => {
        if (value.length >= maxLength) return;
        const newValue = value + ' ';
        setValue(newValue);
        onConfirm(newValue);
    };

    const toggleMode = () => {
        setIsNumericMode(prev => !prev);
        setIsSpecialCharsMode(false); // Reset special chars when switching modes
    };

    const toggleSpecialChars = () => {
        setIsSpecialCharsMode(prev => !prev);
    };

    const toggleCapsLock = () => {
        setIsCapsLock(prev => !prev);
    };

    const handleConfirm = () => {
        onConfirm(value);
        onClose();
    };

    const formatDisplayValue = () => {
        if (value === '') return placeholder;
        return value;
    };

    if (!isOpen) return null;

    return (
        <div className="bg-white rounded-3xl p-6 w-full shadow-lg border border-gray-200">
            {/* Keyboard Grid */}
            <div className="mb-6">
                {isNumericMode ? (
                    /* Numeric Layout - 3x5 grid */
                    <div className="grid grid-cols-3 gap-3">
                        {/* Row 1 */}
                        <button
                            onClick={() => handleCharClick('1')}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                        >
                            1
                        </button>
                        <button
                            onClick={() => handleCharClick('2')}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                        >
                            2
                        </button>
                        <button
                            onClick={() => handleCharClick('3')}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                        >
                            3
                        </button>

                        {/* Row 2 */}
                        <button
                            onClick={() => handleCharClick('4')}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                        >
                            4
                        </button>
                        <button
                            onClick={() => handleCharClick('5')}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                        >
                            5
                        </button>
                        <button
                            onClick={() => handleCharClick('6')}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                        >
                            6
                        </button>

                        {/* Row 3 */}
                        <button
                            onClick={() => handleCharClick('7')}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                        >
                            7
                        </button>
                        <button
                            onClick={() => handleCharClick('8')}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                        >
                            8
                        </button>
                        <button
                            onClick={() => handleCharClick('9')}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                        >
                            9
                        </button>

                        {/* Row 4 */}
                        <button
                            onClick={() => handleCharClick('-')}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                        >
                            -
                        </button>
                        <button
                            onClick={() => handleCharClick('0')}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                        >
                            0
                        </button>
                        <button
                            onClick={() => handleCharClick('+')}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-2xl"
                        >
                            +
                        </button>

                        {/* Row 5 */}
                        <button
                            onClick={toggleMode}
                            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-lg"
                        >
                            ABCD
                        </button>
                        <button
                            onClick={handleClear}
                            className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-4 rounded-2xl transition-colors min-h-[60px] text-lg"
                        >
                            Clear
                        </button>
                        <button
                            onClick={handleDelete}
                            className="bg-red-500 hover:bg-red-600 text-white font-bold py-4 rounded-2xl transition-colors min-h-[60px] flex items-center justify-center"
                        >
                            <Delete className="w-6 h-6" />
                        </button>
                    </div>
                ) : (
                    /* Alphabetic Layout - 6x5 grid */
                    <div className="grid grid-cols-6 gap-2">
                        {isSpecialCharsMode ? (
                            /* Special Characters Layout */
                            <>
                                {/* Row 1 */}
                                {['@', '#', '$', '%', '&', '*'].map((char) => (
                                    <button
                                        key={char}
                                        onClick={() => handleCharClick(char)}
                                        className="bg-purple-200 hover:bg-purple-300 text-purple-800 font-bold py-3 rounded-xl transition-colors min-h-[50px] text-lg"
                                    >
                                        {char}
                                    </button>
                                ))}

                                {/* Row 2 */}
                                {['(', ')', '[', ']', '{', '}'].map((char) => (
                                    <button
                                        key={char}
                                        onClick={() => handleCharClick(char)}
                                        className="bg-purple-200 hover:bg-purple-300 text-purple-800 font-bold py-3 rounded-xl transition-colors min-h-[50px] text-lg"
                                    >
                                        {char}
                                    </button>
                                ))}

                                {/* Row 3 */}
                                {['!', '?', '.', ',', ';', ':'].map((char) => (
                                    <button
                                        key={char}
                                        onClick={() => handleCharClick(char)}
                                        className="bg-purple-200 hover:bg-purple-300 text-purple-800 font-bold py-3 rounded-xl transition-colors min-h-[50px] text-lg"
                                    >
                                        {char}
                                    </button>
                                ))}

                                {/* Row 4 */}
                                {['"', "'", '/', '\\', '|', '~'].map((char) => (
                                    <button
                                        key={char}
                                        onClick={() => handleCharClick(char)}
                                        className="bg-purple-200 hover:bg-purple-300 text-purple-800 font-bold py-3 rounded-xl transition-colors min-h-[50px] text-lg"
                                    >
                                        {char}
                                    </button>
                                ))}

                                {/* Row 5 */}
                                {['<', '>'].map((char) => (
                                    <button
                                        key={char}
                                        onClick={() => handleCharClick(char)}
                                        className="bg-purple-200 hover:bg-purple-300 text-purple-800 font-bold py-3 rounded-xl transition-colors min-h-[50px] text-lg"
                                    >
                                        {char}
                                    </button>
                                ))}
                                <button
                                    onClick={handleSpace}
                                    className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-3 rounded-xl transition-colors min-h-[50px] text-sm col-span-4"
                                >
                                    SPACE
                                </button>
                            </>
                        ) : (
                            /* Regular Letters Layout */
                            <>
                                {/* Row 1 */}
                                {['A', 'B', 'C', 'D', 'E', 'F'].map((letter) => (
                                    <button
                                        key={letter}
                                        onClick={() => handleCharClick(isCapsLock ? letter : letter.toLowerCase())}
                                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 rounded-xl transition-colors min-h-[50px] text-lg"
                                    >
                                        {isCapsLock ? letter : letter.toLowerCase()}
                                    </button>
                                ))}

                                {/* Row 2 */}
                                {['G', 'H', 'I', 'J', 'K', 'L'].map((letter) => (
                                    <button
                                        key={letter}
                                        onClick={() => handleCharClick(isCapsLock ? letter : letter.toLowerCase())}
                                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 rounded-xl transition-colors min-h-[50px] text-lg"
                                    >
                                        {isCapsLock ? letter : letter.toLowerCase()}
                                    </button>
                                ))}

                                {/* Row 3 */}
                                {['M', 'N', 'O', 'P', 'Q', 'R'].map((letter) => (
                                    <button
                                        key={letter}
                                        onClick={() => handleCharClick(isCapsLock ? letter : letter.toLowerCase())}
                                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 rounded-xl transition-colors min-h-[50px] text-lg"
                                    >
                                        {isCapsLock ? letter : letter.toLowerCase()}
                                    </button>
                                ))}

                                {/* Row 4 */}
                                {['S', 'T', 'U', 'V', 'W', 'X'].map((letter) => (
                                    <button
                                        key={letter}
                                        onClick={() => handleCharClick(isCapsLock ? letter : letter.toLowerCase())}
                                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 rounded-xl transition-colors min-h-[50px] text-lg"
                                    >
                                        {isCapsLock ? letter : letter.toLowerCase()}
                                    </button>
                                ))}

                                {/* Row 5 */}
                                {['Y', 'Z'].map((letter) => (
                                    <button
                                        key={letter}
                                        onClick={() => handleCharClick(isCapsLock ? letter : letter.toLowerCase())}
                                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 rounded-xl transition-colors min-h-[50px] text-lg"
                                    >
                                        {isCapsLock ? letter : letter.toLowerCase()}
                                    </button>
                                ))}
                                <button
                                    onClick={handleSpace}
                                    className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-3 rounded-xl transition-colors min-h-[50px] text-sm col-span-4"
                                >
                                    SPACE
                                </button>
                            </>
                        )}

                        {/* Row 6 - Control buttons */}
                        <button
                            onClick={toggleMode}
                            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-colors min-h-[50px] text-sm"
                        >
                            123
                        </button>
                        <button
                            onClick={toggleCapsLock}
                            className={`font-bold py-3 rounded-xl transition-colors min-h-[50px] text-sm ${isCapsLock
                                ? 'bg-green-500 hover:bg-green-600 text-white'
                                : 'bg-gray-400 hover:bg-gray-500 text-white'
                                }`}
                        >
                            Aa
                        </button>
                        <button
                            onClick={toggleSpecialChars}
                            className={`font-bold py-3 rounded-xl transition-colors min-h-[50px] text-sm ${isSpecialCharsMode
                                ? 'bg-purple-500 hover:bg-purple-600 text-white'
                                : 'bg-orange-500 hover:bg-orange-600 text-white'
                                }`}
                        >
                            {isSpecialCharsMode ? 'ABC' : '@#$'}
                        </button>
                        <button
                            onClick={handleClear}
                            className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 rounded-xl transition-colors min-h-[50px] text-sm col-span-2"
                        >
                            Clear
                        </button>
                        <button
                            onClick={handleDelete}
                            className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl transition-colors min-h-[50px] flex items-center justify-center"
                        >
                            <Delete className="w-5 h-5" />
                        </button>
                    </div>
                )}
            </div>


        </div>
    );
};

export default VirtualKeyboard; 