/**
 * CSS variable values for `.ds2-visual-scope` — drives colors in shared `components/ui/*`
 * without modifying those components (scoped descendant overrides in design-system-2-scope.css).
 */
export type DesignSystem2ColorChoiceId =
    | 'green'
    | 'emerald'
    | 'blue'
    | 'indigo'
    | 'violet'
    | 'orange'
    | 'rose'
    | 'teal'
    | 'slate'
    | 'black';

/** @deprecated use DesignSystem2ColorChoiceId */
export type DesignSystem2AccentId = DesignSystem2ColorChoiceId;

/** 'custom' uses the user-chosen base radius (px) instead of a preset multiplier. */
export type DesignSystem2RadiusPreset = 'none' | 'sharp' | 'default' | 'soft' | 'custom';

export type DesignSystem2BaseColorId = 'white' | 'stone50' | 'slate50' | 'zinc50' | 'gray50';

export type DesignSystem2NeutralFamilyId = 'gray' | 'slate' | 'stone' | 'zinc';

export interface DesignSystem2ColorOption {
    id: DesignSystem2ColorChoiceId;
    label: string;
}

export const DESIGN_SYSTEM_2_COLOR_CHOICES: DesignSystem2ColorOption[] = [
    { id: 'green', label: 'Green' },
    { id: 'emerald', label: 'Emerald' },
    { id: 'blue', label: 'Blue' },
    { id: 'indigo', label: 'Indigo' },
    { id: 'violet', label: 'Violet' },
    { id: 'orange', label: 'Orange' },
    { id: 'rose', label: 'Rose' },
    { id: 'teal', label: 'Teal' },
    { id: 'slate', label: 'Slate' },
    { id: 'black', label: 'Black' },
];

/** @deprecated use DESIGN_SYSTEM_2_COLOR_CHOICES */
export const DESIGN_SYSTEM_2_ACCENTS = DESIGN_SYSTEM_2_COLOR_CHOICES;

type CssVarMap = Record<string, string>;

/** Per hue: primary (brand) + secondary (admin / table / tab chrome) — both follow the row’s hue; customizer splits primary vs secondary picks. */
const PALETTE: Record<DesignSystem2ColorChoiceId, CssVarMap> = {
    green: {
        '--ds2-brand-from': '#22c55e',
        '--ds2-brand-to': '#15803d',
        '--ds2-brand-solid': '#16a34a',
        '--ds2-brand-text-900': '#14532d',
        /* Secondary / admin chrome: same hue as brand (split primary vs secondary in customizer) */
        '--ds2-ui-from': '#16a34a',
        '--ds2-ui-to': '#15803d',
        '--ds2-ui-from-hover': '#15803d',
        '--ds2-ui-to-hover': '#166534',
        '--ds2-ui-solid': '#16a34a',
        '--ds2-ui-hover-solid': '#15803d',
        '--ds2-ui-tint-bg': '#f0fdf4',
        '--ds2-ui-tint-text': '#14532d',
        '--ds2-cash-bg': '#f0fdf4',
        '--ds2-cash-border': '#22c55e',
        '--ds2-cash-icon': '#16a34a',
        '--ds2-focus-ring': '#22c55e',
        '--ds2-focus-border': '#16a34a',
        '--ds2-confirm-bg': '#22c55e',
        '--ds2-confirm-hover': '#16a34a',
    },
    emerald: {
        '--ds2-brand-from': '#10b981',
        '--ds2-brand-to': '#047857',
        '--ds2-brand-solid': '#059669',
        '--ds2-brand-text-900': '#064e3b',
        '--ds2-ui-from': '#059669',
        '--ds2-ui-to': '#047857',
        '--ds2-ui-from-hover': '#047857',
        '--ds2-ui-to-hover': '#065f46',
        '--ds2-ui-solid': '#059669',
        '--ds2-ui-hover-solid': '#047857',
        '--ds2-ui-tint-bg': '#ecfdf5',
        '--ds2-ui-tint-text': '#064e3b',
        '--ds2-cash-bg': '#ecfdf5',
        '--ds2-cash-border': '#10b981',
        '--ds2-cash-icon': '#059669',
        '--ds2-focus-ring': '#10b981',
        '--ds2-focus-border': '#059669',
        '--ds2-confirm-bg': '#10b981',
        '--ds2-confirm-hover': '#059669',
    },
    blue: {
        '--ds2-brand-from': '#3b82f6',
        '--ds2-brand-to': '#1d4ed8',
        '--ds2-brand-solid': '#2563eb',
        '--ds2-brand-text-900': '#1e3a8a',
        /* Blue option for explicit secondary/admin chrome selection. */
        '--ds2-ui-from': '#3b82f6',
        '--ds2-ui-to': '#2563eb',
        '--ds2-ui-from-hover': '#2563eb',
        '--ds2-ui-to-hover': '#1d4ed8',
        '--ds2-ui-solid': '#2563eb',
        '--ds2-ui-hover-solid': '#1d4ed8',
        '--ds2-ui-tint-bg': '#eff6ff',
        '--ds2-ui-tint-text': '#1e3a8a',
        '--ds2-cash-bg': '#eff6ff',
        '--ds2-cash-border': '#3b82f6',
        '--ds2-cash-icon': '#2563eb',
        '--ds2-focus-ring': '#3b82f6',
        '--ds2-focus-border': '#2563eb',
        '--ds2-confirm-bg': '#3b82f6',
        '--ds2-confirm-hover': '#2563eb',
    },
    indigo: {
        '--ds2-brand-from': '#6366f1',
        '--ds2-brand-to': '#4338ca',
        '--ds2-brand-solid': '#4f46e5',
        '--ds2-brand-text-900': '#312e81',
        '--ds2-ui-from': '#6366f1',
        '--ds2-ui-to': '#4f46e5',
        '--ds2-ui-from-hover': '#4f46e5',
        '--ds2-ui-to-hover': '#4338ca',
        '--ds2-ui-solid': '#4f46e5',
        '--ds2-ui-hover-solid': '#4338ca',
        '--ds2-ui-tint-bg': '#eef2ff',
        '--ds2-ui-tint-text': '#312e81',
        '--ds2-cash-bg': '#eef2ff',
        '--ds2-cash-border': '#6366f1',
        '--ds2-cash-icon': '#4f46e5',
        '--ds2-focus-ring': '#6366f1',
        '--ds2-focus-border': '#4f46e5',
        '--ds2-confirm-bg': '#6366f1',
        '--ds2-confirm-hover': '#4f46e5',
    },
    violet: {
        '--ds2-brand-from': '#a855f7',
        '--ds2-brand-to': '#7e22ce',
        '--ds2-brand-solid': '#9333ea',
        '--ds2-brand-text-900': '#581c87',
        '--ds2-ui-from': '#a855f7',
        '--ds2-ui-to': '#9333ea',
        '--ds2-ui-from-hover': '#9333ea',
        '--ds2-ui-to-hover': '#7e22ce',
        '--ds2-ui-solid': '#9333ea',
        '--ds2-ui-hover-solid': '#7e22ce',
        '--ds2-ui-tint-bg': '#faf5ff',
        '--ds2-ui-tint-text': '#581c87',
        '--ds2-cash-bg': '#faf5ff',
        '--ds2-cash-border': '#a855f7',
        '--ds2-cash-icon': '#9333ea',
        '--ds2-focus-ring': '#a855f7',
        '--ds2-focus-border': '#9333ea',
        '--ds2-confirm-bg': '#a855f7',
        '--ds2-confirm-hover': '#9333ea',
    },
    orange: {
        '--ds2-brand-from': '#f97316',
        '--ds2-brand-to': '#c2410c',
        '--ds2-brand-solid': '#ea580c',
        '--ds2-brand-text-900': '#7c2d12',
        '--ds2-ui-from': '#f97316',
        '--ds2-ui-to': '#ea580c',
        '--ds2-ui-from-hover': '#ea580c',
        '--ds2-ui-to-hover': '#c2410c',
        '--ds2-ui-solid': '#ea580c',
        '--ds2-ui-hover-solid': '#c2410c',
        '--ds2-ui-tint-bg': '#fff7ed',
        '--ds2-ui-tint-text': '#7c2d12',
        '--ds2-cash-bg': '#fff7ed',
        '--ds2-cash-border': '#f97316',
        '--ds2-cash-icon': '#ea580c',
        '--ds2-focus-ring': '#f97316',
        '--ds2-focus-border': '#ea580c',
        '--ds2-confirm-bg': '#f97316',
        '--ds2-confirm-hover': '#ea580c',
    },
    rose: {
        '--ds2-brand-from': '#f43f5e',
        '--ds2-brand-to': '#be123c',
        '--ds2-brand-solid': '#e11d48',
        '--ds2-brand-text-900': '#881337',
        '--ds2-ui-from': '#f43f5e',
        '--ds2-ui-to': '#e11d48',
        '--ds2-ui-from-hover': '#e11d48',
        '--ds2-ui-to-hover': '#be123c',
        '--ds2-ui-solid': '#e11d48',
        '--ds2-ui-hover-solid': '#be123c',
        '--ds2-ui-tint-bg': '#fff1f2',
        '--ds2-ui-tint-text': '#881337',
        '--ds2-cash-bg': '#fff1f2',
        '--ds2-cash-border': '#f43f5e',
        '--ds2-cash-icon': '#e11d48',
        '--ds2-focus-ring': '#f43f5e',
        '--ds2-focus-border': '#e11d48',
        '--ds2-confirm-bg': '#f43f5e',
        '--ds2-confirm-hover': '#e11d48',
    },
    teal: {
        '--ds2-brand-from': '#14b8a6',
        '--ds2-brand-to': '#0f766e',
        '--ds2-brand-solid': '#0d9488',
        '--ds2-brand-text-900': '#134e4a',
        '--ds2-ui-from': '#14b8a6',
        '--ds2-ui-to': '#0d9488',
        '--ds2-ui-from-hover': '#0d9488',
        '--ds2-ui-to-hover': '#0f766e',
        '--ds2-ui-solid': '#0d9488',
        '--ds2-ui-hover-solid': '#0f766e',
        '--ds2-ui-tint-bg': '#f0fdfa',
        '--ds2-ui-tint-text': '#134e4a',
        '--ds2-cash-bg': '#f0fdfa',
        '--ds2-cash-border': '#14b8a6',
        '--ds2-cash-icon': '#0d9488',
        '--ds2-focus-ring': '#14b8a6',
        '--ds2-focus-border': '#0d9488',
        '--ds2-confirm-bg': '#14b8a6',
        '--ds2-confirm-hover': '#0d9488',
    },
    slate: {
        '--ds2-brand-from': '#64748b',
        '--ds2-brand-to': '#334155',
        '--ds2-brand-solid': '#475569',
        '--ds2-brand-text-900': '#0f172a',
        '--ds2-ui-from': '#64748b',
        '--ds2-ui-to': '#475569',
        '--ds2-ui-from-hover': '#475569',
        '--ds2-ui-to-hover': '#334155',
        '--ds2-ui-solid': '#475569',
        '--ds2-ui-hover-solid': '#334155',
        '--ds2-ui-tint-bg': '#f8fafc',
        '--ds2-ui-tint-text': '#0f172a',
        '--ds2-cash-bg': '#f8fafc',
        '--ds2-cash-border': '#64748b',
        '--ds2-cash-icon': '#475569',
        '--ds2-focus-ring': '#64748b',
        '--ds2-focus-border': '#475569',
        '--ds2-confirm-bg': '#64748b',
        '--ds2-confirm-hover': '#475569',
    },
    black: {
        /* Pure black brand — hover/gradient counterparts lift toward neutral-800/900
           since black itself cannot get darker. */
        '--ds2-brand-from': '#171717',
        '--ds2-brand-to': '#000000',
        '--ds2-brand-solid': '#000000',
        '--ds2-brand-text-900': '#000000',
        '--ds2-ui-from': '#171717',
        '--ds2-ui-to': '#000000',
        '--ds2-ui-from-hover': '#262626',
        '--ds2-ui-to-hover': '#171717',
        '--ds2-ui-solid': '#000000',
        '--ds2-ui-hover-solid': '#262626',
        '--ds2-ui-tint-bg': '#f5f5f5',
        '--ds2-ui-tint-text': '#000000',
        '--ds2-cash-bg': '#f5f5f5',
        '--ds2-cash-border': '#404040',
        '--ds2-cash-icon': '#000000',
        '--ds2-focus-ring': '#404040',
        '--ds2-focus-border': '#000000',
        '--ds2-confirm-bg': '#000000',
        '--ds2-confirm-hover': '#262626',
    },
};

const PRIMARY_KEYS = [
    '--ds2-brand-from',
    '--ds2-brand-to',
    '--ds2-brand-solid',
    '--ds2-brand-text-900',
    '--ds2-cash-bg',
    '--ds2-cash-border',
    '--ds2-cash-icon',
    '--ds2-focus-ring',
    '--ds2-focus-border',
    '--ds2-confirm-bg',
    '--ds2-confirm-hover',
] as const;

const SECONDARY_KEYS = [
    '--ds2-ui-from',
    '--ds2-ui-to',
    '--ds2-ui-from-hover',
    '--ds2-ui-to-hover',
    '--ds2-ui-solid',
    '--ds2-ui-hover-solid',
    /** Active “reports” tabs and other light secondary surfaces inside `.ds2-visual-scope` */
    '--ds2-ui-tint-bg',
    '--ds2-ui-tint-text',
] as const;

function pickKeys(map: CssVarMap, keys: readonly string[]): CssVarMap {
    const out: CssVarMap = {};
    for (const k of keys) {
        if (map[k] !== undefined) out[k] = map[k];
    }
    return out;
}

export function getPrimaryCssVars(id: DesignSystem2ColorChoiceId): CssVarMap {
    const row = PALETTE[id] ?? PALETTE.green;
    return pickKeys(row, PRIMARY_KEYS);
}

export function getSecondaryCssVars(id: DesignSystem2ColorChoiceId): CssVarMap {
    const row = PALETTE[id] ?? PALETTE.green;
    return pickKeys(row, SECONDARY_KEYS);
}

/** Pairing gradient: primary solid → secondary solid */
export function getPairingCssVars(primaryId: DesignSystem2ColorChoiceId, secondaryId: DesignSystem2ColorChoiceId): CssVarMap {
    const p = PALETTE[primaryId] ?? PALETTE.green;
    const s = PALETTE[secondaryId] ?? PALETTE.green;
    return {
        '--ds2-pair-from': p['--ds2-brand-solid'],
        '--ds2-pair-to': s['--ds2-brand-solid'],
        '--ds2-pair-from-hover': p['--ds2-brand-to'],
        '--ds2-pair-to-hover': s['--ds2-brand-to'],
    };
}

/** @deprecated use getPrimaryCssVars / getSecondaryCssVars */
export function getAccentCssVars(id: DesignSystem2ColorChoiceId): CssVarMap {
    return { ...getPrimaryCssVars(id), ...getSecondaryCssVars(id), ...getPairingCssVars(id, id) };
}

const RADIUS_MULT: Record<Exclude<DesignSystem2RadiusPreset, 'custom'>, number> = {
    none: 0,
    sharp: 0.72,
    default: 1,
    soft: 1.28,
};

/** The 'default' preset's base radius: multipliers/custom px are expressed against it. */
export const DS2_RADIUS_BASE_PX = 10;
export const DS2_RADIUS_MIN_PX = 0;
export const DS2_RADIUS_MAX_PX = 24;

/** Base radius (px) a preset resolves to — drives the customizer slider position. */
export function radiusBasePxForPreset(preset: DesignSystem2RadiusPreset, customPx: number = DS2_RADIUS_BASE_PX): number {
    if (preset === 'custom') {
        return Math.min(DS2_RADIUS_MAX_PX, Math.max(DS2_RADIUS_MIN_PX, Math.round(customPx)));
    }
    return Math.round((RADIUS_MULT[preset] ?? 1) * DS2_RADIUS_BASE_PX);
}

export function getRadiusCssVars(preset: DesignSystem2RadiusPreset, customPx: number = DS2_RADIUS_BASE_PX): CssVarMap {
    const mult = preset === 'custom'
        ? radiusBasePxForPreset(preset, customPx) / DS2_RADIUS_BASE_PX
        : RADIUS_MULT[preset] ?? 1;
    const r = (px: number) => `${Math.round(px * mult * 100) / 100}px`;
    return {
        '--ds2-radius-sm': r(6),
        '--ds2-radius-md': r(10),
        '--ds2-radius-lg': r(8),
        '--ds2-radius-xl': r(12),
        '--ds2-radius-2xl': r(16),
        '--ds2-radius-toggle': r(10),
        '--ds2-radius-action': r(12),
    };
}

export const DESIGN_SYSTEM_2_BASE_OPTIONS: { id: DesignSystem2BaseColorId; label: string }[] = [
    { id: 'white', label: 'White' },
    { id: 'stone50', label: 'Stone (warm)' },
    { id: 'slate50', label: 'Slate (cool)' },
    { id: 'zinc50', label: 'Zinc' },
    { id: 'gray50', label: 'Gray' },
];

export const DESIGN_SYSTEM_2_NEUTRAL_OPTIONS: { id: DesignSystem2NeutralFamilyId; label: string }[] = [
    { id: 'gray', label: 'Gray (default)' },
    { id: 'slate', label: 'Slate' },
    { id: 'stone', label: 'Stone' },
    { id: 'zinc', label: 'Zinc' },
];
