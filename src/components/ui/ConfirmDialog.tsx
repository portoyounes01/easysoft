import React from 'react';
import { X } from 'lucide-react';
import {
    DIALOG_OVERLAY_BG,
    DIALOG_OVERLAY_PAD,
    DIALOG_PALETTES,
    DIALOG_PANEL_RADIUS_CLASSES,
    dialogButtonClasses,
    useAppliedDialogStyle,
} from '../../theme/dialogStyle';
import { useDesignSystem2VisualStyleSafe } from '../../contexts/DesignSystem2CustomizationContext';

interface ConfirmDialogProps {
    /** warning → amber icon + primary CTA; danger → red icon + red CTA. */
    tone?: 'warning' | 'danger';
    title: string;
    message: React.ReactNode;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
    busy?: boolean;
    /** Stacking class; confirms usually sit above the dialog that opened them. */
    overlayClassName?: string;
}

/**
 * Small centred confirmation dialog (icon disc → title → message → actions),
 * following the reference confirm pattern. Renders through the applied dialog
 * style tokens when one is saved, and a neutral legacy look otherwise.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    tone = 'warning',
    title,
    message,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
    busy = false,
    overlayClassName = 'z-[95]',
}) => {
    const applied = useAppliedDialogStyle();
    const ds2Vars = useDesignSystem2VisualStyleSafe();

    const icon = (
        <div
            className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full text-white ${
                tone === 'danger' ? 'bg-red-500' : 'bg-amber-400'
            }`}
        >
            {tone === 'danger' ? <X className="h-6 w-6" strokeWidth={3} /> : <span className="text-2xl font-bold">!</span>}
        </div>
    );

    if (applied) {
        const p = DIALOG_PALETTES[applied.palette];
        const buttons = dialogButtonClasses(applied);
        const confirmClass = tone === 'danger' ? buttons.danger : buttons.primary;
        return (
            <div
                className={`fixed inset-0 flex items-center justify-center ${DIALOG_OVERLAY_BG[applied.overlayOpacity]} ${DIALOG_OVERLAY_PAD[applied.overlayPadding] || 'p-4'} ${overlayClassName}`}
                onClick={onCancel}
                role="presentation"
            >
                <div
                    className={`w-full max-w-sm bg-white p-6 shadow-2xl ${DIALOG_PANEL_RADIUS_CLASSES[applied.panelRadius].panel}`}
                    style={ds2Vars}
                    role="alertdialog"
                    aria-modal
                    onClick={event => event.stopPropagation()}
                >
                    {icon}
                    <h3 className={`mt-4 text-center text-lg font-bold ${p.titleText}`}>{title}</h3>
                    <p className={`mt-1.5 text-center text-sm ${p.subText}`}>{message}</p>
                    <div className={`mt-6 ${buttons.container}`}>
                        <button type="button" onClick={onCancel} className={buttons.secondary}>{cancelLabel}</button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={onConfirm}
                            className={`${confirmClass} disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`fixed inset-0 flex items-center justify-center bg-black/50 p-4 ${overlayClassName}`}
            onClick={onCancel}
            role="presentation"
        >
            <div
                className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
                role="alertdialog"
                aria-modal
                onClick={event => event.stopPropagation()}
            >
                {icon}
                <h3 className="mt-4 text-center text-lg font-bold text-slate-950">{title}</h3>
                <p className="mt-1.5 text-center text-sm text-slate-500">{message}</p>
                <div className="mt-6 grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="min-h-touch-sm rounded-xl border border-slate-200 px-4 font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onConfirm}
                        className={`min-h-touch-sm rounded-xl px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                            tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                        }`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
