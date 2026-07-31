-- Stop a till's product push from overwriting tenant stock.
--
-- Since 20260805000000, stock lives on store_products and the tenant
-- products.stock is vestigial — read only to seed a new store's row on
-- fan-out. But upsert_products still did `stock = EXCLUDED.stock`, and the
-- Dexie 'updating' hook marks a product needs_push on ANY change including a
-- sale's deduction. So two tills in different stores would take turns writing
-- their own store's stock onto the shared tenant row, leaving a number that
-- describes neither and that any future store would inherit.
--
-- Fix: a NULL incoming stock now PRESERVES what is there. Callers that send a
-- real value (an admin editing the catalogue) are unaffected, so this is
-- backwards compatible; the till simply sends NULL and keeps its stock on its
-- own store row where it belongs.

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
      id UUID, sku TEXT, name TEXT, description TEXT, category_id UUID,
      price NUMERIC, cost NUMERIC, iva_rate NUMERIC, stock NUMERIC,
      min_stock NUMERIC, track_stock BOOLEAN, image_url TEXT, supplier TEXT,
      is_active BOOLEAN, sold_by_weight BOOLEAN, display_order INTEGER,
      created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ
    )
  LOOP
    INSERT INTO public.products (
      tenant_id, id, sku, name, description, category_id, price, cost, iva_rate,
      stock, min_stock, track_stock, image_url, supplier, is_active,
      sold_by_weight, display_order, created_at, updated_at, deleted_at
    ) VALUES (
      v_tenant, COALESCE(product_record.id, gen_random_uuid()), product_record.sku,
      product_record.name, product_record.description, product_record.category_id,
      product_record.price, product_record.cost, product_record.iva_rate,
      COALESCE(product_record.stock, 0), COALESCE(product_record.min_stock, 0),
      COALESCE(product_record.track_stock, TRUE), product_record.image_url,
      product_record.supplier, COALESCE(product_record.is_active, TRUE),
      COALESCE(product_record.sold_by_weight, FALSE), product_record.display_order,
      COALESCE(product_record.created_at, now()), COALESCE(product_record.updated_at, now()),
      product_record.deleted_at
    )
    ON CONFLICT (tenant_id, sku) DO UPDATE SET
      name           = EXCLUDED.name,
      description    = EXCLUDED.description,
      category_id    = EXCLUDED.category_id,
      price          = EXCLUDED.price,
      cost           = EXCLUDED.cost,
      iva_rate       = EXCLUDED.iva_rate,
      -- NULL means "leave it": stock is the store row's business now.
      stock          = COALESCE(product_record.stock, products.stock),
      min_stock      = COALESCE(product_record.min_stock, products.min_stock),
      track_stock    = EXCLUDED.track_stock,
      image_url      = EXCLUDED.image_url,
      supplier       = EXCLUDED.supplier,
      is_active      = EXCLUDED.is_active,
      sold_by_weight = EXCLUDED.sold_by_weight,
      display_order  = EXCLUDED.display_order,
      updated_at     = EXCLUDED.updated_at,
      deleted_at     = EXCLUDED.deleted_at;

    upserted_count := upserted_count + 1;
  END LOOP;

  RETURN upserted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_products(JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_products(JSONB) TO authenticated;

COMMIT;
