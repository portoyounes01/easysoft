import React from 'react';
import {
    CreditCard,
    Edit2,
    Eye,
    Filter,
    LayoutGrid,
    List,
    Monitor,
    Package,
    Pencil,
    Plus,
    Printer,
    Settings,
    ShoppingCart,
    Trash2,
    Utensils,
} from 'lucide-react';
import { ActionButton } from './ui/ActionButton';
import { AdminActionButton } from './ui/AdminActionButton';
import { POSActionButton } from './ui/POSActionButton';
import { NumpadButton } from './ui/NumpadButton';
import { PairingButton } from './ui/PairingButton';
import { PaymentMethodButton } from './ui/PaymentMethodButton';
import { TabToggle } from './ui/TabToggle';
import { TabButton } from './ui/TabButton';
import { TableActionButton } from './ui/TableActionButton';
import { CategoryFilterButton } from './ui/CategoryFilterButton';
import { OutlineButton } from './ui/OutlineButton';
import { DashedCardButton } from './ui/DashedCardButton';
import { ProductCard } from './ui/ProductCard';
import { DialogSwitch, DialogToggleRow } from './ui/dialogParts';

/**
 * Button lab specimen registry — canonical (shared-component) population.
 *
 * Each specimen renders the REAL component import, so anything that follows
 * the Appearances tokens updates live inside the `.ds2-visual-scope`, exactly
 * as it does in production. `reacts` is a display badge only — the rendering
 * itself is the source of truth.
 *
 * The inline/hardcoded population lives in buttonLabInlineSpecimens.tsx
 * (verbatim class strings extracted from the codebase).
 */

export type SpecimenGroup =
    | 'pos-action'
    | 'dialog-action'
    | 'admin-restricted'
    | 'table-row-action'
    | 'tab-toggle'
    | 'toggle-switch'
    | 'filter-chip'
    | 'payment-method-selector'
    | 'numpad-key'
    | 'pairing-device'
    | 'card-clickable'
    | 'dashboard-nav'
    | 'form-control'
    | 'icon-utility'
    | 'misc';

export type SpecimenReacts = 'full' | 'partial' | 'none';

/** One real button in the app that renders with this specimen's style. */
export interface SpecimenInstance {
    /** Short label as it appears in the UI (cleaned for preview rendering). */
    label: string;
    /** file or file:line of the usage site. */
    ref: string;
    /** Extra context from the audit (original long label, variant hints…). */
    note?: string;
}

export interface ButtonSpecimen {
    /** Stable id — the future select/edit layer references specimens by this key. */
    key: string;
    name: string;
    group: SpecimenGroup;
    /** Orthogonal badge 1: shared component import vs inline hardcoded replica. */
    source: 'component' | 'inline';
    /** Which styling system the classes come from. */
    system: 'canonical' | 'ds1' | 'ds2' | 'dialog-system' | 'hardcoded';
    /** Orthogonal badge 2 (display only — the live render is the truth). */
    reacts: SpecimenReacts;
    reactsDetail?: string;
    /** file or file:line references. */
    refs: string[];
    /** Rendered instances this style covers across the app (from the button audit). */
    instanceCount?: number;
    stateNote?: string;
    notes?: string;
    /** Preview surface: sidebar buttons need their dark rail. */
    surface?: 'light' | 'dark';
    /**
     * Real app buttons using this style (from the button audit). Canonical
     * specimens get theirs from buttonLabCanonicalInstances; inline specimens
     * embed theirs directly.
     */
    instances?: SpecimenInstance[];
    /**
     * Renders the specimen. When the user picks an instance from the card's
     * list, its label is passed in so the preview shows THAT button; with no
     * argument the built-in example renders.
     */
    render: (label?: string) => React.ReactNode;
}

export const GROUP_LABELS: Record<SpecimenGroup, string> = {
    'pos-action': 'POS actions',
    'dialog-action': 'Dialog actions',
    'admin-restricted': 'Admin actions',
    'table-row-action': 'Table row actions',
    'tab-toggle': 'Tabs & segmented toggles',
    'toggle-switch': 'Toggle switches',
    'filter-chip': 'Filter chips',
    'payment-method-selector': 'Payment method selectors',
    'numpad-key': 'Numpad keys',
    'pairing-device': 'Pairing & devices',
    'card-clickable': 'Clickable cards',
    'dashboard-nav': 'Dashboard navigation',
    'form-control': 'Form controls',
    'icon-utility': 'Icon utilities',
    'misc': 'Miscellaneous',
};

export const GROUP_ORDER: SpecimenGroup[] = [
    'pos-action',
    'dialog-action',
    'admin-restricted',
    'table-row-action',
    'tab-toggle',
    'toggle-switch',
    'filter-chip',
    'payment-method-selector',
    'numpad-key',
    'pairing-device',
    'card-clickable',
    'dashboard-nav',
    'form-control',
    'icon-utility',
    'misc',
];

const noop = () => undefined;

export const CANONICAL_SPECIMENS: ButtonSpecimen[] = [
    // ── ActionButton (ui/ActionButton.tsx) ────────────────────────────────
    {
        key: 'action-button-primary',
        name: 'ActionButton · primary',
        group: 'dialog-action',
        source: 'component',
        system: 'canonical',
        reacts: 'full',
        reactsDetail: 'bg-gradient-primary + rounded-[12px] are remapped',
        refs: ['src/components/ui/ActionButton.tsx:27'],
        stateNote: 'Page-surface path; inside an applied dialog shell it follows the dialog style instead',
        render: (label) => <ActionButton variant="primary" label={label ?? 'Process Transaction'} onClick={noop} />,
    },
    {
        key: 'action-button-secondary',
        name: 'ActionButton · secondary',
        group: 'dialog-action',
        source: 'component',
        system: 'canonical',
        reacts: 'partial',
        reactsDetail: 'radius reacts; gray-200 surface is static',
        refs: ['src/components/ui/ActionButton.tsx:28'],
        render: (label) => <ActionButton variant="secondary" label={label ?? 'Cancel'} onClick={noop} />,
    },
    {
        key: 'action-button-outline',
        name: 'ActionButton · outline',
        group: 'dialog-action',
        source: 'component',
        system: 'canonical',
        reacts: 'partial',
        reactsDetail: 'rounded-2xl reacts; white/gray surface is static',
        refs: ['src/components/ui/ActionButton.tsx:29'],
        render: (label) => <ActionButton variant="outline" label={label ?? 'View Details'} onClick={noop} />,
    },

    // ── AdminActionButton (ui/AdminActionButton.tsx) ──────────────────────
    {
        key: 'admin-action-primary',
        name: 'AdminActionButton · primary',
        group: 'admin-restricted',
        source: 'component',
        system: 'canonical',
        reacts: 'full',
        reactsDetail: 'blue gradient follows the interface colour',
        refs: ['src/components/ui/AdminActionButton.tsx:26'],
        notes: 'Audit finding: "primary" hardcodes blue — the info token, not the app primary green',
        render: (label) => <AdminActionButton variant="primary" icon={Plus} label={label ?? 'Add Product'} onClick={noop} />,
    },
    {
        key: 'admin-action-outline',
        name: 'AdminActionButton · outline',
        group: 'admin-restricted',
        source: 'component',
        system: 'canonical',
        reacts: 'partial',
        reactsDetail: 'rounded-2xl reacts; surface static',
        refs: ['src/components/ui/AdminActionButton.tsx:27'],
        render: (label) => <AdminActionButton variant="outline" icon={Filter} label={label ?? 'Filters'} onClick={noop} />,
    },
    {
        key: 'admin-action-ghost',
        name: 'AdminActionButton · ghost',
        group: 'admin-restricted',
        source: 'component',
        system: 'canonical',
        reacts: 'partial',
        reactsDetail: 'radius reacts; hover gray static',
        refs: ['src/components/ui/AdminActionButton.tsx:28'],
        render: (label) => <AdminActionButton variant="ghost" icon={Settings} label={label ?? 'Options'} onClick={noop} />,
    },
    {
        key: 'admin-action-icon',
        name: 'AdminActionButton · icon',
        group: 'icon-utility',
        source: 'component',
        system: 'canonical',
        reacts: 'partial',
        reactsDetail: 'radius reacts',
        refs: ['src/components/ui/AdminActionButton.tsx:29'],
        render: () => <AdminActionButton variant="icon" icon={Printer} aria-label="Print" onClick={noop} />,
    },
    {
        key: 'admin-action-success',
        name: 'AdminActionButton · success',
        group: 'admin-restricted',
        source: 'component',
        system: 'canonical',
        reacts: 'partial',
        reactsDetail: 'bg-green-600 is NOT remapped (only green-500 is) — radius reacts',
        refs: ['src/components/ui/AdminActionButton.tsx:30'],
        render: (label) => <AdminActionButton variant="success" icon={Plus} label={label ?? 'Save'} onClick={noop} />,
    },

    // ── POSActionButton (ui/POSActionButton.tsx) ──────────────────────────
    {
        key: 'pos-action-default',
        name: 'POSActionButton · default',
        group: 'pos-action',
        source: 'component',
        system: 'canonical',
        reacts: 'partial',
        reactsDetail: 'rounded-xl reacts; white/gray surface static',
        refs: ['src/components/ui/POSActionButton.tsx:21'],
        render: (label) => <POSActionButton icon={Printer} label={label ?? 'Print'} onClick={noop} />,
    },
    {
        key: 'pos-action-disabled',
        name: 'POSActionButton · disabled',
        group: 'pos-action',
        source: 'component',
        system: 'canonical',
        reacts: 'partial',
        refs: ['src/components/ui/POSActionButton.tsx:22'],
        render: (label) => <POSActionButton icon={CreditCard} label={label ?? 'Charge'} disabled onClick={noop} />,
    },

    // ── NumpadButton (ui/NumpadButton.tsx) ────────────────────────────────
    {
        key: 'numpad-default',
        name: 'NumpadButton · default',
        group: 'numpad-key',
        source: 'component',
        system: 'canonical',
        reacts: 'partial',
        reactsDetail: 'rounded-2xl reacts; gray key surface static',
        refs: ['src/components/ui/NumpadButton.tsx:20'],
        render: (label) => <NumpadButton label={label ?? 7} onClick={noop} className="w-16" />,
    },
    {
        key: 'numpad-action',
        name: 'NumpadButton · action',
        group: 'numpad-key',
        source: 'component',
        system: 'canonical',
        reacts: 'full',
        reactsDetail: 'bg-blue-100 / text-blue-900 remapped to interface tint',
        refs: ['src/components/ui/NumpadButton.tsx:21'],
        render: (label) => <NumpadButton variant="action" label={label ?? 'C'} onClick={noop} className="w-16" />,
    },
    {
        key: 'numpad-confirm',
        name: 'NumpadButton · confirm',
        group: 'numpad-key',
        source: 'component',
        system: 'canonical',
        reacts: 'full',
        reactsDetail: 'bg-green-500 remapped to the primary colour',
        refs: ['src/components/ui/NumpadButton.tsx:22'],
        render: (label) => <NumpadButton variant="confirm" label={label ?? 'OK'} onClick={noop} />,
    },

    // ── PairingButton (ui/PairingButton.tsx) ──────────────────────────────
    {
        key: 'pairing-primary',
        name: 'PairingButton · primary',
        group: 'pairing-device',
        source: 'component',
        system: 'canonical',
        reacts: 'full',
        reactsDetail: 'blue→purple gradient remapped to pairing vars',
        refs: ['src/components/ui/PairingButton.tsx:20'],
        render: (label) => <PairingButton variant="primary" icon={Monitor} label={label ?? 'Pair Device'} onClick={noop} />,
    },
    {
        key: 'pairing-secondary',
        name: 'PairingButton · secondary',
        group: 'pairing-device',
        source: 'component',
        system: 'canonical',
        reacts: 'partial',
        refs: ['src/components/ui/PairingButton.tsx:21'],
        render: (label) => <PairingButton variant="secondary" label={label ?? 'Cancel'} onClick={noop} />,
    },

    // ── PaymentMethodButton (ui/PaymentMethodButton.tsx) ──────────────────
    {
        key: 'payment-method-selected',
        name: 'PaymentMethodButton · selected',
        group: 'payment-method-selector',
        source: 'component',
        system: 'canonical',
        reacts: 'full',
        reactsDetail: 'bg-green-50 / border-green-500 / text-green-600 remapped',
        refs: ['src/components/ui/PaymentMethodButton.tsx:33'],
        render: (label) => <PaymentMethodButton selected method="cash" icon={CreditCard} label={label ?? 'Cash'} onClick={noop} />,
    },
    {
        key: 'payment-method-unselected',
        name: 'PaymentMethodButton · unselected',
        group: 'payment-method-selector',
        source: 'component',
        system: 'dialog-system',
        reacts: 'partial',
        reactsDetail: 'border/tint come from dialog palette tokens; rounded-[10px] reacts',
        refs: ['src/components/ui/PaymentMethodButton.tsx:35'],
        render: (label) => <PaymentMethodButton selected={false} method="card" icon={CreditCard} label={label ?? 'Card'} onClick={noop} />,
    },

    // ── TabToggle (ui/TabToggle.tsx) ──────────────────────────────────────
    {
        key: 'tab-toggle',
        name: 'TabToggle · segmented pair',
        group: 'tab-toggle',
        source: 'component',
        system: 'canonical',
        reacts: 'partial',
        reactsDetail: 'indicator bg-primary-600 + rounded-[10px] react; gray track static',
        refs: ['src/components/ui/TabToggle.tsx'],
        render: (label) => (
            <div className="w-56">
                <TabToggle
                    options={[
                        { value: 'eatin', label: label ?? 'Eat in', icon: Utensils },
                        { value: 'takeaway', label: 'Takeaway', icon: ShoppingCart },
                    ]}
                    value="eatin"
                    onChange={noop}
                />
            </div>
        ),
    },

    // ── TabButton (ui/TabButton.tsx) ──────────────────────────────────────
    {
        key: 'tab-button-reports-active',
        name: 'TabButton · reports, active',
        group: 'tab-toggle',
        source: 'component',
        system: 'canonical',
        reacts: 'full',
        reactsDetail: 'border-blue-500 / bg-blue-50 / text-blue-900 remapped to interface colour',
        refs: ['src/components/ui/TabButton.tsx:38'],
        render: (label) => <TabButton active variant="reports" icon={List} label={label ?? 'Overview'} onClick={noop} />,
    },
    {
        key: 'tab-button-reports-inactive',
        name: 'TabButton · reports, inactive',
        group: 'tab-toggle',
        source: 'component',
        system: 'canonical',
        reacts: 'none',
        refs: ['src/components/ui/TabButton.tsx:39'],
        render: (label) => <TabButton active={false} variant="reports" icon={LayoutGrid} label={label ?? 'Products'} onClick={noop} />,
    },
    {
        key: 'tab-button-sidebar-active',
        name: 'TabButton · sidebar, active',
        group: 'dashboard-nav',
        source: 'component',
        system: 'canonical',
        reacts: 'full',
        reactsDetail: 'blue gradient pill remapped to interface colour',
        refs: ['src/components/ui/TabButton.tsx:23'],
        surface: 'dark',
        render: (label) => <TabButton active variant="sidebar" icon={Package} label={label ?? 'Products'} onClick={noop} />,
    },
    {
        key: 'tab-button-sidebar-inactive',
        name: 'TabButton · sidebar, inactive',
        group: 'dashboard-nav',
        source: 'component',
        system: 'canonical',
        reacts: 'partial',
        reactsDetail: 'rounded-lg reacts; slate rail hover + yellow hover text static',
        refs: ['src/components/ui/TabButton.tsx:24'],
        surface: 'dark',
        render: (label) => <TabButton active={false} variant="sidebar" icon={Settings} label={label ?? 'Settings'} onClick={noop} />,
    },

    // ── TableActionButton (ui/TableActionButton.tsx) ──────────────────────
    {
        key: 'table-action-sort',
        name: 'TableActionButton · sort',
        group: 'table-row-action',
        source: 'component',
        system: 'canonical',
        reacts: 'partial',
        refs: ['src/components/ui/TableActionButton.tsx:18'],
        render: (label) => <TableActionButton variant="sort" icon={Filter} label={label ?? 'Sort'} onClick={noop} />,
    },
    {
        key: 'table-action-icon',
        name: 'TableActionButton · icon',
        group: 'table-row-action',
        source: 'component',
        system: 'canonical',
        reacts: 'partial',
        refs: ['src/components/ui/TableActionButton.tsx:19'],
        render: () => <TableActionButton variant="icon" icon={Eye} aria-label="View" onClick={noop} />,
    },
    {
        key: 'table-action-delete',
        name: 'TableActionButton · delete',
        group: 'table-row-action',
        source: 'component',
        system: 'canonical',
        reacts: 'partial',
        reactsDetail: 'red is static; rounded-lg reacts',
        refs: ['src/components/ui/TableActionButton.tsx:20'],
        render: () => <TableActionButton variant="delete" icon={Trash2} aria-label="Delete" onClick={noop} />,
    },
    {
        key: 'table-action-edit',
        name: 'TableActionButton · edit',
        group: 'table-row-action',
        source: 'component',
        system: 'canonical',
        reacts: 'full',
        reactsDetail: 'bg-blue-600 / hover:bg-blue-700 remapped to interface colour',
        refs: ['src/components/ui/TableActionButton.tsx:21'],
        render: (label) => <TableActionButton variant="edit" icon={Edit2} label={label ?? 'Edit'} onClick={noop} />,
    },

    // ── CategoryFilterButton (ui/CategoryFilterButton.tsx) ────────────────
    {
        key: 'category-filter-selected',
        name: 'CategoryFilterButton · selected',
        group: 'filter-chip',
        source: 'component',
        system: 'canonical',
        reacts: 'full',
        reactsDetail: 'indicator bg-gradient-primary + text-primary-600/900 remapped',
        refs: ['src/components/ui/CategoryFilterButton.tsx'],
        render: (label) => <CategoryFilterButton label={label ?? 'Drinks'} icon={Utensils} isSelected onClick={noop} />,
    },
    {
        key: 'category-filter-unselected',
        name: 'CategoryFilterButton · unselected',
        group: 'filter-chip',
        source: 'component',
        system: 'canonical',
        reacts: 'partial',
        reactsDetail: 'neutral text follows the neutral family',
        refs: ['src/components/ui/CategoryFilterButton.tsx'],
        render: (label) => <CategoryFilterButton label={label ?? 'Snacks'} icon={Package} isSelected={false} onClick={noop} />,
    },

    // ── OutlineButton / DashedCardButton ──────────────────────────────────
    {
        key: 'outline-button',
        name: 'OutlineButton',
        group: 'misc',
        source: 'component',
        system: 'canonical',
        reacts: 'partial',
        reactsDetail: 'rounded-2xl reacts; surface static',
        refs: ['src/components/ui/OutlineButton.tsx'],
        render: (label) => <OutlineButton label={label ?? 'Manage'} onClick={noop} className="px-5 py-2.5" />,
    },
    {
        key: 'dashed-card-button',
        name: 'DashedCardButton',
        group: 'card-clickable',
        source: 'component',
        system: 'canonical',
        reacts: 'partial',
        reactsDetail: 'purple hover accents are static; rounded-lg reacts',
        refs: ['src/components/ui/DashedCardButton.tsx'],
        render: (label) => (
            <div className="h-40 w-44">
                <DashedCardButton icon={Plus} label={label ?? 'Add Product'} onClick={noop} />
            </div>
        ),
    },

    // ── ProductCard (ui/ProductCard.tsx) ──────────────────────────────────
    {
        key: 'product-card',
        name: 'ProductCard · in cart',
        group: 'card-clickable',
        source: 'component',
        system: 'canonical',
        reacts: 'full',
        reactsDetail: 'cart badge bg-gradient-primary + bar bg-primary-600 + rounded-xl remapped',
        refs: ['src/components/ui/ProductCard.tsx'],
        render: (label) => <ProductCard name={label ?? 'Espresso'} price={1.4} stock={42} cartQuantity={2} onClick={noop} />,
    },

    // ── dialogParts widgets ───────────────────────────────────────────────
    {
        key: 'dialog-switch-on',
        name: 'DialogSwitch · on',
        group: 'toggle-switch',
        source: 'component',
        system: 'dialog-system',
        reacts: 'full',
        reactsDetail: 'on-colour is var(--ds2-confirm-bg) — follows the primary colour directly',
        refs: ['src/components/ui/dialogParts.tsx:107'],
        render: () => <DialogSwitch checked onChange={noop} label="Active" />,
    },
    {
        key: 'dialog-switch-off',
        name: 'DialogSwitch · off',
        group: 'toggle-switch',
        source: 'component',
        system: 'dialog-system',
        reacts: 'none',
        reactsDetail: 'off track bg-slate-300 static',
        refs: ['src/components/ui/dialogParts.tsx:114'],
        render: () => <DialogSwitch checked={false} onChange={noop} label="Inactive" />,
    },
    {
        key: 'dialog-toggle-row',
        name: 'DialogToggleRow · status row',
        group: 'toggle-switch',
        source: 'component',
        system: 'dialog-system',
        reacts: 'full',
        reactsDetail: 'switch follows primary; card border/tint from dialog palette; rounded-2xl reacts',
        refs: ['src/components/ui/dialogParts.tsx:121'],
        render: (label) => (
            <div className="w-72">
                <DialogToggleRow title={label ?? 'Active'} help="Product is sellable" checked onChange={noop} />
            </div>
        ),
    },

    // ── Pencil-edit icon (representative of icon-utility via TableActionButton) ──
    {
        key: 'table-action-icon-pencil',
        name: 'TableActionButton · icon (edit pencil)',
        group: 'icon-utility',
        source: 'component',
        system: 'canonical',
        reacts: 'partial',
        refs: ['src/components/ui/TableActionButton.tsx:19'],
        render: () => <TableActionButton variant="icon" icon={Pencil} aria-label="Edit" onClick={noop} />,
    },
];
