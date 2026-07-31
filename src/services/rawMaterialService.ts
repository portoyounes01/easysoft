import i18n from '../i18n';
import { initializeLocalDatabase, localDb } from '../lib/localDatabase';
import type { LocalRawMaterial, RawMaterialUnit } from '../types/rawMaterial';
import { generateUUID } from '../utils/uuid';
import { recipeService } from './recipeService';
import { categoryService, DEFAULT_GENERAL_CATEGORY_ID, productService } from './productService';

export interface RawMaterialInput {
    name: string;
    unit: RawMaterialUnit;
    stock: number;
    cost: number;
    min_stock: number;
    supplier: string | null;
    is_active: boolean;
    description?: string | null;
    image_url?: string | null;
    image_name?: string | null;
    image_size?: number | null;
    sell_enabled?: boolean;
    sale_price?: number | null;
    sale_iva_rate?: number | null;
    sale_category_id?: string | null;
}

/** Units where the POS sells by weight: price and cart quantity are per kg. */
function isWeightUnit(unit: RawMaterialUnit): boolean {
    return unit === 'kg' || unit === 'g';
}

/** Raw units consumed per product unit sold (product unit is kg for weight items). */
function recipeQtyPerUnit(unit: RawMaterialUnit): number {
    return unit === 'g' ? 1000 : 1;
}

class RawMaterialService {
    async list(includeInactive = false): Promise<LocalRawMaterial[]> {
        await initializeLocalDatabase();
        const all = await localDb.rawMaterials.toArray();
        const filtered = includeInactive ? all : all.filter(item => item.is_active);
        return filtered.sort((a, b) => a.name.localeCompare(b.name));
    }

    async getById(id: string): Promise<LocalRawMaterial | undefined> {
        await initializeLocalDatabase();
        return localDb.rawMaterials.get(id);
    }

    /** Product ids of all auto-managed linked products (for catalog filtering). */
    async linkedProductIds(): Promise<Set<string>> {
        await initializeLocalDatabase();
        const all = await localDb.rawMaterials.toArray();
        return new Set(all.map(m => m.linked_product_id).filter((id): id is string => !!id));
    }

    async create(input: RawMaterialInput): Promise<LocalRawMaterial> {
        await initializeLocalDatabase();
        const now = new Date();
        const material: LocalRawMaterial = {
            id: generateUUID(),
            name: input.name.trim(),
            unit: input.unit,
            stock: input.stock,
            cost: input.cost,
            min_stock: input.min_stock,
            supplier: input.supplier?.trim() || null,
            is_active: input.is_active,
            description: input.description?.trim() || null,
            image_url: input.image_url ?? null,
            image_name: input.image_name ?? null,
            image_size: input.image_size ?? null,
            sell_enabled: input.sell_enabled ?? false,
            sale_price: input.sale_price ?? null,
            sale_iva_rate: input.sale_iva_rate ?? null,
            sale_category_id: input.sale_category_id ?? null,
            linked_product_id: null,
            created_at: now,
            updated_at: now,
        };
        await localDb.rawMaterials.add(material);
        const linkedId = await this.syncLinkedProduct(material);
        if (linkedId !== null) {
            await localDb.rawMaterials.update(material.id, { linked_product_id: linkedId });
            material.linked_product_id = linkedId;
        }
        return material;
    }

    async update(id: string, patch: Partial<RawMaterialInput>): Promise<void> {
        await initializeLocalDatabase();
        await localDb.rawMaterials.update(id, {
            ...patch,
            ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
            ...(patch.supplier !== undefined ? { supplier: patch.supplier?.trim() || null } : {}),
            ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
            updated_at: new Date(),
        });
        // A changed unit cost flows to future sales of any dish using this item.
        if (patch.cost !== undefined) {
            await recipeService.syncDishesUsingMaterial(id);
        }
        const material = await localDb.rawMaterials.get(id);
        if (material) {
            const linkedId = await this.syncLinkedProduct(material);
            if ((material.linked_product_id ?? null) !== linkedId) {
                await localDb.rawMaterials.update(id, { linked_product_id: linkedId });
            }
        }
    }

    /** Set the on-hand quantity to an absolute value (manual stock-take). */
    async setStock(id: string, stock: number): Promise<void> {
        await initializeLocalDatabase();
        await localDb.rawMaterials.update(id, { stock: Math.max(0, stock), updated_at: new Date() });
    }

    /** Apply a signed delta to the on-hand quantity (+ receive / − consume), never below zero. */
    async adjustStock(id: string, delta: number): Promise<number> {
        await initializeLocalDatabase();
        return localDb.transaction('rw', localDb.rawMaterials, async () => {
            const material = await localDb.rawMaterials.get(id);
            if (!material) throw new Error(i18n.t('inventory.rawMaterialNotFound'));
            const next = Math.max(0, material.stock + delta);
            await localDb.rawMaterials.update(id, { stock: next, updated_at: new Date() });
            return next;
        });
    }

    /** Soft delete: mark inactive so existing recipe references stay resolvable. */
    async deactivate(id: string): Promise<void> {
        await initializeLocalDatabase();
        await localDb.rawMaterials.update(id, { is_active: false, updated_at: new Date() });
    }

    /**
     * Hard delete. The item's own linked product (and its 1:1 recipe line) is
     * removed first; deletion is then refused while OTHER dishes still
     * reference the material (throws 'RAW_MATERIAL_IN_USE').
     */
    async remove(id: string): Promise<void> {
        await initializeLocalDatabase();
        const material = await localDb.rawMaterials.get(id);
        if (material?.linked_product_id) {
            await this.removeLinkedProduct(material.linked_product_id);
            await localDb.rawMaterials.update(id, { linked_product_id: null });
        }
        const refs = await localDb.recipeLines.where('raw_material_id').equals(id).count();
        if (refs > 0) throw new Error('RAW_MATERIAL_IN_USE');
        await localDb.rawMaterials.delete(id);
    }

    /**
     * Keep the auto-managed catalogue product in step with the material:
     * created when selling is enabled (with a 1:1 recipe line so checkout's
     * recipe deduction consumes raw stock), field-synced on edits, and removed
     * when selling is disabled. Returns the linked product id, or null.
     */
    private async syncLinkedProduct(material: LocalRawMaterial): Promise<string | null> {
        const sellable = material.sell_enabled === true && (material.sale_price ?? 0) > 0;
        const existingId = material.linked_product_id ?? null;

        if (!sellable) {
            if (existingId) await this.removeLinkedProduct(existingId);
            return null;
        }

        const soldByWeight = isWeightUnit(material.unit);
        const categoryId = await this.resolveSaleCategory(material.sale_category_id ?? null);
        const category = categoryId ? await localDb.categories.get(categoryId) : undefined;
        const syncedFields = {
            name: material.name,
            description: material.description ?? null,
            price: material.sale_price as number,
            iva_rate: material.sale_iva_rate ?? 0.23,
            image_url: material.image_url ?? null,
            sold_by_weight: soldByWeight,
            is_active: material.is_active,
            supplier: material.supplier,
            category_id: categoryId,
            category_name: category?.name ?? null,
        };

        let productId = existingId;
        const existing = productId ? await productService.getProductById(productId) : undefined;
        if (existing) {
            await productService.updateProduct(productId as string, syncedFields);
        } else {
            productId = await productService.createProduct({
                ...syncedFields,
                sku: `INV-${material.id.slice(0, 8).toUpperCase()}`,
                barcode: null,
                cost: 0,
                stock: 0,
                min_stock: 0,
                // Raw-material stock is the source of truth: checkout deducts it
                // through the recipe line, so the product itself tracks nothing.
                track_stock: false,
                location: null,
                display_order: 9999,
                deleted_at: null,
            });
        }
        await recipeService.upsertLine(productId as string, material.id, recipeQtyPerUnit(material.unit));
        await recipeService.syncProductCost(productId as string);
        return productId;
    }

    /**
     * Explicit choice wins; otherwise fall back to the "Geral" default
     * category (created when the catalog is empty), then any active category.
     */
    private async resolveSaleCategory(saleCategoryId: string | null): Promise<string | null> {
        if (saleCategoryId) {
            const chosen = await localDb.categories.get(saleCategoryId);
            if (chosen && chosen.deleted_at === null) return saleCategoryId;
        }
        const general = await localDb.categories.get(DEFAULT_GENERAL_CATEGORY_ID);
        if (general && general.deleted_at === null) return DEFAULT_GENERAL_CATEGORY_ID;
        await categoryService.ensureDefaultGeneralCategory();
        const ensured = await localDb.categories.get(DEFAULT_GENERAL_CATEGORY_ID);
        if (ensured && ensured.deleted_at === null) return DEFAULT_GENERAL_CATEGORY_ID;
        const firstActive = await localDb.categories.filter(c => c.deleted_at === null).first();
        return firstActive?.id ?? null;
    }

    private async removeLinkedProduct(productId: string): Promise<void> {
        const lines = await localDb.recipeLines.where('product_id').equals(productId).toArray();
        for (const line of lines) {
            await recipeService.removeLine(line.id);
        }
        await productService.deleteProduct(productId);
    }
}

export const rawMaterialService = new RawMaterialService();
