-- =====================================================================
-- WEIGHT-BASED PRODUCTS (sell-by-weight, CAS scale integration Phase B)
-- Register: docs/REGISTER.md D-SC1. Decisions (user, 2026-07-13):
--   * 3 decimals end-to-end (scale reads 0.005 kg graduations),
--   * stock fully tracked in kg for weighed products,
--   * daily summary items_sold sums quantity as-is (kg for weighed lines,
--     units for unit lines — mixed by design),
--   * one cart/receipt line per weighing (client-side concern).
--
-- ⛔ ORDERING CONSTRAINT: this migration MUST be applied (staging + prod)
-- BEFORE any till ships the Phase B client. A fractional quantity against the
-- old ::INTEGER cast makes upsert_transaction_with_items raise, its swallow-all
-- handler returns success=false, and the sale strands in the sync outbox.
--
-- Contents:
--   (1) drop dependent views (they block ALTER COLUMN TYPE), recreate in (5)
--   (2) column changes: products.sold_by_weight + stock/min_stock -> NUMERIC,
--       transaction_items.quantity -> NUMERIC, daily_sales_summary.items_sold -> NUMERIC
--   (3) sync RPCs: get_products_delta / get_transaction_items_delta recreated
--       (RETURNS TABLE shape changes => DROP+CREATE => ACL reset => re-apply
--       the 20260717000000 grant hygiene: REVOKE PUBLIC/anon BY NAME, GRANT
--       authenticated); upsert_products / upsert_transaction_with_items
--       replaced in place (signatures unchanged, ACL preserved)
--   (4) assistant RPCs whose ::bigint casts would round kg -> numeric returns
--       (DROP+CREATE + service_role-only grants, same as 20260729000000)
--   (5) recreate the views (products views pick up sold_by_weight via p.*)
-- NO explicit BEGIN/COMMIT (CLI wraps the file in one transaction).
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) Views blocking the type changes. low_stock_products reads
-- active_products_with_categories (nested), so it goes first.
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS public.low_stock_products;
DROP VIEW IF EXISTS public.active_products_with_categories;
DROP VIEW IF EXISTS public.transaction_details;

-- ---------------------------------------------------------------------
-- (2) Column changes
-- ---------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sold_by_weight BOOLEAN NOT NULL DEFAULT false;

-- Weighed products track stock in kg (user decision: fully working in v1).
ALTER TABLE public.products
  ALTER COLUMN stock TYPE NUMERIC(12, 3),
  ALTER COLUMN min_stock TYPE NUMERIC(12, 3);

-- CHECK (quantity > 0) survives the type change and still rejects a 0.000 kg line.
ALTER TABLE public.transaction_items
  ALTER COLUMN quantity TYPE NUMERIC(12, 3);

-- The sold line remembers its unit forever (the product's flag can change
-- later; SAF-T UnitOfMeasure and receipt reprints must reflect the sale).
ALTER TABLE public.transaction_items
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'un'
    CONSTRAINT transaction_items_unit_check CHECK (unit IN ('un', 'kg'));

-- items_sold now sums kg for weighed lines + units for unit lines (decision:
-- kg semantics; the maintenance trigger update_daily_sales_summary needs no
-- change — SUM(quantity) lands in the wider column without rounding).
ALTER TABLE public.daily_sales_summary
  ALTER COLUMN items_sold TYPE NUMERIC(14, 3);

-- ---------------------------------------------------------------------
-- (3a) get_products_delta — RETURNS TABLE gains sold_by_weight and the stock
-- columns go NUMERIC => return-shape change => DROP + CREATE (CREATE OR
-- REPLACE cannot change a result type). Fresh functions default to PUBLIC
-- EXECUTE, so the revokes below are load-bearing, not ceremony.
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
-- (3b) upsert_products — same signature (JSONB->INTEGER), replaced in place
-- (ACL preserved). Old tills that predate Phase B send payloads WITHOUT
-- sold_by_weight; the CASE in DO UPDATE keeps the server value instead of
-- clobbering a weighed product back to unit on their next push.
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
      image_url TEXT, supplier TEXT, location TEXT, is_active BOOLEAN,
      display_order INTEGER, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ, needs_push BOOLEAN, is_conflicted BOOLEAN
    )
  LOOP
    INSERT INTO public.products (
      id, tenant_id, name, description, sku, barcode, category_id, category_name,
      price, cost, iva_rate, stock, min_stock, track_stock, sold_by_weight,
      image_url, supplier, location, is_active, display_order, created_at,
      updated_at, deleted_at, needs_push, is_conflicted
    ) VALUES (
      product_record.id, v_tenant, product_record.name, product_record.description,
      product_record.sku, product_record.barcode, product_record.category_id,
      product_record.category_name, product_record.price, product_record.cost,
      product_record.iva_rate, product_record.stock, product_record.min_stock,
      product_record.track_stock, COALESCE(product_record.sold_by_weight, FALSE),
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

-- ---------------------------------------------------------------------
-- (3c) get_transaction_items_delta — quantity INTEGER -> NUMERIC in
-- RETURNS TABLE => DROP + CREATE + grant hygiene.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_transaction_items_delta(TIMESTAMPTZ);

CREATE FUNCTION public.get_transaction_items_delta(
  last_sync_timestamp TIMESTAMPTZ DEFAULT '1970-01-01'::TIMESTAMPTZ
)
RETURNS TABLE (
  id UUID, transaction_id UUID, product_id UUID, product_name TEXT, product_sku TEXT,
  category_id UUID, category_name TEXT, quantity NUMERIC, unit TEXT, unit_price NUMERIC, unit_cost NUMERIC,
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
    ti.category_id, ti.category_name, ti.quantity, ti.unit, ti.unit_price, ti.unit_cost,
    ti.iva_rate, ti.line_total, ti.tax_amount, ti.profit_amount,
    ti.discount_amount, ti.discount_percentage, ti.created_at, ti.updated_at, ti.deleted_at
  FROM public.transaction_items ti
  WHERE ti.tenant_id = v_tenant
    AND ti.updated_at > last_sync_timestamp
  ORDER BY ti.updated_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_transaction_items_delta(TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_transaction_items_delta(TIMESTAMPTZ) TO authenticated;

-- ---------------------------------------------------------------------
-- (3d) upsert_transaction_with_items — byte-identical to 20260726002000
-- EXCEPT the item quantity cast: ::INTEGER -> ::NUMERIC(12,3). This is THE
-- line that made a fractional sale strand in the sync outbox.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_transaction_with_items(transaction_data jsonb, items_data jsonb)
 RETURNS TABLE(transaction_id uuid, success boolean, error text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

        -- Qualified via alias: transaction_id is BOTH this function's OUT column and a
        -- transaction_items column -> plpgsql raises 'column reference "transaction_id" is
        -- ambiguous' the first time this statement runs. Sales never hit it (they already
        -- exist server-side via checkout, so the sealed guard returns early); every
        -- locally-created-only transaction (credit notes!) died here and was silently lost.
        DELETE FROM transaction_items ti
        WHERE ti.transaction_id = txn_id
          AND ti.tenant_id = v_tenant;

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
                unit,
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
                (item_record->>'quantity')::NUMERIC(12,3),
                COALESCE(item_record->>'unit', 'un'),
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
$function$;

-- ---------------------------------------------------------------------
-- (4) Assistant read-only RPCs: SUM(quantity)::bigint would ROUND weighed
-- quantities (3.625 kg -> 4). Return numeric instead. Column type changes in
-- RETURNS TABLE => DROP + CREATE; re-apply the service_role-only ACL from
-- 20260729000000 (fresh functions default to PUBLIC EXECUTE).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.assistant_daily_sales(uuid, date, date);

CREATE FUNCTION public.assistant_daily_sales(
  p_tenant_id uuid, p_start date, p_end date
)
RETURNS TABLE (
  sale_date date, total_sales numeric, transaction_count bigint,
  items_sold numeric, total_tax numeric, total_profit numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assistant_require_tenant(p_tenant_id);
  RETURN QUERY
  SELECT t.transaction_date,
         COALESCE(SUM(t.total), 0),
         COUNT(t.id)::bigint,
         COALESCE(SUM(it.items_sold), 0)::numeric,
         COALESCE(SUM(t.tax), 0),
         COALESCE(SUM(it.total_profit), 0)
  FROM public.transactions t
  LEFT JOIN LATERAL (
    SELECT SUM(ti.quantity) AS items_sold, SUM(ti.profit_amount) AS total_profit
    FROM public.transaction_items ti
    WHERE ti.transaction_id = t.id AND ti.deleted_at IS NULL
  ) it ON true
  WHERE t.tenant_id = p_tenant_id
    AND t.status = 'completed'
    AND t.deleted_at IS NULL
    AND t.transaction_date BETWEEN p_start AND p_end
  GROUP BY t.transaction_date
  ORDER BY t.transaction_date;
END;
$$;

DROP FUNCTION IF EXISTS public.assistant_sales_by_employee(uuid, date, date);

CREATE FUNCTION public.assistant_sales_by_employee(
  p_tenant_id uuid, p_start date, p_end date
)
RETURNS TABLE (
  employee_id uuid, employee_name text, total_sales numeric,
  transaction_count bigint, items_sold numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assistant_require_tenant(p_tenant_id);
  RETURN QUERY
  SELECT t.employee_id,
         COALESCE(e.name, MAX(t.employee_name), 'Unknown'),
         COALESCE(SUM(t.total), 0),
         COUNT(t.id)::bigint,
         COALESCE(SUM(it.items_sold), 0)::numeric
  FROM public.transactions t
  LEFT JOIN public.employees e ON e.id = t.employee_id AND e.tenant_id = p_tenant_id
  LEFT JOIN LATERAL (
    SELECT SUM(ti.quantity) AS items_sold
    FROM public.transaction_items ti
    WHERE ti.transaction_id = t.id AND ti.deleted_at IS NULL
  ) it ON true
  WHERE t.tenant_id = p_tenant_id
    AND t.status = 'completed'
    AND t.deleted_at IS NULL
    AND t.transaction_date BETWEEN p_start AND p_end
  GROUP BY t.employee_id, e.name
  ORDER BY SUM(t.total) DESC NULLS LAST;
END;
$$;

DROP FUNCTION IF EXISTS public.assistant_top_products(uuid, date, date, int);

CREATE FUNCTION public.assistant_top_products(
  p_tenant_id uuid, p_start date, p_end date, p_limit int DEFAULT 10
)
RETURNS TABLE (
  product_id uuid, product_name text, category_name text,
  quantity_sold numeric, total_revenue numeric, transaction_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assistant_require_tenant(p_tenant_id);
  RETURN QUERY
  SELECT ti.product_id,
         MAX(ti.product_name),
         MAX(ti.category_name),
         COALESCE(SUM(ti.quantity), 0)::numeric,
         COALESCE(SUM(ti.line_total), 0),
         COUNT(DISTINCT ti.transaction_id)::bigint
  FROM public.transaction_items ti
  JOIN public.transactions t
    ON t.id = ti.transaction_id
   AND t.tenant_id = p_tenant_id
   AND t.status = 'completed'
   AND t.deleted_at IS NULL
   AND t.transaction_date BETWEEN p_start AND p_end
  WHERE ti.tenant_id = p_tenant_id
    AND ti.deleted_at IS NULL
  GROUP BY ti.product_id
  ORDER BY SUM(ti.quantity) DESC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 10), 1);
END;
$$;

DROP FUNCTION IF EXISTS public.assistant_category_sales(uuid, date, date);

CREATE FUNCTION public.assistant_category_sales(
  p_tenant_id uuid, p_start date, p_end date
)
RETURNS TABLE (
  category_id uuid, category_name text, quantity_sold numeric, total_revenue numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assistant_require_tenant(p_tenant_id);
  RETURN QUERY
  SELECT ti.category_id,
         COALESCE(MAX(ti.category_name), 'Uncategorized'),
         COALESCE(SUM(ti.quantity), 0)::numeric,
         COALESCE(SUM(ti.line_total), 0)
  FROM public.transaction_items ti
  JOIN public.transactions t
    ON t.id = ti.transaction_id
   AND t.tenant_id = p_tenant_id
   AND t.status = 'completed'
   AND t.deleted_at IS NULL
   AND t.transaction_date BETWEEN p_start AND p_end
  WHERE ti.tenant_id = p_tenant_id
    AND ti.deleted_at IS NULL
  GROUP BY ti.category_id
  ORDER BY SUM(ti.line_total) DESC NULLS LAST;
END;
$$;

-- Re-apply the 20260729000000 ACL to the recreated assistant functions:
-- service_role-only EXECUTE.
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN
    SELECT format('%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('assistant_daily_sales', 'assistant_sales_by_employee',
                        'assistant_top_products', 'assistant_category_sales')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon, authenticated', fn);
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------
-- (5) Recreate the views (genesis definitions verbatim; p.* now includes
-- sold_by_weight and the NUMERIC stock columns).
-- ---------------------------------------------------------------------
CREATE VIEW public.active_products_with_categories
WITH (security_invoker = true) AS
SELECT
  p.*,
  c.name as category_display_name,
  c.color as category_color,
  c.icon as category_icon,
  CASE
    WHEN p.track_stock AND p.stock <= p.min_stock THEN 'low_stock'
    WHEN p.track_stock AND p.stock = 0 THEN 'out_of_stock'
    ELSE 'in_stock'
  END as stock_status
FROM public.products p
LEFT JOIN public.categories c ON p.category_id = c.id
WHERE p.is_active = true AND p.deleted_at IS NULL
ORDER BY p.display_order, p.name;

CREATE VIEW public.low_stock_products
WITH (security_invoker = true) AS
SELECT *
FROM public.active_products_with_categories
WHERE stock_status IN ('low_stock', 'out_of_stock')
ORDER BY stock_status DESC, stock ASC;

CREATE VIEW public.transaction_details
WITH (security_invoker = true) AS
SELECT
  t.id, t.transaction_number, t.employee_id, t.employee_name, t.customer_id, t.customer_name,
  t.transaction_date, t.transaction_time, t.subtotal, t.discount, t.tax, t.total,
  t.payment_method, t.status, t.created_at,
  COALESCE(
    json_agg(
      json_build_object(
        'id', ti.id, 'product_id', ti.product_id, 'product_name', ti.product_name,
        'product_sku', ti.product_sku, 'category_id', ti.category_id, 'category_name', ti.category_name,
        'quantity', ti.quantity, 'unit', ti.unit, 'unit_price', ti.unit_price, 'unit_cost', ti.unit_cost,
        'iva_rate', ti.iva_rate, 'line_total', ti.line_total, 'tax_amount', ti.tax_amount,
        'profit_amount', ti.profit_amount, 'discount_amount', ti.discount_amount
      ) ORDER BY ti.created_at
    ) FILTER (WHERE ti.id IS NOT NULL),
    '[]'::json
  ) as items
FROM public.transactions t
LEFT JOIN public.transaction_items ti ON t.id = ti.transaction_id AND ti.deleted_at IS NULL
WHERE t.deleted_at IS NULL
GROUP BY t.id, t.transaction_number, t.employee_id, t.employee_name, t.customer_id, t.customer_name,
         t.transaction_date, t.transaction_time, t.subtotal, t.discount, t.tax, t.total,
         t.payment_method, t.status, t.created_at
ORDER BY t.created_at DESC;

-- =====================================================================
-- POST-DEPLOY CHECKLIST (run with the anon key + a paired-device JWT):
--   1. SELECT quantity FROM transaction_items LIMIT 1;      -- numeric now
--   2. rpc get_products_delta -> rows carry sold_by_weight
--   3. rpc upsert_transaction_with_items with quantity 0.625 (device JWT,
--      TEST tenant) -> success=true (was: success=false '::integer')
--   4. anon rpc get_products_delta -> 42501/permission denied (grant hygiene)
--   5. assistant_daily_sales items_sold returns 3.625-style decimals
-- =====================================================================
