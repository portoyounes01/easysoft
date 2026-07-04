import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Boxes, Pencil, Plus, Search, SlidersHorizontal, X } from 'lucide-react';

import { useSettings } from '../contexts/SettingsContext';
import { rawMaterialService, type RawMaterialInput } from '../services/rawMaterialService';
import { RAW_MATERIAL_UNITS, type LocalRawMaterial, type RawMaterialUnit } from '../types/rawMaterial';

const emptyForm: RawMaterialInput = {
    name: '',
    unit: 'pcs',
    stock: 0,
    cost: 0,
    min_stock: 0,
    supplier: '',
    is_active: true,
};

const Inventory: React.FC = () => {
    const { t } = useTranslation();
    const { settings } = useSettings();
    const currency = settings.pos.currencySymbol;

    const [materials, setMaterials] = useState<LocalRawMaterial[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');

    const [editing, setEditing] = useState<LocalRawMaterial | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<RawMaterialInput>(emptyForm);
    const [saving, setSaving] = useState(false);

    const [adjusting, setAdjusting] = useState<LocalRawMaterial | null>(null);
    const [adjustValue, setAdjustValue] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setMaterials(await rawMaterialService.list(true));
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
        });
        setShowForm(true);
    };

    const saveForm = async () => {
        if (!form.name.trim()) {
            setError(t('inventory.errorNameRequired'));
            return;
        }
        setSaving(true);
        setError('');
        try {
            if (editing) {
                await rawMaterialService.update(editing.id, form);
            } else {
                await rawMaterialService.create(form);
            }
            setShowForm(false);
            await load();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : t('inventory.errorSave'));
        } finally {
            setSaving(false);
        }
    };

    const applyAdjust = async () => {
        if (!adjusting) return;
        const next = Number(adjustValue.replace(',', '.'));
        if (!Number.isFinite(next) || next < 0) {
            setError(t('inventory.errorInvalidQuantity'));
            return;
        }
        setSaving(true);
        setError('');
        try {
            await rawMaterialService.setStock(adjusting.id, next);
            setAdjusting(null);
            setAdjustValue('');
            await load();
        } catch (adjustError) {
            setError(adjustError instanceof Error ? adjustError.message : t('inventory.errorAdjust'));
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="flex min-h-96 items-center justify-center text-slate-500">{t('inventory.loadingInventory')}</div>;
    }

    return (
        <div className="mx-auto max-w-[1500px] space-y-6 pt-6">
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
                    <button
                        type="button"
                        onClick={openCreate}
                        className="flex min-h-touch-sm items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-semibold text-white hover:bg-slate-800"
                    >
                        <Plus className="h-5 w-5" />
                        {t('inventory.addItem')}
                    </button>
                </div>
            </header>

            {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

            <div className="grid gap-4 sm:grid-cols-2">
                <SummaryCard icon={Boxes} label={t('inventory.rawItems')} value={String(materials.filter(m => m.is_active).length)} />
                <SummaryCard icon={AlertTriangle} label={t('inventory.lowOnStock')} value={String(lowStock.length)} warning={lowStock.length > 0} />
            </div>

            <section className="overflow-hidden rounded-[2rem] border border-white bg-white/85 shadow-xl">
                {filtered.length === 0 ? (
                    <div className="p-10 text-center text-slate-500">{t('inventory.emptyState')}</div>
                ) : (
                    <table className="w-full text-left text-sm">
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
                                            <div className="font-semibold text-slate-950">{material.name}</div>
                                            {material.supplier && <div className="text-xs text-slate-400">{material.supplier}</div>}
                                            {!material.is_active && <span className="text-xs text-slate-400">{t('inventory.inactiveTag')}</span>}
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
                                                <button
                                                    type="button"
                                                    onClick={() => { setAdjusting(material); setAdjustValue(String(material.stock)); }}
                                                    className="flex min-h-touch-xs items-center gap-1 rounded-xl bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                                                >
                                                    <SlidersHorizontal className="h-4 w-4" /> {t('inventory.adjust')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => openEdit(material)}
                                                    className="flex min-h-touch-xs items-center gap-1 rounded-xl bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                                                >
                                                    <Pencil className="h-4 w-4" /> {t('inventory.edit')}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </section>

            {/* Add / edit modal */}
            {showForm && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4">
                    <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
                        <div className="flex items-start justify-between">
                            <h2 className="text-2xl font-semibold text-slate-950">{editing ? t('inventory.editRawItem') : t('inventory.newRawItem')}</h2>
                            <button type="button" onClick={() => setShowForm(false)} className="flex min-h-touch-xs min-w-[2.75rem] items-center justify-center rounded-2xl bg-slate-100">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="mt-5 grid gap-4 sm:grid-cols-2">
                            <Field label={t('inventory.nameLabel')} className="sm:col-span-2">
                                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder={t('inventory.namePlaceholder')} />
                            </Field>
                            <Field label={t('inventory.unitLabel')}>
                                <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value as RawMaterialUnit })} className={inputClass}>
                                    {RAW_MATERIAL_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                                </select>
                            </Field>
                            <Field label={t('inventory.onHandWithUnit', { unit: form.unit })}>
                                <input type="number" step="any" min="0" value={form.stock} onChange={e => setForm({ ...form, stock: Number(e.target.value) || 0 })} className={inputClass} />
                            </Field>
                            <Field label={t('inventory.costWithUnit', { unit: form.unit, currency })}>
                                <input type="number" step="any" min="0" value={form.cost} onChange={e => setForm({ ...form, cost: Number(e.target.value) || 0 })} className={inputClass} />
                            </Field>
                            <Field label={t('inventory.lowStockAlertWithUnit', { unit: form.unit })}>
                                <input type="number" step="any" min="0" value={form.min_stock} onChange={e => setForm({ ...form, min_stock: Number(e.target.value) || 0 })} className={inputClass} />
                            </Field>
                            <Field label={t('inventory.supplierLabel')} className="sm:col-span-2">
                                <input value={form.supplier ?? ''} onChange={e => setForm({ ...form, supplier: e.target.value })} className={inputClass} placeholder={t('inventory.optionalPlaceholder')} />
                            </Field>
                            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 sm:col-span-2">
                                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4" />
                                {t('common.active')}
                            </label>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button type="button" onClick={() => setShowForm(false)} className="min-h-touch rounded-2xl bg-slate-100 px-5 font-semibold text-slate-700 hover:bg-slate-200">{t('common.cancel')}</button>
                            <button type="button" disabled={saving} onClick={() => void saveForm()} className="min-h-touch rounded-2xl bg-slate-950 px-6 font-semibold text-white disabled:bg-slate-300">
                                {saving ? t('common.saving') : t('inventory.save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Adjust stock modal */}
            {adjusting && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4">
                    <div className="w-full max-w-sm rounded-[2rem] bg-white p-6 shadow-2xl">
                        <div className="flex items-start justify-between">
                            <div>
                                <h2 className="text-xl font-semibold text-slate-950">{t('inventory.adjustStock')}</h2>
                                <p className="text-sm text-slate-500">{adjusting.name}</p>
                            </div>
                            <button type="button" onClick={() => setAdjusting(null)} className="flex min-h-touch-xs min-w-[2.75rem] items-center justify-center rounded-2xl bg-slate-100">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <Field label={t('inventory.newQuantityWithUnit', { unit: adjusting.unit })} className="mt-5">
                            <input
                                type="number"
                                step="any"
                                min="0"
                                autoFocus
                                value={adjustValue}
                                onChange={e => setAdjustValue(e.target.value)}
                                className={inputClass}
                            />
                        </Field>
                        <div className="mt-6 flex justify-end gap-3">
                            <button type="button" onClick={() => setAdjusting(null)} className="min-h-touch rounded-2xl bg-slate-100 px-5 font-semibold text-slate-700 hover:bg-slate-200">{t('common.cancel')}</button>
                            <button type="button" disabled={saving} onClick={() => void applyAdjust()} className="min-h-touch rounded-2xl bg-slate-950 px-6 font-semibold text-white disabled:bg-slate-300">
                                {saving ? t('common.saving') : t('inventory.setQuantity')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const inputClass = 'min-h-touch-sm w-full rounded-2xl border border-slate-300 px-4 outline-none focus:ring-4 focus:ring-slate-200';

const Field: React.FC<{ label: string; className?: string; children: React.ReactNode }> = ({ label, className = '', children }) => (
    <label className={`block text-sm font-semibold text-slate-700 ${className}`}>
        {label}
        <div className="mt-2">{children}</div>
    </label>
);

const SummaryCard: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string; value: string; warning?: boolean }> = ({ icon: Icon, label, value, warning = false }) => (
    <div className={`rounded-[2rem] border p-5 shadow-lg ${warning ? 'border-amber-200 bg-amber-50' : 'border-white bg-white/85'}`}>
        <Icon className={`h-6 w-6 ${warning ? 'text-amber-600' : 'text-slate-500'}`} />
        <p className="mt-4 text-sm text-slate-500">{label}</p>
        <p className="mt-1 text-3xl font-semibold text-slate-950">{value}</p>
    </div>
);

export default Inventory;
