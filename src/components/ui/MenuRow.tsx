import React from 'react';
import { LucideIcon, Check } from 'lucide-react';

interface MenuRowProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    label: string;
    icon?: LucideIcon;
    /** Highlight as the currently active choice (sort menus, filters). */
    selected?: boolean;
    /** Destructive rows (Delete) — red text, red hover tint. */
    variant?: 'default' | 'danger';
    /** Show a trailing check mark when selected (sort/filter menus). */
    showCheck?: boolean;
}

/**
 * Blessed dropdown / popover menu item (button design language, 2026-07-23).
 * Canonical replacement for every hand-written `role="menuitem"` row: full-width
 * left-aligned text row with hover tint, optional icon, selected and danger
 * states. Neutral classes follow the appearance scope's neutral family remap.
 */
export const MenuRow: React.FC<MenuRowProps> = ({
    label,
    icon: Icon,
    selected = false,
    variant = 'default',
    showCheck = false,
    className = '',
    ...props
}) => {
    const tone =
        variant === 'danger'
            ? 'text-red-600 hover:bg-red-50'
            : selected
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-700 hover:bg-gray-50';
    return (
        <button
            type="button"
            role="menuitem"
            className={`flex min-h-10 w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${tone} ${className}`}
            {...props}
        >
            {Icon && <Icon className="h-4 w-4 shrink-0" />}
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {showCheck && selected && <Check className="h-4 w-4 shrink-0" />}
        </button>
    );
};

export default MenuRow;
