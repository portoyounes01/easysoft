/**
 * Cross-browser UUID v4 generator
 * Uses crypto.randomUUID() when available, falls back to manual implementation
 */
export function generateUUID(): string {
    // Try to use native crypto.randomUUID() if available
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        try {
            return crypto.randomUUID();
        } catch (e) {
            // Fall through to manual implementation
        }
    }

    // Fallback UUID v4 implementation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Alias for generateUUID for consistency with crypto.randomUUID()
 */
export const randomUUID = generateUUID; 