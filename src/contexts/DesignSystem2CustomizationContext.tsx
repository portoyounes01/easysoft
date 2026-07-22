import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type CSSProperties,
    type ReactNode,
} from 'react';
import {
    getInternalCssVars,
    INTERNAL_COLOR_DEFAULTS,
    type InternalColorKey,
    getPrimaryCssVars,
    getSecondaryCssVars,
    getPairingCssVars,
    getRadiusCssVars,
    DS2_RADIUS_BASE_PX,
    DS2_RADIUS_MIN_PX,
    DS2_RADIUS_MAX_PX,
    type DesignSystem2ColorChoiceId,
    type DesignSystem2RadiusPreset,
    type DesignSystem2BaseColorId,
    type DesignSystem2NeutralFamilyId,
} from '../theme/designSystem2VisualTokens';

const STORAGE_KEY = 'design-system-2-prefs';
const PREFS_SCHEMA_VERSION = 2;

export type DesignSystem2Density = 'compact' | 'normal' | 'spacious';
export type DesignSystem2MaxWidth = '5xl' | '6xl' | '7xl' | 'full';
export type DesignSystem2PreviewChrome = 'roundedShadow' | 'roundedFlat' | 'minimal';
export type DesignSystem2SidebarWidth = 'sm' | 'md' | 'lg';

/** @deprecated */
export type DesignSystem2AccentId = DesignSystem2ColorChoiceId;

export type {
    DesignSystem2ColorChoiceId,
    DesignSystem2RadiusPreset,
    DesignSystem2BaseColorId,
    DesignSystem2NeutralFamilyId,
};

export interface DesignSystem2Prefs {
    density: DesignSystem2Density;
    maxWidth: DesignSystem2MaxWidth;
    previewChrome: DesignSystem2PreviewChrome;
    sidebarWidth: DesignSystem2SidebarWidth;
    /** Brand / cash / confirm / focus (primary channel) */
    primaryColorId: DesignSystem2ColorChoiceId;
    /** Admin chrome, table actions, sidebar nav gradients */
    secondaryColorId: DesignSystem2ColorChoiceId;
    /** Free-form hex values for internal accents + semantic states (dialog
     *  chips, gradient headers, focus rings, success / warning / danger). */
    internalColors: Record<InternalColorKey, string>;
    /** Page canvas behind preview — distinct from neutral text scale */
    baseColorId: DesignSystem2BaseColorId;
    /** Which gray family maps `neutral-*` utilities in the preview scope */
    neutralFamilyId: DesignSystem2NeutralFamilyId;
    radiusPreset: DesignSystem2RadiusPreset;
    /** Base radius in px used when radiusPreset === 'custom' (the 'default' preset ≙ 10px). */
    radiusCustomPx: number;
    schemaVersion: number;
}

const defaultPrefs: DesignSystem2Prefs = {
    density: 'normal',
    maxWidth: '6xl',
    previewChrome: 'roundedShadow',
    sidebarWidth: 'md',
    primaryColorId: 'green',
    secondaryColorId: 'green',
    internalColors: { ...INTERNAL_COLOR_DEFAULTS },
    baseColorId: 'gray50',
    neutralFamilyId: 'gray',
    radiusPreset: 'default',
    radiusCustomPx: DS2_RADIUS_BASE_PX,
    schemaVersion: PREFS_SCHEMA_VERSION,
};

const COLOR_IDS = new Set<DesignSystem2ColorChoiceId>([
    'green',
    'emerald',
    'blue',
    'indigo',
    'violet',
    'orange',
    'rose',
    'teal',
    'slate',
    'black',
]);

const BASE_IDS = new Set<DesignSystem2BaseColorId>(['white', 'stone50', 'slate50', 'zinc50', 'gray50']);

const NEUTRAL_IDS = new Set<DesignSystem2NeutralFamilyId>(['gray', 'slate', 'stone', 'zinc']);

const RADIUS_ALLOWED: DesignSystem2RadiusPreset[] = ['none', 'sharp', 'default', 'soft', 'custom'];

/** Legacy stored keys from earlier iterations */
type LegacyPartial = Partial<DesignSystem2Prefs> & {
    accentId?: DesignSystem2ColorChoiceId;
    background?: string;
};

function normalizePrefs(raw: LegacyPartial): DesignSystem2Prefs {
    const m: DesignSystem2Prefs = { ...defaultPrefs, ...raw };

    if (raw.accentId && COLOR_IDS.has(raw.accentId)) {
        if (raw.primaryColorId === undefined) m.primaryColorId = raw.accentId;
        if (raw.secondaryColorId === undefined) m.secondaryColorId = raw.accentId;
    }

    if (raw.background !== undefined && raw.baseColorId === undefined) {
        const bgMap: Record<string, DesignSystem2BaseColorId> = {
            gray50: 'gray50',
            white: 'white',
            slate100: 'slate50',
        };
        m.baseColorId = bgMap[raw.background] ?? defaultPrefs.baseColorId;
    }

    if (raw.schemaVersion !== PREFS_SCHEMA_VERSION && raw.secondaryColorId === 'blue') {
        m.secondaryColorId = defaultPrefs.secondaryColorId;
    }

    if (!COLOR_IDS.has(m.primaryColorId)) m.primaryColorId = defaultPrefs.primaryColorId;
    if (!COLOR_IDS.has(m.secondaryColorId)) m.secondaryColorId = defaultPrefs.secondaryColorId;
    // Internal colours: keep only valid hex entries; anything else falls back.
    {
        const hexRe = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
        const raw2 = (m.internalColors ?? {}) as Partial<Record<InternalColorKey, string>>;
        const cleaned = { ...INTERNAL_COLOR_DEFAULTS };
        (Object.keys(INTERNAL_COLOR_DEFAULTS) as InternalColorKey[]).forEach((key) => {
            const v = raw2[key];
            if (typeof v === 'string' && hexRe.test(v.trim())) cleaned[key] = v.trim();
        });
        m.internalColors = cleaned;
    }
    m.schemaVersion = PREFS_SCHEMA_VERSION;
    if (!BASE_IDS.has(m.baseColorId)) m.baseColorId = defaultPrefs.baseColorId;
    if (!NEUTRAL_IDS.has(m.neutralFamilyId)) m.neutralFamilyId = defaultPrefs.neutralFamilyId;
    if (!RADIUS_ALLOWED.includes(m.radiusPreset)) m.radiusPreset = defaultPrefs.radiusPreset;
    m.radiusCustomPx = Number.isFinite(m.radiusCustomPx)
        ? Math.min(DS2_RADIUS_MAX_PX, Math.max(DS2_RADIUS_MIN_PX, Math.round(m.radiusCustomPx)))
        : defaultPrefs.radiusCustomPx;

    return m;
}

function buildVisualStyle(prefs: DesignSystem2Prefs): CSSProperties {
    return {
        ...getPrimaryCssVars(prefs.primaryColorId),
        ...getInternalCssVars(prefs.internalColors),
        ...getSecondaryCssVars(prefs.secondaryColorId),
        ...getPairingCssVars(prefs.primaryColorId, prefs.secondaryColorId),
        ...getRadiusCssVars(prefs.radiusPreset, prefs.radiusCustomPx),
    } as CSSProperties;
}

function loadPrefs(): DesignSystem2Prefs {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultPrefs;
        const parsed = JSON.parse(raw) as LegacyPartial;
        return normalizePrefs(parsed);
    } catch {
        return defaultPrefs;
    }
}

function savePrefs(prefs: DesignSystem2Prefs): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
        /* ignore quota / private mode */
    }
}

export interface DesignSystem2CustomizationClasses {
    rootBg: string;
    sidebarW: string;
    mainScrollPadding: string;
    /** Horizontal inset for card content (tables, toolbars) — scales with density */
    contentInsetX: string;
    contentColumnMaxW: string;
    previewSurface: string;
    /** Vertical page padding (top + bottom) — scales with density */
    pageInsetY: string;
    /** Vertical gap between major sections — scales with density */
    sectionGapY: string;
    /** Internal card padding — scales with density */
    cardPadding: string;
    /** Card container chrome: bg + border + shadow + radius */
    cardSurface: string;
    /** Elevated card chrome (selected / primary cards) */
    cardSurfaceElevated: string;
}

function classesFromPrefs(prefs: DesignSystem2Prefs): DesignSystem2CustomizationClasses {
    const rootBg: Record<DesignSystem2BaseColorId, string> = {
        white: 'bg-white',
        stone50: 'bg-stone-50',
        slate50: 'bg-slate-50',
        zinc50: 'bg-zinc-50',
        gray50: 'bg-gray-50',
    };

    const sidebarW: Record<DesignSystem2SidebarWidth, string> = {
        sm: 'w-64',
        md: 'w-72',
        lg: 'w-80',
    };

    const mainScrollPadding: Record<DesignSystem2Density, string> = {
        compact: 'p-4',
        normal: 'p-8',
        spacious: 'p-12',
    };

    const contentInsetX: Record<DesignSystem2Density, string> = {
        compact: 'px-4',
        normal: 'px-6',
        spacious: 'px-10',
    };

    const contentColumnMaxW: Record<DesignSystem2MaxWidth, string> = {
        '5xl': 'max-w-5xl',
        '6xl': 'max-w-6xl',
        '7xl': 'max-w-7xl',
        full: 'max-w-full',
    };

    const densityPreviewPad: Record<DesignSystem2Density, string> = {
        compact: 'p-4',
        normal: 'p-8',
        spacious: 'p-10',
    };

    const previewSurface: Record<DesignSystem2PreviewChrome, string> = {
        roundedShadow: `bg-white rounded-xl shadow-sm border border-gray-200 ${densityPreviewPad[prefs.density]}`,
        roundedFlat: `bg-white rounded-xl border border-gray-200 ${densityPreviewPad[prefs.density]}`,
        minimal: `bg-transparent ${densityPreviewPad[prefs.density]} border-0 shadow-none`,
    };

    const pageInsetY: Record<DesignSystem2Density, string> = {
        compact: 'py-6',
        normal: 'py-8 md:py-12',
        spacious: 'py-12 md:py-16',
    };

    const sectionGapY: Record<DesignSystem2Density, string> = {
        compact: 'mb-6 md:mb-8',
        normal: 'mb-10 md:mb-12',
        spacious: 'mb-12 md:mb-16',
    };

    const cardPadding: Record<DesignSystem2Density, string> = {
        compact: 'py-6 px-5 md:px-8',
        normal: 'py-10 px-8 md:px-12',
        spacious: 'py-12 px-10 md:px-14',
    };

    const cardSurface: Record<DesignSystem2PreviewChrome, string> = {
        roundedShadow: 'bg-white border border-neutral-200 shadow-lg rounded-2xl',
        roundedFlat: 'bg-white border border-neutral-200 rounded-2xl',
        minimal: 'bg-white border border-neutral-100 rounded-xl',
    };

    const cardSurfaceElevated: Record<DesignSystem2PreviewChrome, string> = {
        roundedShadow: 'bg-white border-2 border-blue-500 shadow-xl rounded-2xl',
        roundedFlat: 'bg-white border-2 border-blue-500 rounded-2xl',
        minimal: 'bg-white border-2 border-blue-500 rounded-xl',
    };

    return {
        rootBg: rootBg[prefs.baseColorId],
        sidebarW: sidebarW[prefs.sidebarWidth],
        mainScrollPadding: mainScrollPadding[prefs.density],
        contentInsetX: contentInsetX[prefs.density],
        contentColumnMaxW: contentColumnMaxW[prefs.maxWidth],
        previewSurface: previewSurface[prefs.previewChrome],
        pageInsetY: pageInsetY[prefs.density],
        sectionGapY: sectionGapY[prefs.density],
        cardPadding: cardPadding[prefs.density],
        cardSurface: cardSurface[prefs.previewChrome],
        cardSurfaceElevated: cardSurfaceElevated[prefs.previewChrome],
    };
}

interface DesignSystem2CustomizationContextValue {
    prefs: DesignSystem2Prefs;
    setPrefs: (patch: Partial<DesignSystem2Prefs>) => void;
    resetPrefs: () => void;
    layoutClasses: DesignSystem2CustomizationClasses;
    visualStyle: CSSProperties;
}

const DesignSystem2CustomizationContext = createContext<DesignSystem2CustomizationContextValue | null>(
    null
);

export const DesignSystem2CustomizationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [prefs, setPrefsState] = useState<DesignSystem2Prefs>(() => loadPrefs());

    useEffect(() => {
        savePrefs(prefs);
    }, [prefs]);

    const setPrefs = useCallback((patch: Partial<DesignSystem2Prefs>) => {
        setPrefsState((prev) => normalizePrefs({ ...prev, ...patch }));
    }, []);

    const resetPrefs = useCallback(() => {
        setPrefsState(defaultPrefs);
        savePrefs(defaultPrefs);
    }, []);

    const layoutClasses = useMemo(() => classesFromPrefs(prefs), [prefs]);

    const visualStyle = useMemo(() => buildVisualStyle(prefs), [prefs]);

    const value = useMemo(
        () => ({
            prefs,
            setPrefs,
            resetPrefs,
            layoutClasses,
            visualStyle,
        }),
        [prefs, setPrefs, resetPrefs, layoutClasses, visualStyle]
    );

    return (
        <DesignSystem2CustomizationContext.Provider value={value}>
            {children}
        </DesignSystem2CustomizationContext.Provider>
    );
};

export function useDesignSystem2Customization(): DesignSystem2CustomizationContextValue {
    const ctx = useContext(DesignSystem2CustomizationContext);
    if (!ctx) {
        throw new Error('useDesignSystem2Customization must be used within DesignSystem2CustomizationProvider');
    }
    return ctx;
}

/**
 * Non-throwing variant for components that may render outside the provider
 * (e.g. ConfiguredDialogShell): returns the CSS-var style when available so
 * var-driven tokens resolve, undefined otherwise (their fallbacks apply).
 */
export function useDesignSystem2VisualStyleSafe(): CSSProperties | undefined {
    return useContext(DesignSystem2CustomizationContext)?.visualStyle;
}
