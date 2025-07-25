-- Updated function to safely clear all transaction data
-- This function temporarily disables triggers to avoid constraint violations
CREATE OR REPLACE FUNCTION public.clear_all_transaction_data()
RETURNS void AS $$
BEGIN
  -- Temporarily disable the trigger that causes constraint issues
  ALTER TABLE public.transactions DISABLE TRIGGER update_daily_summary_on_transaction_change;
  
  -- Clear data in proper order to respect foreign key constraints
  -- 1. Clear daily_sales_summary first (references employees)
  DELETE FROM public.daily_sales_summary WHERE summary_date IS NOT NULL;
  
  -- 2. Clear transaction_items (references transactions)
  DELETE FROM public.transaction_items WHERE id IS NOT NULL;
  
  -- 3. Clear transactions (references customers and employees)
  DELETE FROM public.transactions WHERE id IS NOT NULL;
  
  -- 4. Clear customers (no longer referenced)
  DELETE FROM public.customers WHERE id IS NOT NULL;
  
  -- 5. Clear products (no longer referenced)
  DELETE FROM public.products WHERE id IS NOT NULL;
  
  -- 6. Clear categories (no longer referenced)
  DELETE FROM public.categories WHERE id IS NOT NULL;
  
  -- 7. Finally clear employees (no longer referenced)
  DELETE FROM public.employees WHERE id IS NOT NULL;
  
  -- Re-enable the trigger
  ALTER TABLE public.transactions ENABLE TRIGGER update_daily_summary_on_transaction_change;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Make sure to re-enable the trigger even if there's an error
    ALTER TABLE public.transactions ENABLE TRIGGER update_daily_summary_on_transaction_change;
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to anon and authenticated users
GRANT EXECUTE ON FUNCTION public.clear_all_transaction_data() TO anon;
GRANT EXECUTE ON FUNCTION public.clear_all_transaction_data() TO authenticated;