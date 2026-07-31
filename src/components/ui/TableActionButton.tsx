import React from 'react';
import { LucideIcon } from 'lucide-react';

interface TableActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'sort' | 'icon' | 'delete' | 'edit';
    icon: LucideIcon;
    label?: string;
    /** Render for dark/colored surfaces (floating toolbars, toasts): white
     *  icon, translucent hover. Applies to icon/delete variants. */
    dark?: boolean;
}

export const TableActionButton: React.FC<TableActionButtonProps> = ({
    variant = 'icon',
    icon: Icon,
    label,
    dark = false,
    className = '',
    ...props
}) => {
    const variants = {
        sort: "min-h-touch-xs flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-all font-medium text-gray-900",
        icon: "min-h-touch-xs min-w-touch-xs p-2 hover:bg-gray-100 rounded-lg transition-colors inline-flex items-center justify-center text-gray-700",
        delete: "min-h-touch-xs min-w-touch-xs p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center justify-center",
        edit: "min-h-touch-sm px-6 py-3 bg-blue-600 text-neutral-50 rounded-lg hover:bg-blue-700 transition-all hover:scale-105 active:scale-95 flex items-center space-x-3 font-semibold shadow-lg"
    };

    const darkVariants = {
        icon: "min-h-touch-xs min-w-touch-xs p-2 text-white/90 hover:bg-white/10 hover:text-white rounded-lg transition-colors inline-flex items-center justify-center",
        delete: "min-h-touch-xs min-w-touch-xs p-2 text-red-300 hover:bg-white/10 hover:text-red-200 rounded-lg transition-colors inline-flex items-center justify-center",
    } as const;

    const style =
        dark && (variant === 'icon' || variant === 'delete')
            ? darkVariants[variant]
            : variants[variant];

    // Ghost chips also lose their hover tint when disabled; solid variants
    // (edit/sort) keep their background — stripping it would leave light text
    // on a light surface.
    const disabledClasses =
        variant === 'icon' || variant === 'delete'
            ? 'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'
            : 'disabled:cursor-not-allowed disabled:opacity-40';

    return (
        <button
            className={`${style} ${disabledClasses} ${className}`}
            {...props}
        >
            <Icon className={variant === 'delete' ? "w-4 h-4" : "w-5 h-5"} />
            {label && <span>{label}</span>}
        </button>
    );
};
