-- =====================================================================
-- Notifications P3b — Web Push subscriptions (docs/pwa-notifications-plan.md P3b Step 2)
--
-- COMPOSITE uniqueness (user_id, tenant_id, endpoint): a multi-tenant human holds ONE row
-- per tenant on the same physical device (all sharing the browser's push endpoint) — no racy
-- re-key when switching tenant. NOT UNIQUE(endpoint): that would let a device hold only one
-- tenant row and break shared-device re-own (the RLS-hidden conflicting row degrades an upsert
-- to a failing INSERT). The delivery fn (service_role) dedupes by physical endpoint per pass.
--
-- NO explicit BEGIN/COMMIT (db push wraps each migration in one transaction).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id),
  endpoint     text NOT NULL,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_sub_tenant   ON public.push_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_push_sub_user     ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_sub_endpoint ON public.push_subscriptions(endpoint); -- per-pass dedupe + 410 pruning

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_isolation ON public.push_subscriptions;
CREATE POLICY push_subscriptions_isolation ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()) AND tenant_id = app.tenant_id())
  WITH CHECK (user_id = (select auth.uid()) AND tenant_id = app.tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
REVOKE ALL ON public.push_subscriptions FROM anon;
-- service_role (delivery fn) bypasses RLS to read a tenant's subscriptions + stamp/prune.
