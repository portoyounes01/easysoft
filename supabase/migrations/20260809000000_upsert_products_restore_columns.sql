-- Corrective. 20260808000000 rewrote upsert_products to make a NULL stock
-- preserve the existing value, but it was written from a partial reading of
-- the function rather than from its actual definition, and silently dropped:
--
--   * columns barcode, category_name, location, needs_push, is_conflicted
--     (absent from DO UPDATE SET they were preserved on update, but a product
--     created through the push got them as NULL);
--   * the `updated_at < EXCLUDED.updated_at` staleness guard, without which a
--     stale client push can overwrite a newer server row — the thing that
--     guard exists to prevent;
--   * the redundant-but-deliberate tenant_id re-check on the update branch.
--
-- This restores 20260717000000's definition verbatim and applies only the two
-- intended changes on top:
--
--   1. stock / min_stock: NULL preserves. Stock lives on store_products now
--      (20260805000000); the till sends NULL so two tills cannot take turns
--      writing their own store's figure onto the shared tenant row.
--   2. sold_by_weight is carried. The client has always sent it and the RPC
--      has always ignored it, so a weighed product created through the push
--      came back as a unit product. Called out rather than smuggled in.

BEGIN;

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
      image_url TEXT, supplier TEXT, location TEXT, is_active BOOLEAN,
      sold_by_weight BOOLEAN, display_order INTEGER, created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ, needs_push BOOLEAN,
      is_conflicted BOOLEAN
    )
  LOOP
    INSERT INTO public.products (
      id, tenant_id, name, description, sku, barcode, category_id, category_name,
      price, cost, iva_rate, stock, min_stock, track_stock, image_url,
      supplier, location, is_active, sold_by_weight, display_order, created_at,
      updated_at, deleted_at, needs_push, is_conflicted
    ) VALUES (
      product_record.id, v_tenant, product_record.name, product_record.description,
      product_record.sku, product_record.barcode, product_record.category_id,
      product_record.category_name, product_record.price, product_record.cost,
      product_record.iva_rate,
      -- A new product with no stock figure starts at zero, not NULL.
      COALESCE(product_record.stock, 0), COALESCE(product_record.min_stock, 0),
      product_record.track_stock, product_record.image_url, product_record.supplier,
      product_record.location, product_record.is_active,
      COALESCE(product_record.sold_by_weight, FALSE), product_record.display_order,
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
      -- The only behavioural change: NULL leaves the tenant figure alone.
      stock = COALESCE(product_record.stock, public.products.stock),
      min_stock = COALESCE(product_record.min_stock, public.products.min_stock),
      track_stock = EXCLUDED.track_stock,
      image_url = EXCLUDED.image_url,
      supplier = EXCLUDED.supplier,
      location = EXCLUDED.location,
      is_active = EXCLUDED.is_active,
      sold_by_weight = EXCLUDED.sold_by_weight,
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

REVOKE EXECUTE ON FUNCTION public.upsert_products(JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_products(JSONB) TO authenticated;

COMMIT;
