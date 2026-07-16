import { initializeLocalDatabase, localDb } from '../lib/localDatabase';
import type {
    LocalCustomer,
    LocalTableOrder,
    TableOrderGlobalDiscount,
    TableOrderLine,
    TableOrderPointsRedemption,
} from '../types/supabase';
import { generateUUID } from '../utils/uuid';

const TABLE_ORDERS_CHANNEL = 'pos-table-orders';
const TABLE_ORDERS_STORAGE_EVENT = 'pos_table_orders_changed_at';

export interface TableOrderSnapshot {
    lines: TableOrderLine[];
    customer: LocalCustomer | null;
    globalDiscount: TableOrderGlobalDiscount;
    pointsRedemption: TableOrderPointsRedemption | null;
}

export interface CreateTableOrderInput extends TableOrderSnapshot {
    tableId: string;
    tableName: string;
}

export interface MoveTableOrderInput {
    tableId: string;
    tableName: string;
}

export class TableOrderAlreadyOpenError extends Error {
    constructor(tableName: string) {
        super(`${tableName} already has an open order.`);
        this.name = 'TableOrderAlreadyOpenError';
    }
}

export class TableOrderNotOpenError extends Error {
    constructor() {
        super('This table order is no longer open.');
        this.name = 'TableOrderNotOpenError';
    }
}

const isBlocking = (status: LocalTableOrder['status']): boolean =>
    status === 'open' || status === 'settling';

const cloneLines = (lines: TableOrderLine[]): TableOrderLine[] =>
    lines.map(line => ({ ...line, product: { ...line.product } }));

const cloneCustomer = (customer: LocalCustomer | null): LocalCustomer | null =>
    customer ? { ...customer } : null;

const cloneSnapshot = (snapshot: TableOrderSnapshot): TableOrderSnapshot => ({
    lines: cloneLines(snapshot.lines),
    customer: cloneCustomer(snapshot.customer),
    globalDiscount: { ...snapshot.globalDiscount },
    pointsRedemption: snapshot.pointsRedemption ? { ...snapshot.pointsRedemption } : null,
});

function notifyTableOrdersChanged(): void {
    try {
        const channel = new BroadcastChannel(TABLE_ORDERS_CHANNEL);
        channel.postMessage({ type: 'TABLE_ORDERS_CHANGED' });
        channel.close();
        return;
    } catch {
        // BroadcastChannel is absent in some WebViews and tests. The storage
        // event still lets a second tab refresh its floor view.
    }

    try {
        localStorage.setItem(TABLE_ORDERS_STORAGE_EVENT, String(Date.now()));
    } catch {
        // Local persistence is still valid even if storage events are blocked.
    }
}

class TableOrderService {
    async listBlocking(): Promise<LocalTableOrder[]> {
        await initializeLocalDatabase();
        const orders = await localDb.tableOrders.toArray();
        return orders
            .filter(order => isBlocking(order.status))
            .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
    }

    async getById(id: string): Promise<LocalTableOrder | undefined> {
        await initializeLocalDatabase();
        return localDb.tableOrders.get(id);
    }

    async getBlockingByTableId(tableId: string): Promise<LocalTableOrder | undefined> {
        await initializeLocalDatabase();
        const orders = await localDb.tableOrders.where('table_id').equals(tableId).toArray();
        return orders.find(order => isBlocking(order.status));
    }

    async createOpenOrder(input: CreateTableOrderInput): Promise<LocalTableOrder> {
        await initializeLocalDatabase();
        const now = new Date();
        const snapshot = cloneSnapshot(input);
        let created: LocalTableOrder | undefined;

        await localDb.transaction('rw', localDb.tableOrders, async () => {
            const current = await localDb.tableOrders.where('table_id').equals(input.tableId).toArray();
            if (current.some(order => isBlocking(order.status))) {
                throw new TableOrderAlreadyOpenError(input.tableName);
            }

            created = {
                id: generateUUID(),
                table_id: input.tableId,
                table_name: input.tableName,
                status: 'open',
                lines: snapshot.lines,
                customer: snapshot.customer,
                global_discount: snapshot.globalDiscount,
                points_redemption: snapshot.pointsRedemption,
                created_at: now,
                updated_at: now,
                settled_at: null,
                fiscal_transaction_id: null,
            };
            await localDb.tableOrders.add(created);
        });

        if (!created) throw new Error('Could not create the table order.');
        notifyTableOrdersChanged();
        return created;
    }

    async updateOpenOrder(id: string, snapshot: TableOrderSnapshot): Promise<void> {
        await initializeLocalDatabase();
        const next = cloneSnapshot(snapshot);
        const now = new Date();

        await localDb.transaction('rw', localDb.tableOrders, async () => {
            const order = await localDb.tableOrders.get(id);
            if (!order || order.status !== 'open') throw new TableOrderNotOpenError();
            await localDb.tableOrders.update(id, {
                lines: next.lines,
                customer: next.customer,
                global_discount: next.globalDiscount,
                points_redemption: next.pointsRedemption,
                updated_at: now,
            });
        });
        notifyTableOrdersChanged();
    }

    async moveOpenOrder(id: string, destination: MoveTableOrderInput): Promise<void> {
        await initializeLocalDatabase();
        const now = new Date();

        await localDb.transaction('rw', localDb.tableOrders, async () => {
            const order = await localDb.tableOrders.get(id);
            if (!order || order.status !== 'open') throw new TableOrderNotOpenError();

            const destinationOrders = await localDb.tableOrders
                .where('table_id')
                .equals(destination.tableId)
                .toArray();
            if (destinationOrders.some(candidate => candidate.id !== id && isBlocking(candidate.status))) {
                throw new TableOrderAlreadyOpenError(destination.tableName);
            }

            await localDb.tableOrders.update(id, {
                table_id: destination.tableId,
                table_name: destination.tableName,
                updated_at: now,
            });
        });
        notifyTableOrdersChanged();
    }

    /**
     * Blocks reopening while fiscal checkout is in flight. If the device exits
     * after issuance but before `markSettled`, the table stays blocked rather
     * than allowing a potentially duplicate fiscal payment.
     */
    async beginSettlement(id: string): Promise<void> {
        await initializeLocalDatabase();
        const now = new Date();
        await localDb.transaction('rw', localDb.tableOrders, async () => {
            const order = await localDb.tableOrders.get(id);
            if (!order || order.status !== 'open') throw new TableOrderNotOpenError();
            await localDb.tableOrders.update(id, { status: 'settling', updated_at: now });
        });
        notifyTableOrdersChanged();
    }

    async restoreOpen(id: string): Promise<void> {
        await initializeLocalDatabase();
        const now = new Date();
        const order = await localDb.tableOrders.get(id);
        if (!order || order.status !== 'settling') return;
        await localDb.tableOrders.update(id, { status: 'open', updated_at: now });
        notifyTableOrdersChanged();
    }

    async markSettled(id: string, fiscalTransactionId: string): Promise<void> {
        await initializeLocalDatabase();
        const now = new Date();
        await localDb.transaction('rw', localDb.tableOrders, async () => {
            const order = await localDb.tableOrders.get(id);
            if (!order || !isBlocking(order.status)) throw new TableOrderNotOpenError();
            await localDb.tableOrders.update(id, {
                status: 'settled',
                settled_at: now,
                fiscal_transaction_id: fiscalTransactionId,
                updated_at: now,
            });
        });
        notifyTableOrdersChanged();
    }

    async discardOpenOrder(id: string): Promise<void> {
        await initializeLocalDatabase();
        await localDb.transaction('rw', localDb.tableOrders, async () => {
            const order = await localDb.tableOrders.get(id);
            if (!order || order.status !== 'open') throw new TableOrderNotOpenError();
            await localDb.tableOrders.delete(id);
        });
        notifyTableOrdersChanged();
    }

    subscribe(onChange: () => void): () => void {
        let channel: BroadcastChannel | null = null;
        const storageListener = (event: StorageEvent) => {
            if (event.key === TABLE_ORDERS_STORAGE_EVENT) onChange();
        };

        try {
            channel = new BroadcastChannel(TABLE_ORDERS_CHANNEL);
            channel.onmessage = onChange;
        } catch {
            window.addEventListener('storage', storageListener);
        }

        return () => {
            channel?.close();
            window.removeEventListener('storage', storageListener);
        };
    }
}

export const tableOrderService = new TableOrderService();
