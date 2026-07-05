-- =====================================================================
-- PHASE 2 — FIX employee_pin_login OUTPUT/COLUMN NAME AMBIGUITY
--
-- `employee_id` is both a RETURNS TABLE output variable and a column on
-- employee_credentials. PostgreSQL can treat references in UPDATE statements
-- as ambiguous unless the target table has an explicit alias. This failure is
-- reached only after a valid credential matches, causing every successful
-- login to return SQLSTATE 42702 while invalid credentials behave normally.
-- =====================================================================
-- NOTE: no explicit BEGIN/COMMIT — `supabase db push` already wraps each
-- migration in a transaction; an inner COMMIT breaks that atomicity.

CREATE OR REPLACE FUNCTION public.employee_pin_login(p_employee_number text, p_secret text)
RETURNS TABLE (employee_id uuid, employee_number text, name text, role text, success boolean, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_tenant         uuid;
  v_emp            record;
  v_cred           record;
  v_ok             boolean := false;
  v_lock_threshold int := 5;
  v_lock_minutes   int := 15;
BEGIN
  v_tenant := app.tenant_id();
  IF v_tenant IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::text, false, 'no_tenant_context';
    RETURN;
  END IF;

  SELECT e.id, e.employee_number, e.name, e.role, e.is_active
    INTO v_emp
    FROM public.employees AS e
   WHERE e.employee_number = p_employee_number
     AND e.tenant_id = v_tenant
   LIMIT 1;

  IF NOT FOUND OR v_emp.is_active IS NOT TRUE THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::text, false, 'invalid_credentials';
    RETURN;
  END IF;

  SELECT c.*
    INTO v_cred
    FROM public.employee_credentials AS c
   WHERE c.employee_id = v_emp.id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::text, false, 'invalid_credentials';
    RETURN;
  END IF;

  IF v_cred.locked_until IS NOT NULL AND v_cred.locked_until > now() THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::text, false, 'locked';
    RETURN;
  END IF;

  IF v_cred.pin_hash IS NOT NULL AND crypt(p_secret, v_cred.pin_hash) = v_cred.pin_hash THEN
    v_ok := true;
  ELSIF v_cred.password_hash IS NOT NULL AND crypt(p_secret, v_cred.password_hash) = v_cred.password_hash THEN
    v_ok := true;
  ELSIF v_cred.legacy_sha256_pin IS NOT NULL
        AND encode(digest(p_secret, 'sha256'), 'hex') = lower(v_cred.legacy_sha256_pin) THEN
    v_ok := true;
    UPDATE public.employee_credentials AS c
       SET pin_hash = crypt(p_secret, gen_salt('bf')),
           legacy_sha256_pin = NULL,
           updated_at = now()
     WHERE c.employee_id = v_emp.id;
  ELSIF v_cred.legacy_sha256_password IS NOT NULL
        AND encode(digest(p_secret, 'sha256'), 'hex') = lower(v_cred.legacy_sha256_password) THEN
    v_ok := true;
    UPDATE public.employee_credentials AS c
       SET password_hash = crypt(p_secret, gen_salt('bf')),
           legacy_sha256_password = NULL,
           updated_at = now()
     WHERE c.employee_id = v_emp.id;
  END IF;

  IF v_ok THEN
    UPDATE public.employee_credentials AS c
       SET failed_attempts = 0,
           locked_until = NULL,
           updated_at = now()
     WHERE c.employee_id = v_emp.id;
    RETURN QUERY
      SELECT v_emp.id, v_emp.employee_number, v_emp.name, v_emp.role, true, NULL::text;
    RETURN;
  END IF;

  UPDATE public.employee_credentials AS c
     SET failed_attempts = c.failed_attempts + 1,
         locked_until = CASE
           WHEN c.failed_attempts + 1 >= v_lock_threshold
             THEN now() + make_interval(mins => v_lock_minutes)
           ELSE c.locked_until
         END,
         updated_at = now()
   WHERE c.employee_id = v_emp.id;
  RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::text, false, 'invalid_credentials';
END $$;

REVOKE ALL ON FUNCTION public.employee_pin_login(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.employee_pin_login(text, text) TO authenticated;
