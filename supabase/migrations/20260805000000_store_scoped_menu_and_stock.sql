-- =====================================================================
-- STORE-SCOPED MENU AND STOCK
--
-- Decision (user, 2026-07-27): the catalogue BELONGS TO THE TENANT, but two
-- stores of the same tenant may run two different menus. So we do NOT fork the
-- definitions per store — that would turn one dish into two product rows with
-- two SKUs, two recipes and two images to maintain. Instead each row splits:
--
--   tenant level (shared, one row)   | store level (one row per store)
--   ---------------------------------+---------------------------------------
--   product identity: name, SKU,     | on this store's menu? price, stock,
--   description, image, iva_rate,    | min_stock, track_stock, display_order
--   category, variants, modifiers    |
--   raw material identity: name,     | stock, min_stock
--   unit, cost                       |
--   recipe lines (same dish =        | —
--   same fiche technique)            |
--
-- Why stock had to move: `recipeService.deductForSale` reduced a single scalar
-- `material.stock`. With one shared value, selling a dish in Évora would have
-- decremented flour in Lisbon. An on-hand quantity is a physical fact about one
-- building, so it cannot live on a tenant-wide row. Same for product stock.
--
-- `products.price/stock/min_stock/track_stock` are KEPT as the tenant-level
-- DEFAULT — the template copied when a store is added to the menu. The store
-- row is what the till actually charges and decrements. Reads must prefer the
-- store row; the default is a fallback, never the source of truth for a sale.
--
-- Categories stay tenant-level and are NOT given a store column: a store's
-- category list is derived from the products it actually has available, so a
-- store never shows an empty section.
--
-- Every till already has a store: `devices.store_id` is NOT NULL with a
-- composite FK to stores(tenant_id, id), so there is no "unscoped till" case
-- to migrate. Humans carry `store_ids` (null = all stores).
-- NO explicit BEGIN/COMMIT (CLI wraps the file in one transaction).
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) Visibility helper — one predicate for both principal shapes.
-- A device JWT carries a single `store_id`; a human carries `store_ids`
-- (null/empty = unrestricted within the tenant).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.can_see_store(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN app.store_id() IS NOT NULL THEN p_store_id = app.store_id()
    WHEN app.store_ids() IS NULL OR cardinality(app.store_ids()) = 0 THEN true
    ELSE p_store_id = ANY (app.store_ids())
  END;
$$;

REVOKE EXECUTE ON FUNCTION app.can_see_store(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION app.can_see_store(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- (2) store_products — the per-store MENU.
-- A product is on a store's menu iff a row exists here with is_available.
-- `price` NULL means "use the tenant default on products.price".
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id),
  store_id      uuid NOT NULL,
  product_id    uuid NOT NULL,
  is_available  boolean NOT NULL DEFAULT true,
  price         numeric(14,4),
  stock         numeric(14,3) NOT NULL DEFAULT 0,
  min_stock     numeric(14,3) NOT NULL DEFAULT 0,
  track_stock   boolean NOT NULL DEFAULT true,
  display_order integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  needs_push    boolean NOT NULL DEFAULT false,
  is_conflicted boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, store_id, product_id),
  FOREIGN KEY (tenant_id, store_id)   REFERENCES public.stores (tenant_id, id),
  FOREIGN KEY (tenant_id, product_id) REFERENCES public.products (tenant_id, id)
);

-- ---------------------------------------------------------------------
-- (3) store_raw_materials — per-store ingredient stock.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_raw_materials (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id),
  store_id        uuid NOT NULL,
  raw_material_id uuid NOT NULL REFERENCES public.raw_materials(id) ON DELETE CASCADE,
  stock           numeric(14,3) NOT NULL DEFAULT 0,
  min_stock       numeric(14,3) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  needs_push      boolean NOT NULL DEFAULT false,
  is_conflicted   boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, store_id, raw_material_id),
  FOREIGN KEY (tenant_id, store_id) REFERENCES public.stores (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_store_products_scope      ON public.store_products(tenant_id, store_id);
CREATE INDEX IF NOT EXISTS idx_store_products_upd        ON public.store_products(tenant_id, store_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_store_products_product    ON public.store_products(tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_store_raw_materials_scope ON public.store_raw_materials(tenant_id, store_id);
CREATE INDEX IF NOT EXISTS idx_store_raw_materials_upd   ON public.store_raw_materials(tenant_id, store_id, updated_at);

-- ---------------------------------------------------------------------
-- (4) BACKFILL — every existing store gets the whole current catalogue on its
-- menu, carrying today's price/stock across so nothing changes behaviour for
-- the single-store tenants that exist now. Idempotent via ON CONFLICT.
-- ---------------------------------------------------------------------
INSERT INTO public.store_products (
  tenant_id, store_id, product_id, is_available, price, stock, min_stock, track_stock, display_order
)
SELECT s.tenant_id, s.id, p.id,
       COALESCE(p.is_active, true),
       p.price,
       COALESCE(p.stock, 0),
       COALESCE(p.min_stock, 0),
       COALESCE(p.track_stock, true),
       p.display_order
FROM public.stores s
JOIN public.products p ON p.tenant_id = s.tenant_id
WHERE p.deleted_at IS NULL
ON CONFLICT (tenant_id, store_id, product_id) DO NOTHING;

-- raw_materials is brand new (20260804000000) so this is normally a no-op; it
-- exists so a re-run after materials are pushed still seeds every store.
INSERT INTO public.store_raw_materials (tenant_id, store_id, raw_material_id, stock, min_stock)
SELECT s.tenant_id, s.id, m.id, 0, 0
FROM public.stores s
JOIN public.raw_materials m ON m.tenant_id = s.tenant_id
WHERE m.deleted_at IS NULL
ON CONFLICT (tenant_id, store_id, raw_material_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- (5) RLS — tenant AND store scoped.
-- ---------------------------------------------------------------------
ALTER TABLE public.store_products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_raw_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_products_scoped_rw ON public.store_products;
CREATE POLICY store_products_scoped_rw ON public.store_products
  FOR ALL TO authenticated
  USING      (tenant_id = app.tenant_id() AND app.can_see_store(store_id))
  WITH CHECK (tenant_id = app.tenant_id() AND app.can_see_store(store_id));

DROP POLICY IF EXISTS store_raw_materials_scoped_rw ON public.store_raw_materials;
CREATE POLICY store_raw_materials_scoped_rw ON public.store_raw_materials
  FOR ALL TO authenticated
  USING      (tenant_id = app.tenant_id() AND app.can_see_store(store_id))
  WITH CHECK (tenant_id = app.tenant_id() AND app.can_see_store(store_id));

REVOKE ALL ON public.store_products      FROM PUBLIC, anon;
REVOKE ALL ON public.store_raw_materials FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_products      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_raw_materials TO authenticated;

-- ---------------------------------------------------------------------
-- (6) Sync pair — store_products. Scoped by the caller's own store: a till
-- pulls exactly its menu, never the whole tenant's.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_store_products_delta(TIMESTAMPTZ);
CREATE FUNCTION public.get_store_products_delta(last_sync_timestamp TIMESTAMPTZ)
RETURNS TABLE (
  id uuid, store_id uuid, product_id uuid, is_available boolean, price numeric,
  stock numeric, min_stock numeric, track_stock boolean, display_order integer,
  created_at timestamptz, updated_at timestamptz, deleted_at timestamptz,
  needs_push boolean, is_conflicted boolean
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
  SELECT sp.id, sp.store_id, sp.product_id, sp.is_available, sp.price,
         sp.stock, sp.min_stock, sp.track_stock, sp.display_order,
         sp.created_at, sp.updated_at, sp.deleted_at,
         COALESCE(sp.needs_push, FALSE), COALESCE(sp.is_conflicted, FALSE)
  FROM public.store_products sp
  WHERE sp.tenant_id = v_tenant
    AND app.can_see_store(sp.store_id)
    AND sp.updated_at > last_sync_timestamp
  ORDER BY sp.updated_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_store_products_delta(TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_store_products_delta(TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_store_products(rows_data JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  upserted_count INTEGER := 0;
  v_tenant uuid := app.tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'no_tenant_context' USING ERRCODE = '28000';
  END IF;

  FOR r IN
    SELECT * FROM jsonb_to_recordset(rows_data) AS x(
      id uuid, store_id uuid, product_id uuid, is_available boolean, price numeric,
      stock numeric, min_stock numeric, track_stock boolean, display_order integer,
      created_at timestamptz, updated_at timestamptz, deleted_at timestamptz
    )
  LOOP
    -- A till may only ever write its own store's row.
    IF NOT app.can_see_store(r.store_id) THEN
      RAISE EXCEPTION 'store_scope_forbidden' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.store_products (
      id, tenant_id, store_id, product_id, is_available, price, stock, min_stock,
      track_stock, display_order, created_at, updated_at, deleted_at
    ) VALUES (
      COALESCE(r.id, gen_random_uuid()), v_tenant, r.store_id, r.product_id,
      COALESCE(r.is_available, true), r.price, COALESCE(r.stock, 0),
      COALESCE(r.min_stock, 0), COALESCE(r.track_stock, true), r.display_order,
      COALESCE(r.created_at, now()), COALESCE(r.updated_at, now()), r.deleted_at
    )
    ON CONFLICT (tenant_id, store_id, product_id) DO UPDATE SET
      is_available = EXCLUDED.is_available,
      price = EXCLUDED.price,
      stock = EXCLUDED.stock,
      min_stock = EXCLUDED.min_stock,
      track_stock = EXCLUDED.track_stock,
      display_order = EXCLUDED.display_order,
      updated_at = EXCLUDED.updated_at,
      deleted_at = EXCLUDED.deleted_at;

    upserted_count := upserted_count + 1;
  END LOOP;

  RETURN upserted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_store_products(JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_store_products(JSONB) TO authenticated;

-- ---------------------------------------------------------------------
-- (7) Sync pair — store_raw_materials
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_store_raw_materials_delta(TIMESTAMPTZ);
CREATE FUNCTION public.get_store_raw_materials_delta(last_sync_timestamp TIMESTAMPTZ)
RETURNS TABLE (
  id uuid, store_id uuid, raw_material_id uuid, stock numeric, min_stock numeric,
  created_at timestamptz, updated_at timestamptz, deleted_at timestamptz,
  needs_push boolean, is_conflicted boolean
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
  SELECT sm.id, sm.store_id, sm.raw_material_id, sm.stock, sm.min_stock,
         sm.created_at, sm.updated_at, sm.deleted_at,
         COALESCE(sm.needs_push, FALSE), COALESCE(sm.is_conflicted, FALSE)
  FROM public.store_raw_materials sm
  WHERE sm.tenant_id = v_tenant
    AND app.can_see_store(sm.store_id)
    AND sm.updated_at > last_sync_timestamp
  ORDER BY sm.updated_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_store_raw_materials_delta(TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_store_raw_materials_delta(TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_store_raw_materials(rows_data JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  upserted_count INTEGER := 0;
  v_tenant uuid := app.tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'no_tenant_context' USING ERRCODE = '28000';
  END IF;

  FOR r IN
    SELECT * FROM jsonb_to_recordset(rows_data) AS x(
      id uuid, store_id uuid, raw_material_id uuid, stock numeric, min_stock numeric,
      created_at timestamptz, updated_at timestamptz, deleted_at timestamptz
    )
  LOOP
    IF NOT app.can_see_store(r.store_id) THEN
      RAISE EXCEPTION 'store_scope_forbidden' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.store_raw_materials (
      id, tenant_id, store_id, raw_material_id, stock, min_stock,
      created_at, updated_at, deleted_at
    ) VALUES (
      COALESCE(r.id, gen_random_uuid()), v_tenant, r.store_id, r.raw_material_id,
      COALESCE(r.stock, 0), COALESCE(r.min_stock, 0),
      COALESCE(r.created_at, now()), COALESCE(r.updated_at, now()), r.deleted_at
    )
    ON CONFLICT (tenant_id, store_id, raw_material_id) DO UPDATE SET
      stock = EXCLUDED.stock,
      min_stock = EXCLUDED.min_stock,
      updated_at = EXCLUDED.updated_at,
      deleted_at = EXCLUDED.deleted_at;

    upserted_count := upserted_count + 1;
  END LOOP;

  RETURN upserted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_store_raw_materials(JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_store_raw_materials(JSONB) TO authenticated;

-- ---------------------------------------------------------------------
-- (8) Keep new catalogue rows on every store's menu automatically, so adding
-- a product does not silently make it invisible to every till.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fanout_product_to_stores()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.store_products (
    tenant_id, store_id, product_id, is_available, price, stock, min_stock, track_stock, display_order
  )
  SELECT NEW.tenant_id, s.id, NEW.id, COALESCE(NEW.is_active, true), NEW.price,
         COALESCE(NEW.stock, 0), COALESCE(NEW.min_stock, 0),
         COALESCE(NEW.track_stock, true), NEW.display_order
  FROM public.stores s
  WHERE s.tenant_id = NEW.tenant_id
  ON CONFLICT (tenant_id, store_id, product_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fanout_product_to_stores ON public.products;
CREATE TRIGGER trg_fanout_product_to_stores
  AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.fanout_product_to_stores();

CREATE OR REPLACE FUNCTION public.fanout_raw_material_to_stores()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.store_raw_materials (tenant_id, store_id, raw_material_id, stock, min_stock)
  SELECT NEW.tenant_id, s.id, NEW.id, 0, 0
  FROM public.stores s
  WHERE s.tenant_id = NEW.tenant_id
  ON CONFLICT (tenant_id, store_id, raw_material_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fanout_raw_material_to_stores ON public.raw_materials;
CREATE TRIGGER trg_fanout_raw_material_to_stores
  AFTER INSERT ON public.raw_materials
  FOR EACH ROW EXECUTE FUNCTION public.fanout_raw_material_to_stores();
