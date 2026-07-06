-- =====================================================================
-- PWA P1 — human identity foundation (docs/pwa-p1-auth-design.md)
--
-- Decisions (user, 2026-07-06): admin-set password (no email/SMTP); ENFORCE
-- store-scope; MULTI-TENANT humans (a person can belong to several tenants and
-- switch). Username login is global-unique.
--
-- `tenant_members` (20260706, PK (user_id, tenant_id) + role + store_ids uuid[])
-- already supports multi-tenant + store-scope — no change needed there except an
-- extra self-read policy (below). This migration only adds username storage and the
-- membership self-read. Claim minting (active tenant -> app_metadata) is done by the
-- pwa-login / switch-tenant edge fns (service role), NOT a dashboard token hook.
--
-- NO explicit BEGIN/COMMIT (db push wraps each migration in one transaction).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS citext;

-- Username -> user mapping for username-OR-email login. Resolved ONLY inside the
-- pwa-login edge fn (service_role); never client-readable, so it can't be used as a
-- username/email enumeration oracle (docs/pwa-plan.md §3.2b). Username is per-USER
-- (one identity across all their tenant memberships), global-unique, case-insensitive.
CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     citext UNIQUE,          -- NULL allowed (email-only accounts)
  display_name text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
-- Zero client access: RLS on, no policy, grants to service_role only.
REVOKE ALL ON public.user_profiles FROM anon, authenticated;
GRANT ALL ON public.user_profiles TO service_role;

-- A human self-reads their OWN memberships across ALL tenants, to render the tenant
-- switcher and (pre-selection) before any active tenant claim exists. The Phase-3
-- tenant_members_tenant_isolation policy (tenant_id = app.tenant_id()) only exposes the
-- ACTIVE tenant's rows, so it cannot populate a multi-tenant switcher. RLS policies are
-- permissive (OR'd), so this adds own-membership visibility without widening anything else.
DROP POLICY IF EXISTS tenant_members_self_read ON public.tenant_members;
CREATE POLICY tenant_members_self_read ON public.tenant_members
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
