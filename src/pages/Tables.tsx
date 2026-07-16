import React, { useEffect, useMemo, useState } from 'react';
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

type TableCapacity = 2 | 4 | 6;
type TableStatus = 'available' | 'used';
type TableShape = 'round' | 'square' | 'wide';
type StatusFilter = 'all' | TableStatus;
type CapacityFilter = 'all' | TableCapacity;
type DialogKind = 'add' | 'confirm-add' | 'edit' | 'save' | 'reset' | 'delete' | null;

interface RestaurantTable {
    id: string;
    name: string;
    capacity: TableCapacity;
    shape: TableShape;
    x: number;
    y: number;
    rotation: number;
    status: TableStatus;
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
    table: RestaurantTable;
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

const TABLE_LAYOUT_STORAGE_KEY = 'pos.table-layout.v1';

const EMPTY_LAYOUT: TableLayoutState = {
    tables: [],
    showCashier: true,
};

const capacityLabels: Record<TableCapacity, string> = {
    2: 'Small · 2 seats',
    4: 'Medium · 4 seats',
    6: 'Large · 6 seats',
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

const isTableStatus = (value: unknown): value is TableStatus => value === 'available' || value === 'used';

const isRestaurantTable = (value: unknown): value is RestaurantTable => {
    if (typeof value !== 'object' || value === null) return false;

    const candidate = value as Record<string, unknown>;
    return typeof candidate.id === 'string'
        && typeof candidate.name === 'string'
        && isTableCapacity(candidate.capacity)
        && isTableShape(candidate.shape)
        && typeof candidate.x === 'number'
        && typeof candidate.y === 'number'
        && typeof candidate.rotation === 'number'
        && isTableStatus(candidate.status);
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
    const isUsed = table.status === 'used';
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
            aria-label={`${table.name}, ${capacityLabels[table.capacity]}, ${table.status}`}
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
        </button>
    );
};

const Dialog: React.FC<DialogProps> = ({ children, onClose, title }) => (
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
                    aria-label="Close dialog"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>
            {children}
        </div>
    </div>
);

const Tables: React.FC = () => {
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

    const activeLayout = isEditing ? draft : layout;
    const selectedTable = activeLayout.tables.find(table => table.id === selectedTableId) ?? null;

    const visibleTables = useMemo(() => {
        const normalizedSearch = search.trim().toLocaleLowerCase();
        return activeLayout.tables.filter(table => {
            const matchesSearch = normalizedSearch.length === 0 || table.name.toLocaleLowerCase().includes(normalizedSearch);
            const matchesStatus = statusFilter === 'all' || table.status === statusFilter;
            const matchesCapacity = capacityFilter === 'all' || table.capacity === capacityFilter;
            return matchesSearch && matchesStatus && matchesCapacity;
        });
    }, [activeLayout.tables, capacityFilter, search, statusFilter]);

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
        const nextLayout = cloneLayout(draft);
        persistLayout(nextLayout);
        setLayout(nextLayout);
        setDialog(null);
        setSelectedTableId(null);
        setIsEditing(false);
        setToast('Table layout saved');
    };

    const handleConfirmReset = () => {
        const emptyLayout = cloneLayout(EMPTY_LAYOUT);
        setDraft(emptyLayout);
        persistLayout(emptyLayout);
        setLayout(emptyLayout);
        setSelectedTableId(null);
        setDialog(null);
        setIsEditing(false);
        setToast('Table layout reset');
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
            status: 'available',
        };

        setDraft(current => ({ ...current, tables: [...current.tables, newTable] }));
        setSelectedTableId(newTable.id);
        setDialog(null);
        setToast(`${newTable.name} added`);
    };

    const handleOpenEdit = () => {
        if (!selectedTable) return;
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

        setDraft(current => ({
            ...current,
            tables: current.tables.filter(table => table.id !== selectedTable.id),
        }));
        setToast(`${selectedTable.name} removed`);
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
        setSelectedTableId(current => current === tableId ? null : tableId);
    };

    return (
        <div className="mx-auto w-full max-w-[1600px]">
            {!isEditing ? (
                <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
                    <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Tables</h1>
                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap xl:justify-end">
                            <label className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
                                <span className="sr-only">Search table name</span>
                                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
                                <input
                                    value={search}
                                    onChange={event => setSearch(event.target.value)}
                                    placeholder="Search table name…"
                                    className="min-h-touch-xs w-full rounded-2xl border border-neutral-200 bg-white pl-12 pr-4 text-base text-neutral-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                                />
                            </label>
                            <select
                                value={statusFilter}
                                onChange={event => setStatusFilter(event.target.value as StatusFilter)}
                                aria-label="Filter by table status"
                                className="min-h-touch-xs rounded-2xl border border-neutral-200 bg-white px-4 text-base font-semibold text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                            >
                                <option value="all">All tables</option>
                                <option value="available">Available</option>
                                <option value="used">Used</option>
                            </select>
                            <select
                                value={capacityFilter}
                                onChange={event => {
                                    const value = event.target.value;
                                    setCapacityFilter(value === 'all' ? 'all' : Number(value) as TableCapacity);
                                }}
                                aria-label="Filter by capacity"
                                className="min-h-touch-xs rounded-2xl border border-neutral-200 bg-white px-4 text-base font-semibold text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                            >
                                <option value="all">All capacities</option>
                                <option value="2">Small · 2 seats</option>
                                <option value="4">Medium · 4 seats</option>
                                <option value="6">Large · 6 seats</option>
                            </select>
                            <button
                                type="button"
                                onClick={handleStartEditing}
                                className="inline-flex min-h-touch-xs items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200"
                                data-testid="tables-edit-layout"
                            >
                                <Edit3 className="h-5 w-5" />
                                Edit layout
                            </button>
                        </div>
                    </div>

                    <div className="grid min-h-[40rem] gap-5 xl:grid-cols-[minmax(17rem,0.32fr)_minmax(0,1fr)]">
                        <aside className="min-h-0 rounded-2xl border border-neutral-200 bg-white p-3 xl:max-h-[42rem] xl:overflow-y-auto">
                            {visibleTables.length === 0 ? (
                                <div className="flex h-full min-h-56 flex-col items-center justify-center px-6 text-center text-neutral-500">
                                    <LayoutGrid className="mb-3 h-10 w-10 text-neutral-300" />
                                    <p className="font-medium">{activeLayout.tables.length === 0 ? 'Your table list will be shown here' : 'No tables match these filters'}</p>
                                </div>
                            ) : (
                                <ul className="divide-y divide-neutral-200">
                                    {visibleTables.map(table => (
                                        <li key={table.id}>
                                            <button
                                                type="button"
                                                onClick={() => handleSelectTable(table.id)}
                                                className={`flex min-h-touch-sm w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-neutral-50 ${selectedTableId === table.id ? 'bg-emerald-50' : ''}`}
                                            >
                                                <span className={`h-2.5 w-2.5 rounded-full ${table.status === 'available' ? 'bg-emerald-500' : 'bg-orange-500'}`} aria-hidden="true" />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate font-semibold text-neutral-900">{table.name}</span>
                                                    <span className="block text-sm text-neutral-500">{capacityLabels[table.capacity]}</span>
                                                </span>
                                                <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-bold text-neutral-600">{table.status}</span>
                                            </button>
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
                                        <h2 className="text-3xl font-bold text-neutral-950">No tables set</h2>
                                        <p className="mt-3 text-lg text-neutral-500">Start customizing your floor layout with Edit layout.</p>
                                    </div>
                                </DotCanvas>
                            ) : (
                                <DotCanvas onClick={() => setSelectedTableId(null)}>
                                    <div className="absolute left-5 top-5 z-10 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-white/90 px-3 py-2 text-sm font-medium text-neutral-800 shadow-sm">
                                        <span className="flex items-center gap-2"><span className="h-4 w-4 rounded-full border-2 border-neutral-200 bg-white" />Available</span>
                                        <span className="flex items-center gap-2"><span className="h-4 w-4 rounded-full border-2 border-neutral-200" style={{ backgroundImage: 'repeating-linear-gradient(-45deg, #fff 0, #fff 3px, #e5e7eb 3px, #e5e7eb 6px)' }} />Used</span>
                                        <span className="flex items-center gap-2"><span className="h-4 w-4 rounded-full bg-emerald-500" />Selected</span>
                                    </div>
                                    {activeLayout.showCashier && (
                                        <div className="absolute left-[10%] top-[55%] flex h-44 w-20 -translate-y-1/2 items-center justify-center border border-neutral-200 bg-neutral-50 text-sm font-semibold tracking-wide text-neutral-500 [writing-mode:vertical-rl]">Cashier</div>
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
                        <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Edit tables</h1>
                        <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                            <button
                                type="button"
                                onClick={() => setDialog('reset')}
                                className="min-h-touch-xs rounded-2xl px-4 font-semibold text-red-600 transition-colors hover:bg-red-50"
                            >
                                Reset layout
                            </button>
                            <label className="flex min-h-touch-xs items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-neutral-700">
                                <span>Show cashier</span>
                                <input
                                    type="checkbox"
                                    checked={draft.showCashier}
                                    onChange={event => setDraft(current => ({ ...current, showCashier: event.target.checked }))}
                                    className="h-6 w-11 cursor-pointer accent-emerald-600"
                                />
                            </label>
                            <button
                                type="button"
                                onClick={handleOpenAdd}
                                className="inline-flex min-h-touch-xs items-center gap-2 rounded-2xl border border-neutral-200 px-4 font-semibold text-neutral-800 transition-colors hover:bg-neutral-50"
                                data-testid="tables-add-table"
                            >
                                <Plus className="h-5 w-5" />
                                Add table
                            </button>
                            <span className="hidden h-8 w-px bg-neutral-200 sm:block" aria-hidden="true" />
                            <button
                                type="button"
                                onClick={handleCancelEditing}
                                className="min-h-touch-xs rounded-2xl border border-neutral-200 px-5 font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => setDialog('save')}
                                className="inline-flex min-h-touch-xs items-center gap-2 rounded-2xl bg-emerald-600 px-5 font-semibold text-white transition-colors hover:bg-emerald-700"
                                data-testid="tables-save-layout"
                            >
                                <Save className="h-5 w-5" />
                                Save
                            </button>
                        </div>
                    </div>

                    <DotCanvas
                        className="min-h-[42rem] touch-none"
                        onPointerMove={handleCanvasPointerMove}
                        onPointerUp={() => setDraggingTableId(null)}
                        onClick={() => setSelectedTableId(null)}
                    >
                        {draft.showCashier && (
                            <div className="absolute left-[10%] top-[55%] flex h-44 w-20 -translate-y-1/2 items-center justify-center border border-neutral-200 bg-neutral-50 text-sm font-semibold tracking-wide text-neutral-500 [writing-mode:vertical-rl]">Cashier</div>
                        )}
                        {draft.tables.map(table => (
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
                                <button type="button" onClick={handleRotate} className="flex min-h-touch-xs min-w-touch-xs items-center justify-center rounded-lg hover:bg-white/15" aria-label={`Rotate ${selectedTable.name}`}><RotateCw className="h-4 w-4" /></button>
                                <button type="button" onClick={handleOpenEdit} className="flex min-h-touch-xs min-w-touch-xs items-center justify-center rounded-lg hover:bg-white/15" aria-label={`Edit ${selectedTable.name}`}><Edit3 className="h-4 w-4" /></button>
                                <button type="button" onClick={() => setDialog('delete')} className="flex min-h-touch-xs min-w-touch-xs items-center justify-center rounded-lg hover:bg-white/15" aria-label={`Delete ${selectedTable.name}`}><Trash2 className="h-4 w-4" /></button>
                            </div>
                        )}
                        {draft.tables.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                                <div className="max-w-sm rounded-3xl bg-white/90 p-8 shadow-sm">
                                    <LayoutGrid className="mx-auto mb-5 h-14 w-14 text-neutral-300" />
                                    <h2 className="text-2xl font-bold text-neutral-950">Add your first table</h2>
                                    <p className="mt-3 text-neutral-500">Use Add table to start building your floor layout.</p>
                                </div>
                            </div>
                        )}
                    </DotCanvas>
                </section>
            )}

            {dialog === 'add' && (
                <Dialog title="Add table" onClose={() => setDialog(null)}>
                    <div className="space-y-5">
                        <label className="block">
                            <span className="mb-2 block text-sm font-semibold text-neutral-800">Table name</span>
                            <input
                                value={addForm.name}
                                onChange={event => setAddForm(current => ({ ...current, name: event.target.value }))}
                                className="min-h-touch-xs w-full rounded-xl border border-neutral-200 px-4 text-base outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                                placeholder="e.g. Table 21"
                                autoFocus
                            />
                        </label>
                        <label className="block">
                            <span className="mb-2 block text-sm font-semibold text-neutral-800">Type</span>
                            <select
                                value={addForm.capacity}
                                onChange={event => {
                                    const value = event.target.value;
                                    setAddForm(current => ({ ...current, capacity: value === '' ? '' : Number(value) as TableCapacity }));
                                }}
                                className="min-h-touch-xs w-full rounded-xl border border-neutral-200 bg-white px-4 text-base outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                            >
                                <option value="">Choose table type</option>
                                <option value="2">Small · 2 seats</option>
                                <option value="4">Medium · 4 seats</option>
                                <option value="6">Large · 6 seats</option>
                            </select>
                        </label>
                        <p className="rounded-xl bg-neutral-50 px-4 py-3 text-sm text-neutral-600">Small tables seat 2, medium tables seat 4, and large tables seat 6.</p>
                        <div className="grid grid-cols-2 gap-3 pt-1">
                            <button type="button" onClick={() => setDialog(null)} className="min-h-touch-xs rounded-xl border border-neutral-200 font-semibold text-neutral-700 hover:bg-neutral-50">Cancel</button>
                            <button type="button" onClick={handlePrepareAdd} disabled={!addForm.name.trim() || addForm.capacity === ''} className="min-h-touch-xs rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">Add</button>
                        </div>
                    </div>
                </Dialog>
            )}

            {dialog === 'confirm-add' && addForm.capacity !== '' && (
                <Dialog title="Add table?" onClose={() => setDialog('add')}>
                    <div className="text-center">
                        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-amber-500" />
                        <p className="text-neutral-600">Add <strong className="text-neutral-900">{addForm.name.trim()}</strong> as a {capacityLabels[addForm.capacity].toLocaleLowerCase()}?</p>
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setDialog('add')} className="min-h-touch-xs rounded-xl border border-neutral-200 font-semibold text-neutral-700 hover:bg-neutral-50">Back</button>
                            <button type="button" onClick={handleConfirmAdd} className="min-h-touch-xs rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700">Yes, add</button>
                        </div>
                    </div>
                </Dialog>
            )}

            {dialog === 'edit' && selectedTable && (
                <Dialog title={`Edit ${selectedTable.name}`} onClose={() => setDialog(null)}>
                    <div className="space-y-5">
                        <label className="block">
                            <span className="mb-2 block text-sm font-semibold text-neutral-800">Table name</span>
                            <input value={editForm.name} onChange={event => setEditForm(current => ({ ...current, name: event.target.value }))} className="min-h-touch-xs w-full rounded-xl border border-neutral-200 px-4 text-base outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100" autoFocus />
                        </label>
                        <label className="block">
                            <span className="mb-2 block text-sm font-semibold text-neutral-800">Type</span>
                            <select value={editForm.capacity} onChange={event => setEditForm(current => ({ ...current, capacity: Number(event.target.value) as TableCapacity }))} className="min-h-touch-xs w-full rounded-xl border border-neutral-200 bg-white px-4 text-base outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100">
                                <option value="2">Small · 2 seats</option>
                                <option value="4">Medium · 4 seats</option>
                                <option value="6">Large · 6 seats</option>
                            </select>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setDialog(null)} className="min-h-touch-xs rounded-xl border border-neutral-200 font-semibold text-neutral-700 hover:bg-neutral-50">Cancel</button>
                            <button type="button" onClick={handleSaveEdit} disabled={!editForm.name.trim() || editForm.capacity === ''} className="min-h-touch-xs rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">Save</button>
                        </div>
                    </div>
                </Dialog>
            )}

            {dialog === 'save' && (
                <Dialog title="Save changes?" onClose={() => setDialog(null)}>
                    <div className="text-center">
                        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-amber-500" />
                        <p className="text-neutral-600">Your updated table layout will be available on this till.</p>
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setDialog(null)} className="min-h-touch-xs rounded-xl border border-neutral-200 font-semibold text-neutral-700 hover:bg-neutral-50">Cancel</button>
                            <button type="button" onClick={handleConfirmSave} className="min-h-touch-xs rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700">Yes, save</button>
                        </div>
                    </div>
                </Dialog>
            )}

            {dialog === 'reset' && (
                <Dialog title="Reset table layout?" onClose={() => setDialog(null)}>
                    <div className="text-center">
                        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
                        <p className="text-neutral-600">This removes every table from this till’s saved layout. You can add them again afterwards.</p>
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setDialog(null)} className="min-h-touch-xs rounded-xl border border-neutral-200 font-semibold text-neutral-700 hover:bg-neutral-50">Cancel</button>
                            <button type="button" onClick={handleConfirmReset} className="min-h-touch-xs rounded-xl bg-red-600 font-semibold text-white hover:bg-red-700">Yes, reset</button>
                        </div>
                    </div>
                </Dialog>
            )}

            {dialog === 'delete' && selectedTable && (
                <Dialog title={`Delete ${selectedTable.name}?`} onClose={() => setDialog(null)}>
                    <div className="text-center">
                        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
                        <p className="text-neutral-600">This table will be removed from the draft layout when you save.</p>
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setDialog(null)} className="min-h-touch-xs rounded-xl border border-neutral-200 font-semibold text-neutral-700 hover:bg-neutral-50">Cancel</button>
                            <button type="button" onClick={handleConfirmDelete} className="min-h-touch-xs rounded-xl bg-red-600 font-semibold text-white hover:bg-red-700">Yes, delete</button>
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
