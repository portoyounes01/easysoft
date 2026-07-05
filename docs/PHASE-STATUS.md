# Multi-Tenant Conversion — Phase Status & Register (2026-07-05)

Authoritative status of every phase and every deferred/gated item. Companion to
`docs/multi-tenant-plan.md` (design) and `docs/update-policy.md` (fleet updates).
**Legend:** ✅ done+verified · 🟡 partial (see note) · ⛔ externally gated (cannot be
finished without an external dependency) · 🧊 deliberately deferred (rationale given).

## Environments
- **EasySoft** = production, ref `kmojrkkjuehmpordueoe` (Frankfurt). **Fully cut over.**
- **EasySoft-staging** = `mubdnwmbvdutqzzprjdp`. Mirrors prod migrations.
- Dev loop: author migration → `db push` to both (no Docker; pooler is reliable, REST is intermittently flaky from this environment). Edge fns deploy via `--use-api`.

## Phases
| Phase | Status | Notes |
|---|---|---|
| **0 Hardening** | ✅ | Baked into the consolidated genesis + hardening migrations; dangerous routes/panels gated; sealed-doc triggers; mass-delete removed. |
| **1 Tenancy backbone** | ✅ | Control-plane tables + `tenant_id` on all business tables (default-tenant seed); per-tenant composite uniques. |
| **2 Identity/auth cutover** | ✅ | Device pairing (`pair-device`), server-side `employee_pin_login`, credential columns dropped from `employees`, admin Tills console (`manage-devices`), `app.*` claim helpers. Verified live on EasySoft. |
| **3 Tenant-scoped RLS** | 🟡 | **Core done + isolation PROVEN** on both envs (tenant A/B/anon probe). Anon table grants revoked. **Deferred:** FORCE RLS, storage Ring 4 (below). |
| **4 Per-tenant fiskaly + checkout** | 🟡/⛔ | **DB model done** (fiscal_* + tenant_fiscal_config/secrets). **pos-checkout / fiskaly integration:** TEST-mode buildability pending the fiskaly TEST-API probe; **LIVE is ⛔ gated** (below). |
| **5 PWA foundations + tenant #2** | ⛔ | Identity/RLS already support a direct-PostgREST PWA (proven by the isolation probe). notification_events table exists. Actual PWA + a real 2nd business are out of scope here. |
| **6 De-shim & debt** | 🧊 | Ongoing; see items below. |

## Phase 3 deferrals (reasoned, not silent)
- **FORCE ROW LEVEL SECURITY** 🧊 — Would subject the SECURITY DEFINER RPCs (which run as the table owner) to RLS; our policies are `TO authenticated`, so the owner-context RPCs would match no policy and break. Making it safe requires rewriting every policy `TO public` with the tenant check (so claim-carrying RPCs still match) + confirming `service_role` (BYPASSRLS) is unaffected. Marginal benefit: it only guards against the *owner role* being used directly (it never is) or a buggy definer function; `service_role` bypasses it regardless. Isolation against the real threat (a hostile *authenticated* session) is already proven without it. **How to finish:** rewrite policies `TO public USING(tenant_id=app.tenant_id())`, `ALTER TABLE ... FORCE ROW LEVEL SECURITY`, re-run the isolation probe + an RPC-still-works probe on staging first.
- **Storage Ring 4 (product-images private + tenant paths + signed URLs)** 🧊 — The bucket is currently `public` and images render via public URLs. Flipping to private breaks every existing image; a correct cutover needs: `upload-image` to write `{tenant_id}/…` paths, all image displays to switch to signed URLs, migration of existing objects, and browser testing. Low-severity leak (product photos, cross-tenant-enumerable). **How to finish:** dual-read window → object move to tenant paths → rewrite `products.image_url` → private flip → `storage.objects` policies on the path prefix → signed-URL reads.

## Phase 4 gates (⛔ — cannot be finished without external input)
- **AT software-certificate confirmation** — "fiskaly" is not on AT's public certified-programs list; the certificate number is printed on every document. **Blocks any LIVE tenant / contracting.** Needs written confirmation from fiskaly.
- **fiskaly written answers** (plan §13): buyer-NIF on FS/FR, document-number allocation authority, LIVE doc-type coverage (FT/RG-RC/GT-GR), QES-for-PDF timeline vs the 2027-01-01 mandate, pricing, SAF-T submission. The TEST-API probe (in progress) resolves what it can empirically; the rest need fiskaly support/sales.
- **Layout approval** — fiskaly must approve each document layout in writing before production (indemnity on tenant-modified layouts).
- **tenant_fiscal_secrets encryption-at-rest** 🧊 — table is access-locked but plaintext; move to Vault (pgsodium) per plan §4.6.

## Config items (⛔ — need your dashboard/Vercel/procurement)
- **S6 disable public signup** — Dashboard → Auth → turn off "Allow new users to sign up" (or Management API). CLI mgmt token is in the macOS keychain (not scriptable from here).
- **JWT expiry → 15 min** — Dashboard → Auth (currently 3600s). Lowers ban/claim-change convergence time.
- **S13 drop `VITE_FISCAL_RSA_PRIVATE_KEY_PEM` from Vercel** — hygiene; key never used in prod.
- **S21 edge-function CORS allowlist** — needs the exact prod origin set (Electron `app://pos` + the real Vercel domain) to avoid opaque breakage; currently `*`.
- **S22 Electron runtime-config layer** — enables key rotation without reinstalling tills; only needed before rotation (itself deferred). Ties into `docs/update-policy.md` Stage 0.
- **Code-signing** — DECIDED unsigned for v1 (Windows/Linux tills; no macOS tills).

## Phase 2 polish (🧊 — client, needs browser testing)
post-pair bootstrap (pull roster/catalog after pairing), authenticated-sync fail-closed
enforcement (anon table grants now revoked, so anon sync already fails — needs graceful
handling not error-spam), `ConnectivityGate` (block checkout when offline — online-required
v1), negative tests for image/purchase/HR authorization. Deferred because they need reliable
in-app/browser verification (sandbox↔prod REST is flaky here) and are lower risk than the
phases above.

## Cross-cutting caveats / assumptions
- **App not re-smoke-tested in-browser after Phase 3** — low risk (app is RPC-heavy; RPCs bypass RLS; the 2 direct selects are tenant-scoped and the isolation probe showed own-tenant reads work). Please confirm catalog/login/checkout on a paired till.
- **Demo seed data on EasySoft** (SYS001/ADM001 admins, etc.) will be wiped/replaced at real tenant provisioning.
- **Isolation is proven at the DB layer via SQL probes** (simulated JWT claims), not via two live browser sessions — equivalent for RLS correctness, but the PWA path itself is untested (no PWA yet).
