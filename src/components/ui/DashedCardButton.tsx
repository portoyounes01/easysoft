import React from 'react';
import { LucideIcon } from 'lucide-react';

interface DashedCardButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    icon: LucideIcon;
    label: string;
}

export const DashedCardButton: React.FC<DashedCardButtonProps> = ({
    icon: Icon,
    label,
    className = '',
    ...props
}) => {
    return (
        <button
            className={`w-full h-full group border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center hover:border-purple-400 hover:bg-purple-50 transition-all hover:scale-105 active:scale-95 shadow-md hover:shadow-lg ${className}`}
            {...props}
        >
            <Icon className="w-10 h-10 text-gray-400 group-hover:text-purple-600 mb-3" />
            <span className="text-base font-semibold text-gray-900 group-hover:text-purple-800">{label}</span>
        </button>
    );
};
