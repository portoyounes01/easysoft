-- =====================================================================
-- SYSTEM ADMINISTRATOR EMPLOYEE-NUMBER SWAP
--
-- Corrects an old seeding accident: the system administrator was created as
-- ADMIN001 while SYS001 — the number that reads as "system" — was taken by an
-- ordinary admin employee (Carlos Silva). After this migration:
--
--     System Administrator   ADMIN001  ->  SYS001
--     Carlos Silva           SYS001    ->  ADM002   (ADM001 is Maria Santos)
--
-- The client side moves in the same commit: `src/utils/systemAdmin.ts` now
-- defaults to SYS001, and every seed source (public/bootstrap-data.json,
-- public/startup-seed.json, public/seed/employees.yml, seed/employees.yml)
-- ships the new numbers. Applying the client without this migration would
-- leave existing installs with NO recognised system administrator, so deploy
-- them together.
--
-- ⛔ ORDERING CONSTRAINT: this is a SWAP, not two independent renames.
-- `employees_tenant_id_employee_number_key` is UNIQUE (tenant_id,
-- employee_number), so SYS001 must be vacated BEFORE ADMIN001 claims it.
-- Both statements are therefore ordered and run in ONE transaction (the
-- Supabase CLI wraps the file), so a failure rolls the pair back together.
--
-- Idempotent: re-running is a no-op once the numbers are already correct, and
-- each rename is skipped for any tenant where the target number is occupied by
-- a different employee (reported via RAISE NOTICE instead of failing the push).
-- NO explicit BEGIN/COMMIT (CLI wraps the file in one transaction).
-- =====================================================================

DO $$
DECLARE
  v_tenant   uuid;
  v_from_id  uuid;
  v_blocker  text;
  v_renamed  int := 0;
  v_skipped  int := 0;
BEGIN
  -- -------------------------------------------------------------------
  -- PHASE 1 — vacate SYS001: the ordinary admin becomes ADM002.
  -- Must complete before phase 2 or the unique constraint rejects the swap.
  -- -------------------------------------------------------------------
  FOR v_tenant, v_from_id IN
    SELECT tenant_id, id FROM public.employees WHERE employee_number = 'SYS001'
  LOOP
    SELECT name INTO v_blocker
    FROM public.employees
    WHERE tenant_id = v_tenant AND employee_number = 'ADM002' AND id <> v_from_id;

    IF v_blocker IS NOT NULL THEN
      RAISE NOTICE 'Tenant %: ADM002 already taken by "%" — leaving SYS001 alone.', v_tenant, v_blocker;
      v_skipped := v_skipped + 1;
    ELSE
      UPDATE public.employees
         SET employee_number = 'ADM002', updated_at = now()
       WHERE id = v_from_id;
      v_renamed := v_renamed + 1;
    END IF;
    v_blocker := NULL;
  END LOOP;

  RAISE NOTICE 'Phase 1 (SYS001 -> ADM002): % renamed, % skipped.', v_renamed, v_skipped;
  v_renamed := 0;
  v_skipped := 0;

  -- -------------------------------------------------------------------
  -- PHASE 2 — the system administrator takes the now-free SYS001.
  -- -------------------------------------------------------------------
  FOR v_tenant, v_from_id IN
    SELECT tenant_id, id FROM public.employees WHERE employee_number = 'ADMIN001'
  LOOP
    SELECT name INTO v_blocker
    FROM public.employees
    WHERE tenant_id = v_tenant AND employee_number = 'SYS001' AND id <> v_from_id;

    IF v_blocker IS NOT NULL THEN
      RAISE NOTICE 'Tenant %: SYS001 still taken by "%" — ADMIN001 left as-is.', v_tenant, v_blocker;
      v_skipped := v_skipped + 1;
    ELSE
      UPDATE public.employees
         SET employee_number = 'SYS001', updated_at = now()
       WHERE id = v_from_id;
      v_renamed := v_renamed + 1;
    END IF;
    v_blocker := NULL;
  END LOOP;

  RAISE NOTICE 'Phase 2 (ADMIN001 -> SYS001): % renamed, % skipped.', v_renamed, v_skipped;

  -- -------------------------------------------------------------------
  -- Post-condition: nothing may still be sitting on the retired number.
  -- A leftover means a tenant hit the blocker branch above and needs a
  -- manual decision — fail loudly rather than ship a half-swapped fleet.
  -- -------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM public.employees WHERE employee_number = 'ADMIN001') THEN
    RAISE EXCEPTION
      'ADMIN001 still exists after the swap — resolve the conflicting SYS001 rows listed in the NOTICEs above, then re-run.';
  END IF;
END $$;
