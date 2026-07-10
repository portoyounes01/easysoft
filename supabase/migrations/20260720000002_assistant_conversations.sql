-- =====================================================================
-- AI ASSISTANT — conversation history + audit (Phase 1)
--
-- Tenant-scoped, RLS keyed on the JWT claim (app.tenant_id()), matching
-- 20260713000000_phase3_tenant_scoped_rls.sql. The edge function WRITES these
-- via service_role (bypasses RLS); the in-app client READS its own history
-- through the authenticated JWT (RLS confines to the caller's tenant).
--
-- GDPR: this is the owner's own data. Right-to-erasure = delete the tenant's
-- rows (service_role / admin); retention = purge via assistant_purge_history().
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.assistant_conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id),
  user_id    uuid REFERENCES auth.users(id),
  channel    text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'whatsapp')),
  title      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id),
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Audit: what was asked and which read tools ran (no tool RESULTS stored).
CREATE TABLE IF NOT EXISTS public.assistant_audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id),
  user_id    uuid REFERENCES auth.users(id),
  channel    text NOT NULL DEFAULT 'in_app',
  question   text,
  tools_used text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_tenant ON public.assistant_conversations(tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_conversation ON public.assistant_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_tenant ON public.assistant_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_assistant_audit_tenant ON public.assistant_audit_log(tenant_id, created_at DESC);

-- --- RLS: authenticated may READ only its own tenant's rows ------------------
ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_audit_log     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assistant_conversations_tenant_read ON public.assistant_conversations;
CREATE POLICY assistant_conversations_tenant_read ON public.assistant_conversations
  FOR SELECT TO authenticated USING (tenant_id = app.tenant_id());

DROP POLICY IF EXISTS assistant_messages_tenant_read ON public.assistant_messages;
CREATE POLICY assistant_messages_tenant_read ON public.assistant_messages
  FOR SELECT TO authenticated USING (tenant_id = app.tenant_id());

DROP POLICY IF EXISTS assistant_audit_tenant_read ON public.assistant_audit_log;
CREATE POLICY assistant_audit_tenant_read ON public.assistant_audit_log
  FOR SELECT TO authenticated USING (tenant_id = app.tenant_id());
-- No INSERT/UPDATE/DELETE policy for authenticated → denied. Writes are
-- performed by the edge function under service_role (bypasses RLS).

-- --- Retention purge (service_role) -----------------------------------------
CREATE OR REPLACE FUNCTION public.assistant_purge_history(p_days int DEFAULT 90)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.assistant_conversations
  WHERE updated_at < now() - make_interval(days => GREATEST(COALESCE(p_days, 90), 1));
  DELETE FROM public.assistant_audit_log
  WHERE created_at < now() - make_interval(days => GREATEST(COALESCE(p_days, 90), 1));
END;
$$;

REVOKE ALL ON FUNCTION public.assistant_purge_history(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_purge_history(int) TO service_role;

COMMENT ON TABLE public.assistant_conversations IS
  'AI assistant conversation threads. Tenant-scoped; owner''s own data. Retained per assistant_purge_history().';
