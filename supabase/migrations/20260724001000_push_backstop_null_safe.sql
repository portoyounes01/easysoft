-- =====================================================================
-- Notifications P3b (follow-up) — make the push backstop cron null-safe.
--
-- The original backstop calls net.http_post(url := (SELECT vault …)); before the Vault secrets
-- are seeded that url is NULL and the per-minute job logs an error whenever an undelivered
-- critical event exists. Reschedule so http_post is only reached when BOTH Vault secrets are
-- present AND there's an overdue critical event — symmetric with the trigger's own NULL guard.
-- NO explicit BEGIN/COMMIT.
-- =====================================================================

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
      WHERE severity = 'critical' AND delivered_at IS NULL AND created_at < now() - interval '60 seconds');
$CRON$);
