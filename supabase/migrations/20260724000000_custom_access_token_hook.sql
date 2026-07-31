-- =====================================================================
-- Notifications P3d — Custom Access Token Hook (docs/pwa-notifications-plan.md P3d Step 2)
--
-- Durable defense-in-depth for membership revocation: on EVERY token issue, re-read
-- tenant_members and, if the JWT's active app_metadata.tenant_id is no longer a membership,
-- STRIP the tenant claims from the emitted token. So a deleted membership drops app.tenant_id()
-- at the next refresh automatically (≤ jwt_expiry = 3600s) — even if no explicit revoke-human
-- call ran. GoTrue calls this as role supabase_auth_admin; the fn is SECURITY DEFINER (owned by
-- postgres) so it bypasses tenant_members RLS — a plain read as supabase_auth_admin would match
-- NO policy and see zero rows, wrongly stripping EVERY user's claims.
--
-- MUST NOT raise: token issuance depends on it. It only acts when a tenant claim is present.
-- Enable in config.toml: [auth.hook.custom_access_token] uri = pg-functions://postgres/public/custom_access_token
-- NO explicit BEGIN/COMMIT.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.custom_access_token(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  claims   jsonb := COALESCE(event->'claims', '{}'::jsonb);
  meta     jsonb := COALESCE(event->'claims'->'app_metadata', '{}'::jsonb);
  v_user   uuid  := NULLIF(event->>'user_id', '')::uuid;
  v_tenant uuid  := NULLIF(meta->>'tenant_id', '')::uuid;
  v_role   text  := meta->>'app_role';
BEGIN
  -- CRITICAL: devices carry app_metadata.tenant_id too but are NOT in tenant_members (that table
  -- is humans-only). Their claims come from the devices table + pairing, so NEVER strip a device
  -- session — doing so would brick every till's RLS/RPCs. Only human (membership) claims are validated.
  IF v_user IS NULL OR v_tenant IS NULL OR v_role IS NULL OR v_role = 'device' THEN
    RETURN event; -- device/anon/unclaimed — pass through untouched
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_members WHERE user_id = v_user AND tenant_id = v_tenant) THEN
    -- membership revoked: drop stale tenant claims so app.tenant_id() is NULL at next refresh
    meta   := meta - 'tenant_id' - 'app_role' - 'store_ids' - 'store_id';
    claims := jsonb_set(claims, '{app_metadata}', meta);
    event  := jsonb_set(event, '{claims}', claims);
  END IF;
  RETURN event;
END $$;

-- GoTrue invokes hooks as supabase_auth_admin; grant it execute + schema usage, deny everyone else.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token(jsonb) FROM PUBLIC, anon, authenticated;
