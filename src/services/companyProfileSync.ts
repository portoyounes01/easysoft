// Lands the tenant's company block into this till's persisted settings.
//
// Same bridge as `receiptBrandingSync`, and for the same reason: the sync
// manager is a plain service while settings live in a React context, so this
// writes the `pos_system_settings` blob the context reads and fires an event
// the context listens for. A till that syncs mid-shift picks the new header up
// without a reload.
//
// Writing to storage is also what makes the block survive offline — the till
// prints its own copy and fetches nothing at print time.

import { fetchCompanyProfile, mergeCompanyProfileIntoSettings, type CompanyProfile } from './companyProfileService';

const SETTINGS_KEY = 'pos_system_settings';
export const COMPANY_PROFILE_CHANGED_EVENT = 'pos:company-profile-changed';

/** The fields this sync owns. `logo` is deliberately absent — receiptBrandingSync owns it. */
export type PersistedCompanyFields = {
    name: string;
    address: string;
    postalCode: string;
    city: string;
    taxNumber: string;
    phone?: string;
    email?: string;
    slogan?: string;
};

const DEFAULTS: PersistedCompanyFields = {
    name: '',
    address: '',
    postalCode: '',
    city: '',
    taxNumber: '',
    phone: '',
    email: '',
    slogan: '',
};

/**
 * Merge the resolved block into the persisted settings blob.
 * Returns the merged fields when something actually changed, else null.
 */
export function writeCompanyProfileToStorage(
    profile: CompanyProfile
): PersistedCompanyFields | null {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        const stored = (parsed.company as Record<string, unknown>) ?? {};
        const current: PersistedCompanyFields = {
            ...DEFAULTS,
            ...(stored as Partial<PersistedCompanyFields>),
        };

        const merged = mergeCompanyProfileIntoSettings(current, profile);

        const changed = (Object.keys(DEFAULTS) as (keyof PersistedCompanyFields)[]).some(
            key => (merged[key] ?? '') !== (current[key] ?? '')
        );
        if (!changed) return null;

        // Spread stored LAST-but-overridden so fields this sync does not own —
        // `logo` above all — survive untouched.
        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify({ ...parsed, company: { ...stored, ...merged } })
        );
        return merged;
    } catch {
        return null;
    }
}

/**
 * Pull the company block for this till's store and store it locally.
 *
 * A failed pull returns `undefined` from the service and is left alone: a till
 * that is merely offline must not blank the header of a shop that has one.
 * Empty individual fields are ignored for the same reason — see
 * `mergeCompanyProfileIntoSettings`.
 */
export async function pullCompanyProfile(): Promise<void> {
    const profile = await fetchCompanyProfile();
    if (profile === undefined || profile === null) return;

    const merged = writeCompanyProfileToStorage(profile);
    if (merged && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(COMPANY_PROFILE_CHANGED_EVENT, { detail: merged }));
    }
}
