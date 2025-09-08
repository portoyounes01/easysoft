-- RPC function to upsert a transaction with its items atomically
-- Used for pushing local transaction changes to the server

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
    -- Start transaction
    BEGIN
        -- Extract transaction ID
        txn_id := (transaction_data->>'id')::UUID;
        
        -- Upsert the transaction
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
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE transactions.updated_at <= EXCLUDED.updated_at;
        
        -- Delete existing transaction items for this transaction (to handle item removals)
        DELETE FROM transaction_items 
        WHERE transaction_id = txn_id;
        
        -- Insert transaction items
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
        
        -- If we got here, everything succeeded
        result_success := true;
        result_error := NULL;
        
    EXCEPTION 
        WHEN OTHERS THEN
            -- Handle any errors
            result_success := false;
            result_error := SQLERRM;
    END;
    
    -- Return the result
    transaction_id := txn_id;
    success := result_success;
    error := result_error;
    RETURN NEXT;
    
    RETURN;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION upsert_transaction_with_items(JSONB, JSONB) TO authenticated;