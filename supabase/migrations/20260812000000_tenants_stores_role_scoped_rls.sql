-- =====================================================================
-- SPLIT public.tenants AND public.stores OFF THE PHASE-3 RLS TEMPLATE
--
-- 20260713000000 generated a policy for every tenant-scoped table from one
-- template:
--
--   CREATE POLICY <t>_tenant_isolation ON public.<t> FOR ALL TO authenticated
--     USING (tenant_id = app.tenant_id()) WITH CHECK (tenant_id = app.tenant_id())
--
-- and gave `tenants` the same thing keyed on `id`. That template asks exactly
-- one question — "is this row in my tenant?" — and has no notion of WHO is
-- asking. For the tables it was written for that is correct: a till is supposed
-- to write transactions, products and cash_drawer_logs in its own tenant.
--
-- It is wrong for these two. `tenants` and `stores` are not operational data —
-- they are the tenant's fiscal identity (`legal_name`, `nif`) and the store's
-- location, and since 20260810000000 `get_company_profile()` resolves the
-- PRINTED RECEIPT HEADER out of exactly those columns. Under the template a
-- paired till holds `authenticated` and its own `tenant_id`, so it satisfies
-- the policy for its own tenant row and can
--
--   PATCH /rest/v1/tenants?id=eq.<its own tenant>   {"nif": "..."}
--
-- straight through PostgREST and rewrite the NIF that every subsequent document
-- is signed under. A till is an unattended box on a shop counter; it should
-- never have been able to edit the company it prints for. The SECURITY DEFINER
-- writers (`upsert_store_company`, `upsert_company_slogan`) already re-state an
-- owner/admin gate, but they are not what stops a client that skips them and
-- talks to the table directly.
--
-- So: split read from write. READ is unchanged and stays claim-based; WRITE
-- gains the role predicate the template never had.
--
-- WHY THE READ HALF IS NOT A tenant_members LOOKUP. "Any member of the tenant"
-- is the intent, but a paired till is NOT in `tenant_members` — that table is
-- humans-only, as custom_access_token says in its own words ("devices carry
-- tenant_id but are NOT in tenant_members"). An EXISTS-over-membership read
-- policy would return zero rows for every till in the fleet and take the
-- company-block sync down with it. The JWT claim IS the membership proof here,
-- so the read predicate stays byte-identical to what 20260713000000 shipped.
--
-- WHY DROP-AND-REPLACE, NOT ADD. Permissive policies OR together, so adding a
-- role-gated policy next to a surviving `FOR ALL` one tightens nothing at all.
-- The old policies have to go.
--
-- THE PLATFORM CONSOLE CANNOT REGRESS — and this is a proof, not a hope.
-- Platform admins are cross-tenant and carry no `app_role`, so the obvious
-- worry is that a role predicate locks them out. It cannot, because they have
-- never reached these tables through PostgREST: `platformAdminService` has one
-- transport, a single fetch to `/functions/v1/platform-admin`, and that function
-- builds its DB client from ADMIN_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY and
-- does every tenants/stores write through it. service_role bypasses RLS (RLS is
-- not FORCEd on any table here), and the caller's JWT is used only for
-- `getUser()` identity plus the `public.platform_admins` lookup — never as a
-- database client. The corroborating proof: platform access and tenant
-- membership are disjoint in v1, so a platform admin's JWT carries no
-- `tenant_id` at all, `app.tenant_id()` is NULL, and the CURRENT policy already
-- denies them every row. The console depends on service_role structurally and
-- always has.
--
-- PAIRING AND SYNC ARE UNTOUCHED. `pair-device` is service_role end to end and
-- reads only devices / device_pairing_codes / notification_events — it never
-- selects from stores or tenants. The till's company-block pull goes through
-- `get_company_profile()`, which is SECURITY DEFINER and bypasses RLS. And
-- reads here are unchanged regardless.
--
-- GRANTS ARE DELIBERATELY LEFT ALONE. `authenticated` still holds GRANT ALL on
-- both tables from 20260706000000, and revoking INSERT/UPDATE/DELETE would look
-- like belt-and-braces but would make the owner/admin write policy below
-- unreachable — a gate that can never open is not a gate. RLS is the gate; the
-- grant stays so the gate has something to permit.
--
-- NOT FIXED HERE: `tenant_settings` and `store_settings` sit in the same
-- 20260713000000 template list with the same missing role predicate, and unlike
-- these two the client DOES write `tenant_settings` directly through PostgREST,
-- so tightening them is a behaviour change rather than a no-op. Tracked as
-- D-RLS1 in docs/REGISTER.md — deliberately out of scope, not overlooked.
--
-- NO explicit BEGIN/COMMIT — db push wraps each migration in a transaction.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. stores — read for the tenant, write for owner/admin.
-- ---------------------------------------------------------------------
-- Named drops, not another pg_policies loop: the loop is the template being
-- unwound here, and 20260713000000 left exactly one policy on this table.
DROP POLICY IF EXISTS stores_tenant_isolation ON public.stores;

-- READ: the same predicate the template shipped, so every principal that could
-- see a store yesterday still can — tills included. Deliberately NOT narrowed
-- to app.can_see_store(id): scoping a till to its own store row is a plausible
-- next step but it is a read restriction, and this migration is about writes.
DROP POLICY IF EXISTS stores_tenant_read ON public.stores;
CREATE POLICY stores_tenant_read ON public.stores
  FOR SELECT TO authenticated
  USING (tenant_id = app.tenant_id());

-- WRITE: owner/admin only; a till must never edit the shop it prints for.
-- The predicate is character-identical to upsert_store_company's own gate
-- (20260810000000) on purpose — two layers that disagree are a future bug.
DROP POLICY IF EXISTS stores_tenant_write ON public.stores;
CREATE POLICY stores_tenant_write ON public.stores
  FOR ALL TO authenticated
  USING (tenant_id = app.tenant_id() AND app.app_role() IN ('owner', 'admin'))
  WITH CHECK (tenant_id = app.tenant_id() AND app.app_role() IN ('owner', 'admin'));

-- ---------------------------------------------------------------------
-- 2. tenants — the row's own id IS the tenant (no tenant_id column).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS tenants_tenant_isolation ON public.tenants;

DROP POLICY IF EXISTS tenants_tenant_read ON public.tenants;
CREATE POLICY tenants_tenant_read ON public.tenants
  FOR SELECT TO authenticated
  USING (id = app.tenant_id());

-- WITH CHECK (id = app.tenant_id()) also makes tenant CREATION structurally
-- impossible for any authenticated principal: the only id that satisfies it is
-- one that already exists. Tenant lifecycle stays service_role
-- (platform_delete_tenant is service_role-only for the same reason).
DROP POLICY IF EXISTS tenants_tenant_write ON public.tenants;
CREATE POLICY tenants_tenant_write ON public.tenants
  FOR ALL TO authenticated
  USING (id = app.tenant_id() AND app.app_role() IN ('owner', 'admin'))
  WITH CHECK (id = app.tenant_id() AND app.app_role() IN ('owner', 'admin'));

-- ---------------------------------------------------------------------
-- 2b. The policies above answer "who is asking". They cannot answer "which
-- column", because RLS has no column granularity — that is what GRANT is for.
--
-- Without this, the role gate closes the device hole and leaves the owner one
-- wide open: an owner JWT could still PATCH /rest/v1/tenants?id=eq.<own> with
-- {"nif": …} and rewrite the fiscal identity that already-issued documents were
-- signed under. 20260810000000 states the opposite rule in its own header
-- ("FIRMA + NIPC sysadmin only, via the platform console") and enforces it only
-- in the Settings UI, which is not a security boundary.
--
-- Safe to revoke outright rather than column-list, because NOTHING authenticated
-- writes these tables: every tenant mutation runs in the platform-admin edge
-- function on a service_role client, and every store mutation goes through a
-- SECURITY DEFINER RPC (upsert_store_company). Both bypass RLS and grants
-- alike, so they are unaffected. There is no `.from('tenants')` or
-- `.from('stores')` write anywhere in src/.
--
-- The write POLICIES above are kept deliberately even though the grant now
-- makes them unreachable: if a later migration re-grants writes, the role gate
-- is already in place rather than silently absent.
REVOKE INSERT, UPDATE, DELETE ON public.tenants FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.stores  FROM authenticated, anon;

-- ---------------------------------------------------------------------
-- 3. Fail loudly if anything else is still attached to these two tables.
-- ---------------------------------------------------------------------
-- The drops above name their targets, because the two policies that exist are
-- known: the anon-era set from 20260706000000 (already swept by 20260713000000's
-- own DO-loop) and the template policies dropped here. But this is a security
-- fix, and the way a security fix fails is SILENTLY: any permissive policy that
-- survived — dashboard-created, or from a branch that never reached this tree —
-- would simply OR with the role gate above and re-open the exact hole. So
-- assert the end state instead of assuming it, and refuse to apply if it is
-- wrong. A migration that will not apply is cheap; one that applies and leaves
-- a till able to rewrite the NIF is not.
DO $$
DECLARE
  v_stray text;
BEGIN
  SELECT string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename || '.' || policyname)
    INTO v_stray
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('tenants', 'stores')
    AND policyname NOT IN (
      'tenants_tenant_read', 'tenants_tenant_write',
      'stores_tenant_read',  'stores_tenant_write'
    );
  IF v_stray IS NOT NULL THEN
    RAISE EXCEPTION
      'unexpected policy still on tenants/stores: % — it would OR with the owner/admin write gate and re-open the device-write hole',
      v_stray
      USING ERRCODE = '42501';
  END IF;
END $$;
