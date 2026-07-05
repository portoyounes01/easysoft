# Phase 0 — Emergency Hardening: execution packet

> Produced by the `phase0-safety-build` workflow (2026-07-05): 6 analysts → synthesis → per-step adversarial red-team against the LIVE anon-key app. Every step below survived red-team. **Nothing here is applied to prod until the ground-truth probe (`.scratch/introspection/probe.sql`) confirms the facts each step depends on** — see the Confirmation Checklist.
>
> Current-state ground truth this is built on: app runs as the **anon role only** (no GoTrue session → `auth.uid()` is NULL); only 4 edge functions deployed (`cash-drawer`, `print-receipt`, `test-cashier`, `upload-image`); no fiscal issuance live yet; `local_at` key never used in prod.

---

## ✅ STATUS (2026-07-05) — Phase 0 substantially complete on EasySoft

Target changed to greenfield **EasySoft** (prod `kmojrkkjuehmpordueoe`) + **EasySoft-staging** — old test project deleted. Hardening baked into the baseline instead of retrofitted.

**Done & verified (committed `140e588`, `02dd58e`, `f7ff8df`):**
- **DB baseline + hardening** applied to EasySoft & staging: full schema (genesis + 7 migrations), permissive-anon RLS baseline, **S7** (revoke unused employee-admin RPCs), **S8** (`clear_all_transaction_data` never created → 404), **S9** (`security_invoker` views), **S17** (skip-sealed upsert), **S18/S19** (sealed-doc immutability triggers). Verified via PostgREST: all core tables anon-accessible, migration columns present, RPCs work, dangerous RPC gone.
- **Code:** S1 (dead file), S2 (anon-key typo), S10/S11 (`/setup` + unauthenticated `/pos2` + demo routes gated), S11 (mass-delete fallback removed), S12 (Settings dev-panels gated; printer preserved).
- **S15 removed** from the baseline (no real protection while `get_employees_delta` leaks hashes; folds into Phase 2).

**Deferred (flagged, not silent):**
- **S6** disable public signup → **needs a dashboard toggle** (CLI mgmt token is in the macOS keychain). Low impact now; will also revisit in Phase 2. *Action: you, Dashboard → Auth → turn off "Allow new users to sign up".*
- **S13** drop `VITE_FISCAL_RSA_PRIVATE_KEY_PEM` from Vercel → needs your Vercel access; key never used in prod.
- **S20** client sealed-doc sync skip → **Phase 4** (only matters once fiscal issuance creates sealed docs; the DB triggers S18/S19 already protect them).
- **S21** edge CORS lockdown → needs the exact prod origin set (Electron `app://pos` + Vercel domain).
- **S22** Electron runtime-config layer → pairs with anon-key rotation (itself deferred).
- **Cleanup:** legacy root `*.sql` scripts (superseded by genesis) still in repo — archive to avoid accidental re-run.

---

## 🔴 LIVE EXPOSURE — cannot be fully closed in Phase 0 (closes in Phase 2)

**`get_employees_delta(timestamptz)` is a `SECURITY DEFINER` function, EXECUTE-able by `anon`, that returns every employee's `pin` and `password_hash` (unsalted SHA-256).** Anyone holding the public anon key (shipped in every app bundle) can call it and dump all credential hashes, then brute-force the 4-digit PINs offline in seconds.

- **Phase 0 cannot close this.** Revoking the `pin`/`password_hash` columns from `anon` (step 15) does **not** help — a `SECURITY DEFINER` function bypasses column grants. The app also currently *needs* the hashes client-side to verify PINs locally.
- **True fix = Phase 2:** server-side PIN verification (`employee_pin_login` RPC with bcrypt + lockout), strip hashes from the delta, stop replicating credentials to devices.
- **Recommendation:** because **v1 is now online-required**, the offline-login justification for shipping hashes to the client is gone — so Phase 2 is *simpler* than the plan assumed and closes the single biggest hole. **Strongly consider running Phase 2 immediately after the safe Phase 0 wins**, ahead of the schema-heavy Phase 1. (Also unblocks all of Phase 3's RLS.)

---

## Apply order & workstreams

Steps are grouped by risk/independence. Within the sealed-doc bundle (17–20) and the credential bundle (14–16), ordering is **mandatory** and co-deploy is required.

### A. Pure code/config wins — no prod-DB change, apply immediately (SAFE)
- **S1** — delete dead `supabase/functions/_shared/functions.json` (no consumer; CLI reads `config.toml`). `git rm`.
- **S2** — fix env-var typo `VITE_SUPABASE_ANON_KEY` → `VITE_SUPABASE_ANON` in `src/services/purchaseReceiptService.ts:108-109`. *Rename the reference only — do not create a second env var.*
- **S3/S4/S5** — pin `verify_jwt` in `config.toml` to match the safe deployed state: `test-cashier`/`cash-drawer`/`print-receipt` = **true**, `upload-image` = **false** (must stay false — the app calls it with no Authorization header; flipping to true 401s all image uploads — see Blocked D4).

### B. Prod-DB hardening — needs probe confirmation, then apply (SAFE / low-risk)
- **S6** — disable public GoTrue signup in **prod** (Management API `PATCH …/config/auth {"disable_signup":true}` — `config.toml` is dev-only). *Confirm no tool relies on self-service signUp.*
- **S7** — `REVOKE EXECUTE` on `merge_employee_records(uuid,uuid)` + `upsert_employees_with_mapping(jsonb)` from PUBLIC/anon/authenticated (guarded on `to_regprocedure`).
- **S8** — `DROP FUNCTION clear_all_transaction_data()` + revoke its grant. **Must pair with S11** (a raw-delete fallback in `populateTransactionData.ts:897-931` still mass-deletes as anon otherwise).
- **S9** — `security_invoker = true` on **all** public views (enumerate via probe; include the nested `active_products_with_categories`). Inert until RLS lands, but required so views don't later bypass RLS.

### C. Sealed fiscal-document immutability — bundle 17→18→19 in ONE migration, +client S20 (mostly INERT today: 0 rows have `fiscal_document_id`)
- **S17** — patch `upsert_transaction_with_items` to detect a sealed **server** row (`SELECT … fiscal_document_id INTO`), and if sealed, mirror **only** the `fiscal_cancelled_*` columns and `RETURN` early — no financial rewrite, no item DELETE+reinsert. Guard on the server row, never the payload.
- **S18** — `BEFORE UPDATE OR DELETE` trigger `protect_sealed_transaction` on `transactions` (block DELETE of sealed; block UPDATE unless only cancellation-mirror/`updated_at`/`last_synced_at` change).
- **S19** — `BEFORE UPDATE OR DELETE` trigger `protect_sealed_transaction_item` on `transaction_items` (reject any change when parent is sealed). **Must be in the same migration as S17 and applied after the RPC patch.**
- **S20** — client `transactionSyncService.ts`: in the PGRST202 fallback, skip header/item writes when `fiscal_document_id` is set; and don't `markTransactionsSynced` when the RPC row reports `success=false`. (Fleet has no auto-update channel → rely on the RPC being present in prod meanwhile.)

### D. Dangerous route/panel gating — client, needs prod build-flag confirmation (SAFE / NEEDS_CARE)
- **S10** — gate `/receipt-demo`, `/design-system`, `/design-system-2`, and the currently-**unauthenticated** `/pos2` behind `DEV_TOOLS` (`import.meta.env.DEV || VITE_ENABLE_DANGEROUS_DATA_TOOLS==='true'`).
- **S11** — gate `/setup` (DataSetup mass-delete/seed) behind `DEV_TOOLS` **and delete** the raw-delete fallback `populateTransactionData.ts:897-931`.
- **S12** *(NEEDS_CARE)* — gate seed/cashier/electron hardware panels in **both** `App.tsx` **and** `Settings.tsx` (the `?hw=` handler too — gating only `App.tsx` is ineffective). **🔴 Do NOT gate the `printer` tool** — it's production printer setup/recovery (Blocked B6). Confirm the cashier panel isn't the only cash-drawer test at a new site.

### E. Config-plane hygiene & the rotation enabler (NEEDS_CARE)
- **S13** — remove `VITE_FISCAL_RSA_PRIVATE_KEY_PEM` from Vercel (hygiene only — key never used in prod, no rotation needed). Effective on next redeploy.
- **S14** *(mandatory internal order)* — **(1)** confirm/rotate the prod admin credential if it still equals the leaked defaults (`ADMIN001`, hash of `password`/PIN `1234`) → **(2)** then empty `public/bootstrap-data.json` to `{"employees":[]}`. Never empty before an alternative admin exists.
- **S15** *(NEEDS_CARE)* — `REVOKE SELECT ON employees FROM anon` then re-`GRANT SELECT (…all columns except pin/password_hash…)` — a bare column revoke is a no-op while table SELECT stands. Verify the live column set first; keep EXECUTE on `get_employees_delta`. **Does not close the hash leak** (see above).
- **S16** *(NEEDS_CARE)* — `ENABLE ROW LEVEL SECURITY` on `employees` **atomically with** a permissive `anon SELECT USING (true)` policy (never enable with zero or `auth.uid()`-only policies — anon reads would return 0 rows and break checkout's employee-UUID resolution).
- **S21** *(NEEDS_CARE)* — restrict edge-function CORS from `*` to an explicit origin allowlist (incl. the `app://pos` Electron scheme + exact Vercel prod/preview domains), echoed dynamically with preflight preserved. **If the full origin set can't be confirmed, DEFER** rather than guess.
- **S22** *(NEEDS_CARE)* — Electron runtime-config layer (`userData/config.json` → preload `sendSync` → `supabase.ts` prefers it over baked env, with env fallback). Enables future key rotation without reinstalling tills; must expose config **synchronously** (client is built at module top-level) and keep the web-build env fallback. Verify the pilot till still connects with **no** config.json present before staging any key.

---

## Blocked — surfaced loudly (do NOT attempt in Phase 0)

| Blocked action | Unblocks in | Why |
|---|---|---|
| Apply `auth.uid()`-based RLS policies (`secure_rls_policies.sql`) on employees/products/categories/transactions | **Phase 2** (real auth) | Anon has no `auth.uid()` → policies return nothing → breaks catalog/checkout/login |
| `REVOKE ALL … FROM anon` on tables / sequences / functions | **Phase 3** (RLS cutover, till uses `authenticated` JWT) | App runs as anon for 100% of traffic → revoking takes the whole app offline (login, catalog, sync, checkout) |
| Flip `upload-image` `verify_jwt=true` | Phase w/ GoTrue sessions | App calls it with no Authorization header → gateway 401s → all image upload/delete break |
| Remove `upload-image` `proof_hash` gate | **Never** (replace, don't remove) | It's the *only* auth on a service-role signed-URL minter for PIN sessions |
| Rotate the Supabase anon key | Within Phase 0, **only after S22 ships + verified** | Anon key is inlined in every bundle with no update channel → hard rotation bricks the till until reinstall. Low urgency (key is public-by-design; doesn't close the anon exposure) |
| Drop `transaction_number` sequence / `generate_transaction_number()` | **Phase 3 / fiskaly cutover** | Dropping forces the client `TXN{date}{time}{rand}` fallback → collisions under global `UNIQUE(transaction_number)` → sale can't save, no receipt |
| Append-only triggers on `fiscal_documents` / `fiscal_audit_events` | **Phase 1** | Those server tables don't exist yet — `CREATE TRIGGER` on a missing relation aborts the migration |
| Gate the `/printer-test` / `printer` panel | **Never gate `printer`** | Production printer config/recovery surface — gating strands operators, breaks receipts |

---

## Confirmation checklist (run the probe first; each fact gates the noted steps)

The 32 facts live in `.scratch/introspection/probe.sql` output. The load-bearing ones:
1. **Prod RLS state on `employees`** (`relrowsecurity`, live policies) → gates S15, S16.
2. **Does anon hold table-level SELECT on `employees` + exact live column list** → gates S15 (re-GRANT list must be complete).
3. **`get_employees_delta`/`upsert_employees` are SECURITY DEFINER + anon EXECUTE** → confirms login/sync survive S15/S16.
4. **Prod `disable_signup` value** (Management API) → gates S6.
5. **Does prod admin still equal the leaked defaults?** → gates S14 ordering (rotate first).
6. **`clear_all_transaction_data()` exists + anon EXECUTE; `merge_*`/`upsert_*_mapping` signatures & grantees** → gate S7, S8.
7. **Prod build has `import.meta.env.DEV=false` and `VITE_ENABLE_DANGEROUS_DATA_TOOLS` unset** → gates S10-S12 (else route gating is a no-op).
8. **`count(*) transactions WHERE fiscal_document_id IS NOT NULL`** (expected 0) → S17-S19 are no-ops on current data if 0.
9. **`upsert_transaction_with_items` deployed & matches migration (no drift), retains anon EXECUTE** → gates S17/S19/S20 (whether the JS fallback is the live path).
10. **`session_replication_role='origin'`** → S18/S19 triggers won't fire under `'replica'`.
11. **Full public view list + `reloptions`** → S9 (apply to all).
12. **Exact prod origin set incl. `app://pos` + Vercel domains** → S21 (else defer).
13. **Is the live till Electron-packaged?** + `userData` path → S22.
