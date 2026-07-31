// Seeds one ready-made restaurant catalogue into the local database.
//
// Writes five things: categories, products (carrying their variant groups and
// modifiers inline), raw materials, and the recipe lines that link a dish to
// the ingredients it consumes. Categories and products are queued for Supabase
// sync the same way the YAML seeder queues them; raw materials and recipe lines
// are local-only by design (see src/types/rawMaterial.ts).
//
// Re-running is safe: every row id is derived from the dataset id plus a stable
// key, so a second run updates the same rows instead of duplicating the menu.

import { initializeLocalDatabase, localDb } from '../lib/localDatabase';
import type { CategoryInsert, LocalCategory, LocalProduct, ProductInsert } from '../types/supabase';
import type { LocalRawMaterial, LocalRecipeLine } from '../types/rawMaterial';
import { generateUUID } from './uuid';
import { recipeService } from '../services/recipeService';
import type { RestaurantSeedDataset } from './restaurantSeedDataset';

export interface RestaurantSeedResult {
    success: boolean;
    message: string;
    datasetName: string;
    categoriesCount: number;
    productsCount: number;
    rawMaterialsCount: number;
    recipeLinesCount: number;
    variantOptionsCount: number;
    modifiersCount: number;
    /** Ingredient keys a recipe referenced but the dataset never declared. */
    unknownMaterials: string[];
}

/**
 * A stable UUID for a dataset row. The same (dataset, kind, key) always maps to
 * the same id, which is what makes re-seeding idempotent and lets recipe lines
 * point at products and materials without threading real ids around.
 */
function datasetUuid(datasetId: string, kind: string, key: string): string {
    const seed = `${datasetId}:${kind}:${key}`;

    // FNV-1a, run four times with different offsets to fill 128 bits.
    const word = (offset: number): string => {
        let hash = offset >>> 0;
        for (let i = 0; i < seed.length; i++) {
            hash ^= seed.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        return hash.toString(16).padStart(8, '0');
    };

    const a = word(0x811c9dc5);
    const b = word(0x01234567);
    const c = word(0x89abcdef);
    const d = word(0xfedcba98);

    // Stamp version 4 and the RFC 4122 variant so the id passes UUID validation.
    const timeHiAndVersion = `4${b.slice(1, 4)}`;
    const clockSeq = `${((parseInt(c[0], 16) & 0x3) | 0x8).toString(16)}${c.slice(1, 4)}`;
    return `${a}-${b.slice(4, 8)}-${timeHiAndVersion}-${clockSeq}-${c.slice(4, 8)}${d}`;
}

/** Seed every collection of `dataset` into the local database. */
export async function seedRestaurantDataset(
    dataset: RestaurantSeedDataset
): Promise<RestaurantSeedResult> {
    await initializeLocalDatabase();

    const now = new Date();
    const categoryId = (key: string) => datasetUuid(dataset.id, 'category', key);
    const productId = (key: string) => datasetUuid(dataset.id, 'product', key);
    const materialId = (key: string) => datasetUuid(dataset.id, 'material', key);

    // --- Categories -------------------------------------------------------
    const categories: LocalCategory[] = dataset.categories.map(spec => ({
        id: categoryId(spec.key),
        name: spec.name,
        description: spec.description,
        color: spec.color,
        icon: spec.icon,
        display_order: spec.display_order,
        is_active: true,
        created_at: now,
        updated_at: now,
        last_synced_at: null,
        deleted_at: null,
        needs_push: true,
        is_conflicted: false,
    }));

    await localDb.transaction('rw', [localDb.categories, localDb.categorySyncQueue], async () => {
        for (const category of categories) {
            const existing = await localDb.categories.get(category.id);
            await localDb.categories.put(
                existing ? { ...category, created_at: existing.created_at } : category
            );
            await localDb.categorySyncQueue.add({
                id: generateUUID(),
                type: existing ? 'UPDATE' : 'CREATE',
                categoryId: category.id,
                // The queue stores the local row, the way productService does; its
                // declared Insert/Update type is narrower than what sync reads back.
                data: category as unknown as CategoryInsert,
                timestamp: now.toISOString(),
                retryCount: 0,
            });
        }
    });

    // --- Raw materials ----------------------------------------------------
    const materials: LocalRawMaterial[] = dataset.rawMaterials.map(spec => ({
        id: materialId(spec.key),
        name: spec.name,
        unit: spec.unit,
        stock: spec.stock,
        cost: spec.cost,
        min_stock: spec.min_stock,
        supplier: spec.supplier,
        is_active: true,
        description: spec.description ?? null,
        image_url: null,
        image_name: null,
        image_size: null,
        sell_enabled: false,
        sale_price: null,
        sale_iva_rate: null,
        sale_category_id: null,
        linked_product_id: null,
        created_at: now,
        updated_at: now,
    }));

    await localDb.transaction('rw', [localDb.rawMaterials], async () => {
        for (const material of materials) {
            const existing = await localDb.rawMaterials.get(material.id);
            await localDb.rawMaterials.put(
                existing
                    ? {
                        ...material,
                        created_at: existing.created_at,
                        // Never clobber a material that was wired up to sell in the POS.
                        sell_enabled: existing.sell_enabled,
                        sale_price: existing.sale_price,
                        sale_iva_rate: existing.sale_iva_rate,
                        sale_category_id: existing.sale_category_id,
                        linked_product_id: existing.linked_product_id,
                    }
                    : material
            );
        }
    });

    // --- Products ---------------------------------------------------------
    const categoryNameByKey = new Map(dataset.categories.map(c => [c.key, c.name]));
    let variantOptionsCount = 0;
    let modifiersCount = 0;

    const products: LocalProduct[] = dataset.products.map(spec => {
        variantOptionsCount += (spec.variants ?? []).reduce((sum, v) => sum + v.options.length, 0);
        modifiersCount += (spec.modifiers ?? []).length;

        return {
            id: productId(spec.key),
            name: spec.name,
            description: spec.description,
            sku: spec.sku,
            barcode: null,
            category_id: categoryId(spec.category),
            category_name: categoryNameByKey.get(spec.category) ?? null,
            price: spec.price,
            // Recipe-backed dishes are re-costed from their ingredients below.
            cost: spec.cost ?? 0,
            iva_rate: spec.iva_rate,
            stock: spec.stock,
            min_stock: spec.min_stock,
            track_stock: spec.track_stock,
            sold_by_weight: false,
            image_url: spec.image_url ?? null,
            supplier: null,
            location: null,
            is_active: true,
            display_order: spec.display_order,
            takeaway_price: null,
            variants: spec.variants ?? null,
            modifiers: spec.modifiers ?? null,
            created_at: now,
            updated_at: now,
            last_synced_at: null,
            deleted_at: null,
            needs_push: true,
            is_conflicted: false,
        };
    });

    await localDb.transaction('rw', [localDb.products, localDb.productSyncQueue], async () => {
        for (const product of products) {
            const existing = await localDb.products.get(product.id);
            await localDb.products.put(
                existing ? { ...product, created_at: existing.created_at } : product
            );
            await localDb.productSyncQueue.add({
                id: generateUUID(),
                type: existing ? 'UPDATE' : 'CREATE',
                productId: product.id,
                data: product as unknown as ProductInsert,
                timestamp: now.toISOString(),
                retryCount: 0,
            });
        }
    });

    // --- Recipe lines -----------------------------------------------------
    const knownMaterialKeys = new Set(dataset.rawMaterials.map(m => m.key));
    const unknownMaterials = new Set<string>();
    const recipeLines: LocalRecipeLine[] = [];

    for (const spec of dataset.products) {
        for (const line of spec.recipe ?? []) {
            if (!knownMaterialKeys.has(line.material)) {
                unknownMaterials.add(line.material);
                continue;
            }
            recipeLines.push({
                id: datasetUuid(dataset.id, 'recipe', `${spec.key}:${line.material}`),
                product_id: productId(spec.key),
                raw_material_id: materialId(line.material),
                quantity_per_unit: line.quantity_per_unit,
                created_at: now,
                updated_at: now,
            });
        }
    }

    await localDb.transaction('rw', [localDb.recipeLines], async () => {
        for (const line of recipeLines) {
            const existing = await localDb.recipeLines.get(line.id);
            await localDb.recipeLines.put(
                existing ? { ...line, created_at: existing.created_at } : line
            );
        }
    });

    // Cost every recipe-backed dish from its ingredients, so the seeded cost and
    // the recipe can never disagree. Products without a recipe keep their own cost.
    const productIdsWithRecipe = [...new Set(recipeLines.map(line => line.product_id))];
    for (const id of productIdsWithRecipe) {
        await recipeService.syncProductCost(id);
    }

    return {
        success: true,
        message: `Seeded ${dataset.name}`,
        datasetName: dataset.name,
        categoriesCount: categories.length,
        productsCount: products.length,
        rawMaterialsCount: materials.length,
        recipeLinesCount: recipeLines.length,
        variantOptionsCount,
        modifiersCount,
        unknownMaterials: [...unknownMaterials],
    };
}
