import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, UtensilsCrossed } from 'lucide-react';

import { rawMaterialService } from '../services/rawMaterialService';
import { recipeService } from '../services/recipeService';
import type { LocalRawMaterial, RecipeLineWithMaterial } from '../types/rawMaterial';
import { useSettings } from '../contexts/SettingsContext';
import { TableActionButton } from './ui/TableActionButton';

interface RecipeEditorProps {
    /** The product whose recipe is edited. Null when creating (recipe added after first save). */
    productId: string | null;
}

/**
 * Fiche technique: the raw ingredients (and per-unit quantities) a product
 * consumes when sold. Lines persist immediately so the editor needs no parent
 * save wiring. Only meaningful for an already-saved product.
 */
const RecipeEditor: React.FC<RecipeEditorProps> = ({ productId }) => {
    const { t } = useTranslation();
    const { settings } = useSettings();
    const currency = settings.pos.currencySymbol;

    const [materials, setMaterials] = useState<LocalRawMaterial[]>([]);
    const [lines, setLines] = useState<RecipeLineWithMaterial[]>([]);
    const [selectedMaterial, setSelectedMaterial] = useState('');
    const [quantity, setQuantity] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!productId) return;
        const [mats, recipe] = await Promise.all([
            rawMaterialService.list(),
            recipeService.getForProduct(productId),
        ]);
        setMaterials(mats);
        setLines(recipe);
    }, [productId]);

    useEffect(() => {
        void load();
    }, [load]);

    const usedIds = useMemo(() => new Set(lines.map(line => line.raw_material_id)), [lines]);
    const available = materials.filter(material => !usedIds.has(material.id));
    const ingredientCost = useMemo(
        () => lines.reduce((sum, line) => sum + line.quantity_per_unit * (line.material?.cost ?? 0), 0),
        [lines]
    );

    const addLine = async () => {
        if (!productId || !selectedMaterial) return;
        const qty = Number(quantity.replace(',', '.'));
        if (!Number.isFinite(qty) || qty <= 0) {
            setError(t('recipeEditor.errorQuantityGreaterThanZero'));
            return;
        }
        setBusy(true);
        setError('');
        try {
            await recipeService.upsertLine(productId, selectedMaterial, qty);
            setSelectedMaterial('');
            setQuantity('');
            await load();
        } catch (addError) {
            setError(addError instanceof Error ? addError.message : t('recipeEditor.errorAddIngredient'));
        } finally {
            setBusy(false);
        }
    };

    const removeLine = async (lineId: string) => {
        setBusy(true);
        try {
            await recipeService.removeLine(lineId);
            await load();
        } finally {
            setBusy(false);
        }
    };

    if (!productId) {
        return (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
                {t('products.recipe.saveFirst')}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {materials.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
                    {t('products.recipe.noMaterials')}
                </div>
            ) : (
                <>
                    {lines.length > 0 && (
                        <div className="space-y-2">
                            {lines.map(line => (
                                <div key={line.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                                    <div className="min-w-0">
                                        <span className="font-medium text-gray-900">{line.material?.name ?? '—'}</span>
                                        <span className="ml-2 text-sm text-gray-500">
                                            {t('recipeEditor.perUnit', { quantity: line.quantity_per_unit, unit: line.material?.unit ?? '' })}
                                        </span>
                                    </div>
                                    <TableActionButton
                                        variant="delete"
                                        icon={Trash2}
                                        type="button"
                                        onClick={() => void removeLine(line.id)}
                                        disabled={busy}
                                        aria-label={t('products.recipe.remove')}
                                    />
                                </div>
                            ))}
                            <div className="flex justify-end px-1 text-sm text-gray-500">
                                {t('products.recipe.ingredientCost')}: <span className="ml-1 font-semibold text-gray-900">{currency}{ingredientCost.toFixed(2)}</span>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-[10rem] flex-1">
                            <label className="mb-1 block text-xs font-semibold text-gray-600">{t('products.recipe.ingredient')}</label>
                            <select
                                value={selectedMaterial}
                                onChange={e => setSelectedMaterial(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            >
                                <option value="">{t('products.recipe.selectIngredient')}</option>
                                {available.map(material => (
                                    <option key={material.id} value={material.id}>
                                        {material.name} ({material.unit})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="w-28">
                            <label className="mb-1 block text-xs font-semibold text-gray-600">{t('products.recipe.qtyPerUnit')}</label>
                            <input
                                value={quantity}
                                onChange={e => setQuantity(e.target.value.replace(/[^0-9.,]/g, ''))}
                                inputMode="decimal"
                                placeholder="0"
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => void addLine()}
                            disabled={busy || !selectedMaterial}
                            className="flex items-center gap-1 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Plus className="h-4 w-4" />
                            {t('products.recipe.add')}
                        </button>
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <p className="flex items-center gap-1 text-xs text-gray-400">
                        <UtensilsCrossed className="h-3.5 w-3.5" />
                        {t('products.recipe.hint')}
                    </p>
                </>
            )}
        </div>
    );
};

export default RecipeEditor;
