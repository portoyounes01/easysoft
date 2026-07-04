# Multi-Tenant Architecture Plan

**Status:** Final synthesized plan (rev. 2). Basis: the "incremental" candidate design (consensus winner on migration realism and fiskaly-contract fidelity) as the skeleton, with the "canonical" design's isolation/enforcement mechanics grafted in wholesale, the "risk-first" design's enforcement-rings + red-team framing adopted as the acceptance spec, and every fatal flaw flagged by the three judges resolved explicitly (see the Shim Registry in §11 and the banned-shims list in §10). This revision additionally closes the gap review: corrected `supabase/.env` facts (§5.1.6), interim fiscal-function lockdown (§5.6/§10), full training-mode design (§4.6/§7.5), key-rotation vs. installed-fleet sequencing (§9/§11 Phase 0), a deploy-infra/staging workstream (§11 Phase 1∥), public signup disabled (§5.1.7), post-issuance record reconciliation (§5.6/§7.1), buyer-NIF and QES/doc-coverage research gates (§12/§13), pull-sync defect fixes (§7.2), an explicit NC-vs-annulment policy (§7.6), tenant offboarding (§13/Phase 6), and the composite smaller items (§4.1/§5.3/§5.7/§6.5/§10). **Rev. 3 (2026-07-04):** user decision log applied (§1 A3/A5/A8 amended, §13 items 1–6 answered), live-project introspection folded in (§13 #21–23), local-AT key rotation **cancelled** (never used in production — business not AT-certified, hence fiskaly), and the ⚠️ Deferral Register added below.

---

## ⚠️ DEFERRAL REGISTER — everything NOT in v1 (maintained; nothing gets deferred without appearing here)

> **Rule (user-mandated):** no work is silently pushed to "later." Every deferral is listed here with when it lands and the risk of forgetting it. If an item on this list bothers you — say so and it moves into v1.

| # | Deferred item | Why | Lands | Risk if forgotten |
|---|--------------|-----|-------|-------------------|
| D1 | **Offline sales mode** | User decision: v1 online-required | Future major version (seams designed in §7.4) | Tills cannot sell during internet/fiskaly outages; lawful fallback is pre-printed AT documents (manual) |
| D2 | **PWA app itself** | User decision: foundations only in v1 | Post-v1 (zero backend work needed then) | None if §8 foundations ship as specced |
| D3 | **Tenant-admin console** (self-service settings, member management) | v1 is platform-staff-operated | Post-v1 | Ops burden stays on us; scales badly with tenant count |
| D4 | **Multi-tenant human users** (accountant across businesses) | A1: one tenant per user in v1 | Post-v1 via Custom Access Token Hook (§6.5) | Accountants need one account per tenant meanwhile |
| D5 | **Annulment (CANCELLATION) branch enablement** | User decision: NC-only until accountant sign-off | Per-tenant flag, after written sign-off (§7.6, `docs/fiscal-annulment-rules.md`) | Payment-failed orphan docs (§7.1) need manual NC handling meanwhile — reconciler surfaces them |
| D6 | **Tenant offboarding package definition** | User: answer before first departure | Phase 6 runbook (stub exists) | First departing tenant blocked; fiskaly decommission semantics still UNVERIFIED (§13 #19) |
| D7 | **Queue tickets server-side** | Ephemeral UI state, low value | Post-v1, if ever | None identified |
| D8 | **Per-tenant fiskaly cost metering** | A8: costs absorbed in subscription | Phase 6 (as margin monitoring) | Unnoticed margin erosion on document-heavy tenants |
| D9 | **Notification push delivery** | Events table written from day one; delivery needs the PWA | With D2 | None — events accumulate and are queryable |
| D10 | **electron-updater + code signing** | Needs cert purchase decision | Phase 1∥ decision, before fleet grows | Manual till updates; OS security warnings on installers |
| D11 | **vendus/invoicexpress retirement** | Legacy; user: fiskaly mandatory for all new tenants; functions never deployed | Post-v1 decision (delete vs keep dormant) | Dead code carrying old API contracts |
| D12 | **Fiscal proxy edge functions (v1 versions)** | Never deployed; tenant-aware v2 built fresh in Phase 4 | Phase 4 (`pos-checkout` et al.) | None — no production surface exists today; just never deploy the v1 versions |

---

## 1. Goals & assumptions

**Goal.** Convert the single-tenant Electron/React POS (Dexie-first till + one Supabase project + fiskaly SIGN PT) into a multi-tenant SaaS: many independent businesses share one Supabase project and one deployed app with hard data isolation, per-tenant fiscal issuance through fiskaly, and an architecture that a future admin/manager PWA can sit on without new backend work.

**Tenancy model.** `tenant` (business, one legal entity / one NIF) → `store` (physical establishment) → `device` (till). This maps 1:1 onto fiskaly SIGN PT's verified resource hierarchy: tenant → Organization UNIT + Taxpayer, store → Location (BRANCH), device → System (FISCAL_DEVICE).

**Fixed product constraints (from the brief; they override anything conflicting):**

1. **V1 is online-required.** The till must be connected to sell. Fiscal documents are issued through fiskaly (cloud) at checkout time. No offline fiscal hash chain for fiskaly docs, no sync-later of sales, nothing fiscal is ever queued. This matches fiskaly SIGN PT's own constraint: offline replay is explicitly *not supported in Portugal* — the lawful outage fallback is pre-printed documents from AT-authorized printers, recovered later (see §7.4).
2. **fiskaly is the primary issuer.** vendus/invoicexpress remain supported as secondary legacy providers (same tenancy treatment, no new features). The local_at on-device signing path is retired for new sales at cutover (historical local_at documents remain valid and readable forever).
3. **Tenants are admin-provisioned** (no self-service signup in v1 — and public email signup is disabled in Phase 0, §5.1.7).
4. **Future PWA** for admins/managers (reports, transaction detail, push notifications for refunds/NCs, drawer discrepancies, large discounts). Not built in v1, but v1 bakes in: one identity across POS and PWA (Supabase Auth), RLS strong enough for direct browser PostgREST queries, and a `notification_events` table written from day one.
5. **AT posture** still applies: sealed fiscal documents are immutable; reversal only via credit note (NC). Enforcement moves server-side (RLS + triggers that bind even service role + locked RPCs + fiskaly's own immutability). The narrow, back-office-only annulment question (fiskaly CANCELLATION) is reconciled with this posture explicitly in §7.6 — the till itself never gets a void path.

**Assumptions the user should confirm** (each is load-bearing):

- **A1.** One tenant per human user in v1 (a user belongs to exactly one tenant). Multi-tenant users (e.g., an accountant serving several businesses) are a later upgrade via the Custom Access Token Hook (§6.5) — claim names and policies won't change. Note the till itself is single-tenant-at-a-time **by design** (§6.5); the accountant use case is served by the future PWA, not by the till.
- **A2.** The current production install becomes **tenant #1** via backfill; its existing till(s) are force re-paired; tenant #1 switches to fiskaly at cutover and becomes online-required like everyone else. **Clarified 2026-07-04:** the local_at path was **never a production issuer** (business not AT-certified — hence fiskaly), so there is **no live fiscal hash chain to preserve**; §9's "zero fiscal-chain breakage" constraint applies only to keeping historical/test documents readable, and tenant #1's cutover is correspondingly simpler.
- **A3.** ~~Local-only Dexie domains stay device-local in v1~~ **DECIDED 2026-07-04 (changed):** HR attendance/leave, cash-drawer events, purchase receipts, raw materials, and recipes get **server tables with tenant_id-from-birth in v1** — admins/managers/accountants need to see them (aligns with the PWA goal; drawer events also feed `notification_events`). Only **queue tickets** stay device-local (ephemeral UI state). This expands Phase 4/5 scope: each domain needs a table + RLS from the canonical template + a sync/write path following the same rings as everything else.
- **A4.** Product images move to a **private** bucket with tenant-prefixed paths and signed URLs (tenant catalogs stop being publicly enumerable). Confirm no marketing/other dependency on public image URLs.
- **A5.** ~~Browser (non-Electron) tills are in scope~~ **DECIDED 2026-07-04 (changed): Electron-only tills** — browser tills are out of scope because hardware (printer/drawer) requires Electron. Device enrollment stores the session via Electron safeStorage only; no localStorage-session till path is built. (The future PWA is browser-based but is *not a till* — it never enrolls as a device.)
- **A6.** Training mode survives as a per-device state that is **server-visible and admin-controlled** (a till can no longer flip itself to test/training). It is now fully designed (§7.5): training tills issue real fiskaly **TEST** documents against the tenant's TEST resource tree (which the per-environment config in §4.6 makes structurally representable), training rows are server-stamped and structurally excluded from production reports/SAF-T, and the local Dexie `::training` slot is derived from the server flag (single writer — no divergence).
- **A7.** Employee PINs move to **server-side verification** (bcrypt + lockout) — possible precisely because v1 is online-required. Credential hashes stop being replicated to devices entirely.
- **A8.** ~~Per-tenant fiskaly billing is passed through to tenants~~ **DECIDED 2026-07-04 (changed):** fiskaly costs are **included in the subscription price** (no passthrough). Per-tenant fiskaly metering (Phase 6) becomes margin/COGS monitoring rather than billing; the fiskaly pricing question (§13 #15) still matters for unit economics and subscription pricing.

---

## 2. Architecture decision

**One shared Supabase project; column-per-row `tenant_id` on every business table; Postgres RLS keyed on Supabase Auth JWT claims as the primary isolation boundary; every RLS-bypassing path (SECURITY DEFINER RPCs, service-role edge functions) re-derives tenant from the JWT and filters/stamps explicitly.** Not schema-per-tenant (breaks PostgREST/RPC surface, larger migration), not project-per-tenant (kills shared deployment and the PWA story).

The enforcement model is organized as **four rings** — every data access path must belong to exactly one, and each ring carries its own tenant obligation (this framing is the acceptance spec for the isolation test suite, §12):

- **Ring 1 — direct PostgREST** (till reads, all future PWA access): guarded purely by RLS.
- **Ring 2 — SECURITY DEFINER RPCs**: RLS is bypassed; the function body derives `tenant_id` from `auth.jwt()` and filters/stamps. Read paths convert to SECURITY INVOKER where possible so Ring 1 also applies.
- **Ring 3 — service-role edge functions**: RLS and gateway JWT-verify are both insufficient; the function verifies the caller JWT in code, resolves tenant/device from server tables, and puts an explicit `.eq('tenant_id', …)` on every query. `verify_jwt=true` alone is *not* auth (the shipped anon key satisfies it).
- **Ring 4 — Storage**: tenant-prefixed object paths + `storage.objects` policies on the path prefix; private bucket + signed URLs.

The **device** (till) is the Supabase Auth principal and RLS subject, minted at admin-supervised pairing; the employee PIN is an attribution layer under the device session, verified **server-side**. Human users (tenant admins now, PWA managers later) are ordinary Supabase Auth users with the same claim shape — which is why the PWA needs zero new backend.

Checkout is **server-side**: one `pos-checkout` edge function issues via fiskaly and persists atomically, with an idempotency ledger so fiskaly and Postgres can never silently diverge. This retires the entire client fiscal write path (including the sealed-document rewrite hole in `upsert_transaction_with_items`) **and the legacy non-fiscal checkout path** (§7.5) instead of tenant-retrofitting them. Dexie is demoted to a tenant-scoped read cache + receipt mirror behind the existing service interfaces — minimal churn across the 29 pages, server is the source of truth, offline seams preserved without building offline machinery.

```
┌──────────────────────────────┐
│ Electron/web till            │   employee PIN = attribution only,
│  device JWT {tenant, store,  │   verified server-side (employee_pin_login)
│              device, role}   │
└──────┬───────────────────────┘
       │ pos-checkout (HTTPS, idempotent checkout_id)
       ▼
┌──────────────────────────────┐    tenant_fiscal_secrets (Vault, zero-grant)
│ Supabase Edge: pos-checkout  │◄── per-tenant UNIT key/secret, AT subuser pwd
│ 1 verify claims → t/s/d      │
│ 2 fiscal_issue_attempts row  │        ┌────────────────────────────┐
│ 3 recompute totals, validate │───────►│ fiskaly SIGN PT (UNIT tok) │
│ 4 INTENTION → TRANSACTION    │        │ signs, chains, ATCUD, QR   │
│ 5 atomic persist (svc role)  │        └──────────┬─────────────────┘
└──────┬───────────────────────┘                   │ series/ATCUD via WSE
       ▼                                           ▼
┌──────────────────────────────┐            AT (Autoridade Tributária)
│ Postgres: RLS on tenant_id   │
│ transactions / items /       │
│ fiscal_documents (append-    │
│ only, 10-yr archive) /       │
│ notification_events          │
└──────▲───────────────────────┘
       │ direct PostgREST reads under RLS (Ring 1)
┌──────┴───────────────────────┐
│ FUTURE PWA (manager JWT:     │  reports, transaction detail,
│  {tenant_id, app_role})      │  notification feed — no new backend
└──────────────────────────────┘
```

---

## 3. Fiskaly account & key topology

Grounded in the SIGN PT research (workspace.fiskaly.com, API 2026-06-01). SIGN PT runs on fiskaly's **workspace/HUB platform**, *not* the SIGN DE/ES "managed organization" + Management API v0 model — do not design from DE/ES docs.

**Topology (verified):**

```
ACCOUNT  = us, the SaaS operator            — created manually on hub.fiskaly.com
  GROUP  = "Portugal" (clustering layer)     — created manually in the HUB; its API key
  │                                            is the CONTROL-PLANE credential (provisioning only)
  └─ UNIT = one per tenant (one legal entity/NIF)     — POST /organizations   (programmatic)
       ├─ Subject API_KEY, scoped to the UNIT          — POST /subjects + X-Scope-Identifier
       │    (secret shown EXACTLY ONCE → straight into Vault)
       ├─ Taxpayer (NIF + AT subuser creds '<NIF>/<n>', WSE perm) — POST /taxpayers → COMMISSIONED
       │    └─ Location BRANCH, one per store           — POST /locations → COMMISSIONED
       │         └─ System FISCAL_DEVICE, one per till   — POST /systems  → COMMISSIONED
       │              └─ Records (INTENTION → TRANSACTION)
```

- **Key count:** N tenants = **N+1 key pairs per environment** (1 GROUP + 1 Subject per UNIT). TEST (`test.api.fiskaly.com`) and LIVE (`live.api.fiskaly.com`) are fully disjoint hosts/HUBs/keys/resources — environment is a first-class column, server-side, never client-flippable. **Because the environments are disjoint, every tenant gets a full TEST resource tree (UNIT/Subject/Taxpayer/Location/System) alongside its LIVE tree** — the same provisioning pipeline builds both; the TEST tree serves both the pre-LIVE cutover rehearsal (§9.8) and training mode (§7.5). The per-environment config rows in §4.6 make holding both trees concurrently structural, not accidental.
- **Programmatic provisioning: yes**, for everything below GROUP: UNITs, Subjects, Taxpayers, Locations, Systems are all API-creatable, so tenant onboarding is a fully automated, resumable, idempotent pipeline (`admin-provision-tenant`, §11 Phase 4). ACCOUNT and GROUP (and the first GROUP key) are HUB-manual, once.
- **Auth:** `POST /tokens` exchanges key+secret for a reusable JWT; cache per (tenant, environment) keyed on the returned `expires_at` (lifetime is UNVERIFIED — never hardcode). No refresh tokens; re-POST on expiry.
- **Series/ATCUD registration flow:** we choose series names (pattern `^[0-9A-Z_/\-\.]{1,20}$`, e.g. `FS-T01-2026`) and pass `document.series` per record; **fiskaly registers the series with AT via the tenant's WSE subuser and returns the ATCUD validation code**. No manual Portal das Finanças series work. NC/ND use their own series; RG/RC separate from invoices. Default policy: **one series per (System/till, doc type, year, environment)** — safest against duplicate numbering while series-across-systems scoping is UNVERIFIED.
- **The one non-automatable onboarding step:** each tenant must create an **AT subuser** (utilizador autorizado) on Portal das Finanças with WSE (always) and WFA/WDT (if real-time reporting) permissions, and hand us the credentials. Build a guided UX for this + **per-tenant credential health monitoring** — an expired/locked subuser silently breaks series registration and AT transmission for that tenant only.
- **Certification:** fiskaly states integrators do **not** need their own AT certification; the API returns `compliance.software_certificate` per document, printed verbatim as "Processado por programa certificado n.º <NNNN>/AT". **UNVERIFIED and a contracting gate:** "fiskaly" does not appear on AT's public certified-programs list as of 2026-07-04, and the certificate number is not published — obtain written confirmation of the certificate number and certified entity before signing / before any LIVE tenant.
- **Layout approval is a hard go-live gate:** fiskaly must approve each document-type layout in writing (PDF to the account manager) before production; the service description carries an indemnity making *us* liable for tenant-modified layouts → receipt templates are centrally locked.
- **Retention:** fiskaly stores ~3 months unless SAFE is contracted; the taxpayer obligation is 10 years → **our `fiscal_documents` table archives the full signed record payload per document** and is the 10-year evidence store.
- **SAF-T:** `POST /files` type AUDIT generates the monthly SAF-T (PT); per fiskaly's own support KB, **upload to Portal das Finanças is the taxpayer/accountant's responsibility** — the marketing claim of auto-submission is contradicted by the docs and treated as unavailable.

**Explicitly UNVERIFIED (flagged as risks, never built upon; each has a probe or a written-confirmation gate — see §13):** document-number allocation authority (spec: client-generated & REQUIRED; guide: fiskaly-assigned); series scoping across Systems; JWT token lifetime; whether the GROUP token could serve UNIT-scoped ops via `X-Scope-Identifier` (we use per-UNIT keys regardless — blast-radius isolation); Subject rotation/disable state enum; rate limits; pricing (including whether TEST-environment UNITs/Systems incur charges — matters for training mode, §7.5); SLA; the AT certificate number; the pre-printed-document recovery API mechanism; the `compliance.data/signature_hash` vs `atcud/hash` field-name discrepancy; SAF-T auto-submission; **how the buyer's NIF is supplied on RECEIPT (FS/FR) operations** (the spec documents `ReceiptTransaction.customer.code` only as the Italian lottery code; only INVOICE has `recipients[]` — yet "fatura com contribuinte" is an everyday flow and NIF is mandatory on FR); **QES support for PDF invoices** (legally required from 2027-01-01 — ~6 months out — and only "being built" per the research); **LIVE document-type coverage** (FT support "appears very recent"; RG/RC — which the current app issues as Recibos — and GT/GR timelines unknown).

**API-contract drift warning (named go-live blocker):** the deployed `supabase/functions/fiskaly-fiscal/index.ts` pins `X-Api-Version: 2026-05-04` and does a single `PUT /systems/{id}/records/{recordId}`; the researched productive contract (2026-06-01) is the **two-call `POST /records` INTENTION → TRANSACTION** pattern. The v2 function is built from the 2026-06-01 spec, not from the existing code, and revalidated in TEST before any tenant.

---

## 4. Data model changes

### 4.1 New control-plane tables

```sql
create table public.tenants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  legal_name    text not null,
  nif           text not null check (nif ~ '^[0-9]{9}$'),
  country       text not null default 'PT',
  status        text not null default 'provisioning'
                check (status in ('provisioning','active','suspended','offboarding')),
  -- NOTE: no fiscal_issuer column here. The tenant's issuer is stored in EXACTLY ONE
  -- place: tenant_fiscal_config.provider (§4.6). Earlier drafts stored the same fact in
  -- tenants.fiscal_issuer, tenant_settings, and tenant_fiscal_config — one authoritative
  -- column, the config row, wins; tenant_settings.data MUST NOT carry an issuer key.
  -- 'offboarding' status: see the runbook stub in §11 Phase 6 and the fiskaly
  -- decommission question in §13.
  registry_number text,                  -- commercial registry (printed masthead)
  share_capital numeric(14,2),
  created_at    timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  name text not null,
  address text, postal_code text, city text, phone text, email text,
  fiskaly_location_id_test text,        -- BRANCH id in the TEST tree (training/cutover)
  fiskaly_location_id_live text,        -- BRANCH id in the LIVE tree
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now(),
  unique (tenant_id, id)                -- composite-FK target
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  store_id uuid not null,
  label text not null,                  -- "BALCÃO 1"; replaces localStorage pos_terminal_id
  status text not null default 'provisioned'
         check (status in ('provisioned','enrolled','revoked')),
  auth_user_id uuid references auth.users(id),
  fiskaly_system_id_test text,          -- FISCAL_DEVICE id in the TEST tree
  fiskaly_system_id_live text,          -- FISCAL_DEVICE id in the LIVE tree
  training_mode boolean not null default false,   -- server-authoritative, admin-set (§7.5)
  enrolled_at timestamptz, last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, store_id) references public.stores (tenant_id, id)
);

create table public.tenant_members (    -- humans: till admins now, PWA managers later
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id),
  role text not null check (role in ('owner','admin','manager')),
  store_ids uuid[],                     -- null = all stores; else store-scoped manager
  employee_id uuid,                     -- optional link to the employees row
  created_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);

create table public.device_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  device_id uuid not null references public.devices(id),
  code_hash text not null,              -- sha256 of a HIGH-ENTROPY code (>=128 bits, e.g. 26-char base32);
                                        -- raw code never stored, shown once as QR/text
  expires_at timestamptz not null,      -- <=15 min TTL, single use
  used_at timestamptz,
  attempt_count int not null default 0, -- per-code attempt cap enforced by pair-device fn
  created_by uuid references auth.users(id)
);

create table public.tenant_settings (   -- 1 row/tenant: currency, tax defaults, loyalty, HR policy,
  tenant_id uuid primary key references public.tenants(id),  -- accounting contact (NOT the issuer — §4.6)
  data jsonb not null default '{}', updated_at timestamptz not null default now()
);
create table public.store_settings (    -- 1 row/store: printed address block, order-queue cfg, receipt language
  store_id uuid primary key references public.stores(id),
  tenant_id uuid not null references public.tenants(id),
  data jsonb not null default '{}', updated_at timestamptz not null default now()
);
```

Device-local prefs (autoLogout, display density, printer stations, appearance, sidebar, language) **stay on-device** — no tenancy work beyond being wiped/namespaced on re-pairing.

### 4.2 tenant_id strategy on existing tables

Add `tenant_id uuid NOT NULL REFERENCES tenants(id)` to: **employees, categories, products, customers, transactions, transaction_items, daily_sales_summary, cash_drawer_logs, print_logs, cashier_tests**. Add `store_id`/`device_id` to `transactions` and the three log tables. `transaction_items` carries a denormalized `tenant_id` so RLS never joins. `transactions` additionally gains **`is_training boolean not null default false`** — stamped server-side by `pos-checkout` from `devices.training_mode`, never client-supplied (§7.5); report views, the daily-summary trigger, and SAF-T all exclude training rows structurally. Every synced table gets `create index on <t> (tenant_id, updated_at)` (all delta RPCs filter by `updated_at`), plus `unique (tenant_id, id)` where it is a composite-FK target.

### 4.3 Unique-constraint rescoping (explicit; dual-unique transition per §9)

| Table | Drop (global) | Add (tenant-scoped) |
|---|---|---|
| employees | `UNIQUE(employee_number)` | `UNIQUE(tenant_id, employee_number)` |
| products | `UNIQUE(sku)` | `UNIQUE(tenant_id, sku)`; optional partial `UNIQUE(tenant_id, barcode) WHERE barcode IS NOT NULL` |
| transactions | `UNIQUE(transaction_number)` | `UNIQUE(tenant_id, transaction_number)` |
| daily_sales_summary | PK `(summary_date, employee_id)` | PK `(tenant_id, summary_date, employee_id)` — **updated in lockstep with** `update_daily_sales_summary()` trigger fn (which also gains the `is_training` exclusion), `update_daily_summary_on_transaction_change` trigger, and `merge_employee_records` |
| customers | — | optional partial `UNIQUE(tenant_id, tax_number) WHERE tax_number IS NOT NULL` (same NIF legitimately exists under many tenants — never global) |
| fiscal_documents (new) | — | `UNIQUE(tenant_id, chain_scope, sequential_number)` (chain_scope alone collides across tenants: default `AT0000001::FAT2026-2026` is identical for every legacy install) |

Drop the global `public.transaction_number_sequence` and MAX-scan `generate_transaction_number()` at cutover: for fiskaly tenants the fiscal document number **is** `transaction_number` (returned by fiskaly). Non-fiscal internal numbering (queue tickets) uses per-tenant counters if/when those domains go server-side.

### 4.4 Cross-tenant FK prevention (composite FKs)

```sql
alter table public.transactions add unique (tenant_id, id);
alter table public.products     add unique (tenant_id, id);
alter table public.employees    add unique (tenant_id, id);
alter table public.customers    add unique (tenant_id, id);

alter table public.transaction_items
  add foreign key (tenant_id, transaction_id) references public.transactions (tenant_id, id),
  add foreign key (tenant_id, product_id)     references public.products     (tenant_id, id);
alter table public.transactions
  add foreign key (tenant_id, employee_id) references public.employees (tenant_id, id),
  add foreign key (tenant_id, customer_id) references public.customers (tenant_id, id),
  add foreign key (tenant_id, store_id)    references public.stores    (tenant_id, id);
```

A compromised client cannot stitch another tenant's `product_id`/`employee_id`/`customer_id` onto its rows even if it knows the UUIDs.

### 4.5 New fiscal tables (server becomes the 10-year archive)

```sql
create table public.fiscal_documents (        -- append-only evidence of record
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id),
  store_id uuid, device_id uuid, transaction_id uuid,
  chain_scope text not null, series_key text, sequential_number bigint not null,
  invoice_no text not null, invoice_type text not null,       -- FS/FT/FR/NC/ND/RG…
  atcud text, hash_four_chars text, qr_payload text, software_certificate text,
  gross_total numeric(12,2), net_total numeric(12,2), tax_total numeric(12,2),
  invoice_date date, system_entry_date timestamptz,
  hash_base64 text, previous_hash_base64 text, hash_control text, hash_plaintext text,
  settled_invoice_no text, settled_invoice_date date,
  cancelled_at timestamptz, cancelled_reason text, cancelled_by_employee_id uuid,
  saft_exported_at timestamptz, saft_export_batch_id text,
  fiscal_provider text not null,              -- 'fiskaly'|'local_at'|'vendus'|'invoicexpress'
  external_document_id text,
  fiskaly_record_id text,                     -- fiskaly record UUID: CORRECTION/CANCELLATION refs
                                              -- + the reconciliation job's poll key (§5.6/§7.1)
  record_state text,                          -- last observed fiskaly record state
                                              -- (ACCEPTED/COMPLETED/FAILED…)
  last_reconciled_at timestamptz,
  external_payload_json jsonb,                -- fiskaly's FULL signed record = long-term evidence
  certification_mode text not null default 'production',   -- 'production'|'training' (§7.5)
  created_at timestamptz not null default now(),
  unique (tenant_id, chain_scope, sequential_number),
  foreign key (tenant_id, transaction_id) references public.transactions (tenant_id, id)
);

create table public.fiscal_series (           -- first-class series registry + number allocator
  tenant_id uuid not null references public.tenants(id),
  environment text not null check (environment in ('test','live')),  -- TEST & LIVE series coexist
  device_id uuid not null,                    -- series-per-till default (see §3)
  doc_type text not null,                     -- 'FS','FT','FR','NC','ND','RG'
  year int not null,
  series_name text not null,                  -- e.g. 'FS-T01-2026' (sent as document.series)
  fiskaly_series_registered boolean not null default false,
  atcud_validation_code text,                 -- returned by fiskaly after AT registration
  last_number bigint not null default 0,      -- our document.number allocator (see §7.1 step 5)
  primary key (tenant_id, environment, device_id, doc_type, year),
  unique (tenant_id, environment, series_name)
);

create table public.fiscal_issue_attempts (   -- idempotency ledger: fiskaly & Postgres can never diverge
  tenant_id uuid not null references public.tenants(id),
  checkout_id uuid not null,                  -- client-generated (crypto-strength REQUIRED — §7.2),
                                              -- one per checkout
  status text not null check (status in ('pending','failed','issued_unpersisted','completed')),
  device_id uuid, request_json jsonb, response_json jsonb, error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, checkout_id)        -- idempotency key UNIQUE per tenant
);

create table public.fiscal_audit_events (     -- server mirror of Dexie fiscalAuditEvents, append-only
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  store_id uuid, device_id uuid, actor_employee_id uuid,
  event_type text not null, payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
```

### 4.6 Per-tenant fiscal credentials (config/secret split; per-environment rows)

**One row per (tenant, environment)** — not one row per tenant. This is a structural requirement, not a nicety: fiskaly TEST is a fully disjoint environment with its own UNIT/Taxpayer/Subject/Location/System per tenant, so a single-environment row cannot hold TEST and LIVE resource IDs simultaneously — which both **training mode** (§7.5, a training till issues against the TEST tree while production tills issue LIVE) and the **§9.8 TEST-then-LIVE cutover** (both trees must exist concurrently during rehearsal) require.

```sql
create table public.tenant_fiscal_config (    -- NON-secret routing/state; tenant-admin readable under RLS
  tenant_id uuid not null references public.tenants(id),
  environment text not null check (environment in ('test','live')),
  provider text not null default 'fiskaly'
           check (provider in ('fiskaly','vendus','invoicexpress','local_at_legacy')),
  -- ^ THE single authoritative issuer record for the tenant (the 'live' row governs
  --   production; the 'test' row exists for training + cutover). tenants.fiscal_issuer
  --   and any issuer key in tenant_settings are REMOVED — this column is the only one.
  fiskaly_unit_org_id text, fiskaly_taxpayer_id text, taxpayer_state text,
  reporting_mode text,                        -- real-time WFA vs monthly SAF-T (open question)
  live_enabled boolean not null default false,  -- flipped when the LIVE tree is commissioned (§9.8)
  onboarding_state jsonb not null default '{}',   -- resumable provisioning state machine
  -- legacy providers:
  vendus_register_map jsonb, invoicexpress_account_name text,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, environment)
);

create table public.tenant_fiscal_secrets (   -- ZERO client access: RLS enabled, NO policies, NO grants
  tenant_id uuid not null references public.tenants(id),
  provider text not null, environment text not null,
  fiskaly_subject_id text,
  api_key text not null,
  api_secret_encrypted bytea not null,        -- Supabase Vault / pgsodium
  at_subuser_username text,                   -- '<NIF>/<n>'
  at_subuser_password_encrypted bytea,
  rotated_at timestamptz, created_at timestamptz not null default now(),
  primary key (tenant_id, provider, environment)   -- already per-environment: TEST + LIVE keys coexist
);
-- The GROUP key is NOT in any table: it lives only as an edge-function secret
-- (FISKALY_GROUP_KEY/SECRET) used by admin-provision-tenant. It can create tenants,
-- so it never enters the checkout request path.
```

### 4.7 Employee credentials out of the synced row

```sql
create table public.employee_credentials (    -- ZERO client access (same posture as secrets)
  employee_id uuid primary key references public.employees(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id),
  pin_hash text,                              -- crypt(pin, gen_salt('bf'))
  password_hash text,                         -- crypt(password, gen_salt('bf'))
  legacy_sha256_pin text, legacy_sha256_password text,  -- migration-only; cleared on first re-hash
  failed_attempts int not null default 0, locked_until timestamptz,
  updated_at timestamptz not null default now()
);
```

`employees.pin` / `employees.password_hash` columns are dropped after migration. `get_employees_delta` returns the roster with **no credential columns**. The `proof_hash` pass-the-hash scheme (upload-image, extract-purchase-document) is deleted.

### 4.8 Notification/audit events (PWA groundwork; delivery deferred)

```sql
create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  store_id uuid, device_id uuid,
  event_type text not null check (event_type in (
    'CREDIT_NOTE_ISSUED','REFUND_ISSUED','FISCAL_CANCELLATION','LARGE_DISCOUNT',
    'DRAWER_DISCREPANCY','DRAWER_OPEN_NO_SALE','PRICE_OVERRIDE','DEVICE_ENROLLED',
    'DEVICE_REVOKED','PAIRING_FAILED','SAFT_GENERATED','FISCAL_ISSUE_FAILED',
    'TRAINING_MODE_CHANGED')),
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  actor_employee_id uuid, entity_table text, entity_id uuid,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.notification_events (tenant_id, created_at desc);
create index on public.notification_events (tenant_id, event_type, created_at desc);
-- Append-only: trigger blocks UPDATE/DELETE for every role incl. service role.
-- Written ONLY by server paths (pos-checkout, fiscal-credit-note, pair-device,
-- the record reconciler, drawer RPC).
```

---

## 5. Isolation enforcement

### 5.1 Hygiene preconditions (Phase 0/3 work; see roadmap)

1. **Introspect the live DB first** (`supabase db dump`): three contradictory policy generations (permissive anon, `USING(true)` from `comprehensive_rls_fix.sql`, broken uuid=text from `secure_rls_policies.sql`) plus `temp_disable_rls.sql` may be applied, and `employees.auth_id` exists only in TS types. The baseline migration is generated from reality; root-level SQL scripts retire into `supabase/migrations/`.
2. `DROP FUNCTION public.clear_all_transaction_data();` (currently EXECUTE-granted to **anon** at `clear_transaction_data_function.sql:43-44`).
3. At the isolation cutover: `REVOKE ALL ON ALL TABLES/SEQUENCES/FUNCTIONS IN SCHEMA public FROM anon;` (undoing `supabase_transactions_tables.sql:626-628`); `authenticated` keeps only policy-mediated access. Only `ping()` stays anon-callable. (The interim window is governed by the anon-allowance registry, §10.)
4. Drop all legacy policies; `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` on every table.
5. Recreate `transaction_details`, `active_products_with_categories`, `low_stock_products` `WITH (security_invoker = true)` (owner views bypass RLS).
6. **Rotate the service-role key and the anon key — and correct the record on `supabase/.env`.** Verified in this repo: `git ls-files supabase/.env` returns nothing and `git log --all -- supabase/.env` shows zero commits; the file exists on disk but **was never tracked in git** (`.gitignore:25` covers it, confirmed via `git check-ignore`). The subsystem map contradicts itself here — the auth-identity analysis asserts "tracked in git — verified" while the edge-functions analysis says "git-ignored, verified via git check-ignore"; the latter is correct. Consequences: (a) **rotate both keys anyway** — the service-role key has sat in plaintext on developer machines/build hosts and its blast radius is total, and the anon key is inlined in every shipped bundle; (b) **no git-history purge of this clone is needed or scheduled** — instead, a bounded audit task: run `git log --all -- supabase/.env` against the canonical remote and any known clones/forks, and audit Vercel/CI secret stores for stray copies, before closing the item; only if a remote/clone shows a tracked copy does a history purge enter scope. Rotation **sequencing** matters because the anon key is Vite-inlined into deployed Electron installers with no update channel — see §9.2 and the Phase 0 runtime-config work (§11).
7. **Disable public email signup in Phase 0** (verified: `supabase/config.toml:133` has `enable_signup = true` today). Set `enable_signup=false` on the hosted project (dashboard + config.toml for parity); all users are created exclusively via `auth.admin` (tenant provisioning, member invites, `pair-device`). Rationale: post-P3 a claimless self-signed-up JWT fails closed under `app.tenant_id() = NULL`, but **during the P0→P3 interim `authenticated` retains broad grants**, and the anon-allowance registry's compensating controls assume only tenant #1's clients — an arbitrary self-provisioned hostile `authenticated` user would sit outside that assumption. Closing signup on day one restores it.

### 5.2 Claim helpers and the canonical policy template

```sql
create schema if not exists app;   -- NOT exposed via PostgREST

create function app.jwt_meta() returns jsonb language sql stable
as $$ select coalesce(auth.jwt() -> 'app_metadata', '{}'::jsonb) $$;

create function app.tenant_id() returns uuid language sql stable
as $$ select nullif(app.jwt_meta() ->> 'tenant_id','')::uuid $$;
create function app.store_id()  returns uuid language sql stable
as $$ select nullif(app.jwt_meta() ->> 'store_id','')::uuid $$;
create function app.device_id() returns uuid language sql stable
as $$ select nullif(app.jwt_meta() ->> 'device_id','')::uuid $$;
create function app.role() returns text language sql stable
as $$ select app.jwt_meta() ->> 'app_role' $$;                -- 'device'|'owner'|'admin'|'manager'
create function app.store_ids() returns uuid[] language sql stable
as $$ select case when app.jwt_meta() ? 'store_ids'
         then array(select jsonb_array_elements_text(app.jwt_meta()->'store_ids'))::uuid[]
         else null end $$;

revoke all on all functions in schema app from public, anon;
grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;
```

Every table gets the same named policies, varying only the role predicate. Shape rules: `to authenticated` (never `public`); tenant equality in **both** `USING` and `WITH CHECK` (an UPDATE must not be able to move a row across tenants); helpers wrapped in `(select …)` for init-plan caching; `anon` has zero grants so no anon policy can exist.

```sql
-- example: products (class A)
create policy tenant_select on public.products for select to authenticated
  using (tenant_id = (select app.tenant_id()));

create policy tenant_insert on public.products for insert to authenticated
  with check (tenant_id = (select app.tenant_id())
              and (select app.role()) in ('device','manager','admin','owner'));

create policy tenant_update on public.products for update to authenticated
  using  (tenant_id = (select app.tenant_id())
          and (select app.role()) in ('device','manager','admin','owner'))
  with check (tenant_id = (select app.tenant_id()));
-- NO delete policy: hard DELETE impossible for clients; deletion = soft-delete via UPDATE.
```

Store-scoped human users get an additional predicate where relevant (e.g. transactions):
`and ((select app.store_ids()) is null or store_id = any (select app.store_ids()))`.

### 5.3 Table classes (policy matrix)

| Class | Tables | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|
| **A. Catalog/master** | products, categories, customers, employees, stores (read), tenant_settings, store_settings | any tenant principal | device / manager+ | device / manager+ (employees: admin+ only; `tenant_id` & `employee_number` immutable via trigger) | none (soft delete) |
| **B. Sealed fiscal** | transactions, transaction_items, fiscal_documents | any tenant principal (store-scoped for store-limited managers) | **no client policy** — written only by the pos-checkout / fiscal-credit-note server path | **no client policy** | none |
| **C. Logs/audit** | cash_drawer_logs, **print_logs**, cashier_tests, fiscal_audit_events, notification_events | notification_events + fiscal_audit_events: manager+; drawer logs + print_logs: device + manager+ | device (`with check device_id = (select app.device_id())` + tenant match) or definer RPC | none | none |
| **D. Control plane** | tenants (own row: `id = (select app.tenant_id())`), devices, tenant_members, device_pairing_codes, tenant_fiscal_config (admin+ read) | tenant-scoped as noted | service role only | service role only | service role only |
| **E. Secrets** | employee_credentials, tenant_fiscal_secrets, fiscal_issue_attempts, fiscal_series | **RLS enabled, zero policies, zero grants** → invisible to every client; touched only by service role and named SECURITY DEFINER RPCs | — | — | — |

(`print_logs` was previously missing from this matrix despite gaining `tenant_id` in §4.2 — it is Class C, same posture as `cash_drawer_logs`.)

### 5.4 Fiscal immutability triggers (bind even service role)

RLS does not constrain the service role, and the checkout function writes with service role — so AT-posture immutability is enforced by triggers, which fire for every role:

```sql
create function app.protect_sealed_transaction() returns trigger
language plpgsql as $$
begin
  if old.fiscal_document_id is not null then
    if tg_op = 'DELETE' then
      raise exception 'FISCAL_IMMUTABLE: sealed documents cannot be deleted';
    end if;
    if (to_jsonb(new) - 'fiscal_cancelled_at' - 'fiscal_cancelled_reason'
                      - 'fiscal_cancelled_by_employee_id' - 'updated_at')
       is distinct from
       (to_jsonb(old) - 'fiscal_cancelled_at' - 'fiscal_cancelled_reason'
                      - 'fiscal_cancelled_by_employee_id' - 'updated_at') then
      raise exception 'FISCAL_IMMUTABLE: only cancellation mirror fields may change';
    end if;
  end if;
  return new;
end $$;
create trigger protect_sealed before update or delete on public.transactions
  for each row execute function app.protect_sealed_transaction();

-- transaction_items: BEFORE UPDATE OR DELETE trigger rejecting any change when the parent
-- transaction has fiscal_document_id set (no carve-outs — sealed lines are immutable).
-- fiscal_documents: BEFORE UPDATE trigger allowing ONLY cancelled_at/cancelled_reason/
-- cancelled_by_employee_id/saft_exported_at/saft_export_batch_id/record_state/
-- last_reconciled_at; BEFORE DELETE always rejects. (record_state/last_reconciled_at are
-- reconciliation bookkeeping, not fiscal content — the signed payload stays untouchable.)
-- notification_events / fiscal_audit_events: BEFORE UPDATE OR DELETE always rejects.
```

The **jsonb column-diff carve-out matters**: the existing fiscal-cancellation flow legitimately mirrors `fiscal_cancelled_*` onto sealed rows; a blunt "reject all updates on sealed rows" would break it.

### 5.5 RPC hardening (Ring 2) — per function

| RPC | Treatment |
|---|---|
| `get_employees_delta` | SECURITY INVOKER + RLS; **no credential columns** (after `employee_pin_login` ships — Shim R2); keyset pagination `(updated_at, id)` |
| `get_categories_delta`, `get_products_delta`, `get_customers_delta`, `get_transactions_delta`, `get_transaction_items_delta` | SECURITY INVOKER + RLS; explicit `where tenant_id = (select app.tenant_id())` belt-and-braces; keyset pagination (fixes `get_customers_delta` silent LIMIT 1000 truncation). `get_transactions_delta` additionally filters by training mode: sessions of non-training devices receive only `is_training = false` rows, training devices only their training rows (§7.5) — training documents never enter a production till's cache/reports. Delta responses include the **max server `updated_at`** of the batch as the client's next watermark (§7.2) |
| `upsert_employees`, `upsert_categories`, `upsert_products`, `upsert_customers` | Force `tenant_id := app.tenant_id()` on every row **ignoring any payload value**; `ON CONFLICT` retargeted to `(tenant_id, employee_number)` / `(id)` / `(tenant_id, sku)` / `(id)` with same-tenant guard — closes the EMP001/COF001 cross-tenant hijack |
| `upsert_transaction_with_items` | Phase 0: hardened backward-compatibly (insert-once for sealed rows; **stop DELETE+reinsert of items** for sealed transactions; header updates on sealed rows limited to the cancellation-mirror columns). Stays alive tenant-scoped as the sales write path until `pos-checkout` ships (Shim R5), then **deleted** |
| `upsert_employees_with_mapping`, `merge_employee_records` | **EXECUTE revoked from anon+authenticated in Phase 0** (not in the documented sync call chain — precondition: verify call sites); deleted at cutover |
| `employee_pin_login` (new) | SECURITY DEFINER; derives tenant from claims; bcrypt via `crypt()`; lockout (`failed_attempts`/`locked_until`); accepts legacy SHA-256 once then re-hashes; never returns credential columns; `REVOKE FROM public, anon` |
| `issue_credit_note` path, `mirror_fiscal_cancellation`, `emit_notification_event` | SECURITY DEFINER, claims-derived tenant, `REVOKE FROM public, anon` |
| `generate_transaction_number`, `transaction_number_sequence` | Dropped at fiskaly cutover |
| `clear_all_transaction_data` | **Dropped in Phase 0.** Dev-only replacement `dev_reset_tenant(uuid)` exists only in local migrations and is **structurally incapable of touching `fiscal_documents`** (no DELETE grant/statement on that table) |
| `calculate_transaction_totals`, `update_daily_sales_summary` | Tenant-aware rewrite in lockstep with the daily_sales_summary PK change; the summary trigger skips `is_training` rows |
| `ping` | Unchanged; the only anon-callable function |

**Automated assertion (CI):** a pgTAP/pg_proc scan asserting (a) no function body contains a tenant-default fallback (`coalesce(app.tenant_id(), …)` is banned — see §10), (b) every SECURITY DEFINER function in `public` is in the approved list above, (c) anon has EXECUTE on nothing but `ping`.

### 5.6 Edge function tenancy — per function

| Function | Action |
|---|---|
| `fiskaly-fiscal`, `vendus-fiscal`, `invoicexpress-fiscal` — **Phase 0 interim lockdown** | The deployed functions are invokable by any anon-key holder (gateway `verify_jwt=true` is satisfied by the shipped anon key — it is *not* auth), hold **global** provider secrets, and trust client-supplied `taxpayerId`/`accountName`/`systemId` — i.e., until the authenticated v2 lands in Phase 4, full SAF-T exfiltration of the pilot business and arbitrary document issuance would stay open for months. **Phase 0 closes this** (the pilot issues via local_at until P4, so nothing breaks — verify that as a precondition): (1) **unset** the project-global `FISKALY_API_KEY/SECRET`, `VENDUS_API_KEY`, `INVOICEXPRESS_API_KEY` secrets — with no credentials the functions can neither issue nor export anything even when invoked; (2) belt-and-braces, redeploy each function with a guard that rejects every request (typed 503 "disabled pending v2") unless an `X-Fiscal-Gate` header matches a new edge secret — covering any future accidental re-set of a provider secret; (3) the `saft` action is removed outright from the interim builds. Registry row #6 (§10) tracks this allowance and its death deploy (P4). If any pilot flow turns out to depend on a provider proxy (e.g., a residual vendus health check), that single action is re-enabled behind the shared-secret gate only |
| `fiskaly-fiscal` → **`pos-checkout` v2** (Phase 4) | Rewritten from the 2026-06-01 spec (INTENTION→TRANSACTION). Requires a real JWT with `tenant_id` claim — the bare anon key is rejected in code. All routing (environment, taxpayer, location, system, series) derived server-side from `tenant_fiscal_config`/`stores`/`devices`/`fiscal_series` — including the training-mode environment resolution (§7.5); client-supplied routing IDs are **rejected from the first authenticated deploy** (at most logged — no warn-only window). Per-tenant token cache keyed on `expires_at`. `saft` action: taxpayer from claims, `app_role in ('admin','owner')` only, output written to the tenant-prefixed `fiscal-exports` bucket (§5.7) |
| `fiscal-record-reconciler` (new, scheduled) | Sibling of the `issued_unpersisted` sweeper. fiskaly has **no webhooks**, and per the research a record can move to **FAILED later on an AT-side "external transmission failure"** (real-time WFA mode) — integrators must poll record state and build their own notification layer. The job (pg_cron → scheduled edge function) re-polls every `fiscal_documents` row whose `record_state` is non-terminal — plus, for WFA-mode tenants, a rolling window of recently issued records — via `GET /records/{fiskaly_record_id}` under the tenant's UNIT token; updates `record_state`/`last_reconciled_at`; on a transition to FAILED emits `notification_events('FISCAL_ISSUE_FAILED', severity='critical')` and places the record on a support work queue. Checkout-time polling to COMPLETED (§7.1 step 6) is therefore only the *first* observation, not the last |
| `fiscal-credit-note` (new) | fiskaly CORRECTION (and policy-gated CANCELLATION — §7.6) with mandatory reason + NC series; validates the original `fiscal_documents` row belongs to the caller's tenant; appends rows + `notification_events('CREDIT_NOTE_ISSUED')` |
| `pair-device` (new) | `verify_jwt=false` by necessity (bootstrap); the high-entropy single-use code is the credential; per-IP and per-code attempt caps; emits `PAIRING_FAILED` events; §6.2 |
| `admin-provision-tenant` (new) | Back-office only; holds the GROUP key; resumable idempotent fiskaly pipeline (§3) — provisions **both the TEST and LIVE resource trees** per tenant (TEST always; LIVE when contracted) |
| `vendus-fiscal`, `invoicexpress-fiscal` (Phase 4 v2) | Same auth wrapper: JWT → tenant → `tenant_fiscal_secrets` row; `register_id`/`accountName` from config, never the body; idempotency wired on the invoicexpress create call |
| `upload-image` | `verify_jwt=true` (currently `false` in `supabase/config.toml:369-374`); proof_hash deleted; object paths `{tenant_id}/products/…` from claims; DELETE branch enforces the caller's tenant prefix (today it deletes any path) |
| `extract-purchase-document` | JWT-only auth (proof_hash + employee_number fallback deleted); employee assertion checked with `.eq('tenant_id', claims.tenant_id)`; per-tenant usage metering row (Azure quota blast-radius) |
| `cash-drawer`, `print-receipt` | **Deleted** (dormant — no client callers; hardware is driven by `electron/hardware/hardwareController.js`) |
| `test-cashier` | Kept dev-gated; stamps tenant_id; validates body `employeeId` belongs to the caller's tenant |
| All | `verify_jwt` pinned per function in `supabase/config.toml`; stale `supabase/functions/_shared/functions.json` deleted; CORS restricted to deployed app origins |

### 5.7 Storage scoping (Ring 4)

Bucket `product-images` becomes **private**; paths `{tenant_id}/products/{uuid}.{ext}`; display via signed URLs (both till and PWA hold sessions).

```sql
create policy tenant_img_read on storage.objects for select to authenticated
  using (bucket_id = 'product-images'
         and (storage.foldername(name))[1] = (select app.tenant_id())::text);
create policy tenant_img_write on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images'
         and (storage.foldername(name))[1] = (select app.tenant_id())::text);
create policy tenant_img_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images'
         and (storage.foldername(name))[1] = (select app.tenant_id())::text
         and (select app.role()) in ('device','manager','admin','owner'));
```

**Second bucket — `fiscal-exports` (new, defined here because §5.6's `saft` action needs a real destination, not a hand-wave):** private; paths `{tenant_id}/saft/{environment}/{YYYY-MM}.zip` (plus `{tenant_id}/exports/…` for future tenant data-export packages, §13 offboarding). Written **only** by service role (the SAF-T job / `pos-checkout`'s saft action); read policy: `to authenticated` with tenant-prefix match **and** `app.role() in ('admin','owner')`. No client write or delete policies at all. Objects are retained in line with the 10-year archive posture (they are derived artifacts of `fiscal_documents`, which remains the primary evidence store).

**Deployment mechanics (own sub-step, so images never dead-link):** (1) dual-read window — new uploads tenant-prefixed while old `products/{employeeId}/…` objects stay readable; (2) migrate objects to `{tenant1_id}/products/…`; (3) rewrite stored `products.image_url` values; (4) flip bucket private + clients switch `getPublicUrl` → signed URLs (`src/components/ImageUploader.tsx:285-288`, product rendering paths); (5) close the window.

### 5.8 Realtime (pinned primitive)

Delivery of `notification_events` is deferred, but the primitive is pinned now: **private-channel Broadcast authorized via RLS on `realtime.messages`** (broadcast-from-database on the tenant's channel), *not* bare `postgres_changes` (whose RLS behavior does not extend to broadcast/presence and which scales poorly per-tenant). Gate: no table joins any publication and no channel ships until the **subscription-scoped cross-tenant isolation test** passes (tenant A's session provably cannot subscribe to tenant B's channel).

---

## 6. Auth & device enrollment

One identity system — Supabase Auth — with two principal kinds carrying one claim shape, so RLS never cares which is calling. This is what lets the future PWA reuse everything.

### 6.1 JWT claim shape (app_metadata; server-controlled)

```json
// device user (one per enrolled till)
"app_metadata": { "tenant_id": "…", "store_id": "…", "device_id": "…", "app_role": "device" }

// human user (till admin today; PWA manager tomorrow)
"app_metadata": { "tenant_id": "…", "app_role": "owner"|"admin"|"manager", "store_ids": ["…"]? }
```

Claims live in `app_metadata` (users cannot edit it; the existing `setup-supabase-auth-users.js` writes `user_metadata` and is retired). Project JWT expiry is reduced to **15 minutes** so bans/claim changes converge fast. Revocation = ban the auth user + `devices.status='revoked'`; hot-path functions (`pos-checkout`) additionally check `devices.status` per call to cover the ≤15-min window.

### 6.2 Device enrollment (replaces the DevicePairing mock)

1. Tenant/platform admin creates the `devices` row (`provisioned`) and a **pairing code**: ≥128-bit entropy (e.g. 26-char base32), rendered once as QR/text, only `code_hash` stored, ≤15-min TTL, single-use.
2. Fresh till opens `/pair-device` — **moved outside `ProtectedRoute`** in `src/App.tsx:327-334` (today it sits behind employee login, inverting the bootstrap).
3. Till POSTs `{code, device_label, fingerprint}` to `pair-device`. The function (service role) verifies hash+TTL+single-use, enforces per-IP and per-code attempt caps (`attempt_count`), and emits `PAIRING_FAILED` notification events on failures.
4. On success it calls `auth.admin.createUser({email: 'device-{device_id}@devices.internal', password: <random>, email_confirm: true, app_metadata: {…}})`, exchanges the password for a session, discards the password, marks the device `enrolled`, and returns `{access_token, refresh_token, tenant_id, store_id, device_id, settings snapshot}`.
5. Till persists the session via `supabase.auth.setSession` (Electron: mirrored into `safeStorage` following the `electron/fiscalSigning.js` pattern; browser tills: localStorage). The pairing record replaces `pos_terminal_id` (`src/services/cashDrawerAuditService.ts:34-41`).
6. Post-pairing bootstrap: pull the tenant's roster/catalog/settings from the server (`syncManager.bootstrap()`), replacing the startup YAML/JSON seed entirely.
7. **Dexie scoping:** `resolveDexieDbName()` (`src/lib/localDatabase.ts:48-57`) derives `POSDatabase::{tenant_id}::{store_id}` (+ the `::training` suffix now **derived from the server's `devices.training_mode` flag**, §7.5), reusing the `pos_dexie_slot` reload-on-switch pattern. A re-paired device structurally cannot read the previous tenant's local data. The old DB is never auto-deleted: decommissioning is an explicit admin flow (export sealed fiscal rows first); `openLocalDatabaseWithRecovery`'s delete-and-recreate becomes non-fatal (server is truth; cache re-hydrates) but is gated behind an export prompt for the legacy DB.

### 6.3 Employee PIN model (server-verified attribution layer)

- Employees remain app-level operators **under the device session** — the device JWT is the security principal; the employee is attribution, validated server-side per call.
- PIN/password verification moves to the `employee_pin_login` RPC (§5.5): bcrypt + lockout, legacy unsalted SHA-256 accepted exactly once then transparently re-hashed. This is feasible because v1 is online-required.
- The pre-login roster grid keeps working: the device session pulls the tenant's roster (names/roles/numbers — no hashes) into Dexie.
- **Sequencing rule (judge-flagged):** `employee_pin_login` + the `LoginForm2`/`SupabaseAuthContext` rewrite ship **in the same deploy** that strips credentials from `get_employees_delta` — never strip before the replacement exists.
- `fetchEmployeeData` (`src/contexts/SupabaseAuthContext.tsx:108-126`) standardizes on `auth_id` (+ tenant filter); the legacy `src/contexts/AuthContext.tsx` (hard-coded demo hash) is deleted.
- `VITE_SYSTEM_ADMIN_EMPLOYEE_NUMBERS` (build-time global admin bypass in `src/utils/systemAdmin.ts`) is deleted; "admin" = `tenant_members.role`, platform tooling = service role from back-office only (no RLS carve-outs for us).

### 6.4 Human users / the PWA

Tenant admins and (later) PWA managers are auth users with a `tenant_members` row; invites are created by `admin-provision-tenant` or a tenant-admin invite flow (service role; email invite, forced password set — **public signup stays disabled**, §5.1.7). A manager signs into the PWA → JWT `{tenant_id, app_role:'manager', store_ids?}` → queries PostgREST directly under the same RLS as the till.

### 6.5 Claims-freshness upgrade (before tenant #2) — and the one-device/multi-tenant decision

V1 stamps `app_metadata` at provisioning (simple, sufficient for one tenant per user). Before tenant #2 onboards, a **Custom Access Token Hook** lands that derives `{tenant_id, store_id, device_id, app_role, store_ids}` from `devices`/`tenant_members` at every token mint — claims freshness and native membership resolution (note: revocation latency is identical either way, bounded by access-token lifetime; the hook's value is freshness, not speed). The `app.*` helper functions isolate the claim source, so the swap touches no policy.

**Multi-tenant on one device — decided, explicitly:** the till is **single-tenant-at-a-time by design**. The per-tenant Dexie DB name + module-load singleton + reload-on-switch pairing model deliberately forecloses running two tenants side-by-side on one till (the map's open question). The "accountant workstation" use case is **not** a till use case: it is served by the future PWA (browser, direct PostgREST under RLS, no Dexie at all) combined with the A1→multi-membership upgrade via the token hook. We accept this trade and state it, rather than paying for a Dexie factory refactor nothing in v1 needs.

---

## 7. Online-required v1 checkout path

### 7.1 End-to-end flow (till → edge fn → fiskaly → receipt)

```
Till (device JWT; employee attribution; cart; client-generated checkout_id UUID —
      crypto.randomUUID() REQUIRED, weak fallback rejected, §7.2)
  → POST pos-checkout
     1. Verify JWT → {tenant, store, device}; require devices.status='enrolled', tenant 'active';
        resolve MODE server-side: devices.training_mode → environment ('live' vs 'test') and
        training stamping (§7.5). The client cannot request an environment.
     2. Validate employee_id and every product_id belong to the tenant (early, for typed errors;
        composite FKs would catch it at persist anyway); RECOMPUTE totals server-side and
        compare with the client's — mismatch is a hard, typed rejection
     3. Idempotency: INSERT fiscal_issue_attempts (tenant_id, checkout_id) status='pending';
        if it exists 'completed' → return the stored response (safe retry);
        if 'issued_unpersisted' → resume persistence (step 7) without re-issuing
     4. Resolve fiscal routing entirely server-side for the resolved environment:
        tenant_fiscal_config (tenant, environment) row; tenant_fiscal_secrets (Vault) →
        cached UNIT token (expires_at); devices.fiskaly_system_id_{test|live};
        fiscal_series row for (tenant, environment, device, doc_type, year)
     5. document.number BOTH-SIDES POSTURE (resolves the researched spec/guide conflict):
        allocate next number from fiscal_series.last_number (atomic UPDATE … RETURNING),
        send it to satisfy the spec's REQUIRED field, and treat fiskaly's returned
        compliance.sequence as AUTHORITATIVE for what we store and print. The TEST-environment
        probe + written fiskaly confirmation (§13) decides whether the allocator stays or
        becomes a mirror of fiskaly's counter.
        BUYER-NIF NOTE: how the customer's NIF rides on RECEIPT (FS/FR) payloads is an
        UNVERIFIED research item (§3/§13) — the record-payload builder for "fatura com
        contribuinte" (customers.tax_number today; NIF mandatory on FR) is gated on the §12
        TEST probe + written answer BEFORE the Phase 4 payload design freezes.
     6. Issue: POST /records INTENTION → POST /records TRANSACTION (2026-06-01 contract),
        X-Idempotency-Key derived from checkout_id; poll record to COMPLETED.
        Failure → attempt 'failed', no DB rows, typed error to the till; same checkout_id
        retry is safe.
     7. Persist in ONE Postgres transaction (service role, tenant/store/device stamped from
        claims): transactions (sealed; transaction_number = authoritative fiskaly number;
        is_training stamped from step 1), transaction_items, fiscal_documents (FULL
        external_payload_json = 10-year evidence; fiskaly_record_id + record_state stored —
        this row enters the fiscal-record-reconciler's watch set, §5.6), stock decrement,
        notification_events (LARGE_DISCOUNT etc.), attempt → 'completed'.
        If persist fails AFTER issuance: attempt = 'issued_unpersisted' with the fiskaly
        response stored; a scheduled sweeper (and any retry) completes persistence from the
        stored response without re-issuing. THIS is the invariant that fiskaly and Postgres
        can never silently diverge.
     8. Return receipt payload: invoice number, ATCUD, QR payload, 4-char hash,
        software_certificate, sequence info (+ training banner flag when in training mode).
  → Till prints (ATCUD above QR, QR ≥25×25mm ECC-M, certificate footer — centrally locked
     templates pending fiskaly layout approval) and writes the rows into Dexie as an
     already-synced cache copy (needs_push=false). Nothing is queued, ever.

  POST-ISSUANCE: checkout-time COMPLETED is not the end of the story — in real-time (WFA)
  reporting mode a record can move to FAILED later on an AT-side transmission failure, and
  fiskaly has no webhooks. The scheduled fiscal-record-reconciler (§5.6) re-polls
  non-terminal/failed records across all issued documents and emits
  FISCAL_ISSUE_FAILED notification_events — the PWA/back-office feed surfaces them.
```

Credit notes/cancellations follow the same shape via `fiscal-credit-note` under the reversal policy in §7.6: validate the original belongs to the tenant and is not already reversed → fiskaly CORRECTION (mandatory reason, NC series, original record id) or — policy-gated, back-office-only — CANCELLATION (status A) → append `fiscal_documents` + mirror `fiscal_cancelled_*` via the locked RPC + `notification_events`. **Implementing fiskaly credit notes is a go-live blocker** (`issueFiskalyCreditNoteForTransaction` in `src/fiscal/fiskalyFiscalIssuer.ts:329-338` currently throws, and NC is the only lawful reversal).

### 7.2 Role of the Dexie layer in v1 (least churn; server is truth)

Ripping Dexie out touches all 29 pages; bypassing it silently breaks reports/reprint. Chosen role — **tenant-scoped read cache + receipt mirror behind the existing service interfaces**:

- **Keep:** the `localDatabase.ts` schema and Local service classes (the storage interface everything codes against); pull-side delta sync for catalog/roster/customers (tenant-scoped, hash-free); local reads for Reports/Transactions UI; reprint from cached fiscal rows.
- **Mirror:** completed sales written into Dexie **from the checkout response** (`markTransactionSyncedFromServer` pattern already exists) — Transactions page, reprint, and local reports work with zero UI churn; the mirror is disposable.
- **Disable (not delete):** `transactionSyncQueue` + `transactionSyncService.pushTransactions` + the POSContext dual-write (`src/contexts/POSContext.tsx:272-303, 429-511`); local fiscal chain allocation (`createFiscalCheckoutAtomic`) for fiskaly tenants; the offline `TXN…` number fallback (`transactionService.ts:210-215`, `localDatabase.ts:2350-2356`); `pruneOldTransactions`' server-mutating deletes; series-counter write-back to settings (`POSContext.tsx:244-255`).
- **Fix the three inherited pull-path defects** (they get *worse*, not better, once the server is truth — so they are named work items in Phase 4's client bullet, not silent inheritances):
  1. **Server-id-wins cache semantics.** The pull-side dedup currently matches by natural key and **keeps the LOCAL id** (`localDatabase.ts:631-639` employees by `employee_number`; `939-947` customers by id/email/phone) — permanent id divergence between device and server, and duplicate rows server-side on any future push. Fix: on a natural-key match the cache row is **replaced wholesale under the server's id** (delete local row + put server row; any local-only references are remapped or dropped — acceptable because the Dexie copy is now a disposable cache, §7.2 "Mirror").
  2. **Server-timestamp watermarks.** `syncMetadata.lastPulledAt` is currently set to the **client clock** — clock skew silently skips server changes in the delta window. Fix: the watermark becomes the **max server `updated_at` observed in the pulled batch** (returned explicitly by the delta RPCs, §5.5); the client clock never enters sync bookkeeping.
  3. **Crypto-strength `checkout_id`.** `generateUUID()` (`src/utils/uuid.ts`) falls back to `Math.random()`-based v4 when `crypto.randomUUID` is unavailable. That was tolerable for cache keys; it is **not** tolerable for `checkout_id`, where a collision within `(tenant_id, checkout_id)` would make the idempotency ledger return **another checkout's stored receipt**. Fix: `checkout_id` is generated by a dedicated `generateCheckoutId()` that uses `crypto.randomUUID()`/`crypto.getRandomValues()` only and **throws** (checkout blocked with a typed error) if neither is available — the weak fallback is rejected, never silently used.
- **Pull scope — decided:** devices pull the **whole tenant's** catalog and customer set, not a per-store slice (this was an open map question previously answered only by omission). Rationale: matches the current RPC shape and the single-store pilot; store-level filtering is deferred, and the schema is ready for it (`store_id` columns exist) if a multi-store tenant needs it.
- **Local-only domains** (HR, queue tickets, drawer events, purchase receipts, raw materials, recipes) stay local, isolated by the per-tenant DB name (A3).

### 7.3 Connectivity-loss UX

- A single `ConnectivityGate` module (wrapping the existing `connectionStatus` 5s `ping`) requires: valid device session + fresh ping + fiskaly `health_check` OK, and distinguishes three typed states: **no network / Supabase unreachable / fiscal service unavailable** — so staff know a provider outage is not their machine.
- Checkout (Pay) is **disabled** with explicit copy: “Sem ligação — não é possível emitir documentos fiscais. Nenhuma venda fica em fila.” Cart preserved; browsing, cart building, queue tickets, and non-fiscal drafts stay usable; auto-recover on reconnect.
- **Nothing fiscal is ever queued.** A blocked sale leaves zero fiscal state anywhere.

### 7.4 Seams for future offline (designed, not built — and legally framed)

- A `CheckoutGateway` interface with the single v1 implementation `OnlineCheckoutGateway` (calls `pos-checkout`).
- **The future offline mode is the legally sanctioned pre-printed-document recovery workflow** — per the research, offline replay is *“Not supported in Portugal”*; the lawful fallback is pre-printed documents from AT-authorized printers, later recovered into the certified software. The seam is therefore a future *recovery-document entry flow* through the same idempotent checkout API (+ a runbook shipped in v1 for the manual process during outages). **No queue-and-sign-later machinery, interface, or naming exists anywhere in the design.** The fiskaly recovery API mechanics are UNVERIFIED (§13).
- Dexie keeps its dormant `needs_push` columns and queue tables (used by legacy history), and `fiscal_issue_attempts` + idempotent `checkout_id` is exactly the ledger any future recovery flow needs.

### 7.5 Training mode (the full design behind A6)

Training mode was previously asserted but not designed; the map names three concrete risks (flag divergence, training docs reaching the production replica, and the undefined fate of the non-fiscal path). All four questions answered:

**(a) How a training till issues documents.** Against the tenant's **fiskaly TEST resource tree** — which is a fully disjoint environment requiring its own UNIT/Subject/Taxpayer/Location/System per tenant. This is exactly why §4.6 keys `tenant_fiscal_config` by `(tenant_id, environment)` and §4.1 gives stores/devices per-environment fiskaly IDs: TEST and LIVE resource IDs are held **concurrently** (which also unblocks the §9.8 TEST-then-LIVE cutover rehearsal). `admin-provision-tenant` provisions the TEST tree for every tenant as part of standard onboarding (it is the same pipeline; fake AT credentials are acceptable in TEST per the research). fiskaly TEST documents are "not legally valid and not communicated to AT production" — precisely the semantics training needs, with the genuine end-to-end flow (real INTENTION→TRANSACTION calls, real ATCUD/QR-shaped output). Receipts printed in training mode carry an unmissable "DOCUMENTO DE TREINO — SEM VALOR FISCAL" banner (part of the locked template set). Whether TEST UNITs/Systems incur charges is folded into the fiskaly pricing question (§13).

**(b) Where training transactions live server-side.** In the **same tables, hard-stamped and structurally excluded** — never in the production reporting/SAF-T surface: `pos-checkout` stamps `transactions.is_training = true` and `fiscal_documents.certification_mode = 'training'` **server-side from `devices.training_mode`** (client input ignored). Exclusion is structural, not per-query discipline: report views carry `where not is_training`; the daily-summary trigger skips training rows; SAF-T generation queries only the LIVE fiskaly taxpayer and filters `certification_mode='production'` in the archive; `get_transactions_delta` segregates by the caller device's mode (§5.5), so training rows never even enter a production till's local cache. Alternatives rejected: separate training tables (schema duplication, double the RLS/trigger surface) and client-only training storage (breaks server-is-truth and denies admins visibility into training activity).

**(c) How the Dexie `::training` slot binds to the server flag.** By making the local slot a **derived value with a single writer**. `devices.training_mode` is the only source of truth, set exclusively by tenant-admin+ via the back-office (service role), emitting `notification_events('TRAINING_MODE_CHANGED')`. The till reads the flag at bootstrap and on its settings/heartbeat pull; if the active Dexie slot (`pos_dexie_slot`) disagrees with the server flag, the till **forces a reload into the correct slot** (`POSDatabase::{tenant}::{store}::training`). The Settings-page toggle that flips `pos_dexie_slot` + `fiscal.trainingMode` locally (`src/pages/Settings.tsx:480-498`) is **removed** — the till has no local training toggle, so the two-flags-diverging failure mode dies with the second writer. Even if local state is tampered with, the server stamps mode from `devices.training_mode`, so a lying client cannot get a LIVE document into the training slot or vice versa.

**(d) The fate of the legacy non-fiscal checkout path — stated explicitly.** The legacy non-fiscal path (`src/contexts/POSContext.tsx:337-553`) is **deleted at Phase 4**, and with it non-fiscal sales as a product concept. Class B forbids client INSERT on `transactions`, and `pos-checkout` is the single sales write path: in v1 **every completed sale issues a document** — a LIVE fiscal document on production tills, a TEST document on training tills. There is no third "non-fiscal sale" mode; the use cases the old path served map to: practice/demo → training mode; not-yet-sales → drafts/queue tickets (non-transactional, never touch `transactions`). This was previously implicit; it is now a named removal in Phase 4 with its own regression test (§12).

### 7.6 Reversal policy: NC vs annulment (reconciling constraint 4 / AGENTS.md with fiskaly CANCELLATION)

Constraint 4 and AGENTS.md (lines 250-253) are unambiguous: sealed documents are never "undone"; there is **no in-app void/anular path**; the only supported reversal is a new NC document. Meanwhile fiskaly exposes CANCELLATION (original set to status A / *Anulado*, reason mandatory, reported to AT) and the schema carries `fiscal_cancelled_*` mirror columns. The plan reconciles these explicitly instead of shipping both without a policy:

- **The till never gets a cancellation control.** The POS UI reversal flow is NC-only, exactly as today — AGENTS.md's "no in-app void path" holds verbatim.
- **Default posture is NC-only end to end.** `fiscal-credit-note`'s CANCELLATION branch ships **disabled by a per-tenant policy flag, default OFF**. While OFF, the platform's effective behavior is indistinguishable from "CANCELLATION dropped."
- **The narrow lawful window, if enabled:** CANCELLATION is a **back-office action** (tenant-admin/owner, via `tenant_members` identity, never a device session), restricted to documents **issued in error that took no commercial effect** (canonical case: operator error detected same day, goods/receipt never delivered), with a mandatory human-entered reason, `FISCAL_CANCELLATION` notification event, and full audit trail. It is a correction of a mistake, not a reversal of a sale — sales that happened are reversed by NC, always.
- **Gate:** the flag is never enabled for any tenant until the lawful annulment conditions are confirmed in writing (fiskaly + the tenant's accountant/AT guidance — §13 question). If that confirmation does not arrive, the branch stays dark and NC-only remains the permanent posture. AGENTS.md is updated at Phase 4 to document this policy so code and stated posture cannot drift again.
- **Legal grounding (researched 2026-07-04):** `docs/fiscal-annulment-rules.md` — AT FAQ 2764 ("invalidamente emitido" + original never with the customer), OC 30136/2012 pt. 14 (value/VAT → NC only; identification errors → annul-and-reissue), e-fatura FAQ 4955 (annulment after AT communication is allowed, same channel), Despacho 8632/2014 pts. 3.3.7/3.3.8 (NC⇄annulment sequencing), CAAD 925/2019-T (NCs over never-realized operations are "mera documentação interna"). The memo enumerates the exact valid cases for this POS (duplicates, payment-failed orphans, undelivered operator errors, wrong-NIF reissue) — accountant written confirmation still required before enabling the flag for a tenant.
- The `fiscal_cancelled_*` mirror columns remain in service either way: they also record cancellations performed for legacy providers and are the anchor for the existing NC-on-cancelled guard.

---

## 8. PWA readiness

**Built now:**
- **Identity:** `tenant_members` users with the same claim shape as devices (§6). One account works on till-admin surfaces and the future PWA.
- **RLS-direct queries:** the class A/B/C SELECT policies (with store scoping) are the PWA's entire read API; report views (`transaction_details` et al.) are `security_invoker` so the PWA reuses them safely. The isolation red-team suite (§12) is the proof that a browser can be handed a session token.
- **notification_events:** written from day one by `pos-checkout` (large discounts, refunds), `fiscal-credit-note`, `pair-device`, the `fiscal-record-reconciler` (`FISCAL_ISSUE_FAILED`), and the drawer RPC when drawer events go server-side. The PWA can already read the feed under RLS with zero delivery infrastructure.
- **Auditability = notifications:** every event row carries `actor_employee_id`/entity refs, so the PWA feed and the audit trail are one table.

**Deferred (with the landing slot pre-cut):**
- Delivery: private-channel Realtime Broadcast (RLS on `realtime.messages`) + a `push_subscriptions(user_id, tenant_id, endpoint, keys)` table + a delivery edge function — no schema change needed then; gated on the subscription isolation test (§5.8).
- The PWA app itself, member self-service invite UI, drawer-discrepancy emission (needs the server drawer table, A3).

---

## 9. Migration plan

**Invariant: no sealed document is rewritten, re-signed, renumbered, or has `updated_at` bumped.** Existing signed history (Dexie local_at chains, `transactions.fiscal_metadata_json`) is preserved byte-for-byte and stays valid/readable forever.

1. **Introspect & baseline (Phase 0):** `supabase db dump` of the live project (RLS state across three policy generations is unknown; `employees.auth_id` drift; duplicate function definitions) → committed baseline migration; root SQL scripts retired.
2. **Emergency hardening (Phase 0, §10):** rotate the service-role and anon keys with **corrected `supabase/.env` facts** (never git-tracked — verified; remote/clone + Vercel/CI secret-store audit replaces the history purge, §5.1.6); disable public signup (§5.1.7); interim lockdown of the fiscal edge functions (§5.6 — provider secrets unset + in-function gate + `saft` removed); drop `clear_all_transaction_data`; sealed-doc triggers + `upsert_transaction_with_items` hardening; column-level credential revoke. **Key-rotation sequencing (resolves the rotate-vs-fleet contradiction):** the anon key is Vite-inlined into deployed Electron installers with **no runtime override and no update channel** — a naive rotation bricks every deployed till until an installer is manually redistributed. Therefore Phase 0 first ships the **runtime-config layer**: `userData/config.json` (Supabase URL + anon key + environment), read at startup by `electron/rendererConfig.js`/main and exposed to the renderer via preload (`window.__RUNTIME_CONFIG__`), with `src/lib/supabase.ts` preferring it over the baked `import.meta.env` values. The rotation runbook is then: install the runtime-config-capable build on the pilot till(s) (a coordinated visit for today's tiny fleet) → stage the new key in `config.json` → rotate → web redeploys pick it up instantly. Future rotations and Supabase-project retargeting (staging vs prod) never require a reinstall again; `electron-updater`/`publish` still lands in Phase 6 for fleet-scale updates, but is no longer a rotation prerequisite.
3. **Create control plane (Phase 1):** tenant #1 from the production install's real company data (currently in device localStorage `pos_system_settings` → captured manually into `tenants`/`stores`/`tenant_settings`/`store_settings`); a `devices` row per known till.
4. **Backfill (Phase 1):** add `tenant_id` nullable → one UPDATE per table to tenant #1 under **`session_replication_role = replica`** (suspends `update_updated_at_column` and `update_daily_summary_on_transaction_change`, preserving `updated_at` — otherwise every till sees a full-table spurious delta and LWW guards misfire) → checksums verified → `SET NOT NULL` + FKs → composite uniques added **alongside** globals (dual-unique window, Shim R4) → `(tenant_id, updated_at)` indexes → daily_sales_summary PK + trigger + `merge_employee_records` updated in lockstep → views recreated `security_invoker`.
5. **Credentials (Phase 2):** copy legacy SHA-256 values into `employee_credentials.legacy_*`; drop `employees.pin`/`password_hash` when `employee_pin_login` + login rewrite deploy together; first login re-hashes to bcrypt.
6. **Pair-first, then enforce (Phases 2→3):** the production till re-pairs via a pairing code for its pre-created device row (Dexie: legacy `POSDatabase` name grandfathered via a pairing-record alias — Shim R3 — so local-only HR/drawer/purchase data survives until server tables exist). **Only after pairing is confirmed** does the isolation cutover deploy: claims-mandatory RPCs, anon revocation, atomic unique-swap + `ON CONFLICT` retarget. **No tenant-default bridge of any kind** (banned, §10).
7. **Fiscal archive import (Phase 4):** one-time authenticated upload of the till's Dexie `fiscalDocuments`/`fiscalAuditEvents` into the server archive, tenant #1-stamped, chain_scope/sequential/hashes untouched; a server-side **read-only chain-verification job** validates continuity per chain_scope and never mutates. Historical SAF-T remains exportable from the archive.
8. **Fiskaly cutover (Phase 4):** tenant #1 provisioned in fiskaly — **TEST tree first, then LIVE**, which the per-environment `tenant_fiscal_config` rows (§4.6) now support concurrently by construction (the old single-environment shape structurally could not hold both, breaking this very step); new sales flow through `pos-checkout` under new fiskaly-registered series; old local_at series marked discontinued (`seriesDiscontinued`); `VITE_FISCAL_RSA_PRIVATE_KEY_PEM` build path deleted.
9. **Storage migration (own sub-step, §5.7):** dual-read window → object move → `products.image_url` rewrite → private flip → signed URLs.

**Rollback story:**
- Every cutover deploy is preceded by a **PITR restore point / snapshot**; the migration rehearsal (§12) is executed against a prod snapshot first, asserting zero `updated_at` drift on sealed rows and byte-identical `fiscal_metadata_json`.
- The **dual-unique window is the unique-swap rollback**: if the atomic “drop globals + retarget ON CONFLICT” deploy misbehaves, redeploy the previous RPC definitions — composite uniques remain valid alongside re-added globals (single-tenant data cannot violate either).
- The **P3 isolation cutover is one server-side deploy with zero client redeploy** (tills are already paired; RPC signatures unchanged): rollback = redeploy the prior RPC/policy migration.
- The **client checkout switch (P4) is feature-flagged** (`CheckoutGateway` selection): rollback = flip the flag back to the hardened legacy path while `upsert_transaction_with_items` still exists (Shim R5 is only removed after `pos-checkout` has soaked).
- Old Dexie DBs are never auto-deleted; the pre-cutover till state is recoverable by re-aliasing.

---

## 10. Guardrails

**Removals (not gates), where fiscal data is at stake:**
- `clear_all_transaction_data()` **dropped** (Phase 0); `/setup`'s clear path and the raw `.delete().gte('created_at','1900-01-01')` fallbacks (`src/utils/populateTransactionData.ts:889-920`) removed from the codebase.
- Startup auto-seed removed from production: `prepareLocalStartupData` (`src/main.tsx`/`src/utils/startupSeed.ts`), `public/bootstrap-data.json` (published ADMIN001 hashes), `public/startup-seed.json`, `public/seed/*.yml`, and `startupCredentialDefaults`/`updateExistingCredentials` (`src/utils/seedData.ts:50-69, 726-735`) — replaced by post-pairing bootstrap. Seed assets leave prod web deploys and Electron `extraResources`.
- `seed/run-seed.cjs` / `bootstrap-admin.cjs`: require explicit `--tenant <uuid>` + non-production guard, or deleted.
- Legacy `src/contexts/AuthContext.tsx`, dormant `cash-drawer`/`print-receipt` functions, `setup-supabase-auth-users.js`: deleted.
- **The legacy non-fiscal checkout path (`POSContext.tsx:337-553`): deleted at Phase 4** — named removal, see §7.5(d).
- **`fiscal.accounting.autoEmailSaft`: removed from every settings surface until a delivery transport actually exists.** Today it is a config-only toggle with no mail transport — tenants may believe SAF-T delivery to their accountant is active when nothing is sent (a per-tenant compliance trap). `accountantEmail` survives as plain contact info; the SAF-T job surfaces files in-app/`fiscal-exports` bucket (§5.7). If/when a transport ships, the toggle returns with an explicit delivery-status indicator.
- `supabase/.env`: **never git-tracked (verified — §5.1.6)**; keys rotated in Phase 0 regardless; the scheduled action is a remote/clone + secret-store audit, **not** a history purge (which would be rewriting history to remove a file that was never in it).

**Gates:** `/setup`, `/seed` (SeedManagement), DatabaseReset, `/receipt-demo`, `/pos2`, `/design-system`, printer/test pages registered only when `import.meta.env.DEV || VITE_ENABLE_DANGEROUS_DATA_TOOLS`. **`/order-status` — decided: pairing-gated.** It stays outside employee login (it is a customer-facing display) but requires an enrolled device pairing record; unpaired browsers are redirected to `/pair-device`. This costs nothing (the page only renders the paired device's local Dexie queue via BroadcastChannel — it is meaningless on an unpaired browser anyway) and closes the last unauthenticated production route (`src/App.tsx:133-136`).

**Banned shims (fatal-flaw class; CI-enforced by the §5.5 assertion):**
- **No tenant-default fallback** in any RPC or function (`coalesce(app.tenant_id(), '<uuid>')` and equivalents). Pilot continuity comes from pairing the existing till *first*, never from defaulting tenant scope.
- **No warn-only window for client-supplied fiskaly routing** (environment/taxpayerId/locationId/systemId): server-derived and enforced from the first authenticated deploy; client values at most logged.
- **No “temporary” RLS-disable or `USING(true)` policies**, ever again (`temp_disable_rls.sql` deleted).

**Anon-allowance registry (the named resolution of the interim-window flaw).** Between Phase 0 and the Phase 3 cutover, the production till still calls sync RPCs as `anon`. The registry enumerates exactly what anon can reach, the compensating control, and the deploy where each allowance dies:

| # | Anon allowance (interim) | Compensating control (from Phase 0) | Dies at |
|---|---|---|---|
| 1 | `get_*_delta` / `upsert_*` sync RPCs (except #4) | Only tenant #1's data exists; sealed docs locked by triggers + hardened upsert; keys rotated; **public signup disabled** (no hostile self-provisioned `authenticated` users, §5.1.7) | P3 cutover (immediately after till pairing) |
| 2 | `get_employees_delta` returns pin/password_hash (Shim R2) | Column-level `REVOKE SELECT (pin, password_hash) ON employees FROM anon, authenticated` closes the direct PostgREST dump on day one; RPC output is the only remaining path and feeds only the till | P2 (`employee_pin_login` + login rewrite deploy) |
| 3 | Direct table reads/writes used by POSContext/transactionService fallbacks | Sealed-doc triggers; no cross-tenant data exists yet | P3 cutover |
| 4 | `merge_employee_records`, `upsert_employees_with_mapping`, `clear_all_transaction_data` | **Revoked/dropped in Phase 0** (precondition: verify no call sites in the sync chain) | P0 |
| 5 | `ping()` | Harmless heartbeat | Never (kept) |
| 6 | `fiskaly-fiscal` / `vendus-fiscal` / `invoicexpress-fiscal` remain gateway-invokable with the anon key (`verify_jwt=true` is satisfied by the shipped anon key — explicitly *not* auth) | **Phase 0 lockdown (§5.6):** global provider secrets **unset** (nothing to issue or exfiltrate even when invoked) + in-function shared-secret gate rejecting all requests with a typed 503 + `saft` action removed from interim builds. Precondition verified: the pilot issues via local_at until P4 and does not depend on these proxies | P4 (`pos-checkout` v2 + per-tenant Vault secrets deploy) |

---

## 11. Phased roadmap

Shim registry (every transitional allowance is named with a removal point; “Exit” lines are the stop-anywhere acceptance criteria):
**R1** anon RPC access until pairing+cutover (registry above) · **R2** credential columns in `get_employees_delta` until P2 · **R3** legacy Dexie name alias for the production till until re-provision · **R4** dual global+composite uniques until the P3 atomic swap · **R5** hardened `upsert_transaction_with_items` as the sales write path until `pos-checkout` soaks in P4.

---

**Phase 0 — Emergency hardening + baseline.** *(~1-1.5 weeks; no product change)*
- Rotate service-role + anon keys with the **sequencing runbook** (§9.2): ship the Electron **runtime-config layer** (`userData/config.json` → `electron/rendererConfig.js`/preload → `src/lib/supabase.ts` override) *first*, stage the new anon key on the pilot till(s), then rotate — no bricked tills, and future key/project changes never require reinstalls.
- `supabase/.env` corrected task (§5.1.6): keys rotated regardless; audit the canonical remote + known clones (`git log --all -- supabase/.env`) and Vercel/CI secret stores; **no history purge of this clone** (the file was never tracked — verified).
- **Disable public email signup** (`enable_signup=false`; all user creation via `auth.admin` — §5.1.7).
- ~~Interim fiscal-function lockdown~~ **RESOLVED by introspection (2026-07-04):** the three fiscal proxies + `extract-purchase-document` were never deployed and no `FISKALY_*`/`VENDUS_*`/`INVOICEXPRESS_*`/`AZURE_*` secrets exist in the project — nothing to lock down. Standing rule: **never deploy the v1 fiscal proxies** (Deferral Register D12); tenant-aware v2 arrives in Phase 4.
- `supabase db dump` → baseline migration; root SQL scripts (`supabase_employees_table.sql`, `supabase_products_categories_tables.sql`, `supabase_transactions_tables.sql`, `supabase_storage_setup.sql`, `fix_transaction_number_sequence.sql`, `clear_transaction_data_function.sql`, RLS scripts) retired into `supabase/migrations/`.
- `DROP FUNCTION clear_all_transaction_data()`; revoke EXECUTE on `merge_employee_records`/`upsert_employees_with_mapping` (verify call sites).
- `REVOKE SELECT (pin, password_hash) ON public.employees FROM anon, authenticated`.
- Sealed-document hardening: `app.protect_sealed_transaction` + items trigger; `upsert_transaction_with_items` patched (insert-once for sealed, no DELETE+reinsert, cancellation-mirror carve-out).
- Views → `security_invoker=true`; `verify_jwt` pinned for all functions in `supabase/config.toml`; CORS restricted; `_shared/functions.json` deleted.
- Env-gate dangerous routes/seeds; fix `VITE_SUPABASE_ANON_KEY` naming (`src/services/purchaseReceiptService.ts:108-109`).
- **Exit: system is *safe* (no mass-delete surface, no credential dump via PostgREST, no anon-reachable fiscal issuance/SAF-T export, no open signup, sealed docs unrewritable, keys rotated without bricking tills) while functionally unchanged for the pilot.**

**Phase 1 — Tenancy backbone + backfill.** *(~2 weeks; invisible to clients)*
- Migrations: `tenants`, `stores`, `devices`, `device_pairing_codes`, `tenant_members`, `tenant_settings`, `store_settings`, `notification_events`, `fiscal_documents`, `fiscal_series`, `fiscal_issue_attempts`, `fiscal_audit_events`, `tenant_fiscal_config` (per-environment rows, §4.6), `tenant_fiscal_secrets`, `employee_credentials` (+ append-only triggers).
- `tenant_id` backfill per §9.4 (replica mode, checksums, NOT NULL, dual uniques R4, indexes, composite `UNIQUE(tenant_id,id)` parents, daily_sales_summary lockstep); `transactions.is_training` added (default false, backfilled false).
- `app.*` claim helpers. Migration rehearsal against a prod snapshot (gate).
- **Exit: schema is tenant-shaped; production behavior unchanged; rehearsal proves zero `updated_at` drift on sealed rows.**

**Phase 1∥ — Deploy infrastructure & environments workstream.** *(runs in parallel with Phase 1; ~2 weeks; previously unplanned — Phase 5's "two-tenant e2e suite green in staging" and §12's CI gates had no substrate)*
- **Staging environment:** create the staging Supabase project (paired with production); per-environment project refs and secrets management (edge secrets, Vault keys, GROUP key TEST/LIVE split); staging Vercel target; Electron runtime-config points tills at either environment without rebuilds (already shipped in Phase 0).
- **Deployment pipeline:** CI jobs running `supabase db push` + `supabase functions deploy` per environment from the now-canonical `supabase/migrations/` (enabled by the Phase 0 baseline consolidation) — merged migrations/functions reach staging automatically, production on promote. Prod schema/function drift from the repo ends here.
- **Test pipeline:** a workflow that actually runs `eslint` + `vitest` + pgTAP (shadow DB) + Playwright (`playwright.config.ts` exists with CI branches but **no workflow runs any of these today**) — this is the substrate for the §12 gates (red-team suite, migration rehearsal).
- **Fix the known-broken release CI** before the fleet grows: `.github/workflows/build.yml` passes **no `VITE_` env** (artifacts are offline-only bundles) → inject the tenant-agnostic production env (Supabase URL/anon key only — everything tenant-varying is server data by design); `npm run electron:dist:win` is an **echo stub producing no Windows artifact** → replace with a real `electron-builder --win` job; decide the **code-signing story** (builds are unsigned with `CSC_IDENTITY_AUTO_DISCOVERY=false`; acquire certs or accept unsigned for the pilot with a named revisit date before fleet distribution).
- **Exit: a merged PR runs lint/tests; a merged migration reaches staging without manual SQL; a release build produces installable, correctly-configured artifacts for mac/win/linux; staging exists for the Phase 3 red-team suite and Phase 5 two-tenant e2e.**

**Phase 2 — Identity: pair-first.** *(~3 weeks)*
- `pair-device` edge fn + real `DevicePairing.tsx` (pre-auth route in `src/App.tsx`); device auth users; Dexie name scoping in `resolveDexieDbName()` + legacy alias for the production till (R3); post-pairing bootstrap replaces startup seed; `/order-status` pairing gate (§10).
- `employee_pin_login` + `employee_credentials` population + `LoginForm2`/`SupabaseAuthContext` rewrite **in one deploy** with stripping credentials from `get_employees_delta` (ends R2). `proof_hash` deleted from `upload-image` (→`verify_jwt=true`) and `extract-purchase-document`.
- Sync services require a session (fail-closed); `ConnectivityGate` v1; **pair the production till**.
- *Files:* `supabase/functions/pair-device/`, `src/pages/DevicePairing.tsx`, `src/App.tsx`, `src/lib/localDatabase.ts:48-57`, `src/contexts/SupabaseAuthContext.tsx`, `src/components/Auth/LoginForm2.tsx`, `src/services/employeeService.ts`, `supabase/functions/upload-image/`, `supabase/functions/extract-purchase-document/`.
- **Exit: every device authenticated with tenant claims; no credential hashes leave the server; pilot till fully working on the new identity.**

**Phase 3 — Isolation cutover.** *(~2-3 weeks; ONE server-side deploy, zero client redeploy — tills already paired, RPC signatures unchanged)*
- Canonical RLS policies on every table (drop all legacy generations; FORCE RLS); RPCs claims-mandatory (**no fallback — S1-class shims banned**) with `ON CONFLICT` retarget **atomically with** dropping global uniques (ends R4); anon revoked from everything but `ping`; log-table policies fixed (incl. `print_logs`, §5.3); `merge_employee_records`/`upsert_employees_with_mapping` deleted.
- Storage privatization as its **own sub-step** (dual-read window → object move → `image_url` rewrite → private flip → signed URLs); `fiscal-exports` bucket + policies created (§5.7).
- **Ship gate: the red-team isolation suite (§12) passes in CI** (on the Phase 1∥ pipeline).
- **Exit: hard-isolated. A hostile authenticated session provably cannot read or write another tenant. (Tenant #2 is now *safe* but blocked on Phase 4.)**

**Phase 4 — Per-tenant fiskaly + server-side checkout (the v1 core).** *(~4-6 weeks)*
- HUB ACCOUNT/GROUP setup; `admin-provision-tenant` pipeline (idempotent state machine, `X-Idempotency-Key`, AT-subuser guided UX + credential health monitoring) provisioning **both TEST and LIVE resource trees** per tenant (§3/§7.5); Vault-backed secrets; layout PDFs submitted for fiskaly approval (incl. the training-banner variant).
- **Research gates cleared before payload freeze:** the **buyer-NIF-on-FS/FR TEST probe** + written answer (§12/§13 — gates the "fatura com contribuinte" record builder); the document-number allocation probe; the `compliance` field-name probe. **Written-confirmation gates tracked for LIVE:** AT certificate number; **LIVE document-type coverage** (FT recency; RG/RC — the app issues Recibos today; GT/GR); **QES-for-PDF availability vs the 2027-01-01 mandate** (§13).
- `pos-checkout` built from the **2026-06-01 spec** (INTENTION→TRANSACTION; both-sides `document.number` via `fiscal_series`; token cache; server-derived routing incl. training-mode environment resolution, client routing rejected — **no warn-only window**); `fiscal-credit-note` (NC + policy-gated CANCELLATION per §7.6 — go-live blocker); **`fiscal-record-reconciler` scheduled job** (§5.6 — post-issuance FAILED detection + `FISCAL_ISSUE_FAILED` events); SAF-T monthly generate job → `fiscal-exports` bucket; `issued_unpersisted` sweeper; `vendus-fiscal`/`invoicexpress-fiscal` auth wrapper port (ends registry row #6).
- **Training mode delivered end-to-end (§7.5):** `devices.training_mode` admin toggle + `TRAINING_MODE_CHANGED` events; server-side stamping/exclusion (`is_training`, `certification_mode`, views/trigger/delta filters); Dexie slot derived from the server flag; local Settings training toggle removed.
- Client: `CheckoutGateway` + `OnlineCheckoutGateway` (feature-flagged); POSContext fiscal path switched; **legacy non-fiscal checkout path deleted** (§7.5(d)); sales push retired; Dexie mirror-from-response; **pull-path fixes shipped as named items** (§7.2): server-id-wins dedup, server-timestamp watermarks, crypto-strength `generateCheckoutId()`; connectivity-blocked checkout UX; fiscal settings server-side, till read-only (`src/pages/Settings.tsx:1726-1847` free-text fiskaly IDs removed for non-admins). **Settings layering includes the hidden coupling:** `readPosTrackInventoryFromStorage` (`src/utils/posSettingsStorage.ts`, imported by `src/lib/localDatabase.ts`) reads the raw localStorage blob inside Dexie stock logic and would silently default `trackInventory=true` once settings move server-side — it is rewired to the layered settings handle with an explicit tenant-level default.
- Tenant #1: Dexie fiscal archive import + chain verification; fiskaly TEST → LIVE cutover; local_at series closed. After soak: **delete `upsert_transaction_with_items` (ends R5)**, drop `generate_transaction_number` + sequence. AGENTS.md updated with the §7.6 reversal policy.
- Custom Access Token Hook lands (§6.5).
- *Files:* `supabase/functions/pos-checkout/`, `supabase/functions/fiscal-credit-note/`, `supabase/functions/fiscal-record-reconciler/`, `supabase/functions/admin-provision-tenant/`, `src/fiscal/checkoutOrchestrator.ts`, `src/fiscal/fiskalyFiscalIssuer.ts`, `src/contexts/POSContext.tsx:225-553`, `src/services/transactionSyncService.ts`, `src/contexts/SettingsContext.tsx`, `src/utils/posSettingsStorage.ts`, `src/utils/uuid.ts`.
- **Exit: multi-tenant fiscal SaaS — tenant #1 issuing through per-tenant fiskaly credentials; fiskaly⇄Postgres divergence impossible by construction (checkout ledger + reconciler); training mode server-controlled end to end; go-live gates (§13 fiskaly items) tracked for tenant #2 LIVE.**

**Phase 5 — PWA foundations + tenant #2.** *(~2-3 weeks)*
- Event emission complete (checkout, NC, pairing, reconciler; drawer when server table lands); member invite flow; report views hardened (training exclusion asserted); Realtime private-channel Broadcast + subscription isolation test (delivery may still be deferred); settings layering hydration in `SettingsContext` completed.
- Onboard pilot **tenant #2** (fiskaly TEST → LIVE after written-confirmation gates, incl. doc-type coverage and — if their invoices are delivered as PDF — the QES timeline); two-tenant e2e suite green in **staging** (exists since Phase 1∥).
- **Exit: a second real tenant in production; PWA can be built with zero backend work.**

**Phase 6 — De-shim & debt.** *(ongoing)*
- Retire R3 when the pilot till re-provisions; delete dormant transaction-push code; server tables for local-only domains (drawer events first → `DRAWER_DISCREPANCY` events); per-tenant fiskaly/Azure metering; electron-updater + `publish` config before the fleet grows (rotation already reinstall-free via the Phase 0 runtime-config layer); optional multi-tenant-user support via the token hook.
- **Tenant-offboarding runbook (stub now, hardened before the first real offboarding):** `tenants.status='offboarding'` triggers — freeze issuance (revoke devices, disable member logins) → final SAF-T generation for all open periods → tenant data-export package (transactions, fiscal_documents incl. full signed payloads, images, SAF-T files) to `fiscal-exports/{tenant_id}/exports/` → fiskaly UNIT/Taxpayer decommission per the §13 written answers (DECOMMISSIONED is irreversible; archive-access and residual-charge semantics UNVERIFIED) → `tenant_fiscal_secrets` destroyed after decommission confirmation → **rows in `fiscal_documents`/`transactions` are retained read-only for the 10-year obligation regardless of offboarding** (our archive is the evidence store; offboarding never deletes fiscal history).

---

## 12. Testing strategy

- **RLS red-team suite (the Phase 3 ship gate; pgTAP in CI against a migrated shadow DB):** two-tenant fixture; per test `set local role authenticated; set local request.jwt.claims = '{"app_metadata":{"tenant_id":"<A>","app_role":"device","device_id":"…"}}'`. Full matrix: every table × {SELECT, INSERT, UPDATE, DELETE} × {same-tenant allow, cross-tenant deny, UPDATE-moving-tenant_id deny}; every RPC (delta returns only own rows; upserts can't touch foreign rows; ON CONFLICT hijack with tenant B's `EMP001`/`COF001` fails; sealed-doc mutation fails; forged newer `updated_at` does not rewrite sealed items); class-E tables unreadable by any client role; `anon` can execute only `ping`; storage: tenant A cannot read/delete `{B}/…` objects in either bucket. Plus the **pg_proc assertions**: no tenant-default fallback in any function body; SECURITY DEFINER allowlist; anon grant scan.
- **Training-mode assertions (Phase 4 gate):** training rows (`is_training`/`certification_mode='training'`) never appear in report views, daily summaries, SAF-T archive queries, or a production device's `get_transactions_delta`; a client-supplied "training" flag is ignored (mode comes only from `devices.training_mode`); slot-divergence recovery — a till whose local slot disagrees with the server flag reloads into the correct slot.
- **Unit (vitest):** `ConnectivityGate` states; checkout payload building + server-side total recomputation parity; `fiscal_series` allocator; Dexie name resolution from pairing records (incl. training suffix derivation); settings layering (incl. the `readPosTrackInventoryFromStorage` rewiring default); **pull-path fixes**: server-id-wins dedup rekeys the cache row to the server id; watermark advances to max server `updated_at`, never client clock; `generateCheckoutId()` throws rather than falling back to `Math.random()`.
- **Edge functions (Deno test, mocked fiskaly):** anon-key JWT rejected on `pos-checkout`/`fiscal-credit-note`/`saft`; tenant-A JWT with body claiming tenant-B `systemId`/`taxpayerId` rejected; SAF-T for a foreign taxpayer rejected; pairing brute-force capped + `PAIRING_FAILED` emitted; happy path; fiskaly-down → attempt `failed`, zero rows; persist-fail → `issued_unpersisted` → sweeper completes; same-`checkout_id` replay returns the stored response without re-issuing; **reconciler**: a mocked record transitioning to FAILED post-checkout yields `record_state='FAILED'` + one `FISCAL_ISSUE_FAILED` event (idempotent on re-poll); **interim lockdown (Phase 0)**: the gated legacy fiscal functions return the typed 503 and expose no `saft` action.
- **fiskaly TEST integration:** provisioning state machine end-to-end (UNIT→Subject→Taxpayer→Location→System→COMMISSIONED, for the TEST tree); FS/FT/NC issuance on 2026-06-01; **the document-number allocation probe**; **the buyer-NIF probe** — how a NIF attaches to RECEIPT (FS/FR) operations ("fatura com contribuinte"; NIF mandatory on FR) since the spec only documents `customer.code` as the Italian lottery code and `recipients[]` on INVOICE — this probe gates the Phase 4 checkout payload design; the `compliance` field-name probe; SAF-T export; token `expires_at` measurement.
- **E2E (Playwright; wired into CI by the Phase 1∥ workstream):** pairing flow; checkout prints ATCUD/QR; `context.setOffline(true)` → Pay disabled with the correct typed banner, nothing queued; credit-note flow; **training-mode flow** — admin flips `devices.training_mode`, till reloads into the training slot, a sale issues a TEST document with the training banner and never surfaces in production reports; two-tenant staging probe — tenant A device sells, a tenant B manager session (PWA-style direct PostgREST) sees nothing; re-pair to another tenant opens an empty Dexie DB; unpaired browser on `/order-status` redirects to pairing.
- **Migration rehearsal (Phase 1 gate):** full §9 run against a prod snapshot; assert zero `updated_at` drift on sealed rows, byte-identical `fiscal_metadata_json`, checksum-verified backfill, delta-sync no-op afterwards.
- **Pipeline assertions (Phase 1∥):** CI fails if lint/vitest/pgTAP/Playwright are skipped; release workflow produces a real Windows artifact (no echo stub) and bundles carry the injected production env; staging deploy job applies migrations + functions from the repo.
- **Realtime isolation test (pre-delivery gate):** tenant A session cannot subscribe to tenant B's private notification channel.

---

## 13. Open questions for the user

**Product/decision — ANSWERED 2026-07-04 (decision log):**
1. ✅ Assumptions confirmed as amended: A1, A2, A4, A6, A7 as written; **A3 changed** (HR attendance, drawer events, purchase receipts, raw materials, recipes → server-side in v1; queue tickets stay local); **A5 changed** (Electron-only tills, no browser tills); **A8 changed** (fiskaly costs included in subscription, no passthrough).
2. ✅ Back-office operated by **us/platform staff** in v1; tenant-admin console post-v1.
3. ✅ **fiskaly is mandatory for all new tenants.** vendus/invoicexpress are legacy-only: their edge functions get the same auth hardening if/when deployed, but no new features and no new tenants on them — candidates for full retirement once confirmed unused (see technical note below: they are not even deployed today).
4. ✅ Re-paired device's old local DB: **never auto-delete; export-then-archive checklist.**
5. ✅ **NC-only confirmed for now** — the CANCELLATION branch ships dark (flag OFF for all tenants). Legal grounding for the future window: `docs/fiscal-annulment-rules.md`; accountant written sign-off required per tenant before any enablement.
6. ⏳ Tenant offboarding package: deferred — answer before the first tenant departure (Phase 6 runbook stub stands).

**fiskaly — require support/sales confirmation in writing (UNVERIFIED research items; each blocks the step noted):**
7. **AT software certificate number and certified entity** — “fiskaly” absent from AT's public certified-programs list as of 2026-07-04. *Blocks contracting / any LIVE tenant.*
8. **document.number allocation authority** (spec: taxpayer-generated REQUIRED field vs guide: fiskaly-assigned sequence) — TEST probe + written answer. *Blocks Phase 4 LIVE; the both-sides posture covers TEST.*
9. **Buyer NIF on RECEIPT (FS/FR) operations** — the spec documents `ReceiptTransaction.customer.code` only as the Italian lottery code and `recipients[]` only on INVOICE, yet “fatura com contribuinte” is an everyday POS flow the current app supports (`customers.tax_number`; NIF mandatory on FR). How is the buyer's NIF supplied on RECEIPT payloads? TEST probe (§12) + written confirmation. *Gates the Phase 4 checkout payload design.*
10. **QES for PDF invoices (mandatory 2027-01-01 — ~6 months out):** fiskaly support is only “being built” per the research. Availability date, API shape, and pricing. *Gates any go-live timeline commitment for tenants that deliver invoices as PDF/electronic invoices; verify before committing dates.*
11. **LIVE document-type coverage:** FT support “appears very recent”; RG/RC — which the current app issues today (RECIBO_ISSUED audit events, NC-on-RG-RC guards) — and GT/GR timelines are unknown. Exact current coverage in LIVE, in writing. *Gates Phase 4 LIVE for tenant #1 (Recibos) and Phase 5 tenant #2 onboarding.*
12. **Series scoping**: may one series span multiple Systems/tills? *Determines whether the per-till series default can relax.*
13. **SAF-T submission**: is automated upload to Portal das Finanças available (marketing claims it; support KB contradicts)? *We build generate-and-surface either way.*
14. **Reporting-mode configuration** (real-time WFA vs monthly SAF-T): where is it set — Taxpayer API, HUB, or fiskaly support?
15. **Token lifetime, rate limits (429 numerics), SLA, pricing granularity** (per UNIT? per document? per System? and **whether TEST-environment UNITs/Systems used for training incur charges**) — needed for unit economics, backoff tuning, and the training-mode cost model. *Pricing blocks tenant #2 commercial terms.*
16. **Subject API-key rotation/disable semantics** (state enum, delete?) — needed for the key-rotation runbook.
17. **Pre-printed-document recovery mechanics** in the API (the lawful outage fallback) — needed for the outage runbook and the future offline seam.
18. **Layout approval**: per-SaaS-template or per-tenant? Typical turnaround? Does the training-banner variant need separate approval? *Go-live gate for every tenant.*
19. **UNIT/Taxpayer decommission (tenant offboarding):** how is a UNIT decommissioned while preserving the 10-year access to the fiscal archive; do decommissioned UNITs still incur charges; what happens to the Taxpayer's AT registration? *Gates the Phase 6 offboarding runbook and the first tenant departure.*
20. **GROUP-token scope**: can it operate UNIT-scoped resources via `X-Scope-Identifier`? (We use per-UNIT keys regardless; answer affects incident tooling only.)

**Technical (resolve in Phase 0):**
21. Actual live DB state: which RLS generation is applied, was `temp_disable_rls.sql` run, does `employees.auth_id` exist, which versions of the duplicated functions are deployed? (Introspection is the first Phase 0 task — CLI access confirmed working 2026-07-04.)
22. ✅ **Answered 2026-07-04 via live introspection + user confirmation:** only **4 edge functions are deployed** (`cash-drawer`, `print-receipt`, `test-cashier`, `upload-image`) — the fiscal proxies (`fiskaly-fiscal`, `vendus-fiscal`, `invoicexpress-fiscal`) and `extract-purchase-document` were **never deployed**, and **no fiscal/Azure secrets exist** in the project (only the default `SUPABASE_*`). There is no anon-reachable fiscal issuance surface in production today. `VITE_FISCAL_RSA_PRIVATE_KEY_PEM` is present in Vercel, but **key rotation is CANCELLED (user decision):** the local-AT key was **never used in production** — the business is not AT-certified (which is precisely why fiskaly is the issuer), so no real fiscal document was ever signed with it and there is no compromise to remediate. Hygiene only: drop the env var from Vercel whenever convenient; the entire `local_at` path retires at cutover. No accountant/AT coordination needed.
23. ✅ **Resolved:** the fiscal proxy functions are not deployed, so there is nothing to lock down. User confirms **fiskaly-only for this version** — no need to verify the pilot till's issuer setting; the local_at path was never a production issuer. Only remaining rule: **never deploy the v1 fiscal proxy functions** — the tenant-aware v2 (`pos-checkout` et al.) is built fresh in Phase 4 (Deferral Register D12).
24. Confirm the remote/clone audit result for `supabase/.env` (§5.1.6): if any remote or fork ever carried a tracked copy, a history purge enters scope for *that* repository — otherwise the item closes with rotation alone.