-- =====================================================================
-- Notifications P3c — device heartbeat RPC (docs/pwa-notifications-plan.md P3c Step 2)
--
-- Self-scoped + device-role gated: a till calls this ~every 60s to prove liveness. DEFINER so
-- it can update devices bypassing RLS, but it can ONLY touch its OWN row (id=app.device_id()
-- AND tenant_id=app.tenant_id() AND status='enrolled') — never a tenant-sibling. Humans are
-- authenticated too, so the fn hard-returns unless app_role()='device'. Recovery (DEVICE_ONLINE)
-- is emitted HERE (only offline->online), not by a trigger; first-boot unknown->online is silent.
-- NOT overloaded onto ping() (anon/shared, fires from the PWA connectivity singleton).
-- NO explicit BEGIN/COMMIT.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.device_heartbeat()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tenant uuid := app.tenant_id();
  v_device uuid := app.device_id();
  v_prev   text;
  v_label  text;
BEGIN
  IF app.app_role() IS DISTINCT FROM 'device' OR v_tenant IS NULL OR v_device IS NULL THEN
    RETURN; -- not a device session (or unclaimed): no-op
  END IF;

  SELECT presence, label INTO v_prev, v_label
    FROM public.devices
   WHERE id = v_device AND tenant_id = v_tenant AND status = 'enrolled'
   FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.devices
     SET last_seen_at = now(),
         presence = 'online',
         presence_changed_at = CASE WHEN presence <> 'online' THEN now() ELSE presence_changed_at END
   WHERE id = v_device AND tenant_id = v_tenant;

  -- Recovery notice ONLY when coming back from a detected outage (not first-boot unknown->online).
  IF v_prev = 'offline' THEN
    PERFORM app.emit_notification(v_tenant, NULL, v_device, 'DEVICE_ONLINE', 'info',
      NULL, 'devices', v_device, jsonb_build_object('device_name', v_label));
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.device_heartbeat() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.device_heartbeat() TO authenticated; -- device sessions are authenticated
