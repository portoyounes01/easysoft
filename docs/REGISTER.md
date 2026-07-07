# Multi-Tenant Conversion — Living Register

**Purpose:** one place to track every blocker, assumption, caveat, trade-off, and
deferral so nothing is silently dropped. Companion to `docs/PHASE-STATUS.md` (per-phase
status), `docs/multi-tenant-plan.md` (design), `docs/update-policy.md` (fleet updates).

**How to use:** each item has a stable ID (e.g. `B2`, `A5`). Reference it in commits/PRs
("closes A2"). Update **Status** + **Updated** when it changes. Add new rows; don't renumber.

**Status legend:** `OPEN` (needs action) · `RESOLVED` (done + verified) · `ACCEPTED`
(deliberate, no action planned) · `GATED` (waiting on an external party).
**Owner:** who must act — `user`, `me` (assistant/eng), `fiskaly`, `AT` (tax authority).

Last reviewed: **2026-07-06**.

---

## 1. Blockers (gate further progress)

| ID | Item | Detail | Owner | Status | Unblock action |
|----|------|--------|-------|--------|----------------|
| **B1** | fiskaly TEST credentials | Old `.env` creds returned `invalid_grant` (name, not key). **User supplied correct keys 2026-07-06 → auth verified (HTTP 200).** | user | ✅ RESOLVED (2026-07-06) | Done. |
| **B2** | Deploy `pos-checkout` + migration to **prod (EasySoft)** | `supabase db push` / function deploy to prod is correctly gated by the deploy classifier; needs explicit human go-ahead. Function + `20260716…` migration are committed but **not deployed anywhere**. | user | OPEN | Say "deploy pos-checkout + migration to EasySoft" (or run it yourself). |
| **B3** | **Staging** DB credentials | Only EasySoft's DB password is in `.env`; staging (`mubdnwmbvdutqzzprjdp`) password is unknown, so I can't test on staging first. | user | OPEN | Provide staging DB password, or authorize a staging deploy. |
| **B4** | Records-response contract unverified | The `POST /records` (INTENTION→TRANSACTION) **response** shape (ATCUD/hash/qr/certificate field paths, number authority) is not yet observed. Needs one real TEST issuance, which needs a provisioned taxpayer→location→system tree (none exist under the org yet). | me | OPEN | Provision a TEST tree + issue one receipt (see D10); then close A2–A5. |
| **B5** | AT software-certificate confirmation | "fiskaly" is absent from AT's public certified-programs list; the certificate number prints on every document. **Blocks any LIVE tenant / contracting.** | fiskaly | GATED | Get written confirmation of the AT certificate number from fiskaly. |
| **B6** | fiskaly written answers (plan §13) | Buyer-NIF policy on FS/FR, document-number allocation authority, LIVE doc-type coverage (FT/RG-RC/GT-GR), QES-for-PDF vs the 2027-01-01 mandate, pricing, SAF-T submission responsibility. | fiskaly | GATED | Email fiskaly support/sales; record answers here. |
| **B7** | fiskaly layout approval | fiskaly must approve each document layout in writing before production (indemnity on tenant-modified layouts). | fiskaly | GATED | Submit layouts for approval before first LIVE tenant. |
| **B8** | Real 2nd business + PWA (Phase 5) | Identity/RLS already support a direct-PostgREST PWA (proven by the isolation probe); the actual PWA build + a real second tenant are out of scope for the current work. | user | OPEN | Onboard a real second business; scope the PWA build. |
| **B9** | Dashboard configs | S6: disable public signup (Auth → "Allow new users to sign up"). JWT expiry → 15 min (currently 3600s). CLI mgmt token is in the macOS keychain, not scriptable from here. | user | OPEN | Toggle in Supabase dashboard (both prod + staging). |
| **B10** | Vercel hygiene (S13) | Drop unused `VITE_FISCAL_RSA_PRIVATE_KEY_PEM` env var (never used in prod; we use fiskaly). | user | OPEN | Remove from Vercel project env. |
| **B11** | Prod CORS allowlist (S21) | Edge functions currently allow `*`. Needs the exact prod origin set (Electron `app://pos` + real Vercel domain) to lock down without opaque breakage. | user | OPEN | Provide exact prod origins; I'll set the allowlist. |
| **B12** | **fiskaly account has NO SIGN PT (Portugal) — verified in-dashboard 2026-07-06** | Logged into the account (user CHRIT). **Classic `dashboard.fiskaly.com`** org `group1` has: Germany SIGN DE, Germany DSFinV-K, Austria SIGN AT, **Spain SIGN ES**, fiskaly Receipt — **no Portugal**. That's why the `.env` key is a Spain key (`azp: sign-es`). **New `hub.fiskaly.com`** account `my_account` (org `bf68bcbd…`) has only **RECEIPT + SAFE** services enabled; SIGN PT is a **brand-new product announced 3 Jun 2026** ("Expanding to Portugal… SIGN PT") and is **not enabled**, with **no self-serve enable path** visible. Portugal fiscalization is therefore **not possible on this account today** — this gates ALL of Phase 4 (B4, D10, and LIVE B5–B7). | user + fiskaly | 🧊 DEFERRED (user, 2026-07-06) | Draft request saved at `docs/fiskaly-signpt-request.md`. When resuming: send it to fiskaly, then create a HUB API key for the PT org (**copy the secret immediately — shown once**), put `key`+`secret` in `.env`; I verify in seconds, then provision + issue a TEST receipt and finalize pos-checkout. |

---

## 2. Assumptions (believed true; verify before relying)

| ID | Assumption | Basis | Status | Note |
|----|-----------|-------|--------|------|
| **A1** | Token = `content.authentication.bearer`, ~24h JWT, `expires_at` present | Verified against `test.api.fiskaly.com` 2026-07-06 | ✅ RESOLVED | `pos-checkout` fixed to read this (was `access_token`, would have failed every checkout). |
| **A2** | INTENTION returns an `id`; TRANSACTION response carries ATCUD/hash/qr/certificate | Probe schema-echo + SIGN IT analogy | OPEN | Parsing is defensive w/ fallbacks + `⚠️ASSUMED` inline; confirm via B4. |
| **A3** | fiskaly may override the client `document.number` (returned number authoritative) | plan §13 #8; request side confirms client MUST send it | OPEN | Store fiskaly's returned number as truth once observed (B4). |
| **A4** | fiskaly auto-registers the series and returns the ATCUD | SIGN IT guide wording ("assigned progressive number") | OPEN | Confirm via B4; else we must register series explicitly. |
| **A5** | `systemId` = the fiskaly **System (till) id** | plan §3 hierarchy | OPEN | `pos-checkout` currently reads `tenant_fiscal_config.fiskaly_taxpayer_id` as a **placeholder** — provisioning (D10) must store the real System id and this must be repointed. |
| **A6** | The fiskaly account/org is the **SIGN PT** product | Probe resource model matched PT (UNIT/BRANCH/FISCAL_DEVICE) | ❌ FALSIFIED — it's **SIGN ES** | The TEST key's token has `azp: sign-es` (= the OAuth client that issued it is fiskaly's **Spain** product); its `organization`+`subject` ids **404** on the SIGN PT surface; PT lists are empty. High confidence this is a **Spain (SIGN ES)** key. See **B12**. |
| **A7** | Validated buyer NIF requires an **INVOICE**; RECEIPT only has a free `customer.code` | Verified (request-side schema) | ✅ RESOLVED | Product rule needed: when to escalate FS/FR → FT (see D-note). |
| **A8** | Tenant isolation holds for the (future) PWA direct-PostgREST path | Proven via SQL probes w/ simulated JWT claims | ACCEPTED (caveat) | Equivalent for RLS correctness; the PWA path itself is unexercised (no PWA yet). |

---

## 3. Caveats (known limits of what's shipped)

| ID | Caveat | Impact | Status |
|----|--------|--------|--------|
| **C1** | `pos-checkout` **never deployed or run** | Request contract is verified + retry-safe by construction, but no end-to-end execution has happened. | OPEN (B2/B3/B4) |
| **C2** | App not re-smoke-tested in-browser after Phase 3 | Low risk (RPC-heavy; RPCs bypass RLS; the 2 direct selects are tenant-scoped and own-tenant reads proven). | 🟡 PARTLY CLEARED (2026-07-06): browser-core boots + login screen renders clean after the D6 fix. Electron/paired-till checkout path still user-tested (you own Electron). |
| **C3** | Demo seed data on EasySoft (SYS001/ADM001 etc.) | Will be wiped/replaced at real tenant provisioning; don't treat as real. | ACCEPTED |
| **C4** | Client still uses its existing issuer path | The POS UI is **not** wired to `pos-checkout` yet (deliberate — see T6). | OPEN (after B4) |
| **C5** | `employee_credentials` + `tenant_fiscal_secrets` are plaintext-at-rest | Access-locked (RLS on, no policy, service_role only) but not encrypted. | see D3 |

---

## 4. Trade-offs (deliberate choices with a cost)

| ID | Choice | Cost accepted | Why |
|----|--------|---------------|-----|
| **T1** | v1 is **online-required** (no offline queue) | A network/fiskaly/backend outage stops selling. | User decision D1; simplicity + fiskaly-primary; fail-closed on selling (update-policy §7). |
| **T2** | Allocate `document.number` **before** the fiskaly call | A fiskaly failure leaves a **number gap**. | PT series tolerate explainable gaps; `fiscal_issue_attempts` records every spent number; a reconciler (D8) can void gaps if AT requires. Alternative (allocate after) risks duplicate numbers under concurrency. |
| **T3** | Secrets plaintext-at-rest, access-locked | Weaker than encryption if the DB is exfiltrated with service_role. | Structural home first; Vault is a follow-up (D3). Real threat (client/anon access) already blocked. |
| **T4** | Storage bucket stays **public** for product images | Product photos are cross-tenant enumerable (low severity). | Private cutover is invasive (D2); no PII in product images. |
| **T5** | One series per `(tenant, env, doc_type)` in v1 | No per-store/per-device series segmentation yet. | Simpler; matches single-till-per-store pilots; can split later without data change. |
| **T6** | Don't wire the client to `pos-checkout` until it's verified E2E | Checkout still on the old path for now. | Shipping the client against an unverified **response** shape would be "unreviewed". Wire after B4. |
| **T7** | Legacy fiscal issuers hardened (not yet deleted) | Deleting `fiskaly-/vendus-/invoicexpress-fiscal` now would break any till still dispatching to them (client not yet on `pos-checkout`, C4). | ✅ HARDENED (`7942283`, P0 §4.2 L2): each now `verify_jwt=true` + rejects non-`device` sessions in-body, closing the "any JWT issues fiscal" hole. Full deletion + provider-env-var removal = **D30** (coordinated cutover). Inert until deployed (B2/B3). |

---

## 5. Deferrals (postponed, with rationale + how to finish)

| ID | Deferred | Rationale | How to finish |
|----|----------|-----------|---------------|
| **D1** | FORCE ROW LEVEL SECURITY | Would subject SECURITY-DEFINER RPCs (owner context) to `TO authenticated` policies → they'd match nothing and break. `service_role` bypasses FORCE anyway; the real threat (hostile authenticated session) is already blocked + proven. | Rewrite policies `TO public USING(tenant_id=app.tenant_id())`, `ALTER TABLE … FORCE RLS`, re-run isolation + RPC-still-works probes on staging first. |
| **D2** | Storage Ring 4 (private images, tenant paths, signed URLs) | Flipping to private breaks every existing image; needs path-prefixing, signed-URL reads, object migration, browser testing. Low-severity leak. | Dual-read window → move objects to `{tenant_id}/…` → rewrite `products.image_url` → private flip → `storage.objects` path-prefix policies → signed-URL reads. |
| **D3** | Vault (pgsodium) encryption of `tenant_fiscal_secrets` (+ `employee_credentials`) | Table is the access-locked structural home; encryption-at-rest is additive. | Move secret columns into Vault; update the definer/service paths to decrypt. plan §4.6. |
| **D4** | `ConnectivityGate` UX polish | **Partially covered:** fiscal issuers already gate on `isOnline && isSupabaseOnline`, so an offline checkout already fails. Remaining is UX only (disabled Pay button + banner vs a failed attempt). Needs browser testing. | Gate the Pay button + show an offline banner in `POS.tsx`; verify in-app. |
| **D5** | Post-pair bootstrap (pull roster/catalog after pairing) | Client change; needs browser verification. | After successful pairing, trigger the initial delta sync before first use. |
| **D6** | Authenticated-sync fail-closed graceful handling | Anon table grants are revoked, so anon sync already fails — needs graceful handling, not error-spam. | ✅ DONE (2026-07-06, `12efaba`): `hasAuthSession()` guards in `syncManager.fullSync/bootstrap` + `employeeService.performSync` skip sync until authed. Verified in-browser: no `upsert_employees` 401 spam, no misleading "could not reach server" banner. |
| **D7** | Negative authorization tests (image/purchase/HR) | Need reliable in-app/browser verification (sandbox↔prod REST is flaky here). | Add tests asserting cross-tenant + unauthenticated writes are denied. |
| **D8** | Fiscal number gap-reconciler | Depends on the response contract (B4) + AT confirmation on gap handling (B6). | Job that emits ABORT/void records for `failed` `fiscal_issue_attempts` gaps if AT requires. |
| **D9** | Revoke anon **sequence** grants | `generate_transaction_number` (SECURITY INVOKER) still uses `transaction_number_sequence` until the fiskaly cutover replaces it. | Revoke sequence grants when `pos-checkout` fully replaces the legacy numbering. |
| **D12→D14** | Tenant-scope sync RPCs + REVOKE FROM PUBLIC | Smoke test (2026-07-06) found sync RPCs anon-executable; the PWA design (§4.3) then found the deeper issue — several `SECURITY DEFINER` sync RPCs (incl. the **verified anon/cross-tenant write+delete primitive `upsert_transaction_with_items`**) bypass RLS and **don't self-enforce tenant**. Corrected the D12 wording: `REVOKE … FROM anon` is insufficient (genesis granted anon explicitly + PUBLIC default) — must `REVOKE … FROM PUBLIC, anon`. | ✅ MIGRATION WRITTEN + reviewed (`7a6a0a3`, `20260717000000`): all 9 RPCs tenant-scoped, REVOKE FROM PUBLIC,anon + GRANT authenticated, `upsert_transaction_with_items` device-only. **⛔ NOT deployed** (B2/B3) — file ends with an anon-key + cross-tenant probe checklist to run post-deploy. **Deploy prereq:** callers' JWTs must carry `app_metadata.tenant_id` (paired tills do) or sync fails closed. Belongs on multi-tenant/prod too. |
| **D13** | Connectivity pill accuracy (minor) | On the login screen the status pill briefly showed "Offline" though the in-app `ping` RPC returns `200`. Not a regression from D6 (connectivity is an independent 5s heartbeat). Likely a first-render/subscription-timing display quirk. | Low priority: have the pill subscribe to `connectionStatus` and force an initial `forceCheck()` on mount; re-verify. Part of D4 ConnectivityGate UX. |
| **D15** | Drop bare-global uniques before multi-tenant writes | `products_sku_key`, `transactions_transaction_number_key`, `employees_employee_number_key` (genesis, kept by phase1) are global-unique. With `upsert_products` now on `ON CONFLICT (tenant_id, sku)`, a new `(tenant_id, sku)` whose `sku` exists under a **different** tenant misses the composite arbiter and raises a raw `unique_violation` from the bare key. **Harmless today** (single default tenant), but must drop the bare uniques (keep the composite `(tenant_id, …)` ones) before tenant #2 / PWA writes. | 🧊 tracked — drop bare uniques in the multi-tenant write-path phase (P4/P7). Same class hits `transaction_number` inside `upsert_transaction_with_items` (surfaces as `success=false`). |
| **D16** | Tenant-scope cross-entity FKs (follow-up) | `products.category_id → categories(id)`, `transaction_items.category_id/product_id` validate against the **global** PK, not the caller's tenant — so a caller can reference another tenant's category/product id (no data is read back cross-tenant, but it's a latent integrity hole). | 🧊 follow-up: composite FKs `(tenant_id, category_id)` etc. once the per-tenant composite targets exist. Low severity. |
| **D17** | `pwa-login` brute-force rate-limiting | The `pwa-login` edge fn (deployed) is enumeration-resistant (one generic error) but has **no per-identifier/IP throttling** yet — a password can be brute-forced. | 🧊 follow-up before heavy use: add an attempts table (like the employee lockout) or edge rate-limit. Noted in the fn header. |
| **D18** | `transactions.store_id` / `daily_sales_summary.store_id` pulled forward for store-scope | Store-scope is now a SECURITY requirement (user decision), but sales/reports carry **no** `store_id` today — so store-scoped sales reads are impossible until it's added (+ device→store backfill + RLS `store_id = ANY(app.store_ids())`). | ⏳ P1/P2: add the columns + backfill + RLS store predicates with the read surfaces (where store-scope first bites). Tenant-level catalog stays shared. |
| **D19** | Test fixture: `testowner` human on prod | `provision-human.mjs` created `test-owner@easysoft.local` / username `testowner` (owner, default tenant) on EasySoft to verify auth. Known password. | 🧊 EasySoft is pre-production (C3, wiped at real provisioning); delete this user before production, or keep as a QA fixture. |
| **D20** | Settings/Employees fine-grained owner/admin gating (refactor Step 7) | — | ✅ DONE (`0f56c41` + fix in `3309f6d`): Settings `isSystemAdmin \|\| owner`; Employees keeps `isCurrentSystemAdmin` (ADMIN001 identity, owner-extended) SEPARATE from `canManageAdminEmployees` (admin/owner) — no escalation. A replace_all TDZ crash was found + fixed via browser verify. |
| **D-P2** | PWA read surfaces (reports/data) | — | ✅ DONE (`3309f6d`): host-aware PostgREST read source (`fetchAllPages`, paginated + id-chunked, `.is(deleted_at,null)`, throw-on-error). Verified in-browser: Products/Categories/Employees show real data; Reports queries live (€0.00 = tenant has 0 tx). Writes guarded (PWA view-only v1). **Still open:** the store dimension (D18) + wiring management writes. |
| **D-mobile** | Wide-table mobile reflow | Mobile nav is fixed (`6bbbeb9`: hamburger → drawer, verified 390px). No page overflow anywhere. But the Products (720px) + Customers (1280px) tables scroll horizontally within their cards rather than reflowing to mobile cards. | 🧊 Follow-up polish: per-page mobile-card layout (or hide low-priority columns < md) for those two tables. Functional today, just not elegant. |
| **D-vercel** | Deploy the PWA to HTTPS (Vercel) | PWA infra is built + installable (`e474fcf`: manifest + SW + icons, verified SW-controlling on localhost). It only becomes installable for real users once served over **HTTPS** — the SW/install don't work on plain HTTP. | ⏳ user: deploy the `pwa` branch to Vercel (`vercel.json` present; base is absolute on Vercel). Ties to B10/S13 (Vercel env). Then "Add to Home Screen" works on phones. |
| **D23** | Dexie data-at-rest in the browser | Partially addressed: the startup **seed** is now gated to the till (`e474fcf`) so no demo data is written to a manager's browser. | 🧊 Follow-up: fully disable/evict Dexie on `isPwaHost` (some paths may still open it) per plan §2.5. Low severity (no tenant data synced to browser). |
| **D30** | Delete the legacy fiscal-issuer edge fns (coordinated cutover) | `fiskaly-/vendus-/invoicexpress-fiscal` are hardened (T7) but still exist + use global provider creds. The client's `checkoutOrchestrator` (`src/fiscal/checkoutOrchestrator.ts:32-63`) still dispatches to them by `settings.fiscal.issuer`; deleting them while a till is configured on `fiskaly/vendus/invoicexpress` breaks that till's checkout. | 🧊 sequenced: (1) confirm/force every till onto `local_at`/`pos-checkout` and that none dispatches to the legacy issuers; (2) then delete the 3 functions + remove `FISKALY_/VENDUS_/INVOICEXPRESS_*` provider env vars. Do with the client `pos-checkout` cutover (C4/T6). |
| **D10** | fiskaly provisioning tool | Now unblocked by working creds (B1). Needs the create contracts for taxpayer/location/system (taxpayer `type` discriminator not echoed — get it from fiskaly's OpenAPI/Postman, or reverse-engineer). Must persist the **System id** for A5. | Build a `scripts/provision-fiskaly.mjs`: org(UNIT)→taxpayer→location(BRANCH)→system(FISCAL_DEVICE); write ids into `tenant_fiscal_config`. Then do a TEST issuance to close B4/A2–A5. |
| **D-rule** | Product rule: when a sale escalates FS/FR → FT (INVOICE) | Needed so the till knows when a validated NIF must appear (A7). | Decide: e.g. "NIF requested + amount over threshold, or customer asks for fatura" → INVOICE; else FS/FR with optional `customer.code`. Freeze before Phase 4 LIVE. |
| **D11** | **SIGN ES (Spain) fiscal integration** — future target market | Spain is also a target (user, 2026-07-06). The account **already has a working SIGN ES TEST key** (`azp: sign-es`, org `group1`) — so ES is testable now, but the user chose **"not now."** ⚠️ SIGN ES uses a **different fiscal model** (Veri*factu / TicketBAI-Basque), **not** the PT RECEIPT/INVOICE+ATCUD contract — so `pos-checkout` (PT-specific) does **not** carry over; Spain needs its own issuer path. | user | 🧊 DEFERRED (user — "not now") | When resumed: build a SIGN ES issuer against `developer.fiskaly.com/api/sign-es/v1` (Veri*factu/TicketBAI); the existing TEST key authenticates already. Treat fiscal issuance as per-country pluggable (PT vs ES) behind the `tenant_fiscal_config.issuer` + country. |
