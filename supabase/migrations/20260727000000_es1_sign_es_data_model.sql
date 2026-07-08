-- =====================================================================
-- ES-1 — Spain / SIGN ES data model (docs/fiskaly-strategy-brief.md; contract facts from
-- docs/es-sign-contract-capture.md, ES-0 2026-07-08).
--
-- Scope: additive server schema for a second-country fiscal issuer. Portugal (local_at)
-- untouched. ES tax RATES need no server change (products.iva_rate is a generic
-- NUMERIC(5,4) 0..1) — the PT-typed rate list is client UI (ES-3). Recargo de
-- equivalencia is LOUDLY DEFERRED (register D-ES1): one-rate-per-product cannot express
-- the per-line surcharge; SIGN ES supports it at issuance via additional_vat when needed.
--
-- NO explicit BEGIN/COMMIT (db push wraps each migration in one transaction).
-- =====================================================================

-- (1) tenants.nif — was CHECK (nif ~ '^[0-9]{9}$') (PT-only; rejects Spanish alphanumeric
-- NIF/CIF/NIE). Replace with a country-aware rule. The original CHECK was inline/unnamed
-- (auto-named) — drop it by definition lookup, not by guessed name.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.tenants'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%nif%'
  LOOP
    EXECUTE format('ALTER TABLE public.tenants DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.tenants ADD CONSTRAINT tenants_nif_format CHECK (
     (country = 'PT' AND nif ~ '^[0-9]{9}$')                     -- PT: 9 digits
  OR (country = 'ES' AND nif ~ '^[A-Z0-9]{9}$')                  -- ES: DNI/NIE/CIF, 9 alnum
  OR (country NOT IN ('PT','ES') AND nif ~ '^[A-Z0-9]{6,20}$')   -- future countries: sane bound
);
-- country hygiene: ISO 3166-1 alpha-2 (existing rows are 'PT' via the column default)
ALTER TABLE public.tenants ADD CONSTRAINT tenants_country_format CHECK (country ~ '^[A-Z]{2}$');

COMMENT ON COLUMN public.tenants.nif IS
  'Tax id, format enforced per tenants.country (PT: 9 digits; ES: 9 alnum NIF/CIF/NIE). One legal entity/NIF per tenant.';

-- (2) tenant_fiscal_config — allow the new issuer + hold the per-(tenant, environment)
-- SIGN ES resource ids. ES-0 facts: each merchant = ONE fiskaly MANAGED ORGANIZATION
-- (taxpayer is org-scoped + effectively immutable once resources are enabled); v1 uses one
-- shared signer per tenant/env; clients are per-till (devices columns below). The managed
-- org''s api key/secret live in tenant_fiscal_secrets.fiskaly_api_key/secret (shape fits).
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.tenant_fiscal_config'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%issuer%'
  LOOP
    EXECUTE format('ALTER TABLE public.tenant_fiscal_config DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.tenant_fiscal_config ADD CONSTRAINT tenant_fiscal_config_issuer_check
  CHECK (issuer IN ('fiskaly','vendus','invoicexpress','local_at','sign_es'));

ALTER TABLE public.tenant_fiscal_config ADD COLUMN IF NOT EXISTS sign_es_org_id    text;
ALTER TABLE public.tenant_fiscal_config ADD COLUMN IF NOT EXISTS sign_es_signer_id uuid;

COMMENT ON COLUMN public.tenant_fiscal_config.sign_es_org_id IS
  'fiskaly MANAGED organization id for this tenant+environment (SIGN ES). Merchant NIF is immutable within it.';
COMMENT ON COLUMN public.tenant_fiscal_config.sign_es_signer_id IS
  'SIGN ES signer (signing device, fiskaly-managed cert). v1: one shared signer per tenant+environment.';

-- (3) devices — one SIGN ES client per till (mirrors fiskaly_system_id_test/live). We
-- generate these UUIDs (PUT /clients/{id} is create-by-id).
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS sign_es_client_id_test uuid;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS sign_es_client_id_live uuid;

-- (4) fiscal_documents — queryable ES compliance columns (raw record stays in
-- signed_payload). Two SIGN ES state machines observed in ES-0:
--   registration: PENDING → REGISTERED | STORED | REQUIRES_CORRECTION | REQUIRES_INSPECTION | INVALID
--   cancellation: NOT_CANCELLED → PENDING → CANCELLED | REQUIRES_INSPECTION
-- Rejections arrive ASYNC (HTTP 200 at issue; verdict by polling) — the reconciliation
-- sweep drives PENDING rows to a final state and stores AEAT validations in signed_payload.
ALTER TABLE public.fiscal_documents ADD COLUMN IF NOT EXISTS verifactu_registration text
  CHECK (verifactu_registration IS NULL OR verifactu_registration IN
    ('PENDING','REGISTERED','STORED','REQUIRES_CORRECTION','REQUIRES_INSPECTION','INVALID'));
ALTER TABLE public.fiscal_documents ADD COLUMN IF NOT EXISTS verifactu_cancellation text
  CHECK (verifactu_cancellation IS NULL OR verifactu_cancellation IN
    ('NOT_CANCELLED','PENDING','CANCELLED','REQUIRES_INSPECTION'));
ALTER TABLE public.fiscal_documents ADD COLUMN IF NOT EXISTS invoice_kind text
  CHECK (invoice_kind IS NULL OR invoice_kind IN
    ('SIMPLIFIED','COMPLETE','CORRECTING','REMEDY','ENRICHMENT','EXTERNAL'));
ALTER TABLE public.fiscal_documents ADD COLUMN IF NOT EXISTS aeat_validation_url text;
ALTER TABLE public.fiscal_documents ADD COLUMN IF NOT EXISTS compliance_legend  text;

COMMENT ON COLUMN public.fiscal_documents.verifactu_registration IS
  'SIGN ES transmission.registration (async AEAT verdict; NULL for non-ES documents).';
COMMENT ON COLUMN public.fiscal_documents.aeat_validation_url IS
  'AEAT ValidarQR URL returned in the SIGN ES compliance block (QR target).';

-- Reconciliation sweep index: the poller scans tenant-scoped PENDING rows.
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_verifactu_pending
  ON public.fiscal_documents (tenant_id, created_at)
  WHERE verifactu_registration = 'PENDING';
