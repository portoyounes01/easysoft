import React from 'react';
import { LucideIcon, ChevronDown, Loader2 } from 'lucide-react';

interface AdminActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'outline' | 'ghost' | 'icon';
    icon?: LucideIcon;
    label?: string;
    showChevron?: boolean;
    isLoading?: boolean;
}

export const AdminActionButton: React.FC<AdminActionButtonProps> = ({
    variant = 'primary',
    icon: Icon,
    label,
    showChevron,
    isLoading,
    className = '',
    disabled,
    ...props
}) => {
    const baseStyles = "rounded-lg transition-all duration-200 flex items-center justify-center";

    const variants = {
        primary: "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-grey-50 px-4 py-2 font-medium space-x-2",
        outline: "bg-white border border-gray-200 hover:bg-gray-50 text-grey-50 px-4 py-2 space-x-2",
        ghost: "hover:bg-gray-100 text-grey-50 px-4 py-2 space-x-2",
        icon: "p-2 hover:bg-gray-100 text-grey-50"
    };

    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${className} ${isLoading ? 'opacity-80 cursor-wait' : ''}`}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                Icon && <Icon className="w-4 h-4" />
            )}
            {label && <span>{label}</span>}
            {showChevron && !isLoading && <ChevronDown className="w-4 h-4" />}
        </button>
    );
};
