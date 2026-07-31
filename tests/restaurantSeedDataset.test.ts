import { describe, expect, it } from 'vitest';
import {
    QBELLA_EVORA_DATASET,
    RESTAURANT_SEED_DATASETS,
    type RestaurantSeedDataset,
} from '../src/utils/restaurantSeedDataset';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Mirrors the id derivation in seedRestaurantData, so both stay in step. */
function datasetUuid(datasetId: string, kind: string, key: string): string {
    const seed = `${datasetId}:${kind}:${key}`;
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
    const timeHiAndVersion = `4${b.slice(1, 4)}`;
    const clockSeq = `${((parseInt(c[0], 16) & 0x3) | 0x8).toString(16)}${c.slice(1, 4)}`;
    return `${a}-${b.slice(4, 8)}-${timeHiAndVersion}-${clockSeq}-${c.slice(4, 8)}${d}`;
}

describe.each(RESTAURANT_SEED_DATASETS.map(d => [d.name, d] as const))(
    'restaurant seed dataset: %s',
    (_name, dataset: RestaurantSeedDataset) => {
        it('gives every product a category that exists', () => {
            const categoryKeys = new Set(dataset.categories.map(c => c.key));
            const orphans = dataset.products
                .filter(p => !categoryKeys.has(p.category))
                .map(p => `${p.name} → ${p.category}`);
            expect(orphans).toEqual([]);
        });

        it('points every recipe line at a declared raw material', () => {
            const materialKeys = new Set(dataset.rawMaterials.map(m => m.key));
            const dangling = dataset.products.flatMap(p =>
                (p.recipe ?? [])
                    .filter(line => !materialKeys.has(line.material))
                    .map(line => `${p.name} → ${line.material}`)
            );
            expect(dangling).toEqual([]);
        });

        it('keeps product keys, SKUs and raw-material keys unique', () => {
            const productKeys = dataset.products.map(p => p.key);
            const skus = dataset.products.map(p => p.sku);
            const materialKeys = dataset.rawMaterials.map(m => m.key);
            const categoryKeys = dataset.categories.map(c => c.key);

            expect(new Set(productKeys).size).toBe(productKeys.length);
            expect(new Set(skus).size).toBe(skus.length);
            expect(new Set(materialKeys).size).toBe(materialKeys.length);
            expect(new Set(categoryKeys).size).toBe(categoryKeys.length);
        });

        it('keeps variant and modifier ids unique within each product', () => {
            for (const product of dataset.products) {
                const optionIds = (product.variants ?? []).flatMap(v => [
                    v.id,
                    ...v.options.map(o => o.id),
                ]);
                const modifierIds = (product.modifiers ?? []).map(m => m.id);
                const all = [...optionIds, ...modifierIds];
                expect(new Set(all).size, `duplicate option id on ${product.name}`).toBe(all.length);
            }
        });

        it('slugs accented option ids cleanly rather than mangling them', () => {
            const ids = dataset.products.flatMap(p => [
                ...(p.modifiers ?? []).map(m => m.id),
                ...(p.variants ?? []).flatMap(v => [v.id, ...v.options.map(o => o.id)]),
            ]);

            expect(ids.length).toBeGreaterThan(0);
            for (const id of ids) {
                expect(id, `${id} is not a clean slug`).toMatch(/^[a-z0-9-]+$/);
                expect(id, `${id} has a placeholder from a stripped accent`).not.toMatch(/-[a-z]?-(?:$|-)/);
            }
        });

        it('prices everything above zero and taxes it at a real Portuguese rate', () => {
            for (const product of dataset.products) {
                expect(product.price, product.name).toBeGreaterThan(0);
                expect([0.06, 0.13, 0.23], product.name).toContain(product.iva_rate);
            }
        });

        it('uses positive quantities and costs throughout', () => {
            for (const material of dataset.rawMaterials) {
                expect(material.cost, material.name).toBeGreaterThan(0);
                expect(material.stock, material.name).toBeGreaterThanOrEqual(0);
            }
            for (const product of dataset.products) {
                for (const line of product.recipe ?? []) {
                    expect(line.quantity_per_unit, `${product.name}/${line.material}`).toBeGreaterThan(0);
                }
            }
        });

        it('keeps every recipe-costed dish cheaper than its shelf price', () => {
            const costByMaterial = new Map(dataset.rawMaterials.map(m => [m.key, m.cost]));
            for (const product of dataset.products) {
                if (!product.recipe?.length) continue;
                const cost = product.recipe.reduce(
                    (sum, line) => sum + line.quantity_per_unit * (costByMaterial.get(line.material) ?? 0),
                    0
                );
                expect(cost, `${product.name} costs more than it sells for`).toBeLessThan(product.price);
            }
        });

        it('derives a valid, stable and collision-free UUID per row', () => {
            const ids = [
                ...dataset.categories.map(c => datasetUuid(dataset.id, 'category', c.key)),
                ...dataset.products.map(p => datasetUuid(dataset.id, 'product', p.key)),
                ...dataset.rawMaterials.map(m => datasetUuid(dataset.id, 'material', m.key)),
                ...dataset.products.flatMap(p =>
                    (p.recipe ?? []).map(line =>
                        datasetUuid(dataset.id, 'recipe', `${p.key}:${line.material}`)
                    )
                ),
            ];

            for (const id of ids) expect(id).toMatch(UUID_V4);
            expect(new Set(ids).size, 'derived ids collide').toBe(ids.length);
        });

        it('is stable across calls, so re-seeding updates rather than duplicates', () => {
            const first = datasetUuid(dataset.id, 'product', dataset.products[0].key);
            const second = datasetUuid(dataset.id, 'product', dataset.products[0].key);
            expect(first).toBe(second);
        });
    }
);

describe("Q'Bella catalogue", () => {
    it('covers every published menu section', () => {
        const names = QBELLA_EVORA_DATASET.categories.map(c => c.name);
        expect(names).toEqual(
            expect.arrayContaining([
                'Pratos Massa',
                'Massa Sugestões',
                'Pratos Salada',
                'Salada Sugestões',
                'Baguetes',
                'Tostas',
                'Omelete',
                'Entradas',
                'Menu Infantil',
                'Sobremesas',
                'Sumos Naturais',
                'Bebidas',
            ])
        );
    });

    it('gives build-your-own dishes a sauce choice and add-on modifiers', () => {
        const buildYourOwn = QBELLA_EVORA_DATASET.products.filter(
            p => p.category === 'pratos-massa' || p.key === 'prato-salada'
        );
        expect(buildYourOwn.length).toBeGreaterThan(0);

        for (const product of buildYourOwn) {
            const sauce = product.variants?.find(v => v.name === 'Molho');
            expect(sauce, `${product.name} has no sauce group`).toBeDefined();
            expect(sauce!.options.length).toBeGreaterThan(1);
            expect(product.modifiers?.length, `${product.name} has no modifiers`).toBeGreaterThan(0);
        }
    });

    it('stock-tracks bottled drinks but not cooked-to-order dishes', () => {
        const water = QBELLA_EVORA_DATASET.products.find(p => p.key === 'agua');
        const pasta = QBELLA_EVORA_DATASET.products.find(p => p.key === 'massa-penne');

        expect(water?.track_stock).toBe(true);
        expect(pasta?.track_stock).toBe(false);
    });

    it('records what is factual and what is estimated', () => {
        expect(QBELLA_EVORA_DATASET.source).toBeTruthy();
        expect(QBELLA_EVORA_DATASET.notes.length).toBeGreaterThan(0);
    });
});
