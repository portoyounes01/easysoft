// Lands the tenant's receipt logo into this till's persisted settings.
//
// The bridge exists because the sync manager is a plain service while settings
// live in a React context. Rather than reach into React, this writes the same
// localStorage blob the context reads (`pos_system_settings`) and fires an
// event the context listens for, so a till that syncs mid-shift picks the logo
// up without a reload.
//
// Writing to storage is also what makes the logo survive offline: the till
// prints from its own copy and never fetches anything at print time.

import { fetchTenantReceiptLogo } from './receiptBrandingService';
import type { ReceiptLogo } from '../utils/receiptLogo';

const SETTINGS_KEY = 'pos_system_settings';
export const RECEIPT_LOGO_CHANGED_EVENT = 'pos:receipt-logo-changed';

/** Merge a logo into the persisted settings blob. Returns true if it changed. */
export function writeReceiptLogoToStorage(logo: ReceiptLogo | null): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        const company = { ...((parsed.company as Record<string, unknown>) ?? {}) };

        const current = company.logo as ReceiptLogo | undefined;
        const same = logo
            ? current?.bitmap === logo.bitmap &&
              current?.widthDots === logo.widthDots &&
              current?.heightDots === logo.heightDots
            : current === undefined;
        if (same) return false;

        if (logo) company.logo = logo;
        else delete company.logo;

        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...parsed, company }));
        return true;
    } catch {
        return false;
    }
}

/**
 * Pull the tenant logo and store it locally.
 *
 * A failed pull returns `undefined` from the service and is left alone: a till
 * that is merely offline must not blank the logo of a shop that has one. Only
 * an explicit `null` — the tenant genuinely has no logo — clears it.
 */
export async function pullTenantReceiptLogo(): Promise<void> {
    const logo = await fetchTenantReceiptLogo();
    if (logo === undefined) return;

    if (writeReceiptLogoToStorage(logo) && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(RECEIPT_LOGO_CHANGED_EVENT, { detail: logo }));
    }
}
