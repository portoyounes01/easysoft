import colors from 'tailwindcss/colors';
import type { DesignSystem2ColorChoiceId, DesignSystem2NeutralFamilyId } from './designSystem2VisualTokens';

/**
 * Full Tailwind chroma scale for a DS2 primary/secondary color pick (drives Color Style swatches).
 */
export function tailwindChromaScaleForColorChoice(
    id: DesignSystem2ColorChoiceId
): Record<string, string> {
    const scale = colors[id as keyof typeof colors];
    if (scale && typeof scale === 'object' && '500' in (scale as object)) {
        return scale as Record<string, string>;
    }
    return colors.green as unknown as Record<string, string>;
}

/**
 * Gray family scale for the DS2 “neutral scale” picker.
 */
export function tailwindChromaScaleForNeutralFamily(
    id: DesignSystem2NeutralFamilyId
): Record<string, string> {
    const scale = colors[id as keyof typeof colors];
    if (scale && typeof scale === 'object' && '500' in (scale as object)) {
        return scale as Record<string, string>;
    }
    return colors.gray as unknown as Record<string, string>;
}
