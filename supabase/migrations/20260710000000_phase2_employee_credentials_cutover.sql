-- =====================================================================
-- PHASE 2 — EMPLOYEE CREDENTIAL CUTOVER (co-deploy with client + edge code)
--
-- This migration closes Shim R2:
--   * validates and moves legacy employee credentials into the zero-client-
--     access employee_credentials table;
--   * makes employee sync authenticated and tenant-derived;
--   * removes credentials from the roster delta;
--   * keeps employee administration working by accepting credential hashes
--     through the tenant-scoped SECURITY DEFINER upsert; and
--   * drops the credential columns from public.employees.
--
-- DEPLOYMENT ORDER (one maintenance window):
--   1. deploy the paired/session-aware client and JWT-only edge functions;
--   2. apply this migration;
--   3. verify employee login + employee create/PIN reset + image upload;
--   4. pair the production till before ending the window.
--
-- Rollback is forward-only: re-add employee columns only if the client must be
-- rolled back, then copy legacy/bcrypt values back explicitly. Never expose
-- employee_credentials through a client policy.
-- =====================================================================
-- NOTE: no explicit BEGIN/COMMIT. `supabase db push` already wraps each
-- migration in a transaction. The inner COMMIT that used to be here committed
-- the DDL before the ledger row was written, so a failed push left EasySoft
-- with the columns dropped but this migration UNRECORDED (partial cutover).
-- Removing it lets db push apply + record this migration atomically.

-- Refuse to silently migrate plaintext or malformed values. The running app
-- writes SHA-256 hex; bcrypt rows are accepted for already-upgraded fixtures.
DO $$
DECLARE
  invalid_count integer;
BEGIN
  SELECT count(*)
    INTO invalid_count
    FROM public.employees e
   WHERE (e.pin IS NOT NULL AND btrim(e.pin) <> ''
          AND e.pin !~* '^[0-9a-f]{64}$'
          AND e.pin !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$')
      OR (e.password_hash IS NOT NULL AND btrim(e.password_hash) <> ''
          AND e.password_hash !~* '^[0-9a-f]{64}$'
          AND e.password_hash !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$');

  IF invalid_count > 0 THEN
    RAISE EXCEPTION
      'Phase 2 credential cutover blocked: % employee credential value(s) are neither SHA-256 nor bcrypt',
      invalid_count;
  END IF;
END $$;

INSERT INTO public.employee_credentials (
  employee_id,
  tenant_id,
  pin_hash,
  password_hash,
  legacy_sha256_pin,
  legacy_sha256_password
)
SELECT
  e.id,
  e.tenant_id,
  CASE WHEN e.pin ~ '^\$2[aby]\$' THEN e.pin END,
  CASE WHEN e.password_hash ~ '^\$2[aby]\$' THEN e.password_hash END,
  CASE WHEN e.pin ~* '^[0-9a-f]{64}$' THEN lower(e.pin) END,
  CASE WHEN e.password_hash ~* '^[0-9a-f]{64}$' THEN lower(e.password_hash) END
FROM public.employees e
WHERE nullif(btrim(e.pin), '') IS NOT NULL
   OR nullif(btrim(e.password_hash), '') IS NOT NULL
ON CONFLICT (employee_id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  pin_hash = COALESCE(public.employee_credentials.pin_hash, EXCLUDED.pin_hash),
  password_hash = COALESCE(public.employee_credentials.password_hash, EXCLUDED.password_hash),
  legacy_sha256_pin = CASE
    WHEN public.employee_credentials.pin_hash IS NOT NULL THEN public.employee_credentials.legacy_sha256_pin
    ELSE COALESCE(public.employee_credentials.legacy_sha256_pin, EXCLUDED.legacy_sha256_pin)
  END,
  legacy_sha256_password = CASE
    WHEN public.employee_credentials.password_hash IS NOT NULL THEN public.employee_credentials.legacy_sha256_password
    ELSE COALESCE(public.employee_credentials.legacy_sha256_password, EXCLUDED.legacy_sha256_password)
  END,
  updated_at = now();

-- Roster pull: tenant comes exclusively from the authenticated device/human
-- JWT. Credential fields no longer exist in the function contract.
DROP FUNCTION IF EXISTS public.get_employees_delta(timestamptz);
CREATE FUNCTION public.get_employees_delta(
  since_timestamp timestamptz DEFAULT '1970-01-01'::timestamptz
)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  employee_number text,
  name text,
  email text,
  phone text,
  role text,
  access_levels text[],
  is_active boolean,
  hire_date date,
  total_sales numeric(10, 2),
  transaction_count integer,
  average_transaction numeric(10, 2),
  hours_worked integer,
  auth_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  last_synced_at timestamptz,
  needs_push boolean,
  is_conflicted boolean,
  deleted_at timestamptz
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
    e.id, e.tenant_id, e.employee_number, e.name, e.email, e.phone,
    e.role, e.access_levels, e.is_active, e.hire_date,
    e.total_sales, e.transaction_count, e.average_transaction, e.hours_worked,
    e.auth_id, e.created_at, e.updated_at, e.last_synced_at,
    e.needs_push, e.is_conflicted, e.deleted_at
  FROM public.employees e
  WHERE e.tenant_id = v_tenant
    AND e.updated_at > since_timestamp
  ORDER BY e.updated_at ASC, e.id ASC;
END $$;

REVOKE ALL ON FUNCTION public.get_employees_delta(timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_employees_delta(timestamptz) TO authenticated;

-- Employee writes stay compatible with the local queue shape. Credential
-- hashes are input-only and are written to employee_credentials; null means
-- "leave the existing credential unchanged", which is required for roster
-- edits after pulled rows stop carrying hashes.
CREATE OR REPLACE FUNCTION public.upsert_employees(employees_data jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp_record record;
  upserted_count integer := 0;
  v_employee_id uuid;
  v_tenant uuid := app.tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'no_tenant_context' USING ERRCODE = '28000';
  END IF;

  FOR emp_record IN
    SELECT * FROM jsonb_to_recordset(employees_data) AS x(
      id uuid,
      employee_number text,
      name text,
      email text,
      phone text,
      password_hash text,
      pin text,
      role text,
      access_levels text[],
      is_active boolean,
      hire_date date,
      total_sales numeric(10, 2),
      transaction_count integer,
      average_transaction numeric(10, 2),
      hours_worked integer,
      auth_id uuid,
      created_at timestamptz,
      updated_at timestamptz,
      last_synced_at timestamptz,
      needs_push boolean,
      is_conflicted boolean,
      deleted_at timestamptz
    )
  LOOP
    IF nullif(btrim(emp_record.pin), '') IS NOT NULL
       AND emp_record.pin !~* '^[0-9a-f]{64}$'
       AND emp_record.pin !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$' THEN
      RAISE EXCEPTION 'invalid_pin_hash_format';
    END IF;
    IF nullif(btrim(emp_record.password_hash), '') IS NOT NULL
       AND emp_record.password_hash !~* '^[0-9a-f]{64}$'
       AND emp_record.password_hash !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$' THEN
      RAISE EXCEPTION 'invalid_password_hash_format';
    END IF;

    v_employee_id := NULL;
    INSERT INTO public.employees (
      id, tenant_id, employee_number, name, email, phone,
      role, access_levels, is_active, hire_date, total_sales,
      transaction_count, average_transaction, hours_worked, auth_id,
      created_at, updated_at, last_synced_at, needs_push, is_conflicted, deleted_at
    ) VALUES (
      emp_record.id, v_tenant, emp_record.employee_number, emp_record.name,
      emp_record.email, emp_record.phone, emp_record.role, emp_record.access_levels,
      emp_record.is_active, emp_record.hire_date, emp_record.total_sales,
      emp_record.transaction_count, emp_record.average_transaction, emp_record.hours_worked,
      emp_record.auth_id, COALESCE(emp_record.created_at, now()), now(),
      emp_record.last_synced_at, COALESCE(emp_record.needs_push, false),
      COALESCE(emp_record.is_conflicted, false), emp_record.deleted_at
    )
    ON CONFLICT (employee_number) DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      role = EXCLUDED.role,
      access_levels = EXCLUDED.access_levels,
      is_active = EXCLUDED.is_active,
      hire_date = EXCLUDED.hire_date,
      total_sales = EXCLUDED.total_sales,
      transaction_count = EXCLUDED.transaction_count,
      average_transaction = EXCLUDED.average_transaction,
      hours_worked = EXCLUDED.hours_worked,
      auth_id = COALESCE(EXCLUDED.auth_id, public.employees.auth_id),
      updated_at = now(),
      last_synced_at = EXCLUDED.last_synced_at,
      needs_push = EXCLUDED.needs_push,
      is_conflicted = EXCLUDED.is_conflicted,
      deleted_at = EXCLUDED.deleted_at
    WHERE public.employees.tenant_id = v_tenant
    RETURNING public.employees.id INTO v_employee_id;

    IF v_employee_id IS NULL THEN
      RAISE EXCEPTION 'cross_tenant_employee_conflict';
    END IF;

    IF nullif(btrim(emp_record.pin), '') IS NOT NULL
       OR nullif(btrim(emp_record.password_hash), '') IS NOT NULL THEN
      INSERT INTO public.employee_credentials (
        employee_id, tenant_id, pin_hash, password_hash,
        legacy_sha256_pin, legacy_sha256_password
      ) VALUES (
        v_employee_id,
        v_tenant,
        CASE WHEN emp_record.pin ~ '^\$2[aby]\$' THEN emp_record.pin END,
        CASE WHEN emp_record.password_hash ~ '^\$2[aby]\$' THEN emp_record.password_hash END,
        CASE WHEN emp_record.pin ~* '^[0-9a-f]{64}$' THEN lower(emp_record.pin) END,
        CASE WHEN emp_record.password_hash ~* '^[0-9a-f]{64}$' THEN lower(emp_record.password_hash) END
      )
      ON CONFLICT (employee_id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        pin_hash = CASE
          WHEN emp_record.pin ~ '^\$2[aby]\$' THEN emp_record.pin
          WHEN emp_record.pin ~* '^[0-9a-f]{64}$' THEN NULL
          ELSE public.employee_credentials.pin_hash
        END,
        password_hash = CASE
          WHEN emp_record.password_hash ~ '^\$2[aby]\$' THEN emp_record.password_hash
          WHEN emp_record.password_hash ~* '^[0-9a-f]{64}$' THEN NULL
          ELSE public.employee_credentials.password_hash
        END,
        legacy_sha256_pin = CASE
          WHEN emp_record.pin ~* '^[0-9a-f]{64}$' THEN lower(emp_record.pin)
          WHEN nullif(btrim(emp_record.pin), '') IS NOT NULL THEN NULL
          ELSE public.employee_credentials.legacy_sha256_pin
        END,
        legacy_sha256_password = CASE
          WHEN emp_record.password_hash ~* '^[0-9a-f]{64}$' THEN lower(emp_record.password_hash)
          WHEN nullif(btrim(emp_record.password_hash), '') IS NOT NULL THEN NULL
          ELSE public.employee_credentials.legacy_sha256_password
        END,
        failed_attempts = CASE
          WHEN nullif(btrim(emp_record.pin), '') IS NOT NULL
            OR nullif(btrim(emp_record.password_hash), '') IS NOT NULL THEN 0
          ELSE public.employee_credentials.failed_attempts
        END,
        locked_until = CASE
          WHEN nullif(btrim(emp_record.pin), '') IS NOT NULL
            OR nullif(btrim(emp_record.password_hash), '') IS NOT NULL THEN NULL
          ELSE public.employee_credentials.locked_until
        END,
        updated_at = now();
    END IF;

    upserted_count := upserted_count + 1;
  END LOOP;

  RETURN upserted_count;
END $$;

REVOKE ALL ON FUNCTION public.upsert_employees(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.upsert_employees(jsonb) TO authenticated;

-- This legacy mapping RPC was revoked in Phase 0, has no client call sites,
-- and references the columns removed below. Delete it now rather than leave a
-- dormant function that fails at runtime.
DROP FUNCTION IF EXISTS public.upsert_employees_with_mapping(jsonb);

-- The secrets now have one home. Dropping the columns makes accidental future
-- SELECT * / service-role serialization incapable of leaking credentials.
ALTER TABLE public.employees
  DROP COLUMN password_hash,
  DROP COLUMN pin;
