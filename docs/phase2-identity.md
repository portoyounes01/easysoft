# Phase 2 — Identity cutover execution log

> Status: **implementation complete locally; staging SQL blocked; production unchanged** (2026-07-05). This is the execution record for `docs/multi-tenant-plan.md` §6 and §11 Phase 2. It records deployed state separately from repository state so an uncommitted or unapplied migration is never mistaken for a closed security issue.

## Current boundary

| Surface | State | Evidence |
|---|---|---|
| `employee_credentials` + `employee_pin_login` foundation | Applied and previously verified on EasySoft | migrations `20260708000000` / `20260709000000`; commit `fc001f0` |
| Pairing function, provisioning tool, pairing UI, device session bootstrap | Applied/deployed and previously browser-verified on EasySoft | commits `093b556`, `1443c55`, `b60b145` |
| Credential cutover migration | Implemented, remote dry-run sees exactly one pending migration; **not applied anywhere** | `20260710000000_phase2_employee_credentials_cutover.sql` |
| JWT-only `upload-image` | **Deployed to EasySoft-staging** (`mubdnwmbvdutqzzprjdp`); not deployed to production | Supabase CLI deployment, 2026-07-05 |
| Client login/roster/HR/proof-hash changes | Implemented and tested locally; not deployed | files listed below |
| EasySoft production (`kmojrkkjuehmpordueoe`) | **Unchanged by this slice** | linked migration command was dry-run only |

The Phase 0 credential exposure therefore remains live in production until the coordinated cutover below is completed. Do not mark Shim R2 closed merely because the repository contains the migration.

## Implemented cutover

### Database

`20260710000000_phase2_employee_credentials_cutover.sql` is a fail-closed transaction:

1. Rejects any non-empty credential that is neither 64-character SHA-256 hex nor a structurally valid bcrypt hash. Plaintext is never silently migrated.
2. Copies legacy SHA-256 and bcrypt values into `employee_credentials` without overwriting a credential already upgraded to bcrypt.
3. Replaces `get_employees_delta` with an authenticated, JWT-tenant-derived roster function that contains no credential fields and revokes anon execution.
4. Replaces `upsert_employees` with an authenticated, tenant-derived writer. Credential hashes are input-only and go to `employee_credentials`; null means “leave credential unchanged.”
5. Deletes the already-revoked, unused `upsert_employees_with_mapping` function because it would reference removed columns.
6. Drops `employees.pin` and `employees.password_hash`, making future accidental `SELECT *` serialization incapable of leaking credentials.

The global `UNIQUE(employee_number)` remains intentionally in place until the Phase 3 atomic constraint/RPC/RLS swap. The Phase 2 upsert refuses a conflict whose existing row belongs to another tenant; tenant #2 remains blocked until Phase 3.

### Client identity

- `SupabaseAuthContext` requires a paired device session and calls `employee_pin_login`; there is no offline or client-side hash comparison fallback.
- The device JWT remains the security principal. Successful PIN verification selects an employee attribution record under that session.
- Employee logout clears attribution but preserves the device session, so signing out an operator no longer unpairs the till.
- Reload restoration re-fetches the saved employee by both `tenant_id` and employee id. A bare device session remains on the login screen.
- Old `employee_credential_hash` localStorage data is removed. Roster pulls and successful employee pushes erase legacy hashes from Dexie.
- The unused legacy `src/contexts/AuthContext.tsx` was deleted.
- HR clock-in/out now calls `employee_pin_login` instead of inspecting Dexie hashes.
- Successful pairing persists a validated `{tenant, store, device}` scope and reloads before opening the module-level Dexie singleton.
- `resolveDexieDbName()` now uses `POSDatabase::{tenant_id}::{store_id}` with a `::training` suffix. Tenant #1/default-store retains the legacy `POSDatabase`/`restaurante_pos_training` aliases under Shim R3.
- `/order-status` redirects an unpaired installation to `/pair-device`.

### Credential-dependent functions

- `upload-image` and `extract-purchase-document` no longer accept `proof_hash`.
- Both verify the bearer token, require a tenant claim, scope employee lookup by tenant, and verify an enrolled device row for device principals.
- `upload-image` is now configured with `verify_jwt=true`.
- Image and purchase-import callers send the paired session token only; no reusable credential verifier is stored or replayed.

### Employee writes and seed tooling

- Normal employee create/PIN reset continues through `upsert_employees`; local SHA-256 values are cleared after a successful push.
- In-app development seed paths use the same RPC.
- Service-role seed scripts write the credential-free roster and `employee_credentials` separately. `POS_TENANT_ID` selects the target tenant and defaults to tenant #1 for the existing seed workflow.

## Verification performed

- `npx tsc --noEmit` — pass.
- `npm run build` — pass (existing bundle-size/module-format warnings only).
- Focused authentication/HR/purchase/seed tests — **37/37 pass**.
- Full Vitest rerun — **207 pass, 4 fail**. The remaining failures are the pre-existing `products-categories-i18n.test.tsx` missing `DesignSystem2CustomizationProvider` failure and are unrelated to this slice.
- Focused ESLint on the core changed auth/service/function/test files — zero errors, one existing React fast-refresh warning.
- Repository-wide ESLint remains red on the existing baseline (227 errors / 41 warnings before this work is considered clean); this slice did not attempt an unrelated lint cleanup.
- Supabase linked-project dry run — exactly `20260710000000_phase2_employee_credentials_cutover.sql` pending.
- `upload-image` deployment to EasySoft-staging — success.
- Staging SQL apply — blocked because the stored/provided staging Postgres password failed SASL authentication. Local Docker validation was also unavailable because Docker was not running.

## Coordinated deployment runbook

This cutover is not safe as independent production deploys. Use one maintenance window:

1. Restore/rotate the EasySoft-staging database password and link the CLI to `mubdnwmbvdutqzzprjdp`.
2. Apply the migration to staging and run the SQL acceptance checks below.
3. Deploy the paired client to staging; verify pairing → roster → PIN login → reload → employee logout without device unpairing.
4. Verify employee create, PIN reset, HR clock-in/out, image upload/delete, and purchase-document authorization.
5. Verify anon cannot execute `get_employees_delta`, authenticated cross-tenant claims return no roster rows, and `employees` has no credential columns.
6. Pair the production till and confirm its device JWT claims before the database cutover.
7. Deploy the JWT-only `upload-image` and the client build to production, then apply the migration in the same maintenance window.
8. Run the production smoke checks; only then mark Shim R2 closed in `docs/multi-tenant-plan.md` and the Phase 0 exposure resolved.

Required SQL acceptance assertions:

```sql
select count(*) = 0 as no_unmigrated_credentials
from public.employees e
left join public.employee_credentials c on c.employee_id = e.id
where c.employee_id is null;

select not exists (
  select 1 from information_schema.columns
  where table_schema = 'public'
    and table_name = 'employees'
    and column_name in ('pin', 'password_hash')
) as roster_has_no_credentials;

select has_function_privilege('anon', 'public.get_employees_delta(timestamptz)', 'EXECUTE') = false
  as anon_delta_revoked;
```

## Remaining Phase 2 work after this cutover

- Post-pairing bootstrap replacing startup JSON/YAML seeding.
- All sync services fail closed without an authenticated device/human session.
- `ConnectivityGate` v1.
- Electron `safeStorage` mirroring for the device refresh token.
- Public signup disablement and the remaining Phase 0 runtime-config/key-rotation work.
