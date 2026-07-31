-- =====================================================================
-- Notifications P3a — shared producer helpers + de-dup + default config.
-- (docs/pwa-notifications-plan.md P3a Step 1)
--
-- app.tenant_setting / app.emit_notification are SECURITY DEFINER cross-tenant
-- primitives (read any tenant's settings / forge a notification for any tenant).
-- They are safe ONLY because (1) the `app` schema is NOT PostgREST-exposed
-- (config.toml schemas = public, graphql_public) and (2) EXECUTE is explicitly
-- revoked below. Never expose `app` and never add a public-schema wrapper that
-- calls these. Pinned search_path closes the DEFINER injection vector.
--
-- NO explicit BEGIN/COMMIT (db push wraps each migration in one transaction).
-- =====================================================================

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

-- Postgres grants EXECUTE to PUBLIC by default on CREATE FUNCTION — strip it from these
-- DEFINER cross-tenant primitives (defense-in-depth; schema-non-exposure is the other guard).
REVOKE EXECUTE ON FUNCTION app.tenant_setting(uuid, text[], jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app.emit_notification(uuid, uuid, uuid, text, text, uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- At-most-once for entity-keyed events. EXCLUDES DRAWER_OPEN_NO_SALE (unique by its own
-- append-only entity_id) and the recurring device presence events (added in P3c).
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_once
  ON public.notification_events (tenant_id, event_type, entity_id)
  WHERE entity_id IS NOT NULL
    AND event_type IN ('REFUND_ISSUED','FISCAL_CANCELLATION','FISCAL_ISSUE_FAILED','LARGE_DISCOUNT');

-- Seed the default tenant's alerts config (idempotent; never clobbers an existing 'alerts').
UPDATE public.tenant_settings
   SET data = jsonb_set(data, '{alerts}',
       '{"large_discount":{"enabled":true,"amount":50,"percentage":30},"offline":{"enabled":true,"grace_seconds":300}}'::jsonb)
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND NOT (data ? 'alerts');
