// Tenant receipt branding (the printed logo), pulled to every till.
//
// A singleton per tenant, so this is a plain get/upsert pair rather than the
// delta-cursor collection shape the other sync entities use — there is one row
// and no client-side authoring to reconcile.
//
// Scope: a row with no store is the TENANT DEFAULT, inherited by every store;
// a row with a store OVERRIDES it there. The server resolves the most specific
// row that applies to the caller, so the till asks no questions — it just gets
// its logo. Same shape as store_products over the tenant catalogue.
//
// Read is open to anyone in the tenant, including paired tills. Write is gated
// to owner/admin in BOTH the RLS policy and the SECURITY DEFINER function: an
// admin sets the logo and the fleet receives it. If any till could push, this
// would be last-writer-wins across devices with no UI to resolve it.

import { supabase } from '../lib/supabase';
import { decodeReceiptLogo, type ReceiptLogo } from '../utils/receiptLogo';

interface TenantBrandingRow {
    receipt_logo: string | null;
    logo_width_dots: number | null;
    logo_height_dots: number | null;
    /** Which scope answered: null = the tenant default, set = a store override. */
    store_id: string | null;
    updated_at: string;
}

/** null store = the tenant default that every store inherits. */
export interface BrandingScope {
    storeId: string | null;
}

function rowToLogo(row: TenantBrandingRow | undefined): ReceiptLogo | null {
    if (!row || !row.receipt_logo || !row.logo_width_dots || !row.logo_height_dots) return null;
    const logo: ReceiptLogo = {
        bitmap: row.receipt_logo,
        widthDots: row.logo_width_dots,
        heightDots: row.logo_height_dots,
    };
    // Validate here rather than at print time: a payload that cannot decode is
    // the same as no logo, and finding that out mid-receipt is too late.
    return decodeReceiptLogo(logo) ? logo : null;
}

/**
 * The logo that applies to THIS till — its store's override if there is one,
 * otherwise the tenant default. Resolved server-side.
 *
 * `undefined` means "could not tell" (offline, no session) and MUST be treated
 * differently from null by the caller: overwriting a cached logo with nothing
 * because the till happened to be offline would blank the receipts of a shop
 * that has one.
 */
export async function fetchTenantReceiptLogo(): Promise<ReceiptLogo | null | undefined> {
    try {
        const { data, error } = await supabase.rpc('get_tenant_branding');
        if (error) return undefined;

        return rowToLogo((Array.isArray(data) ? data[0] : data) as TenantBrandingRow | undefined);
    } catch {
        return undefined;
    }
}

/**
 * What is stored at ONE scope exactly — no inheritance. Lets the settings
 * screen show whether this store has its own logo or is showing the tenant's.
 */
export async function fetchReceiptLogoForScope(
    scope: BrandingScope
): Promise<ReceiptLogo | null | undefined> {
    try {
        const { data, error } = await supabase.rpc('get_tenant_branding_for_scope', {
            p_store_id: scope.storeId,
        });
        if (error) return undefined;
        return rowToLogo((Array.isArray(data) ? data[0] : data) as TenantBrandingRow | undefined);
    } catch {
        return undefined;
    }
}

/**
 * Publish the logo at a scope. Throws if the caller is not owner/admin.
 *
 * Clearing a STORE override removes the row, so that store falls back to the
 * tenant default — which is what "remove" means for an override. Clearing the
 * DEFAULT means the tenant genuinely has no logo.
 */
export async function saveTenantReceiptLogo(
    logo: ReceiptLogo | undefined,
    scope: BrandingScope = { storeId: null }
): Promise<void> {
    const { error } = await supabase.rpc('upsert_tenant_branding', {
        p_receipt_logo: logo?.bitmap ?? null,
        p_width_dots: logo?.widthDots ?? null,
        p_height_dots: logo?.heightDots ?? null,
        p_store_id: scope.storeId,
    });
    if (error) throw new Error(error.message);
}
