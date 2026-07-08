-- =====================================================================
-- TEMPORARY DEBUG INTROSPECTION (2026-07-08) — read-only helpers to fetch the LIVE
-- definitions of functions/triggers while diagnosing the credit-note sync failure
-- ('column reference "transaction_id" is ambiguous'). The live upsert RPC behaves
-- differently from the repo file (sales pass through a statement that reads as
-- ambiguous), so we need the deployed source, not the file. DROPPED after diagnosis.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.debug_get_fn_src(p_name text)
RETURNS TABLE (schema_name text, fn_oid oid, src text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT n.nspname::text, p.oid, pg_get_functiondef(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = p_name AND n.nspname IN ('public', 'app');
$$;

CREATE OR REPLACE FUNCTION public.debug_get_triggers(p_table text)
RETURNS TABLE (trigger_name text, trigger_def text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT t.tgname::text, pg_get_triggerdef(t.oid)
  FROM pg_trigger t
  WHERE t.tgrelid = p_table::regclass AND NOT t.tgisinternal;
$$;

REVOKE EXECUTE ON FUNCTION public.debug_get_fn_src(text)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.debug_get_triggers(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.debug_get_fn_src(text)   TO authenticated;
GRANT  EXECUTE ON FUNCTION public.debug_get_triggers(text) TO authenticated;
