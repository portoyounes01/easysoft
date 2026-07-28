// Raw materials (ingredients) and the recipe / fiche technique that links a
// sellable catalogue product to the raw items it consumes per unit sold.
//
// Raw materials are deliberately kept separate from catalogue `products`: they
// are stocked and costed but never sold directly, so they must not appear in the
// POS grid or in sales. They are local-only (Dexie) for now — no Supabase sync.

export type RawMaterialUnit = 'pcs' | 'unit' | 'kg' | 'g' | 'L' | 'mL';

export const RAW_MATERIAL_UNITS: { value: RawMaterialUnit; label: string }[] = [
    { value: 'pcs', label: 'pcs' },
    { value: 'unit', label: 'unit' },
    { value: 'kg', label: 'kg' },
    { value: 'g', label: 'g' },
    { value: 'L', label: 'L' },
    { value: 'mL', label: 'mL' },
];

export interface LocalRawMaterial {
    id: string;
    name: string;
    unit: RawMaterialUnit;
    /** Current quantity on hand, expressed in `unit`. */
    stock: number;
    /** Cost per `unit`. */
    cost: number;
    /** Low-stock threshold; surfaced as a warning on the inventory page. */
    min_stock: number;
    /** See LocalProduct.store_stock_dirty — this store's stock owes a push. */
    store_stock_dirty?: boolean;
    supplier: string | null;
    is_active: boolean;
    // Optional because rows created before these fields existed return
    // `undefined` from Dexie (non-indexed fields need no schema migration).
    description?: string | null;
    /** Data URL (local upload, downscaled) or a remote image URL. */
    image_url?: string | null;
    image_name?: string | null;
    /** Original file size in bytes, for redisplay in the form. */
    image_size?: number | null;
    /** Expose this item as a sellable product in the POS grid (POS only —
     *  the linked product is filtered out of the Products page catalog). */
    sell_enabled?: boolean;
    /** Selling price incl. IVA; €/kg for weight units (kg, g). */
    sale_price?: number | null;
    sale_iva_rate?: number | null;
    /** Category for the linked product; null → the "Geral" default category. */
    sale_category_id?: string | null;
    /** The auto-managed catalogue product this item sells through. */
    linked_product_id?: string | null;
    created_at: Date;
    updated_at: Date;
}

/**
 * One ingredient line of a product's recipe: how much of a raw material is
 * consumed for each unit of the product sold (e.g. 0.03 kg of tomato per burger).
 */
export interface LocalRecipeLine {
    id: string;
    product_id: string;
    raw_material_id: string;
    quantity_per_unit: number;
    created_at: Date;
    updated_at: Date;
}

/** A recipe line joined with its raw material, for display. */
export interface RecipeLineWithMaterial extends LocalRecipeLine {
    material: LocalRawMaterial | undefined;
}
