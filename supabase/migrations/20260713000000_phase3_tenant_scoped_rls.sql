-- =====================================================================
-- PHASE 3 — TENANT-SCOPED RLS (isolation cutover)
--
-- Replaces the permissive-anon baseline (USING(true)) with tenant-scoped
-- policies keyed on the JWT claim app.tenant_id(). After this:
--   * an authenticated session (device till / future PWA) can only read+write
--     rows of ITS OWN tenant; cross-tenant access returns 0 rows / is rejected;
--   * anon gets NO policy -> denied at the RLS layer (the app is authenticated
--     via its device session after pairing; pre-pairing it touches no tables);
--   * the SECURITY DEFINER RPCs (upsert_*, get_*_delta, employee_pin_login, …)
--     run as the table owner and BYPASS RLS — they self-enforce tenant via
--     app.tenant_id(), so sync/checkout is unaffected. RLS is NOT forced, so
--     those owner-context RPCs keep working; service_role (edge fns) also
--     bypasses. FORCE ROW LEVEL SECURITY is a later defense-in-depth step.
--
-- Writes remain tenant-scoped for authenticated too (WITH CHECK) so any direct
-- .from() write the app makes stays within-tenant; the sealed-document triggers
-- still guard fiscal rows on top.
--
-- NO explicit BEGIN/COMMIT — db push wraps each migration in a transaction.
-- =====================================================================

-- Tables carrying a tenant_id column: drop every existing policy, then a single
-- FOR ALL tenant-scoped policy for authenticated.
DO $$
DECLARE
  t text;
  p text;
  tables text[] := ARRAY[
    'employees','categories','products','customers','transactions','transaction_items',
    'daily_sales_summary','stores','devices','device_pairing_codes','tenant_members',
    'tenant_settings','store_settings','notification_events',
    'cash_drawer_logs','print_logs','cashier_tests'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p, t);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      || 'USING (tenant_id = app.tenant_id()) WITH CHECK (tenant_id = app.tenant_id())',
      t || '_tenant_isolation', t);
  END LOOP;
END $$;

-- tenants: the row's own id IS the tenant (no tenant_id column).
DO $$
DECLARE p text;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='tenants' LOOP
    EXECUTE format('DROP POLICY %I ON public.tenants', p);
  END LOOP;
END $$;
CREATE POLICY tenants_tenant_isolation ON public.tenants
  FOR ALL TO authenticated
  USING (id = app.tenant_id()) WITH CHECK (id = app.tenant_id());

-- employee_credentials stays zero-client-access: RLS on, NO policy, so neither
-- anon nor authenticated can touch it; only SECURITY DEFINER fns + service_role.
-- (Intentionally left without a policy.)
