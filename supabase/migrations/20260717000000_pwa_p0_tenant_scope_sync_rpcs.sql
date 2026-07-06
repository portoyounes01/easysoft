-- =====================================================================
-- Tenant-scope the leaking sync RPCs + REVOKE EXECUTE FROM PUBLIC/anon
-- Branch: pwa   |   REGISTER item: D14   |   Plan: docs/pwa-plan.md §4.2 / §4.3
--
-- WHY (docs/pwa-plan.md §4.3, "Tenant isolation for human accounts — fix the
-- leaking sync RPCs, and REVOKE FROM PUBLIC"): the delta/upsert sync RPCs were
-- SECURITY DEFINER, bypassed RLS, and self-enforced NO tenant. A human JWT in
-- tenant B could rpc('get_products_delta') to read tenant A's catalog,
-- rpc('upsert_products') to overwrite tenant A rows by sku, or
-- rpc('upsert_transaction_with_items') to forge/delete rows cross-tenant.
-- Per §4.2 (the HARD fiscal constraint) upsert_transaction_with_items is the
-- most dangerous: it writes the fiscal-linkage columns and DELETEs items with
-- no tenant check, so it is additionally locked to app_role='device'.
--
-- WHAT this migration does, uniformly, to all 9 sync RPCs:
--   * Derive tenant from the caller's JWT via app.tenant_id()
--     (app_metadata.tenant_id; server-controlled — 20260707000000). NULL claim
--     => RAISE 'no_tenant_context' (SQLSTATE 28000): unauthenticated / anon /
--     tenant-less sessions now fail CLOSED instead of reading or writing across
--     tenants.
--   * Scope every read to WHERE <table>.tenant_id = v_tenant.
--   * Stamp tenant_id = v_tenant on every INSERT (client input never carries a
--     trusted tenant_id), scope every ON CONFLICT DO UPDATE / DELETE to the
--     caller's tenant, and preserve the existing last-write-wins guards.
--   * upsert_transaction_with_items additionally requires app_role='device'.
--
-- Signatures and RETURNS shapes are BYTE-FOR-BYTE preserved (no tenant_id added
-- to any output), so every function applies via CREATE OR REPLACE WITHOUT a
-- DROP and the PostgREST client contract is unchanged. All functions keep
-- SECURITY DEFINER and add SET search_path = public (app.* helpers are called
-- schema-qualified, so they still resolve). RLS bypass is intentional — the
-- in-body v_tenant filter is now the enforcement boundary (FORCE RLS is
-- deferred, REGISTER D1 / §4.2 Layer 6).
--
-- GRANTS (docs/pwa-plan.md §4.3 + REGISTER D14/D12): every RPC is locked to the
-- `authenticated` role. Genesis (20250101000000 line 1226) ran
--   GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
-- which placed an EXPLICIT per-function anon EXECUTE grant on every genesis
-- function. CREATE OR REPLACE PRESERVES ACLs (only DROP+CREATE resets them), so
-- these functions still carry that explicit anon grant. REVOKE ... FROM PUBLIC
-- removes only the implicit PUBLIC default — it does NOT remove a role-specific
-- grant — so we REVOKE ... FROM PUBLIC, anon and then GRANT ... TO authenticated.
-- (ping() stays anon — heartbeat, 20250803000000 — and is not in this set.)
--
-- NO explicit BEGIN/COMMIT: `supabase db push` wraps this whole migration in a
-- single transaction; an inner COMMIT would break atomicity. The BEGIN/EXCEPTION
-- blocks inside the upsert functions are plpgsql statement-level error handling,
-- not transaction control.
--
-- CANNOT be tested pre-deploy (no local anon key / second tenant here); the
-- post-deploy verification checklist is at the END of this file.
-- =====================================================================


-- =====================================================================
-- GROUP 1 — PRODUCTS (get_products_delta, upsert_products)
-- Baseline: 20250101000000_genesis_baseline.sql (D.9 lines 741-780, D.11 827-887)
-- =====================================================================

-- (D.9) get_products_delta(TIMESTAMPTZ) — SECURITY DEFINER, tenant-scoped
CREATE OR REPLACE FUNCTION public.get_products_delta(last_sync_timestamp TIMESTAMPTZ DEFAULT '1970-01-01'::TIMESTAMPTZ)
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
  stock INTEGER,
  min_stock INTEGER,
  track_stock BOOLEAN,
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

-- (D.11) upsert_products(JSONB) — SECURITY DEFINER, tenant-scoped
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
      iva_rate NUMERIC, stock INTEGER, min_stock INTEGER, track_stock BOOLEAN,
      image_url TEXT, supplier TEXT, location TEXT, is_active BOOLEAN,
      display_order INTEGER, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ, needs_push BOOLEAN, is_conflicted BOOLEAN
    )
  LOOP
    INSERT INTO public.products (
      id, tenant_id, name, description, sku, barcode, category_id, category_name,
      price, cost, iva_rate, stock, min_stock, track_stock, image_url,
      supplier, location, is_active, display_order, created_at, updated_at,
      deleted_at, needs_push, is_conflicted
    ) VALUES (
      product_record.id, v_tenant, product_record.name, product_record.description,
      product_record.sku, product_record.barcode, product_record.category_id,
      product_record.category_name, product_record.price, product_record.cost,
      product_record.iva_rate, product_record.stock, product_record.min_stock,
      product_record.track_stock, product_record.image_url, product_record.supplier,
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

-- Grants (REVIEW FIX applied): genesis line 1226 granted EXECUTE explicitly to
-- anon (GRANT ALL ON ALL FUNCTIONS ... TO anon, authenticated). Both functions
-- were only ever CREATE OR REPLACE'd (never DROP+CREATE), and CREATE OR REPLACE
-- preserves the ACL, so they STILL carry that explicit anon grant. REVOKE ...
-- FROM PUBLIC removes only the implicit PUBLIC default, NOT the role-specific
-- anon grant — so anon must be revoked BY NAME.
REVOKE EXECUTE ON FUNCTION public.get_products_delta(TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_products_delta(TIMESTAMPTZ) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.upsert_products(JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_products(JSONB) TO authenticated;


-- =====================================================================
-- GROUP 2 — CATEGORIES (get_categories_delta, upsert_categories)
-- Baseline: 20250101000000_genesis_baseline.sql (D.8, D.10)
-- categories has only a GLOBAL PK on id (no UNIQUE(tenant_id, id) — phase1
-- intentionally omitted it), so ON CONFLICT (id) is the correct arbiter and a
-- cross-tenant id is rejected up front with an explicit RAISE.
-- =====================================================================

-- (D.8) Category roster pull. Tenant comes from the JWT, never from a param.
CREATE OR REPLACE FUNCTION public.get_categories_delta(last_sync_timestamp TIMESTAMPTZ DEFAULT '1970-01-01'::TIMESTAMPTZ)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  color TEXT,
  icon TEXT,
  display_order INTEGER,
  is_active BOOLEAN,
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
    c.id, c.name, c.description, c.color, c.icon, c.display_order,
    c.is_active, c.created_at, c.updated_at, c.deleted_at,
    COALESCE(c.needs_push, FALSE) AS needs_push,
    COALESCE(c.is_conflicted, FALSE) AS is_conflicted
  FROM public.categories c
  WHERE c.tenant_id = v_tenant
    AND c.updated_at > last_sync_timestamp
  ORDER BY c.updated_at ASC;
END;
$$;

-- (D.10) Category writes. Every inserted row is stamped with the caller's
-- tenant; the conflict update is confined to the caller's tenant. The original
-- Last-Write-Wins guard is preserved; that guard makes "conflict returned no
-- row" ambiguous (stale-skip vs cross-tenant), so cross-tenant detection uses
-- an explicit pre-check rather than RETURNING.
CREATE OR REPLACE FUNCTION public.upsert_categories(categories_data JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  category_record RECORD;
  upserted_count INTEGER := 0;
  v_tenant uuid := app.tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'no_tenant_context' USING ERRCODE = '28000';
  END IF;

  FOR category_record IN
    SELECT * FROM jsonb_to_recordset(categories_data) AS x(
      id UUID, name TEXT, description TEXT, color TEXT, icon TEXT,
      display_order INTEGER, is_active BOOLEAN, created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ, needs_push BOOLEAN,
      is_conflicted BOOLEAN
    )
  LOOP
    -- Reject an id that already belongs to another tenant before touching it.
    -- (The tenant filter on the ON CONFLICT below would silently drop the
    -- write anyway; this surfaces the collision loudly instead.)
    IF EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = category_record.id
        AND c.tenant_id <> v_tenant
    ) THEN
      RAISE EXCEPTION 'cross_tenant_category_conflict';
    END IF;

    INSERT INTO public.categories (
      id, tenant_id, name, description, color, icon, display_order, is_active,
      created_at, updated_at, deleted_at, needs_push, is_conflicted
    ) VALUES (
      category_record.id, v_tenant, category_record.name, category_record.description,
      category_record.color, category_record.icon, category_record.display_order,
      category_record.is_active, category_record.created_at, category_record.updated_at,
      category_record.deleted_at, COALESCE(category_record.needs_push, FALSE),
      COALESCE(category_record.is_conflicted, FALSE)
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      color = EXCLUDED.color,
      icon = EXCLUDED.icon,
      display_order = EXCLUDED.display_order,
      is_active = EXCLUDED.is_active,
      updated_at = EXCLUDED.updated_at,
      deleted_at = EXCLUDED.deleted_at,
      needs_push = EXCLUDED.needs_push,
      is_conflicted = EXCLUDED.is_conflicted
    WHERE public.categories.tenant_id = v_tenant
      AND public.categories.updated_at < EXCLUDED.updated_at;

    upserted_count := upserted_count + 1;
  END LOOP;

  RETURN upserted_count;
END;
$$;

-- Grants: genesis granted EXECUTE directly to anon (line 1226), so REVOKE FROM
-- PUBLIC alone would leave anon able to call these — revoke FROM PUBLIC, anon.
REVOKE EXECUTE ON FUNCTION public.get_categories_delta(timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_categories_delta(timestamptz) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.upsert_categories(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_categories(jsonb) TO authenticated;


-- =====================================================================
-- GROUP 3 — CUSTOMERS (get_customers_delta, upsert_customers)
-- Baseline: 20260420140000_customers_city_postal.sql (latest defs)
-- get_customers_delta had an EXPLICIT anon grant added in
-- 20260705000000_phase0_hardening.sql (line 292) — revoked by name below.
-- =====================================================================

-- get_customers_delta: tenant-scoped roster pull. Return shape (18 cols, no
-- tenant_id) is kept exactly; only a WHERE c.tenant_id = v_tenant is added to
-- both branches. Requires an authenticated tenant context (raises otherwise).
CREATE OR REPLACE FUNCTION public.get_customers_delta(since_timestamp TIMESTAMPTZ DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    name TEXT,
    tax_number TEXT,
    country TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    postal_code TEXT,
    total_spent DECIMAL(10,2),
    transaction_count INTEGER,
    loyalty_points INTEGER,
    is_active BOOLEAN,
    preferred_payment_method TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
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

    IF since_timestamp IS NULL THEN
        RETURN QUERY
        SELECT
            c.id,
            c.name,
            c.tax_number,
            c.country,
            c.email,
            c.phone,
            c.address,
            c.city,
            c.postal_code,
            c.total_spent,
            c.transaction_count,
            c.loyalty_points,
            c.is_active,
            c.preferred_payment_method,
            c.created_at,
            c.updated_at,
            c.last_synced_at,
            c.deleted_at
        FROM public.customers c
        WHERE c.tenant_id = v_tenant
        ORDER BY c.updated_at DESC
        LIMIT 1000;
    ELSE
        RETURN QUERY
        SELECT
            c.id,
            c.name,
            c.tax_number,
            c.country,
            c.email,
            c.phone,
            c.address,
            c.city,
            c.postal_code,
            c.total_spent,
            c.transaction_count,
            c.loyalty_points,
            c.is_active,
            c.preferred_payment_method,
            c.created_at,
            c.updated_at,
            c.last_synced_at,
            c.deleted_at
        FROM public.customers c
        WHERE c.tenant_id = v_tenant
          AND c.updated_at > since_timestamp
        ORDER BY c.updated_at DESC
        LIMIT 1000;
    END IF;
END;
$$;

-- upsert_customers: tenant-scoped writes. The per-row (id, success, error)
-- contract and last-write-wins conflict resolution are preserved. tenant_id is
-- stamped on INSERT and enforced on UPDATE; an id already owned by another
-- tenant is rejected per-row (never written/updated across tenants).
CREATE OR REPLACE FUNCTION public.upsert_customers(customers_data JSONB)
RETURNS TABLE (
    id UUID,
    success BOOLEAN,
    error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    customer_record JSONB;
    customer_id UUID;
    result_id UUID;
    result_success BOOLEAN;
    result_error TEXT;
    v_tenant uuid := app.tenant_id();
BEGIN
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'no_tenant_context' USING ERRCODE = '28000';
    END IF;

    FOR customer_record IN SELECT * FROM jsonb_array_elements(customers_data)
    LOOP
        BEGIN
            customer_id := (customer_record->>'id')::UUID;

            -- Refuse to touch a row whose id belongs to another tenant. The PK
            -- is on id alone, so without this guard an ON CONFLICT (id) DO
            -- UPDATE filtered by tenant would silently no-op on a foreign row.
            IF EXISTS (
                SELECT 1 FROM public.customers c
                WHERE c.id = customer_id AND c.tenant_id <> v_tenant
            ) THEN
                RAISE EXCEPTION 'cross_tenant_customer_conflict';
            END IF;

            INSERT INTO public.customers (
                id,
                tenant_id,
                name,
                tax_number,
                country,
                email,
                phone,
                address,
                city,
                postal_code,
                total_spent,
                transaction_count,
                loyalty_points,
                is_active,
                preferred_payment_method,
                created_at,
                updated_at,
                deleted_at
            ) VALUES (
                customer_id,
                v_tenant,
                customer_record->>'name',
                NULLIF(customer_record->>'tax_number', ''),
                COALESCE(NULLIF(customer_record->>'country', ''), 'PT'),
                customer_record->>'email',
                customer_record->>'phone',
                customer_record->>'address',
                NULLIF(customer_record->>'city', ''),
                NULLIF(customer_record->>'postal_code', ''),
                COALESCE((customer_record->>'total_spent')::DECIMAL(10,2), 0),
                COALESCE((customer_record->>'transaction_count')::INTEGER, 0),
                COALESCE((customer_record->>'loyalty_points')::INTEGER, 0),
                COALESCE((customer_record->>'is_active')::BOOLEAN, true),
                customer_record->>'preferred_payment_method',
                COALESCE((customer_record->>'created_at')::TIMESTAMPTZ, NOW()),
                COALESCE((customer_record->>'updated_at')::TIMESTAMPTZ, NOW()),
                CASE WHEN customer_record->>'deleted_at' IS NOT NULL
                     THEN (customer_record->>'deleted_at')::TIMESTAMPTZ
                     ELSE NULL END
            )
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                tax_number = EXCLUDED.tax_number,
                country = EXCLUDED.country,
                email = EXCLUDED.email,
                phone = EXCLUDED.phone,
                address = EXCLUDED.address,
                city = EXCLUDED.city,
                postal_code = EXCLUDED.postal_code,
                total_spent = EXCLUDED.total_spent,
                transaction_count = EXCLUDED.transaction_count,
                loyalty_points = EXCLUDED.loyalty_points,
                is_active = EXCLUDED.is_active,
                preferred_payment_method = EXCLUDED.preferred_payment_method,
                updated_at = EXCLUDED.updated_at,
                deleted_at = EXCLUDED.deleted_at
            WHERE customers.tenant_id = v_tenant
              AND customers.updated_at <= EXCLUDED.updated_at;

            result_id := customer_id;
            result_success := true;
            result_error := NULL;

        EXCEPTION
            WHEN OTHERS THEN
                result_id := customer_id;
                result_success := false;
                result_error := SQLERRM;
        END;

        id := result_id;
        success := result_success;
        error := result_error;
        RETURN NEXT;
    END LOOP;

    RETURN;
END;
$$;

-- Grants: get_customers_delta carries an EXPLICIT anon grant from genesis line
-- 1226 AND from 20260705000000_phase0_hardening.sql (line 292). REVOKE FROM
-- PUBLIC does NOT remove a role-specific grant, so anon must be revoked by name.
REVOKE EXECUTE ON FUNCTION public.get_customers_delta(timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customers_delta(timestamptz) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_customers_delta(timestamptz) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.upsert_customers(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_customers(jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.upsert_customers(jsonb) TO authenticated;


-- =====================================================================
-- GROUP 4 — TRANSACTIONS (read): get_transactions_delta, get_transaction_items_delta
-- Baseline: 20250101000000_genesis_baseline.sql (D.2 lines 431-450, D.3 453-471)
-- Read-only SELECT-returning RPCs; no INSERT/UPDATE/DELETE, so only a tenant
-- filter is added. transaction_items is scoped by its OWN denormalized
-- tenant_id column (phase1 20260706000000:221), never by joining transactions.
-- =====================================================================

-- (D.2) get_transactions_delta — scope returned rows to the caller's tenant.
CREATE OR REPLACE FUNCTION public.get_transactions_delta(
  last_sync_timestamp TIMESTAMPTZ DEFAULT '1970-01-01'::TIMESTAMPTZ
)
RETURNS TABLE (
  id UUID, transaction_number TEXT, employee_id UUID, employee_name TEXT,
  customer_id UUID, customer_name TEXT, transaction_date DATE, transaction_time TIME,
  subtotal NUMERIC, discount NUMERIC, tax NUMERIC, total NUMERIC,
  payment_method TEXT, amount_paid NUMERIC, change_given NUMERIC, status TEXT,
  notes TEXT, receipt_number TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ
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
    t.id, t.transaction_number, t.employee_id, t.employee_name, t.customer_id, t.customer_name,
    t.transaction_date, t.transaction_time, t.subtotal, t.discount, t.tax, t.total,
    t.payment_method, t.amount_paid, t.change_given, t.status, t.notes, t.receipt_number,
    t.created_at, t.updated_at, t.deleted_at
  FROM public.transactions t
  WHERE t.tenant_id = v_tenant
    AND t.updated_at > last_sync_timestamp
  ORDER BY t.updated_at ASC;
END;
$$;

-- (D.3) get_transaction_items_delta — scope by the item's OWN denormalized
-- tenant_id column (added in 20260706000000_phase1_multitenant.sql), so RLS/
-- filtering never has to join back to transactions.
CREATE OR REPLACE FUNCTION public.get_transaction_items_delta(
  last_sync_timestamp TIMESTAMPTZ DEFAULT '1970-01-01'::TIMESTAMPTZ
)
RETURNS TABLE (
  id UUID, transaction_id UUID, product_id UUID, product_name TEXT, product_sku TEXT,
  category_id UUID, category_name TEXT, quantity INTEGER, unit_price NUMERIC, unit_cost NUMERIC,
  iva_rate NUMERIC, line_total NUMERIC, tax_amount NUMERIC, profit_amount NUMERIC,
  discount_amount NUMERIC, discount_percentage NUMERIC, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ
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
    ti.id, ti.transaction_id, ti.product_id, ti.product_name, ti.product_sku,
    ti.category_id, ti.category_name, ti.quantity, ti.unit_price, ti.unit_cost,
    ti.iva_rate, ti.line_total, ti.tax_amount, ti.profit_amount,
    ti.discount_amount, ti.discount_percentage, ti.created_at, ti.updated_at, ti.deleted_at
  FROM public.transaction_items ti
  WHERE ti.tenant_id = v_tenant
    AND ti.updated_at > last_sync_timestamp
  ORDER BY ti.updated_at ASC;
END;
$$;

-- Grants (REVIEW FIX applied): both functions are defined only in genesis and
-- were only ever CREATE OR REPLACE'd, so they STILL carry the explicit anon
-- EXECUTE grant from genesis line 1226 (ACL preserved by CREATE OR REPLACE;
-- phase3 20260715 revoked only TABLE/SEQUENCE grants, not these functions).
-- REVOKE FROM PUBLIC does NOT strip the role-specific anon grant — revoke anon
-- by name.
REVOKE EXECUTE ON FUNCTION public.get_transactions_delta(timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_transactions_delta(timestamptz) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_transaction_items_delta(timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_transaction_items_delta(timestamptz) TO authenticated;


-- =====================================================================
-- GROUP 5 — upsert_transaction_with_items (device-only fiscal sync write RPC)
-- Baseline: 20260705000000_phase0_hardening.sql (S17 patch, lines 75-289).
-- The most dangerous sync RPC (docs/pwa-plan.md §4.2 Layer 4): SECURITY DEFINER,
-- writes fiscal-linkage columns, DELETEs items. Hardened with tenant scoping on
-- EVERY statement AND an app_role='device' guard — humans/managers must never
-- write the fiscal transaction ledger.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.upsert_transaction_with_items(
    transaction_data JSONB,
    items_data JSONB
)
RETURNS TABLE (
    transaction_id UUID,
    success BOOLEAN,
    error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    txn_id UUID;
    item_record JSONB;
    result_success BOOLEAN := true;
    result_error TEXT := NULL;
    existing_fiscal_document_id TEXT;
    v_tenant UUID := app.tenant_id();
    v_role TEXT := app.app_role();
BEGIN
    -- Tenant + device guards run BEFORE the inner exception block so a
    -- security violation is a hard, propagated error (proper SQLSTATE), never
    -- swallowed into a success=false result row.
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'no_tenant_context' USING ERRCODE = '28000';
    END IF;

    IF v_role IS DISTINCT FROM 'device' THEN
        RAISE EXCEPTION 'device_session_required' USING ERRCODE = '42501';
    END IF;

    BEGIN
        txn_id := (transaction_data->>'id')::UUID;

        -- S17 skip-sealed guard (server row only, this tenant only).
        SELECT t.fiscal_document_id
          INTO existing_fiscal_document_id
          FROM transactions t
         WHERE t.id = txn_id
           AND t.tenant_id = v_tenant;

        IF existing_fiscal_document_id IS NOT NULL THEN
            UPDATE transactions
               SET fiscal_cancelled_at =
                       COALESCE(
                           CASE WHEN transaction_data->>'fiscal_cancelled_at' IS NOT NULL
                                THEN (transaction_data->>'fiscal_cancelled_at')::TIMESTAMPTZ
                                ELSE NULL END,
                           fiscal_cancelled_at),
                   fiscal_cancelled_reason =
                       COALESCE(NULLIF(transaction_data->>'fiscal_cancelled_reason', ''),
                                fiscal_cancelled_reason),
                   fiscal_cancelled_by_employee_id =
                       COALESCE(
                           CASE WHEN transaction_data->>'fiscal_cancelled_by_employee_id' IS NOT NULL
                                THEN (transaction_data->>'fiscal_cancelled_by_employee_id')::UUID
                                ELSE NULL END,
                           fiscal_cancelled_by_employee_id),
                   last_synced_at = NOW()
             WHERE id = txn_id
               AND tenant_id = v_tenant;

            transaction_id := txn_id;
            success := true;
            error := NULL;
            RETURN NEXT;
            RETURN;
        END IF;

        INSERT INTO transactions (
            id,
            tenant_id,
            transaction_number,
            employee_id,
            employee_name,
            customer_id,
            customer_name,
            transaction_date,
            transaction_time,
            subtotal,
            discount,
            tax,
            total,
            payment_method,
            amount_paid,
            change_given,
            status,
            notes,
            receipt_number,
            fiscal_document_id,
            fiscal_metadata_json,
            fiscal_cancelled_at,
            fiscal_cancelled_reason,
            fiscal_cancelled_by_employee_id,
            created_at,
            updated_at,
            deleted_at
        ) VALUES (
            txn_id,
            v_tenant,
            transaction_data->>'transaction_number',
            (transaction_data->>'employee_id')::UUID,
            transaction_data->>'employee_name',
            CASE WHEN transaction_data->>'customer_id' IS NOT NULL
                 THEN (transaction_data->>'customer_id')::UUID
                 ELSE NULL END,
            transaction_data->>'customer_name',
            (transaction_data->>'transaction_date')::DATE,
            (transaction_data->>'transaction_time')::TIME,
            (transaction_data->>'subtotal')::DECIMAL(10,2),
            COALESCE((transaction_data->>'discount')::DECIMAL(10,2), 0),
            (transaction_data->>'tax')::DECIMAL(10,2),
            (transaction_data->>'total')::DECIMAL(10,2),
            transaction_data->>'payment_method',
            CASE WHEN transaction_data->>'amount_paid' IS NOT NULL
                 THEN (transaction_data->>'amount_paid')::DECIMAL(10,2)
                 ELSE NULL END,
            COALESCE((transaction_data->>'change_given')::DECIMAL(10,2), 0),
            transaction_data->>'status',
            transaction_data->>'notes',
            transaction_data->>'receipt_number',
            transaction_data->>'fiscal_document_id',
            transaction_data->'fiscal_metadata_json',
            CASE WHEN transaction_data->>'fiscal_cancelled_at' IS NOT NULL
                 THEN (transaction_data->>'fiscal_cancelled_at')::TIMESTAMPTZ
                 ELSE NULL END,
            NULLIF(transaction_data->>'fiscal_cancelled_reason', ''),
            CASE WHEN transaction_data->>'fiscal_cancelled_by_employee_id' IS NOT NULL
                 THEN (transaction_data->>'fiscal_cancelled_by_employee_id')::UUID
                 ELSE NULL END,
            COALESCE((transaction_data->>'created_at')::TIMESTAMPTZ, NOW()),
            COALESCE((transaction_data->>'updated_at')::TIMESTAMPTZ, NOW()),
            CASE WHEN transaction_data->>'deleted_at' IS NOT NULL
                 THEN (transaction_data->>'deleted_at')::TIMESTAMPTZ
                 ELSE NULL END
        )
        ON CONFLICT (id) DO UPDATE SET
            employee_id = EXCLUDED.employee_id,
            employee_name = EXCLUDED.employee_name,
            customer_id = EXCLUDED.customer_id,
            customer_name = EXCLUDED.customer_name,
            subtotal = EXCLUDED.subtotal,
            discount = EXCLUDED.discount,
            tax = EXCLUDED.tax,
            total = EXCLUDED.total,
            payment_method = EXCLUDED.payment_method,
            amount_paid = EXCLUDED.amount_paid,
            change_given = EXCLUDED.change_given,
            status = EXCLUDED.status,
            notes = EXCLUDED.notes,
            receipt_number = EXCLUDED.receipt_number,
            fiscal_document_id = COALESCE(EXCLUDED.fiscal_document_id, transactions.fiscal_document_id),
            fiscal_metadata_json = COALESCE(EXCLUDED.fiscal_metadata_json, transactions.fiscal_metadata_json),
            fiscal_cancelled_at = COALESCE(EXCLUDED.fiscal_cancelled_at, transactions.fiscal_cancelled_at),
            fiscal_cancelled_reason = COALESCE(EXCLUDED.fiscal_cancelled_reason, transactions.fiscal_cancelled_reason),
            fiscal_cancelled_by_employee_id = COALESCE(EXCLUDED.fiscal_cancelled_by_employee_id, transactions.fiscal_cancelled_by_employee_id),
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE transactions.tenant_id = v_tenant
          AND transactions.updated_at <= EXCLUDED.updated_at;

        DELETE FROM transaction_items
        WHERE transaction_id = txn_id
          AND tenant_id = v_tenant;

        FOR item_record IN SELECT * FROM jsonb_array_elements(items_data)
        LOOP
            INSERT INTO transaction_items (
                id,
                tenant_id,
                transaction_id,
                product_id,
                product_name,
                product_sku,
                category_id,
                category_name,
                quantity,
                unit_price,
                unit_cost,
                iva_rate,
                line_total,
                tax_amount,
                profit_amount,
                discount_amount,
                discount_percentage,
                created_at,
                updated_at,
                deleted_at
            ) VALUES (
                (item_record->>'id')::UUID,
                v_tenant,
                txn_id,
                (item_record->>'product_id')::UUID,
                item_record->>'product_name',
                item_record->>'product_sku',
                CASE WHEN item_record->>'category_id' IS NOT NULL
                     THEN (item_record->>'category_id')::UUID
                     ELSE NULL END,
                item_record->>'category_name',
                (item_record->>'quantity')::INTEGER,
                (item_record->>'unit_price')::DECIMAL(10,2),
                (item_record->>'unit_cost')::DECIMAL(10,2),
                (item_record->>'iva_rate')::DECIMAL(5,4),
                (item_record->>'line_total')::DECIMAL(10,2),
                (item_record->>'tax_amount')::DECIMAL(10,2),
                COALESCE((item_record->>'profit_amount')::DECIMAL(10,2), 0),
                COALESCE((item_record->>'discount_amount')::DECIMAL(10,2), 0),
                COALESCE((item_record->>'discount_percentage')::DECIMAL(5,2), 0),
                COALESCE((item_record->>'created_at')::TIMESTAMPTZ, NOW()),
                COALESCE((item_record->>'updated_at')::TIMESTAMPTZ, NOW()),
                CASE WHEN item_record->>'deleted_at' IS NOT NULL
                     THEN (item_record->>'deleted_at')::TIMESTAMPTZ
                     ELSE NULL END
            );
        END LOOP;

        result_success := true;
        result_error := NULL;

    EXCEPTION
        WHEN OTHERS THEN
            result_success := false;
            result_error := SQLERRM;
    END;

    transaction_id := txn_id;
    success := result_success;
    error := result_error;
    RETURN NEXT;

    RETURN;
END;
$$;

-- Grants: this function carried an EXPLICIT anon grant (phase0 20260705000000
-- line 289: "TO anon, authenticated"), which REVOKE FROM PUBLIC does NOT remove
-- — so anon is revoked by name. The in-body app_role guard further restricts
-- authenticated callers to device sessions.
REVOKE EXECUTE ON FUNCTION public.upsert_transaction_with_items(jsonb, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_transaction_with_items(jsonb, jsonb) TO authenticated;


-- =====================================================================
-- POST-DEPLOY VERIFICATION (cannot be tested pre-deploy — no local anon key /
-- second tenant in this environment; run these against the deployed project).
-- Ref: docs/pwa-plan.md §4.3, REGISTER D14/D12/D7.
--
-- 1) ANON LOCKDOWN (grant): with ONLY the anon apikey (no Authorization bearer),
--    each RPC must return permission-denied (HTTP 401/403, PostgREST 42501),
--    NOT 200. Before this migration these returned 200 (empty read / 0-count
--    write). Probe every RPC:
--      get_products_delta, upsert_products,
--      get_categories_delta, upsert_categories,
--      get_customers_delta, upsert_customers,
--      get_transactions_delta, get_transaction_items_delta,
--      upsert_transaction_with_items
--    e.g.:
--      curl -sS -X POST "$SUPABASE_URL/rest/v1/rpc/get_products_delta" \
--        -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d '{}'
--    EXPECT: 401/403 permission denied for function (NOT 200 []).
--    (ping() must STILL be anon-callable — it is the heartbeat, intentionally
--    left granted; confirm it still returns 200.)
--
-- 2) NO-TENANT FAIL-CLOSED: with an AUTHENTICATED JWT that has NO
--    app_metadata.tenant_id, each RPC must RAISE no_tenant_context (SQLSTATE
--    28000), surfaced by PostgREST as an error — NOT rows / NOT a 0-count.
--
-- 3) CROSS-TENANT READ PROBE: as an authenticated user of tenant B, call each
--    get_*_delta. EXPECT: only tenant-B rows; ZERO tenant-A rows. Seed a known
--    tenant-A row first and assert it is absent from tenant B's result.
--
-- 4) CROSS-TENANT WRITE PROBE: as tenant B, upsert_products with an sku that
--    exists under tenant A, and upsert_categories / upsert_customers /
--    upsert_transaction_with_items with an id that exists under tenant A.
--    EXPECT: tenant A's rows are UNCHANGED. upsert_categories / upsert_customers
--    return cross_tenant_*_conflict for the colliding id; upsert_products keeps
--    A's row intact (composite (tenant_id, sku) arbiter).
--
-- 5) DEVICE-ONLY WRITE (fiscal): call upsert_transaction_with_items with a
--    NON-device JWT (app_role manager/staff/human). EXPECT: device_session_required
--    (SQLSTATE 42501), no write. With a device JWT of the same tenant it must
--    succeed and stamp tenant_id = the device's tenant.
--
-- 6) REGRESSION: an authenticated, tenant-bearing session syncs normally
--    (products/categories/customers/transactions read+write round-trip) — the
--    hardening must not break the legitimate device/human sync path.
-- =====================================================================
