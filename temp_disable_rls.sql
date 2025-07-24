-- Temporary RLS disable for debugging
-- Run this to completely disable RLS and then test

-- Disable RLS entirely for debugging
ALTER TABLE public.employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_sales_summary DISABLE ROW LEVEL SECURITY;

-- Check current auth context
SELECT 
    auth.role() as current_role,
    auth.uid() as current_user_id,
    auth.jwt() as jwt_payload;
