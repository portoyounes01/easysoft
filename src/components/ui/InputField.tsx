import React, { forwardRef, useContext } from 'react';
import { LucideIcon } from 'lucide-react';
import { DIALOG_CONTROL_CLASSES, DialogShellStyleContext } from '../../theme/dialogStyle';

export interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: boolean | string;
    icon?: LucideIcon;
    rightIcon?: LucideIcon;
    /** Short text shown inside the field on the left (e.g. a currency symbol). */
    prefixText?: string;
    /** Short text shown inside the field on the right (e.g. "%"). */
    suffixText?: string;
    containerClassName?: string;
}

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(({
    label,
    error,
    icon: Icon,
    rightIcon: RightIcon,
    prefixText,
    suffixText,
    className = '',
    containerClassName = '',
    disabled,
    ...props
}, ref) => {
    // Non-null only when rendered inside an applied ConfiguredDialogShell.
    const shellStyle = useContext(DialogShellStyleContext);

    const baseInputClasses = "w-full bg-white border rounded-xl focus:outline-none focus:ring-1 transition-all disabled:bg-gray-100 disabled:text-gray-400";
    const defaultBorderClasses = "border-gray-300 focus:ring-green-500 focus:border-green-500";
    const errorBorderClasses = "border-red-500 focus:ring-red-500 focus:border-red-500";

    // Applied dialog style: reuse the configured control's shape + focus classes,
    // keeping this component's icon-aware paddings and error state.
    const styledTokens = shellStyle ? DIALOG_CONTROL_CLASSES[shellStyle.controls].split(' ') : [];
    const styledShape = styledTokens
        .filter((t) => t === 'border' || t.startsWith('rounded') || t.startsWith('min-h'))
        .join(' ');
    const styledFocus = styledTokens
        .filter((t) => t.startsWith('focus:') || (t.startsWith('border-') && t !== 'border'))
        .join(' ');

    // Padding calculation based on icons / text affixes
    const paddingLeft = Icon ? 'pl-10' : prefixText ? 'pl-9' : 'pl-4';
    const paddingRight = RightIcon ? 'pr-10' : suffixText ? 'pr-9' : 'pr-4';

    return (
        <div className={`flex flex-col ${containerClassName}`}>
            {label && (
                <label className="block text-xs font-medium text-gray-700 mb-1">
                    {label}
                </label>
            )}
            <div className="relative">
                {Icon && (
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none">
                        <Icon className="w-5 h-5" />
                    </div>
                )}
                {!Icon && prefixText && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-500 pointer-events-none">
                        {prefixText}
                    </div>
                )}
                <input
                    ref={ref}
                    disabled={disabled}
                    className={shellStyle ? `
                        w-full bg-white focus:outline-none transition-all disabled:bg-gray-100 disabled:text-gray-400
                        ${styledShape}
                        ${error ? errorBorderClasses : styledFocus}
                        ${paddingLeft}
                        ${paddingRight}
                        py-3
                        text-sm
                        ${className}
                    ` : `
                        ${baseInputClasses}
                        ${error ? errorBorderClasses : defaultBorderClasses}
                        ${paddingLeft}
                        ${paddingRight}
                        py-3
                        text-sm
                        ${className}
                    `}
                    {...props}
                />
                {RightIcon && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none">
                        <RightIcon className="w-5 h-5" />
                    </div>
                )}
                {!RightIcon && suffixText && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-500 pointer-events-none">
                        {suffixText}
                    </div>
                )}
            </div>
            {typeof error === 'string' && (
                <p className="mt-1 text-xs text-red-500">{error}</p>
            )}
        </div>
    );
});

InputField.displayName = 'InputField';
