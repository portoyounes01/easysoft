# Platform Console (sysadmin) — Runbook

**Type:** ops runbook for the platform-level admin surface added 2026-07-24 (REGISTER D-P1/D-P2).
**Authority model:** multi-tenant-plan §6.5 — *"platform tooling = service role from back-office only (no RLS carve-outs for us)."* There are **zero** RLS policies granting platform access; every console action goes through the `platform-admin` edge function, which checks the caller against `public.platform_admins` (the SSOT) **per request** and then acts with the service role. Every mutation appends a `platform_audit_log` row (pairing codes and passwords are never audited).

## A. Pieces

| Piece | Where |
|---|---|
| Identity + audit tables + hook v2 + guarded tenant delete | `supabase/migrations/20260802000000_platform_admin_control_plane.sql` |
| Console backend (all actions) | `supabase/functions/platform-admin/index.ts` (config.toml block appended) |
| Login fallback (no membership → platform check) | `supabase/functions/pwa-login/index.ts` |
| Bootstrap script (first sysadmin) | `scripts/provision-platform-admin.mjs` |
| Client principal (`source: 'platform'`, role `sysadmin`) | `src/types/principal.ts`, `src/contexts/SupabaseAuthContext.tsx` |
| Console UI | `src/pages/PlatformConsole.tsx` at `/platform` (App.tsx `PlatformRoute`), Sidebar "Platform Console" |
| Owner-side till pairing (PWA) | `src/pages/Devices.tsx` (membership path, no PIN), `manage-devices` store-scope hardening |

## B. Deploy (in order — prod writes, classifier-gated)

```bash
# 1. migration (platform_admins, platform_audit_log, hook v2, platform_delete_tenant)
supabase db push --linked
# 2. functions (new + two modified)
supabase functions deploy platform-admin pwa-login manage-devices --project-ref <ref>
# 3. deploy the web build (Vercel) so /platform + the Devices unlock exist in the PWA
```

The access-token hook is already ENABLED in config (`[auth.hook.custom_access_token]`); the migration only replaces the function body (adds platform-claim stripping) — no dashboard action needed.

## C. Bootstrap the first sysadmin

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<key> \
node scripts/provision-platform-admin.mjs \
  --email you@example.com --password '<strong>' --username khalil --note "Khalil — founder"
```

Then sign in on the **PWA login** with those credentials → you land on `/platform`.

Rules:
- **Dedicated account.** A platform admin must NOT hold tenant memberships — `pwa-login` gives the tenant path precedence, which would strand that user outside the console. The script refuses if memberships exist.
- **Removal:** `DELETE FROM public.platform_admins WHERE user_id = '<uuid>';` — the edge fn refuses immediately; the token hook strips the UI claim at the next refresh (≤1h).
- The `app_metadata.platform_admin` claim is **UI-only** (renders the console shell). The edge function never trusts it.

## D. What the console does

- **Tenants:** list with live counts (stores / tills enrolled / accounts), create (name, legal name, NIF, country, plan — status `active`), edit (incl. `status` and `subscription_plan`), delete.
  ⚠️ **Delete is guarded:** only a tenant with **zero transactions AND zero fiscal documents** can be deleted (`platform_delete_tenant`, single transaction, multi-pass FK-ordered; device auth users cleaned up after). Anything with fiscal history must go through offboarding (plan D6) — suspend instead.
- **Stores:** list/create/close/reopen per tenant.
- **Accounts:** list members (email/username/role), create owner/admin/manager logins (admin-set password, same invariants as `provision-human` but with platform authority — may mint owners in any tenant), remove (same off-device cleanup as `revoke-human`; still refuses to drop the last owner).
- **All tills:** cross-tenant device list (presence, status, training flag), create a till + one-time pairing code (QR), reissue, rename, revoke. Same code semantics as the tenant-side flow (sha256-only storage, 15-min TTL, single-use, attempt-capped).
- **Audit:** newest-first `platform_audit_log` with actor emails.

## E. Owner-side till pairing (PWA) — what changed

- `/devices` now works for **membership owners/admins** signed into the PWA: the JWT is the authority (`manage-devices` accepted human JWTs all along); the employee-PIN unlock remains only on the till path.
- **Store-scoped humans** (`tenant_members.store_ids` set) are now enforced server-side in `manage-devices`: list is filtered, and create/reissue/revoke against another store return `store_scope_forbidden` (403).
- `/pair-device` (code REDEMPTION) is till-host-only in production builds (plan A5: Electron-only tills; a browser must not become a phantom till). Dev builds stay exempt.

## F. Typical flows

**Onboard a new business end-to-end (console):** create tenant → expand → add store → create owner account → All tills → create till (tenant+store+name) → hand the one-time code to whoever stands at the till → they type it into the POS app's pairing screen → till shows in the list as `enrolled`/online.

**Owner adds a till from their phone:** PWA login (owner) → Tills (sidebar) → "Pair a new till" → store + name → code/QR → type it on the new till.

**Fix the dev fixture (testowner) without SQL:** console → tenant → add a real store, then create the till there (tenant-onboarding-runbook §C's SQL path is now optional).

## G. Known limits (loud, registered in D-P1)

1. `pwa-login` still has **no brute-force rate limiting** (pre-existing D17/D22) — now also fronts platform-admin login. Mitigations: generic errors, strong password required. Add throttling before heavy use.
2. **Training-mode toggle not in the console** (plan §7.5 says back-office sets `devices.training_mode`) — deferred, one action + one button when needed.
3. **Audit failure does not roll back the action** (no cross-request transaction via PostgREST); it logs loudly in the function logs instead.
4. Tenant delete does **not** touch Storage objects (`product-images/{tenant_id}/…`) — empty tenants normally have none; sweep manually if one was used for image testing.
5. Console UI is EN-only (like Devices.tsx); fold into the i18n pass (D-ES2 residuals).
6. A user cannot be BOTH tenant member and platform admin (v1 disjoint by design; pwa-login prefers the membership path).
