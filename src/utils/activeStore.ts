// Which store this client is acting for.
//
// A till is unambiguous: `devices.store_id` is NOT NULL, so pairing fixes the
// store permanently. That is what lets the till's local database stay a plain
// one-row-per-product mirror — it only ever syncs its own store's price and
// stock, so `product.price` and `rawMaterial.stock` keep meaning exactly what
// they always meant, and every read path stays correct without changing.
//
// A back-office human is not: they hold a `store_ids` array that may name
// several. One store resolves; more than one does not, and the caller must ask
// rather than silently show figures that belong to no single store.

import { supabase } from '../lib/supabase';
import { readDevicePairingScope } from './devicePairingStorage';

export type ActiveStoreReason =
    /** Paired till — the store is fixed by the device row. */
    | 'device'
    /** Back-office human who administers exactly one store. */
    | 'single'
    /** Several stores in scope; the caller must choose one. */
    | 'ambiguous'
    /** No store at all (unpaired dev till, no session). */
    | 'none';

export interface ActiveStore {
    storeId: string | null;
    reason: ActiveStoreReason;
}

/** Store ids the signed-in human administers, from their JWT claims. */
function storeIdsFromClaims(meta: Record<string, unknown> | undefined): string[] {
    if (!meta) return [];
    const single = typeof meta.store_id === 'string' ? meta.store_id : null;
    if (single) return [single];
    const many = meta.store_ids;
    return Array.isArray(many) ? many.filter((s): s is string => typeof s === 'string') : [];
}

/**
 * Resolve the store to sync and display for.
 *
 * The device pairing wins over the session: a till is a till even when the
 * human signed into it also administers other stores.
 */
export async function resolveActiveStore(): Promise<ActiveStore> {
    const paired = readDevicePairingScope()?.storeId;
    if (paired) return { storeId: paired, reason: 'device' };

    try {
        const { data } = await supabase.auth.getSession();
        const ids = storeIdsFromClaims(data.session?.user?.app_metadata as Record<string, unknown>);
        if (ids.length === 1) return { storeId: ids[0], reason: 'single' };
        if (ids.length > 1) return { storeId: null, reason: 'ambiguous' };
    } catch {
        /* fall through to none */
    }
    return { storeId: null, reason: 'none' };
}
