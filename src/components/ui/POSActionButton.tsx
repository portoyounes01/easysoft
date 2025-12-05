import React from 'react';
import { LucideIcon } from 'lucide-react';

interface POSActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    icon: LucideIcon;
    label: string;
    variant?: 'default' | 'disabled';
}

export const POSActionButton: React.FC<POSActionButtonProps> = ({
    icon: Icon,
    label,
    variant = 'default',
    className = '',
    disabled,
    ...props
}) => {
    const baseStyles = "rounded-xl flex flex-col items-center justify-center transition-all duration-200 w-24 h-20 border";

    const variants = {
        default: "bg-white border-gray-200 hover:bg-gray-50",
        disabled: "bg-gray-200 border-gray-400 opacity-50 cursor-not-allowed"
    };

    return (
        <button
            className={`${baseStyles} ${disabled ? variants.disabled : variants.default} ${className}`}
            disabled={disabled}
            {...props}
        >
            <Icon className="w-5 h-5 mb-1 text-gray-800" />
            <span className="text-neutral-900 font-medium text-xs">{label}</span>
        </button>
    );
};
