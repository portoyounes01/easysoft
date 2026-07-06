# Principal Refactor + Browser (PWA) Login — Implementation Plan (revised, post-critique)

Branch `pwa`. Goal: a browser human authenticated via `pwa-login` (who has **no `employees` row**) can use the shared app, while the Electron till keeps its unchanged device+PIN employee session. Backend (`pwa-login`, `switch-tenant`, `provision-human` edge fns + JWT `app_metadata` claims + `tenant_members`) is already built, deployed, and verified.

## Core idea — a normalized `principal`, kept ALONGSIDE `employee`
`AuthState` gains `principal: Principal | null`. `employee` **stays populated on the till** exactly as today. `isAuthenticated` moves from `!!employee` to `!!principal`. Two derivation paths produce the same `Principal` shape:
- **Till (employee-derived):** whenever an `employee` is resolved (device+PIN), map it to a `Principal` (`source:'employee'`). `employee` remains set for attribution; `principal.role === employee.role`.
- **PWA human (membership-derived):** read JWT `app_metadata` (`tenant_id`, `app_role ∈ {owner,admin,manager}`, `store_ids`) **synchronously in memory** → `Principal` (`source:'membership'`), `employee` stays `null`.

Only the **shared shell** (route guards, Sidebar, Header) + a **small set of management pages** repoint to `principal`; every till-only/fiscal/hardware consumer keeps reading `employee` and is left untouched. We do **not** blindly touch all ~88 `state.employee` sites.

## Load-bearing till invariant (make explicit — Gap #3)
**The Electron till only ever holds an `app_role === 'device'` session.** PIN login (`signInWithEmployeeCredentials`) resolves an employee via a direct `setState` and never goes through the `SIGNED_IN` human branch. Therefore **the membership (human) branch never runs on the till** and `employee` attribution is never dropped there.
- `signInWithEmailAndPassword` is **dead code**: verified zero callers in `src/` (only its definition at `SupabaseAuthContext.tsx:154` and its registration in the context `value` at :386). Treat it as unused. Do **not** describe the else-branch as a live "legacy email-employee" path — it is dead.
- **If email-employee login is ever revived**, gate the human branch on the **absence of an `employees` row for that `auth_id`**, not solely on `app_role`, so a user who happens to carry a human `app_role` can never silently lose operator attribution. Preferred: delete `signInWithEmailAndPassword` in a follow-up, or annotate it `@deprecated // unused; reviving requires the employees-row guard above`.

## Deadlock safety (the other load-bearing constraint)
The existing `setTimeout(0)` in the `SIGNED_IN` handler exists because `fetchEmployeeData` issues a PostgREST call whose internal `supabase.auth.getSession()` deadlocks against the auth lock held during the callback (`SupabaseAuthContext.tsx:299-305`). The membership path **must not** reintroduce this: `deriveMembershipPrincipal(session)` reads only `session.user.app_metadata` (already in memory) — pure, synchronous, no PostgREST, no `getSession`. For v1 we do **not** enrich from `tenant_members` — `pwa-login` already validated membership and stamped claims. Any future enrichment must live inside a deferred `setTimeout(0)` block.

## isAuthenticated + SIGNED_IN branch (the one behavioral pivot)
In `onAuthStateChange` `SIGNED_IN`, branch on `app_metadata.app_role`:
- `app_role ∈ {owner,admin,manager}` → **human**: derive membership principal synchronously, `setState({ user:session.user, employee:null, session, principal, isAuthenticated:!!principal, isLoading:false, error:null })` immediately (no deferral, no deadlock).
- otherwise (`'device'`, or undefined) → keep the existing deferred `setTimeout(0)` → `fetchEmployeeData` → `principal = employee ? deriveEmployeePrincipal(employee, session) : null`; `isAuthenticated = !!principal` (replaces the `!!employee` at :313).

`initializeAuth` (reload): branch on `app_role` **before** calling `fetchEmployeeData`. Human → derive membership principal synchronously and skip the `employees` read (it would return `null` for a human anyway). Device/undefined → `fetchEmployeeData` then `principal = employee ? deriveEmployeePrincipal(...) : null`, `isAuthenticated = !!principal` (replaces `!!employee` at :362). Post-PIN (:230-238) also sets `principal = deriveEmployeePrincipal(employee, deviceSession)`.

Device-session gating preserved: a bare paired till (`app_role==='device'`, no PIN) resolves `employee=null → principal=null → isAuthenticated=false`, staying on `/login` until PIN.

## TOKEN_REFRESHED — safety-critical for the till (Gap #2, HIGH)
Because `isAuthenticated` is now `!!principal`, the ~hourly device token refresh must **never** null `principal`. `deriveMembershipPrincipal(session)` returns `null` for a device session, so it **must** be guarded by a fallback to `prev.principal`, and `...prev` must be kept (preserves `employee` AND `isAuthenticated`):

```ts
} else if (event === 'TOKEN_REFRESHED' && session) {
  setState(prev => ({
    ...prev,
    user: session.user,
    session,
    principal: deriveMembershipPrincipal(session) ?? prev.principal,
  }));
}
```

- **Device refresh:** `deriveMembershipPrincipal → null` → falls back to `prev.principal` (the employee-derived principal); `employee` and `isAuthenticated` survive via `...prev`. The cashier is NOT kicked mid-shift.
- **Human `switch-tenant` refresh:** `switch-tenant` re-stamps claims then calls `refreshSession()`, arriving here as `TOKEN_REFRESHED` with new `app_metadata` → `deriveMembershipPrincipal` returns a fresh membership principal → the active tenant updates. Do **not** recompute `isAuthenticated` here (keep `...prev`).

`signOut` (:262-269), `SIGNED_OUT` (:319-326), and the 60s validation interval (:337-348) must **null `principal` alongside `employee`**.

## hasPermission — branch on principal source
```ts
const hasPermission = (permission: string): boolean => {
  if (state.principal?.source === 'membership') {
    return humanHasCapability(state.principal.role, permission);
  }
  return hasEmployeePermission(state.employee, permission); // unchanged till path
};
```
Bare device (principal `null`) → falls to `hasEmployeePermission(null)` → `false`. Correct.

## pwa-login wiring (client contract locked to the real edge fn)
Add `signInWithPwaCredentials(identifier, password, tenantId?)` to the context. Raw `fetch` to `${VITE_SUPABASE_URL}/functions/v1/pwa-login` with anon `apikey`/`Authorization` headers (same shape as `DevicePairing.tsx:42-50`), body `{ identifier, password, tenant_id? }`. Read the JSON body regardless of HTTP status. The edge fn (`supabase/functions/pwa-login/index.ts`) returns exactly:
- `200 {status:'select_tenant', memberships:[{tenant_id, role}]}` (multiple memberships, none chosen) → return `memberships` to the UI (**no session yet**). Note: memberships carry **`tenant_id` + `role` only — no tenant name** (Open Issue: friendly picker needs a name lookup).
- `200 {status:'ok', session:{access_token, refresh_token, expires_at}, active:{tenant_id, role, store_ids}, memberships}` → `supabase.auth.setSession({ access_token, refresh_token })` (pattern `DevicePairing.tsx:53-56`). `setSession` fires `SIGNED_IN` → synchronous membership-principal derivation.
- `401 {error:'invalid_credentials'}` → friendly "invalid username/email or password", `{success:false}`.
- `403 {error:'no_membership'|'not_a_member'}` → friendly "no access to this workspace", `{success:false}`.

The login-time tenant picker re-calls `signInWithPwaCredentials(identifier, password, chosenTenantId)` (the edge fn's `wantTenant` branch) — no session required, password still in form state. The in-app (post-login) tenant switcher via `switch-tenant` + `refreshSession()` is a separate optional deliverable (Open Issues); `TOKEN_REFRESHED` re-derivation is wired regardless so it "just works" when added. Optionally add `switchTenant(tenantId)` (fetch `switch-tenant` with the live bearer, then `supabase.auth.refreshSession()`).

## Role → capability map (humans only)
New `src/utils/roleCapabilities.ts` exporting `ROLE_CAPABILITIES: Record<'owner'|'admin'|'manager', ReadonlySet<string>>` over the **existing** permission vocabulary (`src/types/supabase.ts:420-434`: `sales, inventory, customers, reports, dashboard, employees, settings, transactions, profit_costs, orders, clear_data` — 11 strings; `'all'` is the vocabulary index-0 sentinel, not a grantable capability here) plus `humanHasCapability(role, permission)`:
- **owner** = the **explicit superset of all 11** real permissions (the `isSystemAdministrator` "return true" replacement — NOT modeled as `['all']`, because `access_levels:['all']` deliberately excludes the Restricted set at `accessPermissions.ts:4-15,28`).
- **admin** = all 11 **minus `clear_data`** (`{dashboard, reports, profit_costs, transactions, inventory, customers, employees, orders, settings, sales}`). The AT-cert sub-panel inside Settings stays owner-only (Settings gate below).
- **manager** = `{dashboard, reports, transactions, inventory, customers, orders, sales}` (NO `employees, settings, profit_costs, clear_data`).

Coverage check (must hold or a human silently loses nav/routes): every permission string used by `App.tsx` `PermissionRoute`s is one of `sales, dashboard, inventory, customers, employees, reports, profit_costs, transactions, orders, settings` — all present in the map. Granting `sales` to humans is harmless because `/pos` and `/queue` are blocked on the PWA host by `HostRoute` + the sidebar host filter.

## Host-aware routing
- `getRoleBasedRedirect(role)` → `isPwaHost ? PWA_LANDING : '/pos'` (keep the `role` param for future store-scope; must not throw on `'owner'`). `PWA_LANDING` = `/reports` provisionally (Dashboard is mock — Open Issue).
- New `HostRoute` element wrapper `{ host:'till', children }` that renders children on the matching host else `<Navigate to={PWA_LANDING} replace/>`. It **redirects, never access-denies**, so it cannot dead-end. Wrap till-only route elements: `/pos` (:161-168), `/queue` (:273-280), `/cash-drawer-audit` (:281-288), `/pair-device` (:148), `/order-status` (:142-145), and the hardware redirect stubs `/printer-test` (:354), `/cashier-testing` (:351), `/electron-testing` (:352), `/receipt-demo` (:334-348).
- Add a **PWA catch-all** as the LAST inner `<Route path="*" element={<Navigate to={isPwaHost ? PWA_LANDING : '/pos'} replace/>}/>` (before :368).
- `PermissionRoute` default `fallbackPath` (:69) becomes host-aware; its access-denied UI (:85-88) reads `principal?.displayName/principal?.role` (not `employee?.*`).
- `AppContent` login guards (:125, :135): `isAuthenticated && employee` → `isAuthenticated && principal`, and `getRoleBasedRedirect(principal.role)`.

## Browser login UI
New `src/components/Auth/LoginFormPwa.tsx` (username-or-email + password): calls `signInWithPwaCredentials`; on `select_tenant` renders a tenant picker (role-labelled; `tenant_id` shown since no name is available — Open Issue) and re-calls with the chosen `tenant_id`; on success `SIGNED_IN` drives the redirect. In `AppContent`, the `/login` and `/login2` elements become `isPwaHost ? <LoginFormPwa/> : <LoginForm2/>`. `LoginForm2` (device PIN) is untouched and stays the till login.

## Consumer migration — repoint vs leave

**Repoint to `principal` (shared shell — must render for a null-employee human):**
- `src/App.tsx` — `PermissionRoute` access-denied (`employee?.name/role` :85/:88 → `principal?.displayName/role`); `AppContent` login guards + `getRoleBasedRedirect`; host routing/catch-all.
- `src/components/Layout/Sidebar.tsx` — footer identity (`employee?.name` :292, `employee?.role.toUpperCase()` :295 → `principal?.displayName` / `principal?.role.toUpperCase()`) + host filter at :230. Optionally hide the "My Profile" button when `principal?.source==='membership'` (MyProfileDialog is employee-only).
- `src/components/Layout/Header.tsx` — identity (`employee?.name` :116/:121 → `principal?.displayName`; `employee?.employee_number` :122 → show `principal.role` when `source==='membership'`, else `employee?.employee_number`).

**Repoint (management pages a PWA human must operate):**
- `src/pages/Settings.tsx` — `isSystemAdmin = isSystemAdministrator(employee)` (:250) → `isSystemAdministrator(employee) || principal?.role==='owner'`; audit attribution `employee?.id` (:649) stays nullable for humans.
- `src/pages/Employees.tsx` — **two distinct repoints (Gap #1, do NOT conflate):**
  1. `isCurrentSystemAdmin` (:57) is an **ADMIN001 IDENTITY** check (`systemAdmin.ts`: "Não confundir com role === 'admin'") gating `RestrictedAccessLevels` **visibility and assignability** (:143, :280, :389) and ADMIN001 protection (:447, :687). Mirror Settings exactly: `const isCurrentSystemAdmin = isSystemAdministrator(currentUser) || principal?.role === 'owner';`. Till admins are never `'owner'`, so till behavior is preserved (still ADMIN001-only); only the PWA owner gains the elevated view. **Do NOT** repoint this to `role==='admin'` — that would let every admin-role till employee see and GRANT `clear_data`/`profit_costs` (privilege escalation).
  2. The plain **role gates** (who may create/edit/delete admin-role employees): introduce `const canManageAdminEmployees = principal?.role === 'admin' || principal?.role === 'owner';` and replace `currentUser?.role === 'admin'` → `canManageAdminEmployees` and `currentUser?.role !== 'admin'` → `!canManageAdminEmployees` at **all** of :320, :374, :380, :453, :503, :686, :690, :714, :957, :966. On the till `principal.role === employee.role`, so these are byte-for-byte equivalent to today; a PWA owner is additionally allowed. (The prior plan listed only :320/:374/:380/:453/:503/:686 and omitted :690/:714/:957/:966.)

**Leave on `employee` (till-only / fiscal / hardware — already null-safe, correct host split):** `src/pages/POS.tsx`, `src/pages/Transactions.tsx` (fiscal-write handlers all `if(!employee)return`), `src/pages/CashierTesting.tsx`, `src/pages/SeedManagement.tsx`, `src/components/ReceiptDialog.tsx`, `src/components/HR/MyProfileDialog.tsx`, `src/components/ProductForm.tsx`, `src/components/ImageUploader.tsx`, `src/components/PurchaseReceiptImportDialog.tsx`. A PWA human is correctly blocked from till/fiscal/hardware writes.

**Flagged decisions — leave on `employee` for v1, human is blocked, do NOT silently repoint (Open Issues):** `src/pages/Devices.tsx` (role gate :163 is easy, but device-admin RPC auth = `employee_number`+PIN at :59/:61 — a human has neither), `src/pages/HR.tsx` (`createApprovedHoliday(..., signedInEmployee.id)` :219 is almost certainly an `employees.id` FK; guard :213 blocks a human).

## Sequencing rationale
Foundation types/map first (inert) → auth-context core (till keeps working the instant `isAuthenticated=!!principal`, because the employee path derives a principal whenever `employee` is set, and TOKEN_REFRESHED falls back to `prev.principal`) → pwa-login method → host routing → login UI → shell repoint → management repoints. The app is never broken mid-sequence: the till path is preserved at every step; humans simply cannot log in until steps 3–5 land.

## PRINCIPAL SHAPE

```ts
// src/types/principal.ts
export type MembershipRole = 'owner' | 'admin' | 'manager';

export interface Principal {
  source: 'employee' | 'membership';   // which derivation path produced it
  userId: string;                      // session.user.id (== employee.auth_id on till)
  displayName: string;                 // employee.name (till) | session.user.email (human, v1 fallback)
  role: string;                        // employee.role (admin|manager|cashier|trainee) OR MembershipRole
  tenantId: string;                    // app_metadata.tenant_id
  storeIds: string[];                  // device: app_metadata.store_id -> [store_id]; human: app_metadata.store_ids ?? []
  capabilities: ReadonlySet<string>;   // membership: ROLE_CAPABILITIES[role]; employee: new Set() (unused)
}
```
`AuthState = { user, employee, session, principal, isAuthenticated, isLoading, error }`. `isAuthenticated = !!principal`.

**Populators:**
- `deriveEmployeePrincipal(employee, session): Principal` — `source:'employee'`, `userId=session.user.id`, `displayName=employee.name`, `role=employee.role`, `tenantId=session.user.app_metadata.tenant_id`, `storeIds = app_metadata.store_id ? [app_metadata.store_id] : []`, `capabilities=new Set()` (unused; `hasPermission` delegates to `hasEmployeePermission`). Called at post-PIN :230-238, the deferred SIGNED_IN device branch, and initializeAuth device branch.
- `deriveMembershipPrincipal(session): Principal | null` — **SYNCHRONOUS**, reads only `session.user.app_metadata`. Returns `null` unless `app_role ∈ {owner,admin,manager}` **and** `tenant_id` present (so a `'device'` or claim-less session never becomes a human principal — this is what makes the TOKEN_REFRESHED fallback safe on the till). `source:'membership'`, `userId=session.user.id`, `role=app_metadata.app_role`, `tenantId=app_metadata.tenant_id`, `storeIds = app_metadata.store_ids ?? []`, `displayName = session.user.email ?? ''` (v1 fallback — real-name gap is an Open Issue), `capabilities = ROLE_CAPABILITIES[role]`.
