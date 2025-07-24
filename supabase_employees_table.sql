-- Employees table with offline-sync capabilities
-- This table stores employee data with support for bi-directional sync

-- Enable UUID extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create employees table
CREATE TABLE IF NOT EXISTS public.employees (
  -- Primary key: UUID for offline-first compatibility
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Employee identification
  employee_number TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  
  -- Authentication fields
  password_hash TEXT, -- For admin/manager accounts
  pin TEXT, -- For cashier/basic accounts
  
  -- Role and permissions
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'cashier', 'trainee')),
  access_levels TEXT[] DEFAULT '{}',
  
  -- Status and employment info
  is_active BOOLEAN DEFAULT true,
  hire_date DATE NOT NULL,
  
  -- Performance tracking (can be null for new employees)
  total_sales NUMERIC(10, 2) DEFAULT 0,
  transaction_count INTEGER DEFAULT 0,
  average_transaction NUMERIC(10, 2) DEFAULT 0,
  hours_worked INTEGER DEFAULT 0,
  
  -- Sync metadata for offline-first
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  
  -- Offline sync fields
  needs_push BOOLEAN DEFAULT false,
  is_conflicted BOOLEAN DEFAULT false,
  
  -- Soft delete support
  deleted_at TIMESTAMPTZ
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_employees_employee_number ON public.employees(employee_number);
CREATE INDEX IF NOT EXISTS idx_employees_role ON public.employees(role);
CREATE INDEX IF NOT EXISTS idx_employees_is_active ON public.employees(is_active);
CREATE INDEX IF NOT EXISTS idx_employees_updated_at ON public.employees(updated_at);

-- Drop existing constraint and add new one to include 'trainee' role
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE public.employees ADD CONSTRAINT employees_role_check CHECK (role IN ('admin', 'manager', 'cashier', 'trainee'));

-- Add missing sync columns if they don't exist
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS needs_push BOOLEAN DEFAULT false;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS is_conflicted BOOLEAN DEFAULT false;

-- Create function to automatically update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create function to prevent unauthorized field changes
CREATE OR REPLACE FUNCTION public.prevent_unauthorized_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- If this is not an admin making the change, prevent role and employee_number changes
  IF auth.uid()::uuid != NEW.id THEN
    -- Only admins can change other employees
    IF NOT EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = auth.uid()::uuid 
      AND role = 'admin' 
      AND is_active = true 
      AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Only admins can modify other employees';
    END IF;
  ELSE
    -- Employees can't change their own role or employee_number
    IF OLD.role != NEW.role THEN
      RAISE EXCEPTION 'Employees cannot change their own role';
    END IF;
    IF OLD.employee_number != NEW.employee_number THEN
      RAISE EXCEPTION 'Employees cannot change their own employee number';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update updated_at
CREATE OR REPLACE TRIGGER update_employees_updated_at 
  BEFORE UPDATE ON public.employees 
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger to prevent unauthorized changes
CREATE OR REPLACE TRIGGER prevent_employees_unauthorized_changes
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_unauthorized_changes();

-- ===============================
-- RLS POLICIES
-- ===============================
-- Enable Row-Level-Security (RLS)
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies first
DROP POLICY IF EXISTS "Allow read access to active employees" ON public.employees;
DROP POLICY IF EXISTS "Allow employees to update own info" ON public.employees;
DROP POLICY IF EXISTS "Allow authenticated users to insert employees" ON public.employees;
DROP POLICY IF EXISTS "Allow authenticated users to update employees" ON public.employees;
DROP POLICY IF EXISTS "Allow authenticated users to delete employees" ON public.employees;

-- 1️⃣ Allow read access to all employees for authenticated users (including inactive/deleted for admin purposes)
CREATE POLICY "Allow read access to employees" ON public.employees
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));

-- 2️⃣ Allow authenticated users to insert new employees
CREATE POLICY "Allow authenticated users to insert employees" ON public.employees
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- 3️⃣ Allow authenticated users to update employees
CREATE POLICY "Allow authenticated users to update employees" ON public.employees
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 4️⃣ Allow authenticated users to delete employees (soft delete)
CREATE POLICY "Allow authenticated users to delete employees" ON public.employees
  FOR DELETE
  USING (auth.role() = 'authenticated');

-- NOTE ❗️
-- We intentionally removed the previous "Allow admin full access" policy
-- because its self-referential sub-query caused infinite recursion under RLS
-- and produced 500 errors via PostgREST.  If you need full privileged write
-- access from the backend you can:
--   • use the built-in `service_role` key (bypasses RLS), OR
--   • create a Postgres ROLE `app_admin` and GRANT it on this table.
-- Client-side code should not rely on an unrestricted policy.

-- Insert sample data (compatible with existing mock data)
INSERT INTO public.employees (
  employee_number, name, email, phone, role, access_levels, 
  hire_date, password_hash, pin, total_sales, transaction_count, 
  average_transaction, hours_worked
) VALUES 
  (
    'EMP001', 
    'Admin User', 
    'admin@pos.com', 
    '+351 123 456 789', 
    'admin', 
    ARRAY['all'],
    '2024-01-01',
    '$2b$10$dummy_hash_for_password', -- This should be properly hashed 'password'
    NULL,
    15420.50,
    89,
    173.26,
    160
  ),
  (
    'EMP002',
    'Manager Silva',
    'manager@pos.com',
    '+351 123 456 788',
    'manager',
    ARRAY['sales', 'inventory', 'reports', 'dashboard', 'employees', 'settings', 'transactions'],
    '2024-02-01',
    '$2b$10$dummy_hash_for_1234', -- This should be properly hashed '1234'
    '1234',
    12350.75,
    67,
    184.34,
    152
  ),
  (
    'EMP003',
    'Mike Davis',
    'mike.davis@pos.com',
    '+351 123 456 787',
    'cashier',
    ARRAY['sales'],
    '2024-03-01',
    NULL,
    '1234',
    8750.25,
    52,
    168.27,
    140
  ),
  (
    'EMP004',
    'Trainee Costa',
    'trainee@pos.com',
    '+351 123 456 786',
    'trainee',
    ARRAY['sales'],
    '2024-04-01',
    NULL,
    '1234',
    3200.00,
    45,
    71.11,
    80
  )
ON CONFLICT (employee_number) DO NOTHING;

-- Drop existing functions before recreating them
DROP FUNCTION IF EXISTS public.get_employees_delta(TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.upsert_employees(JSONB);

-- Create a function to get employees for sync (returns rows modified after a timestamp)
CREATE OR REPLACE FUNCTION public.get_employees_delta(since_timestamp TIMESTAMPTZ DEFAULT '1970-01-01'::TIMESTAMPTZ)
RETURNS TABLE (
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

-- Create a function for bulk upsert (for syncing local changes to server)
CREATE OR REPLACE FUNCTION public.upsert_employees(employees_data JSONB)
RETURNS TABLE (
  id UUID,
  success BOOLEAN,
  error TEXT
)
SECURITY DEFINER
LANGUAGE PLPGSQL
AS $$
DECLARE
  emp_record RECORD;
  result_id UUID;
  has_error BOOLEAN := false;
  error_msg TEXT := '';
BEGIN
  -- Loop through each employee in the JSON array
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
    BEGIN
      -- Upsert employee record
      INSERT INTO public.employees (
        id, employee_number, name, email, phone, password_hash, pin,
        role, access_levels, is_active, hire_date, total_sales,
        transaction_count, average_transaction, hours_worked,
        created_at, updated_at, last_synced_at, needs_push, is_conflicted, deleted_at
      ) VALUES (
        COALESCE(emp_record.id, gen_random_uuid()),
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
        NOW(), -- Always update the updated_at to current time
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
        deleted_at = EXCLUDED.deleted_at
      RETURNING employees.id INTO result_id;

      -- Return success
      RETURN QUERY SELECT result_id, true, ''::TEXT;
      
    EXCEPTION WHEN OTHERS THEN
      -- Return error
      RETURN QUERY SELECT emp_record.id, false, SQLERRM;
    END;
  END LOOP;
END;
$$; 