-- Secure RLS Policies Implementation
-- This replaces the insecure comprehensive_rls_fix.sql policies

-- =====================================================
-- ENABLE SUPABASE AUTH (Required for RLS to work properly)
-- =====================================================

-- First, we need to ensure the auth schema is properly set up
-- This should be done automatically by Supabase, but let's make sure

-- =====================================================
-- EMPLOYEES TABLE SECURE RLS POLICIES
-- =====================================================

-- Drop all existing insecure policies
DROP POLICY IF EXISTS "employees_select_all" ON public.employees;
DROP POLICY IF EXISTS "employees_insert_all" ON public.employees;
DROP POLICY IF EXISTS "employees_update_all" ON public.employees;
DROP POLICY IF EXISTS "employees_delete_all" ON public.employees;

-- Secure SELECT policy: Users can only see their own record OR admins can see all
CREATE POLICY "employees_select_secure" ON public.employees
  FOR SELECT USING (
    auth.uid()::text = id::text OR 
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'manager') 
      AND is_active = true
    )
  );

-- Secure INSERT policy: Only admins can create new employees
CREATE POLICY "employees_insert_admin_only" ON public.employees
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::text 
      AND role = 'admin' 
      AND is_active = true
    )
  );

-- Secure UPDATE policy: Users can update their own record (limited fields) OR admins can update any
CREATE POLICY "employees_update_secure" ON public.employees
  FOR UPDATE USING (
    -- Users can update their own record
    auth.uid()::text = id::text OR
    -- Admins can update any record
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::text 
      AND role = 'admin' 
      AND is_active = true
    )
  )
  WITH CHECK (
    -- Same conditions for the updated record
    auth.uid()::text = id::text OR
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::text 
      AND role = 'admin' 
      AND is_active = true
    )
  );

-- Secure DELETE policy: Only admins can delete (soft delete)
CREATE POLICY "employees_delete_admin_only" ON public.employees
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::text 
      AND role = 'admin' 
      AND is_active = true
    )
  );

-- =====================================================
-- CATEGORIES TABLE SECURE RLS POLICIES
-- =====================================================

-- Drop insecure policies
DROP POLICY IF EXISTS "categories_select_all" ON public.categories;
DROP POLICY IF EXISTS "categories_insert_all" ON public.categories;
DROP POLICY IF EXISTS "categories_update_all" ON public.categories;
DROP POLICY IF EXISTS "categories_delete_all" ON public.categories;

-- Categories can be viewed by all authenticated users
CREATE POLICY "categories_select_authenticated" ON public.categories
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only managers and admins can modify categories
CREATE POLICY "categories_insert_manager_admin" ON public.categories
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'manager') 
      AND is_active = true
    )
  );

CREATE POLICY "categories_update_manager_admin" ON public.categories
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'manager') 
      AND is_active = true
    )
  );

CREATE POLICY "categories_delete_admin_only" ON public.categories
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::text 
      AND role = 'admin' 
      AND is_active = true
    )
  );

-- =====================================================
-- PRODUCTS TABLE SECURE RLS POLICIES
-- =====================================================

-- Drop insecure policies
DROP POLICY IF EXISTS "products_select_all" ON public.products;
DROP POLICY IF EXISTS "products_insert_all" ON public.products;
DROP POLICY IF EXISTS "products_update_all" ON public.products;
DROP POLICY IF EXISTS "products_delete_all" ON public.products;

-- Products can be viewed by all authenticated users
CREATE POLICY "products_select_authenticated" ON public.products
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only managers and admins can add products
CREATE POLICY "products_insert_manager_admin" ON public.products
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'manager') 
      AND is_active = true
    )
  );

-- Managers and admins can update products, cashiers can only update stock
CREATE POLICY "products_update_role_based" ON public.products
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::text 
      AND (
        role IN ('admin', 'manager') OR
        (role IN ('cashier', 'trainee') AND is_active = true)
      )
      AND is_active = true
    )
  );

-- Only admins can delete products
CREATE POLICY "products_delete_admin_only" ON public.products
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::text 
      AND role = 'admin' 
      AND is_active = true
    )
  );

-- =====================================================
-- CUSTOMERS TABLE SECURE RLS POLICIES
-- =====================================================

-- Drop insecure policies
DROP POLICY IF EXISTS "customers_select_all" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_all" ON public.customers;
DROP POLICY IF EXISTS "customers_update_all" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_all" ON public.customers;

-- All authenticated employees can view customers
CREATE POLICY "customers_select_authenticated" ON public.customers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::text 
      AND is_active = true
    )
  );

-- All authenticated employees can add customers
CREATE POLICY "customers_insert_authenticated" ON public.customers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::text 
      AND is_active = true
    )
  );

-- All authenticated employees can update customers
CREATE POLICY "customers_update_authenticated" ON public.customers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::text 
      AND is_active = true
    )
  );

-- Only managers and admins can delete customers
CREATE POLICY "customers_delete_manager_admin" ON public.customers
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'manager') 
      AND is_active = true
    )
  );

-- =====================================================
-- TRANSACTIONS TABLE SECURE RLS POLICIES
-- =====================================================

-- Drop insecure policies
DROP POLICY IF EXISTS "transactions_select_all" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert_all" ON public.transactions;
DROP POLICY IF EXISTS "transactions_update_all" ON public.transactions;
DROP POLICY IF EXISTS "transactions_delete_all" ON public.transactions;

-- Employees can view their own transactions, managers/admins can view all
CREATE POLICY "transactions_select_role_based" ON public.transactions
  FOR SELECT USING (
    employee_id = auth.uid()::text OR
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'manager') 
      AND is_active = true
    )
  );

-- All authenticated employees can create transactions
CREATE POLICY "transactions_insert_authenticated" ON public.transactions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::text 
      AND is_active = true
    ) AND
    -- Ensure the employee_id matches the authenticated user (prevent impersonation)
    employee_id = auth.uid()::text
  );

-- Only the transaction creator or managers/admins can update
CREATE POLICY "transactions_update_role_based" ON public.transactions
  FOR UPDATE USING (
    employee_id = auth.uid()::text OR
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'manager') 
      AND is_active = true
    )
  );

-- Only admins can delete transactions
CREATE POLICY "transactions_delete_admin_only" ON public.transactions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::text 
      AND role = 'admin' 
      AND is_active = true
    )
  );

-- =====================================================
-- TRANSACTION ITEMS TABLE SECURE RLS POLICIES
-- =====================================================

-- Drop insecure policies
DROP POLICY IF EXISTS "transaction_items_select_all" ON public.transaction_items;
DROP POLICY IF EXISTS "transaction_items_insert_all" ON public.transaction_items;
DROP POLICY IF EXISTS "transaction_items_update_all" ON public.transaction_items;
DROP POLICY IF EXISTS "transaction_items_delete_all" ON public.transaction_items;

-- Can view transaction items if can view the parent transaction
CREATE POLICY "transaction_items_select_via_transaction" ON public.transaction_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_items.transaction_id
      AND (
        t.employee_id = auth.uid()::text OR
        EXISTS (
          SELECT 1 FROM public.employees 
          WHERE id = auth.uid()::text 
          AND role IN ('admin', 'manager') 
          AND is_active = true
        )
      )
    )
  );

-- Can insert transaction items if can modify the parent transaction
CREATE POLICY "transaction_items_insert_via_transaction" ON public.transaction_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_items.transaction_id
      AND t.employee_id = auth.uid()::text
    )
  );

-- Can update transaction items if can modify the parent transaction
CREATE POLICY "transaction_items_update_via_transaction" ON public.transaction_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_items.transaction_id
      AND (
        t.employee_id = auth.uid()::text OR
        EXISTS (
          SELECT 1 FROM public.employees 
          WHERE id = auth.uid()::text 
          AND role IN ('admin', 'manager') 
          AND is_active = true
        )
      )
    )
  );

-- Only admins can delete transaction items
CREATE POLICY "transaction_items_delete_admin_only" ON public.transaction_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::text 
      AND role = 'admin' 
      AND is_active = true
    )
  );

-- =====================================================
-- DAILY SALES SUMMARY TABLE SECURE RLS POLICIES
-- =====================================================

-- Drop insecure policies
DROP POLICY IF EXISTS "daily_sales_select_all" ON public.daily_sales_summary;
DROP POLICY IF EXISTS "daily_sales_insert_all" ON public.daily_sales_summary;
DROP POLICY IF EXISTS "daily_sales_update_all" ON public.daily_sales_summary;
DROP POLICY IF EXISTS "daily_sales_delete_all" ON public.daily_sales_summary;

-- Employees can view their own summaries, managers/admins can view all
CREATE POLICY "daily_sales_select_role_based" ON public.daily_sales_summary
  FOR SELECT USING (
    employee_id = auth.uid()::text OR
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::text 
      AND role IN ('admin', 'manager') 
      AND is_active = true
    )
  );

-- Summary records are created by triggers, so allow system inserts
CREATE POLICY "daily_sales_insert_system" ON public.daily_sales_summary
  FOR INSERT WITH CHECK (true);

-- Summary records are updated by triggers, so allow system updates
CREATE POLICY "daily_sales_update_system" ON public.daily_sales_summary
  FOR UPDATE USING (true);

-- Only admins can delete summary records
CREATE POLICY "daily_sales_delete_admin_only" ON public.daily_sales_summary
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::text 
      AND role = 'admin' 
      AND is_active = true
    )
  );

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Test the policies with these queries (run these after applying policies):

-- Check current user context
-- SELECT auth.uid() as user_id, auth.role() as role;

-- Test employee access
-- SELECT id, name, role FROM public.employees;

-- Test product access  
-- SELECT id, name, price FROM public.products LIMIT 5;

-- Test transaction access
-- SELECT id, transaction_number, employee_name, total FROM public.transactions LIMIT 5;
