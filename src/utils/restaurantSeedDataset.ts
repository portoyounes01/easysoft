// Ready-made restaurant seed datasets.
//
// A dataset is a self-contained snapshot of one restaurant's catalogue: its
// categories, its sellable products (with their variant groups and add-on
// modifiers), the raw materials it stocks, and the recipe that ties a dish to
// the ingredients it consumes. `seedRestaurantData.ts` turns one of these into
// local database rows.
//
// Unlike the YAML seed files under `public/seed/`, these are typed and live in
// the bundle, because they carry four collections the YAML schema never had:
// raw materials, recipe lines, variants and modifiers.

import type { ProductModifier, ProductVariantAttribute } from '../types/supabase';
import type { RawMaterialUnit } from '../types/rawMaterial';

/** A category, keyed by a stable slug that products reference. */
export interface SeedCategorySpec {
    /** Stable slug — hashed into a deterministic UUID at seed time. */
    key: string;
    name: string;
    description: string;
    /** Tailwind gradient pair, as stored on the category row. */
    color: string;
    /** One of the icon names offered by CategoryForm. */
    icon: string;
    display_order: number;
}

/** A raw material (ingredient) held in inventory but never sold directly. */
export interface SeedRawMaterialSpec {
    key: string;
    name: string;
    unit: RawMaterialUnit;
    /** Quantity on hand, in `unit`. */
    stock: number;
    /** Cost per `unit`. */
    cost: number;
    min_stock: number;
    supplier: string | null;
    description?: string;
}

/** One ingredient line of a dish: how much of a raw material one serving eats. */
export interface SeedRecipeLineSpec {
    /** `key` of a raw material in the same dataset. */
    material: string;
    /** Quantity consumed per unit sold, in the material's own unit. */
    quantity_per_unit: number;
}

export interface SeedProductSpec {
    key: string;
    name: string;
    description: string;
    sku: string;
    /** `key` of a category in the same dataset. */
    category: string;
    /** Shelf price including IVA. */
    price: number;
    iva_rate: number;
    stock: number;
    min_stock: number;
    /** Dishes cooked to order are not stock-tracked; bottles and jars are. */
    track_stock: boolean;
    display_order: number;
    /**
     * Fallback cost per unit. Ignored for products that carry a recipe — those
     * are costed from their ingredient lines instead, so the two can never drift.
     */
    cost?: number;
    /** Product photo. Null when the source listing has none. */
    image_url?: string | null;
    variants?: ProductVariantAttribute[];
    modifiers?: ProductModifier[];
    recipe?: SeedRecipeLineSpec[];
}

/**
 * The operating company behind the catalogue, mapped onto `settings.company`.
 * Applied by the seed panel through `updateSettings` — the seeder itself only
 * writes local database rows and never touches settings.
 *
 * These are exactly the fields the company block already has. Registry details
 * with no field of their own (natureza jurídica, distrito, concelho,
 * freguesia) are recorded in `notes` instead of growing the settings shape —
 * distrito and concelho are both Évora here, which `city` already carries.
 */
export interface SeedCompanySpec {
    name: string;
    taxNumber: string;
    address: string;
    postalCode: string;
    city: string;
}

export interface RestaurantSeedDataset {
    /** Stable id, used to namespace every generated UUID. */
    id: string;
    /** Restaurant name, shown on the seed button. */
    name: string;
    /** Where the catalogue came from, so the numbers stay auditable. */
    source: string;
    /** Free-text notes about what is factual and what is an estimate. */
    notes: string[];
    /** Company registration details written into settings alongside the menu. */
    company?: SeedCompanySpec;
    categories: SeedCategorySpec[];
    rawMaterials: SeedRawMaterialSpec[];
    products: SeedProductSpec[];
}

// ---------------------------------------------------------------------------
// Q'Bella Massa, Salada e Baguetes — Évora Plaza
// ---------------------------------------------------------------------------
//
// Menu structure, item names and shelf prices are taken from the restaurant's
// public delivery listings (Bolt Food and Glovo, read 2026-07-27) and are
// reproduced as-is. Everything the delivery listings do not publish is derived
// and marked as such in `notes` below:
//
//   - Ingredient costs, stock levels and reorder thresholds are estimates.
//   - The selectable ingredient and sauce lists are not published per item; the
//     option groups here are built from the ingredients that actually appear
//     across the restaurant's own dishes.
//   - Descriptions are written for the till, not copied from the listings.

/** Sauce options — one sauce is included in the price of a build-your-own dish. */
function sauceChoice(idPrefix: string): ProductVariantAttribute {
    return {
        id: `${idPrefix}-sauce`,
        name: 'Molho',
        enabled: true,
        options: [
            { id: `${idPrefix}-sauce-pomodoro`, name: 'Pomodoro', price_delta: 0, enabled: true },
            { id: `${idPrefix}-sauce-carbonara`, name: 'Carbonara', price_delta: 0, enabled: true },
            { id: `${idPrefix}-sauce-4queijos`, name: '4 Queijos', price_delta: 0, enabled: true },
            { id: `${idPrefix}-sauce-alho`, name: 'Alho', price_delta: 0, enabled: true },
            { id: `${idPrefix}-sauce-cocktail`, name: 'Cocktail', price_delta: 0, enabled: true },
            { id: `${idPrefix}-sauce-iogurte`, name: 'Iogurte', price_delta: 0, enabled: true },
            { id: `${idPrefix}-sauce-verde`, name: 'Verde', price_delta: 0, enabled: true },
        ],
    };
}

/** Served hot or cold — the salad plate and the kids pasta both offer this. */
function temperatureChoice(idPrefix: string): ProductVariantAttribute {
    return {
        id: `${idPrefix}-temp`,
        name: 'Temperatura',
        enabled: true,
        options: [
            { id: `${idPrefix}-temp-quente`, name: 'Quente', price_delta: 0, enabled: true },
            { id: `${idPrefix}-temp-fria`, name: 'Fria', price_delta: 0, enabled: true },
        ],
    };
}

/**
 * Paid extras beyond the ingredients already included in the price. The
 * restaurant's own dishes price shellfish and cured meat above the vegetable
 * fillings, so the surcharges follow that ordering.
 */
function extraToppings(idPrefix: string): ProductModifier[] {
    return [
        { id: `${idPrefix}-extra-frango`, name: 'Extra frango', price_delta: 1.5, enabled: true },
        { id: `${idPrefix}-extra-atum`, name: 'Extra atum', price_delta: 1.5, enabled: true },
        { id: `${idPrefix}-extra-camarao`, name: 'Extra camarão', price_delta: 2.0, enabled: true },
        { id: `${idPrefix}-extra-bacon`, name: 'Extra bacon', price_delta: 1.2, enabled: true },
        { id: `${idPrefix}-extra-queijo`, name: 'Extra queijo', price_delta: 1.0, enabled: true },
        { id: `${idPrefix}-extra-ovo`, name: 'Extra ovo', price_delta: 0.8, enabled: true },
        { id: `${idPrefix}-extra-molho`, name: 'Molho adicional', price_delta: 0.6, enabled: true },
    ];
}

/** Accent-safe slug: 'Ananás' -> 'ananas', not 'anan-s'. */
function slug(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * The ingredients a build-your-own dish includes at no extra charge. How many
 * the customer may pick (5 on adult dishes, 3 on the kids menu) is printed on
 * the menu but cannot be enforced here — ProductModifier has no min/max — so
 * the pick limit stays a counter-side rule.
 */
function includedIngredients(idPrefix: string): ProductModifier[] {
    const names = [
        'Tomate cherry', 'Milho', 'Cenoura', 'Ovo', 'Azeitona',
        'Brócolos', 'Espinafres', 'Ervilha', 'Ananás', 'Cebola',
        'Queijo', 'Fiambre de aves', 'Salsicha', 'Delícias do mar', 'Cogumelos',
    ];
    return names.map(name => ({
        id: `${idPrefix}-inc-${slug(name)}`,
        name,
        price_delta: 0,
        enabled: true,
    }));
}

/** The two sides that come with the omelette plate. */
function sideDishes(idPrefix: string): ProductModifier[] {
    const names = ['Arroz', 'Batata frita', 'Batata palha', 'Salada', 'Legumes salteados'];
    return names.map(name => ({
        id: `${idPrefix}-side-${slug(name)}`,
        name: `Acompanhamento: ${name}`,
        price_delta: 0,
        enabled: true,
    }));
}

const QBELLA_CATEGORIES: SeedCategorySpec[] = [
    { key: 'pratos-massa', name: 'Pratos Massa', description: 'Massa montada ao gosto do cliente', color: 'from-amber-500 to-orange-600', icon: 'utensils', display_order: 1 },
    { key: 'massa-sugestoes', name: 'Massa Sugestões', description: 'Massas de receita fixa da casa', color: 'from-orange-500 to-red-600', icon: 'utensils', display_order: 2 },
    { key: 'pratos-salada', name: 'Pratos Salada', description: 'Salada montada ao gosto do cliente', color: 'from-lime-500 to-green-600', icon: 'package', display_order: 3 },
    { key: 'salada-sugestoes', name: 'Salada Sugestões', description: 'Saladas de receita fixa da casa', color: 'from-green-500 to-emerald-600', icon: 'package', display_order: 4 },
    { key: 'baguetes', name: 'Baguetes', description: 'Baguetes e pastas frias', color: 'from-yellow-500 to-amber-600', icon: 'package', display_order: 5 },
    { key: 'tostas', name: 'Tostas', description: 'Tostas quentes prensadas', color: 'from-orange-400 to-amber-600', icon: 'package', display_order: 6 },
    { key: 'omelete', name: 'Omelete', description: 'Prato de omelete com acompanhamentos', color: 'from-yellow-400 to-orange-500', icon: 'utensils', display_order: 7 },
    { key: 'entradas', name: 'Entradas', description: 'Sopa e entradas do dia', color: 'from-rose-400 to-red-500', icon: 'utensils', display_order: 8 },
    { key: 'menu-infantil', name: 'Menu Infantil', description: 'Doses infantis', color: 'from-sky-400 to-blue-500', icon: 'candy', display_order: 9 },
    { key: 'sobremesas', name: 'Sobremesas', description: 'Gelatinas e doces', color: 'from-pink-500 to-rose-600', icon: 'cake', display_order: 10 },
    { key: 'sumos-naturais', name: 'Sumos Naturais', description: 'Sumos preparados na hora', color: 'from-emerald-400 to-teal-600', icon: 'milk', display_order: 11 },
    { key: 'bebidas', name: 'Bebidas', description: 'Refrigerantes e água', color: 'from-blue-500 to-indigo-600', icon: 'coffee', display_order: 12 },
];

const QBELLA_RAW_MATERIALS: SeedRawMaterialSpec[] = [
    // --- Massas e bases ---
    { key: 'massa-tagliatelle', name: 'Massa Tagliatelle', unit: 'kg', stock: 12, cost: 2.4, min_stock: 3, supplier: 'Distribuidora Alentejo', description: 'Massa seca tagliatelle' },
    { key: 'massa-tagliatelle-verde', name: 'Massa Tagliatelle Verde', unit: 'kg', stock: 6, cost: 2.8, min_stock: 2, supplier: 'Distribuidora Alentejo', description: 'Massa seca com espinafre' },
    { key: 'massa-fusilli', name: 'Massa Fusilli Três Cores', unit: 'kg', stock: 8, cost: 2.6, min_stock: 2, supplier: 'Distribuidora Alentejo', description: 'Fusilli tricolor' },
    { key: 'massa-penne', name: 'Massa Penne', unit: 'kg', stock: 10, cost: 2.3, min_stock: 3, supplier: 'Distribuidora Alentejo', description: 'Massa seca penne' },
    { key: 'massa-esparguete', name: 'Massa Esparguete', unit: 'kg', stock: 10, cost: 2.2, min_stock: 3, supplier: 'Distribuidora Alentejo', description: 'Massa seca esparguete' },
    { key: 'massa-lacos', name: 'Massa Laços', unit: 'kg', stock: 6, cost: 2.5, min_stock: 2, supplier: 'Distribuidora Alentejo', description: 'Farfalle' },
    { key: 'alface', name: 'Alface', unit: 'kg', stock: 8, cost: 1.9, min_stock: 2, supplier: 'Hortofrutícola Évora', description: 'Alface lavada' },
    { key: 'pao-baguete', name: 'Pão Baguete', unit: 'pcs', stock: 60, cost: 0.35, min_stock: 15, supplier: 'Padaria Local', description: 'Baguete fresca' },
    { key: 'pao-tosta', name: 'Pão de Tosta', unit: 'pcs', stock: 80, cost: 0.22, min_stock: 20, supplier: 'Padaria Local', description: 'Pão de forma para tosta' },

    // --- Proteínas ---
    { key: 'frango', name: 'Frango Desfiado', unit: 'kg', stock: 9, cost: 6.5, min_stock: 2, supplier: 'Talho Central', description: 'Peito de frango cozinhado' },
    { key: 'carne-picada', name: 'Carne Picada', unit: 'kg', stock: 6, cost: 7.2, min_stock: 2, supplier: 'Talho Central', description: 'Carne de vaca picada' },
    { key: 'atum', name: 'Atum', unit: 'kg', stock: 7, cost: 8.4, min_stock: 2, supplier: 'Conservas do Sul', description: 'Atum em conserva escorrido' },
    { key: 'camarao', name: 'Camarão', unit: 'kg', stock: 4, cost: 12.5, min_stock: 1, supplier: 'Peixaria Évora', description: 'Camarão descascado cozido' },
    { key: 'delicias-mar', name: 'Delícias do Mar', unit: 'kg', stock: 5, cost: 5.8, min_stock: 1.5, supplier: 'Peixaria Évora', description: 'Palitos de surimi' },
    { key: 'bacon', name: 'Bacon', unit: 'kg', stock: 4, cost: 7.9, min_stock: 1, supplier: 'Talho Central', description: 'Bacon em cubos' },
    { key: 'fiambre-aves', name: 'Fiambre de Aves', unit: 'kg', stock: 4, cost: 5.4, min_stock: 1, supplier: 'Talho Central', description: 'Fiambre de peru' },
    { key: 'salsicha', name: 'Salsicha', unit: 'kg', stock: 5, cost: 4.6, min_stock: 1.5, supplier: 'Talho Central', description: 'Salsicha tipo hot dog' },
    { key: 'kebab-frango', name: 'Carne de Kebab de Frango', unit: 'kg', stock: 5, cost: 7.6, min_stock: 1.5, supplier: 'Talho Central', description: 'Carne de kebab laminada' },
    { key: 'ovo', name: 'Ovo', unit: 'pcs', stock: 180, cost: 0.22, min_stock: 40, supplier: 'Hortofrutícola Évora', description: 'Ovo de galinha classe M' },

    // --- Lacticínios ---
    { key: 'queijo-ralado', name: 'Queijo Ralado', unit: 'kg', stock: 6, cost: 8.2, min_stock: 1.5, supplier: 'Lacticínios Alentejo', description: 'Mistura de queijo ralado' },
    { key: 'queijo-fresco', name: 'Queijo Fresco', unit: 'kg', stock: 4, cost: 6.4, min_stock: 1, supplier: 'Lacticínios Alentejo', description: 'Queijo fresco em cubos' },
    { key: 'queijo-cheddar', name: 'Queijo Cheddar', unit: 'kg', stock: 3, cost: 9.1, min_stock: 1, supplier: 'Lacticínios Alentejo', description: 'Cheddar fatiado' },
    { key: 'parmesao', name: 'Parmesão', unit: 'kg', stock: 2, cost: 14.5, min_stock: 0.5, supplier: 'Lacticínios Alentejo', description: 'Parmesão ralado' },
    { key: 'natas', name: 'Natas', unit: 'L', stock: 10, cost: 2.3, min_stock: 3, supplier: 'Lacticínios Alentejo', description: 'Natas para culinária' },

    // --- Legumes e frutas ---
    { key: 'tomate-cherry', name: 'Tomate Cherry', unit: 'kg', stock: 6, cost: 3.6, min_stock: 1.5, supplier: 'Hortofrutícola Évora' },
    { key: 'tomate', name: 'Tomate', unit: 'kg', stock: 8, cost: 1.8, min_stock: 2, supplier: 'Hortofrutícola Évora' },
    { key: 'cenoura', name: 'Cenoura', unit: 'kg', stock: 9, cost: 1.2, min_stock: 2, supplier: 'Hortofrutícola Évora' },
    { key: 'milho', name: 'Milho', unit: 'kg', stock: 6, cost: 2.4, min_stock: 1.5, supplier: 'Conservas do Sul' },
    { key: 'ervilha', name: 'Ervilha', unit: 'kg', stock: 4, cost: 2.6, min_stock: 1, supplier: 'Conservas do Sul' },
    { key: 'brocolos', name: 'Brócolos', unit: 'kg', stock: 5, cost: 2.9, min_stock: 1, supplier: 'Hortofrutícola Évora' },
    { key: 'espinafres', name: 'Espinafres', unit: 'kg', stock: 3, cost: 3.1, min_stock: 1, supplier: 'Hortofrutícola Évora' },
    { key: 'cogumelos', name: 'Cogumelos', unit: 'kg', stock: 4, cost: 4.2, min_stock: 1, supplier: 'Hortofrutícola Évora' },
    { key: 'azeitona', name: 'Azeitona', unit: 'kg', stock: 3, cost: 4.8, min_stock: 1, supplier: 'Conservas do Sul' },
    { key: 'ananas', name: 'Ananás', unit: 'kg', stock: 4, cost: 2.7, min_stock: 1, supplier: 'Hortofrutícola Évora' },
    { key: 'cebola-crocante', name: 'Cebola Crocante', unit: 'kg', stock: 2, cost: 6.9, min_stock: 0.5, supplier: 'Distribuidora Alentejo' },
    { key: 'batata-palha', name: 'Batata Palha', unit: 'kg', stock: 3, cost: 4.1, min_stock: 1, supplier: 'Distribuidora Alentejo' },

    // --- Molhos e temperos ---
    { key: 'molho-pomodoro', name: 'Molho Pomodoro', unit: 'L', stock: 12, cost: 2.8, min_stock: 3, supplier: 'Distribuidora Alentejo' },
    { key: 'molho-carbonara', name: 'Molho Carbonara', unit: 'L', stock: 8, cost: 3.6, min_stock: 2, supplier: 'Distribuidora Alentejo' },
    { key: 'molho-4queijos', name: 'Molho 4 Queijos', unit: 'L', stock: 6, cost: 4.2, min_stock: 2, supplier: 'Distribuidora Alentejo' },
    { key: 'molho-alho', name: 'Molho de Alho', unit: 'L', stock: 8, cost: 3.1, min_stock: 2, supplier: 'Distribuidora Alentejo' },
    { key: 'molho-cocktail', name: 'Molho Cocktail', unit: 'L', stock: 6, cost: 3.4, min_stock: 2, supplier: 'Distribuidora Alentejo' },
    { key: 'molho-iogurte', name: 'Molho de Iogurte', unit: 'L', stock: 6, cost: 3.0, min_stock: 2, supplier: 'Distribuidora Alentejo' },
    { key: 'molho-verde', name: 'Molho Verde', unit: 'L', stock: 5, cost: 3.2, min_stock: 1.5, supplier: 'Distribuidora Alentejo' },
    { key: 'maionese', name: 'Maionese', unit: 'L', stock: 6, cost: 2.9, min_stock: 2, supplier: 'Distribuidora Alentejo' },
    { key: 'oregaos', name: 'Orégãos', unit: 'kg', stock: 1, cost: 12.0, min_stock: 0.2, supplier: 'Distribuidora Alentejo' },

    // --- Sopa, quiche e sobremesas ---
    { key: 'base-sopa', name: 'Base de Sopa', unit: 'L', stock: 15, cost: 1.4, min_stock: 4, supplier: 'Cozinha Interna', description: 'Sopa caseira preparada na casa' },
    { key: 'quiche-unid', name: 'Quiche', unit: 'pcs', stock: 30, cost: 1.15, min_stock: 8, supplier: 'Padaria Local', description: 'Quiche individual' },
    { key: 'gelatina-morango', name: 'Gelatina de Morango', unit: 'pcs', stock: 40, cost: 0.55, min_stock: 10, supplier: 'Distribuidora Alentejo' },
    { key: 'gelatina-ananas', name: 'Gelatina de Ananás', unit: 'pcs', stock: 40, cost: 0.55, min_stock: 10, supplier: 'Distribuidora Alentejo' },

    // --- Fruta para sumos ---
    { key: 'abacaxi', name: 'Abacaxi', unit: 'kg', stock: 6, cost: 2.2, min_stock: 2, supplier: 'Hortofrutícola Évora' },
    { key: 'hortela', name: 'Hortelã', unit: 'kg', stock: 1, cost: 9.0, min_stock: 0.2, supplier: 'Hortofrutícola Évora' },
    { key: 'polpa-multifrutos', name: 'Polpa Multi-frutos', unit: 'L', stock: 8, cost: 3.4, min_stock: 2, supplier: 'Distribuidora Alentejo' },
];

/** Portuguese IVA: prepared food and juices at 13%, soft drinks at 23%, water at 6%. */
const IVA_FOOD = 0.13;
const IVA_SOFT_DRINK = 0.23;
const IVA_WATER = 0.06;

/** A build-your-own pasta plate: same price and options, different pasta shape. */
function buildYourOwnPasta(
    key: string,
    name: string,
    sku: string,
    pastaMaterial: string,
    display_order: number
): SeedProductSpec {
    return {
        key,
        name,
        description: 'Massa à escolha com 5 ingredientes e 1 molho incluídos.',
        sku,
        category: 'pratos-massa',
        price: 11.5,
        iva_rate: IVA_FOOD,
        stock: 0,
        min_stock: 0,
        track_stock: false,
        display_order,
        variants: [sauceChoice(key)],
        modifiers: [...includedIngredients(key), ...extraToppings(key)],
        recipe: [
            { material: pastaMaterial, quantity_per_unit: 0.18 },
            { material: 'molho-pomodoro', quantity_per_unit: 0.08 },
            { material: 'tomate-cherry', quantity_per_unit: 0.03 },
            { material: 'milho', quantity_per_unit: 0.03 },
            { material: 'cenoura', quantity_per_unit: 0.03 },
            { material: 'queijo-ralado', quantity_per_unit: 0.02 },
            { material: 'azeitona', quantity_per_unit: 0.015 },
        ],
    };
}

/** A toasted sandwich: shared bread and finish, distinct filling. */
function tosta(
    key: string,
    name: string,
    description: string,
    sku: string,
    price: number,
    display_order: number,
    filling: SeedRecipeLineSpec[]
): SeedProductSpec {
    return {
        key,
        name,
        description,
        sku,
        category: 'tostas',
        price,
        iva_rate: IVA_FOOD,
        stock: 0,
        min_stock: 0,
        track_stock: false,
        display_order,
        modifiers: extraToppings(key),
        recipe: [
            { material: 'pao-tosta', quantity_per_unit: 2 },
            { material: 'tomate', quantity_per_unit: 0.03 },
            { material: 'cenoura', quantity_per_unit: 0.03 },
            { material: 'oregaos', quantity_per_unit: 0.001 },
            ...filling,
        ],
    };
}

/** A bottled drink: stock-tracked, no recipe, no options. */
function drink(
    key: string,
    name: string,
    description: string,
    sku: string,
    price: number,
    cost: number,
    iva_rate: number,
    display_order: number
): SeedProductSpec {
    return {
        key,
        name,
        description,
        sku,
        category: 'bebidas',
        price,
        cost,
        iva_rate,
        stock: 48,
        min_stock: 12,
        track_stock: true,
        display_order,
    };
}

const QBELLA_PRODUCTS: SeedProductSpec[] = [
    // === Pratos Massa (build your own) ===
    buildYourOwnPasta('massa-tagliatelle', 'Massa Tagliatelle', 'QB-PM-001', 'massa-tagliatelle', 1),
    buildYourOwnPasta('massa-fusilli', 'Massa Fusilli de Três Cores', 'QB-PM-002', 'massa-fusilli', 2),
    buildYourOwnPasta('massa-penne', 'Massa Penne', 'QB-PM-003', 'massa-penne', 3),
    buildYourOwnPasta('massa-esparguete', 'Massa Esparguete', 'QB-PM-004', 'massa-esparguete', 4),
    buildYourOwnPasta('massa-tagliatelle-verde', 'Massa Tagliatelle Verde', 'QB-PM-005', 'massa-tagliatelle-verde', 5),
    buildYourOwnPasta('massa-lacos', 'Massa Laços', 'QB-PM-006', 'massa-lacos', 6),

    // === Massa Sugestões (fixed recipes) ===
    {
        key: 'massa-pomodoro-carne',
        name: 'Massa Pomodoro e Carne',
        description: 'Esparguete com carne picada, brócolos, tomate cherry, queijo e azeitona em molho pomodoro.',
        sku: 'QB-MS-001', category: 'massa-sugestoes', price: 11.4, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 1,
        modifiers: extraToppings('massa-pomodoro-carne'),
        recipe: [
            { material: 'massa-esparguete', quantity_per_unit: 0.18 },
            { material: 'carne-picada', quantity_per_unit: 0.1 },
            { material: 'molho-pomodoro', quantity_per_unit: 0.1 },
            { material: 'brocolos', quantity_per_unit: 0.04 },
            { material: 'tomate-cherry', quantity_per_unit: 0.04 },
            { material: 'queijo-ralado', quantity_per_unit: 0.02 },
            { material: 'azeitona', quantity_per_unit: 0.015 },
            { material: 'parmesao', quantity_per_unit: 0.008 },
        ],
    },
    {
        key: 'massa-carbonara-especial',
        name: 'Massa Carbonara Especial',
        description: 'Massa cremosa com bacon, salsicha, fiambre de aves, ovo e queijo.',
        sku: 'QB-MS-002', category: 'massa-sugestoes', price: 10.95, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 2,
        modifiers: extraToppings('massa-carbonara-especial'),
        recipe: [
            { material: 'massa-penne', quantity_per_unit: 0.18 },
            { material: 'molho-carbonara', quantity_per_unit: 0.1 },
            { material: 'bacon', quantity_per_unit: 0.05 },
            { material: 'salsicha', quantity_per_unit: 0.05 },
            { material: 'fiambre-aves', quantity_per_unit: 0.04 },
            { material: 'ovo', quantity_per_unit: 1 },
            { material: 'queijo-ralado', quantity_per_unit: 0.025 },
        ],
    },
    {
        key: 'massa-espirais-atum',
        name: 'Massa Espirais de Atum',
        description: 'Fusilli com atum, cenoura, ovo, ervilha e milho, em molho pomodoro e alho.',
        sku: 'QB-MS-003', category: 'massa-sugestoes', price: 11.1, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 3,
        modifiers: extraToppings('massa-espirais-atum'),
        recipe: [
            { material: 'massa-fusilli', quantity_per_unit: 0.18 },
            { material: 'atum', quantity_per_unit: 0.08 },
            { material: 'cenoura', quantity_per_unit: 0.04 },
            { material: 'ovo', quantity_per_unit: 1 },
            { material: 'ervilha', quantity_per_unit: 0.04 },
            { material: 'milho', quantity_per_unit: 0.04 },
            { material: 'molho-pomodoro', quantity_per_unit: 0.06 },
            { material: 'molho-alho', quantity_per_unit: 0.03 },
        ],
    },
    {
        key: 'massa-frango-cogumelos',
        name: 'Massa Frango e Cogumelos',
        description: 'Tagliatelle em molho cremoso de cogumelos com frango, brócolos, milho e cenoura.',
        sku: 'QB-MS-004', category: 'massa-sugestoes', price: 11.1, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 4,
        modifiers: extraToppings('massa-frango-cogumelos'),
        recipe: [
            { material: 'massa-tagliatelle', quantity_per_unit: 0.18 },
            { material: 'frango', quantity_per_unit: 0.09 },
            { material: 'cogumelos', quantity_per_unit: 0.06 },
            { material: 'natas', quantity_per_unit: 0.08 },
            { material: 'brocolos', quantity_per_unit: 0.04 },
            { material: 'milho', quantity_per_unit: 0.03 },
            { material: 'cenoura', quantity_per_unit: 0.03 },
        ],
    },
    {
        key: 'massa-penne-supremo',
        name: 'Massa Penne Supremo',
        description: 'Penne com frango, bacon, espinafres, azeitona e queijo em molho carbonara.',
        sku: 'QB-MS-005', category: 'massa-sugestoes', price: 11.4, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 5,
        modifiers: extraToppings('massa-penne-supremo'),
        recipe: [
            { material: 'massa-penne', quantity_per_unit: 0.18 },
            { material: 'frango', quantity_per_unit: 0.08 },
            { material: 'bacon', quantity_per_unit: 0.05 },
            { material: 'espinafres', quantity_per_unit: 0.04 },
            { material: 'azeitona', quantity_per_unit: 0.02 },
            { material: 'queijo-ralado', quantity_per_unit: 0.025 },
            { material: 'molho-carbonara', quantity_per_unit: 0.09 },
        ],
    },
    {
        key: 'massa-camarao-4queijos',
        name: 'Massa Camarão aos 4 Queijos',
        description: 'Tagliatelle com camarão, bacon e tomate cherry em molho 4 queijos.',
        sku: 'QB-MS-006', category: 'massa-sugestoes', price: 11.5, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 6,
        modifiers: extraToppings('massa-camarao-4queijos'),
        recipe: [
            { material: 'massa-tagliatelle', quantity_per_unit: 0.18 },
            { material: 'camarao', quantity_per_unit: 0.08 },
            { material: 'bacon', quantity_per_unit: 0.04 },
            { material: 'tomate-cherry', quantity_per_unit: 0.04 },
            { material: 'molho-4queijos', quantity_per_unit: 0.1 },
            { material: 'parmesao', quantity_per_unit: 0.008 },
        ],
    },

    // === Pratos Salada ===
    {
        key: 'prato-salada',
        name: 'Prato Salada',
        description: 'Base de alface e massa fria com 5 ingredientes e 1 molho incluídos.',
        sku: 'QB-PS-001', category: 'pratos-salada', price: 11.5, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 1,
        variants: [sauceChoice('prato-salada')],
        modifiers: [...includedIngredients('prato-salada'), ...extraToppings('prato-salada')],
        recipe: [
            { material: 'alface', quantity_per_unit: 0.12 },
            { material: 'massa-fusilli', quantity_per_unit: 0.1 },
            { material: 'tomate-cherry', quantity_per_unit: 0.04 },
            { material: 'milho', quantity_per_unit: 0.03 },
            { material: 'cenoura', quantity_per_unit: 0.03 },
            { material: 'queijo-ralado', quantity_per_unit: 0.02 },
            { material: 'molho-iogurte', quantity_per_unit: 0.04 },
        ],
    },

    // === Salada Sugestões ===
    {
        key: 'salada-atum',
        name: 'Salada de Atum',
        description: 'Alface e massa com atum, tomate cherry, milho, cenoura e ananás, com molho de iogurte.',
        sku: 'QB-SS-001', category: 'salada-sugestoes', price: 11.4, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 1,
        modifiers: extraToppings('salada-atum'),
        recipe: [
            { material: 'alface', quantity_per_unit: 0.12 },
            { material: 'massa-fusilli', quantity_per_unit: 0.09 },
            { material: 'atum', quantity_per_unit: 0.08 },
            { material: 'tomate-cherry', quantity_per_unit: 0.04 },
            { material: 'milho', quantity_per_unit: 0.03 },
            { material: 'cenoura', quantity_per_unit: 0.03 },
            { material: 'ananas', quantity_per_unit: 0.03 },
            { material: 'molho-iogurte', quantity_per_unit: 0.04 },
        ],
    },
    {
        key: 'salada-frango',
        name: 'Salada de Frango',
        description: 'Alface e massa com frango, tomate cherry, milho, queijo e ovo, com molho de alho.',
        sku: 'QB-SS-002', category: 'salada-sugestoes', price: 11.1, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 2,
        modifiers: extraToppings('salada-frango'),
        recipe: [
            { material: 'alface', quantity_per_unit: 0.12 },
            { material: 'massa-fusilli', quantity_per_unit: 0.09 },
            { material: 'frango', quantity_per_unit: 0.09 },
            { material: 'tomate-cherry', quantity_per_unit: 0.04 },
            { material: 'milho', quantity_per_unit: 0.03 },
            { material: 'queijo-ralado', quantity_per_unit: 0.02 },
            { material: 'ovo', quantity_per_unit: 1 },
            { material: 'molho-alho', quantity_per_unit: 0.04 },
        ],
    },
    {
        key: 'salada-camarao-mediterraneo',
        name: 'Salada de Camarão Mediterrâneo',
        description: 'Alface e massa com camarão, queijo fresco e cenoura, com molho cocktail.',
        sku: 'QB-SS-003', category: 'salada-sugestoes', price: 11.5, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 3,
        modifiers: extraToppings('salada-camarao-mediterraneo'),
        recipe: [
            { material: 'alface', quantity_per_unit: 0.12 },
            { material: 'massa-fusilli', quantity_per_unit: 0.09 },
            { material: 'camarao', quantity_per_unit: 0.08 },
            { material: 'queijo-fresco', quantity_per_unit: 0.05 },
            { material: 'cenoura', quantity_per_unit: 0.04 },
            { material: 'molho-cocktail', quantity_per_unit: 0.04 },
        ],
    },

    // === Baguetes ===
    {
        key: 'baguete-a-sua-maneira',
        name: 'Baguete a sua maneira',
        description: 'Baguete montada com 4 ingredientes e 1 molho à escolha.',
        sku: 'QB-BG-001', category: 'baguetes', price: 8.6, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 1,
        variants: [sauceChoice('baguete-a-sua-maneira')],
        modifiers: [...includedIngredients('baguete-a-sua-maneira'), ...extraToppings('baguete-a-sua-maneira')],
        recipe: [
            { material: 'pao-baguete', quantity_per_unit: 1 },
            { material: 'alface', quantity_per_unit: 0.04 },
            { material: 'tomate', quantity_per_unit: 0.04 },
            { material: 'queijo-ralado', quantity_per_unit: 0.02 },
            { material: 'maionese', quantity_per_unit: 0.02 },
        ],
    },
    {
        key: 'baguete-queijo-fresco',
        name: 'Baguete Queijo Fresco',
        description: 'Baguete com queijo fresco, tomate e alface.',
        sku: 'QB-BG-002', category: 'baguetes', price: 7.9, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 2,
        modifiers: extraToppings('baguete-queijo-fresco'),
        recipe: [
            { material: 'pao-baguete', quantity_per_unit: 1 },
            { material: 'queijo-fresco', quantity_per_unit: 0.07 },
            { material: 'tomate', quantity_per_unit: 0.04 },
            { material: 'alface', quantity_per_unit: 0.04 },
        ],
    },
    {
        key: 'baguete-frango-ananas',
        name: 'Baguete Frango e Ananás',
        description: 'Baguete com frango, ananás, tomate e alface.',
        sku: 'QB-BG-003', category: 'baguetes', price: 7.9, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 3,
        modifiers: extraToppings('baguete-frango-ananas'),
        recipe: [
            { material: 'pao-baguete', quantity_per_unit: 1 },
            { material: 'frango', quantity_per_unit: 0.08 },
            { material: 'ananas', quantity_per_unit: 0.04 },
            { material: 'tomate', quantity_per_unit: 0.04 },
            { material: 'alface', quantity_per_unit: 0.04 },
        ],
    },
    {
        key: 'baguete-delicias-mar',
        name: 'Baguete Delícias do Mar',
        description: 'Baguete com delícias do mar, ovo cozido, tomate e alface.',
        sku: 'QB-BG-004', category: 'baguetes', price: 7.9, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 4,
        modifiers: extraToppings('baguete-delicias-mar'),
        recipe: [
            { material: 'pao-baguete', quantity_per_unit: 1 },
            { material: 'delicias-mar', quantity_per_unit: 0.08 },
            { material: 'ovo', quantity_per_unit: 1 },
            { material: 'tomate', quantity_per_unit: 0.04 },
            { material: 'alface', quantity_per_unit: 0.04 },
        ],
    },
    {
        key: 'baguete-atum',
        name: 'Baguete Atum',
        description: 'Baguete com atum, ovo cozido, tomate e alface.',
        sku: 'QB-BG-005', category: 'baguetes', price: 7.9, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 5,
        modifiers: extraToppings('baguete-atum'),
        recipe: [
            { material: 'pao-baguete', quantity_per_unit: 1 },
            { material: 'atum', quantity_per_unit: 0.08 },
            { material: 'ovo', quantity_per_unit: 1 },
            { material: 'tomate', quantity_per_unit: 0.04 },
            { material: 'alface', quantity_per_unit: 0.04 },
        ],
    },
    {
        key: 'pasta-queijo-fresco',
        name: 'Queijo Fresco',
        description: 'Pasta fria de queijo fresco com alface e tomate.',
        sku: 'QB-BG-006', category: 'baguetes', price: 7.4, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 6,
        modifiers: extraToppings('pasta-queijo-fresco'),
        recipe: [
            { material: 'pao-baguete', quantity_per_unit: 1 },
            { material: 'queijo-fresco', quantity_per_unit: 0.08 },
            { material: 'alface', quantity_per_unit: 0.04 },
            { material: 'tomate', quantity_per_unit: 0.04 },
            { material: 'maionese', quantity_per_unit: 0.02 },
        ],
    },
    {
        key: 'pasta-delicias-mar',
        name: 'Pasta Delícias do Mar',
        description: 'Pasta fria de delícias do mar com alface, tomate, ovo e milho.',
        sku: 'QB-BG-007', category: 'baguetes', price: 8.1, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 7,
        modifiers: extraToppings('pasta-delicias-mar'),
        recipe: [
            { material: 'pao-baguete', quantity_per_unit: 1 },
            { material: 'delicias-mar', quantity_per_unit: 0.08 },
            { material: 'alface', quantity_per_unit: 0.04 },
            { material: 'tomate', quantity_per_unit: 0.04 },
            { material: 'ovo', quantity_per_unit: 1 },
            { material: 'milho', quantity_per_unit: 0.03 },
            { material: 'maionese', quantity_per_unit: 0.02 },
        ],
    },

    // === Tostas ===
    tosta('tosta-americana', 'Tosta Americana', 'Tosta com salsicha, milho, batata palha e orégãos.', 'QB-TS-001', 8.9, 1, [
        { material: 'salsicha', quantity_per_unit: 0.07 },
        { material: 'milho', quantity_per_unit: 0.03 },
        { material: 'batata-palha', quantity_per_unit: 0.02 },
    ]),
    tosta('tosta-italiana', 'Tosta Italiana', 'Tosta com carne picada em molho pomodoro, queijo, milho e molho de alho.', 'QB-TS-002', 8.5, 2, [
        { material: 'carne-picada', quantity_per_unit: 0.08 },
        { material: 'molho-pomodoro', quantity_per_unit: 0.04 },
        { material: 'queijo-ralado', quantity_per_unit: 0.03 },
        { material: 'milho', quantity_per_unit: 0.03 },
        { material: 'molho-alho', quantity_per_unit: 0.02 },
    ]),
    tosta('tosta-kebab-frango', 'Tosta de Kebab de Frango', 'Tosta com carne de kebab, queijo, milho e molho de alho.', 'QB-TS-003', 8.8, 3, [
        { material: 'kebab-frango', quantity_per_unit: 0.09 },
        { material: 'queijo-ralado', quantity_per_unit: 0.03 },
        { material: 'milho', quantity_per_unit: 0.03 },
        { material: 'molho-alho', quantity_per_unit: 0.02 },
    ]),
    tosta('tosta-camarao-queijo', 'Tosta de Camarão com Queijo', 'Tosta com camarão, queijo, milho e molho de alho.', 'QB-TS-004', 9.4, 4, [
        { material: 'camarao', quantity_per_unit: 0.07 },
        { material: 'queijo-ralado', quantity_per_unit: 0.03 },
        { material: 'milho', quantity_per_unit: 0.03 },
        { material: 'molho-alho', quantity_per_unit: 0.02 },
    ]),
    tosta('tosta-atum-queijo', 'Tosta de Atum com Queijo', 'Tosta com atum, queijo, milho e molho de alho.', 'QB-TS-005', 8.5, 5, [
        { material: 'atum', quantity_per_unit: 0.08 },
        { material: 'queijo-ralado', quantity_per_unit: 0.03 },
        { material: 'milho', quantity_per_unit: 0.03 },
        { material: 'molho-alho', quantity_per_unit: 0.02 },
    ]),
    tosta('tosta-frango-cheddar-cebola', 'Tosta de Frango, Queijo Cheddar e Cebola', 'Tosta com frango, cheddar, cebola crocante e molho de alho.', 'QB-TS-006', 9.0, 6, [
        { material: 'frango', quantity_per_unit: 0.08 },
        { material: 'queijo-cheddar', quantity_per_unit: 0.03 },
        { material: 'cebola-crocante', quantity_per_unit: 0.02 },
        { material: 'molho-alho', quantity_per_unit: 0.02 },
    ]),
    tosta('tosta-frango-alho-queijo', 'Tosta de Frango com Alho e Queijo', 'Tosta com frango, queijo e molho de alho.', 'QB-TS-007', 8.3, 7, [
        { material: 'frango', quantity_per_unit: 0.08 },
        { material: 'queijo-ralado', quantity_per_unit: 0.03 },
        { material: 'molho-alho', quantity_per_unit: 0.03 },
    ]),
    tosta('tosta-frango-club', 'Tosta de Frango Club', 'Tosta com frango, queijo, bacon e molho verde.', 'QB-TS-008', 8.8, 8, [
        { material: 'frango', quantity_per_unit: 0.08 },
        { material: 'queijo-ralado', quantity_per_unit: 0.03 },
        { material: 'bacon', quantity_per_unit: 0.04 },
        { material: 'molho-verde', quantity_per_unit: 0.02 },
    ]),

    // === Omelete ===
    {
        key: 'prato-omelete',
        name: 'Prato Omelete',
        description: 'Omelete com 2 acompanhamentos, 3 ingredientes e 1 molho à escolha.',
        sku: 'QB-OM-001', category: 'omelete', price: 11.15, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 1,
        variants: [sauceChoice('prato-omelete')],
        modifiers: [
            ...sideDishes('prato-omelete'),
            ...includedIngredients('prato-omelete'),
            ...extraToppings('prato-omelete'),
        ],
        recipe: [
            { material: 'ovo', quantity_per_unit: 3 },
            { material: 'queijo-ralado', quantity_per_unit: 0.03 },
            { material: 'fiambre-aves', quantity_per_unit: 0.04 },
            { material: 'cogumelos', quantity_per_unit: 0.03 },
            { material: 'alface', quantity_per_unit: 0.05 },
            { material: 'batata-palha', quantity_per_unit: 0.03 },
        ],
    },

    // === Entradas ===
    {
        key: 'sopa',
        name: 'Sopa',
        description: 'Sopa caseira do dia.',
        sku: 'QB-EN-001', category: 'entradas', price: 3.55, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 1,
        recipe: [{ material: 'base-sopa', quantity_per_unit: 0.35 }],
    },
    {
        key: 'quiche',
        name: 'Quiche',
        description: 'Tarte salgada de ovo, queijo e legumes.',
        sku: 'QB-EN-002', category: 'entradas', price: 3.55, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 2,
        recipe: [{ material: 'quiche-unid', quantity_per_unit: 1 }],
    },

    // === Menu Infantil ===
    {
        key: 'massa-quente-infantil',
        name: 'Massa Quente Infantil',
        description: 'Dose infantil de massa quente com 3 ingredientes e 1 molho.',
        sku: 'QB-MI-001', category: 'menu-infantil', price: 5.6, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 1,
        variants: [sauceChoice('massa-quente-infantil')],
        modifiers: includedIngredients('massa-quente-infantil'),
        recipe: [
            { material: 'massa-penne', quantity_per_unit: 0.1 },
            { material: 'molho-pomodoro', quantity_per_unit: 0.05 },
            { material: 'queijo-ralado', quantity_per_unit: 0.015 },
            { material: 'milho', quantity_per_unit: 0.02 },
        ],
    },
    {
        key: 'salada-infantil',
        name: 'Salada Infantil',
        description: 'Dose infantil de salada com 3 ingredientes e 1 molho.',
        sku: 'QB-MI-002', category: 'menu-infantil', price: 5.6, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 2,
        variants: [sauceChoice('salada-infantil'), temperatureChoice('salada-infantil')],
        modifiers: includedIngredients('salada-infantil'),
        recipe: [
            { material: 'alface', quantity_per_unit: 0.07 },
            { material: 'massa-fusilli', quantity_per_unit: 0.05 },
            { material: 'cenoura', quantity_per_unit: 0.02 },
            { material: 'milho', quantity_per_unit: 0.02 },
            { material: 'molho-iogurte', quantity_per_unit: 0.02 },
        ],
    },

    // === Sobremesas ===
    {
        key: 'gelatina-morango',
        name: 'Gelatina de Morango',
        description: 'Gelatina de morango.',
        sku: 'QB-SB-001', category: 'sobremesas', price: 2.2, iva_rate: IVA_FOOD,
        stock: 24, min_stock: 6, track_stock: true, display_order: 1,
        recipe: [{ material: 'gelatina-morango', quantity_per_unit: 1 }],
    },
    {
        key: 'gelatina-ananas',
        name: 'Gelatina de Ananás',
        description: 'Gelatina de ananás.',
        sku: 'QB-SB-002', category: 'sobremesas', price: 2.2, iva_rate: IVA_FOOD,
        stock: 24, min_stock: 6, track_stock: true, display_order: 2,
        recipe: [{ material: 'gelatina-ananas', quantity_per_unit: 1 }],
    },

    // === Sumos Naturais ===
    {
        key: 'sumo-abacaxi-hortela',
        name: 'Abacaxi e Hortelã',
        description: 'Sumo natural de abacaxi com hortelã, 30 cl.',
        sku: 'QB-SN-001', category: 'sumos-naturais', price: 2.6, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 1,
        recipe: [
            { material: 'abacaxi', quantity_per_unit: 0.25 },
            { material: 'hortela', quantity_per_unit: 0.003 },
        ],
    },
    {
        key: 'sumo-multifrutos',
        name: 'Multi-frutos',
        description: 'Sumo natural multi-frutos, 30 cl.',
        sku: 'QB-SN-002', category: 'sumos-naturais', price: 2.6, iva_rate: IVA_FOOD,
        stock: 0, min_stock: 0, track_stock: false, display_order: 2,
        recipe: [{ material: 'polpa-multifrutos', quantity_per_unit: 0.3 }],
    },

    // === Bebidas ===
    drink('coca-cola', 'Coca-Cola', 'Refrigerante com gás, 33 cl.', 'QB-BE-001', 2.2, 0.72, IVA_SOFT_DRINK, 1),
    drink('coca-cola-zero', 'Coca-Cola Zero', 'Refrigerante sem açúcar, 30 cl.', 'QB-BE-002', 2.2, 0.72, IVA_SOFT_DRINK, 2),
    drink('fuze-tea-manga-ananas', 'Fuze Tea Manga e Ananás', 'Chá gelado de manga e ananás, 30 cl.', 'QB-BE-003', 2.2, 0.68, IVA_SOFT_DRINK, 3),
    drink('fuze-tea-limao', 'Fuze Tea Limão', 'Chá gelado de limão, 33 cl.', 'QB-BE-004', 2.2, 0.68, IVA_SOFT_DRINK, 4),
    drink('agua', 'Água', 'Água engarrafada, 50 cl.', 'QB-BE-005', 2.2, 0.28, IVA_WATER, 5),
    drink('fanta-laranja', 'Fanta Laranja', 'Refrigerante de laranja, 33 cl.', 'QB-BE-006', 2.2, 0.7, IVA_SOFT_DRINK, 6),
    drink('fuze-tea-pessego', 'Fuze Tea Pêssego', 'Chá gelado de pêssego, 33 cl.', 'QB-BE-007', 2.2, 0.68, IVA_SOFT_DRINK, 7),
    drink('fanta-ananas', 'Fanta Ananás', 'Refrigerante de ananás, 33 cl.', 'QB-BE-008', 2.2, 0.7, IVA_SOFT_DRINK, 8),
];

/**
 * Product photos, hotlinked from the restaurant's own public delivery listing
 * (images.bolt.eu). Seed data only — a real deployment should upload its own
 * images so the catalogue does not depend on a third-party CDN staying up.
 * `baguete-a-sua-maneira` has no photo on the listing and stays null.
 */
const QBELLA_IMAGE_URLS: Record<string, string> = {
    'agua': 'https://images.bolt.eu/store/2024/2024-11-22/43d80e94-a62e-4956-b17c-fcfbf3351b41.jpeg',
    'baguete-atum': 'https://images.bolt.eu/store/2024/2024-12-10/df441d3c-7e78-4014-bc6e-68f10f30844a.png',
    'baguete-delicias-mar': 'https://images.bolt.eu/store/2024/2024-12-10/e797ed9f-37eb-41e1-a680-dc887737cb69.png',
    'baguete-frango-ananas': 'https://images.bolt.eu/store/2024/2024-12-10/befe9c24-fd8c-486b-b48e-e3795cdeb9b8.png',
    'baguete-queijo-fresco': 'https://images.bolt.eu/store/2024/2024-12-10/2f07c4cb-a3db-4e09-b7a0-e4de9fbab09a.png',
    'coca-cola': 'https://images.bolt.eu/store/2024/2024-11-25/67fc0cca-aed1-4986-a0a0-e0d452ead996.jpeg',
    'coca-cola-zero': 'https://images.bolt.eu/store/2024/2024-11-22/d1ff8481-bce0-4f41-919a-eefbdb698e6c.jpeg',
    'fanta-ananas': 'https://images.bolt.eu/store/2024/2024-11-22/533118d5-72f2-4bcb-ae90-a8f1fe083fea.jpeg',
    'fanta-laranja': 'https://images.bolt.eu/store/2024/2024-11-22/6500e16a-173b-4eba-b68e-d78bf9433e2a.jpeg',
    'fuze-tea-limao': 'https://images.bolt.eu/store/2025/2025-01-09/2ebfaa01-eb7f-4c6b-aa29-a964704ed9c8.jpeg',
    'fuze-tea-manga-ananas': 'https://images.bolt.eu/store/2025/2025-01-13/05a47957-e281-467a-abc8-b3aa6cf455be.jpeg',
    'fuze-tea-pessego': 'https://images.bolt.eu/store/2025/2025-01-09/a27ebd07-d64a-408a-ae7f-9b3fc885d43b.jpeg',
    'gelatina-ananas': 'https://images.bolt.eu/store/2024/2024-11-22/c97e4736-ece7-4ce5-ae4e-0c1b796725d0.jpeg',
    'gelatina-morango': 'https://images.bolt.eu/store/2024/2024-11-22/72f22166-211b-4da4-877b-2058659369de.jpeg',
    'massa-camarao-4queijos': 'https://images.bolt.eu/store/2026/2026-02-12/d419dc7c-d660-4e26-9680-00eddf69a5b8.png',
    'massa-carbonara-especial': 'https://images.bolt.eu/store/2026/2026-02-12/f9b88a80-a2bf-4c3c-a6f5-6e632bf5e1e3.png',
    'massa-esparguete': 'https://images.bolt.eu/store/2024/2024-11-22/e1c52dc7-4ba8-42f6-a09b-b7f5525ed159.jpeg',
    'massa-espirais-atum': 'https://images.bolt.eu/store/2026/2026-02-12/c118d0b2-4d8e-4cfa-aaf4-52fba9ed2f62.png',
    'massa-frango-cogumelos': 'https://images.bolt.eu/store/2026/2026-02-12/d1753dc4-1858-4f84-8fb8-b4f1bd982530.png',
    'massa-fusilli': 'https://images.bolt.eu/store/2024/2024-11-22/93c96937-52d0-45b8-b17f-fcdd0b5b8f11.jpeg',
    'massa-lacos': 'https://images.bolt.eu/store/2024/2024-11-22/1fbcdd3a-119c-4915-b79d-fc4f1935cfb3.jpeg',
    'massa-penne': 'https://images.bolt.eu/store/2024/2024-11-22/13210134-b298-4181-932f-424bdd34ce6a.jpeg',
    'massa-penne-supremo': 'https://images.bolt.eu/store/2026/2026-02-12/acf87030-8208-4c1a-add6-99f1f3289856.png',
    'massa-pomodoro-carne': 'https://images.bolt.eu/store/2026/2026-02-12/18e9febb-9e0f-43f5-b2aa-a5c3835f03e0.png',
    'massa-quente-infantil': 'https://images.bolt.eu/store/2025/2025-06-13/f044fb5b-051c-4fe3-8549-e47a05519321.jpeg',
    'massa-tagliatelle': 'https://images.bolt.eu/store/2024/2024-11-22/ab999b10-134f-49c3-b372-f48e23879a58.jpeg',
    'massa-tagliatelle-verde': 'https://images.bolt.eu/store/2024/2024-11-22/00eecc90-db73-4058-866e-174ee9459afe.jpeg',
    'pasta-delicias-mar': 'https://images.bolt.eu/store/2024/2024-11-22/e6793fa4-4610-4384-980f-204be21ab2c5.jpeg',
    'pasta-queijo-fresco': 'https://images.bolt.eu/store/2024/2024-11-22/b9de15e4-ef7d-452b-a45a-255810b8c385.jpeg',
    'prato-omelete': 'https://images.bolt.eu/store/2024/2024-11-22/dbaed820-511c-452d-97dc-fe4838e58cb6.jpeg',
    'prato-salada': 'https://images.bolt.eu/store/2024/2024-11-22/ef262f60-065c-40ad-b92b-8c9ea4749c63.jpeg',
    'quiche': 'https://images.bolt.eu/store/2024/2024-11-22/0f153fd5-585c-46d9-a196-716a014eaafc.jpeg',
    'salada-atum': 'https://images.bolt.eu/store/2026/2026-02-12/1a783f6c-0c64-4e7e-82ef-8dfa93cb522c.png',
    'salada-camarao-mediterraneo': 'https://images.bolt.eu/store/2026/2026-02-12/076db607-f473-4683-a129-f3ccb0ce6db7.png',
    'salada-frango': 'https://images.bolt.eu/store/2026/2026-02-12/4c3e224a-4bc2-4566-8020-5836d34b7572.png',
    'salada-infantil': 'https://images.bolt.eu/store/2025/2025-06-13/96ee1b0d-8f8c-4a6c-8f1d-c8acb10bc5b7.jpeg',
    'sopa': 'https://images.bolt.eu/store/2024/2024-11-22/490a7ac5-47d6-4e39-8255-453a87d54435.jpeg',
    'sumo-abacaxi-hortela': 'https://images.bolt.eu/store/2024/2024-11-22/b36fe592-0729-4c57-9bff-c6c948402093.jpeg',
    'sumo-multifrutos': 'https://images.bolt.eu/store/2024/2024-11-25/fc5bf97e-631c-4796-a2fa-db5a283ea2b0.png',
    'tosta-americana': 'https://images.bolt.eu/store/2025/2025-06-12/68777af6-0094-4b08-aaca-e22de7527630.png',
    'tosta-atum-queijo': 'https://images.bolt.eu/store/2025/2025-06-12/f9697f7f-50bd-4f4a-b8d9-1674341d76c4.png',
    'tosta-camarao-queijo': 'https://images.bolt.eu/store/2025/2025-06-12/6a3804a5-bb60-4484-83ea-5833b115c872.png',
    'tosta-frango-alho-queijo': 'https://images.bolt.eu/store/2025/2025-06-12/fcbd08cd-f6db-4a3d-ba4f-abb1887e3211.png',
    'tosta-frango-cheddar-cebola': 'https://images.bolt.eu/store/2025/2025-06-12/39085e8f-9b60-4c71-bece-ead4d23ce0a2.png',
    'tosta-frango-club': 'https://images.bolt.eu/store/2025/2025-06-12/aeb9131a-b354-4000-bd08-1a55fa3c0515.png',
    'tosta-italiana': 'https://images.bolt.eu/store/2025/2025-06-12/099399d3-2058-442e-97ef-593c9e9292cf.png',
    'tosta-kebab-frango': 'https://images.bolt.eu/store/2025/2025-06-12/adc33211-1110-4388-8589-4c09466920df.png',
};

export const QBELLA_EVORA_DATASET: RestaurantSeedDataset = {
    id: 'qbella-evora-plaza',
    name: "Q'Bella Massa, Salada e Baguetes — Évora Plaza",
    source: 'Public delivery listings (Bolt Food, Glovo), read 2026-07-27',
    notes: [
        'Category structure, item names and shelf prices are taken from the restaurant’s public delivery listings.',
        'Ingredient costs, stock levels and reorder thresholds are estimates, not the restaurant’s real figures.',
        'Per-item ingredient and sauce pick-lists are not published; option groups are built from the ingredients that appear across the menu.',
        'IVA is assigned by kind: 13% prepared food and juices, 23% soft drinks, 6% water. Confirm against the operator’s own fiscal setup.',
        'Pick limits ("5 ingredients", "3 on the kids menu", "2 sides") are advisory: modifiers carry no min/max in the product model, so the till does not enforce a count.',
        'Variants and modifiers need migration 20260731000000_product_options on the Supabase project. Pushing them to a project without it is harmless — the server ignores unknown keys — but they will not come back on pull until it is applied.',
        'Seeding overwrites the company block in Settings → Company & Fiscal with the operating company below — on THIS device only. Supabase is the source of truth for a connected till (migration 20260810000000), so the next sync replaces anything the server holds a value for. Treat the seeded company block as local-testing data, not as a way to configure a real install.',
        'Company registry extract: VERDE HONORÁRIO LDA, NIPC 517430940, natureza jurídica SOCIEDADE POR QUOTAS; distrito Évora, concelho Évora, freguesia Malagueira e Horta das Figueiras. Natureza jurídica and freguesia have no field in the company block and are not seeded; distrito and concelho are both Évora, which `city` already carries.',
    ],
    // Operating company (certidão permanente). The address stops at the shopping
    // centre because the receipt prints `address` and then `postalCode city` on
    // its own line — carrying "Évora" in both would print the city twice.
    company: {
        name: 'VERDE HONORÁRIO LDA',
        taxNumber: '517430940',
        address: 'Rua Luis Adelino Fonseca, 2, Loja 1.06 — Centro Comercial Évora Plaza',
        postalCode: '7005-345',
        city: 'Évora',
    },
    categories: QBELLA_CATEGORIES,
    rawMaterials: QBELLA_RAW_MATERIALS,
    products: QBELLA_PRODUCTS.map(product => ({
        ...product,
        image_url: QBELLA_IMAGE_URLS[product.key] ?? null,
    })),
};

/** Every dataset the seed tools can offer. */
export const RESTAURANT_SEED_DATASETS: RestaurantSeedDataset[] = [QBELLA_EVORA_DATASET];
