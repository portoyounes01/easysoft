-- =====================================================================
-- PHASE 3 hardening — revoke anon table grants (belt-and-braces).
--
-- Post-cutover the app is authenticated (device session) for all table access;
-- pre-pairing it only calls pair-device (edge) + ping (function, no table), and
-- the public /order-status route reads local Dexie only. So anon needs no table
-- access. RLS already denies anon (no anon policy after Phase 3), but revoking
-- the residual genesis blanket grant removes the second layer too, so a future
-- accidental "DISABLE ROW LEVEL SECURITY" can't re-expose data to anon.
--
-- ping() stays anon-executable (connectivity heartbeat) — this only touches
-- TABLE/SEQUENCE grants, not functions. NO explicit BEGIN/COMMIT.
-- =====================================================================
DO $$
DECLARE t text;
  tables text[] := ARRAY[
    'employees','categories','products','customers','transactions','transaction_items',
    'daily_sales_summary','stores','devices','device_pairing_codes','tenant_members',
    'tenant_settings','store_settings','notification_events','tenants',
    'cash_drawer_logs','print_logs','cashier_tests',
    'tenant_fiscal_config','fiscal_series','fiscal_documents','fiscal_issue_attempts','fiscal_audit_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;
-- employee_credentials + tenant_fiscal_secrets already have anon revoked.
-- NOTE: anon SEQUENCE grants intentionally left in place — generate_transaction_number
-- (SECURITY INVOKER) still uses transaction_number_sequence until the fiskaly cutover
-- (Phase 4) replaces it; revoking sequences is a minor follow-up done with that removal.
