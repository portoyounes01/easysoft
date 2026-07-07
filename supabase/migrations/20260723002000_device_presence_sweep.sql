-- =====================================================================
-- Notifications P3c — offline sweep + pg_cron (docs/pwa-notifications-plan.md P3c Step 3)
--
-- Per enrolled device, reads the tenant's alerts.offline{enabled,grace_seconds} and, when the
-- device has been silent past its grace period, flips presence -> offline and emits ONE
-- DEVICE_OFFLINE (warning). De-dup is the presence column itself (an already-offline device is
-- skipped), so exactly one alert per online->offline transition — DEVICE_OFFLINE is deliberately
-- EXCLUDED from uq_notif_once so a LATER outage can alert again. Worst-case latency ≈ grace + 60s.
-- Depends on pg_cron (asserted in the P3b dispatch migration). NO explicit BEGIN/COMMIT.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.sweep_device_presence()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d       record;
  cfg     jsonb;
  enabled boolean;
  grace   int;
BEGIN
  FOR d IN
    SELECT id, tenant_id, label, presence, last_seen_at
      FROM public.devices
     WHERE status = 'enrolled'
  LOOP
    cfg := app.tenant_setting(d.tenant_id, ARRAY['alerts','offline'], '{}'::jsonb);
    enabled := COALESCE((cfg->>'enabled')::boolean, false);
    IF NOT enabled THEN CONTINUE; END IF;
    grace := COALESCE(NULLIF(cfg->>'grace_seconds', '')::int, 300);

    IF d.presence IN ('online', 'unknown')
       AND d.last_seen_at IS NOT NULL
       AND d.last_seen_at < now() - make_interval(secs => grace) THEN
      UPDATE public.devices SET presence = 'offline', presence_changed_at = now() WHERE id = d.id;
      PERFORM app.emit_notification(d.tenant_id, NULL, d.id, 'DEVICE_OFFLINE', 'warning',
        NULL, 'devices', d.id,
        jsonb_build_object('device_name', d.label, 'last_seen_at', d.last_seen_at));
    END IF;
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.sweep_device_presence() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('device-presence-sweep')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'device-presence-sweep');
SELECT cron.schedule('device-presence-sweep', '* * * * *', $CRON$ SELECT public.sweep_device_presence(); $CRON$);
