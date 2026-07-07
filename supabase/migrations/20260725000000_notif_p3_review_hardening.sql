-- =====================================================================
-- Notifications P3 — hardening from the adversarial review (2026-07-07).
-- Fixes: sweep grace-floor (D-N3 flap), sweep concurrency guard, push backstop retry bound,
-- and a last-owner-guarded member revoke used by revoke-human. NO explicit BEGIN/COMMIT.
-- =====================================================================

-- (1) sweep_device_presence: floor grace so a misconfigured 0/blank/tiny grace_seconds can't
--     flap a live fleet, and re-assert staleness INSIDE the UPDATE (+ emit only on a real flip)
--     so a heartbeat committing between the loop snapshot and the UPDATE cancels a spurious OFFLINE.
CREATE OR REPLACE FUNCTION public.sweep_device_presence()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d         record;
  cfg       jsonb;
  enabled   boolean;
  grace     int;
  v_updated int;
BEGIN
  FOR d IN
    SELECT id, tenant_id, label, presence, last_seen_at
      FROM public.devices
     WHERE status = 'enrolled'
  LOOP
    cfg := app.tenant_setting(d.tenant_id, ARRAY['alerts', 'offline'], '{}'::jsonb);
    enabled := COALESCE((cfg->>'enabled')::boolean, false);
    IF NOT enabled THEN CONTINUE; END IF;
    -- Floor at 120s (2x the 60s heartbeat): below that a healthy till flaps online/offline.
    grace := GREATEST(COALESCE(NULLIF(cfg->>'grace_seconds', '')::int, 300), 120);

    IF d.presence IN ('online', 'unknown') AND d.last_seen_at IS NOT NULL THEN
      -- Authoritative staleness re-check against the LIVE row (not the loop snapshot).
      UPDATE public.devices
         SET presence = 'offline', presence_changed_at = now()
       WHERE id = d.id
         AND presence IN ('online', 'unknown')
         AND last_seen_at < now() - make_interval(secs => grace);
      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated > 0 THEN
        PERFORM app.emit_notification(d.tenant_id, NULL, d.id, 'DEVICE_OFFLINE', 'warning',
          NULL, 'devices', d.id,
          jsonb_build_object('device_name', d.label, 'last_seen_at', d.last_seen_at));
      END IF;
    END IF;
  END LOOP;
END $$;

-- (2) Bound the push backstop to the last 24h so a persistently-failing critical event isn't
--     re-dispatched forever (the notify-push fn now leaves delivered_at NULL on transient failure).
SELECT cron.unschedule('notif-push-backstop')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notif-push-backstop');
SELECT cron.schedule('notif-push-backstop', '* * * * *', $CRON$
  SELECT net.http_post(
    url := s.url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', s.secret),
    body := jsonb_build_object('sweep', true))
  FROM (SELECT
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notify_push_fn_url')        AS url,
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notify_push_shared_secret') AS secret
       ) s
  WHERE s.url IS NOT NULL AND s.secret IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.notification_events
      WHERE severity = 'critical' AND delivered_at IS NULL
        AND created_at < now() - interval '60 seconds'
        AND created_at > now() - interval '24 hours');
$CRON$);

-- (3) Last-owner-guarded member revoke. revoke-human calls this instead of a bare DELETE so two
--     owners removing each other concurrently can't both pass the check and leave zero owners:
--     locking the tenant's owner rows FOR UPDATE serializes concurrent revokes within the tenant.
CREATE OR REPLACE FUNCTION public.revoke_tenant_member(p_tenant uuid, p_user uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_role        text;
  v_owner_count int;
BEGIN
  PERFORM 1 FROM public.tenant_members WHERE tenant_id = p_tenant AND role = 'owner' FOR UPDATE;
  SELECT role INTO v_role FROM public.tenant_members WHERE tenant_id = p_tenant AND user_id = p_user;
  IF v_role IS NULL THEN RETURN 'no_membership'; END IF;
  IF v_role = 'owner' THEN
    SELECT count(*) INTO v_owner_count FROM public.tenant_members WHERE tenant_id = p_tenant AND role = 'owner';
    IF v_owner_count <= 1 THEN RETURN 'last_owner'; END IF;
  END IF;
  DELETE FROM public.tenant_members WHERE tenant_id = p_tenant AND user_id = p_user;
  RETURN 'ok';
END $$;

REVOKE EXECUTE ON FUNCTION public.revoke_tenant_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_tenant_member(uuid, uuid) TO service_role;
