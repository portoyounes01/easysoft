import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Package, Plus, X } from 'lucide-react';

import { useSettings } from '../contexts/SettingsContext';
import type { LocalProduct } from '../types/supabase';
import type { CartLineOptions } from '../contexts/POSContext';
import { ConfiguredDialogShell } from './ui/ConfiguredDialogShell';
import {
    DIALOG_CONTROL_CLASSES,
    dialogButtonClasses,
    useAppliedDialogStyle,
} from '../theme/dialogStyle';
import { useDialogTokens } from './ui/dialogParts';

/**
 * POS item-options dialog (reference kit): quantity stepper, one single-select
 * chip row per enabled variant attribute (first option preselected), priced
 * multi-select add-ons, free-text notes and a running total. "Add" emits the
 * selection; the caller folds the per-unit price delta into the cart line.
 */

interface ProductOptionsDialogProps {
    product: LocalProduct;
    onClose: () => void;
    onAdd: (quantity: number, options: CartLineOptions) => void;
}

const OptionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const t = useDialogTokens();
    return <p className={`mb-2 text-sm font-semibold ${t.p.titleText}`}>{children}</p>;
};

const ProductOptionsDialog: React.FC<ProductOptionsDialogProps> = ({ product, onClose, onAdd }) => {
    const { t } = useTranslation();
    const applied = useAppliedDialogStyle();
    const { settings } = useSettings();
    const currency = settings.pos.currencySymbol;

    const attributes = useMemo(
        () => (product.variants ?? [])
            .filter(attr => attr.enabled && attr.options.some(o => o.enabled))
            .map(attr => ({ ...attr, options: attr.options.filter(o => o.enabled) })),
        [product.variants]
    );
    const addOns = useMemo(
        () => (product.modifiers ?? []).filter(m => m.enabled),
        [product.modifiers]
    );

    const [quantity, setQuantity] = useState(1);
    // attribute id -> selected option id (first enabled option preselected).
    const [selected, setSelected] = useState<Record<string, string>>(() =>
        Object.fromEntries(attributes.map(attr => [attr.id, attr.options[0]?.id]))
    );
    const [chosenAddOns, setChosenAddOns] = useState<Set<string>>(new Set());
    const [notes, setNotes] = useState('');

    const perUnitDelta = useMemo(() => {
        const variantDelta = attributes.reduce((sum, attr) => {
            const option = attr.options.find(o => o.id === selected[attr.id]);
            return sum + (option?.price_delta ?? 0);
        }, 0);
        const addOnDelta = addOns.reduce((sum, m) => sum + (chosenAddOns.has(m.id) ? m.price_delta : 0), 0);
        return variantDelta + addOnDelta;
    }, [attributes, addOns, selected, chosenAddOns]);

    const total = (product.price + perUnitDelta) * quantity;
    const format = (value: number) => `${currency}${value.toFixed(2)}`;

    const submit = () => {
        onAdd(quantity, {
            selections: attributes.map(attr => {
                const option = attr.options.find(o => o.id === selected[attr.id]) ?? attr.options[0];
                return { attribute: attr.name, option: option.name, priceDelta: option.price_delta };
            }),
            addOns: addOns.filter(m => chosenAddOns.has(m.id)).map(m => ({ name: m.name, priceDelta: m.price_delta })),
            notes: notes.trim() || null,
            priceDelta: perUnitDelta,
        });
        onClose();
    };

    const inputClass = applied
        ? `w-full bg-white outline-none ${DIALOG_CONTROL_CLASSES[applied.controls]}`
        : 'min-h-touch-sm w-full rounded-xl border border-gray-300 px-4 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500';

    const chip = (active: boolean) =>
        `flex min-h-touch-sm items-center justify-between gap-3 rounded-xl border px-4 text-sm font-semibold transition-colors ${
            active
                ? 'border-[var(--ds2-confirm-bg,#22c55e)] bg-[var(--ds2-cash-bg,#f0fdf4)] text-slate-950'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
        }`;

    const header = (
        <div className="flex items-start gap-4">
            {product.image_url ? (
                <img src={product.image_url} alt="" className="h-16 w-16 shrink-0 rounded-2xl border border-slate-100 object-cover" />
            ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                    <Package className="h-7 w-7" />
                </span>
            )}
            <div className="min-w-0">
                <h3 className="truncate text-lg font-bold text-slate-950">{product.name}</h3>
                {product.description && <p className="line-clamp-2 text-sm text-slate-500">{product.description}</p>}
                <p className="mt-1 font-semibold text-slate-950">{format(product.price)}{product.sold_by_weight ? '/kg' : ''}</p>
            </div>
        </div>
    );

    const body = (
        <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
                <span className="font-semibold text-slate-950">{t('pos.options.qty')}</span>
                <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
                    <button
                        type="button"
                        aria-label={t('pos.options.decrease')}
                        onClick={() => setQuantity(q => Math.max(1, q - 1))}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm hover:text-slate-950"
                    >
                        <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-10 text-center font-semibold text-slate-950">{quantity}</span>
                    <button
                        type="button"
                        aria-label={t('pos.options.increase')}
                        onClick={() => setQuantity(q => q + 1)}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm hover:text-slate-950"
                    >
                        <Plus className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {attributes.map(attr => (
                <div key={attr.id}>
                    <OptionLabel>{attr.name}</OptionLabel>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {attr.options.map(option => (
                            <button
                                key={option.id}
                                type="button"
                                aria-pressed={selected[attr.id] === option.id}
                                onClick={() => setSelected(prev => ({ ...prev, [attr.id]: option.id }))}
                                className={chip(selected[attr.id] === option.id)}
                            >
                                <span className="truncate">{option.name}</span>
                                <span className="shrink-0 text-slate-500">+ {format(option.price_delta)}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ))}

            {addOns.length > 0 && (
                <div>
                    <OptionLabel>{t('pos.options.addOns')}</OptionLabel>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {addOns.map(modifier => (
                            <button
                                key={modifier.id}
                                type="button"
                                aria-pressed={chosenAddOns.has(modifier.id)}
                                onClick={() => setChosenAddOns(prev => {
                                    const next = new Set(prev);
                                    if (next.has(modifier.id)) next.delete(modifier.id); else next.add(modifier.id);
                                    return next;
                                })}
                                className={chip(chosenAddOns.has(modifier.id))}
                            >
                                <span className="truncate">{modifier.name}</span>
                                <span className="shrink-0 text-slate-500">+ {format(modifier.price_delta)}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div>
                <OptionLabel>{t('pos.options.notes')}</OptionLabel>
                <input
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className={inputClass}
                    placeholder={t('pos.options.notesPlaceholder')}
                />
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
                <span className="text-slate-500">{t('pos.options.total')}</span>
                <span className="text-2xl font-bold text-slate-950">{format(total)}</span>
            </div>
        </div>
    );

    if (applied) {
        const buttons = dialogButtonClasses(applied);
        return (
            <ConfiguredDialogShell
                config={applied}
                title={product.name}
                subtitle={product.description ?? undefined}
                icon={Package}
                onClose={onClose}
                overlayClassName="z-[85]"
                footer={
                    <div className={buttons.container}>
                        <button type="button" onClick={onClose} className={buttons.secondary}>{t('common.cancel')}</button>
                        <button type="button" onClick={submit} className={buttons.primary}>{t('pos.options.add')}</button>
                    </div>
                }
            >
                <div className="px-6 py-5">{body}</div>
            </ConfiguredDialogShell>
        );
    }

    return (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4" onClick={onClose} role="presentation">
            <div
                className="flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
                role="dialog"
                aria-modal
                onClick={event => event.stopPropagation()}
            >
                <div className="relative border-b border-slate-100 bg-slate-50/60 px-6 py-5">
                    {header}
                    <button type="button" onClick={onClose} aria-label={t('common.cancel')} className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{body}</div>
                <div className="border-t border-slate-100 px-6 py-4">
                    <div className="grid grid-cols-2 gap-3">
                        <button type="button" onClick={onClose} className="min-h-touch rounded-xl border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50">
                            {t('common.cancel')}
                        </button>
                        <button type="button" onClick={submit} className="min-h-touch rounded-xl bg-green-600 font-semibold text-white hover:bg-green-700">
                            {t('pos.options.add')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductOptionsDialog;
