-- =====================================================================
-- Notifications P3a — add notification_events to the Realtime publication.
-- The ONE DB change that makes the feed live: RLS is already ON, SELECT already granted,
-- and the phase-3 tenant policy is the isolation boundary Realtime (WALRUS) evaluates per
-- change per connection using the client's setAuth JWT. INSERT-only feed => no REPLICA
-- IDENTITY change. Idempotent. NO explicit BEGIN/COMMIT.
-- =====================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notification_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_events;
  END IF;
END $$;
