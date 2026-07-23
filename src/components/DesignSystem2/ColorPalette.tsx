import React, { useMemo } from 'react';
import colors from 'tailwindcss/colors';
import {
    tailwindChromaScaleForColorChoice,
    tailwindChromaScaleForNeutralFamily,
} from '../../theme/designSystem2TailwindHueScales';
import type { DesignSystem2ColorChoiceId, DesignSystem2NeutralFamilyId } from '../../theme/designSystem2VisualTokens';
import { DESIGN_SYSTEM_2_COLOR_CHOICES } from '../../theme/designSystem2VisualTokens';

function shadeBg(scale: Record<string, string>, shade: number): React.CSSProperties {
    const value = scale[String(shade)];
    return { backgroundColor: value ?? '#e5e7eb' };
}

const THEME_PRIMARY: Record<string, string> = colors.green as unknown as Record<string, string>;
const THEME_SECONDARY: Record<string, string> = colors.purple as unknown as Record<string, string>;
const THEME_NEUTRAL: Record<string, string> = colors.gray as unknown as Record<string, string>;
const VALID: Record<string, string> = colors.green as unknown as Record<string, string>;
const ERROR: Record<string, string> = colors.red as unknown as Record<string, string>;
const WARNING: Record<string, string> = colors.amber as unknown as Record<string, string>;
const INFO: Record<string, string> = colors.blue as unknown as Record<string, string>;

const FULL_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
const LIMITED_SHADES = [100, 200, 300, 400, 500] as const;

function labelForColorChoiceId(id: DesignSystem2ColorChoiceId): string {
    return DESIGN_SYSTEM_2_COLOR_CHOICES.find((c) => c.id === id)?.label ?? id;
}

export interface ColorPaletteProps {
    /**
     * When set (Design System 2), Primary / Secondary / Neutral core rows use the same Tailwind
     * hue scales as the Customize panel so swatches track live preview. DS1 omits these.
     */
    customizationPrimaryHue?: DesignSystem2ColorChoiceId;
    customizationSecondaryHue?: DesignSystem2ColorChoiceId;
    customizationNeutralFamily?: DesignSystem2NeutralFamilyId;
}

const ColorPalette: React.FC<ColorPaletteProps> = ({
    customizationPrimaryHue,
    customizationSecondaryHue,
    customizationNeutralFamily,
}) => {
    const isLivePreview =
        customizationPrimaryHue !== undefined ||
        customizationSecondaryHue !== undefined ||
        customizationNeutralFamily !== undefined;

    const primaryScale = useMemo(
        () =>
            customizationPrimaryHue !== undefined
                ? tailwindChromaScaleForColorChoice(customizationPrimaryHue)
                : THEME_PRIMARY,
        [customizationPrimaryHue]
    );

    const secondaryScale = useMemo(
        () =>
            customizationSecondaryHue !== undefined
                ? tailwindChromaScaleForColorChoice(customizationSecondaryHue)
                : THEME_SECONDARY,
        [customizationSecondaryHue]
    );

    const neutralScale = useMemo(
        () =>
            customizationNeutralFamily !== undefined
                ? tailwindChromaScaleForNeutralFamily(customizationNeutralFamily)
                : THEME_NEUTRAL,
        [customizationNeutralFamily]
    );

    const renderColorRow = (
        displayName: string,
        scale: Record<string, string>,
        shadeList: readonly number[],
        /** Tailwind prefix shown in mono label when in live preview (e.g. `blue`, `gray`) */
        previewMonoPrefix: string | undefined,
        /** Theme token line when not in preview (e.g. primary) */
        themeTokenName: string
    ) => (
        <div className="mb-12">
            <h3 className="text-lg font-semibold text-gray-900 mb-6 capitalize">{displayName}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {shadeList.map((shade) => (
                    <div key={shade} className="space-y-2">
                        <div
                            className="h-24 rounded-lg shadow-sm border border-neutral-200"
                            style={shadeBg(scale, shade)}
                            title={
                                previewMonoPrefix
                                    ? `bg-${previewMonoPrefix}-${shade}`
                                    : `bg-${themeTokenName}-${shade}`
                            }
                        />
                        <div>
                            <p className="text-sm text-gray-600 font-medium capitalize">
                                {displayName} {shade}
                            </p>
                            <p className="text-xs text-gray-400 font-mono">
                                {previewMonoPrefix
                                    ? `bg-${previewMonoPrefix}-${shade}`
                                    : `tailwind ${themeTokenName}-${shade}`}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    // 'black' borrows the neutral ramp (no bg-black-* Tailwind scale exists), so label
    // its swatches with the class names that actually produce the shown hexes.
    const monoPrefixForHue = (hue?: DesignSystem2ColorChoiceId): string | undefined =>
        hue === 'black' ? 'neutral' : hue;
    const primaryMono = monoPrefixForHue(customizationPrimaryHue);
    const secondaryMono = monoPrefixForHue(customizationSecondaryHue);
    const neutralMono = customizationNeutralFamily;

    return (
        <div className="space-y-16">
            <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-8 border-b pb-4">Core Colors</h2>
                {isLivePreview && (
                    <p className="text-base text-gray-600 mb-8 max-w-3xl">
                        Primary, secondary, and neutral rows mirror the Tailwind scales from{' '}
                        <span className="font-semibold text-gray-800">Customize</span>
                        {customizationPrimaryHue !== undefined &&
                            customizationSecondaryHue !== undefined &&
                            customizationNeutralFamily !== undefined && (
                                <>
                                    {' '}
                                    (primary: {labelForColorChoiceId(customizationPrimaryHue)}; secondary:{' '}
                                    {labelForColorChoiceId(customizationSecondaryHue)}; neutral:{' '}
                                    {customizationNeutralFamily}).
                                </>
                            )}
                        {' '}
                        App theme tokens <span className="font-mono text-gray-700">bg-primary-*</span>,{' '}
                        <span className="font-mono text-gray-700">bg-secondary-*</span>, and{' '}
                        <span className="font-mono text-gray-700">bg-neutral-*</span> are still defined in{' '}
                        <span className="font-mono text-sm">tailwind.config</span>; the button demos apply your
                        preview via scoped CSS variables.
                    </p>
                )}
                {renderColorRow('Primary', primaryScale, FULL_SHADES, primaryMono, 'primary')}
                {renderColorRow('Secondary', secondaryScale, FULL_SHADES, secondaryMono, 'secondary')}
                {renderColorRow('Neutral', neutralScale, FULL_SHADES, neutralMono, 'neutral')}

                <div className="mb-12">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6">White</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                        <div className="space-y-2">
                            <div className="h-24 rounded-lg shadow-sm bg-white border border-gray-200" />
                            <div>
                                <p className="text-sm text-gray-600 font-medium">White</p>
                                <p className="text-xs text-gray-400 font-mono">bg-white</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-8 border-b pb-4">Gradients</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    <div className="space-y-2">
                        <div
                            className="h-24 rounded-lg shadow-sm bg-gradient-primary"
                            style={
                                customizationPrimaryHue !== undefined
                                    ? {
                                          // Black's brand gradient lives at the dark end of the
                                          // neutral ramp, not at the 500/700 mid-grays.
                                          backgroundImage:
                                              customizationPrimaryHue === 'black'
                                                  ? `linear-gradient(135.7deg, ${primaryScale['900']} -33%, ${primaryScale['950']} 100%)`
                                                  : `linear-gradient(135.7deg, ${primaryScale['500']} -33%, ${primaryScale['700']} 100%)`,
                                      }
                                    : undefined
                            }
                        />
                        <p className="text-sm text-gray-600 font-medium">Primary Gradient</p>
                        <p className="text-xs text-gray-400 font-mono">bg-gradient-primary</p>
                    </div>
                    <div className="space-y-2">
                        <div
                            className="h-24 rounded-lg shadow-sm"
                            style={{
                                backgroundImage: `linear-gradient(to right, ${neutralScale['500']}, ${neutralScale['700']})`,
                            }}
                        />
                        <p className="text-sm text-gray-600 font-medium">Neutral Gradient</p>
                        <p className="text-xs text-gray-400 font-mono">neutral-500 → neutral-700</p>
                    </div>
                    <div className="space-y-2">
                        <div
                            className="h-24 rounded-lg shadow-sm"
                            style={{
                                backgroundImage: `linear-gradient(to right, ${INFO['500']}, ${INFO['700']})`,
                            }}
                        />
                        <p className="text-sm text-gray-600 font-medium">Info Gradient</p>
                        <p className="text-xs text-gray-400 font-mono">info-500 → info-700</p>
                    </div>
                    <div className="space-y-2">
                        <div
                            className="h-24 rounded-lg shadow-sm"
                            style={{
                                backgroundImage: `linear-gradient(to right, ${WARNING['400']}, ${WARNING['600']})`,
                            }}
                        />
                        <p className="text-sm text-gray-600 font-medium">Warning Gradient</p>
                        <p className="text-xs text-gray-400 font-mono">warning-400 → warning-600</p>
                    </div>
                    <div className="space-y-2">
                        <div
                            className="h-24 rounded-lg shadow-sm"
                            style={{
                                backgroundImage: `linear-gradient(to right, ${VALID['500']}, ${VALID['700']})`,
                            }}
                        />
                        <p className="text-sm text-gray-600 font-medium">Valid Gradient</p>
                        <p className="text-xs text-gray-400 font-mono">valid-500 → valid-700</p>
                    </div>
                    <div className="space-y-2">
                        <div
                            className="h-24 rounded-lg shadow-sm"
                            style={{
                                backgroundImage: `linear-gradient(to right, ${ERROR['500']}, ${ERROR['700']})`,
                            }}
                        />
                        <p className="text-sm text-gray-600 font-medium">Error Gradient</p>
                        <p className="text-xs text-gray-400 font-mono">error-500 → error-700</p>
                    </div>
                </div>
            </section>

            <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-8 border-b pb-4">Status Colors</h2>
                {renderColorRow('Valid', VALID, LIMITED_SHADES, undefined, 'valid')}
                {renderColorRow('Error', ERROR, LIMITED_SHADES, undefined, 'error')}
                {renderColorRow('Warning', WARNING, LIMITED_SHADES, undefined, 'warning')}
                {renderColorRow('Info', INFO, LIMITED_SHADES, undefined, 'info')}
            </section>
        </div>
    );
};

export default ColorPalette;
