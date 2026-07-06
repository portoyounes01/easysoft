# PWA Implementation Plan — Admin/Manager Browser Host

**Type:** Implementation plan. **Status:** drafted 2026-07-06, revised 2026-07-06 (critique pass) on branch `pwa` (forked from `multi-tenant`).
**Companions:** `docs/multi-tenant-plan.md` (data model / RLS / fiskaly — the parent design; do not fork or contradict it), `docs/update-policy.md` (fleet updates; §6 "one web build, two hosts", §12 online-required), `docs/REGISTER.md` (living blocker/deferral register — this plan adds rows, never renumbers).

> **How to read this.** Every claim about current state is anchored to a `file:line` or a migration; the repo drifts, so re-verify before building on it. This plan integrates with the parent plan — it introduces **no competing identity, RLS, or fiscal model**. Where it defers work, that work lands in `docs/REGISTER.md` with a landing point and a risk-if-forgotten (project rule: **no silent deferrals**).

---

## 1. Goal & scope

Ship a **Progressive Web App for owners/admins/managers** that runs in an ordinary browser (desktop + mobile) from the **same React build in `src/`** that the Electron till renders. The PWA is the remote back-office; the till stays the only fiscal-issuing host.

**v1 scope (all must-have, per user decision):**

1. **Reports & dashboards, including HR** (attendance, hours worked, no-shows, leave) — read surfaces.
2. **Live monitoring + push / real-time notifications** — a tenant-scoped event feed with in-app real-time delivery and web push.
3. **Remote management** — catalog/products, categories, customers, employees, and store/tenant settings. **Writes go through tenant-scoped, role-checked RPCs**, never direct fiscal or till-hardware paths.
4. **Fiscal / compliance views — READ ONLY.**

**HARD CONSTRAINT (non-negotiable, drives §4).** The PWA must **NEVER** issue a fiscal document, void/cancel one, or perform **any** fiscal action. This is enforced **server-side** (Postgres roles/grants/RLS + edge-function role guards), **not** by hiding buttons. UI host/role gating is defense-in-depth only.

**v1 posture — ONLINE-REQUIRED, and this is greenfield, not shipped.** Consistent with the till (`docs/REGISTER.md` T1, `update-policy.md` §12 U1): no offline app-shell caching. **The "fails closed" behaviour does not exist yet and must be built** — `src/lib/supabase.ts` `connectionStatus` is only a status object; today its only consumers are checkout (`POSContext.tsx:272/430/514`) and `offlineReportingService`, and there is **no app-level readiness gate that blocks the PWA when Supabase is unreachable**. §2.6 scopes the real fail-closed gate; §6/§8 define cold-start-offline and token-refresh-failure behaviour explicitly (both are edge cases the bare `connectionStatus` claim silently skipped).

**Out of scope for v1 (tracked, not silent):** offline PWA operation (U1); a second real tenant onboarding (`REGISTER` B8 — the PWA build is this plan; the tenant is the user's business decision); SIGN ES / Spain (D11); any fiscal cancellation UI in the PWA (see §4, permanently out).

**The load-bearing fact that makes this cheap.** A human manager JWT carries the **same `app_metadata` claim names** as a device JWT (`tenant_id`, `app_role`, optional `store_ids`) — parent plan §6.1. The Phase-3 tenant-scoped RLS (`supabase/migrations/20260713000000_phase3_tenant_scoped_rls.sql`) already treats an authenticated human JWT identically to a device JWT. So the **read path needs zero new RLS**. But "cheap" is only the RLS layer; the work that is *not* cheap and is fully scoped below: (a) a hardened human login + claim-stamping path, (b) host/role gating **and a host-aware data layer** for the shared build, (c) closing the server-side security holes that would otherwise let a human write fiscal/cross-tenant state, (d) a normalized identity object so a membership-only human is a first-class principal, and (e) greenfield PWA infra + realtime/push.

---

## 2. Architecture — one shared build, two hosts

### 2.1 The model

The same `src/` React app runs in two hosts (`update-policy.md` §6.3):

- **Till host (Electron):** `window.electronAPI` **present**. Renders POS, checkout, hardware/print/drawer, fiscal issuance. RLS principal is the **device** (`app_role:'device'`).
- **PWA host (browser):** `window.electronAPI` **absent**. Renders reports+HR, live monitoring, remote management, and read-only fiscal. RLS principal is a **human** (`app_role:'owner'|'admin'|'manager'`).

Much of this already degrades cleanly:

- **Router is already host-adaptive.** `src/App.tsx:37`: `const Router = ['app:','file:'].includes(window.location.protocol) ? HashRouter : BrowserRouter` — the browser PWA gets `BrowserRouter`/clean URLs for free.
- **Hardware already funnels through one feature-detecting boundary.** `src/services/electronHardwareService.ts` (`isElectronEnvironment()`, ~line 13/19) short-circuits every hardware call off-Electron with a "not available in web environment" result. Optional-chained `window.electronAPI?.` call sites exist across printer components and `src/fiscal/signing.ts`.
- **Browser session persistence is already correct.** `src/lib/supabase.ts`: `persistSession:true` + `autoRefreshToken:true` (localStorage) + `detectSessionInUrl:false`. Do **not** add `safeStorage` here — that is the Electron device path only.

What does **not** degrade cleanly and is a real fork (see §2.5): the data layer. The reused pages read from **Dexie**, not PostgREST, and the sync engine that fills Dexie is a module-level singleton that auto-starts. "Reuse the pages" is not free.

### 2.2 Host detection — one module

Host is currently inferred ad hoc (scattered `window.electronAPI?.` and `electronHardwareService.isElectronEnvironment()`). Introduce **one** module both hosts consume:

- New `src/lib/host.ts`: `isTillHost = typeof window !== 'undefined' && !!window.electronAPI`; `isPwaHost = !isTillHost`. Generalize `electronHardwareService.isElectronEnvironment()` to call it.
- **Fix the TypeScript footgun:** `src/vite-env.d.ts:181` declares `Window.electronAPI: ElectronAPI` as **non-optional**, so TS never forces null-guards even though it is `undefined` in a browser. Change to `electronAPI?: ElectronAPI` so feature-detection becomes type-enforced across the shared build.

### 2.3 Route + sidebar gating (add a HOST dimension) — and a host-aware landing redirect

Today `src/App.tsx` `ProtectedRoute` (46–62) and `PermissionRoute` (65–101) gate by **auth + permission only** — a browser manager with the right permission can open `/pos` and reach checkout. `Sidebar.tsx` (menuItems ~60–179) filters by permission only. Add a **host** dimension alongside permission (copy the existing `DEV_TOOLS` conditional-route pattern at `App.tsx:44`):

- New `HostRoute` (or a `host?: 'till'|'pwa'|'any'` prop on the existing guards).
- **Till-ONLY** (never mounted in the PWA): `/pos`, checkout, `/queue`, `/printer-test`, `/cash-drawer-audit` hardware controls, `ElectronCashierTesting`, and `Settings` hardware panels (`Settings.tsx` `?hw=` at ~351–354).
- **PWA surface:** Reports + HR, Transactions, ProfitCosts / StockProfit, Products / Categories / Customers / Employees (writes via RPC — §4.4), Devices, Settings subset, and **FiscalAudit read-only**.
- Filter `Sidebar.tsx` by host **and** permission so dead hardware items don't render in the browser.

**Fix the post-login redirect (else every PWA login dead-ends).** `getRoleBasedRedirect` (`src/App.tsx:104–114`) sends `admin`, `manager`, `cashier`, **and the default** all to `/pos` — the exact route §2.3 makes till-only. In the browser a human would be redirected to `/pos`, which the PWA either doesn't mount (blank `/*` fallthrough) or renders access-denied: the first thing a manager sees after logging in is a dead screen. **Make `getRoleBasedRedirect` host-aware** (`isPwaHost` → `/` Dashboard or `/reports`; `isTillHost` → `/pos`) **and add a PWA catch-all** that lands on the Dashboard instead of an unmatched `/*`. This is P1 scope, wired at the same time as `HostRoute`, not an afterthought.

**Gating is UX, not security.** The security boundary is the JWT `app_role` + server-side checks (§4). The shared build must never rely on hiding a fiscal button.

### 2.4 Remove the client fiscal signer from the shared bundle

**Live HARD-CONSTRAINT violation today:** the legacy in-browser AT signer is reachable in a browser. `src/contexts/POSContext.tsx:236` `runFiscalCheckout` → `src/fiscal/checkoutOrchestrator.ts:85` `createSignerFromSettings` → `src/fiscal/signing.ts` `WebCryptoRsaSha1Signer` (line ~54) signs the AT hash from a PEM in env/settings. `createSignerFromSettings` (180–181) already **prefers** `ElectronSafeStorageSigner` and feature-detects the bridge, but the browser fallback still exists in the bundle.

Actions:
- Host-gate the `local_at` branch of `checkoutOrchestrator.ts` and remove/guard `WebCryptoRsaSha1Signer` so a PWA build **cannot** sign a fiscal document.
- Never ship the fiscal RSA PEM into the PWA build (`VITE_FISCAL_RSA_PRIVATE_KEY_PEM` — also `REGISTER` B10: drop it from Vercel entirely; prod uses fiskaly server-side).
- Belt-and-braces: the server must reject fiscal writes for `app_role !== 'device'` regardless (see §4). This client removal is defense-in-depth, not the guarantee.
- **Reinforce it structurally with code-splitting (§2.7):** host-conditionally dynamic-import the till-only modules (signer, hardware services) so the browser bundle does not physically contain the RSA signer at all — a smaller bundle *and* a smaller attack surface.

### 2.5 Host-aware data layer (the read-path fork the plan cannot skip)

"Reuse the existing Products/Categories/Customers/Employees pages and read via direct PostgREST" (§4.5/§5.3) is **not free** — as written it is self-contradictory with the current code, and merely opening a reused page in the browser triggers the exact cross-tenant-unsafe RPC path §4.3 wants avoided:

- **The pages read Dexie, not PostgREST.** `productService.getAllProducts()` → `localDb.products` (`src/services/productService.ts:192–195`); customers/employees/transactions likewise. There is no PostgREST-direct read on these pages today.
- **Dexie is filled by the tenant-unsafe delta RPCs.** `transactionSyncService`/`productService:505`/`customerSyncService`/`employeeService:432` pull via `get_*_delta`.
- **The sync engine auto-starts and self-triggers.** `export const syncManager = new SyncManager()` (`src/services/syncManager.ts:396`) is a module-level singleton whose constructor **subscribes to `connectionStatus`** (`:67`) and starts a `setInterval` full-sync (`:91`); services also auto-pull on reconnect (`employeeService` `connectionStatus` subscription, `:33`). So in an online browser, importing these modules **fires `get_*_delta` with no host guard**.

**Decision (P1, gated in front of §4.5/§5.3):** the PWA host must not run the Dexie/delta sync path at all. Implement **one** of:

- **(preferred) A host-aware data source:** when `isPwaHost`, page services read via direct PostgREST `.from().select()` (RLS-scoped); when `isTillHost`, they keep the Dexie/delta path. This is a real read-path fork per reused page, scoped as explicit P2/P4 work items — not "reuse for free."
- **and regardless — hard-disable the sync engine in the browser:** gate the `syncManager` singleton so it **never constructs/starts** when `isPwaHost` (guard the module-level `new SyncManager()` and the `connectionStatus` auto-sync subscriptions in `employeeService` et al.). Even with the host-aware source, an un-gated singleton would still spam `get_*_delta` in the background.

Until this fork lands, the PWA calls **no** `get_*_delta` RPC. (This is also why §4.3's tenant-fix is a hard P0 gate: if a background singleton ever slips through, an un-fixed delta RPC is a cross-tenant dump.)

**Data-at-rest on personal browsers (medium).** The shared build carries the full Dexie business-data layer; any delta sync persists tenant sales/customer/employee rows **unencrypted** in a manager's personal-browser IndexedDB, and no logout eviction exists. This contradicts both the online-required posture and the explicit "do not add `safeStorage` in the browser" directive (§2.1). On `isPwaHost`: **disable Dexie persistence entirely** (the host-aware source makes Dexie unnecessary in the browser) **or** wipe `localDb` on logout/session-end. Record the residual browser data-at-rest risk in `REGISTER` with a landing point rather than leaving it implicit (`REGISTER` D23).

### 2.6 Fail-closed readiness gate (build it — it is not shipped)

§1 corrects the overclaim; here is the work. Add a real app-level readiness gate that, on `isPwaHost`, **blocks render/writes when `!connectionStatus.isSupabaseOnline`** and shows a banner — reusing the existing `connectionStatus` + `ping` heartbeat (`src/lib/supabase.ts`) as the *signal*, but adding the *gate* that does not exist today. Also **force the PWA reporting path onto the server branch**: `offlineReportingService.shouldUseOfflineData()` (`:37/:41`) prefers local Dexie when offline *or when recent local rows exist*, and any report with an `hourRange` filter is forced local unconditionally (`useOffline = shouldUseOfflineData() || Boolean(filters.hourRange)`, `:57/:156/:229/:305`) — in a browser that silently serves empty/stale local aggregates instead of server truth. The PWA reporting entry point must bypass `shouldUseOfflineData` and always read the server branch. Scoped P0/P1 (`REGISTER` D26). Cold-start-offline and token-refresh-failure behaviour are defined in §6 and §8.

### 2.7 Bundle shape — code-split the till-only modules

"One shared build" today ships the *entire* till bundle to the browser on first load — the fiscal signer, hardware services, the Dexie/sync engine — none of which the PWA uses (online-required, no offline caching). Beyond first-load weight, this keeps sensitive till-only code (the client RSA signer) physically present in the browser. **Host-conditionally dynamic-import (or route-code-split) the till-only modules** so the browser bundle omits the signer and hardware services. Lower priority than the security items but it reinforces §2.4's guarantee with a smaller footprint; schedule in P6 alongside PWA infra.

---

## 3. Auth — human accounts (username OR email + password)

### 3.1 What already exists

- **Human sign-in is written but unused.** `src/contexts/SupabaseAuthContext.tsx:154` `signInWithEmailAndPassword()` → `supabase.auth.signInWithPassword({email,password})`. No caller/UI. `app_role`/`tenant_id` are already read from `session.user.app_metadata` (lines 100/121/127).
- **The SIGNED_IN path is shared and deadlock-safe.** `onAuthStateChange` defers `fetchEmployeeData` in `setTimeout(0)` (comment lines ~299) because that lookup calls `supabase.auth.getSession()` internally and would deadlock against the auth lock held during the callback. A human email/password login fires the same path — reuse it as-is.
- **The human authorization table exists but has ZERO app usage.** `tenant_members(user_id, tenant_id, role in ('owner','admin','manager'), store_ids uuid[], employee_id)` — `supabase/migrations/20260706000000_phase1_multitenant.sql` (~146–155). Referenced only by RLS today. **It is intentionally many-to-many** (`user_id`, `tenant_id`) — see the cardinality decision in §3.5.
- **The device claim-stamping pattern is the model for humans — but only partially.** `supabase/functions/pair-device/index.ts` (~81–99) uses service-role `admin.auth.admin.createUser/updateUserById` to set `app_metadata:{tenant_id,store_id,device_id,app_role:'device'}`, mints a session, returns tokens. **Critically, pair-device is safe because the pairing CODE is the credential and every claim is read from the pre-provisioned server-side `devices` row — never from client input.** `provision-human` is the *opposite* shape (an authenticated admin creating other users), so it needs its own authorization model (§3.2c) — the template does not carry over.
- **A human-JWT-aware server function already exists.** `supabase/functions/manage-devices/index.ts` branches on `app_role in ['owner','admin']` and shows the `getUser(token)->app_metadata` server-side verification pattern.

### 3.2 What must be built

**(a) Human login UI (browser host).** New login screen that collects **username OR email + password**. `src/components/Auth/LoginForm.tsx` / `LoginForm2.tsx` both call `signInWithEmployeeCredentials` (device-session PIN attribution) — the PWA needs its own screen. It calls the **login edge function** (b), then persists the returned session with `supabase.auth.setSession(session)` (works with `persistSession:true`).

**(b) Login is one server-side edge function — no anon email-disclosure oracle.** Supabase Auth authenticates by **email** only, and the anon client cannot read `auth.users`. The obvious design (an anon `SECURITY DEFINER` resolver that returns the email, then the client signs in) is rejected: **returning a real email to an anonymous caller IS a PII leak and a user-enumeration/credential-stuffing oracle** — "uniform invalid credentials on a miss" does not help once a guessed username hands back a real address. Instead:

- New `supabase/functions/pwa-login/index.ts` (anon-reachable, `verify_jwt=false` — it is pre-login) that, **server-side**: (1) resolves the identifier → email (identity if the identifier is already an email; otherwise an exact-match, active, non-deleted username lookup), (2) performs `signInWithPassword` **inside the function**, (3) returns **only the session** — never the email.
- **Hard constraints on this function** (it is a permanently-anon attack surface): `SET search_path = public, pg_temp` on any SQL it calls; exactly one identifier → one email (never a list, never an existence signal); **generic failure response** on every miss (unknown user, wrong password, inactive — all identical); **per-identifier + per-IP rate limiting / lockout**. This single function is the only anon-reachable login surface — there is no separate anon resolver that returns emails.
- **Username storage/uniqueness is OPEN (§9 Q1):** neither `tenant_members` nor any `profiles` table carries a username today. Decide the scope the resolver keys on — **global uniqueness** (simplest; the function needs no tenant selector) or **per-tenant** (then the login screen must collect a tenant/org selector to disambiguate, else one username maps to multiple emails and login is ambiguous/cross-tenant). Resolve Q1 before building (`REGISTER` D22).

**(c) `provision-human` — the claim-ISSUANCE authority is where escalation lives; specify its authz.** Claim-stamping is tamper-proof against the *end user* (values are embedded at issuance, not user-editable — which is why deferring the Custom Access Token Hook is fine), but it is **not** tamper-proof against a *malformed issuer*. If `provision-human` trusts a request-body `tenant_id`/`app_role` or omits a caller-role check, **any authenticated human — even a manager — can mint an `app_role='owner'` account in any tenant**: total cross-tenant takeover + self-escalation. New `supabase/functions/provision-human/index.ts` (or `scripts/provision-human.mjs` for v1 bootstrap), service-role, with these **hard invariants** (`REGISTER` D21):

  1. `verify_jwt=true`; read the caller's claims via `getUser(token)->app_metadata` (never the body).
  2. **Assert caller `app_role ∈ {owner, admin}`** — a manager may not provision anyone.
  3. **Force the new user's `tenant_id` = the caller's verified JWT `tenant_id`.** Reject any body-supplied `tenant_id` outright.
  4. **Never stamp `app_role='device'` or any `device_id` from this function** (the absence of `device_id` is half the fiscal deny — §4.2).
  5. **No privilege escalation:** only `owner` may mint `admin`/`owner`; `admin` may mint `manager` (and, if allowed, `admin` — decide) but never above its own authority.
  6. **`store_ids ⊆ caller's `store_ids`** (a manager-scoped admin can't widen scope).
  7. Then: create/invite the auth user (§3.5), stamp `app_metadata = {tenant_id, app_role, store_ids}` (no `device_id`), insert the `tenant_members` row (+ `username` wherever Q1 lands).

**(d) Re-center human identity on `tenant_members`, and fix the null-employee blast radius (cross-app refactor, not a one-function tweak).** Today `isAuthenticated` is hard-wired to `!!employee` (`SupabaseAuthContext.tsx:313`), and the non-device branch resolves an `employees` row by `auth_id` (129–146). **A membership-only manager (owner/admin with no `employees` row) gets a valid Supabase session but `isAuthenticated` stays `false` → stuck on the login screen with no error.** Past that gate, ~88 sites across ~19 files read `state.employee.{name,role,access_levels,employee_number,id}`; a membership principal has no `employee` object, so those consumers render blank or throw. Therefore:

  - **Change the auth gate** to key on a resolved `tenant_members` membership, **not** an `employees` row.
  - **Introduce a normalized principal/identity object** — `{ displayName, role, store_ids, capabilities }` — populated by **both** a device-employee login and a membership-only human login. Repoint the ~88 `state.employee` consumers to it (or make `employee` explicitly nullable and null-guard every site — the normalized object is cleaner).
  - Derive permissions from the **`role`/`app_role` → capability map** (§3.3), not `employee.access_levels`.
  - Reports/HR still read `employees`/attendance as tenant-scoped **data**; the acting manager's *authority* comes from the membership.
  - **This blast radius is explicit P1 scope with its own exit test** (a membership-only owner logs in and no consumer renders blank/throws) — `REGISTER` D24.

**(e) Disable public signup (precondition).** `supabase/config.toml:133`/`:168` `enable_signup = true`. Opening a human login while signup is open lets anyone self-provision a **claimless** authenticated user. Set `false` before shipping the PWA login (`REGISTER` B9 — also JWT expiry → 15 min). All users created via admin/service role first.

### 3.3 Permission model

Replace the employee-centric oracle for humans. `src/utils/accessPermissions.ts` `hasEmployeePermission` reads `employee.access_levels` + `src/utils/systemAdmin.ts` (`VITE_SYSTEM_ADMIN_EMPLOYEE_NUMBERS`, slated for deletion). Add a **role → capability map** keyed on `tenant_members.role` and the `app_role` claim, populated into the normalized principal (§3.2d) so both hosts share one gate:

| Capability | owner | admin | manager |
|---|---|---|---|
| View reports/dashboards/HR | ✓ | ✓ | ✓ (own `store_ids` — see §3.4 / Q2) |
| View fiscal/compliance (read-only) | ✓ | ✓ | ✓ |
| Manage catalog/customers | ✓ | ✓ | ✓ |
| Manage employees | ✓ | ✓ | limited |
| Manage store/tenant settings | ✓ | ✓ | store-only |
| Manage devices | ✓ | ✓ | — |
| **Any fiscal action (issue/void/cancel)** | **✗ (host: none)** | **✗** | **✗** |

The fiscal row is **never** present in the PWA host for any role — and the server enforces it regardless (§4). Note: the "own `store_ids`" scoping in the table is **UX only** unless §3.4 / Q2 also puts it in RLS; do not confuse a UI filter with a security boundary.

### 3.4 Store-level scope is a SECURITY boundary, not just a reporting nicety

Phase-3 RLS (`20260713000000`) keys **every** policy on `tenant_id = app.tenant_id()` only. `app.store_id()` / `app.store_ids()` exist (`20260707000000`) but **no policy and no sync RPC references them**. So a manager whose claim scopes them to store A can currently **read and write every store's data within the tenant.** The plan defers the store dimension to P7 for *reporting correctness*, but store-scope for managers is *also* a within-tenant privilege boundary — and shipping it unenforced while the JWT advertises `store_ids` is a silent gap the project rule forbids.

**Decision required (§9 Q2), two honest options:**

- **(A) Enforce in v1:** add store-membership predicates (`app.store_ids() @> array[store_id]` or equivalent) to the RLS policies **and** to the tenant-safe write RPCs for the `manager` role. This is more work and partly blocked anyway because `transactions` has no `store_id` until P7 (§5.1) — so store-scoped *reporting* can't be fully meaningful before P7 regardless.
- **(B) Explicit, signed-off tenant-wide v1:** v1 managers are **tenant-wide**; `store_ids` in the JWT is **advisory/UX-only** until P7. Recorded as a stated risk acceptance in `REGISTER` (D29), not a silent gap. *(Recommended default, given `transactions.store_id` lands in P7 anyway — but it is the user's call.)*

Either way it is a documented decision, never an unstated default.

### 3.5 Onboarding, password reset, tenant cardinality, email transport (all prerequisites, none hand-waved)

A password-based human-auth PWA is not shippable without the account-lifecycle plumbing. These are greenfield and each has a config/infra prerequisite:

- **Onboarding mechanism (§9 Q6).** Invite by email (`inviteUserByEmail`/`generateLink`, user sets own password) **vs** admin-set initial password. Invite requires an **accept-invite / set-password route** in the PWA (greenfield). Who provisions the **first owner** of a tenant (a bootstrap script vs a super-admin console)?
- **Password reset (§9 Q12) — there is no reset path in the repo at all** (no `resetPasswordForEmail`, no reset landing route) and it is currently unmentioned. The first user who forgets a password is locked out. Decide: **self-serve reset** (`resetPasswordForEmail` + a reset-password landing route — needs SMTP) **vs admin-reset only** (admin sets a temporary password — no SMTP, but no self-serve recovery). Add the chosen flow to P1.
- **Email transport prerequisites (blocks both invite and self-serve reset).** Verified: `config.toml` `site_url = "http://127.0.0.1:3000"` and `additional_redirect_urls` are **localhost-only** (`:120/:122`) → a real Vercel invite/reset link is **rejected**; and `[auth.email.smtp]` is **commented out** (`:184`), so built-in email is rate-limited/non-prod. Before invites or reset emails work: set `site_url` + `additional_redirect_urls` to the real Vercel PWA origin (prod **and** staging), and configure a prod SMTP provider. Sequence in P1 next to `provision-human` (`REGISTER` D27).
- **Human↔tenant cardinality (§9 Q11).** `tenant_members` is many-to-many, but §3.2 stamps a **single** `tenant_id` into `app_metadata`. If one email is provisioned into a second tenant, `provision-human`'s `admin.updateUserById` **overwrites** `app_metadata.tenant_id` and silently breaks the first membership; there is no tenant-switcher. **v1 decision:** either **declare and enforce one tenant per human** (`UNIQUE(user_id)` on `tenant_members`, and `provision-human` rejects a second tenant for an existing user), **or** design login-time tenant selection with per-session claim minting — which effectively requires the deferred Custom Access Token Hook (Q8). *(Recommended v1: one tenant per human, enforced; tenant-switching deferred with the hook.)* `REGISTER` D28.

### 3.6 Browser session

No change needed to `src/lib/supabase.ts` for the browser host: `persistSession`/`autoRefreshToken`/`detectSessionInUrl:false` are already the correct PWA config. Session lives in localStorage; refresh is automatic. Sync already fails closed without a session (`REGISTER` D6, commit `12efaba` — `hasAuthSession()` guards in `syncManager`/`employeeService`), so a bare browser tab won't spam RPCs. **But note the interaction with the 15-min JWT expiry (B9):** an offline blip longer than 15 min fails `autoRefreshToken` and can silently sign the user out; and the Realtime socket (when built) must be re-authed on token rotation — both handled in §6/§8 and §5.2, not here.

---

## 4. Server-side security model

This section is the **guarantee**, not the UI. Because Supabase exposes exactly two client roles (`anon`, `authenticated`) and **every** logged-in principal — till and PWA human alike — shares the single `authenticated` role, `GRANT/REVOKE` **cannot** by itself bar a human from a till RPC. The `app_role` separation must be enforced **inside function/edge bodies** and by keeping all authoritative fiscal writes `service_role`/`SECURITY DEFINER`-only.

### 4.1 What is already enforced (keep permanent)

- **Fiscal tables are SELECT-only for `authenticated`.** `supabase/migrations/20260714000000_phase4_fiscal_tables.sql` (~119–136): a loop `ENABLE RLS` + `CREATE POLICY <t>_tenant_read FOR SELECT TO authenticated USING (tenant_id = app.tenant_id())` + `GRANT SELECT` on `tenant_fiscal_config`, `fiscal_series`, `fiscal_documents`, `fiscal_issue_attempts`, `fiscal_audit_events`. **No write grant, no write policy** — a PostgREST write is denied at the grant layer (42501) before RLS is consulted. `GRANT ALL` is `service_role` only. *(Verified: a human cannot void/issue via direct PostgREST — the fiscal TABLE boundary genuinely holds.)*
- **Secrets are invisible to clients.** `tenant_fiscal_secrets`: RLS on, `REVOKE ALL FROM anon, authenticated`, no policy (same posture as `employee_credentials`).
- **The only number-burning RPC is service-role-only.** `allocate_fiscal_number` — `REVOKE … FROM anon, authenticated; GRANT EXECUTE TO service_role` (`20260716000000_allocate_fiscal_number.sql:58–59`).
- **Issuance is device-gated.** `supabase/functions/pos-checkout/index.ts` (69–74, `verify_jwt=true`) derives tenant/store/device from the JWT and 401s unless **both** `tenant_id` **and** `device_id` claims exist and the device is `status='enrolled'`. A human JWT carries no `device_id` → structurally rejected.
- **Sealed-transaction immutability.** `20260705000000_phase0_hardening.sql` triggers (S18/S19) block DELETE and non-cancellation UPDATE **once `fiscal_document_id IS NOT NULL`.** ⚠️ This protects only *already-sealed* rows — brand-new forged transactions and all non-fiscal rows are outside it (see §4.2 L4).
- **Anon table grants revoked.** `20260715000000_phase3_revoke_anon_grants.sql` (incl. all fiscal tables).

### 4.2 The HARD fiscal constraint — layered enforcement to add

The human block on issuance is currently **implicit** (a human merely lacks `device_id`). Make it **explicit and positive**, and close the bypasses:

- **Layer 1 — pos-checkout positive assertion.** Add `if (meta.app_role !== 'device') return 403` alongside the existing `device_id`/enrolled checks (`pos-checkout/index.ts:69–74`). Two-factor deny (no `device_id` **and** `app_role !== 'device'`).
- **Layer 2 — DELETE the legacy issuer edge functions (CRITICAL), as a coordinated client cutover.** `supabase/functions/{fiskaly-fiscal,vendus-fiscal,invoicexpress-fiscal}/index.ts` expose `action:'issue_document'` using **global env-var provider credentials** with **no device/role/tenant check**, and are **not in `config.toml`** (so they run at the default `verify_jwt` policy, unmanaged). **Any** valid JWT — a PWA human included, even the public anon key — that reaches them issues a real fiscal document, bypassing pos-checkout entirely. `REGISTER` T7 marks `fiskaly-fiscal` as "retired but left in tree." **Delete/undeploy all three and remove their provider env vars before the PWA ships.** Promote T7 from ACCEPTED to an action item.
  - **But deletion is a live-checkout-path change, not pure hardening.** `checkoutOrchestrator` still dispatches to these issuers by `settings.fiscal.issuer` (`src/fiscal/checkoutOrchestrator.ts:32–63`), and `REGISTER` C4/T6 confirm the client is **not yet wired to `pos-checkout`** — it still uses its existing issuer path. If any deployed till is configured on `fiskaly`/`vendus`/`invoicexpress`, server-side deletion **breaks its production checkout**. **Sequence as a coordinated client+server migration** (`REGISTER` D30): (1) verify/force every field till onto the `local_at` (device-signed) or device-gated `pos-checkout` path and confirm no till dispatches to the legacy issuers; (2) *then* delete the edge functions + env vars. Note the till↔server version coupling. (The system is pre-production — C1: `pos-checkout` never deployed — so in practice this is a "confirm nothing live depends on them, then delete" step, but it must be an explicit step, not an assumption.)
- **Layer 3 — never grant a cancel/void RPC to `authenticated`.** No cancellation function exists yet (parent §7.1 `issueFiskalyCreditNoteForTransaction` throws). When built it must be a `service_role` edge fn that also asserts `app_role==='device'`/back-office, mirroring `allocate_fiscal_number`'s grant posture, and is **never surfaced in the PWA** (parent §7.6). This is a permanent out-of-scope for the PWA.
- **Layer 4 — `upsert_transaction_with_items` is a cross-tenant write+delete primitive; treat it as a full sync-RPC rewrite (§4.3), not a narrow branch-gate.** The active version (`20260705000000` ~75–219, granted to **`anon, authenticated`** at `:289`) is far more dangerous than "the cancellation mirror": it is `SECURITY DEFINER`, **sets NO `tenant_id` on INSERT** (so forged rows silently land in the default tenant `000…001`), **UPDATEs any row by primary-key `id` with no tenant filter**, does `DELETE FROM transaction_items WHERE transaction_id = …` **with no tenant check** (`:219`), and writes the fiscal-linkage columns `fiscal_document_id`/`fiscal_metadata_json`. The S18/S19 sealed triggers only guard rows where `fiscal_document_id IS NOT NULL`, so **brand-new forged transactions and every non-fiscal row are freely writable/deletable cross-tenant by any authenticated human** — and writing `fiscal_document_id` is itself a fiscal-adjacent write reachable by a human JWT, undercutting the HARD CONSTRAINT. **Rewrite (in the §4.3 batch):** derive `v_tenant := app.tenant_id()`, RAISE on null, **stamp `tenant_id` on every INSERT**, reject any `transaction_id`/`customer_id`/`product_id` whose existing row is in another tenant, **scope the `transaction_items` DELETE by tenant**, `REVOKE … FROM PUBLIC` (§4.3), and **restrict EXECUTE to `app_role='device'`** since only the till syncs transactions.
- **Layer 5 — keep `pos-checkout` at `verify_jwt=true` permanently.** `decodeClaims()` only base64-decodes; it does **not** verify the signature — it trusts the gateway. A regression to `verify_jwt=false` makes claims forgeable and defeats every role check. Add a deploy-time checklist assertion.
- **Layer 6 (deferred, tracked).** `FORCE ROW LEVEL SECURITY` is deferred (`REGISTER` D1) because it would break SECURITY-DEFINER RPCs; until then, in-function tenant/role checks are the only guard on the DEFINER path — which is exactly why §4.3 matters.

### 4.3 Tenant isolation for human accounts — fix the leaking sync RPCs, and REVOKE FROM PUBLIC (HIGH)

The Phase-3 header claims tenant scoping, but several `SECURITY DEFINER` sync RPCs **bypass RLS and do not self-enforce tenant**:

- `get_customers_delta` / `upsert_customers` (`20260420140000_customers_city_postal.sql`), `get_products_delta` / `get_categories_delta` / `get_transactions_delta` / `get_transaction_items_delta`, `upsert_products` / `upsert_categories` (genesis `20250101000000`), **and `upsert_transaction_with_items` (§4.2 L4)** — plain `FROM <table>` / `ON CONFLICT(id)` / unscoped `INSERT`/`DELETE` with **no `app.tenant_id()` filter**. A PWA human in tenant B can `rpc('get_products_delta')` and read tenant A's catalog, `rpc('upsert_products')` and overwrite tenant A rows by `sku`, or `rpc('upsert_transaction_with_items')` and forge/delete rows cross-tenant.
- Only `get_employees_delta` / `upsert_employees` are tenant-safe (`20260710000000`).

**Fix:** rewrite every delta/upsert sync RPC (including `upsert_transaction_with_items`) to the proven Phase-2 pattern (reference: `20260710000000_phase2_employee_credentials_cutover.sql`): `v_tenant := app.tenant_id(); RAISE no_tenant_context (28000) if NULL; filter/insert/delete WHERE tenant_id = v_tenant; RAISE on cross_tenant conflict`. **The PWA must NOT call the `get_*_delta` RPCs until they are tenant-fixed** — it reads via direct PostgREST `.from().select()` (RLS-proven, §4.5), and the sync engine is host-disabled in the browser regardless (§2.5).

**Revoke correctly — `FROM PUBLIC`, not `FROM anon` (this is the subtle bug in the old D12 wording).** `get_transactions_delta`/`get_transaction_items_delta`/`get_products_delta`/`get_categories_delta`/`upsert_products`/`upsert_categories` have **no explicit grant** in genesis (verified: only `get_customers_delta` gets an explicit `TO authenticated` at `20250101000000:1132`); they hold Postgres's **default `PUBLIC` EXECUTE** grant that `CREATE FUNCTION` confers, on top of the blanket `GRANT ALL ON ALL FUNCTIONS … TO anon, authenticated` (`:1226`). **`REVOKE EXECUTE … FROM anon` does NOT remove access while the `PUBLIC` grant stands — anon still inherits via `PUBLIC`.** So the old "revoke anon" remediation would leave these as **unauthenticated, cross-tenant, RLS-bypassing dumps** of every tenant's transactions/line-items/products. The repo's own correct revokes prove the pattern (`20260710000000:137/291` use `FROM public, anon`).

**Corrected remediation (supersedes the D12 wording):** for **every** legacy sync RPC — `get_customers_delta`, `get_products_delta`, `get_categories_delta`, `get_transactions_delta`, `get_transaction_items_delta`, `upsert_customers`, `upsert_products`, `upsert_categories`, `upsert_transaction_with_items` — `REVOKE EXECUTE … FROM PUBLIC` (covers anon **and** authenticated), **then** `GRANT EXECUTE` only to the role that still needs it *after* the tenant self-enforcement rewrite lands (`authenticated` for the delta reads humans/tills use; **`device`-only** conceptually for `upsert_transaction_with_items` — enforced in-body via `app_role`, since grants can't distinguish). Keep `ping` anon. **Add a verification step:** `SELECT proacl` / `\df+` inspection **and** a probe with the anon key confirming **zero rows / permission-denied** post-revoke (`REGISTER` D14, folding the corrected D12).

### 4.4 Remote-management write scope

Remote-management writes (must-have #3) go through **tenant-scoped, `app_role`-checked** paths — never direct fiscal or hardware writes:

- **Employees:** `upsert_employees` — already tenant-safe (`20260710000000`), reuse as-is.
- **Products / categories / customers:** currently **not** tenant-scoped — must be rewritten to the Phase-2 pattern (§4.3) **before** the PWA writes them.
- **Store / tenant settings:** direct RLS-scoped `.from().update()` — `tenant_settings`/`store_settings` already carry the Phase-3 `FOR ALL … WITH CHECK (tenant_id = app.tenant_id())` policy, so writes auto-scope. (If Q2 chooses store-scoped managers, add the store predicate here too — §3.4.)
- **None of these touch fiscal state** — that is the intended separation.
- Audit every remaining `SECURITY DEFINER` RPC (each is a privilege bridge because tills and humans share `authenticated`) for (a) tenant self-enforcement and (b) whether a human role should be able to call it at all; add `app_role` guards where a capability is till-only (checkout, drawer, cancellation, transaction sync). Confirm `manage-devices` cannot let a plain human JWT enroll/revoke devices without its admin-PIN second factor.

### 4.5 The PWA read contract

Read tenant data via **direct PostgREST `.from(table).select()`** (RLS-tenant-scoped; isolation proven via SQL probes with simulated JWT claims — `REGISTER` A8, caveat: the PWA path itself is unexercised): `products`, `categories`, `customers`, `transactions`, `transaction_items`, `employees`, `daily_sales_summary`, `stores`, `tenant_settings`, `store_settings`, `notification_events`, `cash_drawer_logs`, `print_logs`. Read fiscal/compliance via `.from()` SELECT on `fiscal_documents`/`fiscal_series`/`fiscal_issue_attempts`/`fiscal_audit_events`/`tenant_fiscal_config` — inherently read-only. **This read path is what §2.5's host-aware data source implements when `isPwaHost`;** it is *not* satisfied by reusing the Dexie-backed pages unchanged.

---

## 5. Feature areas

### 5.1 Reports & dashboards (including HR)

**Reusability splits by where the data physically lives.**

**Sales reports — WORK read-only today, near-zero backend, once the server branch is forced.** `src/pages/Reports.tsx` (overview / employees / products / inventory tabs) calls `offlineReportingService.getReportData`. In a **browser PWA the Dexie DB is empty and online**, so `shouldUseOfflineData()` normally falls through to the **server** path `src/services/transactionService.ts` `reportingService` (direct PostgREST aggregation over `transactions`/`transaction_items`, `status='completed'`, `deleted_at IS NULL`, date range; tenant-isolated by RLS). `ProfitCosts.tsx` rides the same path. **Reuse — but force the server branch:** as §2.6 notes, `shouldUseOfflineData()` prefers local when recent rows exist and is forced local whenever `filters.hourRange` is set (`:57`), so the PWA entry point must bypass it and always read the server branch (else an hour-range report silently returns empty).

Gaps to fix for trustworthy numbers:
- **No store dimension.** `transactions` has only `tenant_id` (no `store_id`/`device_id`); `daily_sales_summary` (genesis `20250101000000:266`, maintained by `update_daily_sales_summary()` trigger) is keyed per **employee**, no `store_id`. Per-store reports and owner multi-store rollups are impossible from current schema. Parent §6.5 calls for adding `store_id`/`device_id` to `transactions` (backfillable from device→store). **This is a till-write-path + backfill change — §9 Q7.**
- **No training exclusion.** No `is_training` column on `transactions`; `reportingService` applies no filter → reports would silently include training/test sales. Add `is_training` (server-stamped) and exclude structurally.
- **Client-side aggregation won't scale.** All math is JS over row pulls; an owner of many stores over a long range needs a server rollup RPC or a per-store maintained daily summary. Extend `ReportFilters` (`src/types/supabase.ts` ~984) with `storeId`.

**HR — BLOCKED until server tables land.** `src/pages/HR.tsx` + `src/services/hrService.ts`: clock in/out, leave, HR profiles, and all computed summaries (hours/days worked, no-shows, holiday accrual) persist **only in local Dexie** (`attendanceEntries`/`leaveRequests`/`employeeHrProfiles`). **No server attendance/leave/hr_profile tables exist.** In a fresh browser PWA these screens are empty. The **HR computation in `hrService.ts` is pure and reusable** (`calculateShiftHours`, `countWorkingDays`, `computeHolidayEntitlement`, `countNoShowDays`, `getPeriodAttendance`); only the **storage layer** must move to server tables + RLS reads. This is the A3 decision (parent plan) and is **unimplemented** — §9 Q3.

**Cash-drawer audit — LOCAL-ONLY and disconnected.** `src/pages/CashDrawerAudit.tsx` + `src/services/cashDrawerAuditService.ts` write a rich event model to local Dexie `cashDrawerEvents`, while the server `cash_drawer_logs` (`20250803000000`) is written **only** by the `cash-drawer` edge fn/seed and is schema-poorer. No sync bridges them → the PWA can't see the real drawer trail/discrepancies. §9 Q4.

**Stock/profit ledger — no server path.** `src/pages/StockProfitReport.tsx` + `src/services/productLedgerService.ts` read **entirely** from Dexie → blank in the PWA. Reusable computation, needs a server read path (products/rawMaterials/purchaseReceipts/recipeLines).

**Dashboard — mock only.** `src/pages/Dashboard.tsx` is 100% hardcoded. Rebuild against the server reporting/rollup path (ideally a per-store daily summary) to serve as the PWA landing overview — and it is the host-aware post-login landing target (§2.3).

**Build order for §5.1:** sales reports (reuse + server-branch force) → dashboard rebuild → `store_id`+`is_training` schema + rollup → HR server tables + till sync + repoint `HR.tsx` → drawer server table → stock ledger server path.

### 5.2 Live monitoring + notifications

**Substrate exists; delivery, most producers, and connection-auth lifecycle do not.**

- **`notification_events`** (`20260706000000:174–195`): tenant/store/device refs, 13-value `event_type` CHECK, `severity(info|warning|critical)`, `actor_employee_id`, `payload jsonb`, `delivered_at` (nullable), partial index on undelivered rows. Phase-3 RLS gives authenticated tenant members a tenant-scoped `FOR ALL` policy → **the feed is PWA-readable now** with zero new schema.
- **Only 3 of 13 event types are emitted:** `DEVICE_ENROLLED`/`PAIRING_FAILED` (`pair-device`), `DEVICE_REVOKED` (`manage-devices`). The other 10 (`LARGE_DISCOUNT`, `REFUND_ISSUED`, `DRAWER_DISCREPANCY`, `DRAWER_OPEN_NO_SALE`, `PRICE_OVERRIDE`, `CREDIT_NOTE_ISSUED`, `FISCAL_CANCELLATION`, `FISCAL_ISSUE_FAILED`, `SAFT_GENERATED`, `TRAINING_MODE_CHANGED`) are never written — `pos-checkout` and `cash-drawer` emit none. **A v1 feed is near-empty until emission is wired, and those producers live in the Electron till build** (§5.6 cross-host coupling).
- **Vocabulary is fragmented.** Fiscal events currently land in a **separate** stream, `fiscal_audit_events` via `appendFiscalAuditEvent` (`src/fiscal/creditNoteCheckout.ts:200`). The PWA feed must either UNION both tables or emission must be dual-written/consolidated. Decide before the feed is meaningful.
- **No delivery transport, and no connection-auth lifecycle.** No Supabase Realtime anywhere in `src/` (verified: no `.channel`/`postgres_changes`/`broadcast`, and **`supabase.realtime.setAuth()` appears nowhere**), no `push_subscriptions` table, no delivery edge fn, no web-push/VAPID.

**Transport decision (already pinned in parent §5.8):** deliver via **private-channel Realtime Broadcast authorized by RLS on `realtime.messages`** (topic = `tenant_id`, optionally store-scoped via `app.store_ids()`), **not** bare `postgres_changes`. Ship **no channel until the subscription-scoped cross-tenant isolation test passes** (tenant A provably cannot subscribe to tenant B) — parent §12 gate.

**Realtime connection-auth lifecycle (must build — otherwise the feed silently dies every ~15 min).** The Realtime socket authenticates off the JWT and must be **re-authed on token rotation.** Verified: `setAuth` is called nowhere; the only `TOKEN_REFRESHED` handler (`SupabaseAuthContext.tsx:327`) updates React state only; `SIGNED_IN` never calls `setAuth` either. Combined with B9 dropping `jwt_expiry` 3600s→15 min, a private channel silently de-authorizes and drops roughly every 15 minutes with **no error**. **Fix:** on both `SIGNED_IN` and `TOKEN_REFRESHED`, call `supabase.realtime.setAuth(session.access_token)` and re-subscribe channels on reconnect (`REGISTER` D25). Add **"channel survives a 15-min token refresh"** to the P6 exit test, next to the isolation test.

**v1 recommendation:**
- **Floor:** interval polling of the RLS-readable feed (cheap via the existing partial index) — works today, no socket-auth dependency.
- **Target:** tenant-scoped Realtime Broadcast for instant in-app push (after the isolation test + `setAuth` lifecycle land).
- **Web push (greenfield, §5.5 / §9 Q5):** manifest + service worker (host-gated to browser) + VAPID + `push_subscriptions(user_id, tenant_id, endpoint, keys)` + RLS + a delivery edge fn firing off `notification_events` inserts. iOS needs an installed PWA on 16.4+; per-user opt-in.

**Feed correctness depends on fixing emission first:** wire `LARGE_DISCOUNT`/`REFUND_ISSUED` into `pos-checkout`, drawer events into the drawer path, `FISCAL_ISSUE_FAILED` into the reconciler (`REGISTER` D8), and decide the `fiscal_audit_events`↔`notification_events` consolidation. Reuse the working edge-fn insert pattern (`pair-device`/`manage-devices`). Localize the `notification_events` CHECK types in `src/i18n.ts` (existing EN ~565 / PT ~3032 block covers a **different**, audit vocabulary).

**Feed integrity (recommended hardening).** The Phase-3 `FOR ALL` policy lets a compromised manager token INSERT/UPDATE/DELETE its own tenant's `notification_events` — but "notifications = the audit trail." Recommend: revoke `authenticated` INSERT/UPDATE/DELETE (keep SELECT), add an append-only trigger, and move per-user read/delivered state to a separate `notification_reads` table or a scoped RPC. Any "act on this alert" affordance must route through a tenant-scoped RPC that forbids fiscal actions server-side (`REGISTER` D16).

### 5.3 Remote management

Covered by §4.4 for the write path and §2.5 for the read path. UI reuse: the existing `Products`, `Categories`, `Customers`, `Employees` pages render and edit tenant data; in the PWA they **read via the host-aware PostgREST source (§2.5), not the Dexie/delta path**, and **write via the tenant-scoped RPCs** (`upsert_employees` today; `upsert_products/categories/customers` after the §4.3 tenant-fix). Store/tenant settings write via direct RLS-scoped `.from().update()`. Device management (`Devices` page + `manage-devices`) is owner/admin only and keeps its admin-PIN factor.

### 5.4 Fiscal / compliance READ-ONLY views

Four read surfaces, all **direct PostgREST SELECT** on the shipped `fiscal_*` tables under the SELECT-only RLS (§4.1). The read-only guarantee is §4, not the UI.

**Design to the SHIPPED schema (`20260714`), not the aspirational parent §4.5 shape** (which lists `gross_total`/`net_total`/`saft_exported_at` etc. that do **not** exist in the shipped table).

1. **Document archive (browse/search)** — `fiscal_documents` (id, doc_type, series, number, atcud, hash, qr_data, software_certificate, status `issued|cancelled`, cancelled_*, is_training, environment `test|live`, issued_at, store_id, device_id, transaction_id, `signed_payload jsonb`). **No monetary totals in this table** → join `transactions`/the `transaction_details` view (genesis, security_invoker) via `transaction_id` for amounts, or parse `signed_payload`. Filters: date range (index on `(tenant_id, issued_at)`), doc_type, series, status, environment/is_training, store/device, text match on number/atcud. Detail pane reuses the receipt renderer (`src/components/ThermalReceipt.tsx` + `src/fiscal/qrPayload.ts`) from `signed_payload`+`qr_data`+`atcud`. Surface `environment`/`is_training` prominently so TEST/training docs are visually distinct.
2. **Per-series sequence** — `fiscal_series` (series, doc_type, environment, year, current_number, atcud). Shows authoritative next-number + registered ATCUD. Gap detection: count issued `fiscal_documents` per series vs `current_number`, and surface `fiscal_issue_attempts(status='failed')` holding spent `document_number/series` (the `REGISTER` T2 trade-off: numbers allocated before the fiskaly call leave explainable gaps).
3. **SAF-T export status** — **NOT server-backed yet** (no `saft_exported_at`/batch columns, no `fiscal-exports` bucket, no SAF-T job/`saft` action, `SAFT_GENERATED` not emitted — parent §5.6/§5.7). Ship a read-only **landing slot** (placeholder/stub over `notification_events` once `SAFT_GENERATED` fires); wire fully when a service-role SAF-T job + a `fiscal_saft_exports` tracking table + the bucket exist. Do **not** generate SAF-T client-side for real tenants. §9 Q10.
4. **Issue-attempt / error ledger** — `fiscal_issue_attempts` (checkout_id, status, error, document_number, series, device_id, timestamps) for failed/stuck issuances + gaps, enriched with `fiscal_audit_events` (immutable audit trail) and `notification_events(FISCAL_ISSUE_FAILED/FISCAL_CANCELLATION/CREDIT_NOTE_ISSUED)` for reconciler-detected later AT-side failures. This is the same feed that powers §5.2 monitoring — build the ledger and the feed off one query.

**Build tasks:**
- **Add fiscal row types to `src/types/supabase.ts`** (`Database.Tables` lacks `fiscal_documents`/`fiscal_series`/`fiscal_issue_attempts`/`fiscal_audit_events`/`tenant_fiscal_config`) so the PWA can do typed `.from('fiscal_documents').select()`. Align to shipped column names (`number`/`qr_data`/`signed_payload`/`current_number`), NOT the local `FiscalDocumentRow` in `src/fiscal/types.ts` (a Dexie shape).
- **Repoint `src/pages/FiscalAudit.tsx`** from its Dexie source (`transactionLocalService.listFiscalAuditEvents`, ~line 20 — till-local, empty in a browser) to a PostgREST SELECT on `fiscal_audit_events`.
- **Human-readable joins:** `store_id`/`device_id`/`transaction_id` are UUIDs — join `stores`/`devices`/`transactions` (all tenant-scoped SELECT-readable, RLS-safe).
- **Role-scope sensitive reads at the BASE table, not the view.** RLS on the fiscal read tables is tenant-only, so any authenticated tenant principal (including a device session) can read the error ledger/config. If the ledger/`tenant_fiscal_config` must be manager+ only, the predicate `app.app_role() IN ('owner','admin','manager')` must live in **base-table RLS** — a WHERE in a view is bypassable by querying the base table directly. Note this diverges from parent §5.3's "Class E, zero-grant" intent for `fiscal_series`/`fiscal_issue_attempts`; the shipped grant-SELECT posture is what the PWA needs — record it as an intentional, ideally role-gated, decision.

---

## 6. PWA infrastructure

**Everything here is greenfield** — no manifest, no service worker, no `vite-plugin-pwa`, no `registerSW`; `index.html` has only `<title>Point of Sale System</title>` + `/vite.svg` favicon; `vite.config.ts` has no PWA plugin; `main.tsx` registers no SW.

- **Web app manifest:** name, `display:standalone`, `start_url`, `scope`, theme/background color, **maskable icons**. Add `<link rel="manifest">` + `theme-color` + `apple-touch-icon` to `index.html`. Capture `beforeinstallprompt` for a custom install button.
- **Service worker — push/installability ONLY, NO offline app caching.** v1 is ONLINE-REQUIRED (`update-policy.md` §12 U1). But web push (must-have #2) **requires** a SW + `PushManager`. Reconcile with a **minimal, network-first / non-caching SW** that only handles push receipt + notification display and satisfies installability — never the app shell/data.
- **Cold-start-offline behaviour (define it — the bare-`connectionStatus` claim only covers a *warm* session).** With a deliberately non-caching SW, a cold launch of an installed/standalone PWA while offline would show the browser's native error page, not the app's fail-closed banner. **Permitted without violating online-required:** a tiny SW offline **fallback HTML page** ("You're offline — reconnect to continue") that caches **no app data and no app shell** — just a static apology page. This preserves online-required while replacing the raw browser error. Note in §8.
- **Token-refresh-failure UX (define it — do not silently sign out).** An offline blip longer than the 15-min JWT expiry (B9) fails `autoRefreshToken` and can silently log the user out. Instead: on refresh failure, show an explicit **re-login / reconnect prompt** (or hold a read-only grace state) rather than dumping the user to login with no explanation. Wire alongside the readiness gate (§2.6). `REGISTER` D26.
- **Host-gate SW/push registration.** The same build runs inside Electron — the SW and `pushManager` must **never register when `window.electronAPI` is present** and the till principal (`app_role='device'`) is never offered push/monitoring surfaces. Gate registration in `main.tsx` on `isPwaHost` (§2.2).
- **Consider `vite-plugin-pwa`** for manifest + a controlled minimal SW, configured to **not** precache the app shell (or a hand-written SW to keep full control of the no-offline stance).
- **iOS caveat:** Web Push needs an installed (A2HS) PWA on iOS 16.4+.

---

## 7. Phasing / milestones

Ordering rule: **security holes close before the browser login opens**; read-only surfaces before writes; polling floor before realtime/push; schema changes (store_id/is_training/HR tables) sequenced against the till write path; **any feature that depends on till-side producers ships in lockstep with a till release (§5.6)**.

**P0 — Server-side hardening (gates everything; mostly backend).**
- **Coordinated legacy-issuer cutover then deletion:** confirm/force every till off `fiskaly-fiscal`/`vendus-fiscal`/`invoicexpress-fiscal` (onto `local_at`/`pos-checkout`), then delete/undeploy all three + remove provider env vars (§4.2 L2; `REGISTER` T7 → action, D30).
- Add explicit `app_role==='device'` assertion to `pos-checkout` (§4.2 L1); document `verify_jwt=true` permanence (L5).
- **Tenant-fix + device-scope the leaking sync RPCs** (`get_*_delta`/`upsert_products/categories/customers`/**`upsert_transaction_with_items`**) to the Phase-2 pattern (§4.3/§4.2 L4); `upsert_transaction_with_items` becomes device-only.
- **`REVOKE EXECUTE … FROM PUBLIC`** (not `FROM anon`) on all sync RPCs, then re-GRANT to the needed role; add the anon-key probe verification (`REGISTER` D14, corrected D12).
- Disable public signup + JWT expiry 15 min (`REGISTER` B9); drop `VITE_FISCAL_RSA_PRIVATE_KEY_PEM` from Vercel (B10); set prod CORS allowlist (B11).
- Host-gate/remove the client AT signer from the shared bundle (§2.4).
- **Fail-closed readiness gate + force PWA reporting onto the server branch** (§2.6) — begins here, completed in P1/P2.
- **Exit test:** a manager JWT is rejected by pos-checkout and every remaining fiscal path; cross-tenant read/write via **every** sync RPC (incl. `upsert_transaction_with_items`) is denied; an **anon-key** probe of every revoked RPC returns permission-denied/empty (negative tests — `REGISTER` D7).

**P1 — Human auth + host/role gating.**
- `src/lib/host.ts` + `vite-env.d.ts` optional `electronAPI`; `HostRoute`; sidebar host filtering; **host-aware `getRoleBasedRedirect` + PWA catch-all** (§2.3).
- **Host-aware data layer:** disable the `syncManager` singleton + auto-sync subscriptions when `isPwaHost`; disable/wipe Dexie in the browser; PostgREST-direct read source for reused pages (§2.5, `REGISTER` D23).
- Username storage decision (Q1) + **`pwa-login` edge fn** (server-side resolve + `signInWithPassword`, returns session only, rate-limited — §3.2b); human login UI wired to it; **`provision-human` with the authz invariants** (§3.2c, `REGISTER` D21).
- **Normalized principal object + null-employee refactor:** membership-based auth gate; repoint the ~88 `state.employee` consumers; role→capability map replacing `access_levels`/`systemAdmin` for humans (§3.2d/§3.3, `REGISTER` D24).
- **Account lifecycle:** onboarding (invite vs admin-password, Q6), password-reset flow (Q12), SMTP + redirect allowlist, human↔tenant cardinality constraint (Q11) (§3.5, `REGISTER` D27/D28).
- Store-scope decision executed (Q2 — enforce in RLS+RPCs, or record the tenant-wide risk acceptance, §3.4 / `REGISTER` D29).
- **Exit test:** an owner/admin/manager logs in by username or email in a browser, lands authenticated with correct claims on the Dashboard (not a dead `/pos`), sees only PWA-host routes, and can reach nothing fiscal-writing; a **membership-only owner with no `employees` row** logs in and no consumer renders blank/throws; `provision-human` rejects a body-supplied `tenant_id` and a manager caller; a cold offline launch shows the fallback page, not a browser error.

**P2 — Read-only surfaces (the cheapest user-visible value).**
- Sales reports + ProfitCosts (reuse the server fallback, server-branch forced) behind PWA gating.
- Rebuild `Dashboard.tsx` on real aggregated data (also the post-login landing).
- Fiscal read-only views 1/2/4 (archive, series, error ledger) + fiscal row types + repoint `FiscalAudit.tsx` (§5.4). View 3 (SAF-T) as landing-slot placeholder.
- **Exit test:** an owner sees real sales + real fiscal documents for their tenant only; a second tenant sees none of the first's; an hour-range report returns server data, not empty.

**P3 — Live monitoring (floor).**
- **Cross-host:** wire the missing `notification_events` producers in the **till build** (`LARGE_DISCOUNT`/`REFUND`/drawer/`FISCAL_ISSUE_FAILED`); consolidate the fiscal-audit vs notification streams; localize event labels; feed integrity hardening (§5.2/§5.6).
- In-app feed via **interval polling** with severity-driven UX.
- **Exit test:** a discount/refund/drawer event on the till appears in the PWA feed within the poll interval, tenant-scoped. *(Inert until the till producers ship — set expectations, §5.6.)*

**P4 — Remote management (writes).**
- Products/categories/customers/employees edit via the (now tenant-safe) RPCs; store/tenant settings via RLS-scoped writes (§4.4/§5.3).
- **Exit test:** a manager edits a product; the change is tenant-scoped and visible on the till; a cross-tenant write is denied.

**P5 — HR + drawer server-backing.**
- New tenant_id-from-birth `attendance`/`leave`/`hr_profile` tables + **till** write/sync path following existing sync rings; repoint `HR.tsx` to server reads (Q3).
- Server drawer-event table adopting the `cashDrawerAuditService` shape + till sync; repoint `CashDrawerAudit.tsx` read (Q4).
- **Exit test:** clock-in on the till surfaces as hours in the PWA HR view.

**P6 — Realtime + web push + PWA infra.**
- Manifest + minimal non-caching SW + offline fallback page + install prompt (host-gated) (§6); code-split till-only modules out of the browser bundle (§2.7).
- **Realtime `setAuth` lifecycle** (`SIGNED_IN`/`TOKEN_REFRESHED`) + private-channel Broadcast **after** the cross-tenant subscription isolation test passes (parent §12).
- `push_subscriptions` + delivery edge fn + VAPID; per-user opt-in.
- Till heartbeat + staleness sweep for till-offline alerts (**till-side** producer, §5.2/§5.6).
- **Exit test:** a critical event pushes to an installed PWA in the background; tenant B cannot subscribe to tenant A's channel; **the channel survives a 15-min token refresh.**

**P7 — Store dimension + rollups + SAF-T (numbers-at-scale).**
- Add `store_id`/`device_id` + `is_training` to `transactions` (backfill from device→store) + `store_id` to `daily_sales_summary`; server rollup RPC; store filter in `ReportFilters`; **owner-vs-manager store scoping in RLS** (Q2/Q7 — the SECURITY half of §3.4 if deferred from P1).
- Server SAF-T job + `fiscal_saft_exports` + `fiscal-exports` bucket → wire fiscal view 3 (Q10).

*(P0–P2 are the minimum shippable read-only PWA. P4+ add writes and richer monitoring.)*

---

## 8. Risks & trade-offs

- **Shared `authenticated` role (structural).** Grants cannot distinguish a till from a PWA human — every `SECURITY DEFINER` RPC is a potential privilege bridge. Mitigation is discipline: in-function `app.tenant_id()`/`app_role` checks on every DEFINER path (§4.3/§4.4). State this explicitly so no one "solves" it with a REVOKE that can't work.
- **The claim-ISSUANCE authority (`provision-human`) is the real escalation surface.** Claims are tamper-proof against the end user but not against a malformed issuer; a missing caller-role check or a trusted body `tenant_id` = cross-tenant takeover. The §3.2c invariants are load-bearing (`REGISTER` D21).
- **`upsert_transaction_with_items` is the most dangerous single write RPC** — cross-tenant insert/update/delete + fiscal-linkage writes, reachable by any authenticated human today. It is fixed as a full sync-RPC rewrite + device-only, not a branch-gate (§4.2 L4 / §4.3).
- **REVOKE must target `PUBLIC`, not `anon`.** The default `PUBLIC` EXECUTE grant means "revoke anon" leaves an unauthenticated cross-tenant dump open on the un-granted delta RPCs; only `REVOKE … FROM PUBLIC` + a re-GRANT + an anon-key probe actually closes it (§4.3).
- **Login must not leak email.** An anon resolver returning an email is an enumeration/PII oracle; the single server-side `pwa-login` fn (resolve + sign-in server-side, session-only return, rate-limited) is the design (§3.2b).
- **The null-employee blast radius is a cross-app refactor.** `isAuthenticated:!!employee` + ~88 `state.employee` consumers must move to a normalized principal, or a membership-only manager is locked out / the UI breaks (§3.2d).
- **"Fails closed" is greenfield, not shipped.** `connectionStatus` is a signal, not a gate; the readiness gate, the forced server-report branch, the cold-offline fallback page, and the token-refresh-failure UX are all real work (§2.6/§6).
- **Reusing pages is not reusing the data layer.** The pages read Dexie filled by the tenant-unsafe delta RPCs via an auto-starting singleton; the PWA needs a host-aware PostgREST source and the singleton hard-disabled in the browser (§2.5).
- **Browser data-at-rest.** Unencrypted tenant data in personal-browser IndexedDB unless Dexie is disabled/wiped on `isPwaHost` (§2.5, `REGISTER` D23).
- **Store-scope for managers is a security boundary, currently unenforced.** `store_ids` is advisory until Q2 is decided and (if chosen) RLS/RPC predicates are added (§3.4, `REGISTER` D29).
- **`verify_jwt=true` is load-bearing.** `decodeClaims()` trusts the gateway; a flip to `false` makes claims forgeable (§4.2 L5). Deploy-checklist assertion.
- **Legacy issuer deletion is a live-checkout change.** Coordinate a client cutover before deleting the edge functions; till↔server version coupling (§4.2 L2, `REGISTER` D30).
- **Live monitoring depends on the till build.** Missing producers + the till heartbeat live in Electron; P3/P6 monitoring is **inert until a coordinated till+PWA release** ships them (§5.6).
- **Realtime is a new breach surface with an auth-lifecycle trap.** No channel before the cross-tenant subscription isolation test; and without `setAuth` on refresh the channel silently dies every 15 min (§5.2, `REGISTER` D25).
- **`FORCE RLS` deferred (D1).** DEFINER RPCs bypass RLS by design; in-function checks are the only guard until FORCE lands — elevates §4.3 from "nice" to "required."
- **HR/drawer/stock are Dexie-only.** Real server tables + a till sync path are non-trivial (P5); until then those PWA screens are empty. Do not promise them before the tables exist.
- **Reports without `store_id`/`is_training` are partially wrong.** Numbers mix training sales and can't answer per-store questions until P7. Communicate this to owners or gate those views.
- **Isolation proven only via simulated JWTs (A8).** The real browser PWA direct-PostgREST path is unexercised; treat the first live login as a verification milestone (C2 is only partly cleared).
- **Web push is greenfield with iOS constraints.** Budget for installed-PWA + 16.4+; polling is the honest v1 floor (§5.2). The SW must exist for push yet must not cache the app — the minimal non-caching SW + offline fallback page resolves it but is a non-standard PWA shape.
- **Schema drift risk.** Parent §4.5 describes fiscal columns that don't exist in the shipped `20260714`. Build views to the shipped schema; re-verify before coding.
- **fiskaly / Portugal is blocked (B12).** All LIVE fiscal issuance is gated on SIGN PT enablement — but the PWA is **read-only** on fiscal, so the read-only compliance views and everything else in this plan can proceed against TEST/existing data regardless.

### §5.6 note referenced above — cross-host / version-lockstep dependency

Several v1 features cannot function from PWA-side work alone because their **producers live in the Electron till build**: the 10 unemitted `notification_events` types, the `LARGE_DISCOUNT`/`REFUND` emitters in `pos-checkout`, the drawer-event producers, and the `devices.last_seen_at` **heartbeat** (today `last_seen_at` is stamped **only at pairing**; the client-only `ConnectionStatus` heartbeat never persists liveness). Add these as **explicit till-side work items** with the rollout constraint that live monitoring requires a **coordinated till + PWA release**, and set expectations that **P3 is inert until those producers land**. (Kept as a subsection of §8/§5.2 rather than renumbering the section list.)

---

## 9. Open questions for the user

1. **Username storage & uniqueness (Q1).** Where does the login `username` live — a new `username` column on `tenant_members`, or a new `profiles(user_id, username)` table? Unique **globally** (simplest — the `pwa-login` fn needs no tenant selector) or **per-tenant** (then the login screen must collect a tenant/org selector to disambiguate)? Neither carries one today.
2. **Store-scoped RLS in v1 — a SECURITY boundary, not just reporting (Q2).** Must a manager see/write only their `store_ids` in v1 (enforced in RLS **and** the write RPCs), or is tenant-wide acceptable for the first PWA with `store_ids` treated as **advisory/UX-only** until P7 (a recorded risk acceptance)? *(Recommended: tenant-wide v1, since `transactions.store_id` only lands in P7 — but your call. §3.4.)*
3. **HR server tables scope (Q3).** Confirm the A3 decision for v1: are **attendance + leave + hr_profile** all server-backed (full HR in the PWA), or is a lighter read-only HR (hours from existing `employees` columns) acceptable for v1 with full attendance/leave deferred?
4. **Cash-drawer monitoring (Q4).** Reconcile the rich local `cashDrawerEvents` model onto an expanded server drawer table (so the PWA sees the real trail + discrepancies) in v1, or defer drawer monitoring past v1?
5. **Web push in v1 (Q5).** Push is greenfield (SW + VAPID + `push_subscriptions` + delivery fn) and iOS needs an installed PWA on 16.4+. Is **background web push** a v1 must-have, or is **in-app Realtime + interval polling** the v1 floor with web push as a fast-follow?
6. **Human onboarding mechanism (Q6).** Invite by email (`inviteUserByEmail`/magic link, user sets own password — needs an accept-invite/set-password route + SMTP + redirect allowlist) vs admin-set initial password (no SMTP)? And who provisions the **first owner** of a tenant (a script you run, vs a super-admin console)?
7. **`transactions.store_id` / `is_training` in v1 (Q7).** Needed for per-store reports and training exclusion, but they touch the **till write path** and need a device→store backfill. In v1, or a fast-follow (P7)? Until then, PWA reports are tenant-level and include training sales.
8. **Custom Access Token Hook timing (Q8).** Confirm v1 stamps claims **at provisioning** (service role) and the Custom Access Token Hook stays **deferred to before tenant #2** (parent §6.5 / `REGISTER` D4-adjacent).
9. **Fiscal cancellation stays out of the PWA (Q9).** Confirm that fiscal cancellation/credit-note remains **permanently out of the PWA** — an owner/admin **back-office** function (device/service-role gated) even once built — so managers never get any cancellation affordance.
10. **SAF-T view in v1 (Q10).** Is a read-only SAF-T **landing-slot placeholder** acceptable for v1 (wired when the server SAF-T job/bucket ship), or is a working SAF-T export/download required in v1 (which pulls the server SAF-T job forward)?
11. **Human↔tenant cardinality (Q11).** `tenant_members` is many-to-many but v1 stamps a single `tenant_id` claim. Confirm v1 enforces **one tenant per human** (`UNIQUE(user_id)`, and `provision-human` rejects a second tenant), with tenant-switching deferred to the Custom Access Token Hook (Q8) — or do you need multi-tenant login/tenant-switching in v1?
12. **Password reset & email transport (Q12).** Do we ship **self-serve password reset** in v1 (`resetPasswordForEmail` + a reset-password route — requires prod SMTP + the Vercel redirect allowlist) or **admin-reset-only** (admin sets a temporary password, no SMTP)? This, with Q6, decides whether SMTP + `site_url`/`additional_redirect_urls` must be configured in P1 (they are localhost-only + SMTP-commented today).

---

## 10. New register items to add to `docs/REGISTER.md`

(No silent deferrals — proposed rows for the user to ratify; do not renumber existing IDs.)

- **T7 → action:** delete legacy issuer edge functions + remove provider env vars (was ACCEPTED "left in tree"; now a P0 blocker) — **executed as the coordinated cutover in D30.**
- **D12 → corrected (folded into D14):** the revoke must be `FROM PUBLIC`, not `FROM anon` (default `PUBLIC` EXECUTE grant otherwise leaves anon access intact) + an anon-key probe verification.
- **New D14:** rewrite non-tenant-safe sync RPCs (`get_*_delta`/`upsert_products/categories/customers`/**`upsert_transaction_with_items`**) to the Phase-2 tenant-scoped pattern; `REVOKE EXECUTE … FROM PUBLIC` then re-GRANT to the needed role; `upsert_transaction_with_items` restricted to `app_role='device'`; lands P0; risk = cross-tenant read/write/delete + fiscal-linkage writes for any authenticated human.
- **New D15:** explicit `app_role==='device'` guard on `pos-checkout` (+ future cancellation fn); lands P0; risk = implicit human block collapses if a `device_id` ever leaks onto a human JWT.
- **New D16:** `notification_events` append-only + revoke authenticated writes + `notification_reads`; lands P3; risk = a compromised manager token can rewrite the audit trail.
- **New D17:** human claim minting = provisioning-time (hook deferred); lands P1; risk = claimless authenticated users if signup stays open (ties to B9).
- **New D18:** `store_id`/`is_training` on `transactions` + rollups; lands P7; risk = per-store reports impossible, training sales pollute reports.
- **New D19:** HR/drawer/stock server tables + till sync; lands P5; risk = empty PWA HR/drawer/stock screens.
- **New D20:** Realtime `realtime.messages` RLS + cross-tenant subscription isolation test; lands P6; risk = cross-tenant broadcast leak.
- **New D21:** `provision-human` authorization invariants (caller-role check, force caller-tenant, no device_id/role escalation, `store_ids ⊆ caller`); lands P1; risk = any authenticated human mints an owner in any tenant = cross-tenant takeover.
- **New D22:** `pwa-login` edge fn — server-side resolve + `signInWithPassword`, returns session only (no email leak), `SET search_path`, generic errors, per-identifier/IP rate-limit; ties to Q1 username scope; lands P1; risk = user-enumeration/PII/credential-stuffing oracle + hijackable resolver.
- **New D23:** PWA host-aware data layer — disable the `syncManager` singleton + auto-sync subscriptions and Dexie persistence (or wipe on logout) when `isPwaHost`; lands P1; risk = background `get_*_delta` spam (cross-tenant if un-fixed) + unencrypted tenant data at rest in a personal browser.
- **New D24:** normalized principal/identity object + membership-based auth gate + repoint ~88 `state.employee` consumers; lands P1; risk = membership-only manager locked out and UI breakage.
- **New D25:** Realtime `setAuth` on `SIGNED_IN`/`TOKEN_REFRESHED` + re-subscribe on reconnect; lands P6; risk = feed silently de-authorizes/drops every 15 min (B9 expiry) with no error.
- **New D26:** fail-closed readiness gate (build it) + force PWA reporting onto the server branch + cold-offline SW fallback page + token-refresh-failure re-login UX; lands P0–P2/P6; risk = "fails closed" claimed but absent; stale/empty local reports; native browser error on cold offline; silent logout.
- **New D27:** account-lifecycle plumbing — accept-invite/set-password route, password-reset route, prod SMTP, Vercel `site_url`/`additional_redirect_urls` allowlist; lands P1; risk = invites/reset emails dead-end (localhost-only + SMTP-commented today); no self-serve recovery.
- **New D28:** human↔tenant cardinality — enforce one tenant per human (`UNIQUE(user_id)` + `provision-human` guard) for v1; lands P1; risk = second-tenant provisioning overwrites `app_metadata.tenant_id` and silently breaks the first membership.
- **New D29:** store-scope security-boundary decision (Q2) — either enforce store predicates in RLS+RPCs or record the tenant-wide risk acceptance; lands P1 (enforcement half may defer to P7); risk = within-tenant privilege gap (manager reads/writes all stores) shipped silently.
- **New D30:** legacy-issuer deletion as a coordinated client+server cutover (couples with T7) — confirm/force tills off the legacy issuer path before undeploying; lands P0; risk = deleting the edge fns breaks a live till's checkout.
- **New D31 (lower priority):** code-split till-only modules (fiscal signer, hardware services) out of the browser bundle; lands P6; risk = larger first-load + the RSA signer physically present in the browser bundle (attack surface).
