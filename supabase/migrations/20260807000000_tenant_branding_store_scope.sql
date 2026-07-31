-- Receipt logo: tenant default + optional per-store override.
--
-- The first cut published one logo to every till in the tenant. That is wrong
-- for the same reason a single shared catalogue was wrong (migration
-- 20260805000000): a tenant is a company, and two of its stores can trade
-- differently. A location with its own name or branding needs its own logo.
--
-- But pure store-scoping would be wrong too — it re-creates, at store
-- granularity, exactly the annoyance we just removed at till granularity: a
-- five-store chain with one brand would set the same image five times.
--
-- So: a row with store_id IS NULL is the TENANT DEFAULT, and a row with a
-- store_id OVERRIDES it for that store. A till resolves the most specific row
-- that applies to it. Same shape as store_products over the tenant catalogue.

BEGIN;

ALTER TABLE public.tenant_branding
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;

-- tenant_id alone was the primary key; scope now needs (tenant, store).
ALTER TABLE public.tenant_branding DROP CONSTRAINT IF EXISTS tenant_branding_pkey;

-- Two partial indexes rather than one over COALESCE: NULLs are not equal in a
-- composite unique index, so a plain (tenant_id, store_id) unique would happily
-- accept many tenant-default rows.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_branding_default_uidx
  ON public.tenant_branding (tenant_id) WHERE store_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tenant_branding_store_uidx
  ON public.tenant_branding (tenant_id, store_id) WHERE store_id IS NOT NULL;

COMMENT ON COLUMN public.tenant_branding.store_id IS
  'NULL = tenant default, inherited by every store. Set = overrides the default for that store only.';

-- READ: the tenant default, plus any store row the caller is entitled to see.
-- app.can_see_store() already encodes that for both a device (single store_id
-- claim) and a human (store_ids array, empty = all stores).
DROP POLICY IF EXISTS tenant_branding_read ON public.tenant_branding;
CREATE POLICY tenant_branding_read ON public.tenant_branding
  FOR SELECT TO authenticated
  USING (
    tenant_id = app.tenant_id()
    AND (store_id IS NULL OR app.can_see_store(store_id))
  );

-- WRITE stays owner/admin only; a till must never push branding.
DROP POLICY IF EXISTS tenant_branding_write ON public.tenant_branding;
CREATE POLICY tenant_branding_write ON public.tenant_branding
  FOR ALL TO authenticated
  USING (tenant_id = app.tenant_id() AND app.app_role() IN ('owner', 'admin'))
  WITH CHECK (tenant_id = app.tenant_id() AND app.app_role() IN ('owner', 'admin'));

-- ---------------------------------------------------------------------
-- Resolution: most specific row wins.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_tenant_branding();
CREATE FUNCTION public.get_tenant_branding()
RETURNS TABLE (
  receipt_logo text,
  logo_width_dots integer,
  logo_height_dots integer,
  store_id uuid,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := app.tenant_id();
  v_store  uuid := app.store_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'no_tenant_context' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT b.receipt_logo, b.logo_width_dots, b.logo_height_dots, b.store_id, b.updated_at
  FROM public.tenant_branding b
  WHERE b.tenant_id = v_tenant
    AND (b.store_id IS NULL OR b.store_id = v_store)
  -- The caller's own store row sorts before the tenant default, so a store
  -- that has overridden the logo gets its own and everyone else inherits.
  ORDER BY b.store_id NULLS LAST
  LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_tenant_branding() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_tenant_branding() TO authenticated;

-- Read a specific scope regardless of the caller's own store, so an admin can
-- review and edit a store's override from the back office.
DROP FUNCTION IF EXISTS public.get_tenant_branding_for_scope(uuid);
CREATE FUNCTION public.get_tenant_branding_for_scope(p_store_id uuid)
RETURNS TABLE (
  receipt_logo text,
  logo_width_dots integer,
  logo_height_dots integer,
  store_id uuid,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := app.tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'no_tenant_context' USING ERRCODE = '28000';
  END IF;
  IF p_store_id IS NOT NULL AND NOT app.can_see_store(p_store_id) THEN
    RAISE EXCEPTION 'store_not_visible' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT b.receipt_logo, b.logo_width_dots, b.logo_height_dots, b.store_id, b.updated_at
  FROM public.tenant_branding b
  WHERE b.tenant_id = v_tenant
    AND b.store_id IS NOT DISTINCT FROM p_store_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_tenant_branding_for_scope(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_tenant_branding_for_scope(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- Write, now scope-aware. NULL p_store_id = the tenant default.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.upsert_tenant_branding(text, integer, integer);
DROP FUNCTION IF EXISTS public.upsert_tenant_branding(text, integer, integer, uuid);
CREATE FUNCTION public.upsert_tenant_branding(
  p_receipt_logo text,
  p_width_dots integer,
  p_height_dots integer,
  p_store_id uuid DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := app.tenant_id();
  v_role   text := app.app_role();
  v_now    timestamptz := now();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'no_tenant_context' USING ERRCODE = '28000';
  END IF;
  -- SECURITY DEFINER bypasses RLS, so the role gate is re-stated here. A till
  -- calling this directly must be refused as firmly as the policy would.
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'branding_requires_admin' USING ERRCODE = '42501';
  END IF;
  IF p_store_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.stores s WHERE s.id = p_store_id AND s.tenant_id = v_tenant
    ) THEN
      RAISE EXCEPTION 'store_not_in_tenant' USING ERRCODE = '23503';
    END IF;
  END IF;

  -- Clearing a STORE override deletes the row so the store falls back to the
  -- tenant default. Clearing the DEFAULT keeps the row with a null logo, which
  -- is what "the tenant has no logo" means.
  IF p_store_id IS NOT NULL AND p_receipt_logo IS NULL THEN
    DELETE FROM public.tenant_branding
    WHERE tenant_id = v_tenant AND store_id = p_store_id;
    RETURN v_now;
  END IF;

  IF p_store_id IS NULL THEN
    INSERT INTO public.tenant_branding
      (tenant_id, store_id, receipt_logo, logo_width_dots, logo_height_dots, updated_at, updated_by)
    VALUES (v_tenant, NULL, p_receipt_logo, p_width_dots, p_height_dots, v_now, auth.uid())
    ON CONFLICT (tenant_id) WHERE store_id IS NULL DO UPDATE
      SET receipt_logo     = EXCLUDED.receipt_logo,
          logo_width_dots  = EXCLUDED.logo_width_dots,
          logo_height_dots = EXCLUDED.logo_height_dots,
          updated_at       = EXCLUDED.updated_at,
          updated_by       = EXCLUDED.updated_by;
  ELSE
    INSERT INTO public.tenant_branding
      (tenant_id, store_id, receipt_logo, logo_width_dots, logo_height_dots, updated_at, updated_by)
    VALUES (v_tenant, p_store_id, p_receipt_logo, p_width_dots, p_height_dots, v_now, auth.uid())
    ON CONFLICT (tenant_id, store_id) WHERE store_id IS NOT NULL DO UPDATE
      SET receipt_logo     = EXCLUDED.receipt_logo,
          logo_width_dots  = EXCLUDED.logo_width_dots,
          logo_height_dots = EXCLUDED.logo_height_dots,
          updated_at       = EXCLUDED.updated_at,
          updated_by       = EXCLUDED.updated_by;
  END IF;

  RETURN v_now;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_tenant_branding(text, integer, integer, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_tenant_branding(text, integer, integer, uuid) TO authenticated;

COMMIT;
