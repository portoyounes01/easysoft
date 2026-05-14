/**
 * Reads whether the catalog tracks inventory from persisted system settings (localStorage).
 * When false: sales do not adjust stock and POS skips stock limits for tracked items.
 */
export function readPosTrackInventoryFromStorage(): boolean {
    if (typeof localStorage === 'undefined') {
        return true;
    }
    try {
        const raw = localStorage.getItem('pos_system_settings');
        if (!raw) {
            return true;
        }
        const parsed = JSON.parse(raw) as { pos?: { trackInventory?: boolean } };
        return parsed.pos?.trackInventory !== false;
    } catch {
        return true;
    }
}
