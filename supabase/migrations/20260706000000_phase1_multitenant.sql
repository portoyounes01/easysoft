-- =====================================================================
-- PHASE 1 — MULTI-TENANT BACKBONE (single, app-invisible migration)
-- Suggested filename: supabase/migrations/20260706000000_phase1_multitenant.sql
-- RUN AFTER: 20250101000000_genesis_baseline + the intermediate migrations
--            + 20260705000000_phase0_hardening.
--
-- Assembled from 3 area designs (control-plane, tenant-id-rescoping,
-- rls-compat-constraints) into ONE apply-order-correct file. No BEGIN/COMMIT
-- wrapper (Supabase CLI wraps each migration in its own transaction).
--
-- FIXED SEED UUIDs — unified across the seed and every tenant_id DEFAULT:
--   DEFAULT TENANT = 00000000-0000-0000-0000-000000000001
--   DEFAULT STORE  = 00000000-0000-0000-0000-000000000002
-- The tenant UUID is a literal (never gen_random_uuid) precisely so the
-- business-table `ADD tenant_id ... DEFAULT '000...001'` resolves to a real,
-- seeded FK target row.
--
-- APP-INVISIBLE: strictly additive. Creates 8 new tables + seeds 4 rows, and
-- adds a DEFAULT-filled tenant_id column to 10 existing business tables. The
-- anon app supplies no tenant_id on any insert, so the DEFAULT fills it; the
-- per-tenant composite uniques reject EXACTLY the same rows the old global
-- uniques did while a single tenant exists; RLS on new tables mirrors the
-- genesis permissive-anon posture. Existing-table RLS is untouched.
--
-- NO CODE CO-DELIVERY NEEDED (revised after adversarial review). Phase 1 ADDS
-- the per-tenant composite uniques but KEEPS the bare global uniques
-- (employees_employee_number_key, products_sku_key, transactions_transaction_number_key).
-- Under the single default tenant the bare and composite uniques are equivalent,
-- so every ON CONFLICT arbiter keeps resolving unchanged — the SECURITY DEFINER
-- upserts (upsert_employees ON CONFLICT (employee_number), upsert_products
-- ON CONFLICT (sku)) AND the direct anon PostgREST upserts in seedData.ts
-- (onConflict:'sku' / 'employee_number') all continue to work with ZERO code
-- changes. This keeps Phase 1 STRICTLY app-invisible and self-contained.
-- Dropping the bare uniques is DEFERRED to the phase that rewrites every write
-- path to be tenant-aware (multiple tenants would make a bare global unique on
-- employee_number/sku wrong; with one tenant it is harmless).
-- =====================================================================


-- =====================================================================
-- (1) CONTROL PLANE — tenants + stores  (create first so FK + DEFAULT work)
-- =====================================================================

-- tenants (one legal entity / one NIF) --------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  legal_name      text NOT NULL,
  nif             text NOT NULL CHECK (nif ~ '^[0-9]{9}$'),   -- PT tax id (9 digits)
  country         text NOT NULL DEFAULT 'PT',
  status          text NOT NULL DEFAULT 'provisioning'
                    CHECK (status IN ('provisioning','active','suspended','offboarding')),
  registry_number text,
  share_capital   numeric(14,2),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- stores (physical establishment) -------------------------------------
CREATE TABLE IF NOT EXISTS public.stores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id),
  name          text NOT NULL,
  address       text,
  postal_code   text,
  city          text,
  phone         text,
  email         text,
  tax_id        text,
  timezone      text NOT NULL DEFAULT 'Europe/Lisbon',
  fiskaly_location_id_test text,
  fiskaly_location_id_live text,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)                       -- composite-FK target (devices; future transactions)
);
CREATE INDEX IF NOT EXISTS idx_stores_tenant_id ON public.stores(tenant_id);


-- =====================================================================
-- (2) SEED — default tenant + default store at the FIXED UUIDs.
--     Idempotent. Must precede the business-table ADD tenant_id so the
--     column DEFAULT references a live tenants row.
-- =====================================================================
INSERT INTO public.tenants (id, name, legal_name, nif, country, status)
VALUES ('00000000-0000-0000-0000-000000000001',
        'Default Tenant', 'Default Tenant', '000000000', 'PT', 'active')
ON CONFLICT (id) DO NOTHING;
-- '000000000' is a valid-shaped placeholder NIF (matches ^[0-9]{9}$);
-- Phase 2 provisioning overwrites name/legal_name/nif/status.

INSERT INTO public.stores (id, tenant_id, name, timezone, status)
VALUES ('00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000001',
        'Default Store', 'Europe/Lisbon', 'active')
ON CONFLICT (id) DO NOTHING;


-- =====================================================================
-- (3) CONTROL PLANE — remaining tables (each references only already-created
--     objects: no forward references).
-- =====================================================================

-- devices (till registry — replaces localStorage pos_terminal_id) -----
CREATE TABLE IF NOT EXISTS public.devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id),
  store_id      uuid NOT NULL,
  label         text NOT NULL,
  status        text NOT NULL DEFAULT 'provisioned'
                  CHECK (status IN ('provisioned','enrolled','revoked')),
  auth_user_id  uuid REFERENCES auth.users(id),
  fiskaly_system_id_test text,
  fiskaly_system_id_live text,
  training_mode boolean NOT NULL DEFAULT false,
  enrolled_at   timestamptz,
  last_seen_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),                       -- composite-FK target (future transactions.device_id)
  FOREIGN KEY (tenant_id, store_id)
    REFERENCES public.stores (tenant_id, id)    -- cross-tenant store-assignment guard
);
CREATE INDEX IF NOT EXISTS idx_devices_tenant_id    ON public.devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_devices_tenant_store ON public.devices(tenant_id, store_id);
CREATE INDEX IF NOT EXISTS idx_devices_status       ON public.devices(status);

-- device_pairing_codes (Phase 2 enrollment prep) ----------------------
CREATE TABLE IF NOT EXISTS public.device_pairing_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id),
  store_id      uuid REFERENCES public.stores(id),
  device_id     uuid REFERENCES public.devices(id),
  code_hash     text NOT NULL,                -- sha256 of a >=128-bit code; raw code NEVER stored
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  attempt_count int NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pairing_code_hash   ON public.device_pairing_codes(code_hash);
CREATE INDEX        IF NOT EXISTS idx_pairing_tenant_id  ON public.device_pairing_codes(tenant_id);
CREATE INDEX        IF NOT EXISTS idx_pairing_expires_at ON public.device_pairing_codes(expires_at);
CREATE INDEX        IF NOT EXISTS idx_pairing_device_id  ON public.device_pairing_codes(device_id);

-- tenant_members (humans: till admins now, PWA managers later) ---------
CREATE TABLE IF NOT EXISTS public.tenant_members (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id),
  role        text NOT NULL CHECK (role IN ('owner','admin','manager')),
  store_ids   uuid[],
  employee_id uuid,                            -- optional link to employees (no FK: cross-area dep)
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_id ON public.tenant_members(tenant_id);

-- tenant_settings (1 row/tenant) --------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_settings (
  tenant_id  uuid PRIMARY KEY REFERENCES public.tenants(id),
  data       jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- store_settings (1 row/store) ----------------------------------------
CREATE TABLE IF NOT EXISTS public.store_settings (
  store_id   uuid PRIMARY KEY REFERENCES public.stores(id),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id),
  data       jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_settings_tenant_id ON public.store_settings(tenant_id);

-- notification_events (PWA groundwork; write-from-day-one, delivery deferred)
CREATE TABLE IF NOT EXISTS public.notification_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id),
  store_id          uuid,                       -- bare uuid (append-only events table; no FK)
  device_id         uuid,
  event_type        text NOT NULL CHECK (event_type IN (
                       'CREDIT_NOTE_ISSUED','REFUND_ISSUED','FISCAL_CANCELLATION','LARGE_DISCOUNT',
                       'DRAWER_DISCREPANCY','DRAWER_OPEN_NO_SALE','PRICE_OVERRIDE','DEVICE_ENROLLED',
                       'DEVICE_REVOKED','PAIRING_FAILED','SAFT_GENERATED','FISCAL_ISSUE_FAILED',
                       'TRAINING_MODE_CHANGED')),
  severity          text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  actor_employee_id uuid,
  entity_table      text,
  entity_id         uuid,
  payload           jsonb NOT NULL DEFAULT '{}',
  delivered_at      timestamptz,                -- null = undelivered; future PWA worker stamps it
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_tenant_created      ON public.notification_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_tenant_type_created ON public.notification_events(tenant_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_undelivered         ON public.notification_events(tenant_id, created_at) WHERE delivered_at IS NULL;

-- Seed the empty settings rows for the default tenant/store (idempotent).
-- Placed here (not in step 2) because these tables did not exist until now.
INSERT INTO public.tenant_settings (tenant_id, data)
VALUES ('00000000-0000-0000-0000-000000000001', '{}')
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO public.store_settings (store_id, tenant_id, data)
VALUES ('00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000001', '{}')
ON CONFLICT (store_id) DO NOTHING;


-- =====================================================================
-- (4) BUSINESS TABLES — add tenant_id (NOT NULL DEFAULT '000...001' REFERENCES
--     tenants) + a plain (tenant_id) index to each of the 10 tables.
--     Greenfield => 0 rows => instant. The app omits tenant_id on every
--     insert, so every row auto-populates the default tenant via the DEFAULT
--     — this is the app-invisibility mechanism.
-- =====================================================================
ALTER TABLE public.employees           ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.tenants(id);
ALTER TABLE public.categories          ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.tenants(id);
ALTER TABLE public.products            ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.tenants(id);
ALTER TABLE public.customers           ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.tenants(id);
ALTER TABLE public.transactions        ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.tenants(id);
ALTER TABLE public.transaction_items   ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.tenants(id); -- denormalized so RLS never joins
ALTER TABLE public.daily_sales_summary ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.tenants(id);
ALTER TABLE public.cash_drawer_logs    ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.tenants(id);
ALTER TABLE public.print_logs          ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.tenants(id);
ALTER TABLE public.cashier_tests       ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.tenants(id);

CREATE INDEX IF NOT EXISTS idx_employees_tenant_id           ON public.employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_categories_tenant_id          ON public.categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_tenant_id            ON public.products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_id           ON public.customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_id        ON public.transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_tenant_id   ON public.transaction_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_daily_sales_summary_tenant_id ON public.daily_sales_summary(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_logs_tenant_id    ON public.cash_drawer_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_print_logs_tenant_id          ON public.print_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cashier_tests_tenant_id       ON public.cashier_tests(tenant_id);
-- NOTE: on employees/products/transactions the plain (tenant_id) index is
-- redundant with the tenant_id-leading composite indexes created in steps
-- (5) and (6); kept per the task's "+ index to each business table". A later
-- pass may drop these three and prefer (tenant_id, updated_at) on the 6
-- delta-synced tables.


-- =====================================================================
-- (5) ADD per-tenant composite uniques. The bare global uniques are KEPT
--     (NOT dropped) so all existing ON CONFLICT arbiters keep working with
--     zero code changes — see header. Dropping the bare uniques is deferred
--     to the tenant-aware-write-path phase. Guarded for safe re-apply.
-- =====================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_tenant_id_employee_number_key' AND conrelid = 'public.employees'::regclass) THEN
    ALTER TABLE public.employees ADD CONSTRAINT employees_tenant_id_employee_number_key UNIQUE (tenant_id, employee_number);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_tenant_id_sku_key' AND conrelid = 'public.products'::regclass) THEN
    ALTER TABLE public.products ADD CONSTRAINT products_tenant_id_sku_key UNIQUE (tenant_id, sku);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_tenant_id_transaction_number_key' AND conrelid = 'public.transactions'::regclass) THEN
    ALTER TABLE public.transactions ADD CONSTRAINT transactions_tenant_id_transaction_number_key UNIQUE (tenant_id, transaction_number);
  END IF;
END $$;

-- daily_sales_summary PK (summary_date, employee_id): LEFT UNCHANGED. Already
--   per-tenant-safe (employee_id is globally unique and each employee belongs
--   to one tenant), so update_daily_sales_summary()'s ON CONFLICT
--   (summary_date, employee_id) keeps working with ZERO trigger edits. Target
--   PK (tenant_id, summary_date, employee_id) is deferred to the phase that
--   rewrites that trigger (is_training exclusion).
-- No uniqueness added to categories.name / products.barcode / customers.tax_number:
--   none is unique in genesis; adding one would reject currently-valid dup
--   inserts. Plan's OPTIONAL partial uniques on barcode/tax_number are additive
--   (not rescopes) and are deferred.
-- generate_transaction_number() + transaction_number_sequence: KEPT AS-IS
--   (global). Correct for a single tenant; per-tenant/fiskaly numbering is
--   Phase 4. Do NOT drop the sequence or generator now.


-- =====================================================================
-- (6) COMPOSITE-FK PARENT GROUNDWORK — parent UNIQUE (tenant_id, id) on the
--     four pre-existing composite-FK parents. Cheap on greenfield (one btree
--     each). DEFER the child composite-FK rewrite (transaction_items->{trans-
--     actions,products}, transactions->{employees,customers,stores}) to a
--     later phase so Phase 1 never touches the app's INSERT shape.
--     Cannot break any write: every app ON CONFLICT names an explicit arbiter,
--     so no conflict-target inference becomes ambiguous.
-- =====================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_tenant_id_uk' AND conrelid = 'public.transactions'::regclass) THEN
    ALTER TABLE public.transactions ADD CONSTRAINT transactions_tenant_id_uk UNIQUE (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_tenant_id_uk' AND conrelid = 'public.products'::regclass) THEN
    ALTER TABLE public.products ADD CONSTRAINT products_tenant_id_uk UNIQUE (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_tenant_id_uk' AND conrelid = 'public.employees'::regclass) THEN
    ALTER TABLE public.employees ADD CONSTRAINT employees_tenant_id_uk UNIQUE (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_tenant_id_uk' AND conrelid = 'public.customers'::regclass) THEN
    ALTER TABLE public.customers ADD CONSTRAINT customers_tenant_id_uk UNIQUE (tenant_id, id);
  END IF;
END $$;
-- stores/devices already carry inline UNIQUE(tenant_id, id) from step (1)/(3).
-- daily_sales_summary is a denormalized-tenant_id child (PK rescoped later),
--   NOT a composite-FK parent -> no UNIQUE(tenant_id, id).
-- categories UNIQUE(tenant_id, id) intentionally OMITTED (no planned
--   products->categories composite FK).


-- =====================================================================
-- (7) RLS + PERMISSIVE-ANON POLICIES + GRANTS on the 8 NEW tables only.
--     Mirrors the genesis baseline exactly (TO anon, USING(true)/WITH
--     CHECK(true); named <table>_anon_{select,insert,update,delete};
--     drop-guarded). The genesis blanket GRANT ran BEFORE these tables
--     existed, so it does NOT cover them -> grant explicitly per table.
--     Existing business-table RLS/grants are UNCHANGED (their table-level
--     grant already covers the new tenant_id column). No sequences: every PK
--     is uuid/gen_random_uuid. A later phase swaps these for tenant-scoped
--     policies and REVOKEs anon.
-- =====================================================================

-- GRANTS (new tables) -------------------------------------------------
GRANT ALL ON public.tenants              TO anon, authenticated;
GRANT ALL ON public.stores               TO anon, authenticated;
GRANT ALL ON public.devices              TO anon, authenticated;
GRANT ALL ON public.device_pairing_codes TO anon, authenticated;
GRANT ALL ON public.tenant_members       TO anon, authenticated;
GRANT ALL ON public.tenant_settings      TO anon, authenticated;
GRANT ALL ON public.store_settings       TO anon, authenticated;
GRANT ALL ON public.notification_events  TO anon, authenticated;

-- tenants
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenants_anon_select ON public.tenants;
DROP POLICY IF EXISTS tenants_anon_insert ON public.tenants;
DROP POLICY IF EXISTS tenants_anon_update ON public.tenants;
DROP POLICY IF EXISTS tenants_anon_delete ON public.tenants;
CREATE POLICY tenants_anon_select ON public.tenants FOR SELECT TO anon USING (true);
CREATE POLICY tenants_anon_insert ON public.tenants FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY tenants_anon_update ON public.tenants FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY tenants_anon_delete ON public.tenants FOR DELETE TO anon USING (true);

-- stores
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stores_anon_select ON public.stores;
DROP POLICY IF EXISTS stores_anon_insert ON public.stores;
DROP POLICY IF EXISTS stores_anon_update ON public.stores;
DROP POLICY IF EXISTS stores_anon_delete ON public.stores;
CREATE POLICY stores_anon_select ON public.stores FOR SELECT TO anon USING (true);
CREATE POLICY stores_anon_insert ON public.stores FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY stores_anon_update ON public.stores FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY stores_anon_delete ON public.stores FOR DELETE TO anon USING (true);

-- devices
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS devices_anon_select ON public.devices;
DROP POLICY IF EXISTS devices_anon_insert ON public.devices;
DROP POLICY IF EXISTS devices_anon_update ON public.devices;
DROP POLICY IF EXISTS devices_anon_delete ON public.devices;
CREATE POLICY devices_anon_select ON public.devices FOR SELECT TO anon USING (true);
CREATE POLICY devices_anon_insert ON public.devices FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY devices_anon_update ON public.devices FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY devices_anon_delete ON public.devices FOR DELETE TO anon USING (true);

-- device_pairing_codes
ALTER TABLE public.device_pairing_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS device_pairing_codes_anon_select ON public.device_pairing_codes;
DROP POLICY IF EXISTS device_pairing_codes_anon_insert ON public.device_pairing_codes;
DROP POLICY IF EXISTS device_pairing_codes_anon_update ON public.device_pairing_codes;
DROP POLICY IF EXISTS device_pairing_codes_anon_delete ON public.device_pairing_codes;
CREATE POLICY device_pairing_codes_anon_select ON public.device_pairing_codes FOR SELECT TO anon USING (true);
CREATE POLICY device_pairing_codes_anon_insert ON public.device_pairing_codes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY device_pairing_codes_anon_update ON public.device_pairing_codes FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY device_pairing_codes_anon_delete ON public.device_pairing_codes FOR DELETE TO anon USING (true);

-- tenant_members
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_members_anon_select ON public.tenant_members;
DROP POLICY IF EXISTS tenant_members_anon_insert ON public.tenant_members;
DROP POLICY IF EXISTS tenant_members_anon_update ON public.tenant_members;
DROP POLICY IF EXISTS tenant_members_anon_delete ON public.tenant_members;
CREATE POLICY tenant_members_anon_select ON public.tenant_members FOR SELECT TO anon USING (true);
CREATE POLICY tenant_members_anon_insert ON public.tenant_members FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY tenant_members_anon_update ON public.tenant_members FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY tenant_members_anon_delete ON public.tenant_members FOR DELETE TO anon USING (true);

-- tenant_settings
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_settings_anon_select ON public.tenant_settings;
DROP POLICY IF EXISTS tenant_settings_anon_insert ON public.tenant_settings;
DROP POLICY IF EXISTS tenant_settings_anon_update ON public.tenant_settings;
DROP POLICY IF EXISTS tenant_settings_anon_delete ON public.tenant_settings;
CREATE POLICY tenant_settings_anon_select ON public.tenant_settings FOR SELECT TO anon USING (true);
CREATE POLICY tenant_settings_anon_insert ON public.tenant_settings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY tenant_settings_anon_update ON public.tenant_settings FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY tenant_settings_anon_delete ON public.tenant_settings FOR DELETE TO anon USING (true);

-- store_settings
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_settings_anon_select ON public.store_settings;
DROP POLICY IF EXISTS store_settings_anon_insert ON public.store_settings;
DROP POLICY IF EXISTS store_settings_anon_update ON public.store_settings;
DROP POLICY IF EXISTS store_settings_anon_delete ON public.store_settings;
CREATE POLICY store_settings_anon_select ON public.store_settings FOR SELECT TO anon USING (true);
CREATE POLICY store_settings_anon_insert ON public.store_settings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY store_settings_anon_update ON public.store_settings FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY store_settings_anon_delete ON public.store_settings FOR DELETE TO anon USING (true);

-- notification_events
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_events_anon_select ON public.notification_events;
DROP POLICY IF EXISTS notification_events_anon_insert ON public.notification_events;
DROP POLICY IF EXISTS notification_events_anon_update ON public.notification_events;
DROP POLICY IF EXISTS notification_events_anon_delete ON public.notification_events;
CREATE POLICY notification_events_anon_select ON public.notification_events FOR SELECT TO anon USING (true);
CREATE POLICY notification_events_anon_insert ON public.notification_events FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY notification_events_anon_update ON public.notification_events FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY notification_events_anon_delete ON public.notification_events FOR DELETE TO anon USING (true);