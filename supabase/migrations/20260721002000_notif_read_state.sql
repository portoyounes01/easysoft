-- =====================================================================
-- Notifications P3a — per-user unread watermark (docs/pwa-notifications-plan.md P3a Step 3).
-- notification_events.delivered_at is a single global stamp, unusable for multi-manager
-- read state. This is one row per (user, tenant): everything after last_read_at is unread.
-- NO explicit BEGIN/COMMIT.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.notification_read_state (
  user_id      uuid NOT NULL,
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);
ALTER TABLE public.notification_read_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_read_state_isolation ON public.notification_read_state;
CREATE POLICY notification_read_state_isolation ON public.notification_read_state
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()) AND tenant_id = app.tenant_id())
  WITH CHECK (user_id = (select auth.uid()) AND tenant_id = app.tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_read_state TO authenticated;
REVOKE ALL ON public.notification_read_state FROM anon;
