## Receipt Data Integration Plan

### Goals
- Replace static receipt fields with real, configurable data while keeping the demo page usable with mock data when visited directly.
- After completing a sale in POS, redirect to the receipt page with full, accurate data (and enable re-printing later).

### Current State Summary
- Static/hardcoded now: company info (name, address, tax), slogan, software info, certification number, counter label, document number, ATCUD/verification code, QR placeholder, document type.
- Dynamic from sale: items, totals (subtotal/discount/net/vat/total), payment (method/amount/change), customer (if selected), date/time.

### Scope & Phasing
- Phase 1 (local settings, redirect with real data)
  - Add company and receipt configuration to `SettingsContext` (localStorage-backed).
  - Use settings in POS to populate company/fiscal fields; generate document number and simple ATCUD placeholder.
  - Redirect to receipt page with receipt payload (still support demo fallback).
- Phase 2 (persistence & history)
  - Persist a saved `Transaction` record that includes `receipt_number` and a `receiptPayload` blob.
  - Change receipt route to `'/receipt-demo/:id'` and load by id (keep state-based path as fallback).
  - Add “Reprint receipt” from transactions page.
- Phase 3 (server & compliance)
  - Move series/number and ATCUD generation to server for concurrency and compliance.
  - Optional QR payload standardization.

### Data Model Changes
- Extend `SettingsContext` with:
  - `company: { name, address, postalCode, city, taxNumber, phone?, email?, slogan?, softwareInfo?, certificationNumber? }`
  - `receipt: { defaultDocumentType: 'FATURA'|'FATURA_SIMPLIFICADA', seriesPrefix: string, nextNumber: number, counterLabel: string, atcudPrefix: string }`

- Extend transaction storage (Phase 2):
  - `receipt_number: string`
  - `receiptPayload: ReceiptProps` (exact structure expected by `ThermalReceipt`)

### UI Changes
- Settings → new “Company & Fiscal” section
  - Company fields (name, address, tax number, contacts)
  - Receipt fields (default doc type, series prefix, next number, counter label, ATCUD prefix)

- POS → Complete Sale
  - Build `receiptData` using cart + discounts + settings
  - Document number: `"<seriesPrefix>/<nextNumber>"`; increment `nextNumber` in settings (atomic local update)
  - Verification/ATCUD: `"<atcudPrefix>-<seriesNumber>"` (placeholder algorithm for Phase 1)
  - Navigate to `/receipt-demo` with `state: { receiptData }` (Phase 1)
  - Clear cart after navigation

- Receipt Page
  - Already supports `state.receiptData`; keep demo mock fallback when none provided
  - Phase 2: support `/receipt-demo/:id` to load saved payloads

- Thermal Receipt Component
  - Replace QR placeholder with generated QR (Phase 1 optional)

### Technical Notes
- Receipt payload shape is `ReceiptProps` exported from `ThermalReceipt.tsx` (already exported)
- Minimal QR: encode JSON with `documentNumber`, `total`, `company.taxNumber`, `date` → render with `qrcode` package
- All currency values are tax-inclusive; VAT total is computed proportionally with discounts (existing logic)

### Acceptance Criteria
- Settings: Company & Receipt fields can be configured and persist via localStorage
- POS: Completing sale navigates to receipt with:
  - Correct company and counter label from settings
  - Proper series/number and verification placeholder
  - Correct items, totals, payment and customer data
- Visiting receipt page directly still shows mock selector and demo data

### Risks & Open Questions
- Concurrency for `nextNumber` in multi-terminal setups (address in Phase 3)
- Legal ATCUD generation rules (Phase 3)
- QR payload standard (define minimal v1; align later)

### Task Checklist (Phase 1)
- [ ] Extend `SettingsContext` types and defaults with `company` and `receipt`
- [ ] Settings UI section for Company & Receipt
- [ ] POS sale completion: source company/receipt fields from settings
- [ ] Generate document number + ATCUD placeholder; increment `nextNumber`
- [ ] Navigate to `/receipt-demo` with `receiptData`
- [ ] Optional: QR generation
- [ ] Unit tests: receipt payload build; settings persistence

### Task Checklist (Phase 2)
- [ ] Persist `receiptPayload` and `receipt_number` with transaction
- [ ] Add `/receipt-demo/:id` route; load payload by id; keep state-based fallback
- [ ] Transactions page: reprint action → navigate to receipt

### Future (Phase 3)
- [ ] Server function for series/number reservation and ATCUD
- [ ] Formal QR payload standardization


