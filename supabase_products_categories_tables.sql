-- Products and Categories tables with offline-sync capabilities
-- This schema stores product catalog data with support for bi-directional sync

-- Enable UUID extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- CATEGORIES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.categories (
  -- Primary key: UUID for offline-first compatibility
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Category information
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT 'from-gray-500 to-gray-600', -- Tailwind gradient classes
  icon TEXT DEFAULT 'package', -- Icon name for UI
  
  -- Display order and status
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  
  -- Sync metadata for offline-first
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  
  -- Soft delete support
  deleted_at TIMESTAMPTZ
);

-- =====================================================
-- PRODUCTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.products (
  -- Primary key: UUID for offline-first compatibility
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Product identification
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT UNIQUE NOT NULL,
  barcode TEXT,
  
  -- Category relationship
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  category_name TEXT, -- Denormalized for performance and offline access
  
  -- Pricing and tax
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  cost NUMERIC(10, 2) DEFAULT 0 CHECK (cost >= 0),
  iva_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.23 CHECK (iva_rate >= 0 AND iva_rate <= 1), -- Portuguese IVA rates: 0.06, 0.13, 0.23
  
  -- Inventory management
  stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 0,
  track_stock BOOLEAN DEFAULT true, -- Some products might not need stock tracking
  
  -- Product media and details
  image_url TEXT,
  supplier TEXT,
  location TEXT, -- Storage location in warehouse/store
  
  -- Status and display
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  
  -- Sync metadata for offline-first
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  
  -- Soft delete support
  deleted_at TIMESTAMPTZ
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Categories indexes
CREATE INDEX IF NOT EXISTS idx_categories_name ON public.categories(name);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON public.categories(is_active);
CREATE INDEX IF NOT EXISTS idx_categories_display_order ON public.categories(display_order);
CREATE INDEX IF NOT EXISTS idx_categories_updated_at ON public.categories(updated_at);

-- Products indexes
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_stock ON public.products(stock);
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON public.products(updated_at);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_products_category_active ON public.products(category_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_low_stock ON public.products(stock, min_stock) WHERE track_stock = true;

-- =====================================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- =====================================================

-- Drop existing triggers first
DROP TRIGGER IF EXISTS update_categories_updated_at ON public.categories;
DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;

-- Categories trigger
CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Products trigger
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- SYNC HELPER FUNCTIONS
-- =====================================================

-- Drop existing functions first to avoid return type conflicts
DROP FUNCTION IF EXISTS public.get_categories_delta(TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_products_delta(TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.upsert_categories(JSONB);
DROP FUNCTION IF EXISTS public.upsert_products(JSONB);

-- Get categories delta for sync
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

-- Get products delta for sync
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

-- Bulk upsert categories
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

-- Bulk upsert products
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

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Drop views that depend on the tables before altering table structure
DROP VIEW IF EXISTS public.active_products_with_categories CASCADE;
DROP VIEW IF EXISTS public.low_stock_products CASCADE;

-- Enable RLS
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Add sync columns if they don't exist
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS needs_push BOOLEAN DEFAULT FALSE;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_conflicted BOOLEAN DEFAULT FALSE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS needs_push BOOLEAN DEFAULT FALSE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_conflicted BOOLEAN DEFAULT FALSE;

-- Drop existing policies first
DROP POLICY IF EXISTS "Categories are viewable by authenticated users" ON public.categories;
DROP POLICY IF EXISTS "Categories are insertable by authenticated users" ON public.categories;
DROP POLICY IF EXISTS "Categories are updatable by authenticated users" ON public.categories;
DROP POLICY IF EXISTS "Categories are deletable by authenticated users" ON public.categories;
DROP POLICY IF EXISTS "Products are viewable by authenticated users" ON public.products;
DROP POLICY IF EXISTS "Products are insertable by authenticated users" ON public.products;
DROP POLICY IF EXISTS "Products are updatable by authenticated users" ON public.products;
DROP POLICY IF EXISTS "Products are deletable by authenticated users" ON public.products;

-- Categories policies (allow all operations for anon and authenticated users)
CREATE POLICY "Categories are viewable by all users" ON public.categories
  FOR SELECT USING (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "Categories are insertable by all users" ON public.categories
  FOR INSERT WITH CHECK (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "Categories are updatable by all users" ON public.categories
  FOR UPDATE USING (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "Categories are deletable by all users" ON public.categories
  FOR DELETE USING (auth.role() IN ('anon', 'authenticated'));

-- Products policies (allow all operations for anon and authenticated users)
CREATE POLICY "Products are viewable by all users" ON public.products
  FOR SELECT USING (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "Products are insertable by all users" ON public.products
  FOR INSERT WITH CHECK (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "Products are updatable by all users" ON public.products
  FOR UPDATE USING (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "Products are deletable by all users" ON public.products
  FOR DELETE USING (auth.role() IN ('anon', 'authenticated'));

-- =====================================================
-- SAMPLE DATA
-- =====================================================

-- Insert sample categories
INSERT INTO public.categories (id, name, description, color, icon, display_order) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'Beverages', 'Coffee, tea, sodas, and other drinks', 'from-amber-500 to-orange-600', 'coffee', 1),
  ('550e8400-e29b-41d4-a716-446655440002', 'Dairy', 'Milk, cheese, yogurt, and dairy products', 'from-blue-500 to-cyan-600', 'milk', 2),
  ('550e8400-e29b-41d4-a716-446655440003', 'Bakery', 'Fresh bread, pastries, and baked goods', 'from-yellow-500 to-amber-600', 'cake', 3),
  ('550e8400-e29b-41d4-a716-446655440004', 'Confectionery', 'Chocolates, candies, and sweet treats', 'from-pink-500 to-rose-600', 'candy', 4)
ON CONFLICT (id) DO NOTHING;

-- Insert sample products with Portuguese IVA rates
INSERT INTO public.products (
  id, name, description, sku, category_id, category_name, price, cost, iva_rate, 
  stock, min_stock, image_url, supplier, is_active
) VALUES
  (
    '550e8400-e29b-41d4-a716-446655440101',
    'Premium Coffee Beans',
    'High-quality arabica coffee beans',
    'COF001',
    '550e8400-e29b-41d4-a716-446655440001',
    'Beverages',
    12.50,
    8.00,
    0.23, -- 23% IVA (standard rate)
    45,
    10,
    'https://images.pexels.com/photos/894695/pexels-photo-894695.jpeg?auto=compress&cs=tinysrgb&w=300',
    'Coffee Roasters Ltd',
    true
  ),
  (
    '550e8400-e29b-41d4-a716-446655440102',
    'Organic Milk',
    'Fresh organic whole milk',
    'MLK001',
    '550e8400-e29b-41d4-a716-446655440002',
    'Dairy',
    2.80,
    1.50,
    0.06, -- 6% IVA (reduced rate for basic foods)
    28,
    15,
    'https://images.pexels.com/photos/236010/pexels-photo-236010.jpeg?auto=compress&cs=tinysrgb&w=300',
    'Organic Farms Co',
    true
  ),
  (
    '550e8400-e29b-41d4-a716-446655440103',
    'Artisan Bread',
    'Freshly baked sourdough bread',
    'BRD001',
    '550e8400-e29b-41d4-a716-446655440003',
    'Bakery',
    4.50,
    2.00,
    0.06, -- 6% IVA (reduced rate for basic foods)
    12,
    5,
    'https://images.pexels.com/photos/209206/pexels-photo-209206.jpeg?auto=compress&cs=tinysrgb&w=300',
    'Local Bakery',
    true
  ),
  (
    '550e8400-e29b-41d4-a716-446655440104',
    'Dark Chocolate Bar',
    '85% cocoa premium chocolate',
    'CHC001',
    '550e8400-e29b-41d4-a716-446655440004',
    'Confectionery',
    6.90,
    3.50,
    0.23, -- 23% IVA (standard rate)
    35,
    25,
    'https://images.pexels.com/photos/918327/pexels-photo-918327.jpeg?auto=compress&cs=tinysrgb&w=300',
    'Sweet Treats Inc',
    true
  ),
  (
    '550e8400-e29b-41d4-a716-446655440105',
    'Espresso Machine',
    'Professional grade espresso machine',
    'COF002',
    '550e8400-e29b-41d4-a716-446655440001',
    'Beverages',
    299.99,
    200.00,
    0.23, -- 23% IVA (standard rate)
    0,
    2,
    'https://images.pexels.com/photos/324028/pexels-photo-324028.jpeg?auto=compress&cs=tinysrgb&w=300',
    'Coffee Equipment Ltd',
    true
  ),
  (
    '550e8400-e29b-41d4-a716-446655440106',
    'Greek Yogurt',
    'Creamy Greek-style yogurt',
    'MLK002',
    '550e8400-e29b-41d4-a716-446655440002',
    'Dairy',
    3.20,
    2.00,
    0.06, -- 6% IVA (reduced rate for basic foods)
    20,
    10,
    'https://images.pexels.com/photos/1435903/pexels-photo-1435903.jpeg?auto=compress&cs=tinysrgb&w=300',
    'Greek Dairy Co',
    true
  )
ON CONFLICT (sku) DO NOTHING;

-- =====================================================
-- UTILITY VIEWS
-- =====================================================

-- View for active products with category information
CREATE OR REPLACE VIEW public.active_products_with_categories AS
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

-- View for low stock products
CREATE OR REPLACE VIEW public.low_stock_products AS
SELECT *
FROM public.active_products_with_categories
WHERE stock_status IN ('low_stock', 'out_of_stock')
ORDER BY stock_status DESC, stock ASC;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE public.categories IS 'Product categories with offline sync support';
COMMENT ON TABLE public.products IS 'Product catalog with IVA tax rates and inventory management';
COMMENT ON COLUMN public.products.iva_rate IS 'Portuguese IVA tax rate as decimal (0.06=6%, 0.13=13%, 0.23=23%)';
COMMENT ON COLUMN public.products.track_stock IS 'Whether to track inventory for this product';
COMMENT ON COLUMN public.products.category_name IS 'Denormalized category name for performance and offline access'; 