-- Customer postal + city for SAF-T BillingAddress (Phase 2.2)

ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS city TEXT;

ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS postal_code TEXT;

COMMENT ON COLUMN public.customers.city IS 'Customer city for SAF-T BillingAddress.';
COMMENT ON COLUMN public.customers.postal_code IS 'Customer postal code (e.g. PT format 1234-567).';

-- ---------------------------------------------------------------------------
-- upsert_customers: include city, postal_code
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
                city,
                postal_code,
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
                NULLIF(customer_record->>'city', ''),
                NULLIF(customer_record->>'postal_code', ''),
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
                city = EXCLUDED.city,
                postal_code = EXCLUDED.postal_code,
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
-- get_customers_delta: return city, postal_code
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_customers_delta(timestamptz);
CREATE OR REPLACE FUNCTION get_customers_delta(since_timestamp TIMESTAMPTZ DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    name TEXT,
    tax_number TEXT,
    country TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    postal_code TEXT,
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
            c.city,
            c.postal_code,
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
            c.city,
            c.postal_code,
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
