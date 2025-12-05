import React from 'react';

interface OutlineButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    label: string;
}

export const OutlineButton: React.FC<OutlineButtonProps> = ({
    label,
    className = '',
    ...props
}) => {
    return (
        <button
            className={`bg-white border border-gray-200 text-gray-900 hover:bg-gray-50 shadow-sm font-semibold rounded-2xl transition-all duration-200 flex items-center justify-center ${className}`}
            {...props}
        >
            {label}
        </button>
    );
};
