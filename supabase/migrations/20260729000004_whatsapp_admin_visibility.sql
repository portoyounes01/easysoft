-- =====================================================================
-- WhatsApp channel — admin visibility over connected numbers.
-- Owners/admins can SEE every WhatsApp number linked to THEIR tenant (so they
-- know exactly who is connected) and UNLINK one. Still tenant-scoped and
-- role-gated; managers/cashiers get nothing.
-- =====================================================================

-- Replace the "own rows only" read with tenant-wide read for owner/admin.
DROP POLICY IF EXISTS owner_whatsapp_numbers_self_read ON public.owner_whatsapp_numbers;
DROP POLICY IF EXISTS owner_whatsapp_numbers_admin_read ON public.owner_whatsapp_numbers;
CREATE POLICY owner_whatsapp_numbers_admin_read ON public.owner_whatsapp_numbers
  FOR SELECT TO authenticated
  USING (tenant_id = app.tenant_id() AND app.app_role() IN ('owner', 'admin'));

-- Owner/admin may unlink (delete) a number from their own tenant.
DROP POLICY IF EXISTS owner_whatsapp_numbers_admin_delete ON public.owner_whatsapp_numbers;
CREATE POLICY owner_whatsapp_numbers_admin_delete ON public.owner_whatsapp_numbers
  FOR DELETE TO authenticated
  USING (tenant_id = app.tenant_id() AND app.app_role() IN ('owner', 'admin'));

-- Privileges: this repo grants clients per-table EXPLICITLY (default privileges
-- are service_role-only since 20260709), so without these the policies above are
-- unreachable — the linked-number list and unlink 42501 for every client.
-- The RLS policies do the actual row gating; anon gets nothing.
REVOKE ALL ON public.owner_whatsapp_numbers FROM anon;
GRANT SELECT, DELETE ON public.owner_whatsapp_numbers TO authenticated;
