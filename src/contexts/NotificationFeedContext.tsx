import React, {
  createContext, useContext, useEffect, useRef, useState, useCallback, useMemo,
} from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useSupabaseAuth } from './SupabaseAuthContext';
import type { NotificationEvent } from '../lib/notificationTypes';

// How many recent events to pull on (re)connect, and the in-memory cap on the feed.
const BACKFILL_LIMIT = 50;
const FEED_CAP = 200;

interface NotificationFeedValue {
  events: NotificationEvent[];
  unreadCount: number;
  lastReadAt: string | null;
  connected: boolean;
  markAllRead: () => Promise<void>;
}

const NotificationFeedContext = createContext<NotificationFeedValue | undefined>(undefined);

export function useNotificationFeed(): NotificationFeedValue {
  const ctx = useContext(NotificationFeedContext);
  if (!ctx) throw new Error('useNotificationFeed must be used within a NotificationFeedProvider');
  return ctx;
}

// Live in-app notification feed for the PWA. One Realtime channel per active tenant,
// RLS-scoped by the setAuth'd user JWT (SupabaseAuthContext keeps that token fresh); the
// tenant_id filter is defense-in-depth on top of the row policy. Mount PWA-host-gated —
// the till never renders a consumer, so this provider is browser-only.
// See docs/pwa-notifications-plan.md P3a Steps 4-6.
export const NotificationFeedProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, principal } = useSupabaseAuth();
  const tenantId = principal?.tenantId ?? null;
  const userId = session?.user?.id ?? null;
  const token = session?.access_token ?? null;
  const hasToken = !!token;

  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  // Refs so the long-lived channel/listener callbacks read current values without
  // being in the effect's dependency list (which would tear down the channel).
  const tenantRef = useRef<string | null>(tenantId);
  tenantRef.current = tenantId;

  // Pull the most recent events + this user's read cursor. Called on every SUBSCRIBED
  // (initial connect AND each Realtime auto-rejoin), so a reconnect self-heals any gap.
  const backfill = useCallback(async (tid: string) => {
    const [{ data: rs }, { data: evs }] = await Promise.all([
      supabase.from('notification_read_state').select('last_read_at').maybeSingle(),
      supabase
        .from('notification_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(BACKFILL_LIMIT),
    ]);
    if (tenantRef.current !== tid) return; // tenant switched while awaiting — drop stale data
    setLastReadAt(rs?.last_read_at ?? null);
    setEvents((evs ?? []) as NotificationEvent[]);
  }, []);

  useEffect(() => {
    if (!tenantId || !hasToken) {
      setEvents([]);
      setLastReadAt(null);
      setConnected(false);
      return;
    }

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    // Realtime auth is set by SupabaseAuthContext on sign-in/refresh; re-assert here so a
    // provider that mounts after those events still authorizes the channel as this user.
    if (token) void supabase.realtime.setAuth(token);

    channel = supabase
      .channel(`notif:${tenantId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notification_events', filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const row = payload.new as NotificationEvent;
          setEvents((prev) => (prev.some((e) => e.id === row.id) ? prev : [row, ...prev].slice(0, FEED_CAP)));
        },
      )
      .subscribe((status) => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') {
          setConnected(true);
          void backfill(tenantId); // catch up on connect + every auto-rejoin
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnected(false);
          // Token may have expired mid-session; re-apply a fresh one so the auto-rejoin authorizes.
          void supabase.auth.getSession().then(({ data }) => {
            if (!cancelled && data.session?.access_token) void supabase.realtime.setAuth(data.session.access_token);
          });
        } else if (status === 'CLOSED') {
          setConnected(false);
        }
      });

    // Instant catch-up when the tab regains focus (cheaper than waiting for a heartbeat
    // to notice a stale socket after a phone/laptop sleep).
    const onVisible = () => {
      if (document.visibilityState === 'visible' && tenantRef.current) void backfill(tenantRef.current);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (channel) void supabase.removeChannel(channel);
      setConnected(false);
    };
    // token value intentionally excluded: hourly refresh keeps the socket authed via the
    // auth context's setAuth — re-subscribe only when the tenant or token *presence* changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, hasToken, backfill]);

  const markAllRead = useCallback(async () => {
    const tid = tenantRef.current;
    if (!tid || !userId) return;
    const now = new Date().toISOString();
    setLastReadAt(now); // optimistic — the feed is non-destructive, so a failed write just re-shows the dot
    const { error } = await supabase
      .from('notification_read_state')
      .upsert({ user_id: userId, tenant_id: tid, last_read_at: now, updated_at: now }, { onConflict: 'user_id,tenant_id' });
    if (error) console.warn('[notifications] failed to persist read cursor:', error.message);
  }, [userId]);

  const unreadCount = useMemo(() => {
    const readMs = lastReadAt ? Date.parse(lastReadAt) : 0;
    return events.reduce((n, e) => (Date.parse(e.created_at) > readMs ? n + 1 : n), 0);
  }, [events, lastReadAt]);

  const value = useMemo<NotificationFeedValue>(
    () => ({ events, unreadCount, lastReadAt, connected, markAllRead }),
    [events, unreadCount, lastReadAt, connected, markAllRead],
  );

  return <NotificationFeedContext.Provider value={value}>{children}</NotificationFeedContext.Provider>;
};
