import { initializeLocalDatabase, localDb } from '../lib/localDatabase';
import type { LocalRawMaterial, RawMaterialUnit } from '../types/rawMaterial';
import { generateUUID } from '../utils/uuid';
import { recipeService } from './recipeService';

export interface RawMaterialInput {
    name: string;
    unit: RawMaterialUnit;
    stock: number;
    cost: number;
    min_stock: number;
    supplier: string | null;
    is_active: boolean;
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
            created_at: now,
            updated_at: now,
        };
        await localDb.rawMaterials.add(material);
        return material;
    }

    async update(id: string, patch: Partial<RawMaterialInput>): Promise<void> {
        await initializeLocalDatabase();
        await localDb.rawMaterials.update(id, {
            ...patch,
            ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
            ...(patch.supplier !== undefined ? { supplier: patch.supplier?.trim() || null } : {}),
            updated_at: new Date(),
        });
        // A changed unit cost flows to future sales of any dish using this item.
        if (patch.cost !== undefined) {
            await recipeService.syncDishesUsingMaterial(id);
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
            if (!material) throw new Error('Raw material not found.');
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
}

export const rawMaterialService = new RawMaterialService();
