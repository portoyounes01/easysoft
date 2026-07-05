-- =====================================================================
-- Phase 0 — consolidated DB hardening (RUN LAST: after genesis + the 7
-- timestamped migrations). Greenfield "EasySoft". App runs as ANON only
-- (auth.uid() IS NULL). Idempotent. DB-only steps that are SAFE for anon.
--
-- Included: S7, S9, S15, S17, S18, S19.
-- NOT here (code/config-only, orchestrator handles separately):
--   S1 delete functions.json, S2 env typo, S3-S5 config.toml verify_jwt,
--   S6 disable_signup (Management API), S8 clear_all_transaction_data
--     (excluded from GENESIS instead — never created), S10-S12 route gating,
--   S13 Vercel env, S14 bootstrap creds, S20 client sync fallback,
--   S21 edge CORS, S22 Electron runtime-config.
-- S16 (RLS on employees + permissive anon SELECT) is handled by the GENESIS
--   RLS baseline — NOT duplicated here.
-- =====================================================================

-- ---------------------------------------------------------------------
-- S7 — revoke EXECUTE on the two unused employee-admin RPCs from every
-- app-facing role. Guarded on to_regprocedure so it is a no-op if genesis
-- did not create them.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF to_regprocedure('public.merge_employee_records(uuid, uuid)') IS NOT NULL THEN
        REVOKE EXECUTE ON FUNCTION public.merge_employee_records(uuid, uuid)
            FROM PUBLIC, anon, authenticated;
    END IF;

    IF to_regprocedure('public.upsert_employees_with_mapping(jsonb)') IS NOT NULL THEN
        REVOKE EXECUTE ON FUNCTION public.upsert_employees_with_mapping(jsonb)
            FROM PUBLIC, anon, authenticated;
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- S9 — security_invoker = true on ALL public views (idempotent; loops so
-- it catches every view incl. the nested active_products_with_categories,
-- low_stock_products, transaction_details). Inert until RLS lands.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v record;
BEGIN
    FOR v IN
        SELECT schemaname, viewname
        FROM pg_views
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true)',
                       v.schemaname, v.viewname);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- S15 — employees credential-column revoke: INTENTIONALLY OMITTED here.
-- It provides no real protection while get_employees_delta (SECURITY
-- DEFINER) still returns pin/password_hash to any anon caller and the
-- offline-first login relies on those hashes reaching the client. Doing a
-- column-level REVOKE on employees now only risks breaking an anon
-- SELECT * path (e.g. seed/dev utilities) for zero security gain.
-- Credential hygiene is done properly in PHASE 2 (server-side PIN verify +
-- salted hashing + stripping hashes from the delta) — tracked as the LIVE
-- EXPOSURE in docs/multi-tenant-plan.md. employees keeps the same permissive
-- anon access as the other core tables (genesis RLS baseline + blanket grant).
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- S17 — patch upsert_transaction_with_items: skip-sealed / insert-once.
-- Body is the post-migration (at_cert_phase1) version verbatim, plus a
-- guard that inspects the SERVER row (never the payload): if it is already
-- sealed (fiscal_document_id IS NOT NULL) mirror ONLY the fiscal
-- cancellation evidence and RETURN early — no financial rewrite, no item
-- DELETE+reinsert. Must be in the SAME migration as S18/S19.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_transaction_with_items(
    transaction_data JSONB,
    items_data JSONB
)
RETURNS TABLE (
    transaction_id UUID,
    success BOOLEAN,
    error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    txn_id UUID;
    item_record JSONB;
    result_success BOOLEAN := true;
    result_error TEXT := NULL;
    existing_fiscal_document_id TEXT;
BEGIN
    BEGIN
        txn_id := (transaction_data->>'id')::UUID;

        -- S17 skip-sealed guard (server row only).
        SELECT t.fiscal_document_id
          INTO existing_fiscal_document_id
          FROM transactions t
         WHERE t.id = txn_id;

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
             WHERE id = txn_id;

            transaction_id := txn_id;
            success := true;
            error := NULL;
            RETURN NEXT;
            RETURN;
        END IF;

        INSERT INTO transactions (
            id,
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
        WHERE transactions.updated_at <= EXCLUDED.updated_at;

        DELETE FROM transaction_items
        WHERE transaction_id = txn_id;

        FOR item_record IN SELECT * FROM jsonb_array_elements(items_data)
        LOOP
            INSERT INTO transaction_items (
                id,
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
$$;

GRANT EXECUTE ON FUNCTION upsert_transaction_with_items(JSONB, JSONB) TO anon, authenticated;
-- get_customers_delta was DROP+CREATEd across migrations (return-type growth), which drops the
-- genesis blanket grant; restore EXECUTE for the app roles on the final definition.
GRANT EXECUTE ON FUNCTION public.get_customers_delta(timestamptz) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- S18 — sealed-transaction immutability. BEFORE UPDATE OR DELETE on
-- transactions: block DELETE of a sealed row; block UPDATE unless the only
-- changes are the cancellation mirror + updated_at + last_synced_at.
-- Column-set-agnostic (jsonb diff) so it survives later schema growth.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_sealed_transaction()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.fiscal_document_id IS NOT NULL THEN
            RAISE EXCEPTION
                'Sealed fiscal transaction % cannot be deleted', OLD.id
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;

    -- UPDATE
    IF OLD.fiscal_document_id IS NOT NULL THEN
        IF (to_jsonb(NEW)
              - 'fiscal_cancelled_at'
              - 'fiscal_cancelled_reason'
              - 'fiscal_cancelled_by_employee_id'
              - 'updated_at'
              - 'last_synced_at')
           IS DISTINCT FROM
           (to_jsonb(OLD)
              - 'fiscal_cancelled_at'
              - 'fiscal_cancelled_reason'
              - 'fiscal_cancelled_by_employee_id'
              - 'updated_at'
              - 'last_synced_at')
        THEN
            RAISE EXCEPTION
                'Sealed fiscal transaction % is immutable (only cancellation mirror may change)', OLD.id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_sealed_transaction ON public.transactions;
CREATE TRIGGER protect_sealed_transaction
    BEFORE UPDATE OR DELETE ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_sealed_transaction();

-- ---------------------------------------------------------------------
-- S19 — sealed-parent item immutability. BEFORE UPDATE OR DELETE on
-- transaction_items: reject any change when the parent transaction is
-- sealed. SECURITY DEFINER so the parent lookup never fails on caller
-- privileges. Must be applied AFTER the S17 RPC patch (same migration).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_sealed_transaction_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    parent_sealed boolean;
BEGIN
    SELECT (t.fiscal_document_id IS NOT NULL)
      INTO parent_sealed
      FROM transactions t
     WHERE t.id = COALESCE(NEW.transaction_id, OLD.transaction_id);

    IF parent_sealed THEN
        RAISE EXCEPTION
            'Cannot modify item of sealed fiscal transaction %',
            COALESCE(NEW.transaction_id, OLD.transaction_id)
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_sealed_transaction_item ON public.transaction_items;
CREATE TRIGGER protect_sealed_transaction_item
    BEFORE UPDATE OR DELETE ON public.transaction_items
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_sealed_transaction_item();
