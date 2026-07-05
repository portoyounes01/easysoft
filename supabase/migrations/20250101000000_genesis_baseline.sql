-- =====================================================================
-- GENESIS BASELINE — EasySoft POS
-- Reproduces the root-scripts schema state BEFORE the 7 timestamped
-- migrations. genesis + the 7 migrations == supabase.ts end-state.
-- App runs as ANON only (auth.uid() IS NULL) -> no auth.uid()-based logic.
-- Apply order: extensions -> tables(+their triggers) -> sequences ->
-- functions -> views -> storage -> broad anon/authenticated grants ->
-- RLS baseline. No forward references.
-- EXCLUDES: clear_all_transaction_data(); prevent_unauthorized_changes()
--   + its trigger (auth.uid()-based, breaks anon); the columns added by the
--   7 migrations (transactions.discount_type/discount_percentage/fiscal_*,
--   customers.tax_number/country/city/postal_code); root sample-data seeds;
--   auth.uid()/auth.role() RLS from the root scripts (replaced by the
--   anon-scoped baseline at the end).
-- =====================================================================

-- =====================================================================
-- SECTION A — EXTENSIONS + SHARED PREREQUISITE FUNCTIONS
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- updated_at helper used by ALL 7 core-table BEFORE UPDATE triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- PK-immutability guard (auth-independent -> safe under anon)
CREATE OR REPLACE FUNCTION public.prevent_employee_id_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Cannot update primary key id for employees';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- SECTION B — TABLES (FK-ordered) + indexes + per-table triggers
-- =====================================================================

-- 1) EMPLOYEES ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_number TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  password_hash TEXT,
  pin TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'cashier', 'trainee')),
  access_levels TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  hire_date DATE NOT NULL,
  total_sales NUMERIC(10, 2) DEFAULT 0,
  transaction_count INTEGER DEFAULT 0,
  average_transaction NUMERIC(10, 2) DEFAULT 0,
  hours_worked INTEGER DEFAULT 0,
  auth_id UUID,                              -- reconstructed from supabase.ts + edge fn (schema drift; no root/migration source)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  needs_push BOOLEAN DEFAULT false,          -- server-only (delta RPC returns it); omitted from supabase.ts Row
  is_conflicted BOOLEAN DEFAULT false,       -- server-only
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_employees_employee_number ON public.employees(employee_number);
CREATE INDEX IF NOT EXISTS idx_employees_role ON public.employees(role);
CREATE INDEX IF NOT EXISTS idx_employees_is_active ON public.employees(is_active);
CREATE INDEX IF NOT EXISTS idx_employees_updated_at ON public.employees(updated_at);

CREATE OR REPLACE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_prevent_employee_id_update
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.prevent_employee_id_update();

-- EXCLUDED: prevent_unauthorized_changes() + prevent_employees_unauthorized_changes trigger
--   (auth.uid()-based -> under anon always RAISES on legitimate role/employee_number
--    edits synced via upsert_employees; zero security benefit). Kept out of genesis.

-- 2) CATEGORIES --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT 'from-gray-500 to-gray-600',
  icon TEXT DEFAULT 'package',
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  needs_push BOOLEAN DEFAULT FALSE,          -- root added via ALTER ADD COLUMN IF NOT EXISTS; inlined here
  is_conflicted BOOLEAN DEFAULT FALSE,       -- root added via ALTER ADD COLUMN IF NOT EXISTS; inlined here
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_categories_name ON public.categories(name);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON public.categories(is_active);
CREATE INDEX IF NOT EXISTS idx_categories_display_order ON public.categories(display_order);
CREATE INDEX IF NOT EXISTS idx_categories_updated_at ON public.categories(updated_at);

CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) PRODUCTS (FK -> categories) --------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT UNIQUE NOT NULL,
  barcode TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  category_name TEXT,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  cost NUMERIC(10, 2) DEFAULT 0 CHECK (cost >= 0),
  iva_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.23 CHECK (iva_rate >= 0 AND iva_rate <= 1),
  stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 0,
  track_stock BOOLEAN DEFAULT true,
  image_url TEXT,
  supplier TEXT,
  location TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  needs_push BOOLEAN DEFAULT FALSE,          -- root added via ALTER ADD COLUMN IF NOT EXISTS; inlined here
  is_conflicted BOOLEAN DEFAULT FALSE,       -- root added via ALTER ADD COLUMN IF NOT EXISTS; inlined here
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_stock ON public.products(stock);
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON public.products(updated_at);
CREATE INDEX IF NOT EXISTS idx_products_category_active ON public.products(category_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_low_stock ON public.products(stock, min_stock) WHERE track_stock = true;

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) CUSTOMERS ---------------------------------------------------------
-- EXCLUDES tax_number, country, city, postal_code (added by later migrations)
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  total_spent NUMERIC(10, 2) DEFAULT 0,
  transaction_count INTEGER DEFAULT 0,
  loyalty_points INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  preferred_payment_method TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_is_active ON public.customers(is_active);
CREATE INDEX IF NOT EXISTS idx_customers_updated_at ON public.customers(updated_at);

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) TRANSACTIONS (FK -> employees, customers) ------------------------
-- EXCLUDES discount_type, discount_percentage (2025-09-24 discount metadata)
-- EXCLUDES fiscal_* columns (20260413 + 20260420130000)
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_number TEXT UNIQUE NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  employee_name TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT,
  transaction_date DATE NOT NULL,
  transaction_time TIME NOT NULL,
  subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
  discount NUMERIC(10, 2) DEFAULT 0 CHECK (discount >= 0),
  tax NUMERIC(10, 2) NOT NULL CHECK (tax >= 0),
  total NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'mixed')),
  amount_paid NUMERIC(10, 2),
  change_given NUMERIC(10, 2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'refunded', 'partial_refund', 'pending', 'cancelled')),
  notes TEXT,
  receipt_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_transactions_number ON public.transactions(transaction_number);
CREATE INDEX IF NOT EXISTS idx_transactions_employee_id ON public.transactions(employee_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON public.transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_method ON public.transactions(payment_method);
CREATE INDEX IF NOT EXISTS idx_transactions_updated_at ON public.transactions(updated_at);
CREATE INDEX IF NOT EXISTS idx_transactions_date_employee ON public.transactions(transaction_date, employee_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date_status ON public.transactions(transaction_date, status);

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) TRANSACTION_ITEMS (FK -> transactions CASCADE, products) ---------
-- discount_amount + discount_percentage ARE genesis columns here (root-level),
-- distinct from the transactions-level discount metadata migration.
CREATE TABLE IF NOT EXISTS public.transaction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  product_sku TEXT NOT NULL,
  category_id UUID,
  category_name TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  unit_cost NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  iva_rate NUMERIC(5, 4) NOT NULL CHECK (iva_rate >= 0 AND iva_rate <= 1),
  line_total NUMERIC(10, 2) NOT NULL CHECK (line_total >= 0),
  tax_amount NUMERIC(10, 2) NOT NULL CHECK (tax_amount >= 0),
  profit_amount NUMERIC(10, 2) DEFAULT 0,
  discount_amount NUMERIC(10, 2) DEFAULT 0 CHECK (discount_amount >= 0),
  discount_percentage NUMERIC(5, 2) DEFAULT 0 CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_id ON public.transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_product_id ON public.transaction_items(product_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_category_id ON public.transaction_items(category_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_updated_at ON public.transaction_items(updated_at);
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_product ON public.transaction_items(transaction_id, product_id);

CREATE TRIGGER update_transaction_items_updated_at
  BEFORE UPDATE ON public.transaction_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7) DAILY_SALES_SUMMARY (composite PK; FK -> employees) --------------
CREATE TABLE IF NOT EXISTS public.daily_sales_summary (
  summary_date DATE NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  total_sales NUMERIC(10, 2) NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  items_sold INTEGER NOT NULL DEFAULT 0,
  average_transaction NUMERIC(10, 2) DEFAULT 0,
  cash_sales NUMERIC(10, 2) DEFAULT 0,
  card_sales NUMERIC(10, 2) DEFAULT 0,
  mixed_sales NUMERIC(10, 2) DEFAULT 0,
  total_tax NUMERIC(10, 2) DEFAULT 0,
  total_profit NUMERIC(10, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (summary_date, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_summary_date ON public.daily_sales_summary(summary_date);
CREATE INDEX IF NOT EXISTS idx_daily_summary_employee ON public.daily_sales_summary(employee_id);

CREATE TRIGGER update_daily_sales_summary_updated_at
  BEFORE UPDATE ON public.daily_sales_summary
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Daily-summary maintenance function + AFTER trigger on transactions ---
CREATE OR REPLACE FUNCTION public.update_daily_sales_summary()
RETURNS TRIGGER AS $$
DECLARE
  summary_data RECORD;
  target_date DATE;
  target_employee_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_date := OLD.transaction_date;
    target_employee_id := OLD.employee_id;
  ELSE
    target_date := NEW.transaction_date;
    target_employee_id := NEW.employee_id;
  END IF;

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

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_daily_summary_on_transaction_change
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_daily_sales_summary();

-- =====================================================================
-- SECTION C — SEQUENCE + transaction-number generator
-- =====================================================================
DROP FUNCTION IF EXISTS public.generate_transaction_number();

CREATE SEQUENCE IF NOT EXISTS public.transaction_number_sequence
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO CYCLE;

CREATE OR REPLACE FUNCTION public.generate_transaction_number()
RETURNS TEXT AS $$
DECLARE
  current_date_str TEXT;
  sequence_num BIGINT;
  transaction_num TEXT;
BEGIN
  current_date_str := to_char(CURRENT_DATE, 'YYYYMMDD');
  sequence_num := nextval('public.transaction_number_sequence');
  IF sequence_num > 9999 THEN
    PERFORM setval('public.transaction_number_sequence', 1, false);
    sequence_num := nextval('public.transaction_number_sequence');
  END IF;
  transaction_num := 'TXN' || current_date_str || LPAD(sequence_num::TEXT, 4, '0');
  RETURN transaction_num;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.generate_transaction_number() TO anon, authenticated;
GRANT USAGE ON SEQUENCE public.transaction_number_sequence TO anon, authenticated;
COMMENT ON FUNCTION public.generate_transaction_number() IS 'Generates unique transaction numbers using atomic sequence to prevent race conditions';

-- =====================================================================
-- SECTION D — RPC / HELPER FUNCTIONS (all reference existing tables)
-- =====================================================================

-- (D.1) calculate_transaction_totals(UUID)
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
COMMENT ON FUNCTION public.calculate_transaction_totals(UUID) IS 'Calculates totals for a transaction based on its items';

-- (D.2) get_transactions_delta(TIMESTAMPTZ) — SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.get_transactions_delta(last_sync_timestamp TIMESTAMPTZ DEFAULT '1970-01-01'::TIMESTAMPTZ)
RETURNS TABLE (
  id UUID, transaction_number TEXT, employee_id UUID, employee_name TEXT,
  customer_id UUID, customer_name TEXT, transaction_date DATE, transaction_time TIME,
  subtotal NUMERIC, discount NUMERIC, tax NUMERIC, total NUMERIC,
  payment_method TEXT, amount_paid NUMERIC, change_given NUMERIC, status TEXT,
  notes TEXT, receipt_number TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ
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

-- (D.3) get_transaction_items_delta(TIMESTAMPTZ) — SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.get_transaction_items_delta(last_sync_timestamp TIMESTAMPTZ DEFAULT '1970-01-01'::TIMESTAMPTZ)
RETURNS TABLE (
  id UUID, transaction_id UUID, product_id UUID, product_name TEXT, product_sku TEXT,
  category_id UUID, category_name TEXT, quantity INTEGER, unit_price NUMERIC, unit_cost NUMERIC,
  iva_rate NUMERIC, line_total NUMERIC, tax_amount NUMERIC, profit_amount NUMERIC,
  discount_amount NUMERIC, discount_percentage NUMERIC, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ
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

-- (D.4) get_employees_delta(TIMESTAMPTZ) — SECURITY DEFINER
--   NOTE: returns password_hash + pin (live credential exposure; app needs
--   hashes client-side to verify PINs). KEEP AS-IS until Phase 2.
DROP FUNCTION IF EXISTS public.get_employees_delta(TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.upsert_employees(JSONB);
CREATE OR REPLACE FUNCTION public.get_employees_delta(since_timestamp TIMESTAMPTZ DEFAULT '1970-01-01'::TIMESTAMPTZ)
RETURNS TABLE (
  id UUID, employee_number TEXT, name TEXT, email TEXT, phone TEXT,
  password_hash TEXT, pin TEXT, role TEXT, access_levels TEXT[], is_active BOOLEAN,
  hire_date DATE, total_sales NUMERIC(10, 2), transaction_count INTEGER, average_transaction NUMERIC(10, 2),
  hours_worked INTEGER, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, last_synced_at TIMESTAMPTZ,
  needs_push BOOLEAN, is_conflicted BOOLEAN, deleted_at TIMESTAMPTZ
)
SECURITY DEFINER
LANGUAGE SQL
AS $$
  SELECT
    e.id, e.employee_number, e.name, e.email, e.phone,
    e.password_hash, e.pin, e.role, e.access_levels, e.is_active,
    e.hire_date, e.total_sales, e.transaction_count, e.average_transaction,
    e.hours_worked, e.created_at, e.updated_at, e.last_synced_at,
    e.needs_push, e.is_conflicted, e.deleted_at
  FROM public.employees e
  WHERE e.updated_at > since_timestamp
  ORDER BY e.updated_at ASC;
$$;

-- (D.5) upsert_employees(JSONB) — SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.upsert_employees(employees_data JSONB)
RETURNS INTEGER AS $$
DECLARE
  emp_record RECORD;
  upserted_count INTEGER := 0;
BEGIN
  FOR emp_record IN SELECT * FROM jsonb_to_recordset(employees_data) AS x(
    id UUID,
    employee_number TEXT,
    name TEXT,
    email TEXT,
    phone TEXT,
    password_hash TEXT,
    pin TEXT,
    role TEXT,
    access_levels TEXT[],
    is_active BOOLEAN,
    hire_date DATE,
    total_sales NUMERIC(10, 2),
    transaction_count INTEGER,
    average_transaction NUMERIC(10, 2),
    hours_worked INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ,
    needs_push BOOLEAN,
    is_conflicted BOOLEAN,
    deleted_at TIMESTAMPTZ
  )
  LOOP
    INSERT INTO public.employees (
      id, employee_number, name, email, phone, password_hash, pin,
      role, access_levels, is_active, hire_date, total_sales,
      transaction_count, average_transaction, hours_worked,
      created_at, updated_at, last_synced_at, needs_push, is_conflicted, deleted_at
    ) VALUES (
      emp_record.id,
      emp_record.employee_number,
      emp_record.name,
      emp_record.email,
      emp_record.phone,
      emp_record.password_hash,
      emp_record.pin,
      emp_record.role,
      emp_record.access_levels,
      emp_record.is_active,
      emp_record.hire_date,
      emp_record.total_sales,
      emp_record.transaction_count,
      emp_record.average_transaction,
      emp_record.hours_worked,
      COALESCE(emp_record.created_at, NOW()),
      NOW(),
      emp_record.last_synced_at,
      COALESCE(emp_record.needs_push, false),
      COALESCE(emp_record.is_conflicted, false),
      emp_record.deleted_at
    )
    ON CONFLICT (employee_number)
    DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      password_hash = EXCLUDED.password_hash,
      pin = EXCLUDED.pin,
      role = EXCLUDED.role,
      access_levels = EXCLUDED.access_levels,
      is_active = EXCLUDED.is_active,
      hire_date = EXCLUDED.hire_date,
      total_sales = EXCLUDED.total_sales,
      transaction_count = EXCLUDED.transaction_count,
      average_transaction = EXCLUDED.average_transaction,
      hours_worked = EXCLUDED.hours_worked,
      updated_at = NOW(),
      last_synced_at = EXCLUDED.last_synced_at,
      needs_push = EXCLUDED.needs_push,
      is_conflicted = EXCLUDED.is_conflicted,
      deleted_at = EXCLUDED.deleted_at;

    upserted_count := upserted_count + 1;
  END LOOP;

  RETURN upserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- (D.6) upsert_employees_with_mapping(JSONB) — SECURITY DEFINER
DROP FUNCTION IF EXISTS public.upsert_employees_with_mapping(JSONB);
CREATE OR REPLACE FUNCTION public.upsert_employees_with_mapping(employees_data JSONB)
RETURNS TABLE (
  input_id UUID,
  employee_number TEXT,
  persisted_id UUID,
  was_inserted BOOLEAN
) AS $$
DECLARE
  emp_record RECORD;
  existed BOOLEAN;
BEGIN
  FOR emp_record IN SELECT * FROM jsonb_to_recordset(employees_data) AS x(
    id UUID,
    employee_number TEXT,
    name TEXT,
    email TEXT,
    phone TEXT,
    password_hash TEXT,
    pin TEXT,
    role TEXT,
    access_levels TEXT[],
    is_active BOOLEAN,
    hire_date DATE,
    total_sales NUMERIC(10, 2),
    transaction_count INTEGER,
    average_transaction NUMERIC(10, 2),
    hours_worked INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ,
    needs_push BOOLEAN,
    is_conflicted BOOLEAN,
    deleted_at TIMESTAMPTZ
  )
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM public.employees e WHERE e.employee_number = emp_record.employee_number
    ) INTO existed;

    INSERT INTO public.employees (
      id, employee_number, name, email, phone, password_hash, pin,
      role, access_levels, is_active, hire_date, total_sales,
      transaction_count, average_transaction, hours_worked,
      created_at, updated_at, last_synced_at, needs_push, is_conflicted, deleted_at
    ) VALUES (
      emp_record.id,
      emp_record.employee_number,
      emp_record.name,
      emp_record.email,
      emp_record.phone,
      emp_record.password_hash,
      emp_record.pin,
      emp_record.role,
      emp_record.access_levels,
      emp_record.is_active,
      emp_record.hire_date,
      emp_record.total_sales,
      emp_record.transaction_count,
      emp_record.average_transaction,
      emp_record.hours_worked,
      COALESCE(emp_record.created_at, NOW()),
      NOW(),
      emp_record.last_synced_at,
      COALESCE(emp_record.needs_push, false),
      COALESCE(emp_record.is_conflicted, false),
      emp_record.deleted_at
    )
    ON CONFLICT (employee_number)
    DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      password_hash = EXCLUDED.password_hash,
      pin = EXCLUDED.pin,
      role = EXCLUDED.role,
      access_levels = EXCLUDED.access_levels,
      is_active = EXCLUDED.is_active,
      hire_date = EXCLUDED.hire_date,
      total_sales = EXCLUDED.total_sales,
      transaction_count = EXCLUDED.transaction_count,
      average_transaction = EXCLUDED.average_transaction,
      hours_worked = EXCLUDED.hours_worked,
      updated_at = NOW(),
      last_synced_at = EXCLUDED.last_synced_at,
      needs_push = EXCLUDED.needs_push,
      is_conflicted = EXCLUDED.is_conflicted,
      deleted_at = EXCLUDED.deleted_at;

    RETURN QUERY
    SELECT emp_record.id AS input_id,
           emp_record.employee_number AS employee_number,
           e.id AS persisted_id,
           (NOT existed) AS was_inserted
    FROM public.employees e
    WHERE e.employee_number = emp_record.employee_number;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- (D.7) merge_employee_records(UUID, UUID) — SECURITY DEFINER
DROP FUNCTION IF EXISTS public.merge_employee_records(UUID, UUID);
CREATE OR REPLACE FUNCTION public.merge_employee_records(source_id UUID, target_id UUID)
RETURNS VOID AS $$
BEGIN
  IF source_id = target_id THEN
    RETURN;
  END IF;

  UPDATE public.transactions SET employee_id = target_id WHERE employee_id = source_id;
  UPDATE public.daily_sales_summary SET employee_id = target_id WHERE employee_id = source_id;

  UPDATE public.employees tgt
  SET total_sales = COALESCE(tgt.total_sales, 0) + COALESCE(src.total_sales, 0),
      transaction_count = COALESCE(tgt.transaction_count, 0) + COALESCE(src.transaction_count, 0),
      average_transaction = COALESCE(tgt.average_transaction, 0)
  FROM public.employees src
  WHERE src.id = source_id AND tgt.id = target_id;

  UPDATE public.employees SET deleted_at = NOW(), is_active = false WHERE id = source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- (D.8) get_categories_delta(TIMESTAMPTZ) — SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.get_categories_delta(last_sync_timestamp TIMESTAMPTZ DEFAULT '1970-01-01'::TIMESTAMPTZ)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  color TEXT,
  icon TEXT,
  display_order INTEGER,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  needs_push BOOLEAN,
  is_conflicted BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id, c.name, c.description, c.color, c.icon, c.display_order,
    c.is_active, c.created_at, c.updated_at, c.deleted_at,
    COALESCE(c.needs_push, FALSE) as needs_push,
    COALESCE(c.is_conflicted, FALSE) as is_conflicted
  FROM public.categories c
  WHERE c.updated_at > last_sync_timestamp
  ORDER BY c.updated_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- (D.9) get_products_delta(TIMESTAMPTZ) — SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.get_products_delta(last_sync_timestamp TIMESTAMPTZ DEFAULT '1970-01-01'::TIMESTAMPTZ)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  sku TEXT,
  barcode TEXT,
  category_id UUID,
  category_name TEXT,
  price NUMERIC,
  cost NUMERIC,
  iva_rate NUMERIC,
  stock INTEGER,
  min_stock INTEGER,
  track_stock BOOLEAN,
  image_url TEXT,
  supplier TEXT,
  location TEXT,
  is_active BOOLEAN,
  display_order INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  needs_push BOOLEAN,
  is_conflicted BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.name, p.description, p.sku, p.barcode, p.category_id, p.category_name,
    p.price, p.cost, p.iva_rate, p.stock, p.min_stock, p.track_stock,
    p.image_url, p.supplier, p.location, p.is_active, p.display_order,
    p.created_at, p.updated_at, p.deleted_at,
    COALESCE(p.needs_push, FALSE) as needs_push,
    COALESCE(p.is_conflicted, FALSE) as is_conflicted
  FROM public.products p
  WHERE p.updated_at > last_sync_timestamp
  ORDER BY p.updated_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- (D.10) upsert_categories(JSONB) — SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.upsert_categories(categories_data JSONB)
RETURNS INTEGER AS $$
DECLARE
  category_record RECORD;
  upserted_count INTEGER := 0;
BEGIN
  FOR category_record IN
    SELECT * FROM jsonb_to_recordset(categories_data) AS x(
      id UUID, name TEXT, description TEXT, color TEXT, icon TEXT,
      display_order INTEGER, is_active BOOLEAN, created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ, needs_push BOOLEAN,
      is_conflicted BOOLEAN
    )
  LOOP
    INSERT INTO public.categories (
      id, name, description, color, icon, display_order, is_active,
      created_at, updated_at, deleted_at, needs_push, is_conflicted
    ) VALUES (
      category_record.id, category_record.name, category_record.description,
      category_record.color, category_record.icon, category_record.display_order,
      category_record.is_active, category_record.created_at, category_record.updated_at,
      category_record.deleted_at, COALESCE(category_record.needs_push, FALSE),
      COALESCE(category_record.is_conflicted, FALSE)
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      color = EXCLUDED.color,
      icon = EXCLUDED.icon,
      display_order = EXCLUDED.display_order,
      is_active = EXCLUDED.is_active,
      updated_at = EXCLUDED.updated_at,
      deleted_at = EXCLUDED.deleted_at,
      needs_push = EXCLUDED.needs_push,
      is_conflicted = EXCLUDED.is_conflicted
    WHERE public.categories.updated_at < EXCLUDED.updated_at;

    upserted_count := upserted_count + 1;
  END LOOP;

  RETURN upserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- (D.11) upsert_products(JSONB) — SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.upsert_products(products_data JSONB)
RETURNS INTEGER AS $$
DECLARE
  product_record RECORD;
  upserted_count INTEGER := 0;
BEGIN
  FOR product_record IN
    SELECT * FROM jsonb_to_recordset(products_data) AS x(
      id UUID, name TEXT, description TEXT, sku TEXT, barcode TEXT,
      category_id UUID, category_name TEXT, price NUMERIC, cost NUMERIC,
      iva_rate NUMERIC, stock INTEGER, min_stock INTEGER, track_stock BOOLEAN,
      image_url TEXT, supplier TEXT, location TEXT, is_active BOOLEAN,
      display_order INTEGER, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ, needs_push BOOLEAN, is_conflicted BOOLEAN
    )
  LOOP
    INSERT INTO public.products (
      id, name, description, sku, barcode, category_id, category_name,
      price, cost, iva_rate, stock, min_stock, track_stock, image_url,
      supplier, location, is_active, display_order, created_at, updated_at,
      deleted_at, needs_push, is_conflicted
    ) VALUES (
      product_record.id, product_record.name, product_record.description,
      product_record.sku, product_record.barcode, product_record.category_id,
      product_record.category_name, product_record.price, product_record.cost,
      product_record.iva_rate, product_record.stock, product_record.min_stock,
      product_record.track_stock, product_record.image_url, product_record.supplier,
      product_record.location, product_record.is_active, product_record.display_order,
      product_record.created_at, product_record.updated_at, product_record.deleted_at,
      COALESCE(product_record.needs_push, FALSE), COALESCE(product_record.is_conflicted, FALSE)
    )
    ON CONFLICT (sku) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      barcode = EXCLUDED.barcode,
      category_id = EXCLUDED.category_id,
      category_name = EXCLUDED.category_name,
      price = EXCLUDED.price,
      cost = EXCLUDED.cost,
      iva_rate = EXCLUDED.iva_rate,
      stock = EXCLUDED.stock,
      min_stock = EXCLUDED.min_stock,
      track_stock = EXCLUDED.track_stock,
      image_url = EXCLUDED.image_url,
      supplier = EXCLUDED.supplier,
      location = EXCLUDED.location,
      is_active = EXCLUDED.is_active,
      display_order = EXCLUDED.display_order,
      updated_at = EXCLUDED.updated_at,
      deleted_at = EXCLUDED.deleted_at,
      needs_push = EXCLUDED.needs_push,
      is_conflicted = EXCLUDED.is_conflicted
    WHERE public.products.updated_at < EXCLUDED.updated_at;

    upserted_count := upserted_count + 1;
  END LOOP;

  RETURN upserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- (D.12) upsert_transaction_with_items(JSONB, JSONB) — SECURITY DEFINER
--   GENESIS = PRE-FISCAL original (zero fiscal columns). The final fiscal
--   version is re-created by migration 20260420130000_at_cert_phase1.sql.
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
    BEGIN
        txn_id := (transaction_data->>'id')::UUID;

        INSERT INTO transactions (
            id, transaction_number, employee_id, employee_name, customer_id, customer_name,
            transaction_date, transaction_time, subtotal, discount, tax, total,
            payment_method, amount_paid, change_given, status, notes, receipt_number,
            created_at, updated_at, deleted_at
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

        DELETE FROM transaction_items
        WHERE transaction_id = txn_id;

        FOR item_record IN SELECT * FROM jsonb_array_elements(items_data)
        LOOP
            INSERT INTO transaction_items (
                id, transaction_id, product_id, product_name, product_sku,
                category_id, category_name, quantity, unit_price, unit_cost,
                iva_rate, line_total, tax_amount, profit_amount,
                discount_amount, discount_percentage, created_at, updated_at, deleted_at
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

        result_success := true;
        result_error := NULL;

    EXCEPTION
        WHEN OTHERS THEN
            result_success := false;
            result_error := SQLERRM;
    END;

    transaction_id := txn_id;
    success := result_success;
    error := result_error;
    RETURN NEXT;

    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_transaction_with_items(JSONB, JSONB) TO authenticated;

-- (D.13) upsert_customers(JSONB) — SECURITY DEFINER — GENESIS ORIGINAL
--   (NO tax_number/country/city/postal_code; re-created by later migrations)
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
                id, name, email, phone, address, total_spent, transaction_count,
                loyalty_points, is_active, preferred_payment_method, created_at, updated_at, deleted_at
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

GRANT EXECUTE ON FUNCTION upsert_customers(JSONB) TO authenticated;

-- (D.14) get_customers_delta(TIMESTAMPTZ) — SECURITY DEFINER — GENESIS ORIGINAL
--   (14-column signature; re-created by later migrations)
CREATE OR REPLACE FUNCTION get_customers_delta(since_timestamp TIMESTAMPTZ DEFAULT NULL)
RETURNS TABLE (
    id UUID, name TEXT, email TEXT, phone TEXT, address TEXT,
    total_spent DECIMAL(10,2), transaction_count INTEGER, loyalty_points INTEGER,
    is_active BOOLEAN, preferred_payment_method TEXT,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, last_synced_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF since_timestamp IS NULL THEN
        RETURN QUERY
        SELECT c.id, c.name, c.email, c.phone, c.address, c.total_spent, c.transaction_count,
               c.loyalty_points, c.is_active, c.preferred_payment_method,
               c.created_at, c.updated_at, c.last_synced_at, c.deleted_at
        FROM customers c ORDER BY c.updated_at DESC LIMIT 1000;
    ELSE
        RETURN QUERY
        SELECT c.id, c.name, c.email, c.phone, c.address, c.total_spent, c.transaction_count,
               c.loyalty_points, c.is_active, c.preferred_payment_method,
               c.created_at, c.updated_at, c.last_synced_at, c.deleted_at
        FROM customers c WHERE c.updated_at > since_timestamp ORDER BY c.updated_at DESC LIMIT 1000;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION get_customers_delta(TIMESTAMPTZ) TO authenticated;

-- =====================================================================
-- SECTION E — VIEWS (security_invoker baked in; PG15+). Nested view
-- active_products_with_categories precedes low_stock_products.
-- =====================================================================
CREATE OR REPLACE VIEW public.active_products_with_categories
WITH (security_invoker = true) AS
SELECT
  p.*,
  c.name as category_display_name,
  c.color as category_color,
  c.icon as category_icon,
  CASE
    WHEN p.track_stock AND p.stock <= p.min_stock THEN 'low_stock'
    WHEN p.track_stock AND p.stock = 0 THEN 'out_of_stock'
    ELSE 'in_stock'
  END as stock_status
FROM public.products p
LEFT JOIN public.categories c ON p.category_id = c.id
WHERE p.is_active = true AND p.deleted_at IS NULL
ORDER BY p.display_order, p.name;

CREATE OR REPLACE VIEW public.low_stock_products
WITH (security_invoker = true) AS
SELECT *
FROM public.active_products_with_categories
WHERE stock_status IN ('low_stock', 'out_of_stock')
ORDER BY stock_status DESC, stock ASC;

CREATE OR REPLACE VIEW public.transaction_details
WITH (security_invoker = true) AS
SELECT
  t.id, t.transaction_number, t.employee_id, t.employee_name, t.customer_id, t.customer_name,
  t.transaction_date, t.transaction_time, t.subtotal, t.discount, t.tax, t.total,
  t.payment_method, t.status, t.created_at,
  COALESCE(
    json_agg(
      json_build_object(
        'id', ti.id, 'product_id', ti.product_id, 'product_name', ti.product_name,
        'product_sku', ti.product_sku, 'category_id', ti.category_id, 'category_name', ti.category_name,
        'quantity', ti.quantity, 'unit_price', ti.unit_price, 'unit_cost', ti.unit_cost,
        'iva_rate', ti.iva_rate, 'line_total', ti.line_total, 'tax_amount', ti.tax_amount,
        'profit_amount', ti.profit_amount, 'discount_amount', ti.discount_amount
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

-- =====================================================================
-- SECTION F — STORAGE (product-images bucket + policies)
-- =====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Allow authenticated updates" ON storage.objects;
CREATE POLICY "Allow authenticated updates"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
CREATE POLICY "Allow authenticated deletes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'product-images');

-- =====================================================================
-- SECTION G — BROAD anon/authenticated GRANTS (verbatim from root
-- transactions script). REQUIRED for the anon app; NOT revoked until
-- Phase 3. EXCLUDES the two clear_all_transaction_data grants.
-- Placed after all tables/sequences/functions exist so it covers them.
-- =====================================================================
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- =====================================================================
-- SECTION H — RLS BASELINE (Phase 0, app-safe). RLS ENABLED on every core
-- table + PERMISSIVE policies scoped TO anon. Reproduces the proven-working
-- permissive behaviour but scoped to anon for a clean Phase 3 swap.
-- =====================================================================

-- employees
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employees_anon_select ON public.employees;
DROP POLICY IF EXISTS employees_anon_insert ON public.employees;
DROP POLICY IF EXISTS employees_anon_update ON public.employees;
DROP POLICY IF EXISTS employees_anon_delete ON public.employees;
CREATE POLICY employees_anon_select ON public.employees FOR SELECT TO anon USING (true);
CREATE POLICY employees_anon_insert ON public.employees FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY employees_anon_update ON public.employees FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY employees_anon_delete ON public.employees FOR DELETE TO anon USING (true);

-- categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS categories_anon_select ON public.categories;
DROP POLICY IF EXISTS categories_anon_insert ON public.categories;
DROP POLICY IF EXISTS categories_anon_update ON public.categories;
DROP POLICY IF EXISTS categories_anon_delete ON public.categories;
CREATE POLICY categories_anon_select ON public.categories FOR SELECT TO anon USING (true);
CREATE POLICY categories_anon_insert ON public.categories FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY categories_anon_update ON public.categories FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY categories_anon_delete ON public.categories FOR DELETE TO anon USING (true);

-- products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS products_anon_select ON public.products;
DROP POLICY IF EXISTS products_anon_insert ON public.products;
DROP POLICY IF EXISTS products_anon_update ON public.products;
DROP POLICY IF EXISTS products_anon_delete ON public.products;
CREATE POLICY products_anon_select ON public.products FOR SELECT TO anon USING (true);
CREATE POLICY products_anon_insert ON public.products FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY products_anon_update ON public.products FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY products_anon_delete ON public.products FOR DELETE TO anon USING (true);

-- customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customers_anon_select ON public.customers;
DROP POLICY IF EXISTS customers_anon_insert ON public.customers;
DROP POLICY IF EXISTS customers_anon_update ON public.customers;
DROP POLICY IF EXISTS customers_anon_delete ON public.customers;
CREATE POLICY customers_anon_select ON public.customers FOR SELECT TO anon USING (true);
CREATE POLICY customers_anon_insert ON public.customers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY customers_anon_update ON public.customers FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY customers_anon_delete ON public.customers FOR DELETE TO anon USING (true);

-- transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transactions_anon_select ON public.transactions;
DROP POLICY IF EXISTS transactions_anon_insert ON public.transactions;
DROP POLICY IF EXISTS transactions_anon_update ON public.transactions;
DROP POLICY IF EXISTS transactions_anon_delete ON public.transactions;
CREATE POLICY transactions_anon_select ON public.transactions FOR SELECT TO anon USING (true);
CREATE POLICY transactions_anon_insert ON public.transactions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY transactions_anon_update ON public.transactions FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY transactions_anon_delete ON public.transactions FOR DELETE TO anon USING (true);

-- transaction_items
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transaction_items_anon_select ON public.transaction_items;
DROP POLICY IF EXISTS transaction_items_anon_insert ON public.transaction_items;
DROP POLICY IF EXISTS transaction_items_anon_update ON public.transaction_items;
DROP POLICY IF EXISTS transaction_items_anon_delete ON public.transaction_items;
CREATE POLICY transaction_items_anon_select ON public.transaction_items FOR SELECT TO anon USING (true);
CREATE POLICY transaction_items_anon_insert ON public.transaction_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY transaction_items_anon_update ON public.transaction_items FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY transaction_items_anon_delete ON public.transaction_items FOR DELETE TO anon USING (true);

-- daily_sales_summary (INSERT+UPDATE mandatory: written by the SECURITY
-- INVOKER trigger update_daily_sales_summary() firing on direct anon
-- transaction INSERT/UPDATE/DELETE)
ALTER TABLE public.daily_sales_summary ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS daily_sales_summary_anon_select ON public.daily_sales_summary;
DROP POLICY IF EXISTS daily_sales_summary_anon_insert ON public.daily_sales_summary;
DROP POLICY IF EXISTS daily_sales_summary_anon_update ON public.daily_sales_summary;
DROP POLICY IF EXISTS daily_sales_summary_anon_delete ON public.daily_sales_summary;
CREATE POLICY daily_sales_summary_anon_select ON public.daily_sales_summary FOR SELECT TO anon USING (true);
CREATE POLICY daily_sales_summary_anon_insert ON public.daily_sales_summary FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY daily_sales_summary_anon_update ON public.daily_sales_summary FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY daily_sales_summary_anon_delete ON public.daily_sales_summary FOR DELETE TO anon USING (true);
