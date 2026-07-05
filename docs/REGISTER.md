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
| **B12** | **fiskaly account is SIGN ES (Spain), not SIGN PT (Portugal)** | The working TEST key is a **Spain** key (`azp: sign-es`; org/subject absent from the PT tree). Portugal fiscalization **cannot** be done with it. This gates all of Phase 4 verification (D10, B4) — you can't provision a PT tree in a Spanish workspace. | user + fiskaly | OPEN | In `dashboard.fiskaly.com` check which product(s)/organizations exist. If SIGN PT isn't there, contact fiskaly to enable **SIGN PT** on the account, then create a TEST API key under the PT organization (Settings → API Keys → Create; **copy the secret immediately — shown once**) and put `key`+`secret` in `.env`. I verify any new key in seconds. |

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
| **C2** | App not re-smoke-tested in-browser after Phase 3 | Low risk (RPC-heavy; RPCs bypass RLS; the 2 direct selects are tenant-scoped and own-tenant reads proven). | OPEN — please confirm catalog/login/checkout on a paired till |
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
| **T7** | Leave legacy `fiskaly-fiscal` function in the tree | Risk someone wires the stale (2026-05-04, wrong) contract. | Avoids churn; documented as retired in PHASE-STATUS + here. Delete once `pos-checkout` is live. |

---

## 5. Deferrals (postponed, with rationale + how to finish)

| ID | Deferred | Rationale | How to finish |
|----|----------|-----------|---------------|
| **D1** | FORCE ROW LEVEL SECURITY | Would subject SECURITY-DEFINER RPCs (owner context) to `TO authenticated` policies → they'd match nothing and break. `service_role` bypasses FORCE anyway; the real threat (hostile authenticated session) is already blocked + proven. | Rewrite policies `TO public USING(tenant_id=app.tenant_id())`, `ALTER TABLE … FORCE RLS`, re-run isolation + RPC-still-works probes on staging first. |
| **D2** | Storage Ring 4 (private images, tenant paths, signed URLs) | Flipping to private breaks every existing image; needs path-prefixing, signed-URL reads, object migration, browser testing. Low-severity leak. | Dual-read window → move objects to `{tenant_id}/…` → rewrite `products.image_url` → private flip → `storage.objects` path-prefix policies → signed-URL reads. |
| **D3** | Vault (pgsodium) encryption of `tenant_fiscal_secrets` (+ `employee_credentials`) | Table is the access-locked structural home; encryption-at-rest is additive. | Move secret columns into Vault; update the definer/service paths to decrypt. plan §4.6. |
| **D4** | `ConnectivityGate` UX polish | **Partially covered:** fiscal issuers already gate on `isOnline && isSupabaseOnline`, so an offline checkout already fails. Remaining is UX only (disabled Pay button + banner vs a failed attempt). Needs browser testing. | Gate the Pay button + show an offline banner in `POS.tsx`; verify in-app. |
| **D5** | Post-pair bootstrap (pull roster/catalog after pairing) | Client change; needs browser verification. | After successful pairing, trigger the initial delta sync before first use. |
| **D6** | Authenticated-sync fail-closed graceful handling | Anon table grants are revoked, so anon sync already fails — needs graceful handling, not error-spam. | Detect the 401/permission path and surface a clean "session required" state. |
| **D7** | Negative authorization tests (image/purchase/HR) | Need reliable in-app/browser verification (sandbox↔prod REST is flaky here). | Add tests asserting cross-tenant + unauthenticated writes are denied. |
| **D8** | Fiscal number gap-reconciler | Depends on the response contract (B4) + AT confirmation on gap handling (B6). | Job that emits ABORT/void records for `failed` `fiscal_issue_attempts` gaps if AT requires. |
| **D9** | Revoke anon **sequence** grants | `generate_transaction_number` (SECURITY INVOKER) still uses `transaction_number_sequence` until the fiskaly cutover replaces it. | Revoke sequence grants when `pos-checkout` fully replaces the legacy numbering. |
| **D10** | fiskaly provisioning tool | Now unblocked by working creds (B1). Needs the create contracts for taxpayer/location/system (taxpayer `type` discriminator not echoed — get it from fiskaly's OpenAPI/Postman, or reverse-engineer). Must persist the **System id** for A5. | Build a `scripts/provision-fiskaly.mjs`: org(UNIT)→taxpayer→location(BRANCH)→system(FISCAL_DEVICE); write ids into `tenant_fiscal_config`. Then do a TEST issuance to close B4/A2–A5. |
| **D-rule** | Product rule: when a sale escalates FS/FR → FT (INVOICE) | Needed so the till knows when a validated NIF must appear (A7). | Decide: e.g. "NIF requested + amount over threshold, or customer asks for fatura" → INVOICE; else FS/FR with optional `customer.code`. Freeze before Phase 4 LIVE. |
