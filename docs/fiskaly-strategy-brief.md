# Fiscal Integration Strategy Brief — fiskaly (2026-07-06 email, Eduardo Jacobo)

## What the email changes

- Spain is the urgent track: SIGN ES (test/live.es.sign.fiskaly.com) — enabled on org group1, TEST auth already verified.
- Portugal + Belgium route via the "API UNIFICADA" (UAPI). Research reconciles the naming: SIGN PT IS the UAPI's Portugal service (launched 2026-05-21 on api.fiskaly.com) — "UAPI, not SIGN PT" was naming confusion, not a dead product. **Re-verified 2026-07-19 (B16): "SIGN PT" is the official product name (fiskaly.com/signpt, spec `info.title`), delivered on the shared unified hosts `test/live.api.fiskaly.com`.**
- Consequence: the existing `pos-checkout` edge fn already targets the right host family for PT (test/live.api.fiskaly.com, X-Api-Version 2026-06-01) but stays parked (SIGN PT not enabled on our account). **2026-07-19: the full PT contract — request AND response — is now schema-verified from the official OpenAPI and all PT fiskaly code was fixed to it (`docs/fiskaly-pt-contract-capture.md`); only runtime values remain unverified.** ES needs a net-new integration — different host, auth shape (`content.access_token.bearer`), and resource model (taxpayer → signer → client → invoices).
- Belgium today = E-INVOICE BE only (Peppol B2B, Beta). No POS/cash-register fiscalization product exists for BE.
- Portugal stays on the working `local_at` path (REGISTER B14) — see Section 3 for why switching is blocked anyway.

## Spain / SIGN ES: what we know

**API contract (verified against OpenAPI v1.24.2, saved at /tmp/signes-oas.yaml):**
- Auth: POST /auth with `{content:{api_key,api_secret}}` → token at `content.access_token.bearer` (matches our probe); env baked into the key (TEST/LIVE).
- Provisioning, once per merchant (= one fiskaly managed organization per taxpayer/NIF): PUT /taxpayer (legal_name + Spanish NIF + `territory`) → social-collaboration agreement (Verifactu territories: POST draft, legal rep signs PAdES, PUT upload — this is what lets fiskaly submit to AEAT so merchants need no own certificate) → PUT /signers/{uuid} (empty body = fiskaly-managed cert; idempotent) → PUT /clients/{uuid} (one per POS terminal; idempotent). GET /software is read-only (fiskaly IS the registered software) and 409s until a taxpayer exists — matches our blank-org probe. Taxpayer data is effectively immutable (amendment = new managed org).
- Issuance: PUT /clients/{cid}/invoices/{iid} with client-generated UUIDv4. Types SIMPLIFIED | COMPLETE | CORRECTING | ENRICHMENT | REMEDY | EXTERNAL | DRAFT. We assign `number` (≤20 chars, correlative per series, one series per POS recommended) — so `allocate_fiscal_number` is reusable. All money/qty/rate fields are decimal STRINGS, never JSON numbers; sum of item `full_amount`s must equal invoice `full_amount`. Each line carries a `system` VAT-regime discriminator (25 values; REGULAR default, rate "21.0"; recargo de equivalencia via `additional_vat`).
- Response: compliance block with AEAT QR (base64 PNG or SVG), validation URL, and the mandatory printed legend; hash chaining is internal to fiskaly (per-taxpayer for Verifactu). AEAT registration is ASYNC: `transmission.registration` starts PENDING, batched (~60–70 s), poll-only — no webhooks in the API. Authority rejections are NOT HTTP errors: HTTP 200 then PENDING → REQUIRES_CORRECTION / REQUIRES_INSPECTION + `validations[]`.
- Corrections: PATCH state CANCELLED (anulación, narrow legal cases only); CORRECTING (rectificativa, SUBSTITUTION/DIFFERENCES, codes CORRECTION_1..4 ≈ AEAT R1–R4); REMEDY re-issues same number to fix rejected transmissions. Numbers are never reused.
- TEST vs LIVE: same contract; LIVE is sales-enabled per organization; TEST resources never migrate; AEAT TIN validation stubbed in TEST (magic NIFs T00000001–T00000004); Verifactu TEST URLs point at AEAT preproduction.

**Regulatory (Spain):**
- Taxpayer deadlines postponed by RDL 15/2025 (convalidated): 2027-01-01 (corporate-tax payers), 2027-07-01 (autónomos and others). No end customer is obliged today — we have runway.
- BUT the software vendor deadline passed 2025-07-29: selling a non-adapted SIF into common-territory Spain exposes us to art 201 bis LGT fines (150,000 EUR/year/system type; 1,000 EUR/system sold; 50,000 EUR/year user-side). We also owe our own declaración responsable as the POS-layer producer (multi-component SIFs: each producer certifies its own component) alongside fiskaly's.
- Territory routing: SIGN ES covers Verifactu (mainland/Canarias/Ceuta/Melilla) AND TicketBAI (Araba/Bizkaia/Gipuzkoa — already fully in force; Bizkaia via Batuz/LROE) keyed on `taxpayer.territory`. Navarre is neither; support status unclear.
- Receipt duties on us: print fiskaly-returned QR (30x30–40x40 mm, ISO 18004) + VERI*FACTU legend on every invoice including simplificadas (≤400 EUR general / ≤3,000 EUR retail+hospitality); "add buyer NIF → COMPLETE invoice" flow needed on demand.

**Uncertain (flagged by research):**
- Retry semantics of PUT invoice with same UUID after timeout (409 vs echo) — inferred dedupe-safe; verify empirically in TEST before building the retry loop.
- Whether LIVE gates issuance on the uploaded social-collaboration agreement (docs say required, no API gate stated).
- 429 "concurrent use" scope (per client / signer / taxpayer) — determines how much we serialize across tills.
- Whether TEST round-trips to real AEAT preprod (true REGISTERED states) or is simulated.
- Bizkaia: does SIGN ES cover full Batuz/LROE bookkeeping or only invoice files?
- Number-gap tolerance under correlative numbering when issuance fails after `allocate_fiscal_number` burns a number.

## Portugal + Belgium / UAPI: what we know

**Availability verdict: product-live, legally unverifiable, account-blocked.**
- The UAPI is real and public: base test/live.api.fiskaly.com, docs at workspace.fiskaly.com, JWT via POST /tokens, mandatory X-Api-Version + X-Idempotency-Key headers, resource model taxpayers/locations/systems/records. SIGN PT (= the UAPI Portugal service) launched 2026-05-21, "enabled for productive use" per version 2026-06-01: series+ATCUD, signing/chaining, QR, SAF-T (PT) 1.04_01, AT web services. Transport guides "coming soon"; QES mandatory 2027-01-01.
- **Critical verified negative:** the AT's official register of certified invoicing programs (current through cert #3095, 2026-06-15) contains NO entry matching "fiskaly" — while competitor fiskaltrust holds cert #3083 and positive controls (Vendus, Cegid, Moloni) all appear. Portaria 363/2010 requires the AT certificate number printed on every document. fiskaly's marketing says "AT-certified" but never states a number. Legal production issuance in PT via fiskaly today rests on an unverifiable claim.
- Account blocker: SIGN PT is visible but not enabled on org group1; enabling requires fiskaly action (terms/lead time unknown).
- Belgium: E-INVOICE BE only (Peppol B2B e-invoicing + 10-year archiving, Beta). No GKS/POS fiscalization product — Belgium POS fiscalization via fiskaly is not currently possible.

**Implication:** `local_at` remains the Portugal issuer (confirms REGISTER B14). Switch preconditions, in order: (1) fiskaly provides its AT certificate number in writing and we verify it in the register; (2) SIGN PT enabled on our account; (3) an ES-0-style contract-verification pass against TEST — **the schema-level contract is verified as of 2026-07-19 (B16) and the code matches it, but runtime values (real ATCUD/QR, VAT-code mapping, timing) still need one live TEST issuance.** (1) and (2) not met today. Belgium is parked entirely.

## Recommended sequence

Portugal keeps `local_at` untouched throughout; all ES work is additive via the existing issuer dispatch (checkoutOrchestrator + tenant_fiscal_config), not a refactor.

- **ES-0 — Contract verification (S).** No product code. Script the TEST provisioning of our blank ES org (taxpayer → signer → client), issue ONE SIMPLIFIED invoice, poll to a final transmission state, capture real request/response (QR, legend text, validations, timing), and empirically test same-UUID retry + a CORRECTING invoice. Artifact: a provisioning + smoke script (e.g. `scripts/es-sign-provision.ts`) and the captured contract. *Blocking dependency: founder supplies realistic Spanish taxpayer data (legal name, NIF, territory) for TEST.*
- **ES-1 — Data model (M).** Migrations: relax `tenants.nif` CHECK (currently `^[0-9]{9}$`, rejects Spanish NIF/CIF); add `country` + `'sign_es'` issuer value + ES resource-id columns (taxpayer_id/signer_id/client_id) to tenant_fiscal_config; ES tax rates (21/10/4/0 (+5/2/7.5 etc. as needed) and a recargo decision, see Section 5) on products; ES compliance columns on fiscal_documents (AEAT transmission state, invoice type, QR URL). *No external dependency; shaped by ES-0 output.*
- **ES-2 — Server issuer (M–L).** New `pos-checkout-es` edge function (SIGN ES surface; REGISTER D11 already ruled out reusing pos-checkout) reusing verbatim: session→tenant/device derivation, fiscal_issue_attempts idempotency ledger, allocate_fiscal_number, fiscal_documents persistence. Plus async transmission-state polling/reconciliation (PENDING → final) and a per-tenant provisioning script for TEST+LIVE trees. *Blocked on ES-0 captured contract.*
- **ES-3 — Till/PWA surface (M).** Issuer union + settings gating; ES tax entry UI; ThermalReceipt country branch (AEAT QR + VERI*FACTU legend, drop ATCUD/"/AT" legend for ES tenants); add 'es' receipt language; "add buyer NIF → COMPLETE invoice" flow. *Blocked on ES-2.*
- **ES-4 — Rectificativas + operations (M).** CORRECTING branch in creditNoteCheckout dispatch (replaces PT NC semantics), cancellation/anulación, REMEDY handling for REQUIRES_CORRECTION/INSPECTION, /exports retrieval. **DEFERRED-eligible for ES v1 only with a loud REGISTER entry** per project policy.
- **ES-LIVE gate (external).** fiskaly sales enablement of LIVE for the merchant org + signed social-collaboration agreement uploaded + our own declaración responsable published (vendor deadline already passed — this is a legal precondition to selling into Spain, not a nice-to-have).
- **PT/UAPI track — parked (code now contract-correct).** As of 2026-07-19 (B16) every PT fiskaly path (`pos-checkout`, legacy `fiskaly-fiscal` proxy, client issuer) matches the schema-verified SIGN PT contract. Reopen only when fiskaly's AT certificate number is verified in the register AND SIGN PT is enabled on our account; then run a PT equivalent of ES-0 (live TEST issuance) to close the runtime unknowns in `docs/fiskaly-pt-contract-capture.md` §6. Belgium: no action possible.

## Decisions needed from the founder

- Confirm `local_at` remains the Portugal primary issuer indefinitely (recommended: yes, given the unverifiable AT certification).
- ES v1 territory scope: Verifactu-only (mainland/Canarias/Ceuta/Melilla) vs also Basque TicketBAI/Batuz territories; Navarre explicitly out?
- Real(istic) Spanish taxpayer data for TEST provisioning (legal name, NIF, territory, address) — and later, which real merchant goes first on LIVE.
- Rectificativas (ES-4) in v1 or loud registered deferral?
- Does the target ES customer base include retailers under recargo de equivalencia? (Decides whether the one-rate-per-product tax model must be extended in ES-1 or deferred.)
- Who drafts/owns our declaración responsable as POS-layer producer (legal review needed; it must be available in-app and pre-sale)?
- Commercial: proceed with fiskaly for ES LIVE enablement now, and ask for SIGN PT enablement on org group1 anyway (cheap optionality)?
- Belgium: park entirely, or pursue E-INVOICE BE for B2B e-invoicing as a separate product decision?
- Confirm tenancy grain: no tenant operates stores in two countries (one legal entity / one NIF per tenant) — decides tenant-level vs store-level country.

## Open questions for fiskaly (email-ready)

1. EN: For SIGN PT, what is your AT-issued software certificate number under Portaria 363/2010, and under which legal entity and program name is it registered? We could not find any "fiskaly" entry in the AT public register (current through cert #3095).
   ES: Para SIGN PT, ¿cuál es su número de certificado de software emitido por la AT según la Portaria 363/2010, y bajo qué entidad legal y nombre de programa está registrado? No encontramos ninguna entrada "fiskaly" en el registro público de la AT (actualizado hasta el cert. n.º 3095).
2. EN: What is the process, commercial terms, and lead time to enable SIGN PT on our existing account (org group1), and is SIGN PT LIVE already open to customers in production?
   ES: ¿Cuál es el proceso, las condiciones comerciales y el plazo para activar SIGN PT en nuestra cuenta existente (org group1)? ¿Está SIGN PT LIVE ya disponible para clientes en producción?
3. EN: In SIGN ES LIVE, is Verifactu invoice issuance blocked at the API level until the signed social-collaboration agreement is uploaded, or does it only affect legal validity?
   ES: En SIGN ES LIVE, ¿la emisión de facturas Verifactu está bloqueada a nivel de API hasta que se suba el acuerdo de colaboración social firmado, o solo afecta a la validez legal?
4. EN: What is the process and lead time to enable SIGN ES LIVE for our merchants' managed organizations?
   ES: ¿Cuál es el proceso y el plazo para activar SIGN ES LIVE para las organizaciones gestionadas de nuestros comercios?
5. EN: Are webhooks/event notifications available anywhere (Management API, HUB) for invoice transmission-state changes, or is polling GET invoice the only mechanism?
   ES: ¿Existen webhooks/notificaciones de eventos (Management API, HUB) para los cambios de estado de transmisión de facturas, o el único mecanismo es consultar GET invoice (polling)?
6. EN: What is the scope of the 429 "concurrent use of resource" error — per client, per signer, or per taxpayer? We need this to decide how strictly to serialize issuance across multiple tills of one merchant.
   ES: ¿Cuál es el alcance del error 429 "uso concurrente del recurso": por client, por signer o por taxpayer? Lo necesitamos para decidir cómo serializar la emisión entre varios TPV de un mismo comercio.
7. EN: For Bizkaia taxpayers, does SIGN ES cover the full Batuz/LROE obligations (models 240/140, all relevant chapters), or only the TicketBAI invoice files?
   ES: Para contribuyentes de Bizkaia, ¿cubre SIGN ES todas las obligaciones Batuz/LROE (modelos 240/140, todos los capítulos relevantes), o solo los ficheros TicketBAI?
8. EN: What is the current production status of the NAVARRE territory in SIGN ES?
   ES: ¿Cuál es el estado actual en producción del territorio NAVARRE en SIGN ES?
9. EN: Do you publish a component declaración responsable for SIGN ES and integrator guidance for the multi-component split, given each producer must certify its own component?
   ES: ¿Publican una declaración responsable de componente para SIGN ES y una guía para integradores sobre el reparto multi-componente, dado que cada productor debe certificar su propio componente?
10. EN: Is any Belgium POS/cash-register fiscalization product (e.g. GKS 2.0) on the roadmap, or is Belgium e-invoicing-only (E-INVOICE BE) for the foreseeable future?
    ES: ¿Tienen en el roadmap algún producto de fiscalización de TPV/caja para Bélgica (p. ej. GKS 2.0), o Bélgica seguirá siendo solo facturación electrónica (E-INVOICE BE) en el futuro previsible?
