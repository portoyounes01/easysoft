-- =====================================================================
-- ES-2 — VERIFACTU_REJECTED notification type (ES-2 review finding: an AEAT *registration*
-- rejection means the invoice WAS legally issued; reusing FISCAL_ISSUE_FAILED ("could not be
-- fiscalised") invites the wrong remediation). Distinct critical type, its own copy client-side.
-- Emitted by pos-checkout-es (issue-time final-rejection) + reconcile-verifactu (async verdict).
-- NO explicit BEGIN/COMMIT.
-- =====================================================================

ALTER TABLE public.notification_events DROP CONSTRAINT IF EXISTS notification_events_event_type_check;
ALTER TABLE public.notification_events ADD CONSTRAINT notification_events_event_type_check
  CHECK (event_type IN (
    'CREDIT_NOTE_ISSUED','REFUND_ISSUED','FISCAL_CANCELLATION','LARGE_DISCOUNT',
    'DRAWER_DISCREPANCY','DRAWER_OPEN_NO_SALE','PRICE_OVERRIDE','DEVICE_ENROLLED',
    'DEVICE_REVOKED','PAIRING_FAILED','SAFT_GENERATED','FISCAL_ISSUE_FAILED',
    'TRAINING_MODE_CHANGED','DEVICE_OFFLINE','DEVICE_ONLINE','VERIFACTU_REJECTED'));

-- At-most-once per rejected document (entity_id = fiscal_documents.id).
DROP INDEX IF EXISTS public.uq_notif_once;
CREATE UNIQUE INDEX uq_notif_once
  ON public.notification_events (tenant_id, event_type, entity_id)
  WHERE entity_id IS NOT NULL
    AND event_type IN ('REFUND_ISSUED','FISCAL_CANCELLATION','FISCAL_ISSUE_FAILED','LARGE_DISCOUNT','CREDIT_NOTE_ISSUED','VERIFACTU_REJECTED');
