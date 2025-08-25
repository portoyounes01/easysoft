### Multi-Tenant Migration Plan (Supabase)

This document defines a safe, production-grade plan to migrate from a single-tenant schema (one DB per restaurant) to a single Supabase project hosting multiple restaurants (tenants) with strict isolation via Row-Level Security (RLS).

Audience: Engineering, DevOps. Scope: Database schema, RLS, RPCs, storage policies, and cutover. Client changes are referenced where needed and will follow `DEVELOPMENT_GUIDE.md` patterns.

---

#### Objectives
- Consolidate restaurants into one Supabase project (single database) while preserving isolation
- Enforce tenant boundaries using RLS and tenant-scoped constraints
- Maintain zero-downtime migration with safe backfills, roll-forward/rollback strategies
- Provide a scaling path: indexes, partitioning, read-replicas

#### Non-Goals
- LocalDB changes (out of scope for this plan)
- Full client refactor details (covered in follow-up app tasks; will follow `DEVELOPMENT_GUIDE.md`)

---

### 1) Current State Summary
- No tenant columns; tables like `employees`, `products`, `categories`, `customers`, `transactions`, `transaction_items`, `daily_sales_summary`, `cash_drawer_logs`, `print_logs`, `cashier_tests` are global.
- Uniques are global: `products.sku`, `employees.employee_number`, `transactions.transaction_number`.
- RLS policies are role-centric and sometimes overly permissive; several compare UUIDs as TEXT.
- RPCs (delta/upsert) and views are not tenant-scoped.

---

### 2) Target Architecture (Shared Schema, RLS)
- Single DB, shared schema. Every business row carries `organization_id` (tenant) and optional `location_id`.
- Authorization via `app.user_memberships` join in RLS; roles: `admin`, `manager`, `cashier`, `trainee`.
- Unique constraints and common indexes are tenant-leading (start with `organization_id`).
- Functions, views, and storage policies are tenant-scoped.

Schema additions (new `app` schema):

```sql
CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS app.user_memberships (
  user_id UUID NOT NULL,              -- auth.users.id
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','cashier','trainee')),
  PRIMARY KEY (user_id, organization_id)
);
```

---

### 3) Table-by-Table Changes (Add columns, constraints, indexes)

General pattern for all business tables:
- Add columns (nullable first): `organization_id UUID`, optional `location_id UUID`
- Backfill `organization_id`
- Create tenant-leading unique constraints and indexes
- Enforce same-tenant relationships via CHECK helpers
- Flip `organization_id` to NOT NULL

Employees (`public.employees`)
- Columns: `organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE`, optional `location_id UUID REFERENCES app.locations(id) ON DELETE SET NULL`
- Uniques: `UNIQUE (organization_id, employee_number)` (drop global unique)
- Indexes: `(organization_id, role)`, `(organization_id, updated_at)`

Categories (`public.categories`)
- Columns: `organization_id UUID NOT NULL`
- Uniques: `UNIQUE (organization_id, name)`
- Indexes: `(organization_id, is_active)`, `(organization_id, updated_at)`

Products (`public.products`)
- Columns: `organization_id UUID NOT NULL`, optional `location_id`
- Uniques: `UNIQUE (organization_id, sku)` (drop global unique)
- Indexes: `(organization_id, category_id)`, `(organization_id, name)`, `(organization_id, updated_at)`

Customers (`public.customers`)
- Columns: `organization_id UUID NOT NULL`
- Optional uniques: `UNIQUE (organization_id, email)`
- Indexes: `(organization_id, updated_at)`, `(organization_id, is_active)`

Transactions (`public.transactions`)
- Columns: `organization_id UUID NOT NULL`, optional `location_id`
- Uniques: `UNIQUE (organization_id, transaction_number)` (drop global unique)
- Indexes: `(organization_id, transaction_date)`, `(organization_id, status)`, `(organization_id, updated_at)`

Transaction Items (`public.transaction_items`)
- Columns: `organization_id UUID NOT NULL`
- Indexes: `(organization_id, transaction_id)`, `(organization_id, product_id)`, `(organization_id, updated_at)`

Daily Sales Summary (`public.daily_sales_summary`)
- Columns: `organization_id UUID NOT NULL`
- PK: `PRIMARY KEY (organization_id, summary_date, employee_id)`
- Indexes: `(organization_id, summary_date)`, `(organization_id, employee_id)`

Cashier Logs (`cash_drawer_logs`, `print_logs`, `cashier_tests`)
- Columns: `organization_id UUID NOT NULL`
- Indexes: `(organization_id, timestamp)`, `(organization_id, employee_id)`

Same-tenant FK checks (pattern):
```sql
CREATE OR REPLACE FUNCTION app.ensure_same_org_emp(tx_org UUID, emp_id UUID)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = emp_id AND e.organization_id = tx_org
  );
$$;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_employee_same_org
  CHECK (app.ensure_same_org_emp(organization_id, employee_id));
```

---

### 4) RLS Policies (Tenant + Role)

Policy template (example: `public.products`):
```sql
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY products_select_tenant
ON public.products FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM app.user_memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = products.organization_id
  )
);

CREATE POLICY products_insert_tenant_roles
ON public.products FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM app.user_memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = products.organization_id
      AND m.role IN ('admin','manager')
  )
);

CREATE POLICY products_update_tenant_roles
ON public.products FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM app.user_memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = products.organization_id
      AND m.role IN ('admin','manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM app.user_memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = products.organization_id
      AND m.role IN ('admin','manager')
  )
);
```

Apply the same pattern to: `employees`, `categories`, `customers`, `transactions`, `transaction_items`, `daily_sales_summary`, and cashier logs. Replace any legacy TEXT-based comparisons with UUID equality.

Views: keep `SECURITY INVOKER` and rely on underlying RLS, or add explicit membership filters.

---

### 5) RPCs / Functions Updates
- Add `p_org UUID` parameter to all delta/upsert RPCs and enforce membership inside.
- Update `generate_transaction_number(p_org UUID)` to scope uniqueness per organization.
- Update `update_daily_sales_summary` to aggregate by `organization_id`.
- Remove broad `GRANT ALL`; grant execute only to `authenticated` for specific RPCs. Rely on table RLS for data access.

Example delta function:
```sql
CREATE OR REPLACE FUNCTION public.get_products_delta(p_org UUID, last_sync TIMESTAMPTZ)
RETURNS SETOF public.products
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT p.* FROM public.products p
  WHERE p.organization_id = p_org
    AND p.updated_at > last_sync
    AND EXISTS (
      SELECT 1 FROM app.user_memberships m
      WHERE m.user_id = auth.uid() AND m.organization_id = p_org
    )
  ORDER BY p.updated_at ASC;
$$;
REVOKE ALL ON FUNCTION public.get_products_delta(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_products_delta(UUID, TIMESTAMPTZ) TO authenticated;
```

---

### 6) Storage (Supabase Storage) Policies
- Option A: Single bucket with prefix `organization_id/...`.
- Option B: Bucket per organization (simpler policies, more buckets).
- Policies mirror membership: allow access only when the caller belongs to the organization in the path.

---

### 7) Migration Phases (Zero-Downtime)

Phase 0 – Backups & Readiness
- Enable daily backups and, if available, PITR.
- Document rollback procedures (see section 10).

Phase 1 – Bootstrap Tenancy
- Create `app.organizations`, `app.locations`, `app.user_memberships`.
- Seed a default organization for existing data.
- Map `auth.users` to `app.user_memberships` with appropriate roles.

Phase 2 – Add Columns (Nullable)
- Add `organization_id` (and `location_id` where relevant) to all domain tables as NULL.
- Release safely (no behavior change yet).

Phase 3 – Backfill
- Set `organization_id` for all existing rows to the seed org.
- Validate counts match across tables.

Phase 4 – Constraints & Indexes
- Create tenant-leading unique constraints and indexes.
- Implement same-tenant CHECK helpers for cross-table relationships.

Phase 5 – RLS Harden
- Enable RLS on any table missing it.
- Replace legacy policies with tenant+role policies.
- Remove permissive policies and any TEXT-based UUID comparisons.

Phase 6 – RPCs & Views
- Update delta/upsert RPCs to accept `p_org` and enforce membership.
- Update views to rely on RLS and/or add explicit org filters.

Phase 7 – Flip NOT NULL
- After successful validation in staging, set `organization_id` to NOT NULL on all domain tables.

Phase 8 – Cleanup & Grants
- Drop old global unique constraints and broad GRANTs.
- Ensure minimal, principle-of-least-privilege function grants.

Phase 9 – Scale Options (as needed)
- Add partitions (time or hash by `organization_id`) for `transactions`, `transaction_items`, logs.
- Add read replicas and materialized views for analytics.

---

### 8) Validation & Test Plan
- Unit: policy checks with `auth.uid()` variations for each role and org.
- Integration: full CRUD flows per org; verify cross-org access is denied.
- Sync: delta/upsert RPCs return only tenant-scoped rows.
- Performance: verify query plans hit tenant-leading indexes; watch for seq scans.
- Observability: log denied attempts; ensure error messages are actionable.

Smoke checklist (per table):
- SELECT only returns rows for caller’s org
- INSERT requires membership and correct roles
- UPDATE/DELETE follow role constraints
- Views respect tenant boundaries
- RPCs reject callers outside org

---

### 9) Client Impact (High-Level)
- Client must send/maintain active `organization_id` in requests or select it in RPC params.
- When user switches organization, refresh token or pass `p_org` explicitly; do not rely solely on JWT metadata for authorization.
- All client changes will follow `DEVELOPMENT_GUIDE.md` (naming, state management, error handling).

---

### 10) Rollback Strategy
- If a phase fails:
  - Revert grants/policies to last known good
  - Drop newly added constraints/indexes if they block writes
  - Keep added columns; set RLS back to permissive during incident window
  - Restore from backup only if data corruption occurred

---

### 11) Risks & Mitigations
- Misconfigured RLS causing 403s → Stage with full test matrix; add canary users
- Hot partitions or missing indexes → Create tenant-leading indexes; monitor pg_stat_statements
- Global uniqueness assumptions in app → Update code to pass/handle `organization_id`; introduce org-scoped generators
- Cross-tenant FK drift → Enforce same-tenant CHECK helpers

---

### 12) Timeline (Suggested)
- Week 1: Bootstrap tenancy; add columns; backfill in staging
- Week 2: Constraints, indexes, RLS; update RPCs/views; client wiring in staging
- Week 3: Flip NOT NULL; production rollout with canary tenants; monitoring

---

### 13) References
- `DEVELOPMENT_GUIDE.md`: client changes will follow TS conventions, component structure, error handling, and testing requirements
- Supabase docs (RLS, Storage policies, Auth JWT)


