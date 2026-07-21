import React, { useContext } from 'react';
import {
    DIALOG_CTA_CLASSES,
    DIALOG_PALETTES,
    DIALOG_SECONDARY_RADIUS,
    DialogShellStyleContext,
} from '../../theme/dialogStyle';

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
    // Non-null only when rendered inside an applied ConfiguredDialogShell —
    // page surfaces (e.g. OrderSummaryPanel) always keep the original look.
    const shellStyle = useContext(DialogShellStyleContext);

    const baseStyles = "w-full rounded-[12px] font-medium transition-all duration-200 py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center";

    const variants = {
        primary: "bg-gradient-primary text-neutral-50 font-medium hover:opacity-90 transition-opacity",
        secondary: "bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium",
        outline: "bg-white border border-gray-200 text-gray-900 hover:bg-gray-50 shadow-sm font-semibold rounded-2xl transition-all duration-200",
    };

    if (shellStyle) {
        const styledBase = "w-full font-semibold transition-all duration-200 py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center";
        const styledVariants = {
            primary: DIALOG_CTA_CLASSES[shellStyle.primaryCta],
            secondary: `${DIALOG_PALETTES[shellStyle.palette].secondaryBtn} ${DIALOG_SECONDARY_RADIUS[shellStyle.primaryCta]}`,
            outline: `bg-white border ${DIALOG_PALETTES[shellStyle.palette].border} ${DIALOG_PALETTES[shellStyle.palette].titleText} shadow-sm ${DIALOG_SECONDARY_RADIUS[shellStyle.primaryCta]}`,
        };
        return (
            <button className={`${styledBase} ${styledVariants[variant]} ${className}`} {...props}>
                {label}
            </button>
        );
    }

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
