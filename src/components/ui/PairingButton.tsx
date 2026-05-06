import React from 'react';
import { LucideIcon } from 'lucide-react';

interface PairingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary';
    icon?: LucideIcon;
    label: string;
}

export const PairingButton: React.FC<PairingButtonProps> = ({
    variant = 'primary',
    icon: Icon,
    label,
    className = '',
    ...props
}) => {
    const baseStyles = "min-h-20 text-2xl font-medium rounded-2xl transition-all duration-200 px-8 flex items-center justify-center gap-3";

    const variants = {
        primary: "text-neutral-50 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 hover:scale-[1.02]",
        secondary: "bg-white border border-gray-300 hover:bg-gray-50 text-gray-900"
    };

    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${className}`}
            {...props}
        >
            {Icon && <Icon className="w-7 h-7" />}
            {label}
        </button>
    );
};
