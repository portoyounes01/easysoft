-- Phase 1 AT cert: customer country (QR C:); fiscal cancellation mirror on transactions

ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'PT';

COMMENT ON COLUMN public.customers.country IS 'ISO 3166-1 alpha-2 for AT QR segment C.';

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS fiscal_cancelled_at TIMESTAMPTZ;

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS fiscal_cancelled_reason TEXT;

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS fiscal_cancelled_by_employee_id UUID;

COMMENT ON COLUMN public.transactions.fiscal_cancelled_at IS 'When the linked fiscal document was cancelled (anulado) locally.';

-- ---------------------------------------------------------------------------
-- upsert_transaction_with_items: include fiscal cancellation columns
-- ---------------------------------------------------------------------------
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
BEGIN
    BEGIN
        txn_id := (transaction_data->>'id')::UUID;

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

-- ---------------------------------------------------------------------------
-- upsert_customers: include country
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_customers(customers_data JSONB)
RETURNS TABLE (
    id UUID,
    success BOOLEAN,
    error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    customer_record JSONB;
    customer_id UUID;
    result_id UUID;
    result_success BOOLEAN;
    result_error TEXT;
BEGIN
    FOR customer_record IN SELECT * FROM jsonb_array_elements(customers_data)
    LOOP
        BEGIN
            customer_id := (customer_record->>'id')::UUID;

            INSERT INTO customers (
                id,
                name,
                tax_number,
                country,
                email,
                phone,
                address,
                total_spent,
                transaction_count,
                loyalty_points,
                is_active,
                preferred_payment_method,
                created_at,
                updated_at,
                deleted_at
            ) VALUES (
                customer_id,
                customer_record->>'name',
                NULLIF(customer_record->>'tax_number', ''),
                COALESCE(NULLIF(customer_record->>'country', ''), 'PT'),
                customer_record->>'email',
                customer_record->>'phone',
                customer_record->>'address',
                COALESCE((customer_record->>'total_spent')::DECIMAL(10,2), 0),
                COALESCE((customer_record->>'transaction_count')::INTEGER, 0),
                COALESCE((customer_record->>'loyalty_points')::INTEGER, 0),
                COALESCE((customer_record->>'is_active')::BOOLEAN, true),
                customer_record->>'preferred_payment_method',
                COALESCE((customer_record->>'created_at')::TIMESTAMPTZ, NOW()),
                COALESCE((customer_record->>'updated_at')::TIMESTAMPTZ, NOW()),
                CASE WHEN customer_record->>'deleted_at' IS NOT NULL
                     THEN (customer_record->>'deleted_at')::TIMESTAMPTZ
                     ELSE NULL END
            )
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                tax_number = EXCLUDED.tax_number,
                country = EXCLUDED.country,
                email = EXCLUDED.email,
                phone = EXCLUDED.phone,
                address = EXCLUDED.address,
                total_spent = EXCLUDED.total_spent,
                transaction_count = EXCLUDED.transaction_count,
                loyalty_points = EXCLUDED.loyalty_points,
                is_active = EXCLUDED.is_active,
                preferred_payment_method = EXCLUDED.preferred_payment_method,
                updated_at = EXCLUDED.updated_at,
                deleted_at = EXCLUDED.deleted_at
            WHERE customers.updated_at <= EXCLUDED.updated_at;

            result_id := customer_id;
            result_success := true;
            result_error := NULL;

        EXCEPTION
            WHEN OTHERS THEN
                result_id := customer_id;
                result_success := false;
                result_error := SQLERRM;
        END;

        id := result_id;
        success := result_success;
        error := result_error;
        RETURN NEXT;
    END LOOP;

    RETURN;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_customers_delta: return country
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_customers_delta(since_timestamp TIMESTAMPTZ DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    name TEXT,
    tax_number TEXT,
    country TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    total_spent DECIMAL(10,2),
    transaction_count INTEGER,
    loyalty_points INTEGER,
    is_active BOOLEAN,
    preferred_payment_method TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF since_timestamp IS NULL THEN
        RETURN QUERY
        SELECT
            c.id,
            c.name,
            c.tax_number,
            c.country,
            c.email,
            c.phone,
            c.address,
            c.total_spent,
            c.transaction_count,
            c.loyalty_points,
            c.is_active,
            c.preferred_payment_method,
            c.created_at,
            c.updated_at,
            c.last_synced_at,
            c.deleted_at
        FROM customers c
        ORDER BY c.updated_at DESC
        LIMIT 1000;
    ELSE
        RETURN QUERY
        SELECT
            c.id,
            c.name,
            c.tax_number,
            c.country,
            c.email,
            c.phone,
            c.address,
            c.total_spent,
            c.transaction_count,
            c.loyalty_points,
            c.is_active,
            c.preferred_payment_method,
            c.created_at,
            c.updated_at,
            c.last_synced_at,
            c.deleted_at
        FROM customers c
        WHERE c.updated_at > since_timestamp
        ORDER BY c.updated_at DESC
        LIMIT 1000;
    END IF;
END;
$$;
