# AT Certification — Task Status

Scope: Portuguese AT “Software de Faturação” certification (Portaria 363/2010, Despacho 8632/2014, Portaria 195/2020, SAF‑T PT 1.04_01).

Sources:
- `certification requirements/Requisitos de Certificação - Software Faturação-atualizado-23-03-2026.pdf`
- `notes-structured.md` (operational / UX notes)
- Codebase (this repo)

Legend: **Done** = code present and tested, **In progress** = partial / code scaffolded but gaps remain, **Missing** = no implementation yet.

---

## 1. Minimum certification requirements (Portaria 363/2010, art. 3.º)

### 1.1 SAF‑T (PT) export — structure 1.04_01

**Done**
- SAF‑T 1.04_01 `AuditFile` builder with correct namespace, `Header`, `MasterFiles`, `GeneralLedgerEntries` stub, `SourceDocuments` (`src/fiscal/saft/exportSaft.ts`).
- `Customer`, `Product`, `TaxTable` masters populated from fiscal rows/transactions.
- Each `Invoice` carries `InvoiceNo`, `ATCUD`, `DocumentStatus`, `Hash`, `HashControl`, `InvoiceDate`, `InvoiceType`, `SystemEntryDate`, `CustomerID`, `Line`, `DocumentTotals`.
- `SoftwareCertificateNumber`, `ProductID`, `ProductVersion` threaded from settings / `package.json`.
- Optional export de‑duplication: `saft_exported_at` / `saft_export_batch_id` columns + `markFiscalDocumentsSaftExported` (`src/lib/localDatabase.ts`).
- Export tests: `tests/fiscal/saftExport.test.ts`.

**In progress**
- XSD validation in CI against the official `SAFTPT1.04_01.xsd` (validation script exists but not yet wired to CI pipeline).
- Export of additional document families introduced in 1.04 (`WorkingDocuments`, `MovementOfGoods`, `Payments` full receipts) — only `SalesInvoices` + minimal `Payments` today.

**Missing**
- Supplier master (`Supplier`) block — irrelevant to retail/POS, document as N/A in cert package if truly unused.
- UI to browse / re‑issue SAF‑T by period from `Reports` / `Settings` with batch history.
- Marking every document as `exported` at export time with a blocking confirmation (partially implemented, but no UI hook yet).
- Verify all products appear in SAF‑T even when they have zero invoiced lines in the range (notes: “newly added products without orders”).

---

### 1.2 Asymmetric signing of document records

**Done**
- `FiscalSigner` abstraction with three implementations: `WebCryptoRsaSha1Signer`, `RemoteFiscalSigner` (stub), `ElectronSafeStorageSigner` (`src/fiscal/signing.ts`).
- RSA‑SHA1 (PKCS#1 v1.5) signing over `invoiceDate;systemEntryDate;invoiceNo;grossTotal;previousHash`, `grossTotal` as `toFixed(2)`, empty previousHash on first doc (matches `hash-teste-node.js`).
- Hash chain per `chain_scope` (series + AT validation code) stored immutably in `fiscal_documents.hash_base64`.
- Electron main‑process `safeStorage` key custody + IPC `fiscal:sign-hash-plaintext`, so renderer never sees PEM when secure key is configured (`electron/fiscalSigning.js`, `electron/main.js`, `src/types/electron.d.ts`).
- Vitest hash‑chain fixtures: `tests/fiscal/signing.chain.test.ts`, `tests/fiscal/pemExtract.test.ts`.

**In progress**
- Documentation (cert pack) of signing locus (server vs Electron secure IPC) is drafted in the plan but not in `AGENTS.md` / public docs yet.

**Missing**
- Server‑side signer (real `RemoteFiscalSigner`) for a production backend (HSM / KMS) — kept as optional phase 2.

**Done (key rotation)**
- `HashControl` in settings + SAF‑T; **admin** action **Registar rotação de chave** increments version for new docs, `KEY_ROTATED` fiscal audit (`src/fiscal/hashControl.ts`, `src/pages/Settings.tsx`, `tests/fiscal/keyRotation.test.ts`).

---

### 1.3 User authentication and identification on records

**Done**
- Login system (employees + admin) with `SupabaseAuthContext` / bootstrap admin, tested in `e2e/auth.spec.ts`.
- `SourceID` threaded from authenticated employee into fiscal rows and SAF‑T (`source_user_id`, `employee_number`).

**Missing**
- **User name of the emitter printed on the receipt** (notes: “add name of the user that emitted the document in the receipt”) — `employee_name` is saved on the transaction, not yet rendered by `ThermalReceipt.tsx`.
- Strong password policy / lockout for certification questionnaire (usually required by AT review checklist).

---

### 1.4 No silent alteration of fiscal data (audit trail)

**Done**
- `fiscal_documents` rows are append‑only; `transactionLocalService.deleteTransaction` throws when `fiscal_document_id` is set (`src/lib/localDatabase.ts`).
- `fiscal_audit_events` table with types: `FISCAL_DOCUMENT_CREATED`, `VOID_REQUESTED`, `CREDIT_NOTE_ISSUED` (`src/fiscal/types.ts`).
- Credit note (NC) flow reuses the same atomic writer and continues the hash chain (`src/fiscal/creditNoteCheckout.ts`, `tests/fiscal/creditNoteCheckout.test.ts`).

**In progress**
- Void (`anular`) flow: audit event `VOID_REQUESTED` exists in code, but no POS UI to trigger it and no `ANULADO` watermark in `ThermalReceipt` reprint.

**Missing**
- Additional audit event types: `SETTINGS_CHANGED` (series, certification number, key), `SAFT_EXPORTED`, `LOGIN_SUCCESS/FAILURE`, `KEY_ROTATED`.
- UI to view the audit log (admin‑only).
- Anular documento end‑to‑end (keep row, show cancelled on reprint and in SAF‑T `DocumentStatus`), per notes: “you can cancel an invoice … needs to stay saved, in SAFT, and in the printed doc it needs to indicate cancelled”.

---

## 2. Despacho 8632/2014 — additional technical requirements

### 2.1 Sequential, chronological numbering per series

**Done**
- Atomic allocation of `sequential_number` inside one Dexie `rw` transaction in `createFiscalCheckoutAtomic`, with a compound unique index `&[chain_scope+sequential_number]` (Dexie v6) and retry on conflict (`src/lib/localDatabase.ts`).
- Concurrency tests: `tests/fiscal/atomicSequential.test.ts`.
- `buildChainScope` / `computeSeriesKey` helpers centralize the per‑series chain identity (`src/fiscal/seriesUtils.ts`).
- New series ⇒ numbering restarts at 1 (per notes). Existing series ⇒ strictly incrementing.

**In progress**
- Multi‑device uniqueness: single‑profile Dexie is safe; cross‑device is documented as “one active emitter per `(NIF, establishment, series, AT code)`” but not enforced by a remote sequence RPC yet.

**Missing**
- UI “**Último número de documento utilizado**” per series (notes explicitly request this to avoid human error).
- Server‑authoritative sequence (Supabase RPC + row lock) for online multi‑till deployments.

---

### 2.2 Hash computed and row persisted in one commit

**Done**
- `runFiscalCheckout` is pure for totals / plaintext; sequential allocation, signing, hash write, fiscal row insert, transaction row insert, items insert and audit write all run inside **one** Dexie transaction (`src/fiscal/checkoutOrchestrator.ts` + `createFiscalCheckoutAtomic`).
- No provisional save paths: abandoned checkouts do not consume a sequence number.

**Missing**
- Blocking spinner / UX error on signing failure instead of silently aborting — UI polish in POS.

---

### 2.3 Global uniqueness of document hash

**Done**
- Hash is stored per fiscal row and part of the SAF‑T `<Hash>` element; chain is per series.

**Missing**
- Non‑certified import path with explicit `Hash = ''` + audit flag (if ever imports become in scope). For now: document as **not supported** per PDF §Limitações funcionais.

---

### 2.4 Printing requirements

**Done**
- Legal footer **“Processado por programa certificado n.º xxxx/AT”** in `src/components/ThermalReceipt.tsx` (uses `settings.company.certificationNumber`).
- 4 Base64 characters at positions 1, 11, 21, 31, joined with `-` via `extractQrHashFourChars` (`src/fiscal/signing.ts`) and rendered as `Q:` line on the receipt (`tests/thermal-receipt-label.test.tsx`).
- ATCUD line immediately above QR; QR rendered via `src/utils/qrCode.ts` with AT payload.
- Mandatory fields present: supplier name/NIF/address, document type + number, date, lines w/ quantity + price, VAT rate + base + tax + total, customer NIF when saved (in fiscal row).
- `documentLabel` prop supports `Original` / `Segunda via`.

**In progress**
- **Customer NIF on the printed receipt and in POS right panel**: fiscal row stores it, but `src/pages/POS.tsx` passes only `{ name: selectedCustomer.name }` to `ThermalReceipt`. Notes request NIF on the panel and on the printed receipt.
- **Company NIF at the top** with the rest of company data (notes explicit request) — currently NIF rendered, verify vertical ordering.

**Missing**
- **Original + Duplicado simultaneous print** at issue time (PDF §Impressão Original e Duplicado requires both, not just “Original”).
- **Segunda via** reprint flow with explicit watermark (label prop is there, no UI to trigger it from `Transactions` / receipt reprint).
- **Emitter name (user)** on the receipt (see 1.3).
- **Cancelled watermark** on reprints of cancelled documents.

---

### 2.5 Functional limitations

**Done**
- Line discount guards 0–100% enforced (`assertDiscountGuards` in `checkoutOrchestrator.ts`).
- Global fixed discount cannot exceed subtotal after line discounts.
- `grossTotal > 0` assertion on sale documents.
- `seriesDiscontinued` flag blocks new issuance (`src/contexts/SettingsContext.tsx`, `src/fiscal/checkoutOrchestrator.ts`).
- No physical delete of fiscal‑linked transactions (`deleteTransaction` throws).

**Missing**
- UI risk alerts beyond throwing errors: warning banner in POS when series is discontinued, duplicate manual registration attempts, series about to expire (Portaria 195/2020 renewal).
- Explicit rejection of line‑level negative totals outside NC context (currently implicit via discount bounds).
- Series change on an already‑issued document — currently no such flow, confirm by test; add explicit guard.

---

### 2.6 Training / Formação mode

**Done**
- `settings.fiscal.trainingMode` flag, separate `certificationMode = 'training'` persisted on each fiscal row.
- `ThermalReceipt` has a `trainingMode` prop / banner hook and tests reference it.

**In progress**
- Visual banner on POS page (not only on receipt) — confirm it is always on screen while in training mode.
- Separate training series enforced: settings allow it, but there is no check that `receipt.series` ≠ production series when `trainingMode` is on.

**Missing**
- **Separate DB for demo/formação** (notes: “unique DB for demo mode (formacao)”). Today both modes share the same Dexie; AT accepts shared DB only if training documents are clearly flagged (they are), but a separate IndexedDB name keeps training volume off production metrics and prevents accidental SAF‑T mixing.
- Auto‑deletion / purge of training data policy + UI.

---

## 3. SAF‑T (PT), ATCUD and QR (Portaria 195/2020)

### 3.1 Series communication + ATCUD

**Done**
- Manual entry of AT validation code per series in Settings; `ATCUD: <codigoValidacao>-<sequential>` assembled on every document (`src/utils/atcud.ts`, `src/fiscal/seriesUtils.ts`).
- ATCUD printed immediately above QR (receipt layout).
- Types and spec pinned in `src/fiscal/spec.ts`.

**Missing**
- **Series description field** in settings (notes explicit request).
- Webservice adapter for **“Comunicar série à AT”** — interface ready (`ATSeriesRegistry` concept in the plan), no live implementation. Manual input is acceptable for first certification, flag as phase 2.
- Automatic renewal tracking for the 1‑year validity of the validation code.
- Hardcoded `seriesPrefix: 'ABC'` in `SettingsContext` default — verify and remove or make configurable (notes).

---

### 3.2 QR code content

**Done**
- Exact AT layout `A:…B:…C:…D:…E:…F:…G:…H:ATCUD:…I1:PT…N:…O:…Q:…R:…` via `buildAtQrPayloadString` (`src/fiscal/qrPayload.ts`).
- `Q:` uses only 4 hash chars (not full hash) — notes requirement satisfied.
- `I1:PT` (mainland) fixed segment, `R:` software certificate number, `H:` ATCUD.
- Golden tests: `tests/fiscal/qrPayload.test.ts`.

**In progress**
- **Country code**: `C:${customerCountry}` segment exists, but caller hardcodes `'PT'` (`src/lib/localDatabase.ts:1088`). Needs per‑customer country when present (notes: “add codigo de pais”).

**Missing**
- Madeira / Açores tax spaces (`I2`, `I3`, …) beyond mainland — required only if the emitter operates there; currently only `I1:PT` is emitted.
- Exemption reasons / `M##` blocks per VAT rate if any line is exempt (confirm against AT QR technical spec).

---

## 4. Document types coverage (SAF‑T InvoiceType)

**Done**
- **FT** (Fatura) — full fiscal path.
- **FS** (Fatura Simplificada) — full fiscal path, mapped from `defaultDocumentType` setting.
- **NC** (Nota de Crédito) — dedicated checkout `runFiscalCreditNoteForTransaction`, continues hash chain, emits audit event.

**Missing**
- **FR** (Fatura‑Recibo) — notes: “for FT, add option to give recibo”.
- **ND** (Nota de Débito).
- **Recibos** (separate receipt document type) — notes mark as a distinct document to handle.
- Guard against emitting both **FS and FT** for the same order (notes explicit: “we cannot generate both documents for the same order”). Needs uniqueness check on `transaction_id` before issuing a second fiscal doc of a different sale type.

---

## 5. Data model / storage integrity

**Done**
- `fiscal_documents` table (Dexie v6) with compound unique index, indexes on `series_key`, `transaction_date`, `invoice_no`.
- Supabase mirror columns + `upsert_transaction_with_items` RPC carries `fiscal_document_id` and `fiscal_metadata_json` (`supabase/functions/upsert_transaction_with_items.sql`, `src/services/transactionSyncService.ts:167`).
- Immutability of hash fields — no update paths; `deleteTransaction` throws for fiscal rows.
- HashControl field present in DB + SAF‑T.

**In progress**
- Supabase migrations for **customer `tax_number`** already applied (`supabase/migrations/20260414180000_customers_tax_number.sql`); verify remote fiscal columns match local (`20260413120000_transactions_fiscal_columns.sql`).

**Missing (bug from notes)**
- **“verify transactions are properly saved in both localDB and remoteDB, currently it's broken”** — investigate `transactionSyncService` push path for fiscal payload; add integration test that a fiscal sale round‑trips local ⇄ Supabase with hash, ATCUD and invoice_no intact.

---

## 6. Customer data

**Done**
- Customer `tax_number` (NIF) field + validation in `CustomerDialog.tsx`, synced to Supabase.
- Customer NIF stored on fiscal row and in QR `B:` segment.

**Missing (from notes)**
- **Customer address and postal code** mandatory fields in `CustomerDialog.tsx` + local DB + Supabase mapping.
- Customer country on the record (today `I1:PT`/`C:PT` hardcoded — see 3.2).

---

## 7. POS UX items (from notes)

**Done**
- Customer selection + NIF search in POS (`CustomerDialog.tsx`).
- Discount guards wired to checkout.

**Missing**
- **Remove a single cart item** by clicking it in the right panel (notes explicit).
- **Show selected customer NIF in POS right panel** (today only name is displayed in the cart snapshot).
- **Last invoice number indicator** per series in POS / Settings.

---

## 8. Settings

**Done**
- Series settings (name, prefix, numeric width, reset policy, last key, AT validation code, training mode).
- Certification number, software info, default document type, discontinued flag.
- Private key management: PEM field + Electron “guardar chave no armazenamento seguro”.

**In progress**
- Cert PDF asks that `HashControl` not be exposed in Settings; we show **read-only** current version + admin **rotation** action (no free editing in production). Confirm with auditor whether this satisfies “not exposed” or if the label must be removed entirely.

**Missing**
- Series **description** field (3.1).
- Remove / replace default `seriesPrefix: 'ABC'` sentinel (2.1 UX + 3.1).
- “No reset policy for the same series — only a new series resets numbering” — today `resetPolicy: 'monthly' | 'yearly'` is offered; reconcile with notes (likely keep only “never, until replaced by new series”).
- Mode selector (`test` / `stage` / `formation` / `debug`) as explicit Settings enum — **deferred** to Phase 4 (see `TODO.md`).

---

## 9. Logs / observability

**Done**
- `fiscal_audit_events` append‑only log at the fiscal level.

**Missing**
- General application log capture (login, settings changes, signing errors, sync errors) with export for forensics — notes: “logs are very very important, everything can be constructed from the logs”.
- Crash / uncaught error telemetry surfaced to admin UI.

---

## 10. Cancellation (Anular) flow

**Missing (notes §Anular documento)**
- POS / Transactions UI action to cancel an issued invoice.
- Persisted “cancelled” state on fiscal document (kept, not deleted).
- SAF‑T `DocumentStatus` reflecting cancellation (`A` for anulado).
- Reprint of cancelled document shows it clearly (`documentLabel` extension or dedicated banner).

---

## 11. Electron / packaging

**Done**
- Electron main‑process signing via `safeStorage` + preload IPC (`electron/main.js`, `electron/preload.js`, `electron/fiscalSigning.js`).
- `ElectronSafeStorageSigner` preferred over PEM when a secure key is present (`createSignerFromSettings`).

**Missing**
- Native keystore / TPM (Windows TPM, macOS Secure Enclave) — documented as optional hardening phase.
- Signed release build + auto‑update channel (usually required for AT site inspection).

---

## 12. Test / QA coverage

**Done**
- `tests/fiscal/atomicSequential.test.ts` — atomic allocation + uniqueness.
- `tests/fiscal/signing.chain.test.ts` — hash chain golden vectors.
- `tests/fiscal/pemExtract.test.ts` — PEM import variants.
- `tests/fiscal/qrPayload.test.ts` — QR golden strings.
- `tests/fiscal/saftExport.test.ts` — SAF‑T structure.
- `tests/fiscal/creditNoteCheckout.test.ts` — NC flow.
- `tests/thermal-receipt-label.test.tsx` — legal phrase + 4‑char hash rendering.
- `tests/offlineSync.test.tsx`, `tests/posOfflineIntegration.test.tsx` — offline round‑trip.
- E2E: `e2e/auth.spec.ts`, `e2e/smoke.spec.ts`.

**Missing / In progress**
- CI step running `xmllint --schema SAFTPT1.04_01.xsd` against generated SAF‑T.
- E2E for NC flow from Transactions page.
- E2E for SAF‑T export download in Settings/Reports.
- Test that covers cancellation (once implemented).
- Test that two concurrent sales on separate `chain_scope`s do not block each other.

---

## Summary matrix

| Area                              | Done | In progress | Missing |
|-----------------------------------|:----:|:-----------:|:-------:|
| SAF‑T 1.04_01 structure           |  ✔   |      ✔      |    ✔    |
| RSA‑SHA1 hash chain               |  ✔   |             |         |
| Electron safe storage signing     |  ✔   |             |    ✔    |
| Atomic sequential per series      |  ✔   |      ✔      |    ✔    |
| ATCUD + QR content                |  ✔   |      ✔      |    ✔    |
| Customer NIF on QR + SAF‑T        |  ✔   |      ✔      |         |
| Customer NIF/address on UI        |      |      ✔      |    ✔    |
| Printed 4‑char hash + legal line  |  ✔   |             |         |
| Original + Duplicado at issue     |      |      ✔      |    ✔    |
| Segunda via reprint flow          |      |             |    ✔    |
| Cancel (Anular) document flow     |      |             |    ✔    |
| Credit note (NC) flow             |  ✔   |             |         |
| FR / ND / Recibo document types   |      |             |    ✔    |
| Functional discount guards        |  ✔   |             |         |
| Discontinued series guard + UI    |  ✔   |      ✔      |         |
| Training mode flag + banner       |  ✔   |      ✔      |    ✔    |
| Separate DB for training          |      |             |    ✔    |
| Audit log (fiscal events)         |  ✔   |      ✔      |    ✔    |
| Local ↔ remote fiscal sync        |  ✔   |      ✔      |    ✔    |
| Series description + no‑reset     |      |             |    ✔    |
| Last number indicator UI          |      |             |    ✔    |
| Remove cart item by tap           |      |             |    ✔    |
| Emitter user name on receipt      |      |             |    ✔    |
| Webservice comunicação de séries  |      |             |    ✔    |
| XSD validation in CI              |      |      ✔      |    ✔    |

---

## Recommended next sequence (short list)

1. **Cancel (Anular) flow** end‑to‑end (DB state, UI, SAF‑T `DocumentStatus`, reprint watermark, audit event).
2. **FR + ND** document types reusing the atomic writer (and guard against FT+FS on the same order).
3. **POS UX trio**: customer NIF in right panel + on receipt, remove item by tap, emitter name on receipt, last number indicator.
4. **Customer model**: address + postal code + country mandatory; thread country into QR `C:` and SAF‑T.
5. **Training mode hardening**: separate Dexie DB, enforce separate series, persistent on‑screen banner.
6. **Settings cleanup**: series description, drop `ABC` sentinel, hide `HashControl`, add mode selector.
7. **CI XSD validation** + fix local/remote sync bug called out in notes.
8. (Phase 2) Webservice “Comunicar série”; `RemoteFiscalSigner` backend; native keystore / TPM.
