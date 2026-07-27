import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import {
    Check,
    AlertCircle,
    Edit3,
    LayoutGrid,
    Plus,
    RotateCw,
    Save,
    Search,
    Trash2,
    X,
} from 'lucide-react';
import { usePOS } from '../contexts/POSContext';
import { tableOrderService } from '../services/tableOrderService';
import { uiLocale } from '../utils/locale';
import { ConfiguredDialogShell } from '../components/ui/ConfiguredDialogShell';
import { AdminActionButton } from '../components/ui/AdminActionButton';
import { ListRow } from '../components/ui/ListRow';
import { TableActionButton } from '../components/ui/TableActionButton';
import { dialogButtonClasses, useAppliedDialogStyle } from '../theme/dialogStyle';
import { useDesignSystem2Customization } from '../contexts/DesignSystem2CustomizationContext';
import '../styles/design-system-2-scope.css';
import type {
    LocalTableOrder,
    TableOrderGlobalDiscount,
    TableOrderPointsRedemption,
} from '../types/supabase';

type TableCapacity = 2 | 4 | 6;
type TableStatus = 'available' | 'used' | 'settling';
type TableShape = 'round' | 'square' | 'wide';
type StatusFilter = 'all' | 'available' | 'used';
type CapacityFilter = 'all' | TableCapacity;
type DialogKind =
    | 'add'
    | 'confirm-add'
    | 'edit'
    | 'save'
    | 'reset'
    | 'delete'
    | 'assign-order'
    | 'open-order'
    | 'move-order'
    | 'discard-order'
    | null;

interface RestaurantTable {
    id: string;
    name: string;
    capacity: TableCapacity;
    shape: TableShape;
    x: number;
    y: number;
    rotation: number;
}

interface DisplayTable extends RestaurantTable {
    status: TableStatus;
    order: LocalTableOrder | null;
}

interface TableLayoutState {
    tables: RestaurantTable[];
    showCashier: boolean;
}

interface TableFormState {
    name: string;
    capacity: '' | TableCapacity;
}

interface FloorTableProps {
    table: DisplayTable;
    selected: boolean;
    editable: boolean;
    onSelect: (id: string) => void;
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>, id: string) => void;
}

interface DialogProps {
    children: React.ReactNode;
    onClose: () => void;
    title: string;
}

interface TablesNavigationState {
    tableOrderSnapshot?: {
        globalDiscount: TableOrderGlobalDiscount;
        pointsRedemption: TableOrderPointsRedemption | null;
    };
}

const TABLE_LAYOUT_STORAGE_KEY = 'pos.table-layout.v1';

const EMPTY_LAYOUT: TableLayoutState = {
    tables: [],
    showCashier: true,
};

const capacityLabelKeys: Record<TableCapacity, string> = {
    2: 'tables.capacity.small',
    4: 'tables.capacity.medium',
    6: 'tables.capacity.large',
};

const shapeForCapacity = (capacity: TableCapacity): TableShape => {
    if (capacity === 2) return 'round';
    if (capacity === 4) return 'square';
    return 'wide';
};

const shapeClassNames: Record<TableShape, string> = {
    round: 'h-[4.8rem] w-[4.8rem] rounded-full',
    square: 'h-[4.8rem] w-[4.8rem] rounded-2xl',
    wide: 'h-[4.8rem] w-[9.5rem] rounded-2xl',
};

const cloneLayout = (layout: TableLayoutState): TableLayoutState => ({
    tables: layout.tables.map(table => ({ ...table })),
    showCashier: layout.showCashier,
});

const isTableCapacity = (value: unknown): value is TableCapacity => value === 2 || value === 4 || value === 6;

const isTableShape = (value: unknown): value is TableShape => value === 'round' || value === 'square' || value === 'wide';

const isRestaurantTable = (value: unknown): value is RestaurantTable => {
    if (typeof value !== 'object' || value === null) return false;

    const candidate = value as Record<string, unknown>;
    return typeof candidate.id === 'string'
        && typeof candidate.name === 'string'
        && isTableCapacity(candidate.capacity)
        && isTableShape(candidate.shape)
        && typeof candidate.x === 'number'
        && typeof candidate.y === 'number'
        && typeof candidate.rotation === 'number';
};

const loadLayout = (): TableLayoutState => {
    try {
        const stored = localStorage.getItem(TABLE_LAYOUT_STORAGE_KEY);
        if (!stored) return cloneLayout(EMPTY_LAYOUT);

        const parsed: unknown = JSON.parse(stored);
        if (typeof parsed !== 'object' || parsed === null) return cloneLayout(EMPTY_LAYOUT);

        const candidate = parsed as Record<string, unknown>;
        if (!Array.isArray(candidate.tables) || !candidate.tables.every(isRestaurantTable)) {
            return cloneLayout(EMPTY_LAYOUT);
        }

        return {
            tables: candidate.tables,
            showCashier: typeof candidate.showCashier === 'boolean' ? candidate.showCashier : true,
        };
    } catch {
        return cloneLayout(EMPTY_LAYOUT);
    }
};

const persistLayout = (layout: TableLayoutState): void => {
    localStorage.setItem(TABLE_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
};

const createTableId = (): string => `table-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const nextTablePosition = (index: number): Pick<RestaurantTable, 'x' | 'y'> => {
    const column = index % 5;
    const row = Math.floor(index / 5) % 4;
    return {
        x: 20 + column * 14,
        y: 20 + row * 17,
    };
};

const DotCanvas: React.FC<{
    children: React.ReactNode;
    className?: string;
    onPointerMove?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp?: () => void;
    onClick?: () => void;
}> = ({ children, className = '', onPointerMove, onPointerUp, onClick }) => (
    <div
        className={`relative min-h-[35rem] overflow-hidden rounded-2xl border border-neutral-200 bg-white ${className}`}
        style={{
            backgroundImage: 'radial-gradient(#d6d6d6 1px, transparent 1px)',
            backgroundSize: '24px 24px',
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onClick={onClick}
    >
        {children}
    </div>
);

const FloorTable: React.FC<FloorTableProps> = ({ table, selected, editable, onSelect, onPointerDown }) => {
    const { t } = useTranslation();
    const isUsed = table.status !== 'available';
    const statusLabel = table.status === 'settling'
        ? t('tables.status.settling')
        : t(table.status === 'used' ? 'tables.status.used' : 'tables.status.available');
    const surfaceClass = isUsed
        ? 'border-neutral-200 text-neutral-900'
        : 'border-neutral-200 bg-white text-neutral-900 hover:border-emerald-300';

    return (
        <button
            type="button"
            className={`absolute flex items-center justify-center border-2 text-lg font-bold shadow-sm transition-colors duration-150 ${shapeClassNames[table.shape]} ${surfaceClass} ${selected ? 'border-emerald-500 ring-4 ring-emerald-100' : ''} ${editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
            style={{
                left: `${table.x}%`,
                top: `${table.y}%`,
                transform: `translate(-50%, -50%) rotate(${table.rotation}deg)`,
                backgroundImage: isUsed
                    ? 'repeating-linear-gradient(-45deg, #ffffff 0, #ffffff 6px, #e5e7eb 6px, #e5e7eb 9px)'
                    : undefined,
            }}
            aria-label={`${table.name}, ${t(capacityLabelKeys[table.capacity])}, ${statusLabel}`}
            data-testid={`table-floor-${table.id}`}
            onClick={event => {
                event.stopPropagation();
                onSelect(table.id);
            }}
            onPointerDown={event => onPointerDown(event, table.id)}
        >
            <span className="pointer-events-none">{table.name.replace(/^Table\s+/i, '')}</span>
            <span className="pointer-events-none absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-neutral-800 px-1 text-xs font-bold text-white">
                {table.capacity}
            </span>
            {table.status === 'settling' && (
                <span className="pointer-events-none absolute -bottom-2 rounded-full bg-amber-500 px-2 py-0.5 text-[0.65rem] font-bold text-white">
                    {t('tables.status.payingBadge')}
                </span>
            )}
        </button>
    );
};

const Dialog: React.FC<DialogProps> = ({ children, onClose, title }) => {
    const { t } = useTranslation();
    const applied = useAppliedDialogStyle();

    if (applied) {
        return (
            <ConfiguredDialogShell config={applied} title={title} onClose={onClose} icon={LayoutGrid}>
                <div className="px-6 py-5">{children}</div>
            </ConfiguredDialogShell>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={onClose}>
            <div
                className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="tables-dialog-title"
                onMouseDown={event => event.stopPropagation()}
            >
                <div className="mb-5 flex items-start justify-between gap-4">
                    <h2 id="tables-dialog-title" className="text-xl font-bold text-neutral-950">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex min-h-touch-xs min-w-touch-xs items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                        aria-label={t('tables.dialog.close')}
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
};

const tableOrderTotal = (order: LocalTableOrder): number => {
    const subtotal = order.lines.reduce((sum, line) => {
        const lineTotal = line.product.price * line.quantity;
        return sum + lineTotal * (1 - line.discount / 100);
    }, 0);
    const discount = order.global_discount.type === 'percentage'
        ? subtotal * (order.global_discount.value / 100)
        : order.global_discount.type === 'fixed'
            ? order.global_discount.value
            : 0;
    return Math.max(0, subtotal - discount);
};

const formatCurrency = (value: number, locale: string): string => new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
}).format(value);

const Tables: React.FC = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const navigationState = location.state as TablesNavigationState | null;
    const {
        cart,
        selectedCustomer,
        activeTableOrder,
        clearCart,
        restoreCart,
        setActiveTableOrder,
        clearActiveTableOrder,
    } = usePOS();
    const { visualStyle, prefs } = useDesignSystem2Customization();
    const applied = useAppliedDialogStyle();
    const shellButtons = applied ? dialogButtonClasses(applied) : null;
    const [layout, setLayout] = useState<TableLayoutState>(loadLayout);
    const [draft, setDraft] = useState<TableLayoutState>(cloneLayout(layout));
    const [isEditing, setIsEditing] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [capacityFilter, setCapacityFilter] = useState<CapacityFilter>('all');
    const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
    const [draggingTableId, setDraggingTableId] = useState<string | null>(null);
    const [dialog, setDialog] = useState<DialogKind>(null);
    const [addForm, setAddForm] = useState<TableFormState>({ name: '', capacity: '' });
    const [editForm, setEditForm] = useState<TableFormState>({ name: '', capacity: '' });
    const [toast, setToast] = useState<string | null>(null);
    const [tableOrders, setTableOrders] = useState<LocalTableOrder[]>([]);
    const [isLoadingOrders, setIsLoadingOrders] = useState(true);
    const [isProcessingOrder, setIsProcessingOrder] = useState(false);

    const refreshTableOrders = useCallback(async () => {
        try {
            setIsLoadingOrders(true);
            setTableOrders(await tableOrderService.listBlocking());
        } catch (error) {
            console.error('Could not load table orders', error);
            setToast(i18n.t('tables.toast.loadFailed'));
        } finally {
            setIsLoadingOrders(false);
        }
    }, [i18n]);

    useEffect(() => {
        void refreshTableOrders();
        return tableOrderService.subscribe(() => {
            void refreshTableOrders();
        });
    }, [refreshTableOrders]);

    const activeLayout = isEditing ? draft : layout;
    const orderByTableId = useMemo(
        () => new Map(tableOrders.map(order => [order.table_id, order])),
        [tableOrders]
    );
    const displayTables = useMemo<DisplayTable[]>(() => activeLayout.tables.map(table => {
        const order = orderByTableId.get(table.id) ?? null;
        return {
            ...table,
            status: order?.status === 'settling' ? 'settling' : order ? 'used' : 'available',
            order,
        };
    }), [activeLayout.tables, orderByTableId]);
    const selectedTable = displayTables.find(table => table.id === selectedTableId) ?? null;

    const visibleTables = useMemo(() => {
        const normalizedSearch = search.trim().toLocaleLowerCase();
        return displayTables.filter(table => {
            const matchesSearch = normalizedSearch.length === 0 || table.name.toLocaleLowerCase().includes(normalizedSearch);
            const matchesStatus = statusFilter === 'all'
                || (statusFilter === 'used' ? table.status !== 'available' : table.status === 'available');
            const matchesCapacity = capacityFilter === 'all' || table.capacity === capacityFilter;
            return matchesSearch && matchesStatus && matchesCapacity;
        });
    }, [capacityFilter, displayTables, search, statusFilter]);

    useEffect(() => {
        if (!toast) return undefined;

        const timeout = window.setTimeout(() => setToast(null), 3500);
        return () => window.clearTimeout(timeout);
    }, [toast]);

    const handleStartEditing = () => {
        setDraft(cloneLayout(layout));
        setSelectedTableId(null);
        setIsEditing(true);
    };

    const handleCancelEditing = () => {
        setDraft(cloneLayout(layout));
        setSelectedTableId(null);
        setDraggingTableId(null);
        setIsEditing(false);
    };

    const handleConfirmSave = () => {
        const removedOpenTable = tableOrders.find(order => !draft.tables.some(table => table.id === order.table_id));
        if (removedOpenTable) {
            setDialog(null);
            setToast(t('tables.toast.settleBeforeRemoving', { table: removedOpenTable.table_name }));
            return;
        }

        const nextLayout = cloneLayout(draft);
        persistLayout(nextLayout);
        setLayout(nextLayout);
        setDialog(null);
        setSelectedTableId(null);
        setIsEditing(false);
        setToast(t('tables.toast.layoutSaved'));
    };

    const handleConfirmReset = () => {
        if (tableOrders.length > 0) {
            setDialog(null);
            setToast(t('tables.toast.settleBeforeReset'));
            return;
        }

        const emptyLayout = cloneLayout(EMPTY_LAYOUT);
        setDraft(emptyLayout);
        persistLayout(emptyLayout);
        setLayout(emptyLayout);
        setSelectedTableId(null);
        setDialog(null);
        setIsEditing(false);
        setToast(t('tables.toast.layoutReset'));
    };

    const handleOpenAdd = () => {
        setAddForm({ name: `Table ${draft.tables.length + 1}`, capacity: '' });
        setDialog('add');
    };

    const handlePrepareAdd = () => {
        if (!addForm.name.trim() || addForm.capacity === '') return;
        setDialog('confirm-add');
    };

    const handleConfirmAdd = () => {
        if (addForm.capacity === '') return;

        const newTable: RestaurantTable = {
            id: createTableId(),
            name: addForm.name.trim(),
            capacity: addForm.capacity,
            shape: shapeForCapacity(addForm.capacity),
            ...nextTablePosition(draft.tables.length),
            rotation: 0,
        };

        setDraft(current => ({ ...current, tables: [...current.tables, newTable] }));
        setSelectedTableId(newTable.id);
        setDialog(null);
        setToast(t('tables.toast.tableAdded', { table: newTable.name }));
    };

    const handleOpenEdit = () => {
        if (!selectedTable) return;
        if (selectedTable.order) {
            setToast(t('tables.toast.settleBeforeRenaming', { table: selectedTable.name }));
            return;
        }
        setEditForm({ name: selectedTable.name, capacity: selectedTable.capacity });
        setDialog('edit');
    };

    const handleSaveEdit = () => {
        if (!selectedTable || editForm.capacity === '' || !editForm.name.trim()) return;

        setDraft(current => ({
            ...current,
            tables: current.tables.map(table => table.id === selectedTable.id
                ? {
                    ...table,
                    name: editForm.name.trim(),
                    capacity: editForm.capacity,
                    shape: shapeForCapacity(editForm.capacity),
                }
                : table),
        }));
        setDialog(null);
    };

    const handleConfirmDelete = () => {
        if (!selectedTable) return;
        if (selectedTable.order) {
            setDialog(null);
            setToast(t('tables.toast.settleBeforeDeleting', { table: selectedTable.name }));
            return;
        }

        setDraft(current => ({
            ...current,
            tables: current.tables.filter(table => table.id !== selectedTable.id),
        }));
        setToast(t('tables.toast.tableRemoved', { table: selectedTable.name }));
        setSelectedTableId(null);
        setDialog(null);
    };

    const handleRotate = () => {
        if (!selectedTable) return;

        setDraft(current => ({
            ...current,
            tables: current.tables.map(table => table.id === selectedTable.id
                ? { ...table, rotation: (table.rotation + 90) % 360 }
                : table),
        }));
    };

    const handleTablePointerDown = (event: React.PointerEvent<HTMLButtonElement>, tableId: string) => {
        if (!isEditing) return;
        event.preventDefault();
        setSelectedTableId(tableId);
        setDraggingTableId(tableId);
    };

    const handleCanvasPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!draggingTableId) return;

        const bounds = event.currentTarget.getBoundingClientRect();
        const x = Math.min(94, Math.max(6, ((event.clientX - bounds.left) / bounds.width) * 100));
        const y = Math.min(94, Math.max(6, ((event.clientY - bounds.top) / bounds.height) * 100));

        setDraft(current => ({
            ...current,
            tables: current.tables.map(table => table.id === draggingTableId ? { ...table, x, y } : table),
        }));
    };

    const handleSelectTable = (tableId: string) => {
        const table = displayTables.find(candidate => candidate.id === tableId);
        if (!table) return;
        setSelectedTableId(tableId);

        if (isEditing) return;
        if (table.status === 'settling') {
            setToast(t('tables.toast.lockedWhilePaying', { table: table.name }));
            return;
        }

        if (table.status === 'available') {
            setDialog(activeTableOrder ? 'move-order' : 'assign-order');
            return;
        }

        if (activeTableOrder?.id === table.order?.id) {
            navigate('/pos');
            return;
        }

        if (activeTableOrder) {
            setToast(t('tables.toast.finishBeforeOpening', { table: activeTableOrder.tableName }));
            return;
        }

        setDialog('open-order');
    };

    const handleConfirmAssignOrder = async () => {
        if (!selectedTable) return;
        setIsProcessingOrder(true);
        try {
            const pendingSnapshot = navigationState?.tableOrderSnapshot;
            const order = await tableOrderService.createOpenOrder({
                tableId: selectedTable.id,
                tableName: selectedTable.name,
                lines: cart,
                customer: selectedCustomer,
                globalDiscount: pendingSnapshot?.globalDiscount ?? { type: 'none', value: 0 },
                pointsRedemption: pendingSnapshot?.pointsRedemption ?? null,
            });
            setActiveTableOrder({ id: order.id, tableId: order.table_id, tableName: order.table_name });
            setDialog(null);
            navigate('/pos');
        } catch (error) {
            console.error('Could not assign order to table', error);
            setToast(error instanceof Error ? error.message : t('tables.toast.assignFailed'));
            await refreshTableOrders();
        } finally {
            setIsProcessingOrder(false);
        }
    };

    const handleConfirmOpenOrder = () => {
        if (!selectedTable?.order || selectedTable.order.status !== 'open') return;
        restoreCart(selectedTable.order.lines, selectedTable.order.customer);
        setActiveTableOrder({
            id: selectedTable.order.id,
            tableId: selectedTable.order.table_id,
            tableName: selectedTable.order.table_name,
        });
        setDialog(null);
        navigate('/pos');
    };

    const handleConfirmMoveOrder = async () => {
        if (!selectedTable || !activeTableOrder) return;
        setIsProcessingOrder(true);
        try {
            await tableOrderService.moveOpenOrder(activeTableOrder.id, {
                tableId: selectedTable.id,
                tableName: selectedTable.name,
            });
            setActiveTableOrder({ id: activeTableOrder.id, tableId: selectedTable.id, tableName: selectedTable.name });
            setDialog(null);
            navigate('/pos');
        } catch (error) {
            console.error('Could not move table order', error);
            setToast(error instanceof Error ? error.message : t('tables.toast.moveFailed'));
            await refreshTableOrders();
        } finally {
            setIsProcessingOrder(false);
        }
    };

    const handleConfirmDiscardOrder = async () => {
        if (!selectedTable?.order || selectedTable.order.status !== 'open') return;
        setIsProcessingOrder(true);
        try {
            await tableOrderService.discardOpenOrder(selectedTable.order.id);
            if (activeTableOrder?.id === selectedTable.order.id) clearActiveTableOrder();
            setDialog(null);
            setSelectedTableId(null);
            setToast(t('tables.toast.tableAvailableAgain', { table: selectedTable.name }));
            await refreshTableOrders();
        } catch (error) {
            console.error('Could not discard table order', error);
            setToast(error instanceof Error ? error.message : t('tables.toast.discardFailed'));
        } finally {
            setIsProcessingOrder(false);
        }
    };

    const handleParkCurrentOrder = async () => {
        if (!activeTableOrder) return;
        setIsProcessingOrder(true);
        try {
            const order = await tableOrderService.getById(activeTableOrder.id);
            if (!order || order.status !== 'open') {
                throw new Error(t('tables.toast.orderNoLongerParkable'));
            }
            // POS flushes an active table immediately before navigating here;
            // leave that persisted snapshot intact, then clear only the live
            // working cart so another table can be opened.
            clearCart();
            clearActiveTableOrder();
            setSelectedTableId(null);
            setToast(t('tables.toast.orderParked', { table: order.table_name }));
        } catch (error) {
            console.error('Could not park the current table order', error);
            setToast(error instanceof Error ? error.message : t('tables.toast.parkFailed'));
        } finally {
            setIsProcessingOrder(false);
        }
    };

    return (
        <div className="ds2-visual-scope mx-auto w-full max-w-[1600px]" style={visualStyle} data-ds2-neutral={prefs.neutralFamilyId}>
            {!isEditing ? (
                <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
                    <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight text-neutral-950">{t('tables.pageTitle')}</h1>
                            <p className="mt-1 text-sm text-neutral-500">
                                {isLoadingOrders
                                    ? t('tables.loadingOrders')
                                    : activeTableOrder
                                        ? t('tables.currentOrder', { table: activeTableOrder.tableName })
                                        : cart.length > 0
                                            ? t('tables.hintAssignCurrentOrder')
                                            : t('tables.hintStartDineIn')}
                            </p>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap xl:justify-end">
                            <label className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
                                <span className="sr-only">{t('tables.searchLabel')}</span>
                                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
                                <input
                                    value={search}
                                    onChange={event => setSearch(event.target.value)}
                                    placeholder={t('tables.searchPlaceholder')}
                                    className="min-h-touch-xs w-full rounded-2xl border border-neutral-200 bg-white pl-12 pr-4 text-base text-neutral-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                                />
                            </label>
                            <select
                                value={statusFilter}
                                onChange={event => setStatusFilter(event.target.value as StatusFilter)}
                                aria-label={t('tables.filters.statusAriaLabel')}
                                className="min-h-touch-xs rounded-2xl border border-neutral-200 bg-white px-4 text-base font-semibold text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                            >
                                <option value="all">{t('tables.filters.allTables')}</option>
                                <option value="available">{t('tables.filters.available')}</option>
                                <option value="used">{t('tables.filters.used')}</option>
                            </select>
                            <select
                                value={capacityFilter}
                                onChange={event => {
                                    const value = event.target.value;
                                    setCapacityFilter(value === 'all' ? 'all' : Number(value) as TableCapacity);
                                }}
                                aria-label={t('tables.filters.capacityAriaLabel')}
                                className="min-h-touch-xs rounded-2xl border border-neutral-200 bg-white px-4 text-base font-semibold text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                            >
                                <option value="all">{t('tables.filters.allCapacities')}</option>
                                <option value="2">{t('tables.capacity.small')}</option>
                                <option value="4">{t('tables.capacity.medium')}</option>
                                <option value="6">{t('tables.capacity.large')}</option>
                            </select>
                            <AdminActionButton
                                type="button"
                                variant="primary"
                                icon={Edit3}
                                label={t('tables.actions.editLayout')}
                                onClick={handleStartEditing}
                                data-testid="tables-edit-layout"
                            />
                        </div>
                    </div>

                    {activeTableOrder && (
                        <div
                            className="mb-5 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                            data-testid="active-table-order"
                        >
                            <div>
                                <p className="font-semibold text-emerald-900">{t('tables.activeOrder.assignedTo', { table: activeTableOrder.tableName })}</p>
                                <p className="mt-0.5 text-sm text-emerald-700">{t('tables.activeOrder.hint')}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <AdminActionButton
                                    type="button"
                                    variant="outline"
                                    label={t('tables.actions.parkOrder')}
                                    onClick={() => void handleParkCurrentOrder()}
                                    disabled={isProcessingOrder}
                                    className="disabled:opacity-40"
                                />
                                <AdminActionButton
                                    type="button"
                                    variant="primary"
                                    label={t('tables.actions.returnToOrder')}
                                    onClick={() => navigate('/pos')}
                                    disabled={isProcessingOrder}
                                    className="disabled:opacity-50"
                                />
                            </div>
                        </div>
                    )}

                    <div className="grid min-h-[40rem] gap-5 xl:grid-cols-[minmax(17rem,0.32fr)_minmax(0,1fr)]">
                        <aside className="min-h-0 rounded-2xl border border-neutral-200 bg-white p-3 xl:max-h-[42rem] xl:overflow-y-auto">
                            {visibleTables.length === 0 ? (
                                <div className="flex h-full min-h-56 flex-col items-center justify-center px-6 text-center text-neutral-500">
                                    <LayoutGrid className="mb-3 h-10 w-10 text-neutral-300" />
                                    <p className="font-medium">{activeLayout.tables.length === 0 ? t('tables.list.emptyNoTables') : t('tables.list.noMatches')}</p>
                                </div>
                            ) : (
                                <ul>
                                    {visibleTables.map(table => (
                                        <li key={table.id}>
                                            <ListRow
                                                onClick={() => handleSelectTable(table.id)}
                                                selected={selectedTableId === table.id}
                                            >
                                                <span className={`h-2.5 w-2.5 rounded-full ${table.status === 'available' ? 'bg-emerald-500' : table.status === 'settling' ? 'bg-amber-500' : 'bg-orange-500'}`} aria-hidden="true" />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate font-semibold text-neutral-900">{table.name}</span>
                                                    <span className="block text-sm text-neutral-500">{t(capacityLabelKeys[table.capacity])}</span>
                                                    {table.order && (
                                                        <span
                                                            className="block text-xs font-medium text-neutral-600"
                                                            data-testid={`table-order-total-${table.id}`}
                                                        >
                                                            {t('tables.list.itemsTotal', { count: table.order.lines.length, total: formatCurrency(tableOrderTotal(table.order), uiLocale(i18n.language)) })}
                                                        </span>
                                                    )}
                                                </span>
                                                <span
                                                    className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-bold text-neutral-600"
                                                    data-testid={`table-status-${table.id}`}
                                                >
                                                    {table.status === 'settling' ? t('tables.status.paying') : t(table.status === 'used' ? 'tables.status.used' : 'tables.status.available')}
                                                </span>
                                            </ListRow>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </aside>

                        <div className="min-w-0">
                            {activeLayout.tables.length === 0 ? (
                                <DotCanvas className="flex min-h-[35rem] flex-col items-center justify-center px-6 text-center" onClick={() => setSelectedTableId(null)}>
                                    <div className="max-w-sm rounded-3xl bg-white/90 p-8 shadow-sm" data-testid="tables-empty-state">
                                        <LayoutGrid className="mx-auto mb-5 h-14 w-14 text-neutral-300" />
                                        <h2 className="text-3xl font-bold text-neutral-950">{t('tables.empty.title')}</h2>
                                        <p className="mt-3 text-lg text-neutral-500">{t('tables.empty.subtitle', { action: t('tables.actions.editLayout') })}</p>
                                    </div>
                                </DotCanvas>
                            ) : (
                                <DotCanvas onClick={() => setSelectedTableId(null)}>
                                    <div className="absolute left-5 top-5 z-10 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-white/90 px-3 py-2 text-sm font-medium text-neutral-800 shadow-sm">
                                        <span className="flex items-center gap-2"><span className="h-4 w-4 rounded-full border-2 border-neutral-200 bg-white" />{t('tables.filters.available')}</span>
                                        <span className="flex items-center gap-2"><span className="h-4 w-4 rounded-full border-2 border-neutral-200" style={{ backgroundImage: 'repeating-linear-gradient(-45deg, #fff 0, #fff 3px, #e5e7eb 3px, #e5e7eb 6px)' }} />{t('tables.filters.used')}</span>
                                        <span className="flex items-center gap-2"><span className="h-4 w-4 rounded-full bg-amber-500" />{t('tables.status.payingBadge')}</span>
                                        <span className="flex items-center gap-2"><span className="h-4 w-4 rounded-full bg-emerald-500" />{t('tables.legend.selected')}</span>
                                    </div>
                                    {activeLayout.showCashier && (
                                        <div className="absolute left-[10%] top-[55%] flex h-44 w-20 -translate-y-1/2 items-center justify-center border border-neutral-200 bg-neutral-50 text-sm font-semibold tracking-wide text-neutral-500 [writing-mode:vertical-rl]">{t('tables.cashier')}</div>
                                    )}
                                    {visibleTables.map(table => (
                                        <FloorTable
                                            key={table.id}
                                            table={table}
                                            selected={selectedTableId === table.id}
                                            editable={false}
                                            onSelect={handleSelectTable}
                                            onPointerDown={() => undefined}
                                        />
                                    ))}
                                </DotCanvas>
                            )}
                        </div>
                    </div>
                </section>
            ) : (
                <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
                    <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <h1 className="text-3xl font-bold tracking-tight text-neutral-950">{t('tables.editTitle')}</h1>
                        <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                            <button
                                type="button"
                                onClick={() => setDialog('reset')}
                                className="min-h-touch-xs rounded-xl border border-[var(--ds2-danger-border,#fca5a5)] px-4 font-semibold text-[var(--ds2-danger-solid,#dc2626)] transition-colors hover:bg-[var(--ds2-danger-tint-bg,#fef2f2)]"
                            >
                                {t('tables.actions.resetLayout')}
                            </button>
                            <label className="flex min-h-touch-xs items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-neutral-700">
                                <span>{t('tables.form.showCashier')}</span>
                                <input
                                    type="checkbox"
                                    checked={draft.showCashier}
                                    onChange={event => setDraft(current => ({ ...current, showCashier: event.target.checked }))}
                                    className="h-6 w-11 cursor-pointer accent-emerald-600"
                                />
                            </label>
                            <AdminActionButton
                                type="button"
                                variant="outline"
                                icon={Plus}
                                label={t('tables.actions.addTable')}
                                onClick={handleOpenAdd}
                                data-testid="tables-add-table"
                            />
                            <span className="hidden h-8 w-px bg-neutral-200 sm:block" aria-hidden="true" />
                            <AdminActionButton
                                type="button"
                                variant="outline"
                                label={t('common.cancel')}
                                onClick={handleCancelEditing}
                            />
                            <AdminActionButton
                                type="button"
                                variant="primary"
                                icon={Save}
                                label={t('tables.actions.save')}
                                onClick={() => setDialog('save')}
                                data-testid="tables-save-layout"
                            />
                        </div>
                    </div>

                    <DotCanvas
                        className="min-h-[42rem] touch-none"
                        onPointerMove={handleCanvasPointerMove}
                        onPointerUp={() => setDraggingTableId(null)}
                        onClick={() => setSelectedTableId(null)}
                    >
                        {draft.showCashier && (
                            <div className="absolute left-[10%] top-[55%] flex h-44 w-20 -translate-y-1/2 items-center justify-center border border-neutral-200 bg-neutral-50 text-sm font-semibold tracking-wide text-neutral-500 [writing-mode:vertical-rl]">{t('tables.cashier')}</div>
                        )}
                        {displayTables.map(table => (
                            <FloorTable
                                key={table.id}
                                table={table}
                                selected={selectedTableId === table.id}
                                editable
                                onSelect={handleSelectTable}
                                onPointerDown={handleTablePointerDown}
                            />
                        ))}
                        {selectedTable && (
                            <div
                                className="absolute z-30 flex -translate-x-1/2 gap-1 rounded-xl bg-neutral-800 p-1.5 text-white shadow-xl"
                                style={{ left: `${selectedTable.x}%`, top: `calc(${selectedTable.y}% - 4.8rem)` }}
                                onClick={event => event.stopPropagation()}
                            >
                                <TableActionButton variant="icon" dark icon={RotateCw} onClick={handleRotate} aria-label={t('tables.actions.rotateTable', { table: selectedTable.name })} />
                                <TableActionButton variant="icon" dark icon={Edit3} onClick={handleOpenEdit} aria-label={t('tables.actions.editTable', { table: selectedTable.name })} />
                                <TableActionButton variant="delete" dark icon={Trash2} onClick={() => setDialog('delete')} aria-label={t('tables.actions.deleteTable', { table: selectedTable.name })} />
                            </div>
                        )}
                        {draft.tables.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                                <div className="max-w-sm rounded-3xl bg-white/90 p-8 shadow-sm">
                                    <LayoutGrid className="mx-auto mb-5 h-14 w-14 text-neutral-300" />
                                    <h2 className="text-2xl font-bold text-neutral-950">{t('tables.editEmpty.title')}</h2>
                                    <p className="mt-3 text-neutral-500">{t('tables.editEmpty.subtitle', { action: t('tables.actions.addTable') })}</p>
                                </div>
                            </div>
                        )}
                    </DotCanvas>
                </section>
            )}

            {dialog === 'add' && (
                <Dialog title={t('tables.actions.addTable')} onClose={() => setDialog(null)}>
                    <div className="space-y-5">
                        <label className="block">
                            <span className="mb-2 block text-sm font-semibold text-neutral-800">{t('tables.form.tableName')}</span>
                            <input
                                value={addForm.name}
                                onChange={event => setAddForm(current => ({ ...current, name: event.target.value }))}
                                className="min-h-touch-xs w-full rounded-xl border border-neutral-200 px-4 text-base outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                                placeholder={t('tables.form.tableNamePlaceholder')}
                                autoFocus
                            />
                        </label>
                        <label className="block">
                            <span className="mb-2 block text-sm font-semibold text-neutral-800">{t('tables.form.tableType')}</span>
                            <select
                                value={addForm.capacity}
                                onChange={event => {
                                    const value = event.target.value;
                                    setAddForm(current => ({ ...current, capacity: value === '' ? '' : Number(value) as TableCapacity }));
                                }}
                                className="min-h-touch-xs w-full rounded-xl border border-neutral-200 bg-white px-4 text-base outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                            >
                                <option value="">{t('tables.form.chooseTableType')}</option>
                                <option value="2">{t('tables.capacity.small')}</option>
                                <option value="4">{t('tables.capacity.medium')}</option>
                                <option value="6">{t('tables.capacity.large')}</option>
                            </select>
                        </label>
                        <p className="rounded-xl bg-neutral-50 px-4 py-3 text-sm text-neutral-600">{t('tables.form.capacityHint')}</p>
                        <div className="grid grid-cols-2 gap-3 pt-1">
                            <button type="button" onClick={() => setDialog(null)} className={shellButtons ? shellButtons.secondary : 'min-h-touch-xs rounded-xl border border-neutral-200 font-semibold text-neutral-700 hover:bg-neutral-50'}>{t('common.cancel')}</button>
                            <button type="button" onClick={handlePrepareAdd} disabled={!addForm.name.trim() || addForm.capacity === ''} className={shellButtons ? `${shellButtons.primary} disabled:cursor-not-allowed disabled:opacity-50` : 'min-h-touch-xs rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40'}>{t('tables.actions.add')}</button>
                        </div>
                    </div>
                </Dialog>
            )}

            {dialog === 'confirm-add' && addForm.capacity !== '' && (
                <Dialog title={t('tables.dialog.addTableTitle')} onClose={() => setDialog('add')}>
                    <div className="text-center">
                        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-amber-500" />
                        <p className="text-neutral-600">{t('tables.dialog.addTableBody', { table: addForm.name.trim(), type: t(capacityLabelKeys[addForm.capacity]).toLocaleLowerCase() })}</p>
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setDialog('add')} className={shellButtons ? shellButtons.secondary : 'min-h-touch-xs rounded-xl border border-neutral-200 font-semibold text-neutral-700 hover:bg-neutral-50'}>{t('tables.actions.back')}</button>
                            <button type="button" onClick={handleConfirmAdd} className={shellButtons ? shellButtons.primary : 'min-h-touch-xs rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700'}>{t('tables.dialog.confirmAdd')}</button>
                        </div>
                    </div>
                </Dialog>
            )}

            {dialog === 'edit' && selectedTable && (
                <Dialog title={t('tables.actions.editTable', { table: selectedTable.name })} onClose={() => setDialog(null)}>
                    <div className="space-y-5">
                        <label className="block">
                            <span className="mb-2 block text-sm font-semibold text-neutral-800">{t('tables.form.tableName')}</span>
                            <input value={editForm.name} onChange={event => setEditForm(current => ({ ...current, name: event.target.value }))} className="min-h-touch-xs w-full rounded-xl border border-neutral-200 px-4 text-base outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100" autoFocus />
                        </label>
                        <label className="block">
                            <span className="mb-2 block text-sm font-semibold text-neutral-800">{t('tables.form.tableType')}</span>
                            <select value={editForm.capacity} onChange={event => setEditForm(current => ({ ...current, capacity: Number(event.target.value) as TableCapacity }))} className="min-h-touch-xs w-full rounded-xl border border-neutral-200 bg-white px-4 text-base outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100">
                                <option value="2">{t('tables.capacity.small')}</option>
                                <option value="4">{t('tables.capacity.medium')}</option>
                                <option value="6">{t('tables.capacity.large')}</option>
                            </select>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setDialog(null)} className={shellButtons ? shellButtons.secondary : 'min-h-touch-xs rounded-xl border border-neutral-200 font-semibold text-neutral-700 hover:bg-neutral-50'}>{t('common.cancel')}</button>
                            <button type="button" onClick={handleSaveEdit} disabled={!editForm.name.trim() || editForm.capacity === ''} className={shellButtons ? `${shellButtons.primary} disabled:cursor-not-allowed disabled:opacity-50` : 'min-h-touch-xs rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40'}>{t('tables.actions.save')}</button>
                        </div>
                    </div>
                </Dialog>
            )}

            {dialog === 'save' && (
                <Dialog title={t('tables.dialog.saveChangesTitle')} onClose={() => setDialog(null)}>
                    <div className="text-center">
                        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-amber-500" />
                        <p className="text-neutral-600">{t('tables.dialog.saveChangesBody')}</p>
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setDialog(null)} className={shellButtons ? shellButtons.secondary : 'min-h-touch-xs rounded-xl border border-neutral-200 font-semibold text-neutral-700 hover:bg-neutral-50'}>{t('common.cancel')}</button>
                            <button type="button" onClick={handleConfirmSave} className={shellButtons ? shellButtons.primary : 'min-h-touch-xs rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700'}>{t('tables.dialog.confirmSave')}</button>
                        </div>
                    </div>
                </Dialog>
            )}

            {dialog === 'reset' && (
                <Dialog title={t('tables.dialog.resetTitle')} onClose={() => setDialog(null)}>
                    <div className="text-center">
                        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
                        <p className="text-neutral-600">{t('tables.dialog.resetBody')}</p>
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setDialog(null)} className={shellButtons ? shellButtons.secondary : 'min-h-touch-xs rounded-xl border border-neutral-200 font-semibold text-neutral-700 hover:bg-neutral-50'}>{t('common.cancel')}</button>
                            <button type="button" onClick={handleConfirmReset} className={shellButtons ? shellButtons.danger : 'min-h-touch-xs rounded-xl bg-red-600 font-semibold text-white hover:bg-red-700'}>{t('tables.dialog.confirmReset')}</button>
                        </div>
                    </div>
                </Dialog>
            )}

            {dialog === 'delete' && selectedTable && (
                <Dialog title={t('tables.dialog.deleteTableTitle', { table: selectedTable.name })} onClose={() => setDialog(null)}>
                    <div className="text-center">
                        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
                        <p className="text-neutral-600">{t('tables.dialog.deleteBody')}</p>
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setDialog(null)} className={shellButtons ? shellButtons.secondary : 'min-h-touch-xs rounded-xl border border-neutral-200 font-semibold text-neutral-700 hover:bg-neutral-50'}>{t('common.cancel')}</button>
                            <button type="button" onClick={handleConfirmDelete} className={shellButtons ? shellButtons.danger : 'min-h-touch-xs rounded-xl bg-red-600 font-semibold text-white hover:bg-red-700'}>{t('tables.dialog.confirmDelete')}</button>
                        </div>
                    </div>
                </Dialog>
            )}

            {dialog === 'assign-order' && selectedTable && (
                <Dialog title={t('tables.dialog.assignTitle', { table: selectedTable.name })} onClose={() => setDialog(null)}>
                    <div className="text-center">
                        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-emerald-500" />
                        {cart.length > 0 ? (
                            <p className="text-neutral-600">
                                <Trans
                                    i18nKey="tables.dialog.assignWithCartBody"
                                    count={cart.length}
                                    values={{ table: selectedTable.name }}
                                    components={{ b: <strong className="text-neutral-900" /> }}
                                />
                            </p>
                        ) : (
                            <p className="text-neutral-600">
                                {t('tables.dialog.assignEmptyCartBody', { table: selectedTable.name })}
                            </p>
                        )}
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setDialog(null)} disabled={isProcessingOrder} className={shellButtons ? `${shellButtons.secondary} disabled:opacity-40` : 'min-h-touch-xs rounded-xl border border-neutral-200 font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40'}>{t('common.cancel')}</button>
                            <button type="button" onClick={() => void handleConfirmAssignOrder()} disabled={isProcessingOrder} className={shellButtons ? `${shellButtons.primary} disabled:opacity-50` : 'min-h-touch-xs rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700 disabled:opacity-40'}>
                                {isProcessingOrder ? t('common.saving') : t('tables.actions.assignOrder')}
                            </button>
                        </div>
                    </div>
                </Dialog>
            )}

            {dialog === 'open-order' && selectedTable?.order && (
                <Dialog title={t('tables.dialog.openTitle', { table: selectedTable.name })} onClose={() => setDialog(null)}>
                    <div className="text-center">
                        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-xl font-bold text-orange-700">
                            {selectedTable.order.lines.length}
                        </div>
                        <p className="text-neutral-600">
                            <Trans
                                i18nKey="tables.dialog.openOrderBody"
                                count={selectedTable.order.lines.length}
                                values={{ total: formatCurrency(tableOrderTotal(selectedTable.order), uiLocale(i18n.language)) }}
                                components={{ b: <strong className="text-neutral-900" /> }}
                            />
                        </p>
                        {selectedTable.order.customer && (
                            <p className="mt-2 text-sm text-neutral-500">{t('tables.dialog.customerLine', { name: selectedTable.order.customer.name })}</p>
                        )}
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setDialog(null)} className={shellButtons ? shellButtons.secondary : 'min-h-touch-xs rounded-xl border border-neutral-200 font-semibold text-neutral-700 hover:bg-neutral-50'}>{t('common.cancel')}</button>
                            <button type="button" onClick={handleConfirmOpenOrder} className={shellButtons ? shellButtons.primary : 'min-h-touch-xs rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700'}>{t('tables.actions.openOrder')}</button>
                        </div>
                        <button
                            type="button"
                            onClick={() => setDialog('discard-order')}
                            className={shellButtons ? `mt-4 ${shellButtons.dangerOutline}` : 'mt-4 min-h-touch-xs px-4 text-sm font-semibold text-red-600 transition-colors hover:text-red-700'}
                        >
                            {t('tables.actions.discardUnbilledOrder')}
                        </button>
                    </div>
                </Dialog>
            )}

            {dialog === 'move-order' && selectedTable && activeTableOrder && (
                <Dialog title={t('tables.dialog.moveTitle', { table: selectedTable.name })} onClose={() => setDialog(null)}>
                    <div className="text-center">
                        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-amber-500" />
                        <p className="text-neutral-600">
                            {t('tables.dialog.moveBody', { from: activeTableOrder.tableName, to: selectedTable.name })}
                        </p>
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setDialog(null)} disabled={isProcessingOrder} className={shellButtons ? `${shellButtons.secondary} disabled:opacity-40` : 'min-h-touch-xs rounded-xl border border-neutral-200 font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40'}>{t('common.cancel')}</button>
                            <button type="button" onClick={() => void handleConfirmMoveOrder()} disabled={isProcessingOrder} className={shellButtons ? `${shellButtons.primary} disabled:opacity-50` : 'min-h-touch-xs rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700 disabled:opacity-40'}>
                                {isProcessingOrder ? t('tables.actions.moving') : t('tables.actions.moveOrder')}
                            </button>
                        </div>
                    </div>
                </Dialog>
            )}

            {dialog === 'discard-order' && selectedTable?.order && (
                <Dialog title={t('tables.dialog.discardTitle', { table: selectedTable.name })} onClose={() => setDialog('open-order')}>
                    <div className="text-center">
                        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
                        <p className="text-neutral-600">
                            {t('tables.dialog.discardBody')}
                        </p>
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setDialog('open-order')} disabled={isProcessingOrder} className={shellButtons ? `${shellButtons.secondary} disabled:opacity-40` : 'min-h-touch-xs rounded-xl border border-neutral-200 font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40'}>{t('tables.actions.keepOrder')}</button>
                            <button type="button" onClick={() => void handleConfirmDiscardOrder()} disabled={isProcessingOrder} className={shellButtons ? `${shellButtons.danger} disabled:opacity-50` : 'min-h-touch-xs rounded-xl bg-red-600 font-semibold text-white hover:bg-red-700 disabled:opacity-40'}>
                                {isProcessingOrder ? t('tables.actions.discarding') : t('tables.dialog.confirmDiscard')}
                            </button>
                        </div>
                    </div>
                </Dialog>
            )}

            {toast && (
                <div role="status" className="fixed right-5 top-5 z-50 flex max-w-sm items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-800 shadow-xl">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-4 w-4" /></span>
                    {toast}
                </div>
            )}
        </div>
    );
};

export default Tables;
