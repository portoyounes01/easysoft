import React from 'react';
import { LucideIcon } from 'lucide-react';

interface TabButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    active: boolean;
    icon?: LucideIcon;
    label: string;
    variant?: 'sidebar' | 'reports';
}

export const TabButton: React.FC<TabButtonProps> = ({
    active,
    icon: Icon,
    label,
    variant = 'reports',
    className = '',
    ...props
}) => {
    if (variant === 'sidebar') {
        return (
            <button
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${active
                    ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-yellow-500 shadow-lg transform scale-105'
                    : 'text-yellow-500 hover:bg-slate-800 hover:text-yellow-400'
                    } ${className}`}
                {...props}
            >
                {Icon && <Icon className="w-5 h-5" />}
                <span className="font-medium">{label}</span>
            </button>
        );
    }

    // Reports variant (default)
    return (
        <button
            className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-6 py-3 font-medium text-sm border-b-2 transition-colors ${active
                ? 'border-blue-500 bg-blue-50 text-yellow-500'
                : 'border-transparent text-yellow-500 hover:bg-gray-50'
                } ${className}`}
            {...props}
        >
            {Icon && <Icon className="w-5 h-5" />}
            <span>{label}</span>
        </button>
    );
};
