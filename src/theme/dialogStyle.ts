import { createContext, useSyncExternalStore } from 'react';

/**
 * App-wide dialog style engine, driven by the Appearances "Dialog lab".
 *
 * A DialogStyleConfig describes one variant per style axis (overlay, placement,
 * radius, sizing, header, close button, palette, controls, CTA, footer, body
 * tint). "Save" in the lab persists a config here and every dialog in the app
 * renders through ConfiguredDialogShell using it; "Reset" clears it and every
 * dialog falls back to its original hand-rolled markup.
 */

export type DialogOverlayOpacity = '40' | '45' | '50' | '55';
export type DialogOverlayPadding = 'none' | 'p-3' | 'p-4' | 'p-6';
export type DialogCentering = 'flex' | 'transform' | 'bottomSheet';
export type DialogPanelRadius = 'xl' | '2xl' | '3xl' | '2rem';
export type DialogSizing = 'max-w-sm' | 'max-w-md' | 'max-w-lg' | 'max-w-xl' | 'max-w-2xl' | 'max-w-3xl' | 'vwvh';
export type DialogHeaderVariant = 'grayBarCentered' | 'borderedLeft' | 'chipLeft' | 'bareLeft' | 'gradientBar' | 'borderedChip' | 'bareBold';
export type DialogCloseVariant = 'slateSquare' | 'graySquare' | 'textX' | 'ghostRound' | 'whiteGhost';
export type DialogPalette = 'slate' | 'gray' | 'neutral';
export type DialogControlsVariant = 'legacyGreen' | 'roundedLgBlue' | 'roundedXlEmerald' | 'rounded2xlSlate';
export type DialogPrimaryCta = 'greenGradient' | 'green500' | 'emerald600' | 'slate950' | 'blue600' | 'orange500';
export type DialogFooterVariant = 'inBody' | 'borderedBar' | 'tintedBar';
export type DialogBodyTint = 'white' | 'soft';
/** How action buttons are laid out inside the footer row. */
export type DialogFooterButtons = 'end' | 'stretch' | 'between';

export interface DialogStyleConfig {
    overlayOpacity: DialogOverlayOpacity;
    overlayPadding: DialogOverlayPadding;
    centering: DialogCentering;
    panelRadius: DialogPanelRadius;
    sizing: DialogSizing;
    header: DialogHeaderVariant;
    closeButton: DialogCloseVariant;
    palette: DialogPalette;
    controls: DialogControlsVariant;
    primaryCta: DialogPrimaryCta;
    footer: DialogFooterVariant;
    bodyTint: DialogBodyTint;
    footerButtons: DialogFooterButtons;
}

const AXIS_VALUES: { [K in keyof DialogStyleConfig]: readonly DialogStyleConfig[K][] } = {
    overlayOpacity: ['40', '45', '50', '55'],
    overlayPadding: ['none', 'p-3', 'p-4', 'p-6'],
    centering: ['flex', 'transform', 'bottomSheet'],
    panelRadius: ['xl', '2xl', '3xl', '2rem'],
    sizing: ['max-w-sm', 'max-w-md', 'max-w-lg', 'max-w-xl', 'max-w-2xl', 'max-w-3xl', 'vwvh'],
    header: ['grayBarCentered', 'borderedLeft', 'chipLeft', 'bareLeft', 'gradientBar', 'borderedChip', 'bareBold'],
    closeButton: ['slateSquare', 'graySquare', 'textX', 'ghostRound', 'whiteGhost'],
    palette: ['slate', 'gray', 'neutral'],
    controls: ['legacyGreen', 'roundedLgBlue', 'roundedXlEmerald', 'rounded2xlSlate'],
    primaryCta: ['greenGradient', 'green500', 'emerald600', 'slate950', 'blue600', 'orange500'],
    footer: ['inBody', 'borderedBar', 'tintedBar'],
    bodyTint: ['white', 'soft'],
    footerButtons: ['end', 'stretch', 'between'],
};

/**
 * Defaults for axes added after configs were first persisted — merged into
 * stored configs before validation so an older saved style keeps working.
 */
export const DIALOG_AXIS_FALLBACKS: Partial<DialogStyleConfig> = {
    footerButtons: 'stretch',
};

export function isValidDialogStyleConfig(raw: unknown): raw is DialogStyleConfig {
    if (typeof raw !== 'object' || raw === null) return false;
    return (Object.keys(AXIS_VALUES) as (keyof DialogStyleConfig)[]).every((key) => {
        const allowed: readonly string[] = AXIS_VALUES[key];
        return allowed.includes((raw as Record<string, string>)[key]);
    });
}

export interface DialogPaletteTokens {
    titleText: string;
    subText: string;
    border: string;
    tintBg: string;
    secondaryBtn: string;
}

export const DIALOG_PALETTES: Record<DialogPalette, DialogPaletteTokens> = {
    slate: {
        titleText: 'text-slate-950',
        subText: 'text-slate-500',
        border: 'border-slate-200',
        tintBg: 'bg-slate-50',
        secondaryBtn: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
    },
    gray: {
        titleText: 'text-gray-900',
        subText: 'text-gray-500',
        border: 'border-gray-200',
        tintBg: 'bg-gray-100',
        secondaryBtn: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
    },
    neutral: {
        titleText: 'text-neutral-950',
        subText: 'text-neutral-500',
        border: 'border-neutral-200',
        tintBg: 'bg-neutral-50',
        secondaryBtn: 'border border-neutral-200 text-neutral-700 hover:bg-neutral-50',
    },
};

export const DIALOG_CONTROL_CLASSES: Record<DialogControlsVariant, string> = {
    legacyGreen: 'rounded-xl border border-gray-300 py-3 px-4 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500',
    roundedLgBlue: 'min-h-touch-sm rounded-lg border border-gray-300 px-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200',
    roundedXlEmerald: 'min-h-touch-xs rounded-xl border border-neutral-200 px-4 text-base focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100',
    rounded2xlSlate: 'min-h-touch-sm rounded-2xl border border-slate-300 px-4 text-sm focus:border-slate-500 focus:ring-4 focus:ring-slate-200',
};

/**
 * Primary CTA colour always comes from the Appearances primary colour
 * (`--ds2-confirm-bg` / `--ds2-confirm-hover`, injected by ConfiguredDialogShell);
 * the variant only decides the shape: gradient · 12px, flat · rounded-xl, or
 * flat · rounded-2xl. Fallback hexes match the default green palette.
 */
export const DIALOG_CTA_CLASSES: Record<DialogPrimaryCta, string> = {
    greenGradient: 'rounded-[12px] bg-gradient-to-r from-[var(--ds2-brand-from,#22c55e)] to-[var(--ds2-brand-to,#15803d)] text-white hover:brightness-105',
    green500: 'rounded-2xl bg-[var(--ds2-confirm-bg,#22c55e)] text-white hover:bg-[var(--ds2-confirm-hover,#16a34a)]',
    emerald600: 'rounded-xl bg-[var(--ds2-confirm-bg,#22c55e)] text-white hover:bg-[var(--ds2-confirm-hover,#16a34a)]',
    slate950: 'rounded-2xl bg-[var(--ds2-confirm-bg,#22c55e)] text-white hover:bg-[var(--ds2-confirm-hover,#16a34a)]',
    blue600: 'rounded-xl bg-[var(--ds2-confirm-bg,#22c55e)] text-white hover:bg-[var(--ds2-confirm-hover,#16a34a)]',
    orange500: 'rounded-2xl bg-[var(--ds2-confirm-bg,#22c55e)] text-white hover:bg-[var(--ds2-confirm-hover,#16a34a)]',
};

/** On-state track colour for toggle switches — the Appearances primary colour. */
export const DIALOG_TOGGLE_ON_CLASS = 'bg-[var(--ds2-confirm-bg,#22c55e)]';

/** Secondary button mirrors the primary CTA's corner radius so the pair reads as one system. */
export const DIALOG_SECONDARY_RADIUS: Record<DialogPrimaryCta, string> = {
    greenGradient: 'rounded-[12px]',
    green500: 'rounded-2xl',
    emerald600: 'rounded-xl',
    slate950: 'rounded-2xl',
    blue600: 'rounded-xl',
    orange500: 'rounded-2xl',
};

export const DIALOG_PANEL_RADIUS_CLASSES: Record<DialogPanelRadius, { panel: string; sheet: string }> = {
    xl: { panel: 'rounded-xl', sheet: 'rounded-t-xl' },
    '2xl': { panel: 'rounded-2xl', sheet: 'rounded-t-2xl' },
    '3xl': { panel: 'rounded-3xl', sheet: 'rounded-t-3xl' },
    '2rem': { panel: 'rounded-[2rem]', sheet: 'rounded-t-[2rem]' },
};

export const DIALOG_OVERLAY_BG: Record<DialogOverlayOpacity, string> = {
    '40': 'bg-black/40',
    '45': 'bg-black/45',
    '50': 'bg-black/50',
    '55': 'bg-black/55',
};

export const DIALOG_OVERLAY_PAD: Record<DialogOverlayPadding, string> = {
    none: '',
    'p-3': 'p-3',
    'p-4': 'p-4',
    'p-6': 'p-6',
};

/** Footer action-row layout per the footerButtons axis. */
export const DIALOG_FOOTER_BUTTONS_CLASSES: Record<DialogFooterButtons, { container: string; button: string }> = {
    end: { container: 'flex justify-end gap-3', button: '' },
    stretch: { container: 'flex gap-3', button: 'flex-1' },
    between: { container: 'flex justify-between gap-3', button: '' },
};

/**
 * Action classes for dialogs composing their own footer buttons.
 * `container` carries the footerButtons layout; the button classes already
 * include the per-layout width behaviour, so consumers only place them.
 * `danger`/`dangerOutline` are semantic red (delete, stock out) and ignore the
 * Appearances primary colour on purpose.
 */
export function dialogButtonClasses(config: DialogStyleConfig): {
    container: string;
    primary: string;
    secondary: string;
    danger: string;
    dangerOutline: string;
} {
    const layout = DIALOG_FOOTER_BUTTONS_CLASSES[config.footerButtons];
    const radius = DIALOG_SECONDARY_RADIUS[config.primaryCta];
    return {
        container: layout.container,
        primary: `min-h-touch-sm px-4 font-semibold ${DIALOG_CTA_CLASSES[config.primaryCta]} ${layout.button}`,
        secondary: `min-h-touch-sm px-4 font-semibold ${DIALOG_PALETTES[config.palette].secondaryBtn} ${radius} ${layout.button}`,
        danger: `min-h-touch-sm px-4 font-semibold bg-red-600 text-white hover:bg-red-700 ${radius} ${layout.button}`,
        dangerOutline: `min-h-touch-sm px-4 font-semibold border border-red-300 text-red-600 hover:bg-red-50 ${radius} ${layout.button}`,
    };
}

/**
 * Provided by ConfiguredDialogShell around its body/footer so shared ui
 * components (ActionButton, InputField) can restyle themselves ONLY inside an
 * applied shell — never on page surfaces like OrderSummaryPanel.
 */
export const DialogShellStyleContext = createContext<DialogStyleConfig | null>(null);

// ---- Applied-style store (module-level so it works in every render root) ----

const APPLIED_KEY = 'dialog-style-applied';

function loadApplied(): DialogStyleConfig | null {
    try {
        const raw = localStorage.getItem(APPLIED_KEY);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return null;
        // Backfill axes added after this config was saved, then validate.
        const merged = { ...DIALOG_AXIS_FALLBACKS, ...(parsed as Partial<DialogStyleConfig>) };
        return isValidDialogStyleConfig(merged) ? merged : null;
    } catch {
        return null;
    }
}

let appliedStyle: DialogStyleConfig | null = loadApplied();
const listeners = new Set<() => void>();

function notify(): void {
    listeners.forEach((listener) => listener());
}

export function getAppliedDialogStyle(): DialogStyleConfig | null {
    return appliedStyle;
}

export function applyDialogStyle(config: DialogStyleConfig): void {
    appliedStyle = config;
    try {
        localStorage.setItem(APPLIED_KEY, JSON.stringify(config));
    } catch {
        /* ignore quota / private mode */
    }
    notify();
}

/** Back to every dialog's original (pre-lab) look. */
export function resetDialogStyle(): void {
    appliedStyle = null;
    try {
        localStorage.removeItem(APPLIED_KEY);
    } catch {
        /* ignore */
    }
    notify();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** The saved app-wide dialog style, or null when dialogs keep their originals. */
export function useAppliedDialogStyle(): DialogStyleConfig | null {
    return useSyncExternalStore(subscribe, getAppliedDialogStyle, () => null);
}
