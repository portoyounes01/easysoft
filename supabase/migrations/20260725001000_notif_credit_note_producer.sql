-- =====================================================================
-- Notifications — add the missing CREDIT_NOTE_ISSUED producer (2026-07-07).
--
-- P3a wired producers for REFUND_ISSUED / FISCAL_CANCELLATION / LARGE_DISCOUNT /
-- FISCAL_ISSUE_FAILED but NOT CREDIT_NOTE_ISSUED (the first enum type). A credit note
-- (nota de crédito) reverses a fiscal sale — a money-back oversight event managers must see —
-- and it's how PT tills refund, so it belongs on the alert path. severity='critical' so it
-- fans out via Web Push (the push-dispatch trigger fires only on critical), matching the intent
-- that a credit note buzzes the admin's phone.
--
-- DETECTION: creditNoteCheckout.ts creates a NEW transaction with status='completed' and
-- notes = 'NC referente <invoice_no>[. reason]'. fiscal_documents is only written by the
-- pos-checkout edge fn (the local_at till isn't wired to it — REGISTER C4), so it's NOT
-- joinable server-side today. We key off the synced `notes` marker, and ALSO join
-- fiscal_documents.doc_type='NC' so this keeps working once the pos-checkout cutover lands.
-- NO explicit BEGIN/COMMIT.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_transaction_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  cfg jsonb;
  amt numeric;
  pct numeric;
  eff_pct numeric;
BEGIN
  -- REFUND_ISSUED: transition into a refund status
  IF NEW.status IN ('refunded','partial_refund')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM app.emit_notification(NEW.tenant_id, NULL, NULL, 'REFUND_ISSUED', 'warning',
      NEW.employee_id, 'transactions', NEW.id,
      jsonb_build_object('total', NEW.total, 'status', NEW.status, 'transaction_number', NEW.transaction_number));
  END IF;

  -- CREDIT_NOTE_ISSUED: a nota de crédito transaction (reverses a sale). Detect via the synced
  -- notes marker OR a joined NC fiscal document (future pos-checkout path). critical => pushes.
  IF (NEW.notes LIKE 'NC referente%'
      OR EXISTS (SELECT 1 FROM public.fiscal_documents fd WHERE fd.transaction_id = NEW.id AND fd.doc_type = 'NC'))
     AND (TG_OP = 'INSERT' OR OLD.notes IS DISTINCT FROM NEW.notes) THEN
    PERFORM app.emit_notification(NEW.tenant_id, NULL, NULL, 'CREDIT_NOTE_ISSUED', 'critical',
      NEW.employee_id, 'transactions', NEW.id,
      jsonb_build_object('total', NEW.total, 'notes', NEW.notes, 'transaction_number', NEW.transaction_number));
  END IF;

  -- FISCAL_CANCELLATION: fiscal_cancelled_at NULL -> NOT NULL
  IF NEW.fiscal_cancelled_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.fiscal_cancelled_at IS NULL) THEN
    PERFORM app.emit_notification(NEW.tenant_id, NULL, NULL, 'FISCAL_CANCELLATION', 'critical',
      NEW.fiscal_cancelled_by_employee_id, 'transactions', NEW.id,
      jsonb_build_object('reason', NEW.fiscal_cancelled_reason, 'transaction_number', NEW.transaction_number));
  END IF;

  -- LARGE_DISCOUNT: discount changed, > 0, and over the tenant's amount OR percentage threshold
  IF NEW.discount > 0
     AND (TG_OP = 'INSERT' OR OLD.discount IS DISTINCT FROM NEW.discount) THEN
    cfg := app.tenant_setting(NEW.tenant_id, ARRAY['alerts','large_discount'], '{}'::jsonb);
    IF COALESCE((cfg->>'enabled')::boolean, false) THEN
      amt := NULLIF(cfg->>'amount','')::numeric;
      pct := NULLIF(cfg->>'percentage','')::numeric;
      eff_pct := NEW.discount / NULLIF(NEW.subtotal, 0) * 100;
      IF (amt IS NOT NULL AND NEW.discount >= amt)
         OR (pct IS NOT NULL AND eff_pct >= pct) THEN
        PERFORM app.emit_notification(NEW.tenant_id, NULL, NULL, 'LARGE_DISCOUNT', 'warning',
          NEW.employee_id, 'transactions', NEW.id,
          jsonb_build_object('discount', NEW.discount, 'subtotal', NEW.subtotal, 'pct', round(eff_pct, 1),
                             'transaction_number', NEW.transaction_number));
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END; $$;

-- At-most-once for CREDIT_NOTE_ISSUED too (its own NC transaction id is the entity_id).
DROP INDEX IF EXISTS public.uq_notif_once;
CREATE UNIQUE INDEX uq_notif_once
  ON public.notification_events (tenant_id, event_type, entity_id)
  WHERE entity_id IS NOT NULL
    AND event_type IN ('REFUND_ISSUED','FISCAL_CANCELLATION','FISCAL_ISSUE_FAILED','LARGE_DISCOUNT','CREDIT_NOTE_ISSUED');
