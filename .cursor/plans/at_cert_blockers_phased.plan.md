---
name: AT cert blockers phased
overview: Close AT certification blockers in three shippable phases — hard fiscal first, then UX/data/training, then hardening. Scope — FT + FS + NC + standalone Recibo (no FR/ND); separate Dexie DB for training with banner and confirm dialog; no AT webservices, no RemoteFiscalSigner backend, no TPM.
todos:
  - id: p1-cancel-flow
    content: "Phase 1: Anular documento (DB fields, service, SAF-T DocumentStatus=A, Transactions UI admin-only, ANULADO watermark, audit event, tests)"
    status: completed
  - id: p1-original-duplicado
    content: "Phase 1: Print Original + Duplicado at issue (two passes via documentLabel, Settings toggle)"
    status: completed
  - id: p1-segunda-via
    content: "Phase 1: Segunda via reprint from Transactions (watermark, REPRINT_REQUESTED audit, no renumber)"
    status: completed
  - id: p1-receipt-fields
    content: "Phase 1: Receipt — customer NIF, emitter operator name, company NIF at top; update thermal-receipt tests"
    status: completed
  - id: p1-qr-country
    content: "Phase 1: QR C: from selectedCustomer.country; customers.country column + migration + qrPayload test"
    status: completed
  - id: p1-one-fiscal-per-tx
    content: "Phase 1: Reject second fiscal doc for same transaction_id (blocks FS+FT on same order)"
    status: completed
  - id: p1-last-number-ui
    content: "Phase 1: lastSequentialInSeries in POS right panel + Settings"
    status: completed
  - id: p1-settings-cleanup
    content: "Phase 1: Series description field; drop ABC prefix default; ensure HashControl never shown in Settings UI"
    status: pending
  - id: p1-xsd-ci
    content: "Phase 1: Vendor SAFTPT1.04_01.xsd + xmllint validation script + CI"
    status: pending
  - id: p1-sync-bug
    content: "Phase 1: Fix local↔remote fiscal roundtrip; integration test for hash/ATCUD/invoice_no parity"
    status: completed
  - id: p2-pos-right-panel
    content: "Phase 2: Remove cart line by tap; show customer name+NIF in right panel"
    status: completed
  - id: p2-customer-address
    content: "Phase 2: Customer address + postal_code + city + country required; migrations; SAF-T Customer block"
    status: completed
  - id: p2-recibo-doctype
    content: "Phase 2: Standalone Recibo checkout + Transactions action + SAF-T Payments block + tests"
    status: completed
  - id: p2-training-db
    content: "Phase 2: Separate Dexie DB when trainingMode; banner; confirm dialog; FORMACAO series; receipt watermark"
    status: completed
  - id: p2-mode-selector
    content: "Phase 2: Mode selector enum (production/training/debug) in Settings"
    status: cancelled
  - id: p2-audit-expansion
    content: "Phase 2: Expand audit event types + emit at call-sites + admin audit viewer"
    status: completed
  - id: p2-risk-alerts
    content: "Phase 2: POS banners for discontinued series + expiring AT validation code"
    status: completed
  - id: p2-negative-guards
    content: "Phase 2: Reject negative line totals outside NC; E2E for fiscal uniqueness per transaction"
    status: completed
  - id: p3-signing-ux
    content: "Phase 3: Blocking spinner + error surfaces during signing in POS"
    status: pending
  - id: p3-key-rotation
    content: "Phase 3: Key rotation action + HashControl increment + KEY_ROTATED audit + tests"
    status: completed
  - id: p4-app-mode-three-way
    content: "Phase 4 (deferred): Three-way appMode selector (production/training/debug) in Settings"
    status: pending
  - id: p4-audit-login-settings
    content: "Phase 4 (deferred): Emit LOGIN_* / SETTINGS_* fiscal audit events at auth/settings call-sites"
    status: pending
  - id: p3-test-gaps
    content: "Phase 3: E2E NC/SAF-T/cancel/training-switch; unit parallel chain_scopes; receipt asserts"
    status: pending
  - id: p3-app-logs
    content: "Phase 3: Structured app log (signing/sync/auth) with admin NDJSON export"
    status: pending
isProject: false
---

# AT certification — phased blockers plan

## Implementation status (snapshot)

| Area | Notes |
|------|--------|
| Phase 1 core fiscal | Cancel, segunda via, duplicate print, receipt NIF/emitter, QR country, one-fiscal-per-tx, sync parity test, POS/settings numbering hints are in code. |
| Phase 1 gaps | **Settings:** HashControl still visible (labelled dev). **XSD:** `validate-saft-xsd.mjs` + `npm run test:saft-xsd` exist; vendor `SAFTPT1.04_01.xsd` optional; CI does not run XSD validation yet. |
| Phase 2 | Address/SAF-T billing + CustomerDialog done. POS panel, Recibo RG/Payments, training Dexie swap, fiscal audit viewer, expiry banners, negative sale guards — shipped. |
| Phase 3 | **Key rotation** (Settings admin: HashControl +1, `KEY_ROTATED` audit, tests). **Deferred to Phase 4:** three-way `appMode`, LOGIN/SETTINGS audit instrumentation. Signing UX, E2E pack, app logs — pending. |

## Scope locked

- **Document types:** FT + FS + NC + standalone Recibo. No FR, no ND.
- **Training mode:** separate Dexie database (`restaurante_pos_training` vs production name) + persistent mode banner + Enter/Exit-training confirm dialog.
- **Out of scope (later):** AT webservices for “Comunicar série”, `RemoteFiscalSigner` backend, native keystore / TPM.
- **Delivery:** three phases; do not start phase N+1 until phase N is green.

## Phase 1 — Hard fiscal blockers

### 1.1 Cancel (Anular) document flow

- Add `cancelled_at`, `cancelled_reason`, `cancelled_by_employee_id` to fiscal document model + Dexie migration in [src/lib/localDatabase.ts](src/lib/localDatabase.ts).
- Supabase migration for mirrored columns.
- `cancelFiscalDocument(id, reason, employeeId)`: update fiscal row (no delete), emit `FISCAL_DOCUMENT_CANCELLED` audit (extend [src/fiscal/types.ts](src/fiscal/types.ts)).
- [src/fiscal/saft/exportSaft.ts](src/fiscal/saft/exportSaft.ts): cancelled docs → `DocumentStatus` with `InvoiceStatus` A (anulado) per XSD.
- UI: `Anular` in [src/pages/Transactions.tsx](src/pages/Transactions.tsx), admin-only; reason dialog.
- [src/components/ThermalReceipt.tsx](src/components/ThermalReceipt.tsx): `ANULADO` watermark when cancelled.
- Test: `tests/fiscal/cancelDocument.test.ts`.

### 1.2 Original + Duplicado at issue

- After successful checkout, print twice: `documentLabel="Original"` then `documentLabel="Duplicado"` ([src/pages/POS.tsx](src/pages/POS.tsx)).
- Settings: `printDuplicateOnIssue` default true ([src/contexts/SettingsContext.tsx](src/contexts/SettingsContext.tsx), [src/pages/Settings.tsx](src/pages/Settings.tsx)).

### 1.3 Segunda via reprint

- Transactions: reprint with `documentLabel="Segunda via"` + `REPRINT_REQUESTED` audit; no new sequence/hash.

### 1.4 Receipt fields

- Pass customer NIF into receipt props (fix [src/pages/POS.tsx](src/pages/POS.tsx) line that only passes name).
- Add `emitterName` (operator) to ThermalReceipt; company NIF at top of header block.
- Update [tests/thermal-receipt-label.test.tsx](tests/thermal-receipt-label.test.tsx).

### 1.5 QR `C:` country

- Replace hardcoded `customerCountry: 'PT'` in [src/lib/localDatabase.ts](src/lib/localDatabase.ts) with `customer?.country ?? 'PT'`.
- `customers.country` + migrations; extend [tests/fiscal/qrPayload.test.ts](tests/fiscal/qrPayload.test.ts).

### 1.6 One fiscal document per transaction

- In atomic checkout, reject if fiscal row already exists for `transaction_id`.
- Prevents FS + FT for same order.

### 1.7 Last invoice number indicator

- `max(sequential_number)` per `chain_scope` → show in POS right panel and Settings.

### 1.8 Settings cleanup

- `seriesDescription` on receipt settings; remove default `seriesPrefix: 'ABC'`; validate empty prefix; audit Settings so HashControl is never user-visible (dev-only if needed).

### 1.9 XSD in CI

- Vendor official XSD under `certification requirements/`; `scripts/validate-saft.mjs` + `npm run test:saft-xsd`; wire CI.

### 1.10 Local ↔ remote fiscal sync

- Fix [src/services/transactionSyncService.ts](src/services/transactionSyncService.ts) + [supabase/functions/upsert_transaction_with_items.sql](supabase/functions/upsert_transaction_with_items.sql) as needed.
- Integration test: local fiscal sale → push → fetch → identical `hash_base64`, `invoice_no`, `atcud`, `sequential_number`, `hash_control`.

## Phase 2 — UX / data / training

### 2.1 POS right panel

- Remove line item by tap; show selected customer name + NIF.

### 2.2 Customer address + postal + country

- Required fields in [src/components/CustomerDialog.tsx](src/components/CustomerDialog.tsx); migrations; SAF-T `BillingAddress` where required.

### 2.3 Standalone Recibo

- New path `src/fiscal/reciboCheckout.ts` (mirror [src/fiscal/creditNoteCheckout.ts](src/fiscal/creditNoteCheckout.ts)).
- Transactions: “Emitir recibo” on FT rows only; SAF-T `<Payments>` section in [src/fiscal/saft/exportSaft.ts](src/fiscal/saft/exportSaft.ts).
- Confirm SAFT code (`RG` / `RC`) against official table before coding.

### 2.4 Training DB + banner + confirm

- Dexie name switches with `trainingMode`; [src/App.tsx](src/App.tsx) or layout banner; Settings confirm typing `FORMAÇÃO`; separate series auto-seed; receipt watermark “Documento emitido em modo de formação”.

### 2.5 Mode selector

- production / training / debug in Settings (storage can stay boolean + debug flag).

### 2.6 Audit expansion + viewer

- Types: `SETTINGS_CHANGED`, `SAFT_EXPORTED`, `LOGIN_*`, `KEY_ROTATED`, `REPRINT_REQUESTED`, `RECIBO_ISSUED`, etc.
- Admin read-only `/admin/audit` or Settings tab.

### 2.7 Risk alerts

- Banner for discontinued series before checkout attempt; warn when AT validation code near expiry (store `atValidationCodeIssuedAt`).

### 2.8 Negative-line guards

- Explicit reject in [src/fiscal/checkoutOrchestrator.ts](src/fiscal/checkoutOrchestrator.ts) for negative line totals (NC path exempt).

## Phase 3 — Hardening

### 3.1 Signing UX

- Blocking modal during `runFiscalCheckout` with clear errors (PEM missing, Electron IPC down, import DataError).

### 3.2 Key rotation + HashControl — done

- Settings (admin): **Registar rotação de chave** → `nextHashControlVersion` → `updateSettings` → `KEY_ROTATED` audit (`src/fiscal/hashControl.ts`, `src/pages/Settings.tsx`, `tests/fiscal/keyRotation.test.ts`). Existing fiscal rows unchanged.

### 3.3 Tests

- E2E: NC, SAF-T export, cancel, reprint, training switch.
- Unit: parallel `chain_scope` sales; receipt header/NIF/watermarks.

### 3.4 App logs

- IndexedDB `app_logs` JSON lines; admin NDJSON export for forensics.

## Risks

- **§1.10 sync:** size unknown until investigation (schema vs one-line filter).
- **Training DB swap:** may require full app reload on mode change — validate with smoke test.
- **Recibo in SAF-T:** Payments block structure must match PT_1.04_01 XSD exactly.

## References

- [certification-tasks.md](certification-tasks.md) — full gap matrix vs PDF + codebase.
- [notes-structured.md](notes-structured.md) — operational notes.
