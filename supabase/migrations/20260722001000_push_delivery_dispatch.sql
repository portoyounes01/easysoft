-- =====================================================================
-- Notifications P3b — push delivery dispatch + cron backstop
-- (docs/pwa-notifications-plan.md P3b Step 6)
--
-- FAIL-DANGEROUS SURFACE: trg_notify_push_dispatch fires AFTER INSERT on notification_events,
-- which for FISCAL_CANCELLATION happens INSIDE the still-open fiscal-cancel / tx-sync
-- transaction. If this function raised, it would ROLL BACK the till's fiscal write. So it:
--   (1) NULL-guards the Vault reads (misconfig => skip, never abort the producer), and
--   (2) wraps net.http_post in BEGIN … EXCEPTION WHEN OTHERS THEN NULL.
-- pg_net is fire-and-forget; the per-minute cron sweep + the delivered_at gate is the REQUIRED
-- safety net (a dropped dispatch is retried within ~60s). NO explicit BEGIN/COMMIT.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')  THEN RAISE EXCEPTION 'pg_net required';  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN RAISE EXCEPTION 'pg_cron required'; END IF;
END $$;

-- Partial index backing the delivered_at idempotency gate (fn query + cron EXISTS probe).
-- Distinct from phase1's idx_notif_undelivered (tenant_id, created_at) — this one is
-- critical-only, matching the exact predicate the dispatch fn + cron sweep filter on.
CREATE INDEX IF NOT EXISTS idx_notif_critical_undelivered
  ON public.notification_events (created_at)
  WHERE severity = 'critical' AND delivered_at IS NULL;

CREATE OR REPLACE FUNCTION public.notify_push_dispatch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'notify_push_fn_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'notify_push_shared_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN RETURN NULL; END IF; -- misconfig: skip, never abort the producer
  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
      body := jsonb_build_object('event_id', NEW.id));
  EXCEPTION WHEN OTHERS THEN NULL; -- best-effort; the cron backstop is the safety net
  END;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_notify_push_dispatch ON public.notification_events;
CREATE TRIGGER trg_notify_push_dispatch
  AFTER INSERT ON public.notification_events
  FOR EACH ROW WHEN (NEW.severity = 'critical' AND NEW.delivered_at IS NULL)
  EXECUTE FUNCTION public.notify_push_dispatch();

-- Per-minute backstop: re-dispatch any critical event still undelivered after 60s
-- (covers a dropped pg_net call, a cold edge fn, or a Vault secret seeded after the insert).
SELECT cron.unschedule('notif-push-backstop')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notif-push-backstop');
SELECT cron.schedule('notif-push-backstop', '* * * * *', $CRON$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notify_push_fn_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
               'x-webhook-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notify_push_shared_secret')),
    body := jsonb_build_object('sweep', true))
  WHERE EXISTS (
    SELECT 1 FROM public.notification_events
    WHERE severity = 'critical' AND delivered_at IS NULL AND created_at < now() - interval '60 seconds');
$CRON$);
