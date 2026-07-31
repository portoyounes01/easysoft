-- =====================================================================
-- PRODUCT OPTIONS (Add Product wizard: takeaway price, variants, modifiers)
--
-- Adds the three wizard fields to public.products and carries them through
-- the products sync pair (get_products_delta / upsert_products):
--   * takeaway_price NUMERIC NULL — stored, not yet charged (future takeaway flow)
--   * variants  JSONB NULL — [{ id, name, enabled, options: [{ id, name, price_delta, enabled }] }]
--   * modifiers JSONB NULL — [{ id, name, price_delta, enabled }]
-- The POS item-options dialog reads these to build per-line option selections;
-- option price deltas are folded into the line's unit price at sale time, so
-- transactions/fiscal schemas are untouched.
--
-- ⛔ ORDERING CONSTRAINT: apply BEFORE any till ships the product-options
-- client. A client that pushes variants/modifiers keys against the old
-- upsert_products is harmless (jsonb_to_recordset ignores unknown keys), but
-- a client EXPECTING these columns from get_products_delta will not receive
-- them until this migration is applied.
--
-- Pattern follows 20260730000000_weight_based_products.sql:
--   * get_products_delta: RETURNS TABLE shape changes => DROP + CREATE =>
--     fresh PUBLIC EXECUTE default => re-apply 20260717000000 grant hygiene.
--   * upsert_products: signature unchanged => CREATE OR REPLACE (ACL kept);
--     pre-options clients (keys absent -> NULL) keep server values via CASE,
--     mirroring the sold_by_weight guard.
-- NO explicit BEGIN/COMMIT (CLI wraps the file in one transaction).
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) Columns
-- ---------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS takeaway_price NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS variants JSONB NULL,
  ADD COLUMN IF NOT EXISTS modifiers JSONB NULL;

-- ---------------------------------------------------------------------
-- (2) get_products_delta — gains takeaway_price / variants / modifiers
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_products_delta(TIMESTAMPTZ);

CREATE FUNCTION public.get_products_delta(last_sync_timestamp TIMESTAMPTZ DEFAULT '1970-01-01'::TIMESTAMPTZ)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  sku TEXT,
  barcode TEXT,
  category_id UUID,
  category_name TEXT,
  price NUMERIC,
  cost NUMERIC,
  iva_rate NUMERIC,
  stock NUMERIC,
  min_stock NUMERIC,
  track_stock BOOLEAN,
  sold_by_weight BOOLEAN,
  takeaway_price NUMERIC,
  variants JSONB,
  modifiers JSONB,
  image_url TEXT,
  supplier TEXT,
  location TEXT,
  is_active BOOLEAN,
  display_order INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  needs_push BOOLEAN,
  is_conflicted BOOLEAN
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
  SELECT
    p.id, p.name, p.description, p.sku, p.barcode, p.category_id, p.category_name,
    p.price, p.cost, p.iva_rate, p.stock, p.min_stock, p.track_stock,
    p.sold_by_weight,
    p.takeaway_price, p.variants, p.modifiers,
    p.image_url, p.supplier, p.location, p.is_active, p.display_order,
    p.created_at, p.updated_at, p.deleted_at,
    COALESCE(p.needs_push, FALSE) AS needs_push,
    COALESCE(p.is_conflicted, FALSE) AS is_conflicted
  FROM public.products p
  WHERE p.tenant_id = v_tenant
    AND p.updated_at > last_sync_timestamp
  ORDER BY p.updated_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_products_delta(TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_products_delta(TIMESTAMPTZ) TO authenticated;

-- ---------------------------------------------------------------------
-- (3) upsert_products — same signature, replaced in place (ACL preserved).
-- Pre-options clients send payloads WITHOUT the new keys; the CASEs keep the
-- server values instead of clobbering them to NULL on their next push.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_products(products_data JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product_record RECORD;
  upserted_count INTEGER := 0;
  v_tenant uuid := app.tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'no_tenant_context' USING ERRCODE = '28000';
  END IF;

  FOR product_record IN
    SELECT * FROM jsonb_to_recordset(products_data) AS x(
      id UUID, name TEXT, description TEXT, sku TEXT, barcode TEXT,
      category_id UUID, category_name TEXT, price NUMERIC, cost NUMERIC,
      iva_rate NUMERIC, stock NUMERIC, min_stock NUMERIC, track_stock BOOLEAN,
      sold_by_weight BOOLEAN,
      takeaway_price NUMERIC, variants JSONB, modifiers JSONB,
      image_url TEXT, supplier TEXT, location TEXT, is_active BOOLEAN,
      display_order INTEGER, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ, needs_push BOOLEAN, is_conflicted BOOLEAN
    )
  LOOP
    INSERT INTO public.products (
      id, tenant_id, name, description, sku, barcode, category_id, category_name,
      price, cost, iva_rate, stock, min_stock, track_stock, sold_by_weight,
      takeaway_price, variants, modifiers,
      image_url, supplier, location, is_active, display_order, created_at,
      updated_at, deleted_at, needs_push, is_conflicted
    ) VALUES (
      product_record.id, v_tenant, product_record.name, product_record.description,
      product_record.sku, product_record.barcode, product_record.category_id,
      product_record.category_name, product_record.price, product_record.cost,
      product_record.iva_rate, product_record.stock, product_record.min_stock,
      product_record.track_stock, COALESCE(product_record.sold_by_weight, FALSE),
      product_record.takeaway_price, product_record.variants, product_record.modifiers,
      product_record.image_url, product_record.supplier,
      product_record.location, product_record.is_active, product_record.display_order,
      product_record.created_at, product_record.updated_at, product_record.deleted_at,
      COALESCE(product_record.needs_push, FALSE), COALESCE(product_record.is_conflicted, FALSE)
    )
    ON CONFLICT (tenant_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      barcode = EXCLUDED.barcode,
      category_id = EXCLUDED.category_id,
      category_name = EXCLUDED.category_name,
      price = EXCLUDED.price,
      cost = EXCLUDED.cost,
      iva_rate = EXCLUDED.iva_rate,
      stock = EXCLUDED.stock,
      min_stock = EXCLUDED.min_stock,
      track_stock = EXCLUDED.track_stock,
      -- pre-Phase-B client (key absent -> NULL): keep the server's flag
      sold_by_weight = CASE WHEN product_record.sold_by_weight IS NULL
                            THEN public.products.sold_by_weight
                            ELSE product_record.sold_by_weight END,
      -- pre-options client (keys absent -> NULL): keep the server's values
      takeaway_price = CASE WHEN product_record.takeaway_price IS NULL
                            THEN public.products.takeaway_price
                            ELSE product_record.takeaway_price END,
      variants = CASE WHEN product_record.variants IS NULL
                      THEN public.products.variants
                      ELSE product_record.variants END,
      modifiers = CASE WHEN product_record.modifiers IS NULL
                       THEN public.products.modifiers
                       ELSE product_record.modifiers END,
      image_url = EXCLUDED.image_url,
      supplier = EXCLUDED.supplier,
      location = EXCLUDED.location,
      is_active = EXCLUDED.is_active,
      display_order = EXCLUDED.display_order,
      updated_at = EXCLUDED.updated_at,
      deleted_at = EXCLUDED.deleted_at,
      needs_push = EXCLUDED.needs_push,
      is_conflicted = EXCLUDED.is_conflicted
    WHERE public.products.tenant_id = v_tenant
      AND public.products.updated_at < EXCLUDED.updated_at;

    upserted_count := upserted_count + 1;
  END LOOP;

  RETURN upserted_count;
END;
$$;
