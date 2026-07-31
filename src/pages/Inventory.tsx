import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Boxes, Minus, Pencil, Plus, Search, SlidersHorizontal, Trash2, Upload, X } from 'lucide-react';

import { useSettings } from '../contexts/SettingsContext';
import { ivaRatesForCountry } from '../types/supabase';
import { getCountryProfile } from '../lib/countryProfile';
import { rawMaterialService, type RawMaterialInput } from '../services/rawMaterialService';
import { categoryService, DEFAULT_GENERAL_CATEGORY_ID } from '../services/productService';
import type { LocalCategory } from '../types/supabase';
import { RAW_MATERIAL_UNITS, type LocalRawMaterial, type RawMaterialUnit } from '../types/rawMaterial';
import { ConfiguredDialogShell } from '../components/ui/ConfiguredDialogShell';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { DialogField, DialogToggleRow } from '../components/ui/dialogParts';
import { AdminActionButton } from '../components/ui/AdminActionButton';
import { TableActionButton } from '../components/ui/TableActionButton';
import { TabToggle } from '../components/ui/TabToggle';
import {
    DIALOG_CONTROL_CLASSES,
    dialogButtonClasses,
    useAppliedDialogStyle,
} from '../theme/dialogStyle';
import { useDesignSystem2Customization } from '../contexts/DesignSystem2CustomizationContext';
import '../styles/design-system-2-scope.css';

const emptyForm: RawMaterialInput = {
    name: '',
    unit: 'pcs',
    stock: 0,
    cost: 0,
    min_stock: 0,
    supplier: '',
    is_active: true,
    description: '',
    image_url: null,
    image_name: null,
    image_size: null,
    sell_enabled: false,
    sale_price: null,
    sale_iva_rate: null,
    sale_category_id: null,
};

const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
/** Longest edge after downscale — keeps data URLs small enough for Dexie rows. */
const IMAGE_MAX_EDGE = 512;

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} b`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kb`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} mb`;
}

/** Downscale to a JPEG data URL so a 2 MB photo doesn't bloat IndexedDB. */
async function readImageAsDataUrl(file: File): Promise<string> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.85);
}

const Inventory: React.FC = () => {
    const { t } = useTranslation();
    const applied = useAppliedDialogStyle();
    const { visualStyle, prefs } = useDesignSystem2Customization();
    const { settings } = useSettings();
    const currency = settings.pos.currencySymbol;
    // Country-aware IVA list + standard-rate default for sale-enabled items.
    const ivaRates = ivaRatesForCountry(settings.operatingCountry);
    const defaultIvaRate = getCountryProfile(settings.operatingCountry).defaultVatRate;

    const [materials, setMaterials] = useState<LocalRawMaterial[]>([]);
    const [categories, setCategories] = useState<LocalCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');

    const [editing, setEditing] = useState<LocalRawMaterial | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<RawMaterialInput>(emptyForm);
    const [formErrors, setFormErrors] = useState<{ name?: string; image?: string; price?: string }>({});
    const [imageMode, setImageMode] = useState<'upload' | 'url'>('upload');
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [adjusting, setAdjusting] = useState<LocalRawMaterial | null>(null);
    const [stockTab, setStockTab] = useState<'in' | 'out'>('in');
    const [stockQty, setStockQty] = useState(0);
    // Pending confirmation steps (reference kit: every mutation confirms first).
    const [confirmAdd, setConfirmAdd] = useState(false);
    const [confirmEdit, setConfirmEdit] = useState(false);
    const [confirmStock, setConfirmStock] = useState<'in' | 'out' | 'reset' | null>(null);
    const [deleting, setDeleting] = useState<LocalRawMaterial | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setMaterials(await rawMaterialService.list(true));
            setCategories((await categoryService.getAllCategories()).filter((c: LocalCategory) => c.deleted_at === null && c.is_active));
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : t('inventory.errorLoad'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const filtered = useMemo(
        () =>
            materials.filter(item =>
                `${item.name} ${item.supplier ?? ''}`.toLowerCase().includes(search.toLowerCase())
            ),
        [materials, search]
    );
    const lowStock = useMemo(
        () => materials.filter(item => item.is_active && item.min_stock > 0 && item.stock <= item.min_stock),
        [materials]
    );

    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm);
        setFormErrors({});
        setImageMode('upload');
        setShowForm(true);
    };

    const openEdit = (material: LocalRawMaterial) => {
        setEditing(material);
        setForm({
            name: material.name,
            unit: material.unit,
            stock: material.stock,
            cost: material.cost,
            min_stock: material.min_stock,
            supplier: material.supplier ?? '',
            is_active: material.is_active,
            description: material.description ?? '',
            image_url: material.image_url ?? null,
            image_name: material.image_name ?? null,
            image_size: material.image_size ?? null,
            sell_enabled: material.sell_enabled ?? false,
            sale_price: material.sale_price ?? null,
            sale_iva_rate: material.sale_iva_rate ?? null,
            sale_category_id: material.sale_category_id ?? null,
        });
        setFormErrors({});
        setImageMode(material.image_url && !material.image_url.startsWith('data:') ? 'url' : 'upload');
        setShowForm(true);
    };

    const pickImage = async (file: File | undefined) => {
        if (!file) return;
        if (file.type !== 'image/jpeg' && file.type !== 'image/png') {
            setFormErrors(prev => ({ ...prev, image: t('inventory.errorImageType') }));
            return;
        }
        if (file.size > IMAGE_MAX_BYTES) {
            setFormErrors(prev => ({ ...prev, image: t('inventory.errorImageSize') }));
            return;
        }
        try {
            const dataUrl = await readImageAsDataUrl(file);
            setForm(prev => ({ ...prev, image_url: dataUrl, image_name: file.name, image_size: file.size }));
            setFormErrors(prev => ({ ...prev, image: undefined }));
        } catch {
            setFormErrors(prev => ({ ...prev, image: t('inventory.errorImageType') }));
        }
    };

    const removeImage = () => {
        setForm(prev => ({ ...prev, image_url: null, image_name: null, image_size: null }));
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const saveForm = async () => {
        if (!form.name.trim()) {
            setFormErrors(prev => ({ ...prev, name: t('inventory.errorNameRequired') }));
            return;
        }
        if (form.sell_enabled && !(form.sale_price && form.sale_price > 0)) {
            setFormErrors(prev => ({ ...prev, price: t('inventory.errorPriceRequired') }));
            return;
        }
        if (!editing) {
            setConfirmAdd(true);
        } else {
            setConfirmEdit(true);
        }
    };

    const confirmUpdate = async () => {
        if (!editing) return;
        setSaving(true);
        setError('');
        try {
            await rawMaterialService.update(editing.id, form);
            setConfirmEdit(false);
            setShowForm(false);
            await load();
        } catch (saveError) {
            setConfirmEdit(false);
            setError(saveError instanceof Error ? saveError.message : t('inventory.errorSave'));
        } finally {
            setSaving(false);
        }
    };

    const confirmCreate = async () => {
        setSaving(true);
        setError('');
        try {
            await rawMaterialService.create(form);
            setConfirmAdd(false);
            setShowForm(false);
            await load();
        } catch (saveError) {
            setConfirmAdd(false);
            setError(saveError instanceof Error ? saveError.message : t('inventory.errorSave'));
        } finally {
            setSaving(false);
        }
    };

    const openAdjust = (material: LocalRawMaterial) => {
        setAdjusting(material);
        setStockTab('in');
        setStockQty(0);
    };

    const requestStockUpdate = (mode: 'in' | 'out' | 'reset') => {
        if (mode !== 'reset' && stockQty <= 0) {
            setError(t('inventory.errorInvalidQuantity'));
            return;
        }
        setError('');
        setConfirmStock(mode);
    };

    const confirmStockUpdate = async () => {
        if (!adjusting || !confirmStock) return;
        setSaving(true);
        setError('');
        try {
            if (confirmStock === 'reset') {
                await rawMaterialService.setStock(adjusting.id, 0);
            } else {
                await rawMaterialService.adjustStock(adjusting.id, confirmStock === 'in' ? stockQty : -stockQty);
            }
            setConfirmStock(null);
            setAdjusting(null);
            await load();
        } catch (adjustError) {
            setConfirmStock(null);
            setError(adjustError instanceof Error ? adjustError.message : t('inventory.errorAdjust'));
        } finally {
            setSaving(false);
        }
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        setSaving(true);
        setError('');
        try {
            await rawMaterialService.remove(deleting.id);
            setDeleting(null);
            await load();
        } catch (deleteError) {
            setDeleting(null);
            setError(
                deleteError instanceof Error && deleteError.message === 'RAW_MATERIAL_IN_USE'
                    ? t('inventory.errorDeleteInUse')
                    : t('inventory.errorDelete')
            );
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="ds2-visual-scope flex min-h-96 items-center justify-center text-slate-500" style={visualStyle} data-ds2-neutral={prefs.neutralFamilyId}>{t('inventory.loadingInventory')}</div>;
    }

    // Inputs follow the applied dialog style's controls axis; legacy class otherwise.
    const fieldClass = applied
        ? `w-full bg-white outline-none ${DIALOG_CONTROL_CLASSES[applied.controls]}`
        : inputClass;
    // Error state must strip the variant's own border/focus colour tokens, or they
    // tie on specificity and stylesheet order decides which border wins.
    const nameFieldClass = formErrors.name
        ? `${fieldClass
              .split(' ')
              .filter(c => !c.startsWith('border-') && !c.startsWith('focus:border-') && !c.startsWith('focus:ring-'))
              .join(' ')} border-red-500 focus:border-red-500 focus:ring-4 focus:ring-red-100`
        : fieldClass;

    const isWeightUnitForm = form.unit === 'kg' || form.unit === 'g';

    // Dialog interiors shared between the original panels and the applied-style shell.
    // Structure mirrors the inventory reference kit: image → name → description →
    // status toggle → stock/unit, keeping cost-per-unit and the low-stock alert.
    const formFields = (
        <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('inventory.imageLabel')} className="sm:col-span-2">
                {applied ? (
                    <div className="mb-2">
                        <TabToggle
                            options={[
                                { value: 'upload', label: t('inventory.imageModeUpload') },
                                { value: 'url', label: t('inventory.imageModeUrl') },
                            ]}
                            value={imageMode}
                            onChange={setImageMode}
                        />
                    </div>
                ) : (
                    <div className="mb-2 inline-flex rounded-xl bg-slate-100 p-1">
                        {(['upload', 'url'] as const).map(mode => (
                            <button
                                key={mode}
                                type="button"
                                aria-pressed={imageMode === mode}
                                onClick={() => setImageMode(mode)}
                                className={`min-h-touch-xs rounded-lg px-4 text-xs font-semibold transition-colors ${
                                    imageMode === mode ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'
                                }`}
                            >
                                {mode === 'upload' ? t('inventory.imageModeUpload') : t('inventory.imageModeUrl')}
                            </button>
                        ))}
                    </div>
                )}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    onChange={e => void pickImage(e.target.files?.[0])}
                />
                {imageMode === 'url' ? (
                    <div className="flex items-center gap-3">
                        <input
                            value={form.image_url && !form.image_url.startsWith('data:') ? form.image_url : ''}
                            onChange={e => {
                                const url = e.target.value.trim();
                                setForm(prev => ({ ...prev, image_url: url || null, image_name: null, image_size: null }));
                            }}
                            className={fieldClass}
                            placeholder="https://…"
                            inputMode="url"
                        />
                        {form.image_url && !form.image_url.startsWith('data:') && (
                            <img src={form.image_url} alt="" className="h-12 w-12 shrink-0 rounded-xl border border-slate-100 object-cover" />
                        )}
                    </div>
                ) : form.image_url ? (
                    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-3">
                        <img src={form.image_url} alt="" className="h-16 w-16 rounded-xl border border-slate-100 object-cover" />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-950">{form.image_name}</p>
                            {form.image_size != null && <p className="text-xs text-slate-400">{formatFileSize(form.image_size)}</p>}
                        </div>
                        <button
                            type="button"
                            onClick={removeImage}
                            aria-label={t('inventory.imageRemove')}
                            className={applied
                                ? 'inline-flex min-h-touch-xs min-w-touch-xs items-center justify-center rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50'
                                : 'flex min-h-touch-xs min-w-[2.75rem] items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-red-600'}
                        >
                            <Trash2 className="h-5 w-5" />
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className={applied
                            ? `flex w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-7 text-center transition-all hover:border-purple-400 hover:bg-purple-50 ${formErrors.image ? 'border-red-400' : 'border-gray-300'}`
                            : `flex w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed px-4 py-7 text-center hover:bg-slate-50 ${formErrors.image ? 'border-red-400' : 'border-slate-300'}`}
                    >
                        <Upload className="h-6 w-6 text-slate-400" />
                        <span className="text-sm font-semibold text-slate-950">{t('inventory.imageUploadCta')}</span>
                        <span className="text-xs text-slate-400">{t('inventory.imageUploadHint')}</span>
                    </button>
                )}
                {formErrors.image && <p className="mt-1.5 text-xs text-red-600">{formErrors.image}</p>}
            </Field>
            <Field label={t('inventory.nameLabel')} className="sm:col-span-2">
                <input
                    value={form.name}
                    onChange={e => { setForm({ ...form, name: e.target.value }); setFormErrors(prev => ({ ...prev, name: undefined })); }}
                    className={nameFieldClass}
                    placeholder={t('inventory.namePlaceholder')}
                />
                {formErrors.name && <p className="mt-1.5 text-xs text-red-600">{formErrors.name}</p>}
            </Field>
            <Field label={t('inventory.descriptionLabel')} className="sm:col-span-2">
                <textarea
                    value={form.description ?? ''}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    rows={3}
                    className={`${fieldClass} min-h-24 py-3`}
                    placeholder={t('inventory.descriptionPlaceholder')}
                />
            </Field>
            <DialogToggleRow
                className="sm:col-span-2"
                title={t('inventory.statusLabel')}
                help={t('inventory.statusHelp')}
                checked={form.sell_enabled ?? false}
                onChange={() =>
                    setForm(prev => ({
                        ...prev,
                        sell_enabled: !prev.sell_enabled,
                        // Sensible defaults the first time selling is enabled.
                        sale_iva_rate: !prev.sell_enabled && prev.sale_iva_rate == null ? defaultIvaRate : prev.sale_iva_rate,
                    }))
                }
            />
            {form.sell_enabled && (
                <>
                    <Field label={isWeightUnitForm ? t('inventory.salePricePerKg', { currency }) : t('inventory.salePrice', { currency })}>
                        <input
                            type="number"
                            step="any"
                            min="0"
                            value={form.sale_price ?? ''}
                            onChange={e => {
                                const value = e.target.value === '' ? null : Number(e.target.value);
                                setForm({ ...form, sale_price: value });
                                setFormErrors(prev => ({ ...prev, price: undefined }));
                            }}
                            className={fieldClass}
                            placeholder="0.00"
                        />
                        {formErrors.price && <p className="mt-1.5 text-xs text-red-600">{formErrors.price}</p>}
                    </Field>
                    <Field label={t('inventory.saleTax')}>
                        <select
                            value={form.sale_iva_rate ?? defaultIvaRate}
                            onChange={e => setForm({ ...form, sale_iva_rate: parseFloat(e.target.value) })}
                            className={fieldClass}
                        >
                            {(() => {
                                const opts = ivaRates.map(r => ({ value: r.value as number, label: r.label as string }));
                                const current = form.sale_iva_rate ?? defaultIvaRate;
                                if (!opts.some(o => o.value === current)) {
                                    opts.unshift({ value: current, label: `${Math.round(current * 100)}%` });
                                }
                                return opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>);
                            })()}
                        </select>
                    </Field>
                    <Field label={t('inventory.saleCategory')} className="sm:col-span-2">
                        <select
                            value={form.sale_category_id ?? ''}
                            onChange={e => setForm({ ...form, sale_category_id: e.target.value || null })}
                            className={fieldClass}
                        >
                            <option value="">{t('inventory.saleCategoryDefault')}</option>
                            {categories
                                .filter(c => c.id !== DEFAULT_GENERAL_CATEGORY_ID)
                                .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </Field>
                </>
            )}
            <DialogToggleRow
                className="sm:col-span-2"
                title={t('inventory.activeLabel')}
                help={t('inventory.activeHelp')}
                checked={form.is_active}
                onChange={() => setForm({ ...form, is_active: !form.is_active })}
            />
            <Field label={t('inventory.stockWithUnit', { unit: form.unit })}>
                <input type="number" step="any" min="0" value={form.stock} onChange={e => setForm({ ...form, stock: Number(e.target.value) || 0 })} className={fieldClass} />
            </Field>
            <Field label={t('inventory.unitLabel')}>
                <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value as RawMaterialUnit })} className={fieldClass}>
                    {RAW_MATERIAL_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
            </Field>
            <Field label={t('inventory.costWithUnit', { unit: form.unit, currency })}>
                <input type="number" step="any" min="0" value={form.cost} onChange={e => setForm({ ...form, cost: Number(e.target.value) || 0 })} className={fieldClass} />
            </Field>
            <Field label={t('inventory.lowStockAlertWithUnit', { unit: form.unit })}>
                <input type="number" step="any" min="0" value={form.min_stock} onChange={e => setForm({ ...form, min_stock: Number(e.target.value) || 0 })} className={fieldClass} />
            </Field>
        </div>
    );

    const updateItemBody = adjusting ? (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
                <span className="min-w-0 truncate font-semibold text-slate-950">{adjusting.name}</span>
                <span className="shrink-0 text-sm text-slate-500">
                    {t('inventory.currentStock')}: <b className="text-slate-950">{adjusting.stock}</b> {adjusting.unit}
                </span>
            </div>
            {applied ? (
                <TabToggle
                    options={[
                        { value: 'in', label: t('inventory.stockIn') },
                        { value: 'out', label: t('inventory.stockOut') },
                    ]}
                    value={stockTab}
                    onChange={setStockTab}
                />
            ) : (
                <div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
                    {(['in', 'out'] as const).map(tab => (
                        <button
                            key={tab}
                            type="button"
                            aria-pressed={stockTab === tab}
                            onClick={() => setStockTab(tab)}
                            className={`min-h-touch-xs rounded-xl text-sm font-semibold transition-colors ${
                                stockTab === tab ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'
                            }`}
                        >
                            {tab === 'in' ? t('inventory.stockIn') : t('inventory.stockOut')}
                        </button>
                    ))}
                </div>
            )}
            <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <p className="font-semibold text-slate-950">{t('inventory.numberOfItems')}</p>
                    <p className="text-sm text-slate-500">
                        {stockTab === 'in' ? t('inventory.stockInHelp') : t('inventory.stockOutHelp')}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-1 rounded-full bg-slate-100 p-1">
                    <button
                        type="button"
                        aria-label={t('inventory.decrease')}
                        onClick={() => setStockQty(q => Math.max(0, q - 1))}
                        className={applied
                            ? 'flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white font-semibold text-gray-900 hover:bg-gray-50'
                            : 'flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm hover:text-slate-950'}
                    >
                        <Minus className="h-4 w-4" />
                    </button>
                    <input
                        type="number"
                        min="0"
                        step="any"
                        value={stockQty}
                        onChange={e => setStockQty(Math.max(0, Number(e.target.value) || 0))}
                        className="w-14 bg-transparent text-center font-semibold text-slate-950 outline-none"
                    />
                    <button
                        type="button"
                        aria-label={t('inventory.increase')}
                        onClick={() => setStockQty(q => q + 1)}
                        className={applied
                            ? 'flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white font-semibold text-gray-900 hover:bg-gray-50'
                            : 'flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm hover:text-slate-950'}
                    >
                        <Plus className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    const shellButtons = applied ? dialogButtonClasses(applied) : null;

    return (
        <div className="ds2-visual-scope mx-auto max-w-[1500px] space-y-6 pt-6" style={visualStyle} data-ds2-neutral={prefs.neutralFamilyId}>
            <header className="flex flex-col gap-4 rounded-[2rem] border border-white bg-white/85 p-6 shadow-xl sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">{t('inventory.stockEyebrow')}</p>
                    <h1 className="mt-1 text-3xl font-semibold text-slate-950">{t('inventory.pageTitle')}</h1>
                    <p className="mt-2 text-slate-500">{t('inventory.subtitle')}</p>
                </div>
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                        <input
                            value={search}
                            onChange={event => setSearch(event.target.value)}
                            placeholder={t('inventory.searchPlaceholder')}
                            className="min-h-touch-sm w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 outline-none focus:ring-4 focus:ring-slate-200"
                        />
                    </div>
                    <AdminActionButton
                        type="button"
                        variant="primary"
                        icon={Plus}
                        label={t('inventory.addItem')}
                        onClick={openCreate}
                    />
                </div>
            </header>

            {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <SummaryCard icon={Boxes} label={t('inventory.rawItems')} value={String(materials.filter(m => m.is_active).length)} />
                <SummaryCard icon={AlertTriangle} label={t('inventory.lowOnStock')} value={String(lowStock.length)} warning={lowStock.length > 0} />
            </div>

            <section className="overflow-hidden rounded-[2rem] border border-white bg-white/85 shadow-xl">
                {filtered.length === 0 ? (
                    <div className="p-10 text-center text-slate-500">{t('inventory.emptyState')}</div>
                ) : (
                    <>
                    {/* Mobile: 6-column table reflowed to cards (was crushed inside overflow-hidden at 390px) */}
                    <div className="divide-y divide-slate-100 md:hidden">
                        {filtered.map(material => {
                            const low = material.min_stock > 0 && material.stock <= material.min_stock;
                            return (
                                <div key={material.id} className={`p-4 ${material.is_active ? '' : 'opacity-50'}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <MaterialThumb material={material} />
                                            <div className="min-w-0">
                                                <div className="font-semibold text-slate-950">{material.name}</div>
                                                {material.supplier && <div className="text-xs text-slate-400">{material.supplier}</div>}
                                                {!material.is_active && <span className="text-xs text-slate-400">{t('inventory.inactiveTag')}</span>}
                                            </div>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <span className={`font-semibold ${low ? 'text-amber-600' : 'text-slate-950'}`}>
                                                {material.stock} {material.unit}
                                                {low && <AlertTriangle className="ml-1 inline h-4 w-4" />}
                                            </span>
                                            {material.min_stock > 0 && (
                                                <div className="text-xs text-slate-400">{t('inventory.minStock', { value: material.min_stock })}</div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mt-2 flex items-center justify-between gap-3">
                                        <div className="text-xs text-slate-500">
                                            {currency}{material.cost.toFixed(2)}/{material.unit}
                                            <span className="mx-1.5 text-slate-300">·</span>
                                            {t('inventory.columnStockValue')}: {currency}{(material.cost * material.stock).toFixed(2)}
                                        </div>
                                        <div className="flex shrink-0 gap-2">
                                            <TableActionButton
                                                type="button"
                                                variant="edit"
                                                icon={SlidersHorizontal}
                                                label={t('inventory.adjust')}
                                                onClick={() => openAdjust(material)}
                                            />
                                            <TableActionButton
                                                type="button"
                                                variant="edit"
                                                icon={Pencil}
                                                label={t('inventory.edit')}
                                                onClick={() => openEdit(material)}
                                            />
                                            <TableActionButton
                                                type="button"
                                                variant="delete"
                                                icon={Trash2}
                                                aria-label={t('inventory.delete')}
                                                onClick={() => setDeleting(material)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <table className="hidden w-full text-left text-sm md:table">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                                <th className="px-5 py-3">{t('inventory.columnItem')}</th>
                                <th className="px-5 py-3">{t('inventory.columnUnit')}</th>
                                <th className="px-5 py-3 text-right">{t('inventory.columnOnHand')}</th>
                                <th className="px-5 py-3 text-right">{t('inventory.columnCostPerUnit')}</th>
                                <th className="px-5 py-3 text-right">{t('inventory.columnStockValue')}</th>
                                <th className="px-5 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filtered.map(material => {
                                const low = material.min_stock > 0 && material.stock <= material.min_stock;
                                return (
                                    <tr key={material.id} className={material.is_active ? '' : 'opacity-50'}>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-3">
                                                <MaterialThumb material={material} />
                                                <div className="min-w-0">
                                                    <div className="font-semibold text-slate-950">{material.name}</div>
                                                    {material.supplier && <div className="text-xs text-slate-400">{material.supplier}</div>}
                                                    {!material.is_active && <span className="text-xs text-slate-400">{t('inventory.inactiveTag')}</span>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-slate-600">{material.unit}</td>
                                        <td className="px-5 py-3 text-right font-semibold">
                                            <span className={low ? 'text-amber-600' : 'text-slate-950'}>
                                                {material.stock}
                                                {low && <AlertTriangle className="ml-1 inline h-4 w-4" />}
                                            </span>
                                            {material.min_stock > 0 && (
                                                <div className="text-xs font-normal text-slate-400">{t('inventory.minStock', { value: material.min_stock })}</div>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-right text-slate-600">{currency}{material.cost.toFixed(2)}</td>
                                        <td className="px-5 py-3 text-right text-slate-600">{currency}{(material.cost * material.stock).toFixed(2)}</td>
                                        <td className="px-5 py-3">
                                            <div className="flex justify-end gap-2">
                                                <TableActionButton
                                                    type="button"
                                                    variant="edit"
                                                    icon={SlidersHorizontal}
                                                    label={t('inventory.adjust')}
                                                    onClick={() => openAdjust(material)}
                                                />
                                                <TableActionButton
                                                    type="button"
                                                    variant="edit"
                                                    icon={Pencil}
                                                    label={t('inventory.edit')}
                                                    onClick={() => openEdit(material)}
                                                />
                                                <TableActionButton
                                                    type="button"
                                                    variant="delete"
                                                    icon={Trash2}
                                                    aria-label={t('inventory.delete')}
                                                    onClick={() => setDeleting(material)}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    </>
                )}
            </section>

            {/* Add / edit modal */}
            {showForm && (applied && shellButtons ? (
                <ConfiguredDialogShell
                    config={applied}
                    title={editing ? t('inventory.editRawItem') : t('inventory.newRawItem')}
                    icon={Boxes}
                    onClose={() => setShowForm(false)}
                    overlayClassName="z-[80]"
                    footer={
                        <div className={shellButtons.container}>
                            <button type="button" onClick={() => setShowForm(false)} className={shellButtons.secondary}>{t('common.cancel')}</button>
                            <button type="button" disabled={saving} onClick={() => void saveForm()} className={`${shellButtons.primary} disabled:cursor-not-allowed disabled:opacity-50`}>
                                {saving ? t('common.saving') : t('inventory.save')}
                            </button>
                        </div>
                    }
                >
                    <div className="px-6 py-5">{formFields}</div>
                </ConfiguredDialogShell>
            ) : (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4">
                    <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
                        <div className="flex items-start justify-between">
                            <h2 className="text-2xl font-semibold text-slate-950">{editing ? t('inventory.editRawItem') : t('inventory.newRawItem')}</h2>
                            <button type="button" onClick={() => setShowForm(false)} className="flex min-h-touch-xs min-w-[2.75rem] items-center justify-center rounded-2xl bg-slate-100">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="mt-5">{formFields}</div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button type="button" onClick={() => setShowForm(false)} className="min-h-touch rounded-2xl bg-slate-100 px-5 font-semibold text-slate-700 hover:bg-slate-200">{t('common.cancel')}</button>
                            <button type="button" disabled={saving} onClick={() => void saveForm()} className="min-h-touch rounded-2xl bg-slate-950 px-6 font-semibold text-white disabled:bg-slate-300">
                                {saving ? t('common.saving') : t('inventory.save')}
                            </button>
                        </div>
                    </div>
                </div>
            ))}

            {/* Update item (stock in / stock out) modal */}
            {adjusting && (applied && shellButtons ? (
                <ConfiguredDialogShell
                    config={applied}
                    title={t('inventory.updateItem')}
                    subtitle={adjusting.name}
                    icon={SlidersHorizontal}
                    onClose={() => setAdjusting(null)}
                    overlayClassName="z-[80]"
                    footer={
                        <div className={shellButtons.container}>
                            <button type="button" onClick={() => setAdjusting(null)} className={shellButtons.secondary}>{t('common.cancel')}</button>
                            {stockTab === 'out' && (
                                <button type="button" disabled={saving} onClick={() => requestStockUpdate('reset')} className={`${shellButtons.dangerOutline} disabled:cursor-not-allowed disabled:opacity-50`}>
                                    {t('inventory.resetStock')}
                                </button>
                            )}
                            {stockTab === 'in' ? (
                                <button type="button" disabled={saving} onClick={() => requestStockUpdate('in')} className={`${shellButtons.primary} disabled:cursor-not-allowed disabled:opacity-50`}>
                                    {t('inventory.stockIn')}
                                </button>
                            ) : (
                                <button type="button" disabled={saving} onClick={() => requestStockUpdate('out')} className={`${shellButtons.danger} disabled:cursor-not-allowed disabled:opacity-50`}>
                                    {t('inventory.stockOut')}
                                </button>
                            )}
                        </div>
                    }
                >
                    <div className="px-6 py-5">{updateItemBody}</div>
                </ConfiguredDialogShell>
            ) : (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4">
                    <div className="max-h-full w-full max-w-md overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
                        <div className="flex items-start justify-between">
                            <div>
                                <h2 className="text-xl font-semibold text-slate-950">{t('inventory.updateItem')}</h2>
                                <p className="text-sm text-slate-500">{adjusting.name}</p>
                            </div>
                            <button type="button" onClick={() => setAdjusting(null)} className="flex min-h-touch-xs min-w-[2.75rem] items-center justify-center rounded-2xl bg-slate-100">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="mt-5">{updateItemBody}</div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button type="button" onClick={() => setAdjusting(null)} className="min-h-touch rounded-2xl bg-slate-100 px-5 font-semibold text-slate-700 hover:bg-slate-200">{t('common.cancel')}</button>
                            {stockTab === 'out' && (
                                <button type="button" disabled={saving} onClick={() => requestStockUpdate('reset')} className="min-h-touch rounded-2xl border border-red-300 px-5 font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                                    {t('inventory.resetStock')}
                                </button>
                            )}
                            {stockTab === 'in' ? (
                                <button type="button" disabled={saving} onClick={() => requestStockUpdate('in')} className="min-h-touch rounded-2xl bg-green-600 px-6 font-semibold text-white hover:bg-green-700 disabled:bg-slate-300">
                                    {t('inventory.stockIn')}
                                </button>
                            ) : (
                                <button type="button" disabled={saving} onClick={() => requestStockUpdate('out')} className="min-h-touch rounded-2xl bg-red-600 px-6 font-semibold text-white hover:bg-red-700 disabled:bg-slate-300">
                                    {t('inventory.stockOut')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            ))}

            {/* Confirmation steps (reference kit) */}
            {confirmAdd && (
                <ConfirmDialog
                    tone="warning"
                    title={t('inventory.confirmAddTitle')}
                    message={t('inventory.confirmAddBody')}
                    cancelLabel={t('common.cancel')}
                    confirmLabel={t('inventory.confirmAddCta')}
                    busy={saving}
                    onCancel={() => setConfirmAdd(false)}
                    onConfirm={() => void confirmCreate()}
                />
            )}
            {confirmEdit && (
                <ConfirmDialog
                    tone="warning"
                    title={t('inventory.confirmEditTitle')}
                    message={t('inventory.confirmEditBody')}
                    cancelLabel={t('common.cancel')}
                    confirmLabel={t('inventory.confirmEditCta')}
                    busy={saving}
                    onCancel={() => setConfirmEdit(false)}
                    onConfirm={() => void confirmUpdate()}
                />
            )}
            {confirmStock && (
                <ConfirmDialog
                    tone="warning"
                    title={t('inventory.confirmStockTitle')}
                    message={t('inventory.confirmStockBody')}
                    cancelLabel={t('common.cancel')}
                    confirmLabel={t('inventory.confirmStockCta')}
                    busy={saving}
                    onCancel={() => setConfirmStock(null)}
                    onConfirm={() => void confirmStockUpdate()}
                />
            )}
            {deleting && (
                <ConfirmDialog
                    tone="danger"
                    title={t('inventory.confirmDeleteTitle')}
                    message={t('inventory.confirmDeleteBody')}
                    cancelLabel={t('common.cancel')}
                    confirmLabel={t('inventory.confirmDeleteCta')}
                    busy={saving}
                    onCancel={() => setDeleting(null)}
                    onConfirm={() => void confirmDelete()}
                />
            )}
        </div>
    );
};

const inputClass = 'min-h-touch-sm w-full rounded-2xl border border-slate-300 px-4 outline-none focus:ring-4 focus:ring-slate-200';

const MaterialThumb: React.FC<{ material: LocalRawMaterial }> = ({ material }) =>
    material.image_url ? (
        <img src={material.image_url} alt="" className="h-10 w-10 shrink-0 rounded-xl border border-slate-100 object-cover" />
    ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <Boxes className="h-5 w-5" />
        </span>
    );

// Canonical field wrapper shared with the dialog-lab previews (ui/dialogParts).
const Field = DialogField;

const SummaryCard: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string; value: string; warning?: boolean }> = ({ icon: Icon, label, value, warning = false }) => (
    <div className={`rounded-[2rem] border p-5 shadow-lg ${warning ? 'border-amber-200 bg-amber-50' : 'border-white bg-white/85'}`}>
        <Icon className={`h-6 w-6 ${warning ? 'text-amber-600' : 'text-slate-500'}`} />
        <p className="mt-4 text-sm text-slate-500">{label}</p>
        <p className="mt-1 text-3xl font-semibold text-slate-950">{value}</p>
    </div>
);

export default Inventory;
