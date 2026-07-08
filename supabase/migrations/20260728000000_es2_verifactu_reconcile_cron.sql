-- =====================================================================
-- ES-2 — SIGN ES / Veri*factu reconciliation backstop (docs/fiskaly-strategy-brief.md).
--
-- SIGN ES AEAT registration is ASYNC (ES-0: HTTP 200 ISSUED at issue; the registration verdict
-- lands later). This per-minute cron invokes the `reconcile-verifactu` edge fn (via pg_net) to
-- poll fiscal_documents.verifactu_registration='PENDING' rows to a final state and, on rejection,
-- emit a critical alert through the P3 push pipeline. Null-safe: no-op until the Vault secrets
-- are seeded (same pattern as notif-push-backstop). Depends on pg_net/pg_cron (P3b migration).
-- Only fires when there IS pending work, to keep the edge fn cold otherwise. NO explicit BEGIN/COMMIT.
-- =====================================================================

-- reconcile-verifactu (service_role) inserts FISCAL_ISSUE_FAILED notification_events on AEAT
-- rejection. The append-only hardening (20260721003000) revoked INSERT from `authenticated`
-- only; make the service_role grant explicit so this never depends on platform defaults.
GRANT INSERT ON public.notification_events TO service_role;

SELECT cron.unschedule('verifactu-reconcile')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'verifactu-reconcile');

SELECT cron.schedule('verifactu-reconcile', '* * * * *', $CRON$
  SELECT net.http_post(
    url := s.url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', s.secret),
    body := jsonb_build_object('sweep', true))
  FROM (SELECT
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'reconcile_verifactu_fn_url')     AS url,
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'reconcile_verifactu_shared_secret') AS secret
       ) s
  WHERE s.url IS NOT NULL AND s.secret IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.fiscal_documents
      WHERE verifactu_registration = 'PENDING'
        AND created_at > now() - interval '7 days');  -- bound: give up polling a stuck doc after a week
$CRON$);
