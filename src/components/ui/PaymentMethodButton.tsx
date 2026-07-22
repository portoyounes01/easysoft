import React from 'react';
import { useDialogTokens } from './dialogParts';
import { LucideIcon } from 'lucide-react';

interface PaymentMethodButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    selected: boolean;
    icon: LucideIcon;
    label: string;
    method: 'cash' | 'card';
}

export const PaymentMethodButton: React.FC<PaymentMethodButtonProps> = ({
    selected,
    icon: Icon,
    label,
    method,
    className = '',
    ...props
}) => {
    const tk = useDialogTokens();
    const baseStyles = "rounded-[10px] border transition-all flex items-center justify-center space-x-2 px-6 py-3";

    // Actually, looking at the scan, cash was green, card was gray when unselected. 
    // Let's stick to the specific styles found in the scan for "selected" vs "unselected" generally, 
    // but allowing for method specific coloring if needed.

    // Scan showed:
    // Cash Selected: bg-green-50 border-green-500
    // Card Unselected: bg-gray-100 border-gray-200 hover:bg-gray-200

    const getStyles = () => {
        if (selected) {
            return "bg-green-50 border-green-500";
        }
        return `bg-white ${tk.p.border} hover:${tk.p.tintBg}`;
    };

    const getIconColor = () => {
        if (selected) {
            return "text-green-600";
        }
        return tk.p.subText;
    };

    return (
        <button
            className={`${baseStyles} ${getStyles()} ${className}`}
            {...props}
        >
            <Icon className={`${getIconColor()} w-5 h-5`} />
            <span className={`text-base font-medium ${selected ? 'text-green-900' : 'text-gray-900'}`}>{label}</span>
        </button>
    );
};
