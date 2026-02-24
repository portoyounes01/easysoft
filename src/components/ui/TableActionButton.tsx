import React from 'react';
import { LucideIcon } from 'lucide-react';

interface TableActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'sort' | 'icon' | 'delete' | 'edit';
    icon: LucideIcon;
    label?: string;
}

export const TableActionButton: React.FC<TableActionButtonProps> = ({
    variant = 'icon',
    icon: Icon,
    label,
    className = '',
    ...props
}) => {
    const variants = {
        sort: "min-h-[44px] flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-all font-medium text-grey-50",
        icon: "min-h-[44px] min-w-[44px] p-2 hover:bg-gray-100 rounded-lg transition-colors inline-flex items-center justify-center text-grey-50",
        delete: "min-h-[44px] min-w-[44px] p-2 text-grey-50 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center justify-center",
        edit: "min-h-[50px] px-6 py-3 bg-blue-600 text-grey-50 rounded-lg hover:bg-blue-700 transition-all hover:scale-105 active:scale-95 flex items-center space-x-3 font-semibold shadow-lg"
    };

    return (
        <button
            className={`${variants[variant]} ${className}`}
            {...props}
        >
            <Icon className={variant === 'delete' ? "w-4 h-4" : "w-5 h-5"} />
            {label && <span>{label}</span>}
        </button>
    );
};
