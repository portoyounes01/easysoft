-- Transactions and related tables with offline-sync capabilities
-- This schema stores transaction data with support for bi-directional sync

-- Enable UUID extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- CUSTOMERS TABLE (Optional for transactions)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.customers (
  -- Primary key: UUID for offline-first compatibility
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Customer information
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  
  -- Customer metrics
  total_spent NUMERIC(10, 2) DEFAULT 0,
  transaction_count INTEGER DEFAULT 0,
  loyalty_points INTEGER DEFAULT 0,
  
  -- Status and preferences
  is_active BOOLEAN DEFAULT true,
  preferred_payment_method TEXT,
  
  -- Sync metadata for offline-first
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  
  -- Soft delete support
  deleted_at TIMESTAMPTZ
);

-- =====================================================
-- TRANSACTIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.transactions (
  -- Primary key: UUID for offline-first compatibility
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Transaction identification
  transaction_number TEXT UNIQUE NOT NULL,
  
  -- Relationships
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  employee_name TEXT NOT NULL, -- Denormalized for performance
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT, -- Denormalized for performance
  
  -- Transaction timing
  transaction_date DATE NOT NULL,
  transaction_time TIME NOT NULL,
  
  -- Financial totals
  subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
  discount NUMERIC(10, 2) DEFAULT 0 CHECK (discount >= 0),
  tax NUMERIC(10, 2) NOT NULL CHECK (tax >= 0),
  total NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
  
  -- Payment information
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'mixed')),
  amount_paid NUMERIC(10, 2),
  change_given NUMERIC(10, 2) DEFAULT 0,
  
  -- Transaction status
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'refunded', 'partial_refund', 'pending', 'cancelled')),
  
  -- Additional metadata
  notes TEXT,
  receipt_number TEXT,
  
  -- Sync metadata for offline-first
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  
  -- Soft delete support
  deleted_at TIMESTAMPTZ
);

-- =====================================================
-- TRANSACTION ITEMS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.transaction_items (
  -- Primary key: UUID for offline-first compatibility
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  
  -- Product information (denormalized for performance and historical accuracy)
  product_name TEXT NOT NULL,
  product_sku TEXT NOT NULL,
  category_id UUID,
  category_name TEXT,
  
  -- Pricing and quantities
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  unit_cost NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  iva_rate NUMERIC(5, 4) NOT NULL CHECK (iva_rate >= 0 AND iva_rate <= 1),
  
  -- Calculated totals
  line_total NUMERIC(10, 2) NOT NULL CHECK (line_total >= 0),
  tax_amount NUMERIC(10, 2) NOT NULL CHECK (tax_amount >= 0),
  profit_amount NUMERIC(10, 2) DEFAULT 0,
  
  -- Item-specific discount
  discount_amount NUMERIC(10, 2) DEFAULT 0 CHECK (discount_amount >= 0),
  discount_percentage NUMERIC(5, 2) DEFAULT 0 CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
  
  -- Sync metadata for offline-first
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  
  -- Soft delete support
  deleted_at TIMESTAMPTZ
);

-- =====================================================
-- DAILY SALES SUMMARY TABLE (For performance)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.daily_sales_summary (
  -- Composite primary key
  summary_date DATE NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  
  -- Summary metrics
  total_sales NUMERIC(10, 2) NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  items_sold INTEGER NOT NULL DEFAULT 0,
  average_transaction NUMERIC(10, 2) DEFAULT 0,
  
  -- Payment method breakdown
  cash_sales NUMERIC(10, 2) DEFAULT 0,
  card_sales NUMERIC(10, 2) DEFAULT 0,
  mixed_sales NUMERIC(10, 2) DEFAULT 0,
  
  -- Tax and profit metrics
  total_tax NUMERIC(10, 2) DEFAULT 0,
  total_profit NUMERIC(10, 2) DEFAULT 0,
  
  -- Sync metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  PRIMARY KEY (summary_date, employee_id)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Customers indexes
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_is_active ON public.customers(is_active);
CREATE INDEX IF NOT EXISTS idx_customers_updated_at ON public.customers(updated_at);

-- Transactions indexes
CREATE INDEX IF NOT EXISTS idx_transactions_number ON public.transactions(transaction_number);
CREATE INDEX IF NOT EXISTS idx_transactions_employee_id ON public.transactions(employee_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON public.transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_method ON public.transactions(payment_method);
CREATE INDEX IF NOT EXISTS idx_transactions_updated_at ON public.transactions(updated_at);

-- Transaction items indexes
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_id ON public.transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_product_id ON public.transaction_items(product_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_category_id ON public.transaction_items(category_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_updated_at ON public.transaction_items(updated_at);

-- Daily summary indexes
CREATE INDEX IF NOT EXISTS idx_daily_summary_date ON public.daily_sales_summary(summary_date);
CREATE INDEX IF NOT EXISTS idx_daily_summary_employee ON public.daily_sales_summary(employee_id);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_transactions_date_employee ON public.transactions(transaction_date, employee_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date_status ON public.transactions(transaction_date, status);
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_product ON public.transaction_items(transaction_id, product_id);

-- =====================================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- =====================================================

-- Drop existing triggers first
DROP TRIGGER IF EXISTS update_customers_updated_at ON public.customers;
DROP TRIGGER IF EXISTS update_transactions_updated_at ON public.transactions;
DROP TRIGGER IF EXISTS update_transaction_items_updated_at ON public.transaction_items;
DROP TRIGGER IF EXISTS update_daily_sales_summary_updated_at ON public.daily_sales_summary;

-- Customers trigger
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Transactions trigger
CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Transaction items trigger
CREATE TRIGGER update_transaction_items_updated_at
  BEFORE UPDATE ON public.transaction_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Daily summary trigger
CREATE TRIGGER update_daily_sales_summary_updated_at
  BEFORE UPDATE ON public.daily_sales_summary
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- FUNCTIONS FOR TRANSACTION MANAGEMENT
-- =====================================================

-- Function to generate unique transaction number
CREATE OR REPLACE FUNCTION public.generate_transaction_number()
RETURNS TEXT AS $$
DECLARE
  current_date_str TEXT;
  sequence_num INTEGER;
  transaction_num TEXT;
BEGIN
  -- Get current date in YYYYMMDD format
  current_date_str := to_char(CURRENT_DATE, 'YYYYMMDD');
  
  -- Get next sequence number for today
  SELECT COALESCE(MAX(CAST(SUBSTRING(transaction_number FROM 10) AS INTEGER)), 0) + 1
  INTO sequence_num
  FROM public.transactions
  WHERE transaction_number LIKE 'TXN' || current_date_str || '%';
  
  -- Format as TXN{YYYYMMDD}{0001}
  transaction_num := 'TXN' || current_date_str || LPAD(sequence_num::TEXT, 4, '0');
  
  RETURN transaction_num;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate transaction totals
CREATE OR REPLACE FUNCTION public.calculate_transaction_totals(transaction_uuid UUID)
RETURNS TABLE (
  subtotal NUMERIC(10, 2),
  total_tax NUMERIC(10, 2),
  total_profit NUMERIC(10, 2),
  total_amount NUMERIC(10, 2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    SUM(ti.line_total - ti.tax_amount) as subtotal,
    SUM(ti.tax_amount) as total_tax,
    SUM(ti.profit_amount) as total_profit,
    SUM(ti.line_total) as total_amount
  FROM public.transaction_items ti
  WHERE ti.transaction_id = transaction_uuid
    AND ti.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to update daily sales summary
CREATE OR REPLACE FUNCTION public.update_daily_sales_summary()
RETURNS TRIGGER AS $$
DECLARE
  summary_data RECORD;
  target_date DATE;
  target_employee_id UUID;
BEGIN
  -- Determine which date and employee to update based on operation
  IF TG_OP = 'DELETE' THEN
    target_date := OLD.transaction_date;
    target_employee_id := OLD.employee_id;
  ELSE
    target_date := NEW.transaction_date;
    target_employee_id := NEW.employee_id;
  END IF;

  -- Calculate summary for the transaction date and employee
  SELECT 
    target_date as summary_date,
    target_employee_id as employee_id,
    COALESCE(SUM(t.total), 0) as total_sales,
    COUNT(t.id) as transaction_count,
    COALESCE(SUM(
      (SELECT SUM(ti.quantity) 
       FROM public.transaction_items ti 
       WHERE ti.transaction_id = t.id AND ti.deleted_at IS NULL)
    ), 0) as items_sold,
    CASE 
      WHEN COUNT(t.id) > 0 THEN COALESCE(SUM(t.total), 0) / COUNT(t.id)
      ELSE 0
    END as average_transaction,
    COALESCE(SUM(CASE WHEN t.payment_method = 'cash' THEN t.total ELSE 0 END), 0) as cash_sales,
    COALESCE(SUM(CASE WHEN t.payment_method = 'card' THEN t.total ELSE 0 END), 0) as card_sales,
    COALESCE(SUM(CASE WHEN t.payment_method = 'mixed' THEN t.total ELSE 0 END), 0) as mixed_sales,
    COALESCE(SUM(t.tax), 0) as total_tax,
    COALESCE(SUM(
      (SELECT SUM(ti.profit_amount) 
       FROM public.transaction_items ti 
       WHERE ti.transaction_id = t.id AND ti.deleted_at IS NULL)
    ), 0) as total_profit
  INTO summary_data
  FROM public.transactions t
  WHERE t.transaction_date = target_date
    AND t.employee_id = target_employee_id
    AND t.status = 'completed'
    AND t.deleted_at IS NULL
  GROUP BY target_date, target_employee_id;

  -- Upsert the summary record
  INSERT INTO public.daily_sales_summary (
    summary_date, employee_id, total_sales, transaction_count, items_sold,
    average_transaction, cash_sales, card_sales, mixed_sales, total_tax, total_profit
  ) VALUES (
    summary_data.summary_date, summary_data.employee_id, summary_data.total_sales,
    summary_data.transaction_count, summary_data.items_sold, summary_data.average_transaction,
    summary_data.cash_sales, summary_data.card_sales, summary_data.mixed_sales,
    summary_data.total_tax, summary_data.total_profit
  )
  ON CONFLICT (summary_date, employee_id) 
  DO UPDATE SET
    total_sales = EXCLUDED.total_sales,
    transaction_count = EXCLUDED.transaction_count,
    items_sold = EXCLUDED.items_sold,
    average_transaction = EXCLUDED.average_transaction,
    cash_sales = EXCLUDED.cash_sales,
    card_sales = EXCLUDED.card_sales,
    mixed_sales = EXCLUDED.mixed_sales,
    total_tax = EXCLUDED.total_tax,
    total_profit = EXCLUDED.total_profit,
    updated_at = NOW();

  -- Return appropriate record based on operation
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update daily summary when transactions change
DROP TRIGGER IF EXISTS update_daily_summary_on_transaction_change ON public.transactions;
CREATE TRIGGER update_daily_summary_on_transaction_change
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_daily_sales_summary();

-- =====================================================
-- SYNC HELPER FUNCTIONS
-- =====================================================

-- Get transactions delta for sync
CREATE OR REPLACE FUNCTION public.get_transactions_delta(last_sync_timestamp TIMESTAMPTZ DEFAULT '1970-01-01'::TIMESTAMPTZ)
RETURNS TABLE (
  id UUID,
  transaction_number TEXT,
  employee_id UUID,
  employee_name TEXT,
  customer_id UUID,
  customer_name TEXT,
  transaction_date DATE,
  transaction_time TIME,
  subtotal NUMERIC,
  discount NUMERIC,
  tax NUMERIC,
  total NUMERIC,
  payment_method TEXT,
  amount_paid NUMERIC,
  change_given NUMERIC,
  status TEXT,
  notes TEXT,
  receipt_number TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id, t.transaction_number, t.employee_id, t.employee_name, t.customer_id, t.customer_name,
    t.transaction_date, t.transaction_time, t.subtotal, t.discount, t.tax, t.total,
    t.payment_method, t.amount_paid, t.change_given, t.status, t.notes, t.receipt_number,
    t.created_at, t.updated_at, t.deleted_at
  FROM public.transactions t
  WHERE t.updated_at > last_sync_timestamp
  ORDER BY t.updated_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get transaction items delta for sync
CREATE OR REPLACE FUNCTION public.get_transaction_items_delta(last_sync_timestamp TIMESTAMPTZ DEFAULT '1970-01-01'::TIMESTAMPTZ)
RETURNS TABLE (
  id UUID,
  transaction_id UUID,
  product_id UUID,
  product_name TEXT,
  product_sku TEXT,
  category_id UUID,
  category_name TEXT,
  quantity INTEGER,
  unit_price NUMERIC,
  unit_cost NUMERIC,
  iva_rate NUMERIC,
  line_total NUMERIC,
  tax_amount NUMERIC,
  profit_amount NUMERIC,
  discount_amount NUMERIC,
  discount_percentage NUMERIC,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ti.id, ti.transaction_id, ti.product_id, ti.product_name, ti.product_sku,
    ti.category_id, ti.category_name, ti.quantity, ti.unit_price, ti.unit_cost,
    ti.iva_rate, ti.line_total, ti.tax_amount, ti.profit_amount,
    ti.discount_amount, ti.discount_percentage, ti.created_at, ti.updated_at, ti.deleted_at
  FROM public.transaction_items ti
  WHERE ti.updated_at > last_sync_timestamp
  ORDER BY ti.updated_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_sales_summary ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first
DROP POLICY IF EXISTS "Customers are viewable by authenticated users" ON public.customers;
DROP POLICY IF EXISTS "Customers are insertable by authenticated users" ON public.customers;
DROP POLICY IF EXISTS "Customers are updatable by authenticated users" ON public.customers;
DROP POLICY IF EXISTS "Customers are deletable by authenticated users" ON public.customers;
DROP POLICY IF EXISTS "Transactions are viewable by authenticated users" ON public.transactions;
DROP POLICY IF EXISTS "Transactions are insertable by authenticated users" ON public.transactions;
DROP POLICY IF EXISTS "Transactions are updatable by authenticated users" ON public.transactions;
DROP POLICY IF EXISTS "Transactions are deletable by authenticated users" ON public.transactions;
DROP POLICY IF EXISTS "Transaction items are viewable by authenticated users" ON public.transaction_items;
DROP POLICY IF EXISTS "Transaction items are insertable by authenticated users" ON public.transaction_items;
DROP POLICY IF EXISTS "Transaction items are updatable by authenticated users" ON public.transaction_items;
DROP POLICY IF EXISTS "Transaction items are deletable by authenticated users" ON public.transaction_items;
DROP POLICY IF EXISTS "Daily sales summary is viewable by authenticated users" ON public.daily_sales_summary;

-- Customers policies (allow all operations for anon and authenticated users)
CREATE POLICY "Customers are viewable by all users" ON public.customers
  FOR SELECT USING (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "Customers are insertable by all users" ON public.customers
  FOR INSERT WITH CHECK (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "Customers are updatable by all users" ON public.customers
  FOR UPDATE USING (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "Customers are deletable by all users" ON public.customers
  FOR DELETE USING (auth.role() IN ('anon', 'authenticated'));

-- Transactions policies (allow all operations for anon and authenticated users)
CREATE POLICY "Transactions are viewable by all users" ON public.transactions
  FOR SELECT USING (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "Transactions are insertable by all users" ON public.transactions
  FOR INSERT WITH CHECK (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "Transactions are updatable by all users" ON public.transactions
  FOR UPDATE USING (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "Transactions are deletable by all users" ON public.transactions
  FOR DELETE USING (auth.role() IN ('anon', 'authenticated'));

-- Transaction items policies (allow all operations for anon and authenticated users)
CREATE POLICY "Transaction items are viewable by all users" ON public.transaction_items
  FOR SELECT USING (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "Transaction items are insertable by all users" ON public.transaction_items
  FOR INSERT WITH CHECK (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "Transaction items are updatable by all users" ON public.transaction_items
  FOR UPDATE USING (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "Transaction items are deletable by all users" ON public.transaction_items
  FOR DELETE USING (auth.role() IN ('anon', 'authenticated'));

-- Daily sales summary policies (allow all operations for anon and authenticated users)
CREATE POLICY "Daily sales summary is viewable by all users" ON public.daily_sales_summary
  FOR SELECT USING (auth.role() IN ('anon', 'authenticated'));

-- =====================================================
-- UTILITY VIEWS
-- =====================================================

-- View for transaction details with items
CREATE OR REPLACE VIEW public.transaction_details AS
SELECT 
  t.id,
  t.transaction_number,
  t.employee_id,
  t.employee_name,
  t.customer_id,
  t.customer_name,
  t.transaction_date,
  t.transaction_time,
  t.subtotal,
  t.discount,
  t.tax,
  t.total,
  t.payment_method,
  t.status,
  t.created_at,
  -- Aggregate transaction items
  COALESCE(
    json_agg(
      json_build_object(
        'id', ti.id,
        'product_id', ti.product_id,
        'product_name', ti.product_name,
        'product_sku', ti.product_sku,
        'category_id', ti.category_id,
        'category_name', ti.category_name,
        'quantity', ti.quantity,
        'unit_price', ti.unit_price,
        'unit_cost', ti.unit_cost,
        'iva_rate', ti.iva_rate,
        'line_total', ti.line_total,
        'tax_amount', ti.tax_amount,
        'profit_amount', ti.profit_amount,
        'discount_amount', ti.discount_amount
      ) ORDER BY ti.created_at
    ) FILTER (WHERE ti.id IS NOT NULL),
    '[]'::json
  ) as items
FROM public.transactions t
LEFT JOIN public.transaction_items ti ON t.id = ti.transaction_id AND ti.deleted_at IS NULL
WHERE t.deleted_at IS NULL
GROUP BY t.id, t.transaction_number, t.employee_id, t.employee_name, t.customer_id, t.customer_name,
         t.transaction_date, t.transaction_time, t.subtotal, t.discount, t.tax, t.total,
         t.payment_method, t.status, t.created_at
ORDER BY t.created_at DESC;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE public.customers IS 'Customer information with purchase history tracking';
COMMENT ON TABLE public.transactions IS 'Transaction header information with payment and status details';
COMMENT ON TABLE public.transaction_items IS 'Individual line items for each transaction with pricing and tax details';
COMMENT ON TABLE public.daily_sales_summary IS 'Pre-aggregated daily sales data for performance optimization';
COMMENT ON FUNCTION public.generate_transaction_number() IS 'Generates unique transaction numbers in format TXN{YYYYMMDD}{0001}';
COMMENT ON FUNCTION public.calculate_transaction_totals(UUID) IS 'Calculates totals for a transaction based on its items'; 