// Tenant receipt branding (the printed logo), pulled to every till.
//
// A singleton per tenant, so this is a plain get/upsert pair rather than the
// delta-cursor collection shape the other sync entities use — there is one row
// and no client-side authoring to reconcile.
//
// Read is open to anyone in the tenant, including paired tills. Write is gated
// to owner/admin in BOTH the RLS policy and the SECURITY DEFINER function: an
// admin sets the logo once and the fleet receives it. If any till could push,
// this would be last-writer-wins across devices with no UI to resolve it.

import { supabase } from '../lib/supabase';
import { decodeReceiptLogo, type ReceiptLogo } from '../utils/receiptLogo';

interface TenantBrandingRow {
    receipt_logo: string | null;
    logo_width_dots: number | null;
    logo_height_dots: number | null;
    updated_at: string;
}

/**
 * The tenant's logo, or null when none is set.
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

        const row = (Array.isArray(data) ? data[0] : data) as TenantBrandingRow | undefined;
        if (!row || !row.receipt_logo || !row.logo_width_dots || !row.logo_height_dots) {
            return null;
        }

        const logo: ReceiptLogo = {
            bitmap: row.receipt_logo,
            widthDots: row.logo_width_dots,
            heightDots: row.logo_height_dots,
        };
        // Validate here rather than at print time: a payload that cannot decode
        // is the same as no logo, and finding that out mid-receipt is too late.
        return decodeReceiptLogo(logo) ? logo : null;
    } catch {
        return undefined;
    }
}

/** Publish the logo to the tenant. Throws if the caller is not owner/admin. */
export async function saveTenantReceiptLogo(logo: ReceiptLogo | undefined): Promise<void> {
    const { error } = await supabase.rpc('upsert_tenant_branding', {
        p_receipt_logo: logo?.bitmap ?? null,
        p_width_dots: logo?.widthDots ?? null,
        p_height_dots: logo?.heightDots ?? null,
    });
    if (error) throw new Error(error.message);
}
