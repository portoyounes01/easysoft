-- =====================================================================
-- Platform-admin control plane (docs/platform-console-runbook.md)
--
-- "Platform tooling = service role from back-office only (no RLS carve-outs
-- for us)" — docs/multi-tenant-plan.md §6.5. This migration adds the identity
-- and audit surface for that back office; it adds NO RLS policies and NO
-- client grants. All platform actions flow through the platform-admin edge
-- function, which verifies the caller against platform_admins (the SSOT)
-- per-request and then acts with the service role.
--
-- platform_admins      — who may operate the platform console. Service-role
--                        only (RLS on, zero policies — same posture as
--                        user_profiles / tenant_fiscal_secrets).
-- platform_audit_log   — append-only trail of every platform-console action
--                        (a console that can touch every tenant must not be
--                        able to act invisibly).
-- custom_access_token  — extended: also strips a stale app_metadata.
--                        platform_admin claim when the platform_admins row is
--                        gone (same ≤ jwt_expiry staleness bound as tenant
--                        claims). The claim is UI-only (client principal);
--                        the edge function never trusts it.
-- =====================================================================

CREATE TABLE public.platform_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note       text,                                   -- who/why (e.g. "Khalil — founder")
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.platform_admins IS
  'SSOT for platform (sysadmin) console access. Service-role only; checked per-request by the platform-admin edge fn and by the access-token hook.';

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_admins FROM PUBLIC, anon, authenticated;

CREATE TABLE public.platform_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- bare uuid, deliberately NO FK (matches the notification_events append-only
  -- convention): an audit row must never pin an offboarded admin's auth user
  -- against deletion (which would also defeat platform_admins' own CASCADE)
  actor_user_id uuid NOT NULL,
  action        text NOT NULL,                       -- e.g. 'create_tenant', 'revoke_device'
  target        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- ids + salient fields (never secrets/codes)
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_platform_audit_log_created_at ON public.platform_audit_log (created_at DESC);
CREATE INDEX idx_platform_audit_log_actor ON public.platform_audit_log (actor_user_id);

ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_audit_log FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- Access-token hook v2: tenant-claims validation (unchanged) + platform-
-- admin claim validation. Same contract as 20260724000000: MUST NOT raise,
-- SECURITY DEFINER (bypasses RLS — GoTrue calls as supabase_auth_admin),
-- acts only when the relevant claim is present.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_access_token(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  claims    jsonb := COALESCE(event->'claims', '{}'::jsonb);
  meta      jsonb := COALESCE(event->'claims'->'app_metadata', '{}'::jsonb);
  v_user    uuid  := NULLIF(event->>'user_id', '')::uuid;
  v_tenant  uuid;
  v_role    text  := meta->>'app_role';
  v_mrole   text;
  v_mstores uuid[];
  changed   boolean := false;
BEGIN
  -- MUST NOT raise: parse tenant_id defensively in the body (a DECLARE-initializer
  -- cast would abort token issuance on any malformed server-side metadata write).
  v_tenant := CASE
    WHEN meta->>'tenant_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN (meta->>'tenant_id')::uuid
  END;

  -- Platform claim: strip when the platform_admins row is gone, OR when the user
  -- holds ANY tenant membership — platform access and memberships are DISJOINT in
  -- v1 (a member's JWT must never carry the console claim). jsonb equality (no
  -- cast) so a malformed claim value can never raise here.
  IF v_user IS NOT NULL AND meta->'platform_admin' = to_jsonb(true) THEN
    IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = v_user)
       OR EXISTS (SELECT 1 FROM public.tenant_members WHERE user_id = v_user) THEN
      meta := meta - 'platform_admin';
      changed := true;
    END IF;
  END IF;

  -- Tenant claims: devices carry tenant_id but are NOT in tenant_members
  -- (humans-only) — NEVER touch a device session. For humans, the membership ROW is
  -- the SSOT: strip when it is gone (as before), and RE-SYNC app_role/store_ids when
  -- they drifted (role demotions / scope narrowing otherwise never bind — nothing
  -- forces a re-login and GoTrue merge keeps stale claims alive indefinitely).
  IF v_user IS NOT NULL AND v_tenant IS NOT NULL AND v_role IS NOT NULL AND v_role <> 'device' THEN
    SELECT tm.role, tm.store_ids INTO v_mrole, v_mstores
    FROM public.tenant_members tm
    WHERE tm.user_id = v_user AND tm.tenant_id = v_tenant;
    IF v_mrole IS NULL THEN
      -- membership revoked: drop stale tenant claims so app.tenant_id() is NULL
      meta := meta - 'tenant_id' - 'app_role' - 'store_ids' - 'store_id';
      changed := true;
    ELSE
      IF meta->>'app_role' IS DISTINCT FROM v_mrole THEN
        meta := jsonb_set(meta, '{app_role}', to_jsonb(v_mrole));
        changed := true;
      END IF;
      IF v_mstores IS NULL OR cardinality(v_mstores) = 0 THEN
        -- NULL/empty = tenant-wide; an empty array claim would read as
        -- scoped-to-zero-stores in edge-fn scope gates
        IF meta ? 'store_ids' THEN
          meta := meta - 'store_ids';
          changed := true;
        END IF;
      ELSIF meta->'store_ids' IS DISTINCT FROM to_jsonb(v_mstores) THEN
        meta := jsonb_set(meta, '{store_ids}', to_jsonb(v_mstores));
        changed := true;
      END IF;
    END IF;
  END IF;

  IF changed THEN
    claims := jsonb_set(claims, '{app_metadata}', meta);
    event  := jsonb_set(event, '{claims}', claims);
  END IF;
  RETURN event;
END $$;

-- Re-assert the grant posture (idempotent; matches 20260724000000).
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token(jsonb) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- public.platform_delete_tenant(p_tenant) — guarded hard delete of an EMPTY
-- (test/mis-provisioned) tenant. Refuses any tenant that ever produced a
-- transaction or fiscal document: those go through the designed offboarding
-- process (multi-tenant-plan D6), never a delete.
--
-- Deletion is dynamic over every BASE TABLE in public carrying a tenant_id
-- column, multi-pass so child→parent FK ordering resolves itself; anything
-- still undeletable after the passes (e.g. a future FK from a table WITHOUT
-- a tenant_id column) makes the final tenants delete raise — the whole call
-- is one transaction, so a partial teardown can never be left behind.
-- Device auth users are NOT deleted here (auth schema is GoTrue's); the
-- platform-admin edge fn deletes them via the admin API after this commits.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_delete_tenant(p_tenant uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_count   bigint;
  r         record;
  pending   text[];
  next_pending text[];
  t         text;
  progressed boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant) THEN
    RETURN 'no_tenant';
  END IF;

  SELECT count(*) INTO v_count FROM public.transactions WHERE tenant_id = p_tenant;
  IF v_count > 0 THEN RETURN 'tenant_has_transactions'; END IF;
  SELECT count(*) INTO v_count FROM public.fiscal_documents WHERE tenant_id = p_tenant;
  IF v_count > 0 THEN RETURN 'tenant_has_fiscal_documents'; END IF;

  -- transactions / transaction_items / fiscal_documents are EXCLUDED from the sweep
  -- on purpose: the count guards above are only a fast-path refusal (READ COMMITTED —
  -- a sale committed between the guard and the sweep would otherwise be swept too).
  -- Excluded, any late-arriving fiscal row makes the final tenants delete raise
  -- foreign_key_violation, rolling back the whole call — loud refusal, no data loss.
  SELECT array_agg(c.table_name::text) INTO pending
  FROM information_schema.columns c
  JOIN information_schema.tables tb
    ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
  WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
    AND tb.table_type = 'BASE TABLE'
    AND c.table_name NOT IN ('tenants', 'transactions', 'transaction_items', 'fiscal_documents');

  -- multi-pass: rows blocked by an FK to a sibling succeed on a later pass
  FOR i IN 1..6 LOOP
    EXIT WHEN pending IS NULL OR array_length(pending, 1) IS NULL;
    next_pending := ARRAY[]::text[];
    progressed := false;
    FOREACH t IN ARRAY pending LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1', t) USING p_tenant;
        progressed := true;
      EXCEPTION WHEN foreign_key_violation THEN
        next_pending := next_pending || t;
      END;
    END LOOP;
    pending := next_pending;
    EXIT WHEN NOT progressed; -- no forward progress: let the final delete raise loudly
  END LOOP;

  DELETE FROM public.tenants WHERE id = p_tenant; -- raises if anything still references it
  RETURN 'deleted';
END $$;

-- Same grant posture as public.revoke_tenant_member (20260725000000): PostgREST
-- rpc() only reaches the public schema, and the platform-admin edge fn (service
-- role) is the only caller.
REVOKE EXECUTE ON FUNCTION public.platform_delete_tenant(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_delete_tenant(uuid) TO service_role;
