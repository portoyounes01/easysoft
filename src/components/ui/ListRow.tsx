import React from 'react';
import { ChevronRight } from 'lucide-react';

interface ListRowProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /** Row content — avatar, text block, badges; laid out with gap-4. */
    children: React.ReactNode;
    /** Trailing chevron for navigation rows. */
    showChevron?: boolean;
    /** Highlight as the currently selected row (pickers, tills, tables). */
    selected?: boolean;
    /** Bottom divider — disable for standalone rows outside a list card. */
    divider?: boolean;
}

/**
 * Blessed mobile / picker list row (button design language, 2026-07-23).
 * Canonical replacement for every hand-written full-width tappable list row:
 * left-aligned flex row with divider, touch-height, optional chevron and
 * selected tint. Neutral classes follow the appearance scope's neutral remap.
 */
export const ListRow: React.FC<ListRowProps> = ({
    children,
    showChevron = false,
    selected = false,
    divider = true,
    className = '',
    ...props
}) => (
    <button
        type="button"
        className={`flex min-h-touch w-full items-center gap-4 ${divider ? 'border-b border-gray-100 last:border-b-0 ' : ''}px-4 py-3 text-left transition-colors ${selected ? 'bg-green-50' : 'hover:bg-gray-50'} ${className}`}
        {...props}
    >
        <span className="flex min-w-0 flex-1 items-center gap-4">{children}</span>
        {showChevron && <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" />}
    </button>
);

export default ListRow;
