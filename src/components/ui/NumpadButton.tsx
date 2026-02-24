import React from 'react';
import { LucideIcon } from 'lucide-react';

interface NumpadButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'action' | 'confirm';
    icon?: LucideIcon;
    label?: string | number;
}

export const NumpadButton: React.FC<NumpadButtonProps> = ({
    variant = 'default',
    icon: Icon,
    label,
    className = '',
    ...props
}) => {
    const baseStyles = "font-bold rounded-2xl transition-colors flex items-center justify-center";

    const variants = {
        default: "bg-gray-200 hover:bg-gray-300 text-grey-50 w-full min-h-[60px] text-2xl",
        action: "bg-blue-100 hover:bg-blue-200 text-grey-50 w-full min-h-[60px]",
        confirm: "bg-green-500 hover:bg-green-600 text-grey-50 px-6 min-h-[60px]"
    };

    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${className}`}
            {...props}
        >
            {Icon ? <Icon className="w-6 h-6" /> : label}
        </button>
    );
};
