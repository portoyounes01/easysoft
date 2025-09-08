-- RPC function to get customers that have changed since a given timestamp
-- Used for delta synchronization to minimize data transfer

CREATE OR REPLACE FUNCTION get_customers_delta(since_timestamp TIMESTAMPTZ DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    name TEXT,
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
    -- If no timestamp provided, return all customers
    IF since_timestamp IS NULL THEN
        RETURN QUERY
        SELECT 
            c.id,
            c.name,
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
        LIMIT 1000; -- Reasonable limit to prevent huge responses
    ELSE
        -- Return only customers modified since the given timestamp
        RETURN QUERY
        SELECT 
            c.id,
            c.name,
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_customers_delta(TIMESTAMPTZ) TO authenticated;