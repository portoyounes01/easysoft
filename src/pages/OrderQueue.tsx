import React, { useCallback, useEffect, useState } from 'react';
import { Check, Clock3, ExternalLink, Loader2, PackageCheck } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { initializeLocalDatabase } from '../lib/localDatabase';
import { queueTicketService } from '../services/queueTicketService';
import type { LocalQueueTicket } from '../types/supabase';

const OrderQueue: React.FC = () => {
  const { settings } = useSettings();
  const [tickets, setTickets] = useState<LocalQueueTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadTickets = useCallback(async () => {
    await initializeLocalDatabase();
    const active = await queueTicketService.listActiveTickets(
      settings.orderQueue.readyRetentionMinutes
    );
    setTickets(active);
    setIsLoading(false);
  }, [settings.orderQueue.readyRetentionMinutes]);

  const handleStatus = async (
    ticket: LocalQueueTicket,
    status: 'ready' | 'collected'
  ) => {
    await queueTicketService.updateStatus(ticket.id, status);
    await loadTickets();
  };

  const handleOpenDisplay = () => {
    const target = ['app:', 'file:'].includes(window.location.protocol)
      ? `${window.location.href.split('#')[0]}#/order-status`
      : `${window.location.origin}/order-status`;
    window.open(target, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    void loadTickets();
    const interval = window.setInterval(() => void loadTickets(), 3000);
    const unsubscribe = queueTicketService.subscribe(() => void loadTickets());
    return () => {
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [loadTickets]);

  const preparing = tickets.filter(ticket => ticket.status === 'preparing');
  const ready = tickets.filter(ticket => ticket.status === 'ready');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-400">Service queue</p>
          <h1 className="mt-1 text-3xl font-bold text-gray-950">Order tickets</h1>
          <p className="mt-2 text-gray-500">Mark orders ready when customers can collect them.</p>
        </div>
        <button
          type="button"
          onClick={handleOpenDisplay}
          className="inline-flex min-h-touch items-center justify-center gap-2 rounded-2xl bg-gray-950 px-6 py-3 font-semibold text-white hover:bg-gray-800"
        >
          <ExternalLink className="h-5 w-5" />
          Open customer display
        </button>
      </div>

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center rounded-3xl bg-white">
          <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-amber-100 bg-amber-50 px-6 py-5">
              <Clock3 className="h-6 w-6 text-amber-700" />
              <h2 className="text-xl font-bold text-amber-950">Preparing</h2>
              <span className="ml-auto rounded-full bg-amber-200 px-3 py-1 text-sm font-bold text-amber-900">{preparing.length}</span>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {preparing.map(ticket => (
                <article key={ticket.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                  <p className="text-4xl font-black tracking-tight text-gray-950">{ticket.display_number}</p>
                  <p className="mt-2 text-sm text-gray-500">
                    {ticket.created_at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleStatus(ticket, 'ready')}
                    className="mt-5 inline-flex min-h-touch w-full items-center justify-center gap-2 rounded-xl bg-green-500 px-4 font-bold text-white hover:bg-green-600"
                  >
                    <PackageCheck className="h-5 w-5" />
                    Mark ready
                  </button>
                </article>
              ))}
              {preparing.length === 0 && <p className="col-span-full py-12 text-center text-gray-400">No orders preparing.</p>}
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-green-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-green-100 bg-green-50 px-6 py-5">
              <PackageCheck className="h-6 w-6 text-green-700" />
              <h2 className="text-xl font-bold text-green-950">Ready</h2>
              <span className="ml-auto rounded-full bg-green-200 px-3 py-1 text-sm font-bold text-green-900">{ready.length}</span>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {ready.map(ticket => (
                <article key={ticket.id} className="rounded-2xl border border-green-200 bg-green-50 p-5">
                  <p className="text-4xl font-black tracking-tight text-green-950">{ticket.display_number}</p>
                  <p className="mt-2 text-sm text-green-700">Waiting for collection</p>
                  <button
                    type="button"
                    onClick={() => void handleStatus(ticket, 'collected')}
                    className="mt-5 inline-flex min-h-touch w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 font-bold text-white hover:bg-gray-800"
                  >
                    <Check className="h-5 w-5" />
                    Collected
                  </button>
                </article>
              ))}
              {ready.length === 0 && <p className="col-span-full py-12 text-center text-gray-400">No orders ready.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default OrderQueue;
