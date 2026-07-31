-- =====================================================================
-- AI ASSISTANT — Phase 2: WhatsApp channel — phone registry + pairing
--
-- Maps a VERIFIED WhatsApp number to an owner + tenant, so an inbound WhatsApp
-- message can be scoped to exactly one business. Binding is proven by a pairing
-- code the owner generates in-app and then sends FROM their WhatsApp (mirrors
-- the device_pairing_codes hash+TTL+single-use+attempt-cap pattern). Unknown
-- numbers are refused by the webhook. Both tables are backend-only (service
-- role); the in-app owner can read their OWN linked-number status.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Verified number -> owner/tenant. phone_e164 is the PK so a number maps to
-- exactly one business.
CREATE TABLE IF NOT EXISTS public.owner_whatsapp_numbers (
  phone_e164  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id),
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_owner_whatsapp_tenant ON public.owner_whatsapp_numbers(tenant_id);

-- Pending pairing codes: the raw code is never stored (sha256 only), expires,
-- single-use, attempt-capped.
CREATE TABLE IF NOT EXISTS public.owner_whatsapp_pairing_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash     text NOT NULL,
  user_id       uuid NOT NULL REFERENCES auth.users(id),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id),
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  attempt_count int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_pairing_code_hash ON public.owner_whatsapp_pairing_codes(code_hash);

-- --- RLS -------------------------------------------------------------------
ALTER TABLE public.owner_whatsapp_numbers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_whatsapp_pairing_codes  ENABLE ROW LEVEL SECURITY;

-- The in-app owner may READ their own linked-number status (to show "Linked: +351…").
DROP POLICY IF EXISTS owner_whatsapp_numbers_self_read ON public.owner_whatsapp_numbers;
CREATE POLICY owner_whatsapp_numbers_self_read ON public.owner_whatsapp_numbers
  FOR SELECT TO authenticated
  USING (tenant_id = app.tenant_id() AND user_id = auth.uid());
-- No client policy on pairing codes, and no write policy anywhere: the pairing
-- function and the webhook do all writes under service_role (bypasses RLS).

COMMENT ON TABLE public.owner_whatsapp_numbers IS
  'Verified WhatsApp number -> owner/tenant for the AI assistant WhatsApp channel (Phase 2).';
