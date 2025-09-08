-- RPC function to upsert multiple customers with conflict resolution
-- Used for pushing local customer changes to the server

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
    -- Process each customer in the input array
    FOR customer_record IN SELECT * FROM jsonb_array_elements(customers_data)
    LOOP
        BEGIN
            -- Extract customer ID
            customer_id := (customer_record->>'id')::UUID;
            
            -- Attempt to upsert the customer
            INSERT INTO customers (
                id,
                name,
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
            WHERE customers.updated_at <= EXCLUDED.updated_at; -- Only update if server version is older
            
            -- Mark as successful
            result_id := customer_id;
            result_success := true;
            result_error := NULL;
            
        EXCEPTION 
            WHEN OTHERS THEN
                -- Handle any errors (constraint violations, etc.)
                result_id := customer_id;
                result_success := false;
                result_error := SQLERRM;
        END;
        
        -- Return the result for this customer
        id := result_id;
        success := result_success;
        error := result_error;
        RETURN NEXT;
    END LOOP;
    
    RETURN;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION upsert_customers(JSONB) TO authenticated;