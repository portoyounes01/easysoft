import React from 'react';

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    label?: string;
    variant?: 'primary' | 'secondary' | 'outline';
}

export const ActionButton: React.FC<ActionButtonProps> = ({
    label = 'Process Transaction',
    variant = 'primary',
    className = '',
    ...props
}) => {
    const baseStyles = "w-full rounded-[12px] font-medium transition-all duration-200 py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center";

    const variants = {
        primary: "bg-gradient-primary text-white font-normal hover:opacity-90 transition-opacity",
        secondary: "bg-gray-200 hover:bg-gray-300",
        outline: "bg-white border border-gray-200 text-gray-900 hover:bg-gray-50 shadow-sm font-semibold rounded-2xl transition-all duration-200",
    };

    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${className}`}
            // style={variant === 'primary' ? { color: '#eab308', ...props.style } : props.style}
            {...props}
        >
            {label}
        </button>
    );
};
