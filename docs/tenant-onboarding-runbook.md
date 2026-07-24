# Tenant Onboarding Runbook — owner ↔ store ↔ tills linkage + subscription plan

**Type:** Ops runbook + gap register. **Context (user, 2026-07-24):** dev runs on the `testowner` QA fixture, which is NOT properly linked to a store and tills — acceptable for dev, **must be fixed for prod tenants**. Also: tenants now carry a `subscription_plan` (migration `20260801000000`).

## A. What "properly linked" means

A production tenant must have ALL of:

1. **`tenants` row** — real `name`/`legal_name`/`nif`, `status='active'`, and a deliberate `subscription_plan` (⚠️ plan names `trial|basic|standard|premium` are **provisional** — confirm/rename before the first paying tenant; see the CHECK constraint in `20260801000000`).
2. **≥1 real `stores` row** for the tenant (not the seeded `Default Store` placeholder `…0002`).
3. **Owner membership linked to stores**: the owner's `tenant_members` row either
   - `store_ids = NULL` → deliberate **tenant-wide** scope (valid for owners), or
   - an explicit `uuid[]` of that tenant's stores.
   Since `20260801000000`, garbage linkage is impossible: a DB trigger (`app.validate_tenant_member_store_ids`) rejects `store_ids` naming stores that don't exist or belong to another tenant, and `provision-human` validates the same at request time (`unknown_store_ids`). What the schema CANNOT catch is a *forgotten* linkage (`NULL` when a store-scoped role was intended) — that's a provisioning-discipline item.
4. **Tills enrolled per store**: each physical till has a `devices` row with the correct `store_id`, enrolled via the pair-device flow (`status='enrolled'`).

## B. Dev state today (why testowner is "fine for dev")

`testowner` (REGISTER D19: `test-owner@easysoft.local`, QA fixture on EasySoft) is an owner on the **default tenant** `…0001` with `store_ids = NULL`, riding the seeded placeholder `Default Store`. Nothing enforces that a *real* store exists or that devices point anywhere meaningful — exactly the gap §A closes for prod.

## C. Prod fix procedure (per tenant; also applies to converting EasySoft itself)

⚠️ Writes to prod are gated (prod-write guardrail) — run with explicit go-ahead, after `db push` of `20260801000000`.

```sql
-- 1. Real store (or UPDATE the placeholder into a real one for the pilot tenant)
UPDATE public.stores
SET name = '<real store name>', address = ..., city = ..., postal_code = ...
WHERE id = '00000000-0000-0000-0000-000000000002' AND tenant_id = '00000000-0000-0000-0000-000000000001';

-- 2. Owner linkage (explicit store scope; or keep NULL as a DELIBERATE tenant-wide choice)
UPDATE public.tenant_members
SET store_ids = ARRAY['<store-uuid>']::uuid[]
WHERE user_id = '<owner auth uid>' AND tenant_id = '<tenant uuid>' AND role = 'owner';

-- 3. Subscription plan
UPDATE public.tenants SET subscription_plan = '<plan>' WHERE id = '<tenant uuid>';

-- 4. Verify (all three must come back clean)
SELECT t.id, t.name, t.subscription_plan,
       (SELECT count(*) FROM stores s WHERE s.tenant_id = t.id AND s.status = 'active')      AS active_stores,
       (SELECT count(*) FROM devices d WHERE d.tenant_id = t.id AND d.status = 'enrolled')   AS enrolled_tills,
       (SELECT count(*) FROM tenant_members m WHERE m.tenant_id = t.id AND m.role = 'owner') AS owners
FROM tenants t WHERE t.id = '<tenant uuid>';
```

Note: `store_ids` lives in BOTH `tenant_members` and the user's JWT `app_metadata` (stamped by `provision-human`). If you change a member's `store_ids` by SQL, re-stamp `app_metadata` (or re-provision) — otherwise the JWT keeps the old scope until it is re-issued.

## D. ⚠️ Open gaps (no silent deferrals)

| # | Gap | Lands / revisit | Risk if forgotten |
|---|---|---|---|
| T-1 | **Plan names provisional** (`trial|basic|standard|premium` invented 2026-07-24 — no product tier names exist in the repo) | Before first paying tenant | Billing tier taxonomy churn after tenants exist |
| T-2 | **No `admin-provision-tenant` pipeline** — tenant+store+owner+fiscal-tree creation is still manual SQL + edge calls (the plan's §7.5 `admin-provision-tenant` remains unbuilt) | Before tenant #2 (Phase 5) | Hand-provisioning errors: exactly the unlinked-owner state this runbook exists to prevent |
| T-3 | **JWT re-stamp on SQL scope changes** is manual (§C note) | With T-2 (pipeline should own claims) | Member keeps stale store scope ≤ JWT expiry, or until re-login |
| T-4 | **Migration `20260801000000`** | ✅ APPLIED to prod (EasySoft) 2026-07-24, user-ordered `db push`; verified in remote migration ledger. Staging still unpushed (B3 — password unknown) | Staging drift until B3 resolves |
| T-5 | **`provision-human` employee_id link** still absent (role-taxonomy gap, pre-existing) | P2 identity work | Human members not joinable to `employees` rows for attribution |
