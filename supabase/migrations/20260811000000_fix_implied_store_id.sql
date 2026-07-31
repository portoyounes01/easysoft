-- Fix app.implied_store_id(), which 20260810000000 shipped broken.
--
-- It used `SELECT count(*), min(s.id) INTO v_count, v_store` to mean "the one
-- visible store, if there is exactly one". PostgreSQL has no min(uuid)
-- aggregate, so every call raised:
--
--   42883  function min(uuid) does not exist
--
-- and took get_company_profile() down with it — the till's whole reason for
-- calling this. Nothing static caught it: a plpgsql body is stored, not parsed,
-- at CREATE time, so the migration applied cleanly and the function only failed
-- when a real session first executed it.
--
-- array_agg has no such gap, and reads more honestly anyway: collect the
-- visible stores, and answer only when there is exactly one.
--
-- NO explicit BEGIN/COMMIT — db push wraps each migration in a transaction.

CREATE OR REPLACE FUNCTION app.implied_store_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := app.tenant_id();
  v_store  uuid := app.store_id();
  v_ids    uuid[];
BEGIN
  -- A till carries its store in the JWT and needs no lookup at all.
  IF v_store IS NOT NULL THEN
    RETURN v_store;
  END IF;
  IF v_tenant IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(s.id)
    INTO v_ids
    FROM public.stores s
   WHERE s.tenant_id = v_tenant
     AND s.status = 'active'
     AND app.can_see_store(s.id);

  -- Deliberately NULL when several are visible: guessing one would show a
  -- back-office user another store's address with no sign that it was a guess.
  IF v_ids IS NOT NULL AND cardinality(v_ids) = 1 THEN
    RETURN v_ids[1];
  END IF;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.implied_store_id() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION app.implied_store_id() TO authenticated;
