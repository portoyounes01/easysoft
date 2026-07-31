import React from 'react';

export interface TabToggleOption<T extends string = string> {
    value: T;
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    /** Small sublabel under the label (e.g. Settings' guidance text). */
    description?: string;
}

interface TabToggleProps<T extends string = string> {
    options: TabToggleOption<T>[];
    value: T;
    onChange: (value: T) => void;
    showIndicator?: boolean;
}

export function TabToggle<T extends string = string>({
    options,
    value,
    onChange,
    showIndicator = true
}: TabToggleProps<T>) {
    // Description-bearing groups (Settings-style, often 3-5 rich options) may
    // wrap onto rows instead of crushing every option into one line.
    const wrappy = options.some((option) => option.description);
    return (
        <div className="bg-gray-200 rounded-[10px] flex w-full  shadow-sm relative">
            <div className={`flex w-full relative ${wrappy ? 'flex-wrap' : ''}`}>
                {options.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={value === option.value}
                        onClick={() => onChange(option.value)}
                        className={`flex-1 rounded-[10px] font-semibold transition-all relative ${wrappy ? 'min-w-[9rem]' : ''} ${value === option.value ? 'bg-white text-gray-900 border-2 border-gray-200 shadow-sm' : 'text-gray-600 border-2 border-gray-200'
                            }`}
                        style={{ padding: '1vh', fontSize: '1.5vh' }}
                    >
                        <div className="flex items-center justify-center gap-2">
                            {option.icon && <option.icon className="w-4 h-4" />}
                            {option.label}
                        </div>
                        {option.description && (
                            <div className={`mt-0.5 text-center text-xs font-normal leading-4 ${value === option.value ? 'text-gray-500' : 'text-gray-600'}`}>
                                {option.description}
                            </div>
                        )}
                        {showIndicator && value === option.value && (
                            <span
                                className="absolute left-1/2 -translate-x-1/2 bottom-0 h-[0.4vh] bg-primary-600 rounded-full"
                                style={{ width: '25%' }}
                            />
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}
