-- Comprehensive RLS fix for all tables
-- This creates very permissive policies that should work

-- =====================================================
-- EMPLOYEES TABLE RLS FIX
-- =====================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Allow read access to employees" ON public.employees;
DROP POLICY IF EXISTS "Allow authenticated users to insert employees" ON public.employees;
DROP POLICY IF EXISTS "Allow authenticated users to update employees" ON public.employees;
DROP POLICY IF EXISTS "Allow authenticated users to delete employees" ON public.employees;

-- Create very permissive policies
CREATE POLICY "employees_select_all" ON public.employees FOR SELECT USING (true);
CREATE POLICY "employees_insert_all" ON public.employees FOR INSERT WITH CHECK (true);
CREATE POLICY "employees_update_all" ON public.employees FOR UPDATE USING (true);
CREATE POLICY "employees_delete_all" ON public.employees FOR DELETE USING (true);

-- =====================================================
-- CATEGORIES TABLE RLS FIX
-- =====================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Categories are viewable by all users" ON public.categories;
DROP POLICY IF EXISTS "Categories are insertable by all users" ON public.categories;
DROP POLICY IF EXISTS "Categories are updatable by all users" ON public.categories;
DROP POLICY IF EXISTS "Categories are deletable by all users" ON public.categories;

-- Create very permissive policies
CREATE POLICY "categories_select_all" ON public.categories FOR SELECT USING (true);
CREATE POLICY "categories_insert_all" ON public.categories FOR INSERT WITH CHECK (true);
CREATE POLICY "categories_update_all" ON public.categories FOR UPDATE USING (true);
CREATE POLICY "categories_delete_all" ON public.categories FOR DELETE USING (true);

-- =====================================================
-- PRODUCTS TABLE RLS FIX
-- =====================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Products are viewable by all users" ON public.products;
DROP POLICY IF EXISTS "Products are insertable by all users" ON public.products;
DROP POLICY IF EXISTS "Products are updatable by all users" ON public.products;
DROP POLICY IF EXISTS "Products are deletable by all users" ON public.products;

-- Create very permissive policies
CREATE POLICY "products_select_all" ON public.products FOR SELECT USING (true);
CREATE POLICY "products_insert_all" ON public.products FOR INSERT WITH CHECK (true);
CREATE POLICY "products_update_all" ON public.products FOR UPDATE USING (true);
CREATE POLICY "products_delete_all" ON public.products FOR DELETE USING (true);

-- =====================================================
-- CUSTOMERS TABLE RLS FIX
-- =====================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Customers are viewable by all users" ON public.customers;
DROP POLICY IF EXISTS "Customers are insertable by all users" ON public.customers;
DROP POLICY IF EXISTS "Customers are updatable by all users" ON public.customers;
DROP POLICY IF EXISTS "Customers are deletable by all users" ON public.customers;

-- Create very permissive policies
CREATE POLICY "customers_select_all" ON public.customers FOR SELECT USING (true);
CREATE POLICY "customers_insert_all" ON public.customers FOR INSERT WITH CHECK (true);
CREATE POLICY "customers_update_all" ON public.customers FOR UPDATE USING (true);
CREATE POLICY "customers_delete_all" ON public.customers FOR DELETE USING (true);

-- =====================================================
-- TRANSACTIONS TABLE RLS FIX
-- =====================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Transactions are viewable by all users" ON public.transactions;
DROP POLICY IF EXISTS "Transactions are insertable by all users" ON public.transactions;
DROP POLICY IF EXISTS "Transactions are updatable by all users" ON public.transactions;
DROP POLICY IF EXISTS "Transactions are deletable by all users" ON public.transactions;

-- Create very permissive policies
CREATE POLICY "transactions_select_all" ON public.transactions FOR SELECT USING (true);
CREATE POLICY "transactions_insert_all" ON public.transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "transactions_update_all" ON public.transactions FOR UPDATE USING (true);
CREATE POLICY "transactions_delete_all" ON public.transactions FOR DELETE USING (true);

-- =====================================================
-- TRANSACTION ITEMS TABLE RLS FIX
-- =====================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Transaction items are viewable by all users" ON public.transaction_items;
DROP POLICY IF EXISTS "Transaction items are insertable by all users" ON public.transaction_items;
DROP POLICY IF EXISTS "Transaction items are updatable by all users" ON public.transaction_items;
DROP POLICY IF EXISTS "Transaction items are deletable by all users" ON public.transaction_items;

-- Create very permissive policies
CREATE POLICY "transaction_items_select_all" ON public.transaction_items FOR SELECT USING (true);
CREATE POLICY "transaction_items_insert_all" ON public.transaction_items FOR INSERT WITH CHECK (true);
CREATE POLICY "transaction_items_update_all" ON public.transaction_items FOR UPDATE USING (true);
CREATE POLICY "transaction_items_delete_all" ON public.transaction_items FOR DELETE USING (true);

-- =====================================================
-- DAILY SALES SUMMARY TABLE RLS FIX
-- =====================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Daily sales summary is viewable by all users" ON public.daily_sales_summary;

-- Create very permissive policies
CREATE POLICY "daily_sales_select_all" ON public.daily_sales_summary FOR SELECT USING (true);
CREATE POLICY "daily_sales_insert_all" ON public.daily_sales_summary FOR INSERT WITH CHECK (true);
CREATE POLICY "daily_sales_update_all" ON public.daily_sales_summary FOR UPDATE USING (true);
CREATE POLICY "daily_sales_delete_all" ON public.daily_sales_summary FOR DELETE USING (true);
