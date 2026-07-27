import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, ChevronUp, Package, Plus, Search, Trash2, X } from 'lucide-react';

import { useSettings } from '../contexts/SettingsContext';
import { getCountryProfile } from '../lib/countryProfile';
import { ivaRatesForCountry, type LocalCategory, type LocalProduct, type ProductModifier, type ProductVariantAttribute } from '../types/supabase';
import type { LocalRawMaterial } from '../types/rawMaterial';
import { categoryService, DEFAULT_GENERAL_CATEGORY_ID, productService } from '../services/productService';
import { rawMaterialService } from '../services/rawMaterialService';
import { recipeService } from '../services/recipeService';
import { generateUUID } from '../utils/uuid';
import ImageUploader from './ImageUploader';
import { AdminActionButton } from './ui/AdminActionButton';
import { TableActionButton } from './ui/TableActionButton';
import { ConfiguredDialogShell } from './ui/ConfiguredDialogShell';
import { ConfirmDialog } from './ui/ConfirmDialog';
import {
    DIALOG_CONTROL_CLASSES,
    dialogButtonClasses,
    useAppliedDialogStyle,
} from '../theme/dialogStyle';
import { DialogSectionTitle, DialogSwitch, DialogToggleRow } from './ui/dialogParts';

/**
 * Multi-step "Add Product" wizard (products reference kit):
 *   1 Product Info  → image, status, name, SKU, description, category
 *   2 Pricing       → price, takeaway price, tax (country-aware dropdown)
 *   3 Variants & Modifiers
 *   4 Ingredients   → recipe lines against raw materials + availability
 * Creation is confirmed ("Add Product?"); "Save as Draft" stores the product
 * inactive at any step. Editing existing products also uses this wizard.
 */

interface ProductWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    /** When set, the wizard edits this product in place (no draft/confirm step). */
    product?: LocalProduct | null;
}

interface IngredientRow {
    material: LocalRawMaterial;
    qty: number;
}

const STEP_KEYS = ['info', 'pricing', 'variants', 'ingredients'] as const;

const legacyInput = 'min-h-touch-sm w-full rounded-xl border border-gray-300 px-4 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500';

function suggestSku(name: string): string {
    const slug = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 14);
    if (!slug) return '';
    return `${slug}-${String(Math.floor(Math.random() * 900) + 100)}`;
}

const ProductWizard: React.FC<ProductWizardProps> = ({ isOpen, onClose, onSuccess, product = null }) => {
    const editing = product !== null;
    const { t } = useTranslation();
    const applied = useAppliedDialogStyle();
    const { settings } = useSettings();
    const currency = settings.pos.currencySymbol;
    const ivaRates = ivaRatesForCountry(settings.operatingCountry);
    const defaultIvaRate = getCountryProfile(settings.operatingCountry).defaultVatRate;

    const [step, setStep] = useState(0);
    const [categories, setCategories] = useState<LocalCategory[]>([]);
    const [materials, setMaterials] = useState<LocalRawMaterial[]>([]);

    const [imageUrl, setImageUrl] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [name, setName] = useState('');
    const [sku, setSku] = useState('');
    const [skuTouched, setSkuTouched] = useState(false);
    const [description, setDescription] = useState('');
    const [categoryId, setCategoryId] = useState('');

    const [price, setPrice] = useState<number | null>(null);
    const [takeawayPrice, setTakeawayPrice] = useState<number | null>(null);
    const [cost, setCost] = useState<number | null>(null);
    const [ivaRate, setIvaRate] = useState<number>(defaultIvaRate);

    const [variants, setVariants] = useState<ProductVariantAttribute[]>([]);
    const [expandedAttrs, setExpandedAttrs] = useState<Set<string>>(new Set());
    const [modifiers, setModifiers] = useState<ProductModifier[]>([]);

    const [unlimited, setUnlimited] = useState(false);
    const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
    const [ingredientSearch, setIngredientSearch] = useState('');

    const [errors, setErrors] = useState<{ name?: string; sku?: string; price?: string }>({});
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        // Fresh run every time the wizard opens; edit mode prefills from the product.
        setStep(0);
        setImageUrl(product?.image_url ?? '');
        setIsActive(product?.is_active ?? true);
        setName(product?.name ?? '');
        setSku(product?.sku ?? '');
        setSkuTouched(product !== null);
        setDescription(product?.description ?? '');
        setCategoryId(product?.category_id ?? '');
        setPrice(product ? product.price : null);
        setTakeawayPrice(product?.takeaway_price ?? null);
        setCost(product ? product.cost : null);
        setIvaRate(product?.iva_rate ?? defaultIvaRate);
        setVariants(product?.variants ?? []);
        setExpandedAttrs(new Set());
        setModifiers(product?.modifiers ?? []);
        setUnlimited(false); setIngredients([]); setIngredientSearch('');
        setErrors({}); setConfirmOpen(false); setSaveError('');
        void (async () => {
            await categoryService.ensureDefaultGeneralCategory();
            setCategories((await categoryService.getAllCategories()).filter((c: LocalCategory) => c.deleted_at === null && c.is_active));
            setMaterials(await rawMaterialService.list());
            if (product) {
                const lines = await recipeService.getForProduct(product.id);
                setIngredients(
                    lines
                        .filter(line => line.material)
                        .map(line => ({ material: line.material as LocalRawMaterial, qty: line.quantity_per_unit }))
                );
            }
        })();
    }, [isOpen, product, defaultIvaRate]);

    const fieldClass = applied
        ? `w-full bg-white outline-none ${DIALOG_CONTROL_CLASSES[applied.controls]}`
        : legacyInput;
    const buttons = applied ? dialogButtonClasses(applied) : null;

    const searchResults = useMemo(() => {
        const needle = ingredientSearch.trim().toLowerCase();
        if (!needle) return [];
        const usedIds = new Set(ingredients.map(row => row.material.id));
        return materials.filter(m => !usedIds.has(m.id) && m.name.toLowerCase().includes(needle)).slice(0, 6);
    }, [ingredientSearch, materials, ingredients]);

    const availability = useMemo(() => {
        if (unlimited || ingredients.length === 0) return null;
        const counts = ingredients
            .filter(row => row.qty > 0)
            .map(row => Math.floor(row.material.stock / row.qty));
        return counts.length ? Math.max(0, Math.min(...counts)) : null;
    }, [ingredients, unlimited]);

    if (!isOpen) return null;

    const validateStep = (target: number): boolean => {
        if (step === 0 && target > 0) {
            const next: typeof errors = {};
            if (!name.trim()) next.name = t('products.wizard.errorName');
            if (!sku.trim()) next.sku = t('products.wizard.errorSku');
            setErrors(next);
            if (next.name || next.sku) return false;
        }
        if (step === 1 && target > 1) {
            if (!(price && price > 0)) {
                setErrors(prev => ({ ...prev, price: t('products.wizard.errorPrice') }));
                return false;
            }
        }
        return true;
    };

    const goTo = (target: number) => {
        if (target > step && !validateStep(target)) return;
        setStep(Math.max(0, Math.min(STEP_KEYS.length - 1, target)));
    };

    const persist = async (asDraft: boolean) => {
        setSaving(true);
        setSaveError('');
        try {
            const category = categories.find(c => c.id === (categoryId || DEFAULT_GENERAL_CATEGORY_ID));
            const sharedFields = {
                name: name.trim(),
                description: description.trim() || null,
                sku: sku.trim(),
                category_id: category?.id ?? null,
                category_name: category?.name ?? null,
                price: price ?? 0,
                cost: cost ?? 0,
                iva_rate: ivaRate,
                image_url: imageUrl || null,
                is_active: asDraft ? false : isActive,
                takeaway_price: takeawayPrice,
                variants: variants.length ? variants : null,
                modifiers: modifiers.length ? modifiers : null,
            };

            let productId: string;
            if (editing && product) {
                productId = product.id;
                await productService.updateProduct(productId, sharedFields);
            } else {
                productId = await productService.createProduct({
                    ...sharedFields,
                    barcode: null,
                    stock: 0,
                    min_stock: 0,
                    track_stock: false,
                    sold_by_weight: false,
                    supplier: null,
                    location: null,
                    display_order: 0,
                    deleted_at: null,
                });
            }

            // Reconcile recipe lines with the ingredients step: desired rows are
            // upserted, rows removed in the dialog (or all, when availability is
            // unlimited) are deleted, and the recipe cost re-syncs when lines exist.
            const existingLines = editing ? await recipeService.getForProduct(productId) : [];
            const desired = unlimited ? [] : ingredients.filter(row => row.qty > 0);
            const desiredIds = new Set(desired.map(row => row.material.id));
            for (const line of existingLines) {
                if (!desiredIds.has(line.raw_material_id)) {
                    await recipeService.removeLine(line.id);
                }
            }
            for (const row of desired) {
                await recipeService.upsertLine(productId, row.material.id, row.qty);
            }
            if (desired.length) await recipeService.syncProductCost(productId);

            setConfirmOpen(false);
            onSuccess();
            onClose();
        } catch (persistError) {
            setConfirmOpen(false);
            setSaveError(persistError instanceof Error ? persistError.message : t('products.wizard.errorSave'));
        } finally {
            setSaving(false);
        }
    };

    const saveDraft = () => {
        if (!name.trim()) {
            setStep(0);
            setErrors(prev => ({ ...prev, name: t('products.wizard.errorName') }));
            return;
        }
        if (!sku.trim()) setSku(suggestSku(name));
        void persist(true);
    };

    // ---- Stepper -----------------------------------------------------------

    const accent = 'bg-[var(--ds2-confirm-bg,#22c55e)]';
    const stepper = (
        <div className="border-b border-slate-200 px-6 pb-4 pt-2">
            <div className="grid grid-cols-4">
                {STEP_KEYS.map((key, index) => {
                    const state = index < step ? 'done' : index === step ? 'current' : 'todo';
                    return (
                        <button type="button" key={key} onClick={() => goTo(index)} className="group flex flex-col justify-start text-center">
                            <div className="relative mb-2 flex h-6 w-full items-center justify-center">
                                {/* connector halves: the segment between steps i-1 and i is
                                    coloured once step i is reached (reference behaviour) */}
                                {index > 0 && (
                                    <span className={`absolute left-0 right-1/2 top-1/2 h-0.5 -translate-y-1/2 ${index <= step ? accent : 'bg-slate-200'}`} />
                                )}
                                {index < STEP_KEYS.length - 1 && (
                                    <span className={`absolute left-1/2 right-0 top-1/2 h-0.5 -translate-y-1/2 ${index < step ? accent : 'bg-slate-200'}`} />
                                )}
                                <span
                                    className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs ${
                                        state === 'done'
                                            ? `border-transparent text-white ${accent}`
                                            : state === 'current'
                                                ? 'border-[var(--ds2-confirm-bg,#22c55e)] bg-white'
                                                : 'border-slate-200 bg-white'
                                    }`}
                                >
                                    {state === 'done' ? <Check className="h-3.5 w-3.5" /> : state === 'current' ? <span className="h-2 w-2 rounded-full bg-[var(--ds2-confirm-bg,#22c55e)]" /> : null}
                                </span>
                            </div>
                            <p className="text-sm font-bold text-slate-950">{t(`products.wizard.step_${key}`)}</p>
                            <p className="hidden text-xs text-slate-500 sm:block">{t(`products.wizard.step_${key}_sub`)}</p>
                        </button>
                    );
                })}
            </div>
        </div>
    );

    // ---- Step bodies -------------------------------------------------------

    const labelClass = 'mb-1.5 block text-sm font-semibold text-slate-700';

    const infoStep = (
        <div className="space-y-4">
            <div>
                <span className={labelClass}>{t('products.wizard.imageLabel')}</span>
                <ImageUploader value={imageUrl} onChange={setImageUrl} onError={() => undefined} />
            </div>
            <DialogToggleRow
                title={t('products.wizard.statusLabel')}
                help={t('products.wizard.statusHelp')}
                checked={isActive}
                onChange={() => setIsActive(v => !v)}
            />
            <div>
                <span className={labelClass}>{t('products.wizard.nameLabel')} *</span>
                <input
                    value={name}
                    onChange={e => {
                        setName(e.target.value);
                        setErrors(prev => ({ ...prev, name: undefined }));
                        if (!skuTouched) setSku(suggestSku(e.target.value));
                    }}
                    className={fieldClass}
                    placeholder={t('products.wizard.namePlaceholder')}
                />
                {errors.name && <p className="mt-1.5 text-xs text-red-600">{errors.name}</p>}
            </div>
            <div>
                <span className={labelClass}>{t('products.wizard.skuLabel')} *</span>
                <input
                    value={sku}
                    onChange={e => { setSku(e.target.value); setSkuTouched(true); setErrors(prev => ({ ...prev, sku: undefined })); }}
                    className={fieldClass}
                    placeholder={t('products.wizard.skuPlaceholder')}
                />
                {errors.sku && <p className="mt-1.5 text-xs text-red-600">{errors.sku}</p>}
            </div>
            <div>
                <span className={labelClass}>{t('products.wizard.descriptionLabel')}</span>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className={`${fieldClass} min-h-20 py-3`} placeholder={t('products.wizard.descriptionPlaceholder')} />
            </div>
            <div>
                <span className={labelClass}>{t('products.wizard.categoryLabel')}</span>
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={fieldClass}>
                    <option value="">{t('products.wizard.categoryPlaceholder')}</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>
        </div>
    );

    const pricingStep = (
        <div className="space-y-4">
            <div>
                <span className={labelClass}>{t('products.wizard.priceLabel', { currency })} *</span>
                <input
                    type="number" step="any" min="0"
                    value={price ?? ''}
                    onChange={e => { setPrice(e.target.value === '' ? null : Number(e.target.value)); setErrors(prev => ({ ...prev, price: undefined })); }}
                    className={fieldClass}
                    placeholder="0.00"
                />
                {errors.price && <p className="mt-1.5 text-xs text-red-600">{errors.price}</p>}
            </div>
            <div>
                <span className={labelClass}>{t('products.form.cost')} ({currency})</span>
                <input
                    type="number" step="any" min="0"
                    value={cost ?? ''}
                    onChange={e => setCost(e.target.value === '' ? null : Number(e.target.value))}
                    className={fieldClass}
                    placeholder="0.00"
                />
                <p className="mt-1.5 text-xs text-slate-400">{t('products.wizard.costHint')}</p>
            </div>
            <div>
                <span className={labelClass}>{t('products.wizard.takeawayPriceLabel', { currency })}</span>
                <input
                    type="number" step="any" min="0"
                    value={takeawayPrice ?? ''}
                    onChange={e => setTakeawayPrice(e.target.value === '' ? null : Number(e.target.value))}
                    className={fieldClass}
                    placeholder="0.00"
                />
                <p className="mt-1.5 text-xs text-slate-400">{t('products.wizard.takeawayPriceHint')}</p>
            </div>
            <div>
                <span className={labelClass}>{t('products.wizard.taxLabel')}</span>
                <select value={ivaRate} onChange={e => setIvaRate(parseFloat(e.target.value))} className={fieldClass}>
                    {(() => {
                        const opts = ivaRates.map(r => ({ value: r.value as number, label: r.label as string }));
                        if (!opts.some(o => o.value === ivaRate)) {
                            opts.unshift({ value: ivaRate, label: `${Math.round(ivaRate * 100)}%` });
                        }
                        return opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>);
                    })()}
                </select>
            </div>
        </div>
    );

    const toggle = (on: boolean, onClick: () => void, label: string) => (
        <DialogSwitch small checked={on} onChange={onClick} label={label} />
    );

    const setAttr = (id: string, patch: Partial<ProductVariantAttribute>) =>
        setVariants(prev => prev.map(attr => (attr.id === id ? { ...attr, ...patch } : attr)));

    const variantsStep = (
        <div className="space-y-6">
            <div>
                <DialogSectionTitle className="mb-3">{t('products.wizard.variantHeading')}</DialogSectionTitle>
                <div className="space-y-3">
                    {variants.map(attr => {
                        const expanded = expandedAttrs.has(attr.id);
                        return (
                            <div key={attr.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                                <div className="flex items-center gap-3">
                                    {toggle(attr.enabled, () => setAttr(attr.id, { enabled: !attr.enabled }), attr.name || t('products.wizard.attributeName'))}
                                    <input
                                        value={attr.name}
                                        onChange={e => setAttr(attr.id, { name: e.target.value })}
                                        className={fieldClass}
                                        placeholder={t('products.wizard.attributeName')}
                                    />
                                    <TableActionButton variant="delete" icon={Trash2} type="button" aria-label={t('common.delete')} onClick={() => setVariants(prev => prev.filter(a => a.id !== attr.id))} />
                                    <AdminActionButton
                                        variant="icon"
                                        icon={expanded ? ChevronUp : ChevronDown}
                                        type="button"
                                        aria-label={expanded ? t('products.wizard.collapse') : t('products.wizard.expand')}
                                        onClick={() => setExpandedAttrs(prev => { const next = new Set(prev); if (expanded) next.delete(attr.id); else next.add(attr.id); return next; })}
                                    />
                                </div>
                                {expanded && (
                                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                                        {attr.options.map(option => (
                                            <div key={option.id} className="flex items-center gap-3">
                                                {toggle(option.enabled, () => setAttr(attr.id, { options: attr.options.map(o => o.id === option.id ? { ...o, enabled: !o.enabled } : o) }), option.name || t('products.wizard.variantName'))}
                                                <input
                                                    value={option.name}
                                                    onChange={e => setAttr(attr.id, { options: attr.options.map(o => o.id === option.id ? { ...o, name: e.target.value } : o) })}
                                                    className={fieldClass}
                                                    placeholder={t('products.wizard.variantName')}
                                                />
                                                <div className="relative w-36 shrink-0">
                                                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{currency}</span>
                                                    <input
                                                        type="number" step="any"
                                                        value={option.price_delta}
                                                        onChange={e => setAttr(attr.id, { options: attr.options.map(o => o.id === option.id ? { ...o, price_delta: Number(e.target.value) || 0 } : o) })}
                                                        className={`${fieldClass} pl-8`}
                                                    />
                                                </div>
                                                <TableActionButton variant="delete" icon={Trash2} type="button" aria-label={t('common.delete')} onClick={() => setAttr(attr.id, { options: attr.options.filter(o => o.id !== option.id) })} />
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() => setAttr(attr.id, { options: [...attr.options, { id: generateUUID(), name: '', price_delta: 0, enabled: true }] })}
                                            className="flex min-h-touch-xs items-center gap-2 rounded-xl bg-gradient-primary px-4 text-sm font-semibold text-white hover:opacity-90"
                                        >
                                            <Plus className="h-4 w-4" /> {t('products.wizard.addVariant')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    <button
                        type="button"
                        onClick={() => {
                            const id = generateUUID();
                            setVariants(prev => [...prev, { id, name: '', enabled: true, options: [{ id: generateUUID(), name: '', price_delta: 0, enabled: true }] }]);
                            setExpandedAttrs(prev => new Set(prev).add(id));
                        }}
                        className="flex min-h-touch-sm w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-white font-semibold text-slate-700 transition-all hover:border-purple-400 hover:bg-purple-50"
                    >
                        <Plus className="h-4 w-4" /> {t('products.wizard.addAttribute')}
                    </button>
                </div>
            </div>
            <div>
                <DialogSectionTitle className="mb-3">{t('products.wizard.modifiersHeading')}</DialogSectionTitle>
                <div className="space-y-2">
                    {modifiers.map(modifier => (
                        <div key={modifier.id} className="flex items-center gap-3">
                            {toggle(modifier.enabled, () => setModifiers(prev => prev.map(m => m.id === modifier.id ? { ...m, enabled: !m.enabled } : m)), modifier.name || t('products.wizard.modifierName'))}
                            <input
                                value={modifier.name}
                                onChange={e => setModifiers(prev => prev.map(m => m.id === modifier.id ? { ...m, name: e.target.value } : m))}
                                className={fieldClass}
                                placeholder={t('products.wizard.modifierName')}
                            />
                            <div className="relative w-36 shrink-0">
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{currency}</span>
                                <input
                                    type="number" step="any"
                                    value={modifier.price_delta}
                                    onChange={e => setModifiers(prev => prev.map(m => m.id === modifier.id ? { ...m, price_delta: Number(e.target.value) || 0 } : m))}
                                    className={`${fieldClass} pl-8`}
                                />
                            </div>
                            <TableActionButton variant="delete" icon={Trash2} type="button" aria-label={t('common.delete')} onClick={() => setModifiers(prev => prev.filter(m => m.id !== modifier.id))} />
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() => setModifiers(prev => [...prev, { id: generateUUID(), name: '', price_delta: 0, enabled: true }])}
                        className="flex min-h-touch-sm w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-white font-semibold text-slate-700 transition-all hover:border-purple-400 hover:bg-purple-50"
                    >
                        <Plus className="h-4 w-4" /> {t('products.wizard.addModifier')}
                    </button>
                </div>
            </div>
        </div>
    );

    const ingredientsStep = (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <p className="font-semibold text-slate-950">{t('products.wizard.unlimitedLabel')}</p>
                    <p className="text-sm text-slate-500">{t('products.wizard.unlimitedHelp')}</p>
                </div>
                {toggle(unlimited, () => setUnlimited(v => !v), t('products.wizard.unlimitedLabel'))}
            </div>
            <div className={unlimited ? 'pointer-events-none opacity-50' : ''}>
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                        value={ingredientSearch}
                        onChange={e => setIngredientSearch(e.target.value)}
                        className={`${fieldClass} pl-11`}
                        placeholder={t('products.wizard.searchIngredient')}
                    />
                    {searchResults.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                            {searchResults.map(material => (
                                <button
                                    key={material.id}
                                    type="button"
                                    onClick={() => { setIngredients(prev => [...prev, { material, qty: 1 }]); setIngredientSearch(''); }}
                                    className="flex min-h-10 w-full items-center justify-between px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                                >
                                    <span className="font-semibold text-slate-950">{material.name}</span>
                                    <span className="text-xs text-slate-400">{material.stock} {material.unit}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="mt-3 space-y-2">
                    {ingredients.map(row => (
                        <div key={row.material.id} className="flex items-center gap-3">
                            <div className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-600">{row.material.name}</div>
                            <div className="relative w-40 shrink-0">
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold uppercase text-slate-400">{t('products.wizard.qty')}</span>
                                <input
                                    type="number" step="any" min="0"
                                    value={row.qty}
                                    onChange={e => setIngredients(prev => prev.map(r => r.material.id === row.material.id ? { ...r, qty: Number(e.target.value) || 0 } : r))}
                                    className={`${fieldClass} pl-12`}
                                />
                            </div>
                            <TableActionButton variant="delete" icon={Trash2} type="button" aria-label={t('common.delete')} onClick={() => setIngredients(prev => prev.filter(r => r.material.id !== row.material.id))} />
                        </div>
                    ))}
                    {ingredients.length === 0 && (
                        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">{t('products.wizard.noIngredients')}</p>
                    )}
                </div>
                {ingredients.length > 0 && (
                    <div className="mt-3 text-sm text-slate-500">
                        {t('products.wizard.availabilityLabel')}
                        <span className="ml-1 text-xl font-bold text-slate-950">{unlimited || availability === null ? '—' : availability}</span>
                    </div>
                )}
            </div>
        </div>
    );

    const stepBodies = [infoStep, pricingStep, variantsStep, ingredientsStep];

    const body = (
        <div>
            {stepper}
            <div className="px-6 py-5">
                {saveError && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{saveError}</div>}
                {stepBodies[step]}
            </div>
        </div>
    );

    const isLast = step === STEP_KEYS.length - 1;
    const primaryAction = () => {
        if (!isLast) {
            goTo(step + 1);
            return;
        }
        setConfirmOpen(true);
    };

    const legacyBtn = {
        text: 'min-h-touch-sm px-4 font-semibold text-gray-700 hover:bg-gray-100 rounded-xl',
        outline: 'min-h-touch-sm rounded-xl border border-gray-300 px-4 font-semibold text-gray-700 hover:bg-gray-50',
        primary: 'min-h-touch-sm rounded-xl bg-green-600 px-6 font-semibold text-white hover:bg-green-700',
    };

    const footer = (
        <div className={buttons ? buttons.container : 'flex justify-end gap-3'}>
            <button type="button" onClick={onClose} className={buttons ? buttons.secondary : legacyBtn.text}>{t('common.cancel')}</button>
            {!editing && (
                <button type="button" disabled={saving} onClick={saveDraft} className={`${buttons ? buttons.secondary : legacyBtn.outline} disabled:cursor-not-allowed disabled:opacity-50`}>
                    {t('products.wizard.saveDraft')}
                </button>
            )}
            {step > 0 && (
                <button type="button" onClick={() => goTo(step - 1)} className={buttons ? buttons.secondary : legacyBtn.outline}>{t('products.wizard.back')}</button>
            )}
            <button type="button" disabled={saving} onClick={primaryAction} className={`${buttons ? buttons.primary : legacyBtn.primary} disabled:cursor-not-allowed disabled:opacity-50`}>
                {isLast ? (editing ? t('products.wizard.save') : t('products.wizard.add')) : t('products.wizard.next')}
            </button>
        </div>
    );

    const confirm = confirmOpen && (
        <ConfirmDialog
            tone="warning"
            title={editing ? t('products.wizard.confirmEditTitle') : t('products.wizard.confirmTitle')}
            message={editing ? t('products.wizard.confirmEditBody') : t('products.wizard.confirmBody')}
            cancelLabel={t('common.cancel')}
            confirmLabel={editing ? t('products.wizard.save') : t('products.wizard.add')}
            busy={saving}
            onCancel={() => setConfirmOpen(false)}
            onConfirm={() => void persist(false)}
            overlayClassName="z-[95]"
        />
    );

    if (applied) {
        return (
            <>
                <ConfiguredDialogShell
                    config={applied}
                    title={editing ? t('products.wizard.editTitle') : t('products.wizard.title')}
                    icon={Package}
                    onClose={onClose}
                    overlayClassName="z-[80]"
                    footer={footer}
                >
                    {body}
                </ConfiguredDialogShell>
                {confirm}
            </>
        );
    }

    return (
        <>
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={onClose} role="presentation">
                <div
                    className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                    role="dialog"
                    aria-modal
                    onClick={event => event.stopPropagation()}
                >
                    <div className="relative border-b bg-gray-100 px-6 py-4">
                        <h2 className="text-center text-xl font-bold text-gray-900">{editing ? t('products.wizard.editTitle') : t('products.wizard.title')}</h2>
                        <button type="button" onClick={onClose} aria-label={t('common.cancel')} className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-gray-500 hover:bg-gray-200">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
                    <div className="border-t border-gray-200 px-6 py-4">{footer}</div>
                </div>
            </div>
            {confirm}
        </>
    );
};

export default ProductWizard;
