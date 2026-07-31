// The company block on the receipt, read from Supabase instead of whatever was
// typed into this device's localStorage.
//
// Server side (migration 20260810000000) resolves it from tables that already
// exist: `tenants.legal_name` / `tenants.nif` for the identity, `stores.*` for
// the location of the store this till is bound to, and `tenant_branding.slogan`
// with the same tenant-default + per-store-override rule as the logo.
//
// The `undefined` convention is the same one `receiptBrandingService` uses and
// matters just as much here: it means "could not tell" (offline, no session),
// NOT "empty". Folding an undefined answer into settings would replace a real
// company block with blanks because a till happened to be offline.

import { supabase } from '../lib/supabase';

/** The receipt-facing company block, as the server resolved it. */
export interface CompanyProfile {
    name: string;
    taxNumber: string;
    address: string;
    postalCode: string;
    city: string;
    phone: string;
    email: string;
    slogan: string;
    /** Store the address half came from; null when the caller is a back office
     *  with several stores and named none, in which case only the identity
     *  half is populated. */
    storeId: string | null;
    storeName: string | null;
}

export interface CompanyStoreOption {
    id: string;
    name: string;
    city: string | null;
}

/**
 * The location fields an owner/admin may edit. Identity is not among them.
 *
 * A field left `null` is NOT written. That is deliberate and load-bearing: the
 * caller edits a settings blob whose untouched fields still hold the shipped
 * placeholders ("Morada", "Lisboa", "1000-001"), so sending the whole block on
 * every save would publish those placeholders the first time anyone saved an
 * unrelated setting — and a non-empty server value wins on sync, so they would
 * then spread to every till in the store. Empty string means "clear it".
 */
export interface StoreCompanyPatch {
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
    phone?: string | null;
    email?: string | null;
}

interface CompanyProfileRow {
    name: string | null;
    tax_number: string | null;
    address: string | null;
    postal_code: string | null;
    city: string | null;
    phone: string | null;
    email: string | null;
    slogan: string | null;
    store_id: string | null;
    store_name: string | null;
}

function rowToProfile(row: CompanyProfileRow | undefined): CompanyProfile | null {
    if (!row) return null;
    return {
        name: row.name ?? '',
        taxNumber: row.tax_number ?? '',
        address: row.address ?? '',
        postalCode: row.postal_code ?? '',
        city: row.city ?? '',
        phone: row.phone ?? '',
        email: row.email ?? '',
        slogan: row.slogan ?? '',
        storeId: row.store_id ?? null,
        storeName: row.store_name ?? null,
    };
}

function firstRow(data: unknown): CompanyProfileRow | undefined {
    return (Array.isArray(data) ? data[0] : data) as CompanyProfileRow | undefined;
}

/**
 * The company block that applies to THIS till — its own store's, resolved
 * server-side from the device's store_id claim.
 *
 * `undefined` means the question could not be answered; the caller must keep
 * whatever it already had.
 */
export async function fetchCompanyProfile(): Promise<CompanyProfile | null | undefined> {
    try {
        const { data, error } = await supabase.rpc('get_company_profile');
        if (error) return undefined;
        return rowToProfile(firstRow(data));
    } catch {
        return undefined;
    }
}

/** The block for a named store, for the back-office editor's store picker. */
export async function fetchCompanyProfileForStore(
    storeId: string | null
): Promise<CompanyProfile | null | undefined> {
    try {
        const { data, error } = await supabase.rpc('get_company_profile_for_scope', {
            p_store_id: storeId,
        });
        if (error) return undefined;
        return rowToProfile(firstRow(data));
    } catch {
        return undefined;
    }
}

/** Stores this caller may edit. Empty for a till, which edits nothing. */
export async function listCompanyStores(): Promise<CompanyStoreOption[] | undefined> {
    try {
        const { data, error } = await supabase.rpc('list_company_stores');
        if (error) return undefined;
        return ((data ?? []) as { id: string; name: string; city: string | null }[]).map(row => ({
            id: row.id,
            name: row.name,
            city: row.city,
        }));
    } catch {
        return undefined;
    }
}

/**
 * Save the location half for a store. Only the fields present in `patch` are
 * written; the rest are left as they are. Throws unless the caller is
 * owner/admin.
 */
export async function saveStoreCompany(storeId: string, patch: StoreCompanyPatch): Promise<void> {
    const { error } = await supabase.rpc('upsert_store_company', {
        p_store_id: storeId,
        p_address: patch.address ?? null,
        p_postal_code: patch.postalCode ?? null,
        p_city: patch.city ?? null,
        p_phone: patch.phone ?? null,
        p_email: patch.email ?? null,
    });
    if (error) throw new Error(error.message);
}

/**
 * Save the slogan at a scope. `storeId: null` is the tenant default, which is
 * what a single-brand chain wants to set once; a store id overrides it for that
 * store only. Clearing a store override drops back to the default.
 */
export async function saveCompanySlogan(slogan: string, storeId: string | null = null): Promise<void> {
    const { error } = await supabase.rpc('upsert_company_slogan', {
        p_slogan: slogan,
        p_store_id: storeId,
    });
    if (error) throw new Error(error.message);
}

/**
 * Fold a fetched profile onto the local company settings.
 *
 * Server wins where it has an answer, but only where it HAS one: a store with
 * no address yet must not blank an address the operator already typed, or the
 * first sync after this migration ships would wipe every till's receipt header.
 * The identity half (name, taxNumber) is the same for every store of a tenant.
 */
export function mergeCompanyProfileIntoSettings<
    T extends {
        name: string;
        address: string;
        postalCode: string;
        city: string;
        taxNumber: string;
        phone?: string;
        email?: string;
        slogan?: string;
    },
>(current: T, profile: CompanyProfile): T {
    const take = (serverValue: string, currentValue: string | undefined): string =>
        serverValue.trim() ? serverValue : (currentValue ?? '');

    return {
        ...current,
        name: take(profile.name, current.name),
        taxNumber: take(profile.taxNumber, current.taxNumber),
        address: take(profile.address, current.address),
        postalCode: take(profile.postalCode, current.postalCode),
        city: take(profile.city, current.city),
        phone: take(profile.phone, current.phone),
        email: take(profile.email, current.email),
        slogan: take(profile.slogan, current.slogan),
    };
}
