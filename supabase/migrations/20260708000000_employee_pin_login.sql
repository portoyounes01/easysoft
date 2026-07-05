-- =====================================================================
-- Phase 2 — server-side credential verification (closes the hash-leak).
-- Additive & inert until the client cutover: the running anon app still
-- verifies PINs client-side against get_employees_delta. This adds the
-- server-side replacement so the SAME-DEPLOY cutover (rewrite login + strip
-- credential columns from get_employees_delta) can happen next, per plan §6.3.
--
-- employee_credentials: ZERO client access (RLS on, NO policies, NO anon/
-- authenticated grant — the genesis blanket GRANT predates this table so it
-- does not apply; belt-and-braces REVOKE below). Only service_role and
-- SECURITY DEFINER functions (running as owner) can read/write it.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.employee_credentials (
  employee_id            uuid PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  tenant_id              uuid NOT NULL REFERENCES public.tenants(id)
                            DEFAULT '00000000-0000-0000-0000-000000000001',
  pin_hash               text,                 -- crypt(pin, gen_salt('bf'))
  password_hash          text,                 -- crypt(password, gen_salt('bf'))
  legacy_sha256_pin      text,                 -- migration-only; cleared on first successful re-hash
  legacy_sha256_password text,                 -- migration-only; cleared on first successful re-hash
  failed_attempts        int NOT NULL DEFAULT 0,
  locked_until           timestamptz,
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employee_credentials_tenant ON public.employee_credentials(tenant_id);

ALTER TABLE public.employee_credentials ENABLE ROW LEVEL SECURITY;
-- No policies + explicit revoke = only service_role / SECURITY DEFINER reach it.
REVOKE ALL ON public.employee_credentials FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- employee_pin_login: verify an operator PIN/password UNDER a device session.
-- Tenant is derived from the device JWT claim (app.tenant_id()), never from
-- the payload. bcrypt via pgcrypto; lockout after 5 fails for 15 min; a legacy
-- unsalted SHA-256 is accepted exactly once, then transparently re-hashed.
-- Never returns any credential column.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.employee_pin_login(p_employee_number text, p_secret text)
RETURNS TABLE (employee_id uuid, employee_number text, name text, role text, success boolean, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_tenant       uuid;
  v_emp          record;
  v_cred         record;
  v_ok           boolean := false;
  v_lock_threshold int := 5;
  v_lock_minutes   int := 15;
BEGIN
  v_tenant := app.tenant_id();
  IF v_tenant IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::text, false, 'no_tenant_context'; RETURN;
  END IF;

  SELECT e.id, e.employee_number, e.name, e.role, e.is_active
    INTO v_emp
    FROM public.employees e
   WHERE e.employee_number = p_employee_number AND e.tenant_id = v_tenant
   LIMIT 1;

  IF NOT FOUND OR v_emp.is_active IS NOT TRUE THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::text, false, 'invalid_credentials'; RETURN;
  END IF;

  SELECT * INTO v_cred FROM public.employee_credentials c WHERE c.employee_id = v_emp.id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::text, false, 'invalid_credentials'; RETURN;
  END IF;

  IF v_cred.locked_until IS NOT NULL AND v_cred.locked_until > now() THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::text, false, 'locked'; RETURN;
  END IF;

  IF v_cred.pin_hash IS NOT NULL AND crypt(p_secret, v_cred.pin_hash) = v_cred.pin_hash THEN
    v_ok := true;
  ELSIF v_cred.password_hash IS NOT NULL AND crypt(p_secret, v_cred.password_hash) = v_cred.password_hash THEN
    v_ok := true;
  ELSIF v_cred.legacy_sha256_pin IS NOT NULL
        AND encode(digest(p_secret, 'sha256'), 'hex') = lower(v_cred.legacy_sha256_pin) THEN
    v_ok := true;
    UPDATE public.employee_credentials
       SET pin_hash = crypt(p_secret, gen_salt('bf')), legacy_sha256_pin = NULL, updated_at = now()
     WHERE employee_credentials.employee_id = v_emp.id;
  ELSIF v_cred.legacy_sha256_password IS NOT NULL
        AND encode(digest(p_secret, 'sha256'), 'hex') = lower(v_cred.legacy_sha256_password) THEN
    v_ok := true;
    UPDATE public.employee_credentials
       SET password_hash = crypt(p_secret, gen_salt('bf')), legacy_sha256_password = NULL, updated_at = now()
     WHERE employee_credentials.employee_id = v_emp.id;
  END IF;

  IF v_ok THEN
    UPDATE public.employee_credentials
       SET failed_attempts = 0, locked_until = NULL, updated_at = now()
     WHERE employee_credentials.employee_id = v_emp.id;
    RETURN QUERY SELECT v_emp.id, v_emp.employee_number, v_emp.name, v_emp.role, true, NULL::text; RETURN;
  ELSE
    UPDATE public.employee_credentials
       SET failed_attempts = failed_attempts + 1,
           locked_until = CASE WHEN failed_attempts + 1 >= v_lock_threshold
                               THEN now() + make_interval(mins => v_lock_minutes) ELSE locked_until END,
           updated_at = now()
     WHERE employee_credentials.employee_id = v_emp.id;
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::text, false, 'invalid_credentials'; RETURN;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.employee_pin_login(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.employee_pin_login(text, text) TO authenticated;
