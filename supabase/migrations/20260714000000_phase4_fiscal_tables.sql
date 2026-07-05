-- =====================================================================
-- PHASE 4 — PER-TENANT FISCAL DATA MODEL (fiskaly-first)
--
-- Net-new tables. Tenant-scoped RLS consistent with Phase 3 (authenticated ->
-- own tenant only; anon no policy -> denied; SECURITY DEFINER / service_role
-- bypass and self-enforce). tenant_fiscal_secrets is ZERO client access (RLS
-- on, no policy) — same posture as employee_credentials.
--
-- CAVEAT: tenant_fiscal_secrets stores the fiskaly api_key/secret + AT subuser
-- creds as plaintext columns reachable only by service_role / SECURITY DEFINER.
-- The plan (§4.6) calls for Vault (pgsodium) encryption-at-rest; that is a
-- follow-up — this table is the structural home, access-locked but not yet
-- encrypted at rest. Do NOT expose it through any client policy, ever.
--
-- NO explicit BEGIN/COMMIT — db push wraps each migration in a transaction.
-- =====================================================================

-- Per-tenant, per-environment fiscal configuration (non-secret) --------
CREATE TABLE IF NOT EXISTS public.tenant_fiscal_config (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES public.tenants(id),
  environment            text NOT NULL CHECK (environment IN ('test','live')),
  issuer                 text NOT NULL DEFAULT 'fiskaly'
                            CHECK (issuer IN ('fiskaly','vendus','invoicexpress','local_at')),
  fiskaly_organization_id text,          -- UNIT id (one per tenant per env)
  fiskaly_taxpayer_id     text,
  reporting_mode          text,          -- real-time (WFA) vs monthly SAF-T; UNVERIFIED where set (§13)
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, environment)
);
CREATE INDEX IF NOT EXISTS idx_tenant_fiscal_config_tenant ON public.tenant_fiscal_config(tenant_id);

-- Per-tenant fiskaly + AT credentials — ZERO client access ------------
CREATE TABLE IF NOT EXISTS public.tenant_fiscal_secrets (
  tenant_id            uuid NOT NULL REFERENCES public.tenants(id),
  environment          text NOT NULL CHECK (environment IN ('test','live')),
  fiskaly_api_key      text,
  fiskaly_api_secret   text,
  at_subuser           text,             -- Portal das Finanças WSE subuser (<NIF>/<n>)
  at_subuser_password  text,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, environment)
);

-- Per (tenant, environment, series, doc_type) document series ---------
CREATE TABLE IF NOT EXISTS public.fiscal_series (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id),
  store_id       uuid,
  device_id      uuid,
  environment    text NOT NULL CHECK (environment IN ('test','live')),
  doc_type       text NOT NULL,          -- FS, FT, FR, NC, ND, RG, RC, GT, GR
  series         text NOT NULL,          -- e.g. FS-T01-2026
  atcud          text,                   -- ATCUD validation code (from AT via fiskaly)
  current_number bigint NOT NULL DEFAULT 0,
  year           int,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, environment, doc_type, series)
);
CREATE INDEX IF NOT EXISTS idx_fiscal_series_tenant ON public.fiscal_series(tenant_id);

-- 10-year immutable fiscal archive (server = evidence store) ----------
CREATE TABLE IF NOT EXISTS public.fiscal_documents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES public.tenants(id),
  store_id             uuid,
  device_id            uuid,
  transaction_id       uuid,
  environment          text NOT NULL CHECK (environment IN ('test','live')),
  is_training          boolean NOT NULL DEFAULT false,
  doc_type             text NOT NULL,
  series               text,
  number               text,
  atcud                text,
  fiskaly_record_id    text,
  hash                 text,
  qr_data              text,
  software_certificate text,             -- "Processado por programa certificado n.º NNNN/AT"
  signed_payload       jsonb NOT NULL DEFAULT '{}',
  status               text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','cancelled')),
  cancelled_at         timestamptz,
  cancelled_reason     text,
  cancelled_by         uuid,
  issued_at            timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_tenant_issued ON public.fiscal_documents(tenant_id, issued_at);
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_transaction ON public.fiscal_documents(transaction_id);

-- Idempotency ledger: fiskaly<->Postgres can never silently diverge ---
CREATE TABLE IF NOT EXISTS public.fiscal_issue_attempts (
  checkout_id        uuid PRIMARY KEY,   -- client-generated idempotency key
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id),
  device_id          uuid,
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','issued','failed')),
  fiskaly_record_id  text,
  fiscal_document_id uuid REFERENCES public.fiscal_documents(id),
  error              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fiscal_issue_attempts_tenant ON public.fiscal_issue_attempts(tenant_id);

-- Append-only fiscal audit --------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_audit_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id),
  event_type text NOT NULL,              -- KEY_ROTATED, CANCELLATION, SERIES_REGISTERED, ...
  payload    jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fiscal_audit_events_tenant ON public.fiscal_audit_events(tenant_id);

-- ---------------------------------------------------------------------
-- RLS: tenant-scoped read for authenticated; secrets = zero access.
-- Writes go through service_role / SECURITY DEFINER (bypass RLS).
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
  read_tables text[] := ARRAY['tenant_fiscal_config','fiscal_series','fiscal_documents','fiscal_issue_attempts','fiscal_audit_events'];
BEGIN
  FOREACH t IN ARRAY read_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id = app.tenant_id())', t||'_tenant_read', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- Secrets: RLS on, NO policy, no client grants -> only service_role / definer.
ALTER TABLE public.tenant_fiscal_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_fiscal_secrets FROM anon, authenticated;

GRANT ALL ON public.tenant_fiscal_config, public.tenant_fiscal_secrets, public.fiscal_series,
             public.fiscal_documents, public.fiscal_issue_attempts, public.fiscal_audit_events
  TO service_role;
