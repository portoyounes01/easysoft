-- =====================================================================
-- PHASE 2 — TENANT-SCOPED EMPLOYEE PROFILE LOOKUP
--
-- Device sessions need to revalidate a persisted operator on reload. During
-- the Phase 2→3 transition authenticated principals intentionally have no
-- direct employees-table policy, so a direct PostgREST SELECT fails even
-- though claims-mandatory roster RPCs are available. Keep the table closed and
-- expose only this narrow tenant-derived lookup.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_employee_profile(p_employee_id uuid)
RETURNS SETOF public.employees
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.*
    FROM public.employees AS e
   WHERE e.tenant_id = app.tenant_id()
     AND e.id = p_employee_id
     AND e.deleted_at IS NULL
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_employee_profile(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_employee_profile(uuid) TO authenticated;

COMMIT;
