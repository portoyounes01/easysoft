-- =====================================================================
-- FIX: credit-note (and any locally-created-only transaction) sync was silently lost
-- (2026-07-08, root-caused via PG_EXCEPTION_CONTEXT probe).
--
-- upsert_transaction_with_items declares OUT column `transaction_id` (RETURNS TABLE),
-- and its item-replace step ran `DELETE FROM transaction_items WHERE transaction_id = txn_id`
-- — ambiguous (plpgsql variable vs table column) => 'column reference "transaction_id" is
-- ambiguous'. plpgsql parses statements lazily, and rows that ALREADY exist server-side
-- (normal sales, written at checkout) take the S17 sealed early-return BEFORE this statement,
-- so the bug only fired for rows whose FIRST server appearance is the sync push — exactly
-- credit notes (created locally by runFiscalCreditNoteForTransaction). The RPC caught the
-- error per-row (success=false over HTTP 200) and the client ignored per-row status (fixed
-- client-side in the same commit), so the NC was marked synced and never retried: silent loss.
--
-- This migration:
--   (1) re-creates the function byte-identical EXCEPT the DELETE is alias-qualified;
--   (2) drops the temporary debug/introspection helpers (20260726000000/20260726001000);
--   (3) adds the fiscal_documents NC producer: when the pos-checkout/fiskaly path lands
--       (doc_type='NC' rows written server-side, possibly AFTER the transaction row sync),
--       CREDIT_NOTE_ISSUED fires from that path too — deduped against the notes-marker
--       producer via uq_notif_once (same entity_id = the transaction id).
-- NO explicit BEGIN/COMMIT.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.upsert_transaction_with_items(transaction_data jsonb, items_data jsonb)
 RETURNS TABLE(transaction_id uuid, success boolean, error text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    txn_id UUID;
    item_record JSONB;
    result_success BOOLEAN := true;
    result_error TEXT := NULL;
    existing_fiscal_document_id TEXT;
    v_tenant UUID := app.tenant_id();
    v_role TEXT := app.app_role();
BEGIN
    -- Tenant + device guards run BEFORE the inner exception block so a
    -- security violation is a hard, propagated error (proper SQLSTATE), never
    -- swallowed into a success=false result row.
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'no_tenant_context' USING ERRCODE = '28000';
    END IF;

    IF v_role IS DISTINCT FROM 'device' THEN
        RAISE EXCEPTION 'device_session_required' USING ERRCODE = '42501';
    END IF;

    BEGIN
        txn_id := (transaction_data->>'id')::UUID;

        -- S17 skip-sealed guard (server row only, this tenant only).
        SELECT t.fiscal_document_id
          INTO existing_fiscal_document_id
          FROM transactions t
         WHERE t.id = txn_id
           AND t.tenant_id = v_tenant;

        IF existing_fiscal_document_id IS NOT NULL THEN
            UPDATE transactions
               SET fiscal_cancelled_at =
                       COALESCE(
                           CASE WHEN transaction_data->>'fiscal_cancelled_at' IS NOT NULL
                                THEN (transaction_data->>'fiscal_cancelled_at')::TIMESTAMPTZ
                                ELSE NULL END,
                           fiscal_cancelled_at),
                   fiscal_cancelled_reason =
                       COALESCE(NULLIF(transaction_data->>'fiscal_cancelled_reason', ''),
                                fiscal_cancelled_reason),
                   fiscal_cancelled_by_employee_id =
                       COALESCE(
                           CASE WHEN transaction_data->>'fiscal_cancelled_by_employee_id' IS NOT NULL
                                THEN (transaction_data->>'fiscal_cancelled_by_employee_id')::UUID
                                ELSE NULL END,
                           fiscal_cancelled_by_employee_id),
                   last_synced_at = NOW()
             WHERE id = txn_id
               AND tenant_id = v_tenant;

            transaction_id := txn_id;
            success := true;
            error := NULL;
            RETURN NEXT;
            RETURN;
        END IF;

        INSERT INTO transactions (
            id,
            tenant_id,
            transaction_number,
            employee_id,
            employee_name,
            customer_id,
            customer_name,
            transaction_date,
            transaction_time,
            subtotal,
            discount,
            tax,
            total,
            payment_method,
            amount_paid,
            change_given,
            status,
            notes,
            receipt_number,
            fiscal_document_id,
            fiscal_metadata_json,
            fiscal_cancelled_at,
            fiscal_cancelled_reason,
            fiscal_cancelled_by_employee_id,
            created_at,
            updated_at,
            deleted_at
        ) VALUES (
            txn_id,
            v_tenant,
            transaction_data->>'transaction_number',
            (transaction_data->>'employee_id')::UUID,
            transaction_data->>'employee_name',
            CASE WHEN transaction_data->>'customer_id' IS NOT NULL
                 THEN (transaction_data->>'customer_id')::UUID
                 ELSE NULL END,
            transaction_data->>'customer_name',
            (transaction_data->>'transaction_date')::DATE,
            (transaction_data->>'transaction_time')::TIME,
            (transaction_data->>'subtotal')::DECIMAL(10,2),
            COALESCE((transaction_data->>'discount')::DECIMAL(10,2), 0),
            (transaction_data->>'tax')::DECIMAL(10,2),
            (transaction_data->>'total')::DECIMAL(10,2),
            transaction_data->>'payment_method',
            CASE WHEN transaction_data->>'amount_paid' IS NOT NULL
                 THEN (transaction_data->>'amount_paid')::DECIMAL(10,2)
                 ELSE NULL END,
            COALESCE((transaction_data->>'change_given')::DECIMAL(10,2), 0),
            transaction_data->>'status',
            transaction_data->>'notes',
            transaction_data->>'receipt_number',
            transaction_data->>'fiscal_document_id',
            transaction_data->'fiscal_metadata_json',
            CASE WHEN transaction_data->>'fiscal_cancelled_at' IS NOT NULL
                 THEN (transaction_data->>'fiscal_cancelled_at')::TIMESTAMPTZ
                 ELSE NULL END,
            NULLIF(transaction_data->>'fiscal_cancelled_reason', ''),
            CASE WHEN transaction_data->>'fiscal_cancelled_by_employee_id' IS NOT NULL
                 THEN (transaction_data->>'fiscal_cancelled_by_employee_id')::UUID
                 ELSE NULL END,
            COALESCE((transaction_data->>'created_at')::TIMESTAMPTZ, NOW()),
            COALESCE((transaction_data->>'updated_at')::TIMESTAMPTZ, NOW()),
            CASE WHEN transaction_data->>'deleted_at' IS NOT NULL
                 THEN (transaction_data->>'deleted_at')::TIMESTAMPTZ
                 ELSE NULL END
        )
        ON CONFLICT (id) DO UPDATE SET
            employee_id = EXCLUDED.employee_id,
            employee_name = EXCLUDED.employee_name,
            customer_id = EXCLUDED.customer_id,
            customer_name = EXCLUDED.customer_name,
            subtotal = EXCLUDED.subtotal,
            discount = EXCLUDED.discount,
            tax = EXCLUDED.tax,
            total = EXCLUDED.total,
            payment_method = EXCLUDED.payment_method,
            amount_paid = EXCLUDED.amount_paid,
            change_given = EXCLUDED.change_given,
            status = EXCLUDED.status,
            notes = EXCLUDED.notes,
            receipt_number = EXCLUDED.receipt_number,
            fiscal_document_id = COALESCE(EXCLUDED.fiscal_document_id, transactions.fiscal_document_id),
            fiscal_metadata_json = COALESCE(EXCLUDED.fiscal_metadata_json, transactions.fiscal_metadata_json),
            fiscal_cancelled_at = COALESCE(EXCLUDED.fiscal_cancelled_at, transactions.fiscal_cancelled_at),
            fiscal_cancelled_reason = COALESCE(EXCLUDED.fiscal_cancelled_reason, transactions.fiscal_cancelled_reason),
            fiscal_cancelled_by_employee_id = COALESCE(EXCLUDED.fiscal_cancelled_by_employee_id, transactions.fiscal_cancelled_by_employee_id),
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE transactions.tenant_id = v_tenant
          AND transactions.updated_at <= EXCLUDED.updated_at;

        -- Qualified via alias: transaction_id is BOTH this function's OUT column and a
        -- transaction_items column -> plpgsql raises 'column reference "transaction_id" is
        -- ambiguous' the first time this statement runs. Sales never hit it (they already
        -- exist server-side via checkout, so the sealed guard returns early); every
        -- locally-created-only transaction (credit notes!) died here and was silently lost.
        DELETE FROM transaction_items ti
        WHERE ti.transaction_id = txn_id
          AND ti.tenant_id = v_tenant;

        FOR item_record IN SELECT * FROM jsonb_array_elements(items_data)
        LOOP
            INSERT INTO transaction_items (
                id,
                tenant_id,
                transaction_id,
                product_id,
                product_name,
                product_sku,
                category_id,
                category_name,
                quantity,
                unit_price,
                unit_cost,
                iva_rate,
                line_total,
                tax_amount,
                profit_amount,
                discount_amount,
                discount_percentage,
                created_at,
                updated_at,
                deleted_at
            ) VALUES (
                (item_record->>'id')::UUID,
                v_tenant,
                txn_id,
                (item_record->>'product_id')::UUID,
                item_record->>'product_name',
                item_record->>'product_sku',
                CASE WHEN item_record->>'category_id' IS NOT NULL
                     THEN (item_record->>'category_id')::UUID
                     ELSE NULL END,
                item_record->>'category_name',
                (item_record->>'quantity')::INTEGER,
                (item_record->>'unit_price')::DECIMAL(10,2),
                (item_record->>'unit_cost')::DECIMAL(10,2),
                (item_record->>'iva_rate')::DECIMAL(5,4),
                (item_record->>'line_total')::DECIMAL(10,2),
                (item_record->>'tax_amount')::DECIMAL(10,2),
                COALESCE((item_record->>'profit_amount')::DECIMAL(10,2), 0),
                COALESCE((item_record->>'discount_amount')::DECIMAL(10,2), 0),
                COALESCE((item_record->>'discount_percentage')::DECIMAL(5,2), 0),
                COALESCE((item_record->>'created_at')::TIMESTAMPTZ, NOW()),
                COALESCE((item_record->>'updated_at')::TIMESTAMPTZ, NOW()),
                CASE WHEN item_record->>'deleted_at' IS NOT NULL
                     THEN (item_record->>'deleted_at')::TIMESTAMPTZ
                     ELSE NULL END
            );
        END LOOP;

        result_success := true;
        result_error := NULL;

    EXCEPTION
        WHEN OTHERS THEN
            result_success := false;
            result_error := SQLERRM;
    END;

    transaction_id := txn_id;
    success := result_success;
    error := result_error;
    RETURN NEXT;

    RETURN;
END;
$function$;

-- (2) drop the temporary debug helpers
DROP FUNCTION IF EXISTS public.upsert_transaction_with_items_debug(JSONB, JSONB);
DROP FUNCTION IF EXISTS public.debug_get_fn_src(text);
DROP FUNCTION IF EXISTS public.debug_get_triggers(text);

-- (3) future-proof CREDIT_NOTE_ISSUED for the pos-checkout/fiskaly path.
-- Guards (review-hardened before deploy):
--   * transaction_id IS NOT NULL — entity-less NC docs can't dedup against the notes-marker
--     event via uq_notif_once, so they are skipped (pos-checkout must link transaction_id);
--   * environment='live' AND NOT is_training — a TEST/training credit note must never buzz
--     an admin's phone (fiscal_documents is the one producer input carrying this signal);
--   * EXCEPTION-swallowed — this fires INSIDE pos-checkout's evidence INSERT, immediately
--     after the irreversible fiskaly signing. A dropped notification is acceptable; a
--     rolled-back fiscal evidence row (fiskaly<->Postgres divergence) is NOT. Same rule as
--     notify_push_dispatch. NOTE: fiscal_documents has NO gross_total column (amounts live in
--     signed_payload), so the payload carries the doc number/series only.
CREATE OR REPLACE FUNCTION public.notify_credit_note_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.doc_type = 'NC' AND NEW.transaction_id IS NOT NULL
     AND NEW.environment = 'live' AND NOT NEW.is_training THEN
    BEGIN
      PERFORM app.emit_notification(NEW.tenant_id, NEW.store_id, NEW.device_id,
        'CREDIT_NOTE_ISSUED', 'critical', NULL, 'transactions', NEW.transaction_id,
        jsonb_build_object('transaction_number', NEW.number, 'doc_series', NEW.series));
    EXCEPTION WHEN OTHERS THEN NULL; -- never abort the fiscal evidence write
    END;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_notify_credit_note_document ON public.fiscal_documents;
CREATE TRIGGER trg_notify_credit_note_document
  AFTER INSERT ON public.fiscal_documents
  FOR EACH ROW EXECUTE FUNCTION public.notify_credit_note_document();
