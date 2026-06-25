import { localDb } from '../lib/localDatabase';
import type { LocalQueueTicket, QueueTicketStatus } from '../types/supabase';
import { generateUUID } from '../utils/uuid';

const QUEUE_CHANNEL = 'pos-order-queue';

function localDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export interface QueueNumberSettings {
    prefix: string;
    startNumber: number;
    padding: number;
}

function notifyQueueChanged(): void {
    try {
        const channel = new BroadcastChannel(QUEUE_CHANNEL);
        channel.postMessage({ type: 'QUEUE_CHANGED' });
        channel.close();
    } catch {
        localStorage.setItem('pos_order_queue_changed_at', String(Date.now()));
    }
}

export function formatTicketNumber(
    sequence: number,
    settings: Pick<QueueNumberSettings, 'prefix' | 'padding'>
): string {
    const prefix = settings.prefix.trim().toUpperCase();
    const number = String(sequence).padStart(Math.max(1, settings.padding), '0');
    return `${prefix}${number}`;
}

class QueueTicketService {
    async getByReceiptReference(receiptReference: string): Promise<LocalQueueTicket | undefined> {
        return localDb.queueTickets
            .where('receipt_reference')
            .equals(receiptReference)
            .first();
    }

    async issueTicket(
        receiptReference: string,
        settings: QueueNumberSettings,
        now = new Date()
    ): Promise<LocalQueueTicket> {
        const existing = await localDb.queueTickets
            .where('receipt_reference')
            .equals(receiptReference)
            .first();
        if (existing) return existing;

        const serviceDate = localDateKey(now);
        let created: LocalQueueTicket | undefined;
        await localDb.transaction('rw', localDb.queueTickets, async () => {
            const duplicate = await localDb.queueTickets
                .where('receipt_reference')
                .equals(receiptReference)
                .first();
            if (duplicate) {
                created = duplicate;
                return;
            }

            const today = await localDb.queueTickets
                .where('service_date')
                .equals(serviceDate)
                .toArray();
            const highest = today.reduce(
                (current, ticket) => Math.max(current, ticket.sequence),
                settings.startNumber - 1
            );
            const sequence = highest + 1;
            created = {
                id: generateUUID(),
                receipt_reference: receiptReference,
                service_date: serviceDate,
                sequence,
                display_number: formatTicketNumber(sequence, settings),
                status: 'preparing',
                created_at: now,
                updated_at: now,
                ready_at: null,
                collected_at: null,
            };
            await localDb.queueTickets.add(created);
        });
        if (!created) throw new Error('Could not create queue ticket');
        notifyQueueChanged();
        return created;
    }

    async listActiveTickets(
        readyRetentionMinutes: number,
        now = new Date()
    ): Promise<LocalQueueTicket[]> {
        const serviceDate = localDateKey(now);
        const cutoff = now.getTime() - Math.max(1, readyRetentionMinutes) * 60_000;
        const tickets = await localDb.queueTickets
            .where('service_date')
            .equals(serviceDate)
            .toArray();
        return tickets
            .filter(ticket => {
                if (ticket.status === 'preparing') return true;
                if (ticket.status === 'ready') {
                    return !ticket.ready_at || ticket.ready_at.getTime() >= cutoff;
                }
                return false;
            })
            .sort((a, b) => a.sequence - b.sequence);
    }

    async updateStatus(id: string, status: QueueTicketStatus): Promise<void> {
        const now = new Date();
        const update: Partial<LocalQueueTicket> = {
            status,
            updated_at: now,
        };
        if (status === 'ready') update.ready_at = now;
        if (status === 'collected') update.collected_at = now;
        await localDb.queueTickets.update(id, update);
        notifyQueueChanged();
    }

    subscribe(onChange: () => void): () => void {
        let channel: BroadcastChannel | null = null;
        const storageListener = (event: StorageEvent) => {
            if (event.key === 'pos_order_queue_changed_at') onChange();
        };
        try {
            channel = new BroadcastChannel(QUEUE_CHANNEL);
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

export const queueTicketService = new QueueTicketService();
