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
