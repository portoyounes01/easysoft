-- =====================================================================
-- Notifications P3c — device presence enum + columns (docs/pwa-notifications-plan.md P3c Step 1)
--
-- The two new event types (DEVICE_OFFLINE/ONLINE) land here, co-located with their only
-- producer (the heartbeat RPC + sweep). Re-adding the CHECK validates instantly because every
-- existing row's event_type is already a subset of the new list. NO explicit BEGIN/COMMIT.
-- =====================================================================

ALTER TABLE public.notification_events DROP CONSTRAINT IF EXISTS notification_events_event_type_check;
ALTER TABLE public.notification_events ADD CONSTRAINT notification_events_event_type_check
  CHECK (event_type IN (
    'CREDIT_NOTE_ISSUED','REFUND_ISSUED','FISCAL_CANCELLATION','LARGE_DISCOUNT',
    'DRAWER_DISCREPANCY','DRAWER_OPEN_NO_SALE','PRICE_OVERRIDE','DEVICE_ENROLLED',
    'DEVICE_REVOKED','PAIRING_FAILED','SAFT_GENERATED','FISCAL_ISSUE_FAILED',
    'TRAINING_MODE_CHANGED','DEVICE_OFFLINE','DEVICE_ONLINE'));

-- Presence is a coarse online/offline/unknown state maintained by the heartbeat RPC (online)
-- and the sweep (offline). 'unknown' is the pre-heartbeat default (first boot flips silently).
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS presence text NOT NULL DEFAULT 'unknown'
  CHECK (presence IN ('online','offline','unknown'));
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS presence_changed_at timestamptz;
