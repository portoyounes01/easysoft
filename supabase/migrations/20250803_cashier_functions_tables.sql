-- Create tables for cashier function logging
-- Cash drawer operations log
CREATE TABLE IF NOT EXISTS cash_drawer_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('open', 'close', 'test', 'status')),
    reason TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Print operations log
CREATE TABLE IF NOT EXISTS print_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    receipt_type TEXT NOT NULL CHECK (receipt_type IN ('customer', 'merchant', 'test')),
    printer_settings JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cashier test operations log
CREATE TABLE IF NOT EXISTS cashier_tests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    test_type TEXT NOT NULL CHECK (test_type IN ('cash-drawer', 'printer-test', 'full-sequence', 'hardware-check', 'all-tests')),
    test_details JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_cash_drawer_logs_employee_id ON cash_drawer_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_logs_transaction_id ON cash_drawer_logs(transaction_id);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_logs_timestamp ON cash_drawer_logs(timestamp);

CREATE INDEX IF NOT EXISTS idx_print_logs_employee_id ON print_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_print_logs_transaction_id ON print_logs(transaction_id);
CREATE INDEX IF NOT EXISTS idx_print_logs_timestamp ON print_logs(timestamp);

CREATE INDEX IF NOT EXISTS idx_cashier_tests_employee_id ON cashier_tests(employee_id);
CREATE INDEX IF NOT EXISTS idx_cashier_tests_test_type ON cashier_tests(test_type);
CREATE INDEX IF NOT EXISTS idx_cashier_tests_timestamp ON cashier_tests(timestamp);

-- Create RLS policies
ALTER TABLE cash_drawer_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashier_tests ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view their own logs and admins to view all
CREATE POLICY "Users can view own cash drawer logs" ON cash_drawer_logs
    FOR SELECT USING (
        auth.uid()::text IN (
            SELECT id::text FROM employees WHERE id = cash_drawer_logs.employee_id
        ) OR
        auth.uid()::text IN (
            SELECT id::text FROM employees WHERE role = 'admin'
        )
    );

CREATE POLICY "Users can insert cash drawer logs" ON cash_drawer_logs
    FOR INSERT WITH CHECK (
        auth.uid()::text IN (
            SELECT id::text FROM employees WHERE id = cash_drawer_logs.employee_id
        )
    );

CREATE POLICY "Users can view own print logs" ON print_logs
    FOR SELECT USING (
        auth.uid()::text IN (
            SELECT id::text FROM employees WHERE id = print_logs.employee_id
        ) OR
        auth.uid()::text IN (
            SELECT id::text FROM employees WHERE role = 'admin'
        )
    );

CREATE POLICY "Users can insert print logs" ON print_logs
    FOR INSERT WITH CHECK (
        auth.uid()::text IN (
            SELECT id::text FROM employees WHERE id = print_logs.employee_id
        )
    );

CREATE POLICY "Users can view own test logs" ON cashier_tests
    FOR SELECT USING (
        auth.uid()::text IN (
            SELECT id::text FROM employees WHERE id = cashier_tests.employee_id
        ) OR
        auth.uid()::text IN (
            SELECT id::text FROM employees WHERE role = 'admin'
        )
    );

CREATE POLICY "Users can insert test logs" ON cashier_tests
    FOR INSERT WITH CHECK (
        auth.uid()::text IN (
            SELECT id::text FROM employees WHERE id = cashier_tests.employee_id
        )
    );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_cash_drawer_logs_updated_at BEFORE UPDATE ON cash_drawer_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_print_logs_updated_at BEFORE UPDATE ON print_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cashier_tests_updated_at BEFORE UPDATE ON cashier_tests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Heartbeat RPC for lightweight connectivity checks
CREATE OR REPLACE FUNCTION public.ping()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT true;
$$;

REVOKE ALL ON FUNCTION public.ping() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ping() TO anon, authenticated, service_role;
