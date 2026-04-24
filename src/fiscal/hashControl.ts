/**
 * AT HashControl version string for new documents after private-key rotation.
 * Normative usage: monotonic numeric string (`"1"`, `"2"`, …) per vendor practice.
 */
export function nextHashControlVersion(current: string | undefined): string {
    const t = String(current ?? '')
        .trim()
        .replace(/\s/g, '');
    if (!t) {
        return '2';
    }
    if (/^\d+$/.test(t)) {
        const n = parseInt(t, 10);
        if (!Number.isFinite(n) || n < 0) {
            return '2';
        }
        return String(n + 1);
    }
    return '2';
}
