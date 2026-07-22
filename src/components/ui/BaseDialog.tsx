import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { useAppliedDialogStyle } from '../../theme/dialogStyle';
import { ConfiguredDialogShell } from './ConfiguredDialogShell';

interface BaseDialogProps {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    className?: string;
    width?: string;
    height?: string;
    /** Overlay stacking class. Lower it (e.g. "z-40") when another dialog must open on top. */
    overlayClassName?: string;
    /** Icon for chip header variants of the applied-style shell. */
    icon?: LucideIcon;
    subtitle?: string;
}

export const BaseDialog: React.FC<BaseDialogProps> = ({
    open,
    onClose,
    title,
    children,
    footer,
    className = '',
    width = '50vw',
    height = '60vh',
    overlayClassName = 'z-50',
    icon,
    subtitle,
}) => {
    const applied = useAppliedDialogStyle();

    if (!open) return null;

    if (applied) {
        return (
            <ConfiguredDialogShell
                config={applied}
                title={title}
                subtitle={subtitle}
                icon={icon}
                onClose={onClose}
                overlayClassName={overlayClassName}
                footer={footer}
                vwvhSize={{ width, height }}
            >
                {children}
            </ConfiguredDialogShell>
        );
    }

    return (
        <div className={`fixed inset-0 bg-black/50 flex items-center justify-center ${overlayClassName}`} onClick={onClose}>
            <div
                className={`bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden ${className}`}
                onClick={(e) => e.stopPropagation()}
                style={{ width, height }}
            >
                {/* Header */}
                <div className="bg-gray-200 border-b rounded-t-xl" style={{ padding: '1.2vh 2vh' }}>
                    <div className="flex items-center justify-between">
                        <span className="opacity-0">✕</span>
                        <h3 className="font-bold text-gray-800 text-center" style={{ fontSize: '2vh' }}>
                            {title}
                        </h3>
                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                            style={{ padding: '0.6vh' }}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Full-width divider */}
                <div className="border-t border-gray-300" style={{ marginLeft: '-4vh', marginRight: '-4vh' }} />

                {/* Body */}
                <div className="flex-1 flex flex-col bg-gray-100 min-h-0">
                    {children}
                </div>

                {/* Footer (optional) */}
                {footer && (
                    <>
                        <div className="border-t border-gray-300" style={{ marginLeft: '-4vh', marginRight: '-4vh' }} />
                        <div style={{ paddingLeft: '3.5vh', paddingRight: '3.5vh', paddingTop: '2vh', paddingBottom: '3.5vh' }}>
                            {footer}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
