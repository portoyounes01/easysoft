-- =====================================================================
-- TENANT SUBSCRIPTION PLAN + MEMBER→STORE LINKAGE INTEGRITY
-- (user decisions 2026-07-24)
--
-- 1) tenants.subscription_plan — the offering has multiple plans/tiers and
--    the tenants table had no column carrying which one a tenant is on.
--    ⚠️ PROVISIONAL PLAN NAMES: trial|basic|standard|premium were chosen by
--    the implementing agent because no tier names are defined anywhere in
--    the repo — confirm/rename before the first real (paying) tenant is
--    provisioned. Renaming later = one ALTER of this CHECK + an UPDATE.
--
-- 2) tenant_members.store_ids integrity — store_ids is a uuid[] (arrays
--    cannot carry FKs), so nothing prevented a membership pointing at
--    stores that do not exist or belong to ANOTHER tenant. This is the
--    schema half of the "owner must be properly linked to stores/tills"
--    prod requirement (dev's testowner rides store_ids NULL = tenant-wide,
--    which stays valid); provision-human gains the matching request-time
--    validation. NOTE deliberately NOT covered here: deleting a store does
--    not scrub it from existing store_ids arrays (stores are soft-closed
--    via status='closed', not deleted).
--
-- Additive-only; safe on staging and prod (P2/P5).
-- =====================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS subscription_plan text NOT NULL DEFAULT 'basic';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_subscription_plan_check'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_subscription_plan_check
      CHECK (subscription_plan IN ('trial', 'basic', 'standard', 'premium'));
  END IF;
END $$;

COMMENT ON COLUMN public.tenants.subscription_plan IS
  'Billing plan/tier. ⚠️ Names are provisional (no product tier names defined as of 2026-07-24) — confirm before first paying tenant.';

-- ---------------------------------------------------------------------
-- (2) tenant_members.store_ids must reference stores OF THE SAME TENANT.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.validate_tenant_member_store_ids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bad uuid;
BEGIN
  IF NEW.store_ids IS NOT NULL THEN
    -- s.id IS NULL guards NULL array elements; the violation test is on FOUND,
    -- not on bad IS NOT NULL, so a NULL element cannot mask itself.
    SELECT s.id INTO bad
    FROM unnest(NEW.store_ids) AS s(id)
    WHERE s.id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.stores st
      WHERE st.id = s.id AND st.tenant_id = NEW.tenant_id
    )
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'tenant_members.store_ids: store % does not belong to tenant %',
        COALESCE(bad::text, 'NULL'), NEW.tenant_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_tenant_member_store_ids ON public.tenant_members;
CREATE TRIGGER trg_validate_tenant_member_store_ids
  BEFORE INSERT OR UPDATE OF store_ids, tenant_id ON public.tenant_members
  FOR EACH ROW
  EXECUTE FUNCTION app.validate_tenant_member_store_ids();
