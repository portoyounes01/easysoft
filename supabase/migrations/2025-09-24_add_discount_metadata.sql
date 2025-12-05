-- Migration: Add persistent discount metadata to transactions
-- Safe to run multiple times (uses IF NOT EXISTS)

-- 1) Add columns
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'none'
  CHECK (discount_type IN ('none','percentage','fixed'));

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5,2) DEFAULT 0
  CHECK (discount_percentage >= 0 AND discount_percentage <= 100);

-- 2) Optional comments
COMMENT ON COLUMN public.transactions.discount_type IS 'Type of discount applied at transaction level: none | percentage | fixed';
COMMENT ON COLUMN public.transactions.discount_percentage IS 'Percentage value when discount_type = percentage';


