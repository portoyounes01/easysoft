import { initializeLocalDatabase, localDb } from '../lib/localDatabase';
import type { LocalRecipeLine, RecipeLineWithMaterial } from '../types/rawMaterial';
import { generateUUID } from '../utils/uuid';

class RecipeService {
    /** All recipe lines for a product, joined with their raw material (name/unit/stock). */
    async getForProduct(productId: string): Promise<RecipeLineWithMaterial[]> {
        await initializeLocalDatabase();
        const lines = await localDb.recipeLines.where('product_id').equals(productId).toArray();
        const materials = await Promise.all(lines.map(line => localDb.rawMaterials.get(line.raw_material_id)));
        return lines
            .map((line, index) => ({ ...line, material: materials[index] }))
            .sort((a, b) => (a.material?.name ?? '').localeCompare(b.material?.name ?? ''));
    }

    /** True if the product has at least one ingredient line. */
    async hasRecipe(productId: string): Promise<boolean> {
        await initializeLocalDatabase();
        return (await localDb.recipeLines.where('product_id').equals(productId).count()) > 0;
    }

    /**
     * Set of product ids that have a recipe. The POS uses this to keep recipe
     * dishes sellable regardless of their own (meaningless) product stock —
     * availability is governed by ingredients, which deduct and clamp at zero.
     */
    async getProductIdsWithRecipe(): Promise<Set<string>> {
        await initializeLocalDatabase();
        const lines = await localDb.recipeLines.toArray();
        return new Set(lines.map(line => line.product_id));
    }

    /**
     * Add or update the ingredient line for (product, raw material). Quantity is
     * per single unit of the product. A non-positive quantity removes the line.
     */
    async upsertLine(productId: string, rawMaterialId: string, quantityPerUnit: number): Promise<void> {
        await initializeLocalDatabase();
        const existing = await localDb.recipeLines
            .where('[product_id+raw_material_id]')
            .equals([productId, rawMaterialId])
            .first();

        if (quantityPerUnit <= 0) {
            if (existing) await localDb.recipeLines.delete(existing.id);
            return;
        }

        const now = new Date();
        if (existing) {
            await localDb.recipeLines.update(existing.id, { quantity_per_unit: quantityPerUnit, updated_at: now });
        } else {
            const line: LocalRecipeLine = {
                id: generateUUID(),
                product_id: productId,
                raw_material_id: rawMaterialId,
                quantity_per_unit: quantityPerUnit,
                created_at: now,
                updated_at: now,
            };
            await localDb.recipeLines.add(line);
        }
        await this.syncProductCost(productId);
    }

    async removeLine(lineId: string): Promise<void> {
        await initializeLocalDatabase();
        const line = await localDb.recipeLines.get(lineId);
        await localDb.recipeLines.delete(lineId);
        if (line) await this.syncProductCost(line.product_id);
    }

    /**
     * Keep a recipe product's `cost` equal to the sum of its ingredient costs
     * (qty/unit × raw-material cost), so sale-time profit reflects real food cost.
     * Products without a recipe are left untouched (their cost is entered by hand).
     */
    async syncProductCost(productId: string): Promise<void> {
        await initializeLocalDatabase();
        const lines = await localDb.recipeLines.where('product_id').equals(productId).toArray();
        if (lines.length === 0) return;
        const materials = await Promise.all(lines.map(line => localDb.rawMaterials.get(line.raw_material_id)));
        const cost = lines.reduce(
            (sum, line, index) => sum + line.quantity_per_unit * (materials[index]?.cost ?? 0),
            0
        );
        await localDb.products.update(productId, { cost: Number(cost.toFixed(4)) });
    }

    /**
     * Refresh the cost of every dish that uses a given raw material — called when
     * that material's cost changes (new delivery price, manual edit). Only future
     * sales are affected; past sales keep their stored profit.
     */
    async syncDishesUsingMaterial(rawMaterialId: string): Promise<void> {
        await initializeLocalDatabase();
        const lines = await localDb.recipeLines.where('raw_material_id').equals(rawMaterialId).toArray();
        const productIds = [...new Set(lines.map(line => line.product_id))];
        for (const productId of productIds) {
            await this.syncProductCost(productId);
        }
    }

    /**
     * Deduct raw-material stock for a set of sold lines according to each
     * product's recipe. Deductions are aggregated per raw material (so products
     * sharing an ingredient combine) and applied in one transaction. Products
     * without a recipe are simply ignored here — their own product stock is
     * handled by the existing `updateProductStock` path.
     */
    async deductForSoldItems(items: Array<{ product_id: string; quantity: number }>): Promise<void> {
        await initializeLocalDatabase();
        if (items.length === 0) return;

        // Sum sold quantity per product (an item can appear once, but be safe).
        const soldByProduct = new Map<string, number>();
        for (const item of items) {
            soldByProduct.set(item.product_id, (soldByProduct.get(item.product_id) ?? 0) + item.quantity);
        }

        const deductByMaterial = new Map<string, number>();
        for (const [productId, soldQty] of soldByProduct) {
            const lines = await localDb.recipeLines.where('product_id').equals(productId).toArray();
            for (const line of lines) {
                const amount = line.quantity_per_unit * soldQty;
                deductByMaterial.set(
                    line.raw_material_id,
                    (deductByMaterial.get(line.raw_material_id) ?? 0) + amount
                );
            }
        }

        if (deductByMaterial.size === 0) return;

        await localDb.transaction('rw', localDb.rawMaterials, async () => {
            for (const [materialId, amount] of deductByMaterial) {
                const material = await localDb.rawMaterials.get(materialId);
                if (!material) continue;
                await localDb.rawMaterials.update(materialId, {
                    stock: Math.max(0, material.stock - amount),
                    updated_at: new Date(),
                });
            }
        });
    }
}

export const recipeService = new RecipeService();
