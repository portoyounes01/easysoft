-- =====================================================================
-- app.* CLAIM HELPERS — isolate the JWT claim source for RLS + RPCs.
-- Additive and inert today: nothing calls these until Phase 2 (auth) and
-- Phase 3 (tenant-scoped RLS). Under the current anon sessions there is no
-- app_metadata, so every helper returns NULL — which is exactly what a
-- tenant-scoped policy will treat as "no tenant" once RLS lands.
--
-- Claims live in the JWT's app_metadata (server-controlled; users cannot edit
-- it), per plan §6.1. Keeping the claim source behind these helpers means the
-- later swap to a Custom Access Token Hook (§6.5) touches no policy.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS app;
GRANT USAGE ON SCHEMA app TO anon, authenticated;

-- Raw app_metadata object from the caller's JWT (empty object if unauthenticated).
CREATE OR REPLACE FUNCTION app.jwt_app_metadata()
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata', '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION app.tenant_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(app.jwt_app_metadata() ->> 'tenant_id', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.store_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(app.jwt_app_metadata() ->> 'store_id', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.device_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(app.jwt_app_metadata() ->> 'device_id', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.app_role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT app.jwt_app_metadata() ->> 'app_role';
$$;

-- Managers may carry a store_ids array; empty array when absent.
CREATE OR REPLACE FUNCTION app.store_ids()
RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(app.jwt_app_metadata() -> 'store_ids')::uuid),
    '{}'::uuid[]
  );
$$;

GRANT EXECUTE ON FUNCTION
  app.jwt_app_metadata(), app.tenant_id(), app.store_id(),
  app.device_id(), app.app_role(), app.store_ids()
TO anon, authenticated;
