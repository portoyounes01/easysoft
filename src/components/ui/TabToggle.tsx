import React from 'react';
import { useDialogTokens } from './dialogParts';

export interface TabToggleOption<T extends string = string> {
    value: T;
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
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
    const tk = useDialogTokens();
    const track = tk.cfg ? tk.p.tintBg : 'bg-gray-200';
    const activeText = tk.cfg ? tk.p.titleText : 'text-gray-900';
    const idleText = tk.cfg ? tk.p.subText : 'text-gray-600';
    const border = tk.cfg ? tk.p.border : 'border-gray-200';
    return (
        <div className={`${track} rounded-[10px] flex w-full shadow-sm relative`}>
            <div className="flex w-full relative">
                {options.map((option) => (
                    <button
                        key={option.value}
                        onClick={() => onChange(option.value)}
                        className={`flex-1 rounded-[10px] font-semibold transition-all relative border-2 ${border} ${value === option.value ? `bg-white ${activeText} shadow-sm` : idleText}`}
                        style={{ padding: '1vh', fontSize: '1.5vh' }}
                    >
                        <div className="flex items-center justify-center gap-2">
                            {option.icon && <option.icon className="w-4 h-4" />}
                            {option.label}
                        </div>
                        {showIndicator && value === option.value && (
                            <span
                                className="absolute left-1/2 -translate-x-1/2 bottom-0 h-[0.4vh] bg-[var(--ds2-accent-solid,#16a34a)] rounded-full"
                                style={{ width: '25%' }}
                            />
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}
