-- Tenant branding: the logo printed at the top of every receipt.
--
-- Why its own table rather than columns on `tenants`: `tenants` is control
-- plane. Every till in the fleet has to READ the logo, and widening read access
-- to the tenant row so a cash register can fetch a picture is a far bigger
-- blast radius than the feature deserves.
--
-- The payload is the PackBits-compressed 1-bit raster the thermal head takes,
-- base64 (see src/utils/receiptLogo.ts). It is stored pre-rendered because the
-- ESC/POS builder is synchronous and cannot decode an image at print time; the
-- server never needs to understand it, only to hand back the same bytes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_branding (
  tenant_id          uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  receipt_logo       text,
  logo_width_dots    integer,
  logo_height_dots   integer,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid,

  -- Bound the row. Every till re-pulls this on sync, so a pathological image
  -- must not become a permanent tax on the whole fleet. 96 KB of base64 is
  -- comfortably above the 64 KB the client already refuses to produce.
  CONSTRAINT tenant_branding_logo_size CHECK (
    receipt_logo IS NULL OR length(receipt_logo) <= 98304
  ),
  -- Geometry must match what the client caps at, or the raster is unprintable.
  CONSTRAINT tenant_branding_logo_dots CHECK (
    receipt_logo IS NULL OR (
      logo_width_dots BETWEEN 1 AND 576 AND logo_height_dots BETWEEN 1 AND 240
    )
  )
);

COMMENT ON TABLE public.tenant_branding IS
  'Per-tenant receipt branding. receipt_logo is a PackBits-compressed 1-bit ESC/POS raster (base64), pre-rendered client-side.';

ALTER TABLE public.tenant_branding ENABLE ROW LEVEL SECURITY;

-- READ: anyone in the tenant, including paired tills. A device JWT carries
-- tenant_id (supabase/functions/pair-device: app_metadata = {tenant_id,
-- store_id, device_id, app_role:'device'}), so app.tenant_id() resolves for a
-- till exactly as it does for a human.
DROP POLICY IF EXISTS tenant_branding_read ON public.tenant_branding;
CREATE POLICY tenant_branding_read ON public.tenant_branding
  FOR SELECT TO authenticated
  USING (tenant_id = app.tenant_id());

-- WRITE: humans who administer the tenant. A till must never push branding —
-- that would be last-writer-wins across devices with no UI to resolve it.
DROP POLICY IF EXISTS tenant_branding_write ON public.tenant_branding;
CREATE POLICY tenant_branding_write ON public.tenant_branding
  FOR ALL TO authenticated
  USING (tenant_id = app.tenant_id() AND app.app_role() IN ('owner', 'admin'))
  WITH CHECK (tenant_id = app.tenant_id() AND app.app_role() IN ('owner', 'admin'));

REVOKE ALL ON public.tenant_branding FROM PUBLIC, anon;
GRANT SELECT ON public.tenant_branding TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tenant_branding TO authenticated;

-- ---------------------------------------------------------------------
-- Sync pair. A singleton per tenant, so no delta cursor and no needs_push:
-- forcing the collection shape onto one row would be ceremony, not safety.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_tenant_branding();
CREATE FUNCTION public.get_tenant_branding()
RETURNS TABLE (
  receipt_logo text,
  logo_width_dots integer,
  logo_height_dots integer,
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

  RETURN QUERY
  SELECT b.receipt_logo, b.logo_width_dots, b.logo_height_dots, b.updated_at
  FROM public.tenant_branding b
  WHERE b.tenant_id = v_tenant;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_tenant_branding() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_tenant_branding() TO authenticated;

DROP FUNCTION IF EXISTS public.upsert_tenant_branding(text, integer, integer);
CREATE FUNCTION public.upsert_tenant_branding(
  p_receipt_logo text,
  p_width_dots integer,
  p_height_dots integer
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

  INSERT INTO public.tenant_branding AS b
    (tenant_id, receipt_logo, logo_width_dots, logo_height_dots, updated_at, updated_by)
  VALUES (v_tenant, p_receipt_logo, p_width_dots, p_height_dots, v_now, auth.uid())
  ON CONFLICT (tenant_id) DO UPDATE
    SET receipt_logo     = EXCLUDED.receipt_logo,
        logo_width_dots  = EXCLUDED.logo_width_dots,
        logo_height_dots = EXCLUDED.logo_height_dots,
        updated_at       = EXCLUDED.updated_at,
        updated_by       = EXCLUDED.updated_by;

  RETURN v_now;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_tenant_branding(text, integer, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_tenant_branding(text, integer, integer) TO authenticated;

COMMIT;
