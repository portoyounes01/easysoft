-- =====================================================================
-- Notifications P3a — notification_events is APPEND-ONLY to clients.
-- Phase-1 GRANT ALL still lets a manager JWT forge/mutate notification_events for their
-- own tenant. Revoke writes (keep SELECT for the feed). Producers (DEFINER/owner) + the
-- P3b delivery fn (service_role) bypass grants, so they still INSERT/UPDATE delivered_at.
-- A BEFORE-trigger is deliberately NOT used (it would also block the service-role stamp).
-- NO explicit BEGIN/COMMIT.
-- =====================================================================
REVOKE INSERT, UPDATE, DELETE ON public.notification_events FROM authenticated;

-- Load-bearing-policy assertion (isolation checklist #5): fail the migration if the
-- cross-tenant boundary is ever removed.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relname = 'notification_events' AND c.relrowsecurity) THEN
    RAISE EXCEPTION 'RLS not enabled on notification_events';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'notification_events' AND policyname = 'notification_events_tenant_isolation') THEN
    RAISE EXCEPTION 'notification_events_tenant_isolation policy missing';
  END IF;
END $$;
