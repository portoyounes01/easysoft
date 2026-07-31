-- =====================================================================
-- Notifications P3a — server-side producer triggers (docs/pwa-notifications-plan.md P3a Step 2)
--
-- De-dup principle: every trigger emits ONLY on a genuine OLD->NEW transition
-- (INSERT => OLD=NULL). upsert_transaction_with_items re-runs ON CONFLICT DO UPDATE
-- on every idempotent offline re-sync, so detection keys on real column transitions
-- + the uq_notif_once index (helpers migration) makes entity-keyed events at-most-once.
--
-- Every fn is SECURITY DEFINER (owner) SET search_path — it bypasses RLS to read
-- tenant_settings + write notification_events, and always sources tenant_id from the
-- SERVER-STAMPED source row (NEW.tenant_id), never app.tenant_id() (which is NULL in the
-- DEFINER/service-role write context). NO explicit BEGIN/COMMIT.
-- =====================================================================

-- transactions: REFUND_ISSUED / FISCAL_CANCELLATION / LARGE_DISCOUNT ----
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

DROP TRIGGER IF EXISTS trg_notify_transaction_events ON public.transactions;
CREATE TRIGGER trg_notify_transaction_events
  AFTER INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_transaction_events();

-- fiscal_issue_attempts: FISCAL_ISSUE_FAILED (entity = checkout_id PK) ----
CREATE OR REPLACE FUNCTION public.notify_fiscal_issue_failed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'failed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'failed') THEN
    PERFORM app.emit_notification(NEW.tenant_id, NULL, NEW.device_id, 'FISCAL_ISSUE_FAILED', 'critical',
      NULL, 'fiscal_issue_attempts', NEW.checkout_id,
      jsonb_build_object('error', NEW.error));
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_fiscal_issue_failed ON public.fiscal_issue_attempts;
CREATE TRIGGER trg_notify_fiscal_issue_failed
  AFTER INSERT OR UPDATE OF status ON public.fiscal_issue_attempts
  FOR EACH ROW EXECUTE FUNCTION public.notify_fiscal_issue_failed();

-- cash_drawer_logs: DRAWER_OPEN_NO_SALE ----
-- NOTE: correct + ready, but DORMANT today — the real till writes drawer audit to Dexie
-- (cashDrawerAuditService), not to server public.cash_drawer_logs. It fires only once/if
-- the till syncs drawer logs to the server. Not a stub — a live producer awaiting its source.
CREATE OR REPLACE FUNCTION public.notify_drawer_open_no_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.action = 'open' AND NEW.transaction_id IS NULL THEN
    PERFORM app.emit_notification(NEW.tenant_id, NULL, NULL, 'DRAWER_OPEN_NO_SALE', 'warning',
      NEW.employee_id, 'cash_drawer_logs', NEW.id,
      jsonb_build_object('reason', NEW.reason));
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_drawer_open_no_sale ON public.cash_drawer_logs;
CREATE TRIGGER trg_notify_drawer_open_no_sale
  AFTER INSERT ON public.cash_drawer_logs
  FOR EACH ROW EXECUTE FUNCTION public.notify_drawer_open_no_sale();
