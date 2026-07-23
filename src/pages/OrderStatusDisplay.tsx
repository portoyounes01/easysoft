import React, { useCallback, useEffect, useState } from 'react';
import { Clock3, PackageCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../contexts/SettingsContext';
import { initializeLocalDatabase } from '../lib/localDatabase';
import { queueTicketService } from '../services/queueTicketService';
import type { LocalQueueTicket } from '../types/supabase';
import {
  DesignSystem2CustomizationProvider,
  useDesignSystem2Customization,
} from '../contexts/DesignSystem2CustomizationContext';
import '../styles/design-system-2-scope.css';

const TicketGrid: React.FC<{ tickets: LocalQueueTicket[]; tone: 'preparing' | 'ready' }> = ({
  tickets,
  tone,
}) => {
  const ready = tone === 'ready';
  return (
    <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
      {tickets.map(ticket => (
        <div
          key={ticket.id}
          className={`flex min-h-32 items-center justify-center rounded-3xl border-2 px-5 text-center text-5xl font-black tracking-tight shadow-lg ${
            ready
              ? 'border-green-300 bg-green-500 text-white'
              : 'border-slate-200 bg-white text-slate-900'
          }`}
        >
          {ticket.display_number}
        </div>
      ))}
    </div>
  );
};

const OrderStatusDisplayInner: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { visualStyle, prefs } = useDesignSystem2Customization();
  const [tickets, setTickets] = useState<LocalQueueTicket[]>([]);
  const [clock, setClock] = useState(new Date());

  const loadTickets = useCallback(async () => {
    await initializeLocalDatabase();
    setTickets(
      await queueTicketService.listActiveTickets(settings.orderQueue.readyRetentionMinutes)
    );
  }, [settings.orderQueue.readyRetentionMinutes]);

  useEffect(() => {
    void loadTickets();
    const interval = window.setInterval(() => {
      setClock(new Date());
      void loadTickets();
    }, 2000);
    const unsubscribe = queueTicketService.subscribe(() => void loadTickets());
    return () => {
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [loadTickets]);

  const preparing = tickets.filter(ticket => ticket.status === 'preparing');
  const ready = tickets.filter(ticket => ticket.status === 'ready');

  return (
    <main className="ds2-visual-scope min-h-screen bg-slate-100 p-6 text-slate-950 md:p-10" style={visualStyle} data-ds2-neutral={prefs.neutralFamilyId}>
      <header className="mb-8 flex items-center justify-between rounded-3xl bg-white px-7 py-5 shadow-sm">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-green-600">{settings.company.name}</p>
          <h1 className="mt-1 text-3xl font-black">{t('orderStatusDisplay.title')}</h1>
        </div>
        <time className="text-2xl font-bold tabular-nums text-slate-500">
          {clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </time>
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="rounded-[2rem] bg-slate-200/70 p-6">
          <div className="mb-6 flex items-center gap-3">
            <Clock3 className="h-8 w-8 text-slate-600" />
            <h2 className="text-3xl font-black">{t('orderStatusDisplay.preparingTitle')}</h2>
          </div>
          <TicketGrid tickets={preparing} tone="preparing" />
          {preparing.length === 0 && <p className="py-20 text-center text-xl text-slate-400">{t('orderStatusDisplay.noCurrentOrders')}</p>}
        </section>

        <section className="rounded-[2rem] bg-green-100 p-6">
          <div className="mb-6 flex items-center gap-3 text-green-900">
            <PackageCheck className="h-8 w-8" />
            <h2 className="text-3xl font-black">{t('orderStatusDisplay.readyToCollect')}</h2>
          </div>
          <TicketGrid tickets={ready} tone="ready" />
          {ready.length === 0 && <p className="py-20 text-center text-xl text-green-500">{t('orderStatusDisplay.waitingForNextOrder')}</p>}
        </section>
      </div>
    </main>
  );
};

// /order-status renders outside Layout (no DesignSystem2CustomizationProvider in the tree),
// so mount the provider here — same pattern as LoginForm2.
const OrderStatusDisplay: React.FC = () => (
  <DesignSystem2CustomizationProvider>
    <OrderStatusDisplayInner />
  </DesignSystem2CustomizationProvider>
);

export default OrderStatusDisplay;
