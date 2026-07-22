import React, { useContext } from 'react';
import {
    DIALOG_CONTROL_CLASSES,
    DIALOG_PALETTES,
    DIALOG_TOGGLE_ON_CLASS,
    DialogShellStyleContext,
    type DialogPaletteTokens,
    type DialogStyleConfig,
} from '../../theme/dialogStyle';

/**
 * Canonical dialog building blocks — the SINGLE SOURCE OF TRUTH for how dialog
 * interiors look. The Appearances dialog-lab previews and the real app dialogs
 * both render through these, so what the lab shows is exactly what ships.
 *
 * Inside an applied ConfiguredDialogShell the pieces restyle from the shell's
 * DialogStyleConfig (palette, controls); outside (legacy, no saved style) they
 * fall back to the slate look the app used before the style engine.
 */

export interface DialogTokens {
    /** Shell style when rendered inside an applied ConfiguredDialogShell. */
    cfg: DialogStyleConfig | null;
    p: DialogPaletteTokens;
    /** Full class for text inputs / selects (shape + focus + width). */
    input: string;
    /** Class for field labels. */
    label: string;
}

const LEGACY_PALETTE: DialogPaletteTokens = {
    titleText: 'text-slate-950',
    subText: 'text-slate-500',
    border: 'border-slate-200',
    tintBg: 'bg-slate-50',
    secondaryBtn: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
};

const LEGACY_INPUT = 'min-h-touch-sm w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500';

export function useDialogTokens(): DialogTokens {
    const cfg = useContext(DialogShellStyleContext);
    if (!cfg) {
        return { cfg: null, p: LEGACY_PALETTE, input: LEGACY_INPUT, label: 'mb-1.5 block text-sm font-semibold text-slate-700' };
    }
    const p = DIALOG_PALETTES[cfg.palette];
    return {
        cfg,
        p,
        input: `w-full bg-white outline-none ${DIALOG_CONTROL_CLASSES[cfg.controls]}`,
        label: `mb-1.5 block text-sm font-semibold ${p.titleText}`,
    };
}

/** Render-prop consumer for bodies that need raw token classes. */
export const WithDialogTokens: React.FC<{ children: (t: DialogTokens) => React.ReactNode }> = ({ children }) => (
    <>{children(useDialogTokens())}</>
);

/** Label + control wrapper. */
export const DialogField: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className = '' }) => {
    const t = useDialogTokens();
    return (
        <div className={className}>
            <span className={t.label}>{label}</span>
            {children}
        </div>
    );
};

export const DialogInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    ({ className = '', ...props }, ref) => {
        const t = useDialogTokens();
        return <input ref={ref} className={`${t.input} ${className}`} {...props} />;
    }
);
DialogInput.displayName = 'DialogInput';

export const DialogSelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className = '', children, ...props }) => {
    const t = useDialogTokens();
    return <select className={`${t.input} ${className}`} {...props}>{children}</select>;
};

export const DialogTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className = '', ...props }) => {
    const t = useDialogTokens();
    return <textarea className={`${t.input} py-3 ${className}`} {...props} />;
};

/** Section heading inside a dialog body. */
export const DialogSectionTitle: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
    const t = useDialogTokens();
    return <h4 className={`font-bold ${t.p.titleText} ${className}`}>{children}</h4>;
};

/** Small labelled value tile (view dialogs: Product/Customer details). */
export const DialogInfoCard: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => {
    const t = useDialogTokens();
    return (
        <div className={`rounded-xl border ${t.p.border} bg-white px-4 py-3`}>
            <p className={`text-xs ${t.p.subText}`}>{label}</p>
            <p className={`mt-0.5 font-semibold ${t.p.titleText}`}>{value}</p>
        </div>
    );
};

/** iOS-style switch; on-colour follows the Appearances primary colour. */
export const DialogSwitch: React.FC<{ checked: boolean; onChange: () => void; label: string; small?: boolean }> = ({ checked, onChange, label, small = false }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
        className={`relative shrink-0 rounded-full transition-colors ${small ? 'h-6 w-11' : 'h-7 w-12'} ${checked ? DIALOG_TOGGLE_ON_CLASS : 'bg-slate-300'}`}
    >
        <span className={`absolute left-0.5 top-0.5 rounded-full bg-white shadow transition-transform ${small ? 'h-5 w-5' : 'h-6 w-6'} ${checked ? 'translate-x-5' : ''}`} />
    </button>
);

/** Titled card row with a trailing switch (Status / Active toggles). */
export const DialogToggleRow: React.FC<{
    title: string;
    help?: string;
    checked: boolean;
    onChange: () => void;
    className?: string;
}> = ({ title, help, checked, onChange, className = '' }) => {
    const t = useDialogTokens();
    return (
        <div className={`flex items-center justify-between gap-4 rounded-2xl border ${t.p.border} ${t.p.tintBg} p-4 ${className}`}>
            <div>
                <p className={`text-sm font-semibold ${t.p.titleText}`}>{title}</p>
                {help && <p className={`text-sm ${t.p.subText}`}>{help}</p>}
            </div>
            <DialogSwitch checked={checked} onChange={onChange} label={title} />
        </div>
    );
};
