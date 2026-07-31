-- =====================================================================
-- INVENTORY + RECIPES BECOME SERVER TABLES (tenant-scoped, synced)
--
-- Until now `rawMaterials` and `recipeLines` lived ONLY in each till's Dexie
-- database (see src/types/rawMaterial.ts: "local-only for now — no Supabase
-- sync"). That made inventory and fiche-technique data per-DEVICE: two tills
-- in the same restaurant kept separate ingredient stock and separate recipes,
-- and nothing survived a device reset. This migration promotes both to real
-- tenant-scoped tables with the same delta/upsert sync pair the catalogue uses.
--
-- SCOPE NOTE — tenant, not store. The catalogue is tenant-scoped today
-- (`docs/multi-tenant-plan.md` §698: devices pull the WHOLE tenant's catalog;
-- store-level filtering deferred). These tables follow that same rule so
-- inventory cannot end up scoped differently from the products it costs.
-- A `store_id` dimension is a separate, deliberate decision — when it lands it
-- must move products/categories/raw_materials/recipe_lines TOGETHER, or a
-- recipe could reference a product the till cannot see. Register D-TS1.
--
-- Mirrors the products pair (20260717000000 / 20260730000000):
--   * SECURITY DEFINER + `SET search_path = public`
--   * tenant taken from app.tenant_id(), never from the client payload
--   * REVOKE FROM PUBLIC, anon + GRANT authenticated
-- NO explicit BEGIN/COMMIT (CLI wraps the file in one transaction).
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) Tables
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.raw_materials (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id),
  name              text NOT NULL,
  unit              text NOT NULL,
  -- Cost is the tenant-level definition (what the ingredient is worth).
  -- STOCK IS DELIBERATELY ABSENT: an on-hand quantity is a physical fact about
  -- one building, so it lives in store_raw_materials (20260805000000).
  cost              numeric(14,4)  NOT NULL DEFAULT 0,
  supplier          text,
  is_active         boolean NOT NULL DEFAULT true,
  description       text,
  image_url         text,
  image_name        text,
  image_size        integer,
  -- Optional "sell this raw item directly in the POS" bridge.
  sell_enabled      boolean NOT NULL DEFAULT false,
  sale_price        numeric(14,4),
  sale_iva_rate     numeric(6,4),
  sale_category_id  uuid,
  linked_product_id uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  needs_push        boolean NOT NULL DEFAULT false,
  is_conflicted     boolean NOT NULL DEFAULT false
);

-- One ingredient line per (product, raw material): the quantity consumed per
-- unit sold. The pair is unique so a re-push updates instead of duplicating.
CREATE TABLE IF NOT EXISTS public.recipe_lines (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id),
  product_id        uuid NOT NULL,
  raw_material_id   uuid NOT NULL,
  quantity_per_unit numeric(14,4) NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  needs_push        boolean NOT NULL DEFAULT false,
  is_conflicted     boolean NOT NULL DEFAULT false
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'recipe_lines_tenant_product_material_key'
      AND conrelid = 'public.recipe_lines'::regclass
  ) THEN
    ALTER TABLE public.recipe_lines
      ADD CONSTRAINT recipe_lines_tenant_product_material_key
      UNIQUE (tenant_id, product_id, raw_material_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_raw_materials_tenant       ON public.raw_materials(tenant_id);
CREATE INDEX IF NOT EXISTS idx_raw_materials_tenant_upd   ON public.raw_materials(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_recipe_lines_tenant        ON public.recipe_lines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recipe_lines_tenant_upd    ON public.recipe_lines(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_recipe_lines_product       ON public.recipe_lines(tenant_id, product_id);

-- ---------------------------------------------------------------------
-- (2) RLS — tenant isolation. Reads/writes go through the SECURITY DEFINER
-- sync pair below, but the policies are the backstop for direct PostgREST
-- access from the PWA (which reads the catalogue that way already).
-- ---------------------------------------------------------------------
ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_lines  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS raw_materials_tenant_rw ON public.raw_materials;
CREATE POLICY raw_materials_tenant_rw ON public.raw_materials
  FOR ALL TO authenticated
  USING (tenant_id = app.tenant_id())
  WITH CHECK (tenant_id = app.tenant_id());

DROP POLICY IF EXISTS recipe_lines_tenant_rw ON public.recipe_lines;
CREATE POLICY recipe_lines_tenant_rw ON public.recipe_lines
  FOR ALL TO authenticated
  USING (tenant_id = app.tenant_id())
  WITH CHECK (tenant_id = app.tenant_id());

REVOKE ALL ON public.raw_materials FROM PUBLIC, anon;
REVOKE ALL ON public.recipe_lines  FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.raw_materials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipe_lines  TO authenticated;

-- ---------------------------------------------------------------------
-- (3) Sync pair — raw materials
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_raw_materials_delta(TIMESTAMPTZ);
CREATE FUNCTION public.get_raw_materials_delta(last_sync_timestamp TIMESTAMPTZ)
RETURNS TABLE (
  id uuid, name text, unit text, cost numeric,
  supplier text, is_active boolean, description text, image_url text,
  image_name text, image_size integer, sell_enabled boolean, sale_price numeric,
  sale_iva_rate numeric, sale_category_id uuid, linked_product_id uuid,
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
  SELECT m.id, m.name, m.unit, m.cost, m.supplier,
         m.is_active, m.description, m.image_url, m.image_name, m.image_size,
         m.sell_enabled, m.sale_price, m.sale_iva_rate, m.sale_category_id,
         m.linked_product_id, m.created_at, m.updated_at, m.deleted_at,
         COALESCE(m.needs_push, FALSE), COALESCE(m.is_conflicted, FALSE)
  FROM public.raw_materials m
  WHERE m.tenant_id = v_tenant
    AND m.updated_at > last_sync_timestamp
  ORDER BY m.updated_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_raw_materials_delta(TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_raw_materials_delta(TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_raw_materials(materials_data JSONB)
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
    SELECT * FROM jsonb_to_recordset(materials_data) AS x(
      id uuid, name text, unit text, cost numeric,
      supplier text, is_active boolean, description text, image_url text,
      image_name text, image_size integer, sell_enabled boolean, sale_price numeric,
      sale_iva_rate numeric, sale_category_id uuid, linked_product_id uuid,
      created_at timestamptz, updated_at timestamptz, deleted_at timestamptz
    )
  LOOP
    INSERT INTO public.raw_materials (
      id, tenant_id, name, unit, cost, supplier, is_active,
      description, image_url, image_name, image_size, sell_enabled, sale_price,
      sale_iva_rate, sale_category_id, linked_product_id, created_at, updated_at, deleted_at
    ) VALUES (
      r.id, v_tenant, r.name, COALESCE(r.unit,'pcs'), COALESCE(r.cost,0),
      r.supplier, COALESCE(r.is_active,true), r.description,
      r.image_url, r.image_name, r.image_size, COALESCE(r.sell_enabled,false), r.sale_price,
      r.sale_iva_rate, r.sale_category_id, r.linked_product_id,
      COALESCE(r.created_at, now()), COALESCE(r.updated_at, now()), r.deleted_at
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, unit = EXCLUDED.unit,
      cost = EXCLUDED.cost, supplier = EXCLUDED.supplier,
      is_active = EXCLUDED.is_active, description = EXCLUDED.description,
      image_url = EXCLUDED.image_url, image_name = EXCLUDED.image_name,
      image_size = EXCLUDED.image_size, sell_enabled = EXCLUDED.sell_enabled,
      sale_price = EXCLUDED.sale_price, sale_iva_rate = EXCLUDED.sale_iva_rate,
      sale_category_id = EXCLUDED.sale_category_id,
      linked_product_id = EXCLUDED.linked_product_id,
      updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at
      -- Tenant guard: a row id from another tenant is never adopted.
      WHERE public.raw_materials.tenant_id = v_tenant;

    upserted_count := upserted_count + 1;
  END LOOP;

  RETURN upserted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_raw_materials(JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_raw_materials(JSONB) TO authenticated;

-- ---------------------------------------------------------------------
-- (4) Sync pair — recipe lines
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_recipe_lines_delta(TIMESTAMPTZ);
CREATE FUNCTION public.get_recipe_lines_delta(last_sync_timestamp TIMESTAMPTZ)
RETURNS TABLE (
  id uuid, product_id uuid, raw_material_id uuid, quantity_per_unit numeric,
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
  SELECT l.id, l.product_id, l.raw_material_id, l.quantity_per_unit,
         l.created_at, l.updated_at, l.deleted_at,
         COALESCE(l.needs_push, FALSE), COALESCE(l.is_conflicted, FALSE)
  FROM public.recipe_lines l
  WHERE l.tenant_id = v_tenant
    AND l.updated_at > last_sync_timestamp
  ORDER BY l.updated_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_recipe_lines_delta(TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_recipe_lines_delta(TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_recipe_lines(lines_data JSONB)
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
    SELECT * FROM jsonb_to_recordset(lines_data) AS x(
      id uuid, product_id uuid, raw_material_id uuid, quantity_per_unit numeric,
      created_at timestamptz, updated_at timestamptz, deleted_at timestamptz
    )
  LOOP
    INSERT INTO public.recipe_lines (
      id, tenant_id, product_id, raw_material_id, quantity_per_unit,
      created_at, updated_at, deleted_at
    ) VALUES (
      r.id, v_tenant, r.product_id, r.raw_material_id, COALESCE(r.quantity_per_unit,0),
      COALESCE(r.created_at, now()), COALESCE(r.updated_at, now()), r.deleted_at
    )
    ON CONFLICT (id) DO UPDATE SET
      product_id = EXCLUDED.product_id,
      raw_material_id = EXCLUDED.raw_material_id,
      quantity_per_unit = EXCLUDED.quantity_per_unit,
      updated_at = EXCLUDED.updated_at,
      deleted_at = EXCLUDED.deleted_at
      WHERE public.recipe_lines.tenant_id = v_tenant;

    upserted_count := upserted_count + 1;
  END LOOP;

  RETURN upserted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_recipe_lines(JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_recipe_lines(JSONB) TO authenticated;
