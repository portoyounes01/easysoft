# fiskaly SIGN PT (unified API) — verified contract capture

**Date:** 2026-07-19 · **Register:** B16 (supersedes the ⚠️ASSUMED markers of B4/A2)
**Method:** official OpenAPI specs downloaded from fiskaly + live schema-echo probes against
`test.api.fiskaly.com` (dummy credentials only — no authenticated call has ever run; see
"Still unverified" below).

**Primary sources**
- OpenAPI (canonical): `https://workspace.fiskaly.com/specs/fiskaly.sign-pt.2026-06-01.yaml`
  (latest; `2026-05-04` is the "Preview" version, still accepted)
- Docs: `https://workspace.fiskaly.com/api/sign-pt/2026-06-01/`
- Launch post (2026-05-21): `https://workspace.fiskaly.com/blog/2026-sign-pt-launch/`

## 1. Naming verdict

**"SIGN PT" is the real, current product name** (marketing page `fiskaly.com/signpt`, spec
`info.title: fiskaly SIGN PT`) **and it is delivered on fiskaly's unified API**: shared hosts
`test.api.fiskaly.com` / `live.api.fiskaly.com`, no country-specific host. Both earlier
framings were half right — "PT is on the UAPI, not SIGN PT" (fiskaly email, B12) confused
product name with transport. Contrast: **SIGN ES is a separate Specialized API**
(`test/live.es.sign.fiskaly.com/api/v1`, no `X-Api-Version`, token at
`content.access_token.bearer`) and fiskaly states no migration of Spain to the unified API is
planned. Do not model one on the other.

Note: `workspace.fiskaly.com/getting-started/unified-api` is STALE (omits PT); the spec and
launch post override it. Also `bare api.fiskaly.com` does not resolve in DNS — only the
`test.`/`live.` hosts exist.

## 2. Transport (probe-verified live)

- **Auth:** `POST /tokens` body `{"content":{"type":"API_KEY","key":"…","secret":"…"}}`.
  The flat `{api_key, api_secret}` shape is **schema-rejected** (400 "property api_key is
  unsupported"). Token at **`content.authentication.bearer`** (+ `expires_at`, `issued_at`).
- **`X-Api-Version`** (CalVer) is required on EVERY request; it routes to the API — missing or
  unknown values get a bare outer-gateway `404 page not found`. Probe-confirmed accepted:
  `2026-06-01` (current), `2026-05-04` (preview). Use `2026-06-01`.
- **`X-Idempotency-Key`** (uuid v3/v4, format-checked) is required on every POST — **including
  `/tokens`** (probe: 400 without it; replay semantics not applied there).
- Errors: `{status, code, error, message}` envelope; inner-router responses carry
  `x-trace-identifier` + CORS headers (distinguishes them from outer-gateway 404s).

## 3. Resource model & issuance flow (spec-verified)

Paths: `/tokens /subjects /organizations /taxpayers /locations /systems /records /files`
(+`/{id}` GET/PATCH). **No PUT anywhere** — the legacy
`PUT /systems/{id}/records/{rid}` used by the pre-rewrite `fiskaly-fiscal` proxy **does not
exist** (probe: inner-router 404); that shape was SIGN DE's, never SIGN PT's.

Issuance = two sequential `POST /records` (server-assigned uuid v7 ids):
1. **INTENTION**: `{content:{type:"INTENTION", system:{id}, operation:{type:"TRANSACTION",
   details:{creators:[{type:"PERSON",label}], training?}}}}`
2. **TRANSACTION**: `{content:{type:"TRANSACTION", record:{id:<intention-id>},
   operation:{type:"RECEIPT"|"INVOICE"|…}}}`

Operation types: RECEIPT (FR; `document.simplified_invoice:true` = FS), INVOICE (FT),
DRAFT_RECEIPT, PRO_FORMA_INVOICE, ABORT, CANCELLATION, CORRECTION, ENRICHMENT,
PROOF_OF_PAYMENT.

**Key requirements (all spec-verified):**
- **Document numbers/series are TAXPAYER-generated** (`DocumentIdentifier`
  `^[0-9A-Z_/\-\.]{1,20}$` — no spaces). fiskaly never assigns numbers.
- **All money/quantity values are decimal STRINGS** (`Decimal12p8`).
- RECEIPT/INVOICE both require `document`, `entries`, `breakdown`, `totals`, `payments`
  (INVOICE also `recipients`). `totals` = `{vat:{amount,exclusive,inclusive}}` (an OBJECT —
  2026-06-01 replaced `document.total_vat`).
- Entries: `{type:"SALE"|"RETURN", data:{type:"ITEM", text, unit:{quantity,
  price:{inclusive,exclusive}}, value:{base}, vat}, details:{concept:"GOOD"|"SERVICE"}}`.
  `vat` = `{type:"VAT_RATE", code, percentage, amount, exclusive, inclusive}` or
  `{type:"VAT_EXEMPTION", code, reason?}`.
- VAT rate codes: `STANDARD`, `REDUCED_1..11` (region mapping in fiskaly support article —
  ⚠️ our 23→STANDARD / 13→REDUCED_1 / 6→REDUCED_2 mainland mapping is ASSUMED, see §6).
  Exemptions: `NOT_SUBJECT`, `NOT_TAXABLE`, `CAUSE_1..31` (map to PT M-codes; spec example:
  CAUSE_8 = M10).
- Payments: typed `CASH|CARD|ONLINE|OTHER|OUTSTANDING|VOUCHER`; CARD **requires** masked PAN +
  kind (we send OTHER("CARD") — open question §6). `details.amount` string.
- INVOICE recipients: CONSUMER requires `name` (PersonName: gender/forename/surname) +
  `address` (object: line/code/city/country); BUSINESS requires legal `name` + `address` +
  `identification:{type:"VAT",number}`.
- RECEIPT `customer`: `{type:"EXTERNAL"|"INTERNAL", code≤128}` (buyer NIF travels here).

## 4. Response contract (spec-verified; runtime values never observed)

Envelope `{content: Record}` where Record = `{id, type, state, mode, system, journal, file,
operation?, compliance?, transmission?, logs?, …}`:
- **`state`: ACCEPTED | REJECTED | COMPLETED | FAILED — a REJECTED/FAILED record still returns
  HTTP 200.** Success must check state. `mode`: PROCESSING | FINISHED.
- **`compliance`** (printed elements): **`data` = ATCUD** (required within compliance;
  Portaria 195/2020), `qr_code` (payload string ≤256 — we render the QR), `signature_hash`
  (the printed 4 chars from signature positions 1/11/21/31), `software_certificate` (AT cert
  number — the value we've never seen, B5), `sequence {number, signature, type, record}`,
  `url`, `artifact`. All optional except `data` — parse defensively.
- **`journal`**: `{signature, signed_at, record}` — the hash chain.
- `transmission {request, response}`: base64 AT web-service exchange; empty response =
  transmission error (see `logs`).

## 5. SAF-T (PT)

`POST /files` `{content:{type:"AUDIT", range:{from,to}, taxpayer:{id}? | system:{id}?}}` —
Portaria 302/2016 Annex I (1.04_01). Range must be in an already-ended month. File lifecycle
`ACCEPTED→COMPLETED|FAILED` / `PROCESSING→FINISHED`; **no `GET /files/{id}`** — poll the
`GET /files` list (filters: `system_id`, `taxpayer_id`, `type`, created range). Download:
stream `artifact.path` (e.g. `/files/<uuidv7>.zip`) — **a ZIP**, with a `.jws` integrity file.
The legacy `GET /taxpayers/{id}/exports/saft?period=` endpoint never existed.

## 6. ⚠️ Still unverified (runtime) — blocking questions for the first live TEST pass

SIGN PT is **not enabled on org group1**, so none of this has run authenticated:
1. Actual ATCUD/QR/signature_hash values and fiskaly's real `software_certificate` number
   (B5/B14: fiskaly is absent from the AT public register — LIVE stays blocked regardless).
2. VAT-rate code mapping (23/13/6 → STANDARD/REDUCED_1/REDUCED_2) — confirm against the
   fiskaly support article + a TEST issuance.
3. Exemption-code mapping M-codes ↔ CAUSE_n (settings currently must hold the fiskaly enum
   value directly; the issuer rejects anything else).
4. PROCESSING→FINISHED timing (our bounded re-read loop), and whether an INTENTION can be
   referenced by a TRANSACTION while still PROCESSING.
5. Cent-rounding tolerance between Σ(entry values) and totals; document-number format
   conventions (we send `SERIES/SEQ` ≤20 chars, series also sent separately).
6. Card payments without PAN: is OTHER("CARD") acceptable, and how does it map into SAF-T
   PaymentMechanism? (CARD type requires a masked PAN the POS never sees.)
7. How series registration with AT works (automatic on first use vs explicit) and where the
   taxpayer's reporting mode (real-time web services vs monthly SAF-T) is configured.
8. Whether PT LIVE is truly GA: changelog says "enabled for productive use" but the fiskaly
   status page has no SIGN PT component and live access says "contact sales".
9. `POST /files` declares NO `X-Idempotency-Key` parameter (unlike `/tokens` and `/records`)
   — create-replay is not guaranteed. The proxy therefore lists existing AUDIT files and
   reuses a range match before creating; whether fiskaly nevertheless honors the key is
   unverified.
10. `value.discount` semantics (VAT-inclusive vs -exclusive) — we send the VAT-exclusive
    line-discount amount so `qty × price.exclusive − discount ≈ base`.
11. Recipient `address.line` must be a `{type:"STREET_NUMBER", street, number}` object; our
    customers store one free-text line, so the client splits heuristically (trailing token
    starting with a digit = door number, else `S/N`). Whether fiskaly/AT accept `S/N` is
    unverified.
12. Legacy-client numbering is Dexie-durable and SINGLE-TILL only: a wiped browser profile or
    a second till on the same systemId/series restarts/collides the correlative series —
    multi-till PT issuance must use `pos-checkout` (server-allocated numbers). Retry behavior:
    an IDENTICAL re-run reuses the open attempt's checkoutId (fiskaly replays the record —
    no duplicate); a DIFFERENT sale skips the possibly-burned number (series gap, loudly
    chosen over a duplicate number).
13. Exempt (0%) items require `fiscal.fiskaly.exemptTax.code` to already hold a fiskaly enum
    value (`NOT_SUBJECT`/`NOT_TAXABLE`/`CAUSE_n`); the issuer rejects anything else (e.g. the
    default `M99`) with a loud error, and the fiskaly settings card has NO dedicated
    exempt-code input yet — the value must be set via stored settings until that UI exists.
14. Global discounts are NOT distributed into per-line draft values, so the issuer loudly
    blocks any sale with a global discount rather than emit a record whose totals overstate
    the charged amount. Line discounts are fine.

## 7. What was fixed in code (2026-07-19)

- `supabase/functions/pos-checkout/index.ts`: response parsing corrected to the verified paths
  (ATCUD `compliance.data`, QR `compliance.qr_code`, printed hash `compliance.signature_hash`),
  REJECTED/FAILED-on-200 handling, device-level `fiskaly_system_id_<env>` instead of the
  taxpayer-id placeholder, spec-shape payload validation before number allocation, INVOICE
  requires client-built recipients (no more fabricated schema-invalid ones).
- `supabase/functions/fiskaly-fiscal/index.ts` (legacy proxy, deletion still planned at D30):
  full transport rewrite — the previous auth body/token path/endpoints were fictional (SIGN DE
  shapes). Now: verified auth, idempotent INTENTION→TRANSACTION, state checks, real SAF-T
  AUDIT-file flow.
- `src/fiscal/fiskalyFiscalIssuer.ts`: builds spec-valid RECEIPT/INVOICE operations (string
  decimals, typed entries/payments/breakdown/totals), client-generated document numbers
  (series label + Dexie last-sequential per chain scope), verified response mapping.
- `local_at` remains the Portugal primary issuer (B14 unchanged); this pass makes the parked
  fiskaly path contract-correct, not production-ready.
- Post-fix adversarial review (31 agents: 4 lenses + per-finding verification; 26 confirmed
  findings, 3 critical) applied same day: spec-invalid `product` (SKU oneOf variant) and
  `address.line` (STREET_NUMBER object) shapes fixed; PROCESSING/incomplete records are now
  FAILED instead of persisted as issued (server + client demand ATCUD+QR+signature_hash);
  retries reuse the reserved number on any prior attempt (pending OR failed) so the
  deterministic idempotency keys replay instead of 422ing; the client converges identical
  retries onto the same checkoutId via the attempt ledger; entries/breakdown/totals are
  cent-consistent by construction; global discounts loudly blocked; `/files` create-replay
  assumption removed (list-and-reuse first); empty cashier labels guarded (PersonLabel
  minLength 1).
