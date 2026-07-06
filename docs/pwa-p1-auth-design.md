# PWA P1 — Human Auth Design (reconciled to user decisions)

Companion to `docs/pwa-plan.md` §3. Captures the 2026-07-06 decisions and the concrete
build, grounded in the existing schema. Branch `pwa`.

## Decisions (user, 2026-07-06)
- **Onboarding:** admin-set initial password, **no email/SMTP**. Reset = admin sets a new one.
- **Store scope:** **ENFORCED** as a security boundary (not UX-only).
- **Tenant cardinality:** **MULTI-TENANT** — a person can belong to several tenants and switch.
- **Username:** global-unique (defaulted); login by username OR email.

## What already exists (no rebuild)
- `tenant_members(user_id, tenant_id, role∈{owner,admin,manager}, store_ids uuid[], employee_id)` — PK `(user_id, tenant_id)`, so **multi-tenant + store-scope ready**.
- `app.tenant_id()`, `app.app_role()`, `app.store_ids()` claim helpers (`20260707000000`) — read from JWT `app_metadata`; isolate the claim source so a future token-hook swap touches no policy.
- Phase-3 RLS on `tenant_members` (`tenant_id = app.tenant_id()`). **Added** `tenant_members_self_read` (`user_id = auth.uid()`) so a human can list their memberships for the switcher (`20260718000000`).
- `user_profiles(user_id, username citext unique, …)` — server-only username store (`20260718000000`).

## Claim minting — NO dashboard token hook (v1)
The Custom Access Token Hook (`config.toml:225`, commented) stays deferred. Instead, service-role edge fns stamp `app_metadata`:
- **`pwa-login`** (verify_jwt=false): body `{ identifier, password }`. Server-side: resolve `identifier` (email or `user_profiles.username`) → the auth user (single exact match; generic errors; rate-limited per identifier+IP — no enumeration oracle). `signInWithPassword` server-side. Load `tenant_members` for the user. If **1** membership → stamp `app_metadata = {tenant_id, app_role:role, store_ids}` for it and return the session. If **>1** → return the membership list (no session yet) for the client to pick, then `switch-tenant` mints. **Never returns the email.**
- **`switch-tenant`** (verify_jwt=true): body `{ tenant_id }`. Assert the caller is a member of `tenant_id`; `admin.updateUserById` sets `app_metadata` for that membership; client calls `supabase.auth.refreshSession()` → new claims. (Overwriting `app_metadata.tenant_id` here is intentional — it holds the *active* selection; `tenant_members` is the source of truth.)
- **`provision-human`** (service role; script `scripts/provision-human.mjs` for v1 bootstrap) — **hard authz invariants (D21):** verify_jwt; caller `app_role ∈ {owner,admin}`; new user's `tenant_id` FORCED to the caller's verified JWT tenant (reject body `tenant_id`); never stamp `device_id`/device role; role ≤ caller's; `store_ids ⊆ caller`. Creates the auth user with an **admin-set password**, `user_profiles` row, and the `tenant_members` row. A **second** membership for an existing user is allowed (multi-tenant) — it does NOT overwrite the first (rows are per `(user_id, tenant_id)`).

## Store-scope enforcement (pulled forward from P7)
- Claims carry `store_ids` (per active membership) → `app.store_ids()`.
- **Requires** `transactions.store_id` + `daily_sales_summary.store_id` (do not exist today) + a device→store backfill. RLS store predicate for store-scoped roles: `store_id = ANY(app.store_ids())` (owners/admins may be tenant-wide with `store_ids = NULL/all`).
- Tenant-level entities (products/categories/customers) have **no** store dimension — a store manager sees the shared tenant catalog; store-scope does not restrict them.
- **Build order:** the store dimension + RLS predicates land with the read surfaces (P2) since reports are where store-scope first bites.

## Principal refactor (D24) — needed because a human has no `employees` row
- `isAuthenticated` currently keys on `!!employee` (`SupabaseAuthContext.tsx:313`). Change to key on **tenant_members membership**.
- Introduce a normalized principal `{ userId, displayName, role, tenantId, storeIds, capabilities }` populated by **both** device-employee and membership-only humans; repoint the ~88 `state.employee` consumers.
- Role→capability map replaces `access_levels`/`systemAdmin` for humans.

## Register
- **D21** provision-human authz invariants. **D24** null-employee/principal refactor. **D28→resolved-as-multi-tenant** (cardinality). **D29** store-scope now = SECURITY (executed, not deferred). **D22** pwa-login no-enumeration. **New D17** claim minting via edge-fn (token hook deferred). **New D18** `transactions.store_id`/`daily_sales_summary.store_id` pulled forward from P7 for store-scope.

## Build order (P1)
1. ✅ Identity schema (`user_profiles` + `tenant_members` self-read) — `20260718000000`.
2. `pwa-login` + `switch-tenant` + `provision-human` (service-role edge fns) + `scripts/provision-human.mjs`.
3. Host-aware routing (`HostRoute`, host-aware `getRoleBasedRedirect` + PWA catch-all, sidebar host filter).
4. Principal refactor (membership-based `isAuthenticated` + normalized principal + capability map).
5. Store dimension + RLS store predicates (with P2 read surfaces).
