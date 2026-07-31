-- Company profile: the block printed at the top of every receipt, resolved
-- server-side instead of typed into each till's localStorage.
--
-- Why this exists: `settings.company` was per-device. Two tills in the same
-- shop could print different addresses, and a reinstalled till printed the
-- defaults ("Nome da Empresa", NIF 000000000) until someone retyped them.
--
-- No new table for the identity or the address — both already have a home and
-- inventing a second one would let them drift:
--
--   tenants.legal_name  -> company name (FIRMA)
--   tenants.nif         -> company tax number (NIPC)
--   stores.address      -> address        stores.postal_code -> postal code
--   stores.city         -> city           stores.phone/email -> contacts
--
-- A till is bound to exactly one store (`devices.store_id` is NOT NULL with a
-- composite FK to stores), so "which store's address?" is never ambiguous on a
-- till. Only the slogan had nowhere to live; it joins the receipt logo in
-- tenant_branding, which already carries the tenant-default + per-store-
-- override shape this needs.
--
-- Editing rights follow the identity/location split:
--   FIRMA + NIPC          sysadmin only, via the platform console. They are the
--                         fiscal identity: tenants.nif carries a format CHECK
--                         and the fiskaly / SIGN ES provisioning is bound to it,
--                         so a shop owner must not be able to retype the value
--                         that already-issued documents were signed under.
--   address .. slogan     owner/admin, per store.
--
-- NO explicit BEGIN/COMMIT — db push wraps each migration in a transaction.

-- ---------------------------------------------------------------------
-- 1. Slogan joins the logo on tenant_branding.
-- ---------------------------------------------------------------------

ALTER TABLE public.tenant_branding
  ADD COLUMN IF NOT EXISTS slogan text;

COMMENT ON COLUMN public.tenant_branding.slogan IS
  'Receipt slogan. NULL = inherit (a store row inherits the tenant default). Same scope rule as receipt_logo.';

-- ---------------------------------------------------------------------
-- 2. The logo writer must stop treating the row as logo-only.
--
-- The previous version DELETEd a store override row whenever the logo was
-- cleared. The row now also carries the slogan, so that would silently take a
-- store's slogan with it. Clearing the logo now nulls the logo columns, and the
-- row is dropped only once nothing else is left on it.
--
-- The signature is unchanged on purpose: adding a p_slogan parameter with a
-- NULL default would make every existing 4-arg call from the logo picker wipe
-- the slogan. Slogan has its own writer below.
-- ---------------------------------------------------------------------

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

  IF p_store_id IS NOT NULL AND p_receipt_logo IS NULL THEN
    UPDATE public.tenant_branding
       SET receipt_logo     = NULL,
           logo_width_dots  = NULL,
           logo_height_dots = NULL,
           updated_at       = v_now,
           updated_by       = auth.uid()
     WHERE tenant_id = v_tenant AND store_id = p_store_id;
    -- Only now is the override genuinely empty.
    DELETE FROM public.tenant_branding
     WHERE tenant_id = v_tenant AND store_id = p_store_id AND slogan IS NULL;
    RETURN v_now;
  END IF;

  -- The column lists below deliberately omit `slogan`, so ON CONFLICT DO UPDATE
  -- never touches it.
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

-- ---------------------------------------------------------------------
-- 3. Slogan writer — mirror image of the logo writer, same emptiness rule.
-- ---------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.upsert_company_slogan(text, uuid);
CREATE FUNCTION public.upsert_company_slogan(
  p_slogan text,
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
  v_value  text := NULLIF(btrim(coalesce(p_slogan, '')), '');
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'no_tenant_context' USING ERRCODE = '28000';
  END IF;
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'company_requires_admin' USING ERRCODE = '42501';
  END IF;
  IF p_store_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.stores s WHERE s.id = p_store_id AND s.tenant_id = v_tenant
    ) THEN
      RAISE EXCEPTION 'store_not_in_tenant' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF p_store_id IS NOT NULL AND v_value IS NULL THEN
    UPDATE public.tenant_branding
       SET slogan = NULL, updated_at = v_now, updated_by = auth.uid()
     WHERE tenant_id = v_tenant AND store_id = p_store_id;
    DELETE FROM public.tenant_branding
     WHERE tenant_id = v_tenant AND store_id = p_store_id AND receipt_logo IS NULL;
    RETURN v_now;
  END IF;

  IF p_store_id IS NULL THEN
    INSERT INTO public.tenant_branding (tenant_id, store_id, slogan, updated_at, updated_by)
    VALUES (v_tenant, NULL, v_value, v_now, auth.uid())
    ON CONFLICT (tenant_id) WHERE store_id IS NULL DO UPDATE
      SET slogan     = EXCLUDED.slogan,
          updated_at = EXCLUDED.updated_at,
          updated_by = EXCLUDED.updated_by;
  ELSE
    INSERT INTO public.tenant_branding (tenant_id, store_id, slogan, updated_at, updated_by)
    VALUES (v_tenant, p_store_id, v_value, v_now, auth.uid())
    ON CONFLICT (tenant_id, store_id) WHERE store_id IS NOT NULL DO UPDATE
      SET slogan     = EXCLUDED.slogan,
          updated_at = EXCLUDED.updated_at,
          updated_by = EXCLUDED.updated_by;
  END IF;

  RETURN v_now;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_company_slogan(text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_company_slogan(text, uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 4. Which store does the caller mean?
--
-- A till answers itself (`app.store_id()` from its JWT). A human carries
-- `store_ids` instead, so: one visible store means that one, several means
-- ambiguous and the caller must name it explicitly.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.implied_store_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := app.tenant_id();
  v_store  uuid := app.store_id();
  v_count  integer;
BEGIN
  IF v_store IS NOT NULL THEN
    RETURN v_store;
  END IF;
  IF v_tenant IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*), min(s.id)
    INTO v_count, v_store
    FROM public.stores s
   WHERE s.tenant_id = v_tenant
     AND s.status = 'active'
     AND app.can_see_store(s.id);

  -- Deliberately NULL when several are visible: guessing one would show a
  -- back-office user another store's address with no sign that it was a guess.
  IF v_count = 1 THEN
    RETURN v_store;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.implied_store_id() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION app.implied_store_id() TO authenticated;

-- ---------------------------------------------------------------------
-- 5. Read the resolved block.
--
-- Slogan resolves PER FIELD, not per row: a store that overrides only the logo
-- must still inherit the tenant slogan. That is why this does not piggyback on
-- get_tenant_branding(), whose row-at-a-time resolution is right for a logo
-- (bitmap + dimensions are one unit) and wrong here.
-- ---------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_company_profile();
CREATE FUNCTION public.get_company_profile()
RETURNS TABLE (
  name text,
  tax_number text,
  address text,
  postal_code text,
  city text,
  phone text,
  email text,
  slogan text,
  store_id uuid,
  store_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := app.tenant_id();
  v_store  uuid := app.implied_store_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'no_tenant_context' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT
    t.legal_name,
    t.nif,
    s.address,
    s.postal_code,
    s.city,
    s.phone,
    s.email,
    COALESCE(
      (SELECT b.slogan FROM public.tenant_branding b
        WHERE b.tenant_id = v_tenant AND b.store_id = v_store AND b.slogan IS NOT NULL),
      (SELECT b.slogan FROM public.tenant_branding b
        WHERE b.tenant_id = v_tenant AND b.store_id IS NULL)
    ),
    s.id,
    s.name
  FROM public.tenants t
  -- LEFT JOIN: a back office with several stores still gets the identity half,
  -- with the address columns null, rather than an empty result it must guess at.
  LEFT JOIN public.stores s ON s.id = v_store AND s.tenant_id = v_tenant
  WHERE t.id = v_tenant;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_company_profile() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_company_profile() TO authenticated;

-- Same block for a named store, so the back-office editor can review and edit a
-- store other than the one it would have been given implicitly.
DROP FUNCTION IF EXISTS public.get_company_profile_for_scope(uuid);
CREATE FUNCTION public.get_company_profile_for_scope(p_store_id uuid)
RETURNS TABLE (
  name text,
  tax_number text,
  address text,
  postal_code text,
  city text,
  phone text,
  email text,
  slogan text,
  store_id uuid,
  store_name text
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
  SELECT
    t.legal_name,
    t.nif,
    s.address,
    s.postal_code,
    s.city,
    s.phone,
    s.email,
    -- p_store_id NULL means "the tenant default", so the store lookup finds
    -- nothing and the default is what is returned — which is correct.
    COALESCE(
      (SELECT b.slogan FROM public.tenant_branding b
        WHERE b.tenant_id = v_tenant AND b.store_id = p_store_id AND b.slogan IS NOT NULL),
      (SELECT b.slogan FROM public.tenant_branding b
        WHERE b.tenant_id = v_tenant AND b.store_id IS NULL)
    ),
    s.id,
    s.name
  FROM public.tenants t
  LEFT JOIN public.stores s ON s.id = p_store_id AND s.tenant_id = v_tenant
  WHERE t.id = v_tenant;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_company_profile_for_scope(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_company_profile_for_scope(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 6. The stores a caller may edit, for the back-office picker.
-- ---------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.list_company_stores();
CREATE FUNCTION public.list_company_stores()
RETURNS TABLE (id uuid, name text, city text)
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

  RETURN QUERY
  SELECT s.id, s.name, s.city
  FROM public.stores s
  WHERE s.tenant_id = v_tenant
    AND s.status = 'active'
    AND app.can_see_store(s.id)
  ORDER BY s.name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_company_stores() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.list_company_stores() TO authenticated;

-- ---------------------------------------------------------------------
-- 7. Write the location half. Owner/admin only.
--
-- Note what is NOT here: legal_name and nif. Those stay with the platform
-- console. A till or a shop owner changing the NIF would break the fiscal
-- chain and the provisioning bound to it.
--
-- NULL means "leave this column alone"; the empty string means "clear it".
-- The distinction is not decoration. The caller edits a local settings blob
-- whose untouched fields still hold the shipped placeholders ("Morada",
-- "Lisboa", "1000-001"), so a writer that took every field on every save would
-- publish those placeholders the first time an operator saved ANY unrelated
-- setting — and, because a non-empty server value wins on sync, they would then
-- spread to every till in the store as truth.
-- ---------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.upsert_store_company(uuid, text, text, text, text, text);
CREATE FUNCTION public.upsert_store_company(
  p_store_id uuid,
  p_address text,
  p_postal_code text,
  p_city text,
  p_phone text,
  p_email text
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
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'company_requires_admin' USING ERRCODE = '42501';
  END IF;
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'store_required' USING ERRCODE = '22004';
  END IF;
  IF NOT app.can_see_store(p_store_id) THEN
    RAISE EXCEPTION 'store_not_visible' USING ERRCODE = '42501';
  END IF;

  -- Nothing named: nothing to do. Saying so beats bumping updated_at on every
  -- unrelated settings save.
  IF p_address IS NULL AND p_postal_code IS NULL AND p_city IS NULL
     AND p_phone IS NULL AND p_email IS NULL THEN
    RETURN v_now;
  END IF;

  UPDATE public.stores
     SET address     = CASE WHEN p_address     IS NULL THEN address     ELSE NULLIF(btrim(p_address), '')     END,
         postal_code = CASE WHEN p_postal_code IS NULL THEN postal_code ELSE NULLIF(btrim(p_postal_code), '') END,
         city        = CASE WHEN p_city        IS NULL THEN city        ELSE NULLIF(btrim(p_city), '')        END,
         phone       = CASE WHEN p_phone       IS NULL THEN phone       ELSE NULLIF(btrim(p_phone), '')       END,
         email       = CASE WHEN p_email       IS NULL THEN email       ELSE NULLIF(btrim(p_email), '')       END,
         updated_at  = v_now
   WHERE id = p_store_id AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_not_in_tenant' USING ERRCODE = '23503';
  END IF;

  RETURN v_now;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_store_company(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_store_company(uuid, text, text, text, text, text) TO authenticated;
