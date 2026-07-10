-- =====================================================================
-- AI ASSISTANT — curated READ-ONLY data tools (Phase 1)
--
-- These are the ONLY data surface the assistant may touch. Read-only is
-- enforced structurally the same way this repo's other read RPCs are
-- (get_*_delta in 20260717000000): every function is SECURITY DEFINER, contains
-- ONLY SELECTs, is tenant-scoped by an explicit p_tenant_id, and is EXECUTE-
-- granted to `service_role` ONLY (revoked from PUBLIC/anon/authenticated). No
-- browser client can call them with a forged tenant; only the trusted edge
-- function can, and it resolves the tenant from the VERIFIED JWT (in-app) or
-- the phone registry (Phase 2). The assistant model never emits SQL — it can
-- only call these fixed functions — so it has no path to write anything.
--
-- (Functions run as their owner `postgres`, which owns the base tables and so
-- bypasses RLS; tenant isolation is the explicit WHERE tenant_id = p_tenant_id
-- on every query. A SELECT-only owning role would be stronger defence-in-depth
-- but requires privileges managed Supabase does not grant to the migration
-- role — so we match the proven get_*_delta pattern instead.)
-- =====================================================================

-- Shared guard: fail closed when no tenant is supplied.
CREATE OR REPLACE FUNCTION public.assistant_require_tenant(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'no_tenant_context' USING ERRCODE = '28000';
  END IF;
END;
$$;


-- --- 1. sales overview -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assistant_sales_overview(
  p_tenant_id uuid, p_start date, p_end date
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v json;
BEGIN
  PERFORM public.assistant_require_tenant(p_tenant_id);
  SELECT json_build_object(
    'total_revenue',      COALESCE(SUM(s.total_sales), 0),
    'total_transactions', COALESCE(SUM(s.transaction_count), 0),
    'total_items',        COALESCE(SUM(s.items_sold), 0),
    'total_tax',          COALESCE(SUM(s.total_tax), 0),
    'total_profit',       COALESCE(SUM(s.total_profit), 0),
    'avg_transaction',    CASE WHEN COALESCE(SUM(s.transaction_count),0) > 0
                               THEN ROUND(SUM(s.total_sales) / SUM(s.transaction_count), 2)
                               ELSE 0 END,
    'date_start', p_start, 'date_end', p_end
  ) INTO v
  FROM public.daily_sales_summary s
  WHERE s.tenant_id = p_tenant_id
    AND s.summary_date BETWEEN p_start AND p_end;
  RETURN v;
END;
$$;


-- --- 2. daily sales time series ---------------------------------------------
CREATE OR REPLACE FUNCTION public.assistant_daily_sales(
  p_tenant_id uuid, p_start date, p_end date
)
RETURNS TABLE (
  sale_date date, total_sales numeric, transaction_count bigint,
  items_sold bigint, total_tax numeric, total_profit numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assistant_require_tenant(p_tenant_id);
  RETURN QUERY
  SELECT s.summary_date,
         COALESCE(SUM(s.total_sales), 0),
         COALESCE(SUM(s.transaction_count), 0)::bigint,
         COALESCE(SUM(s.items_sold), 0)::bigint,
         COALESCE(SUM(s.total_tax), 0),
         COALESCE(SUM(s.total_profit), 0)
  FROM public.daily_sales_summary s
  WHERE s.tenant_id = p_tenant_id
    AND s.summary_date BETWEEN p_start AND p_end
  GROUP BY s.summary_date
  ORDER BY s.summary_date;
END;
$$;


-- --- 3. sales by employee (PII: employee_name -> pseudonymized in the edge fn)
CREATE OR REPLACE FUNCTION public.assistant_sales_by_employee(
  p_tenant_id uuid, p_start date, p_end date
)
RETURNS TABLE (
  employee_id uuid, employee_name text, total_sales numeric,
  transaction_count bigint, items_sold bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assistant_require_tenant(p_tenant_id);
  RETURN QUERY
  SELECT s.employee_id,
         COALESCE(e.name, 'Unknown'),
         COALESCE(SUM(s.total_sales), 0),
         COALESCE(SUM(s.transaction_count), 0)::bigint,
         COALESCE(SUM(s.items_sold), 0)::bigint
  FROM public.daily_sales_summary s
  LEFT JOIN public.employees e ON e.id = s.employee_id AND e.tenant_id = p_tenant_id
  WHERE s.tenant_id = p_tenant_id
    AND s.summary_date BETWEEN p_start AND p_end
  GROUP BY s.employee_id, e.name
  ORDER BY SUM(s.total_sales) DESC;
END;
$$;


-- --- 4. top products ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assistant_top_products(
  p_tenant_id uuid, p_start date, p_end date, p_limit int DEFAULT 10
)
RETURNS TABLE (
  product_id uuid, product_name text, category_name text,
  quantity_sold bigint, total_revenue numeric, transaction_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assistant_require_tenant(p_tenant_id);
  RETURN QUERY
  SELECT ti.product_id,
         MAX(ti.product_name),
         MAX(ti.category_name),
         COALESCE(SUM(ti.quantity), 0)::bigint,
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
  GROUP BY ti.product_id
  ORDER BY SUM(ti.quantity) DESC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 10), 1);
END;
$$;


-- --- 5. sales by payment method ---------------------------------------------
CREATE OR REPLACE FUNCTION public.assistant_sales_by_payment(
  p_tenant_id uuid, p_start date, p_end date
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v json;
BEGIN
  PERFORM public.assistant_require_tenant(p_tenant_id);
  SELECT json_build_object(
    'cash',  COALESCE(SUM(s.cash_sales), 0),
    'card',  COALESCE(SUM(s.card_sales), 0),
    'mixed', COALESCE(SUM(s.mixed_sales), 0),
    'total', COALESCE(SUM(s.total_sales), 0)
  ) INTO v
  FROM public.daily_sales_summary s
  WHERE s.tenant_id = p_tenant_id
    AND s.summary_date BETWEEN p_start AND p_end;
  RETURN v;
END;
$$;


-- --- 6. low stock ------------------------------------------------------------
-- Queries base products directly (the active_products_with_categories view
-- predates tenant_id and does not expose it), computing stock_status inline.
CREATE OR REPLACE FUNCTION public.assistant_low_stock(p_tenant_id uuid)
RETURNS TABLE (
  product_id uuid, product_name text, sku text, stock numeric,
  min_stock numeric, category_name text, stock_status text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assistant_require_tenant(p_tenant_id);
  RETURN QUERY
  SELECT p.id, p.name, p.sku, p.stock::numeric, p.min_stock::numeric, p.category_name,
         CASE WHEN p.track_stock AND p.stock = 0 THEN 'out_of_stock'
              WHEN p.track_stock AND p.stock <= p.min_stock THEN 'low_stock'
              ELSE 'in_stock' END
  FROM public.products p
  WHERE p.tenant_id = p_tenant_id AND p.is_active AND p.deleted_at IS NULL
    AND p.track_stock AND p.stock <= p.min_stock
  ORDER BY p.stock ASC;
END;
$$;


-- --- 7. product catalog + inventory value -----------------------------------
CREATE OR REPLACE FUNCTION public.assistant_product_catalog(
  p_tenant_id uuid, p_category_id uuid DEFAULT NULL, p_limit int DEFAULT 100
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v json;
BEGIN
  PERFORM public.assistant_require_tenant(p_tenant_id);
  WITH scoped AS (
    SELECT p.id, p.name, p.sku, p.price, p.cost, p.stock, p.min_stock, p.track_stock, p.category_name,
           CASE WHEN p.track_stock AND p.stock = 0 THEN 'out_of_stock'
                WHEN p.track_stock AND p.stock <= p.min_stock THEN 'low_stock'
                ELSE 'in_stock' END AS stock_status
    FROM public.products p
    WHERE p.tenant_id = p_tenant_id AND p.is_active AND p.deleted_at IS NULL
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
  )
  SELECT json_build_object(
    'total_products',  (SELECT COUNT(*) FROM scoped),
    'inventory_value', (SELECT COALESCE(SUM(stock * cost), 0) FROM scoped WHERE track_stock),
    'total_units',     (SELECT COALESCE(SUM(stock), 0) FROM scoped WHERE track_stock),
    'products', COALESCE((
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT id, name, sku, price, cost, stock, min_stock, category_name, stock_status
        FROM scoped ORDER BY name LIMIT GREATEST(COALESCE(p_limit, 100), 1)
      ) t
    ), '[]'::json)
  ) INTO v;
  RETURN v;
END;
$$;


-- --- 8. category sales -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assistant_category_sales(
  p_tenant_id uuid, p_start date, p_end date
)
RETURNS TABLE (
  category_id uuid, category_name text, quantity_sold bigint, total_revenue numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assistant_require_tenant(p_tenant_id);
  RETURN QUERY
  SELECT ti.category_id,
         COALESCE(MAX(ti.category_name), 'Uncategorized'),
         COALESCE(SUM(ti.quantity), 0)::bigint,
         COALESCE(SUM(ti.line_total), 0)
  FROM public.transaction_items ti
  JOIN public.transactions t
    ON t.id = ti.transaction_id
   AND t.tenant_id = p_tenant_id
   AND t.status = 'completed'
   AND t.deleted_at IS NULL
   AND t.transaction_date BETWEEN p_start AND p_end
  WHERE ti.tenant_id = p_tenant_id
  GROUP BY ti.category_id
  ORDER BY SUM(ti.line_total) DESC NULLS LAST;
END;
$$;


-- --- 9. list transactions (headers) -----------------------------------------
CREATE OR REPLACE FUNCTION public.assistant_list_transactions(
  p_tenant_id uuid, p_start date, p_end date,
  p_payment_method text DEFAULT NULL, p_employee_id uuid DEFAULT NULL, p_limit int DEFAULT 50
)
RETURNS TABLE (
  id uuid, transaction_number text, transaction_date date, transaction_time time,
  employee_id uuid, employee_name text, customer_name text,
  total numeric, tax numeric, discount numeric, payment_method text, status text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assistant_require_tenant(p_tenant_id);
  RETURN QUERY
  SELECT t.id, t.transaction_number, t.transaction_date, t.transaction_time,
         t.employee_id, t.employee_name, t.customer_name,
         t.total, t.tax, t.discount, t.payment_method, t.status
  FROM public.transactions t
  WHERE t.tenant_id = p_tenant_id
    AND t.deleted_at IS NULL
    AND t.transaction_date BETWEEN p_start AND p_end
    AND (p_payment_method IS NULL OR t.payment_method = p_payment_method)
    AND (p_employee_id IS NULL OR t.employee_id = p_employee_id)
  ORDER BY t.transaction_date DESC, t.transaction_time DESC
  LIMIT GREATEST(COALESCE(p_limit, 50), 1);
END;
$$;


-- --- 10. single transaction detail (PII: customer_name -> pseudonymized) -----
CREATE OR REPLACE FUNCTION public.assistant_transaction_detail(
  p_tenant_id uuid, p_id uuid
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v json;
BEGIN
  PERFORM public.assistant_require_tenant(p_tenant_id);
  SELECT to_json(d) INTO v
  FROM public.transaction_details d
  JOIN public.transactions t ON t.id = d.id AND t.tenant_id = p_tenant_id
  WHERE d.id = p_id;
  RETURN v;
END;
$$;


-- --- Grants: service_role-only EXECUTE (revoke from clients) ------------------
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN
    SELECT format('%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'assistant_%'
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
