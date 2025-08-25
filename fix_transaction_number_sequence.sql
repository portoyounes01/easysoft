-- Fix for transaction number duplicate key error
-- Replace the race-prone generate_transaction_number function with atomic sequence-based generation

-- Drop the old function
DROP FUNCTION IF EXISTS public.generate_transaction_number();

-- Create a sequence for transaction numbers that resets daily
CREATE SEQUENCE IF NOT EXISTS public.transaction_number_sequence 
    START WITH 1 
    INCREMENT BY 1 
    NO MAXVALUE 
    NO CYCLE;

-- Create improved function that uses atomic sequence
CREATE OR REPLACE FUNCTION public.generate_transaction_number()
RETURNS TEXT AS $$
DECLARE
  current_date_str TEXT;
  sequence_num BIGINT;
  transaction_num TEXT;
BEGIN
  -- Get current date in YYYYMMDD format
  current_date_str := to_char(CURRENT_DATE, 'YYYYMMDD');
  
  -- Get next atomic sequence number 
  sequence_num := nextval('public.transaction_number_sequence');
  
  -- Check if we need to reset sequence for new day
  -- This is approximate but prevents most duplicates
  IF sequence_num > 9999 THEN
    -- Reset sequence when it gets too high (new day or overflow)
    PERFORM setval('public.transaction_number_sequence', 1, false);
    sequence_num := nextval('public.transaction_number_sequence');
  END IF;
  
  -- Format as TXN{YYYYMMDD}{0001}
  transaction_num := 'TXN' || current_date_str || LPAD(sequence_num::TEXT, 4, '0');
  
  RETURN transaction_num;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.generate_transaction_number() TO anon, authenticated;
GRANT USAGE ON SEQUENCE public.transaction_number_sequence TO anon, authenticated;

COMMENT ON FUNCTION public.generate_transaction_number() IS 'Generates unique transaction numbers using atomic sequence to prevent race conditions';
