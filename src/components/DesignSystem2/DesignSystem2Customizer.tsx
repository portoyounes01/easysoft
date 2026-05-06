import React, { useState, useCallback, useMemo } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { useDesignSystem2Customization } from '../../contexts/DesignSystem2CustomizationContext';
import {
    DESIGN_SYSTEM_2_COLOR_CHOICES,
    DESIGN_SYSTEM_2_BASE_OPTIONS,
    DESIGN_SYSTEM_2_NEUTRAL_OPTIONS,
} from '../../theme/designSystem2VisualTokens';
import { TabToggle, type TabToggleOption } from '../ui/TabToggle';
import { AdminActionButton } from '../ui/AdminActionButton';
import { ActionButton } from '../ui/ActionButton';
import type {
    DesignSystem2Density,
    DesignSystem2MaxWidth,
    DesignSystem2PreviewChrome,
    DesignSystem2SidebarWidth,
    DesignSystem2RadiusPreset,
    DesignSystem2ColorChoiceId,
    DesignSystem2BaseColorId,
    DesignSystem2NeutralFamilyId,
} from '../../contexts/DesignSystem2CustomizationContext';

const SELECT_ROW =
    'min-h-touch w-full rounded-xl border-2 border-neutral-200 bg-white px-4 text-base font-medium text-neutral-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500';

const DesignSystem2Customizer: React.FC = () => {
    const { prefs, setPrefs, resetPrefs } = useDesignSystem2Customization();
    const [open, setOpen] = useState(false);

    const densityOptions = useMemo(
        () =>
            [
                { value: 'compact', label: 'Compact' },
                { value: 'normal', label: 'Normal' },
                { value: 'spacious', label: 'Spacious' },
            ] as TabToggleOption<DesignSystem2Density>[],
        []
    );

    const maxWidthOptions = useMemo(
        () =>
            [
                { value: '5xl', label: '5xl' },
                { value: '6xl', label: '6xl' },
                { value: '7xl', label: '7xl' },
                { value: 'full', label: 'Full' },
            ] as TabToggleOption<DesignSystem2MaxWidth>[],
        []
    );

    const previewOptions = useMemo(
        () =>
            [
                { value: 'roundedShadow', label: 'Card' },
                { value: 'roundedFlat', label: 'Flat' },
                { value: 'minimal', label: 'None' },
            ] as TabToggleOption<DesignSystem2PreviewChrome>[],
        []
    );

    const sidebarOptions = useMemo(
        () =>
            [
                { value: 'sm', label: 'Narrow' },
                { value: 'md', label: 'Default' },
                { value: 'lg', label: 'Wide' },
            ] as TabToggleOption<DesignSystem2SidebarWidth>[],
        []
    );

    const radiusOptions = useMemo(
        () =>
            [
                { value: 'none', label: 'None' },
                { value: 'sharp', label: 'Sharp' },
                { value: 'default', label: 'Default' },
                { value: 'soft', label: 'Soft' },
            ] as TabToggleOption<DesignSystem2RadiusPreset>[],
        []
    );

    const onChangeDensity = useCallback(
        (v: DesignSystem2Density) => setPrefs({ density: v }),
        [setPrefs]
    );
    const onChangeMaxWidth = useCallback(
        (v: DesignSystem2MaxWidth) => setPrefs({ maxWidth: v }),
        [setPrefs]
    );
    const onChangePreview = useCallback(
        (v: DesignSystem2PreviewChrome) => setPrefs({ previewChrome: v }),
        [setPrefs]
    );
    const onChangeSidebar = useCallback(
        (v: DesignSystem2SidebarWidth) => setPrefs({ sidebarWidth: v }),
        [setPrefs]
    );
    const onChangeRadius = useCallback(
        (v: DesignSystem2RadiusPreset) => setPrefs({ radiusPreset: v }),
        [setPrefs]
    );

    return (
        <>
            {!open && (
                <div className="fixed bottom-6 right-6 z-40">
                    <AdminActionButton
                        type="button"
                        variant="primary"
                        label="Customize"
                        icon={SlidersHorizontal}
                        onClick={() => setOpen(true)}
                        className="shadow-lg"
                        aria-expanded={open}
                    />
                </div>
            )}

            {open && (
                <div
                    className="fixed bottom-6 right-6 z-50 w-[min(100vw-1.5rem,22rem)] max-h-[min(85vh,calc(100vh-3rem))] flex flex-col bg-white rounded-3xl shadow-2xl border-2 border-neutral-200 overflow-hidden"
                    role="dialog"
                    aria-label="Design system preview options"
                >
                    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-neutral-200 bg-neutral-50 shrink-0">
                        <h2 className="text-xl font-bold text-neutral-900">Customize preview</h2>
                        <AdminActionButton
                            type="button"
                            variant="icon"
                            icon={X}
                            onClick={() => setOpen(false)}
                            aria-label="Close customize panel"
                        />
                    </div>
                    <div className="overflow-y-auto p-5 space-y-6">
                        <div>
                            <label htmlFor="ds2-primary" className="text-sm font-semibold text-neutral-700 mb-2 block">
                                Primary color
                            </label>
                            <select
                                id="ds2-primary"
                                className={SELECT_ROW}
                                value={prefs.primaryColorId}
                                onChange={(e) =>
                                    setPrefs({ primaryColorId: e.target.value as DesignSystem2ColorChoiceId })
                                }
                            >
                                {DESIGN_SYSTEM_2_COLOR_CHOICES.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="ds2-secondary" className="text-sm font-semibold text-neutral-700 mb-2 block">
                                Secondary color
                            </label>
                            <select
                                id="ds2-secondary"
                                className={SELECT_ROW}
                                value={prefs.secondaryColorId}
                                onChange={(e) =>
                                    setPrefs({ secondaryColorId: e.target.value as DesignSystem2ColorChoiceId })
                                }
                            >
                                {DESIGN_SYSTEM_2_COLOR_CHOICES.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="ds2-base" className="text-sm font-semibold text-neutral-700 mb-2 block">
                                Base color (canvas)
                            </label>
                            <select
                                id="ds2-base"
                                className={SELECT_ROW}
                                value={prefs.baseColorId}
                                onChange={(e) =>
                                    setPrefs({ baseColorId: e.target.value as DesignSystem2BaseColorId })
                                }
                            >
                                {DESIGN_SYSTEM_2_BASE_OPTIONS.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.label}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-neutral-500 mt-2">
                                Page background behind the sidebar and content — separate from the neutral text scale.
                            </p>
                        </div>
                        <div>
                            <label htmlFor="ds2-neutral" className="text-sm font-semibold text-neutral-700 mb-2 block">
                                Neutral scale
                            </label>
                            <select
                                id="ds2-neutral"
                                className={SELECT_ROW}
                                value={prefs.neutralFamilyId}
                                onChange={(e) =>
                                    setPrefs({ neutralFamilyId: e.target.value as DesignSystem2NeutralFamilyId })
                                }
                            >
                                {DESIGN_SYSTEM_2_NEUTRAL_OPTIONS.map((n) => (
                                    <option key={n.id} value={n.id}>
                                        {n.label}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-neutral-500 mt-2">
                                Remaps `neutral-*` utilities in the preview (body copy, chips) — not the canvas base.
                            </p>
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-neutral-700 mb-2">Corner radius</p>
                            <TabToggle
                                options={radiusOptions}
                                value={prefs.radiusPreset}
                                onChange={onChangeRadius}
                            />
                            <p className="text-xs text-neutral-500 mt-2">
                                None = square corners (90°). Other presets scale control radii in the preview scope.
                            </p>
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-neutral-700 mb-2">Content density</p>
                            <TabToggle
                                options={densityOptions}
                                value={prefs.density}
                                onChange={onChangeDensity}
                            />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-neutral-700 mb-2">Max width</p>
                            <TabToggle
                                options={maxWidthOptions}
                                value={prefs.maxWidth}
                                onChange={onChangeMaxWidth}
                            />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-neutral-700 mb-2">Preview surface</p>
                            <TabToggle
                                options={previewOptions}
                                value={prefs.previewChrome}
                                onChange={onChangePreview}
                            />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-neutral-700 mb-2">Sidebar width</p>
                            <TabToggle
                                options={sidebarOptions}
                                value={prefs.sidebarWidth}
                                onChange={onChangeSidebar}
                            />
                        </div>
                        <ActionButton
                            type="button"
                            label="Reset to defaults"
                            variant="secondary"
                            className="w-full min-h-touch"
                            onClick={() => {
                                resetPrefs();
                            }}
                        />
                        <p className="text-xs text-neutral-500">
                            Preferences are saved in this browser (local storage).
                        </p>
                    </div>
                </div>
            )}
        </>
    );
};

export default DesignSystem2Customizer;
