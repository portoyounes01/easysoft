# Notifications + Alerts — Revised Phased Implementation Plan (branch `pwa`)

Multi-tenant Supabase (EasySoft, ref `kmojrkkjuehmpordueoe`). Delivery = in-app tenant-scoped bell/feed (Realtime) **and** background Web Push (installed PWA). Producers = DB triggers on tables the till already writes + a till heartbeat. Thresholds live in `tenant_settings.data.alerts`, read by the triggers (never hardcoded).

Sequenced so value ships early: **P3a** lights the live bell from server-detected alerts; **P3b** adds background push for critical events; **P3c** adds offline detection; **P3d** closes the revocation hole that Web Push newly makes exploitable off-device.

> ## Corrections applied vs the critiqued plan (read first)
> 1. **Migration renumbering (deploy-blocker).** `20260718000000` is already taken by `20260718000000_pwa_p1_human_identity.sql` on this branch. ALL notification migrations are renumbered to unique, strictly-increasing timestamps **after** the last existing one, preserving phase order: **P3a → `20260721*`, P3b → `20260722*`, P3c → `20260723*`, P3d → `20260724*`**. (P3b/P3c depend on P3a helpers, so they MUST sort after P3a — do not leave P3a at a later timestamp than P3b/P3c.)
> 2. **Helper EXECUTE grant (false rationale → real REVOKE).** Postgres default-grants `EXECUTE` to `PUBLIC` on every `CREATE FUNCTION`. The plan's "no EXECUTE grant on the helpers" is false; the ONLY thing blocking `rpc('app.emit_notification', …)` cross-tenant forge today is that the `app` schema is not a PostgREST-exposed schema (`schemas = ["public","graphql_public"]`, verified). The helpers migration now issues explicit `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` as defense-in-depth.
> 3. **Push-dispatch trigger runs INSIDE the producing transaction (fail-dangerous).** `trg_notify_push_dispatch` fires synchronously while `upsert_transaction_with_items` / the fiscal-cancel RPC transaction is still open. An unguarded `net.http_post` that throws (missing Vault secret, pg_net absent) would roll back the till's fiscal write. The dispatch fn is now NULL-guarded on the Vault reads and wrapped in `BEGIN … EXCEPTION WHEN OTHERS THEN NULL`; the migration asserts pg_net/pg_cron are installed.
> 4. **Revocation gap (HIGH).** A removed/demoted manager keeps receiving tenant-A Realtime, REST backfill, AND background Web Push for the full token life (≤ `jwt_expiry = 3600s`, and Web Push is an off-device leak). `notify-push` now **inner-joins `tenant_members`** on `(user_id, event.tenant_id)` before sending; new phase **P3d** adds a `revoke-human` edge fn (clears/re-stamps `app_metadata`, deletes `push_subscriptions`, force-signs-out the session) and a **Custom Access Token Hook** that re-reads `tenant_members` on every issue so `app.tenant_id()` drops at next refresh.
> 5. **push_subscriptions endpoint scoping (racy re-key / shared-device).** `UNIQUE(endpoint)` + `onConflict:'endpoint'` lets one device physically hold only one tenant row and breaks shared-device re-own (RLS hides the conflicting row → upsert degrades to a failing INSERT). Changed to composite `UNIQUE(user_id, tenant_id, endpoint)`; opt-in rotates the browser subscription when the IndexedDB-cached owner differs from the current user; `notify-push` dedupes by physical endpoint per pass.
> 6. **jwt_expiry is 1h, not ~15 min.** Every "~15-min refresh" premise is corrected to `jwt_expiry = 3600`. Backgrounded PWA tabs get throttled refresh timers, so the token reliably expires while asleep — the socket-recovery path now force-refreshes the token before re-`setAuth`, and re-runs the REST backfill on reconnect (Realtime never replays WAL gaps).
> 7. **Double-notify + capability/opt-out + subscription-rotation** gaps folded into P3b (SW visibility check, feature-detect + explicit Disable-alerts toggle, app-open subscription reconciliation).

---

## Multi-tenant isolation checklist (applies across all phases)

1. **Trigger `tenant_id` source** — every producer sets `tenant_id` from `NEW.tenant_id` on the source row, NEVER from `app.tenant_id()`. The firing DML runs inside the SECURITY DEFINER upsert RPC (owner context) or a service-role edge fn — neither carries `app_metadata`, so `app.tenant_id()` would be NULL. `NEW.tenant_id` is server-stamped and correct (verified: `transactions.tenant_id` server-stamped; `fiscal_issue_attempts.tenant_id` from the verified device JWT in pos-checkout, not client body; `devices`/`cash_drawer_logs` server-set).
2. **Every producer/helper is `SECURITY DEFINER … SET search_path = public, pg_temp`**, owned by the migration/owner role — bypasses RLS (not forced) to read `tenant_settings` and write `notification_events` for any tenant; the pinned `search_path` closes the DEFINER injection vector.
3. **Helper EXECUTE is explicitly revoked.** `app.tenant_setting` and `app.emit_notification` are DEFINER cross-tenant primitives (read any tenant's settings / forge a notification for any tenant). Default `EXECUTE TO PUBLIC` is removed via explicit `REVOKE … FROM PUBLIC, anon, authenticated`. Keeping the `app` schema out of PostgREST exposed schemas is the OTHER independent guard — never expose `app`, and never add a `public`-schema wrapper that calls these.
4. **Realtime `setAuth`** — supabase-js 2.50.4 does NOT push the user JWT to the socket (`_handleTokenChanged` only stores a dead field; socket default = anon apikey). Without explicit `supabase.realtime.setAuth(access_token)` the feed authenticates as anon → post-phase-3 anon has NO grant/policy on `notification_events` → **empty feed, never a cross-tenant leak** (fail-closed). `setAuth` is mandatory at subscribe, on reload, on every `SIGNED_IN`/`TOKEN_REFRESHED`, and — new — after a forced token refresh on socket recovery.
5. **Feed RLS boundary** — the EXISTING phase-3 policy `notification_events_tenant_isolation FOR ALL TO authenticated USING (tenant_id = app.tenant_id())` is the cross-tenant boundary; Realtime (WALRUS) evaluates that same SELECT policy per-change per-connection using the setAuth JWT. The client channel `filter`/name are a WAL-shedding optimization + cosmetic label with ZERO isolation value. Treat this one policy as load-bearing (CI assertion in P3a Step 3).
6. **Push fan-out is tenant-keyed AND membership-checked.** `notify-push` reads `push_subscriptions WHERE tenant_id = <event row>.tenant_id` **INNER JOIN `tenant_members` ON (push_subscriptions.user_id = tenant_members.user_id AND tenant_members.tenant_id = <event row>.tenant_id)`, deduped by physical endpoint per pass. The membership join is the live-revocation guard the JWT/stored `tenant_id` cannot provide.** `push_subscriptions` RLS = `user_id = auth.uid() AND tenant_id = app.tenant_id()`; composite `UNIQUE(user_id, tenant_id, endpoint)`.
7. **Heartbeat is self-scoped** — `device_heartbeat()` updates `WHERE id = app.device_id() AND tenant_id = app.tenant_id() AND status='enrolled'`, gated on `app.app_role()='device'`; DEFINER so it cannot touch tenant-siblings.
8. **Read-state + push tables** carry their own tenant-scoped RLS mirroring phase-3.
9. **Revocation** is closed live: push via the membership join (P3b), feed via `revoke-human` + Custom Access Token Hook (P3d). Until P3d ships, the feed/REST leak is bounded to ≤ `jwt_expiry (3600s)` and is called out as an open issue — NOT silently deferred.

---

## Phase P3a — Server producers + in-app bell/feed (Realtime) + Notifications Settings

**Goal:** server-detected alerts (`REFUND_ISSUED`, `FISCAL_CANCELLATION`, `LARGE_DISCOUNT`, `FISCAL_ISSUE_FAILED`, `DRAWER_OPEN_NO_SALE`) stream into a live, tenant-scoped bell. **All five types already exist in the CHECK — no enum change.**

### Step 1 — Shared helpers + de-dup index (`20260721000000_notif_producer_helpers.sql`)

```sql
CREATE OR REPLACE FUNCTION app.tenant_setting(p_tenant uuid, p_path text[], p_default jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT data #> p_path FROM public.tenant_settings WHERE tenant_id = p_tenant),
    p_default);
$$;

CREATE OR REPLACE FUNCTION app.emit_notification(
  p_tenant uuid, p_store uuid, p_device uuid, p_type text, p_severity text,
  p_actor uuid, p_entity_table text, p_entity_id uuid, p_payload jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO public.notification_events
    (tenant_id, store_id, device_id, event_type, severity, actor_employee_id, entity_table, entity_id, payload)
  VALUES (p_tenant, p_store, p_device, p_type, p_severity, p_actor, p_entity_table, p_entity_id,
          COALESCE(p_payload, '{}'::jsonb))
  ON CONFLICT DO NOTHING;
$$;

-- CORRECTED RATIONALE: Postgres grants EXECUTE to PUBLIC by default. These are DEFINER
-- cross-tenant primitives; strip the default grant. (Schema-non-exposure is the OTHER guard.)
REVOKE EXECUTE ON FUNCTION app.tenant_setting(uuid, text[], jsonb)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app.emit_notification(uuid, uuid, uuid, text, text, uuid, text, uuid, jsonb)
                                                                          FROM PUBLIC, anon, authenticated;

-- At-most-once for entity-keyed events. EXCLUDES DEVICE_OFFLINE (recurs per outage) and
-- DRAWER_OPEN_NO_SALE (unique by its own append-only entity_id).
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_once
  ON public.notification_events (tenant_id, event_type, entity_id)
  WHERE entity_id IS NOT NULL
    AND event_type IN ('REFUND_ISSUED','FISCAL_CANCELLATION','FISCAL_ISSUE_FAILED','LARGE_DISCOUNT');

-- Seed default-tenant alerts config (idempotent; does not clobber existing 'alerts').
UPDATE public.tenant_settings
   SET data = jsonb_set(data, '{alerts}',
       '{"large_discount":{"enabled":true,"amount":50,"percentage":30},"offline":{"enabled":true,"grace_seconds":300}}'::jsonb)
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND NOT (data ? 'alerts');
```

### Step 2 — Producer triggers (`20260721001000_notif_producers.sql`)

**De-dup principle (migration header):** every trigger emits ONLY on a genuine OLD→NEW transition (INSERT ⇒ OLD=NULL), because `upsert_transaction_with_items` re-runs `ON CONFLICT DO UPDATE` on every idempotent offline re-sync and DELETE+re-INSERTs all `transaction_items` each call — keep detection on the `transactions` row, never on items.

Three DEFINER trigger functions (unchanged shapes from the critiqued plan — the critique verified their columns and tenant_id sourcing):
- `notify_transaction_events()` — `AFTER INSERT OR UPDATE ON public.transactions`: `REFUND_ISSUED` (warning, on transition into `refunded`/`partial_refund`), `FISCAL_CANCELLATION` (critical, `fiscal_cancelled_at` NULL→NOT NULL), `LARGE_DISCOUNT` (warning, only when `discount`/`discount_percentage` actually changed AND `discount>0`; threshold read in the BODY via `app.tenant_setting(NEW.tenant_id, ARRAY['alerts','large_discount'], …)`; effective pct = `COALESCE(NULLIF(discount_percentage,0), discount/NULLIF(subtotal,0)*100)`).
- `notify_fiscal_issue_failed()` — `AFTER INSERT OR UPDATE OF status ON public.fiscal_issue_attempts`, entity_id = `NEW.checkout_id` (PK; no `id` column), `FISCAL_ISSUE_FAILED` (critical) on `status='failed'` transition.
- `notify_drawer_open_no_sale()` — `AFTER INSERT ON public.cash_drawer_logs`, `DRAWER_OPEN_NO_SALE` (warning) when `action='open' AND transaction_id IS NULL`.

All `SECURITY DEFINER SET search_path = public, pg_temp`, `RETURN NULL`, emit via `app.emit_notification`.

⚠️ **DRAWER_DISCREPANCY is intentionally NOT wired** (no server variance column) and **DRAWER_OPEN_NO_SALE will rarely fire today** — the real till writes drawer audit to Dexie only (`cashDrawerAuditService`), not to server `cash_drawer_logs`. Open issue — do not ship a stub.

### Step 3 — Feed hardening + read-state + Realtime publication + policy CI assertion

`20260721002000_notif_read_state.sql` — per-user unread watermark (`delivered_at` is a single global stamp, unusable for multi-manager read state):
```sql
CREATE TABLE IF NOT EXISTS public.notification_read_state (
  user_id uuid NOT NULL, tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  last_read_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id));
ALTER TABLE public.notification_read_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_read_state_isolation ON public.notification_read_state
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND tenant_id = app.tenant_id())
  WITH CHECK (user_id = auth.uid() AND tenant_id = app.tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_read_state TO authenticated;
REVOKE ALL ON public.notification_read_state FROM anon;
```

`20260721003000_notif_append_only_hardening.sql` — phase-1 `GRANT ALL` still lets a manager JWT forge/mutate `notification_events` for their own tenant. Enforce append-only by **grant revocation** (NOT a BEFORE-UPDATE trigger — that would also block the P3b service-role `delivered_at` stamp) + a load-bearing-policy CI assertion:
```sql
REVOKE INSERT, UPDATE, DELETE ON public.notification_events FROM authenticated; -- keep SELECT for the feed
-- Load-bearing policy assertion (defense-in-depth #5): fail the migration if the cross-tenant boundary is gone.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relname='notification_events' AND c.relrowsecurity) THEN
    RAISE EXCEPTION 'RLS not enabled on notification_events'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='notification_events' AND policyname='notification_events_tenant_isolation') THEN
    RAISE EXCEPTION 'notification_events_tenant_isolation policy missing'; END IF;
END $$;
```
Producers (DEFINER/owner) and the delivery fn (service_role) bypass grants, so they still write.

`20260721004000_notif_realtime_publication.sql` — the ONE required DB change to make the feed live (RLS already ON, SELECT already granted, tenant policy exists). INSERT-only feed ⇒ no `REPLICA IDENTITY` change:
```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notification_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_events;
  END IF;
END $$;
```
Verify: `select * from pg_publication_tables where pubname='supabase_realtime'`.

### Step 4 — `setAuth` lifecycle in the auth context (`src/contexts/SupabaseAuthContext.tsx`)

All `isPwaHost`-gated (setAuth is realtime-only — safe inside the callback; it does NOT hit the PostgREST auth lock). Handlers already present: SIGNED_IN membership branch (~405), TOKEN_REFRESHED (~449, session present), SIGNED_OUT (~439), `initializeAuth`/`getSession` restore (~485).
- SIGNED_IN (membership) + TOKEN_REFRESHED with a session → `void supabase.realtime.setAuth(session.access_token)` — refreshes the LIVE channel's token in place so the private channel survives token refresh WITHOUT re-subscribe.
- SIGNED_OUT → `void supabase.realtime.setAuth(); supabase.removeAllChannels();`
- **Reload path:** the `initializeAuth` membership-restore branch (INITIAL_SESSION has no handler) → also `void supabase.realtime.setAuth(session.access_token)`.
- **NEW — wake/recovery re-auth:** add window `'online'` + `document 'visibilitychange'→visible` listeners that, when a membership session exists, `await supabase.auth.getSession()` and `setAuth(fresh.access_token)` so a woken tab re-authenticates the socket with a NON-stale token (the throttled autoRefresh may not have run yet at 1h expiry).

### Step 5 — Feed provider + bell + panel (PWA-host only)

New `src/lib/notificationTypes.ts`: the `event_type` union (13 current types; extended to 15 in P3c), `severity` map, per-type icon + `t()` title keys.

New `src/contexts/NotificationFeedContext.tsx` (mount ONCE high in the tree so bell + panel share ONE channel): `useNotificationFeed` keyed on **`tenantId` only** (never `access_token` — that would tear the channel every hour):
```ts
const tenantId = principal?.source === 'membership' ? principal.tenantId : null;
const tokenRef = useRef(session?.access_token); tokenRef.current = session?.access_token;
useEffect(() => {
  if (!isPwaHost || !tenantId) return;
  let channel: RealtimeChannel | null = null, cancelled = false, wasErrored = false;

  const backfill = async () => {                                   // reused on first join AND on reconnect
    const { data } = await supabase.from('notification_events')
      .select('*').order('created_at',{ascending:false}).limit(50);
    if (!cancelled && data) setEvents(prev => dedupeById([...data, ...prev]).slice(0,200));
  };
  const freshToken = async () => {                                 // force-refresh so setAuth is never a no-op on a dead token
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? tokenRef.current;
  };

  (async () => {
    await supabase.realtime.setAuth(await freshToken());           // (1) MANDATORY: user-scope the socket (covers reload)
    channel = supabase.channel(`notif:${tenantId}`)                // (2) subscribe BEFORE backfill
      .on('postgres_changes',
        { event:'INSERT', schema:'public', table:'notification_events', filter:`tenant_id=eq.${tenantId}` },
        (p) => { if (!cancelled) { const r = p.new as NotificationEvent;
                 setEvents(prev => prev.some(e=>e.id===r.id) ? prev : [r, ...prev].slice(0,200)); } })
      .subscribe(async (s) => {
        if (s==='CHANNEL_ERROR' || s==='TIMED_OUT' || s==='CLOSED') {
          wasErrored = true; await supabase.realtime.setAuth(await freshToken());   // re-auth with a FRESH token
        } else if (s==='SUBSCRIBED' && wasErrored) {
          wasErrored = false; await backfill();                    // (4) NEW: re-backfill the outage gap (Realtime never replays WAL)
        }
      });
    await backfill();                                              // (3) RLS-scoped REST backfill, merge by id
  })();
  return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
}, [tenantId]);
```
`filter:tenant_id=eq.<uuid>` is a WAL optimization; **RLS is the real guard** (checklist #5). Do NOT set `config:{private:true}` (needs `realtime.messages` policies you don't have) and do NOT add broadcast/presence to this channel (unfiltered by RLS). On switch-tenant, `tenantId` changes → old channel removed, new created; the TOKEN_REFRESHED/switch setAuth re-scopes the socket.

Unread: `unread = events.filter(e => e.created_at > last_read_at).length` from `notification_read_state`; "Mark all read" upserts `{user_id, tenant_id, last_read_at: now()}`.

New `src/components/notifications/NotificationBell.tsx` + `NotificationPanel.tsx`: bell shows unread badge (cap `9+`); panel reuses Header's dropdown+backdrop pattern (Header.tsx:130-145,184-189), severity-styled rows (critical=red / warning=amber / info=gray), icon + `t()` title + relative time + optional deep-link via `entity_table`/`entity_id`.

Wire into `src/components/Layout/Header.tsx`: replace the static bell (lines 104-109) with `{isPwaHost && <NotificationBell />}`; drop/revisit `hidden md:block` so mobile PWA managers keep it. Mount `<NotificationFeedProvider>` PWA-host-gated in the layout that renders Header (the Electron till never subscribes).

### Step 6 — Notifications Settings section (`src/pages/Settings.tsx`)

Add an "Alerts / Notifications" section reading/writing `tenant_settings.data.alerts` via `supabase.from('tenant_settings').update({ data }).eq('tenant_id', tenantId)` (RLS `tenant_id = app.tenant_id()` scopes it). Convention:
```json
{"alerts":{
  "large_discount":{"enabled":true,"amount":50,"percentage":30},
  "offline":{"enabled":true,"grace_seconds":300}}}
```
`offline` is consumed in P3c.

### Step 7 — Verify P3a
`supabase db push`; issue a refund / fiscal-cancel from the till → row appears in the bell live; a second manager on the same tenant sees it; a second tenant's session sees nothing. Confirm "feed empty but REST backfill non-empty" does NOT occur (missing-setAuth signature). **NEW checks:** (a) kill the socket (offline > few s, back online) → the outage-gap event appears after the SUBSCRIBED re-backfill, not only after a reload; (b) leave the tab backgrounded past 1h then wake → feed resumes (visibilitychange re-auth), not a dead channel.

---

## Phase P3b — Background Web Push (VAPID + push_subscriptions + SW + delivery + opt-in)

**Goal:** installed PWA buzzes on CRITICAL events (`FISCAL_CANCELLATION`, `FISCAL_ISSUE_FAILED`) when the app is closed. Greenfield.

### Step 1 — VAPID keys (provisioning, outside migrations)
One P-256 keypair (`npx web-push generate-vapid-keys`). Public → **`VITE_VAPID_PUBLIC_KEY`** (Vercel build env). Private → Supabase edge secret **`VAPID_PRIVATE_KEY`** + **`VAPID_SUBJECT`** (`mailto:…`). Private key NEVER ships to the browser.

### Step 2 — `push_subscriptions` (`20260722000000_push_subscriptions.sql`) — COMPOSITE uniqueness
```sql
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  endpoint text NOT NULL, p256dh text NOT NULL, auth text NOT NULL,
  user_agent text, created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, endpoint));            -- one row per (human, tenant, device); NOT global-unique endpoint
CREATE INDEX IF NOT EXISTS idx_push_sub_tenant   ON public.push_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_push_sub_user     ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_sub_endpoint ON public.push_subscriptions(endpoint);   -- for per-pass dedupe + 410 pruning
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_subscriptions_isolation ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND tenant_id = app.tenant_id())
  WITH CHECK (user_id = auth.uid() AND tenant_id = app.tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
REVOKE ALL ON public.push_subscriptions FROM anon;
```
Composite key lets a multi-tenant human hold one row per tenant on one device (all sharing the physical endpoint) — no racy re-key on switch. service_role (delivery fn) bypasses RLS to read a tenant's subscriptions.

### Step 3 — SW handlers (`public/sw.js`) — ZERO caching; visibility-aware to avoid double-notify
```js
self.addEventListener('push', (event) => {
  let p = {}; try { p = event.data ? event.data.json() : {}; } catch (_) {}
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    const focused = wins.find(c => c.focused || c.visibilityState === 'visible');
    if (focused) {                                   // app open+focused: let the in-app bell own it
      focused.postMessage({ type:'notif', event: p });
      // userVisibleOnly forbids showing nothing → show a minimal, non-intrusive notice
      return self.registration.showNotification(p.title || 'Alert',
        { body: p.body || '', icon:'/icons/icon-192.png', badge:'/icons/badge-72.png',
          tag: p.event_id, renotify:false, silent:true,
          data:{ url: p.url || `/alerts?event=${p.event_id}`, event_id:p.event_id, tenant_id:p.tenant_id } });
    }
    return self.registration.showNotification(p.title || 'Alert',  // app closed/background: full escalation
      { body: p.body || '', icon:'/icons/icon-192.png', badge:'/icons/badge-72.png',
        tag: p.event_id, renotify:true, requireInteraction: p.severity === 'critical',
        data:{ url: p.url || `/alerts?event=${p.event_id}`, event_id:p.event_id, tenant_id:p.tenant_id } });
  })());
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/alerts';
  event.waitUntil(clients.matchAll({ type:'window', includeUncontrolled:true }).then((ws) => {
    const w = ws.find(c => c.url.startsWith(self.location.origin));
    return w ? w.focus().then(() => ('navigate' in w ? w.navigate(url) : null)) : clients.openWindow(url); }));
});
self.addEventListener('pushsubscriptionchange', (event) => {
  // Best-effort: re-subscribe with the SAME applicationServerKey and cache the new endpoint in IndexedDB.
  // The SW has NO Supabase session, so it CANNOT write push_subscriptions (RLS = authenticated). App-open reconciles.
  event.waitUntil((async () => {
    try {
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly:true,
        applicationServerKey: (await readCachedAppServerKey()) });
      await cacheEndpoint(sub.toJSON());              // IndexedDB; reconciled on next SIGNED_IN/app-open
    } catch (_) {}
  })());
});
```

### Step 4 — Client opt-in + feature-detect + reconciliation + Disable toggle (`src/lib/push.ts`)
`isPwaHost` + membership only. Feature-detect FIRST; distinguish `denied` vs `default`; rotate the browser subscription when the cached owner differs (shared-device):
```ts
if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
if (isIos() && !isStandalone()) return 'needs-install';           // iOS: only when installed + 16.4+
if (Notification.permission === 'denied') return 'blocked';       // cannot re-prompt; UI shows manual re-enable steps
if (Notification.permission !== 'granted' && await Notification.requestPermission() !== 'granted') return 'denied';
const reg = await navigator.serviceWorker.ready;
let sub = await reg.pushManager.getSubscription();
const cachedOwner = await idbGet('push_owner');                   // {user_id} — SW/client readable, NOT RLS-bound
if (sub && cachedOwner && cachedOwner.user_id !== session.user.id) { await sub.unsubscribe(); sub = null; }  // re-own device
if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly:true,
  applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY) });
const { endpoint, keys } = sub.toJSON();
await supabase.from('push_subscriptions').upsert(
  { endpoint, p256dh: keys.p256dh, auth: keys.auth, tenant_id: activeTenantId, user_id: session.user.id, user_agent: navigator.userAgent },
  { onConflict: 'user_id,tenant_id,endpoint' });                  // composite; RLS WITH CHECK re-verifies tenant/user
await idbSet('push_owner', { user_id: session.user.id });
```
Also export `disableAlerts()` = `getSubscription()?.unsubscribe()` + `DELETE push_subscriptions WHERE user_id=self AND tenant_id=active AND endpoint=…`. Surface an **"Enable alerts" / "Disable alerts" toggle** in Settings that reflects live `Notification.permission` + subscription state (`unsupported`/`needs-install`/`blocked`/`default`/`granted`). `requestPermission()` MUST be inside a user gesture.

Wire lifecycle in `src/contexts/SupabaseAuthContext.tsx`: **reconcile on SIGNED_IN / app-open** — read `reg.pushManager.getSubscription()` and re-upsert if its endpoint differs from what's stored (repairs a `pushsubscriptionchange` that rotated while closed); **on switch-tenant** upsert a row for the newly-active tenant (composite key keeps prior-tenant rows if still a member); on SIGNED_OUT `unsubscribe()` + delete this user's rows for the active tenant.

### Step 5 — Delivery edge fn (`supabase/functions/notify-push/index.ts`) — membership join + endpoint dedupe
Service-role client, `verify_jwt=false` + shared-secret header. Input `{event_id}` (trigger) or `{sweep:true}`. For each target CRITICAL row still `delivered_at IS NULL`:
```sql
SELECT ps.endpoint, ps.p256dh, ps.auth
  FROM push_subscriptions ps
  JOIN tenant_members tm ON tm.user_id = ps.user_id AND tm.tenant_id = <row.tenant_id>  -- LIVE revocation guard
 WHERE ps.tenant_id = <row.tenant_id>;
```
Dedupe the result set by physical `endpoint`; send via `jsr:@negrel/webpush` (`ApplicationServer.subscribe(...).pushTextMessage(...)`); DELETE endpoints returning 404/410; then `UPDATE notification_events SET delivered_at=now() WHERE id=… AND delivered_at IS NULL`. Idempotent via the `delivered_at` gate + `idx_notif_undelivered`. Register `[functions.notify-push] verify_jwt=false` in `supabase/config.toml`. **The membership join means a stale subscription from a removed member is never delivered to — the primary off-device revocation guard.**

### Step 6 — Delivery trigger + backstop (`20260722001000_push_delivery_dispatch.sql`) — EXCEPTION-ISOLATED
```sql
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_net')  THEN RAISE EXCEPTION 'pg_net required';  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN RAISE EXCEPTION 'pg_cron required'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.notify_push_dispatch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v_url text; v_secret text;
BEGIN
  -- This trigger fires INSIDE the producing transaction (fiscal cancel / tx sync). It MUST NOT
  -- raise, or it rolls back the till's fiscal write. Guard the Vault reads + swallow all errors.
  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name='notify_push_fn_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='notify_push_shared_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN RETURN NULL; END IF;         -- misconfig: skip, never abort producer
  BEGIN
    PERFORM net.http_post(url := v_url,
      headers := jsonb_build_object('Content-Type','application/json','x-webhook-secret', v_secret),
      body := jsonb_build_object('event_id', NEW.id));
  EXCEPTION WHEN OTHERS THEN NULL;                                       -- best-effort; cron backstop is the safety net
  END;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_notify_push_dispatch
  AFTER INSERT ON public.notification_events
  FOR EACH ROW WHEN (NEW.severity='critical' AND NEW.delivered_at IS NULL)
  EXECUTE FUNCTION public.notify_push_dispatch();

-- Backstop: pg_net is fire-and-forget; the cron sweep + delivered_at gate is the REQUIRED safety net.
SELECT cron.schedule('notif-push-backstop', '* * * * *', $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='notify_push_fn_url'),
    headers := jsonb_build_object('Content-Type','application/json',
               'x-webhook-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='notify_push_shared_secret')),
    body := jsonb_build_object('sweep', true))
  WHERE EXISTS (SELECT 1 FROM public.notification_events
                WHERE severity='critical' AND delivered_at IS NULL AND created_at < now() - interval '60 seconds'); $$);
```
Store `notify_push_fn_url` + `notify_push_shared_secret` in Supabase Vault (manual seed). Append-only was enforced by grant-revocation (not a trigger), so the service-role `delivered_at` UPDATE is unobstructed.

### Step 7 — Verify P3b
Opt in on an installed PWA; issue a fiscal cancellation → device buzzes with app closed; click focuses/opens `/alerts?event=…`; a 410 endpoint is pruned; `delivered_at` stamped; re-sync of the same event does not double-push (tag + `delivered_at`). **NEW checks:** (a) with the app FOCUSED, the same event shows the in-app bell + a silent/non-requireInteraction notice, not a full buzzing OS alert; (b) temporarily NULL the Vault URL and issue a fiscal cancellation → the fiscal write still COMMITS (dispatch swallowed), the cron backstop delivers within ~60s; (c) on an unsupported browser, opt-in returns `unsupported` and the UI degrades (no throw); (d) Disable-alerts unsubscribes + deletes the row and the device stops buzzing.

---

## Phase P3c — Till heartbeat + offline sweep + DEVICE_OFFLINE/ONLINE

**Goal:** detect an offline till. The two NEW event types land here (co-located with their only consumer). Depends on P3a helpers.

### Step 1 — Enum + presence column (`20260723000000_device_presence_enum_and_column.sql`)
```sql
ALTER TABLE public.notification_events DROP CONSTRAINT IF EXISTS notification_events_event_type_check;
ALTER TABLE public.notification_events ADD CONSTRAINT notification_events_event_type_check
  CHECK (event_type IN (
    'CREDIT_NOTE_ISSUED','REFUND_ISSUED','FISCAL_CANCELLATION','LARGE_DISCOUNT',
    'DRAWER_DISCREPANCY','DRAWER_OPEN_NO_SALE','PRICE_OVERRIDE','DEVICE_ENROLLED',
    'DEVICE_REVOKED','PAIRING_FAILED','SAFT_GENERATED','FISCAL_ISSUE_FAILED',
    'TRAINING_MODE_CHANGED','DEVICE_OFFLINE','DEVICE_ONLINE'));   -- validates instantly (existing rows a subset)

ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS presence text NOT NULL DEFAULT 'unknown'
  CHECK (presence IN ('online','offline','unknown'));
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS presence_changed_at timestamptz;
```
Mirror the two new types in `src/lib/notificationTypes.ts` (DEVICE_OFFLINE=warning, DEVICE_ONLINE=info) in lockstep.

### Step 2 — Heartbeat RPC (`20260723001000_device_heartbeat_rpc.sql`)
`device_heartbeat()` DEFINER, self-scoped + device-role gated: `IF app.app_role() IS DISTINCT FROM 'device' OR tenant/device NULL THEN RETURN`; `SELECT presence … WHERE id=app.device_id() AND tenant_id=app.tenant_id() AND status='enrolled' FOR UPDATE`; `UPDATE … SET last_seen_at=now(), presence='online', presence_changed_at = CASE WHEN presence<>'online' THEN now() ELSE presence_changed_at END`; emit `DEVICE_ONLINE` (info) ONLY when prior `presence='offline'` (recovery emitted HERE, not by a trigger). `GRANT EXECUTE … TO authenticated` (device is authenticated; keep OFF anon). Do NOT overload `ping()` (anon/shared, fires from the PWA connectionStatus singleton). First-boot `unknown→online` flips silently.

### Step 3 — Offline sweep + pg_cron (`20260723002000_device_presence_sweep.sql`)
`sweep_device_presence()` DEFINER: per enrolled device read `alerts.offline{enabled,grace_seconds}` via `app.tenant_setting`; `CONTINUE WHEN NOT enabled`; when `presence IN ('online','unknown') AND last_seen_at < now() - make_interval(secs=>grace)` → `UPDATE devices SET presence='offline', presence_changed_at=now()` (de-dup via presence col) + emit `DEVICE_OFFLINE` (warning). `cron.schedule('device-presence-sweep','* * * * *', …)`. `DEVICE_OFFLINE` is EXCLUDED from `uq_notif_once` (recurs per outage). Worst-case detection latency ≈ grace + 60s.

### Step 4 — Till client heartbeat (Electron only)
New `src/services/deviceHeartbeat.ts`: ~60s interval calling `supabase.rpc('device_heartbeat')` + a fire on `window 'online'`. Gate strictly on `isTillHost && session.app_role==='device'`. SEPARATE from the 5s `ping()` connectivity interval (≈1.4k writes/device/day). Cadence MUST be well below the smallest `grace_seconds` (60s ≪ 300s default); token refresh must not trip a false OFFLINE.

### Step 5 — PWA surfaces
`src/pages/Devices.tsx:378`: render an online/offline/unknown pill from `devices.presence` (now meaningful). Extend `notificationTypes` maps for the two new types. Add `offline.grace_seconds` to the Settings Alerts section.

### Step 6 — Verify P3c
Enroll a till; `last_seen_at` stays fresh; kill it > grace → single `DEVICE_OFFLINE` (warning) in feed/push; restart → single `DEVICE_ONLINE` (info); a flapping/first-boot device emits no spurious ONLINE.

---

## Phase P3d — Revocation + de-provision hardening (REQUIRED before GA)

**Goal:** a demoted/removed manager stops receiving tenant-A Realtime, REST backfill, AND Web Push promptly — not after a ≤1h stale-token window. This closes a pre-existing revocation hole (no human de-provision flow exists) that Web Push newly turns into an OFF-DEVICE background leak. **Not silently deferred — tracked here + in open issues.**

### Step 1 — `revoke-human` edge fn (`supabase/functions/revoke-human/index.ts`, `verify_jwt=true`, admin/owner only)
On removing a `(user_id, tenant_id)` membership, service-role client:
1. `DELETE FROM tenant_members WHERE user_id=… AND tenant_id=…`.
2. `DELETE FROM push_subscriptions WHERE user_id=… AND tenant_id=…` (stop the off-device push immediately, independent of the delivery-side join).
3. If the removed tenant is the user's ACTIVE `app_metadata.tenant_id`: re-stamp `app_metadata` to another remaining membership (mirroring `switch-tenant`'s `admin.auth.admin.updateUserById(user.id,{app_metadata})`), or clear tenant claims if none remain.
4. `admin.auth.admin.signOut(user.id, 'global')` (revoke refresh tokens) so the stale access token cannot ride out its hour — forces re-auth against the now-updated membership.
Register `[functions.revoke-human] verify_jwt=true` in `config.toml`. Wire it wherever the management UI removes a member (companion to `provision-human`, which only CREATES members today).

### Step 2 — Custom Access Token Hook (durable defense-in-depth)
Add a `custom_access_token` pg-function hook (`supabase/migrations/20260724000000_custom_access_token_hook.sql` + enable `[auth.hook.custom_access_token]` in `config.toml`, currently commented out) that re-reads `tenant_members` on every token issue: if the stored `app_metadata.tenant_id` is no longer a membership, drop/replace the tenant claims in the emitted JWT. This bounds the feed/REST leak to ≤ `jwt_expiry (3600s)` WITHOUT relying on an explicit de-provision call — a deleted membership drops `app.tenant_id()` at the next refresh automatically. Ship alongside Step 1 (Step 1 forces the refresh immediately; the hook makes correctness the default even if a de-provision path is missed).

### Step 3 — Verify P3d
Provision manager M on tenant A on device D (opt in to push); confirm bell + push work. Remove M's tenant-A membership via `revoke-human`: M's session is signed out; on re-login M has no tenant-A access; M's `push_subscriptions` row for A is gone; issue a tenant-A `FISCAL_CANCELLATION` → M's bell is silent AND device D does NOT buzz (delivery-side membership join is the backstop even before the row delete lands). Separately, with ONLY the token hook (no explicit revoke), delete a membership directly and confirm `app.tenant_id()` drops at the next auto-refresh (≤1h).

---

## Deployment order
`supabase db push` applies P3a (`20260721*`) → P3b (`20260722*`) → P3c (`20260723*`) → P3d (`20260724*`) by timestamp. Provision VAPID + Vault secrets before P3b's cron activates; deploy `notify-push` and `revoke-human` edge fns and register them in `config.toml`.
