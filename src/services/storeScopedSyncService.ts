// Pulls the store-scoped catalogue and stock into this client's local database.
//
// The design turns on one fact: `devices.store_id` is NOT NULL, so a till
// belongs to exactly one store for as long as it is paired. Its local database
// is therefore ALREADY scoped — it needs no store dimension of its own. This
// service syncs only the active store's rows and folds them onto the existing
// product / raw-material records, so `product.price` and `rawMaterial.stock`
// keep their columns and simply now mean "this store's".
//
// That is what makes every existing read path correct without touching it —
// including recipeService's `material.stock - amount`, which was drawing one
// store's sale down against a pool shared with the other.
//
// The server deltas return every store the caller may see, so the narrowing to
// the active store happens here.

import { supabase } from '../lib/supabase';
import { localDb } from '../lib/localDatabase';
import { resolveActiveStore, type ActiveStore } from '../utils/activeStore';

const EPOCH = '1970-01-01T00:00:00Z';

interface StoreProductRow {
    store_id: string;
    product_id: string;
    is_available: boolean;
    price: number | null;
    stock: number | null;
    min_stock: number | null;
    track_stock: boolean;
    deleted_at: string | null;
}

interface StoreRawMaterialRow {
    store_id: string;
    raw_material_id: string;
    stock: number | null;
    min_stock: number | null;
    deleted_at: string | null;
}

interface RawMaterialRow {
    id: string;
    name: string;
    unit: string;
    cost: number | null;
    supplier: string | null;
    is_active: boolean;
    description: string | null;
    deleted_at: string | null;
}

interface RecipeLineRow {
    id: string;
    product_id: string;
    raw_material_id: string;
    /** Named to match both the server column and LocalRecipeLine. Getting this
     *  wrong makes every deduction NaN, silently. */
    quantity_per_unit: number;
    deleted_at: string | null;
}

async function rpcRows<T>(fn: string, since: string): Promise<T[] | null> {
    const { data, error } = await supabase.rpc(fn, { last_sync_timestamp: since });
    if (error) {
        // A missing function means the migration has not been applied to this
        // project yet. Leave local data alone rather than blanking it.
        console.warn(`storeScopedSync: ${fn} unavailable —`, error.message);
        return null;
    }
    return (data ?? []) as T[];
}

/**
 * Tenant-level raw materials (identity and cost). Stock is deliberately NOT
 * here — it is never a tenant-level fact, and arrives per store below.
 */
export async function pullRawMaterials(since = EPOCH): Promise<void> {
    const rows = await rpcRows<RawMaterialRow>('get_raw_materials_delta', since);
    if (!rows?.length) return;

    await localDb.transaction('rw', localDb.rawMaterials, async () => {
        for (const row of rows) {
            if (row.deleted_at) {
                await localDb.rawMaterials.delete(row.id);
                continue;
            }
            const existing = await localDb.rawMaterials.get(row.id);
            await localDb.rawMaterials.put({
                // Preserve this store's stock/min_stock, which the store pull owns.
                stock: existing?.stock ?? 0,
                min_stock: existing?.min_stock ?? 0,
                ...existing,
                id: row.id,
                name: row.name,
                unit: row.unit as never,
                cost: row.cost ?? existing?.cost ?? 0,
                supplier: row.supplier ?? null,
                is_active: row.is_active,
                description: row.description ?? null,
            } as never);
        }
    });
}

export async function pullRecipeLines(since = EPOCH): Promise<void> {
    const rows = await rpcRows<RecipeLineRow>('get_recipe_lines_delta', since);
    if (!rows?.length) return;

    await localDb.transaction('rw', localDb.recipeLines, async () => {
        for (const row of rows) {
            if (row.deleted_at) {
                await localDb.recipeLines.delete(row.id);
                continue;
            }
            await localDb.recipeLines.put({
                id: row.id,
                product_id: row.product_id,
                raw_material_id: row.raw_material_id,
                quantity_per_unit: Number(row.quantity_per_unit),
            } as never);
        }
    });
}

/** Fold this store's price / stock / availability onto the local product rows. */
export async function pullStoreProducts(storeId: string, since = EPOCH): Promise<void> {
    const rows = await rpcRows<StoreProductRow>('get_store_products_delta', since);
    if (!rows?.length) return;

    const mine = rows.filter(row => row.store_id === storeId && !row.deleted_at);
    if (!mine.length) return;

    await localDb.transaction('rw', localDb.products, async () => {
        for (const row of mine) {
            const product = await localDb.products.get(row.product_id);
            if (!product) continue; // The tenant product pull has not landed it yet.
            await localDb.products.update(row.product_id, {
                // A null store price means "inherit the tenant product price",
                // so only a set value overrides.
                ...(row.price === null ? {} : { price: Number(row.price) }),
                stock: Number(row.stock ?? 0),
                min_stock: Number(row.min_stock ?? 0),
                is_active: product.is_active && row.is_available,
                track_stock: row.track_stock,
            } as never);
        }
    });
}

/** Fold this store's stock onto the local raw-material rows. */
export async function pullStoreRawMaterials(storeId: string, since = EPOCH): Promise<void> {
    const rows = await rpcRows<StoreRawMaterialRow>('get_store_raw_materials_delta', since);
    if (!rows?.length) return;

    const mine = rows.filter(row => row.store_id === storeId && !row.deleted_at);
    if (!mine.length) return;

    await localDb.transaction('rw', localDb.rawMaterials, async () => {
        for (const row of mine) {
            const existing = await localDb.rawMaterials.get(row.raw_material_id);
            if (!existing) continue;
            await localDb.rawMaterials.update(row.raw_material_id, {
                stock: Number(row.stock ?? 0),
                min_stock: Number(row.min_stock ?? 0),
            });
        }
    });
}

/**
 * Pull the catalogue and stock for whichever store this client is acting for.
 *
 * Returns the resolution so a caller can tell "synced" from "could not tell
 * which store". When no single store resolves, local data is left EXACTLY as
 * it was: showing another store's figures would be worse than showing stale
 * ones, and blanking them would be worse still.
 */
export async function pullStoreScopedCatalogue(): Promise<ActiveStore> {
    const active = await resolveActiveStore();
    if (!active.storeId) return active;

    // Push BEFORE pulling: a sale made while offline must reach the server
    // before the server's older figure is folded back over it.
    await pushStoreStock(active.storeId);

    // Tenant-level identity first: the store rows fold onto records that must
    // already exist locally.
    await pullRawMaterials();
    await pullRecipeLines();
    await pullStoreProducts(active.storeId);
    await pullStoreRawMaterials(active.storeId);
    return active;
}

/**
 * Push stock this store changed back to its own rows.
 *
 * Reads the `store_stock_dirty` marker rather than `needs_push`: catalogue
 * edits belong to the tenant product, stock belongs to the store row, and
 * sending both to the same place is exactly what let one store's sale draw
 * down another's inventory.
 *
 * The flag is cleared only after the server accepts the write, so a failed or
 * offline push simply retries on the next sync.
 */
export async function pushStoreStock(storeId: string): Promise<void> {
    const nowIso = new Date().toISOString();

    const dirtyProducts = await localDb.products
        .filter(p => p.store_stock_dirty === true && !p.deleted_at)
        .toArray();
    if (dirtyProducts.length > 0) {
        const payload = dirtyProducts.map(p => ({
            store_id: storeId,
            product_id: p.id,
            is_available: p.is_active !== false,
            // Price stays the store row's business; null means "inherit".
            price: null,
            stock: p.stock,
            min_stock: p.min_stock ?? 0,
            track_stock: p.track_stock !== false,
            updated_at: nowIso,
        }));
        const { error } = await supabase.rpc('upsert_store_products', { rows_data: payload });
        if (error) {
            console.warn('storeScopedSync: store product stock push failed —', error.message);
        } else {
            await localDb.transaction('rw', localDb.products, async () => {
                for (const p of dirtyProducts) {
                    await localDb.products.update(p.id, { store_stock_dirty: false } as never);
                }
            });
        }
    }

    const dirtyMaterials = await localDb.rawMaterials
        .filter(m => m.store_stock_dirty === true)
        .toArray();
    if (dirtyMaterials.length > 0) {
        const payload = dirtyMaterials.map(m => ({
            store_id: storeId,
            raw_material_id: m.id,
            stock: m.stock,
            min_stock: m.min_stock ?? 0,
            updated_at: nowIso,
        }));
        const { error } = await supabase.rpc('upsert_store_raw_materials', { rows_data: payload });
        if (error) {
            console.warn('storeScopedSync: store raw-material stock push failed —', error.message);
        } else {
            await localDb.transaction('rw', localDb.rawMaterials, async () => {
                for (const m of dirtyMaterials) {
                    await localDb.rawMaterials.update(m.id, { store_stock_dirty: false });
                }
            });
        }
    }
}
