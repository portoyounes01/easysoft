# 🗄️ **DELIVERY PLATFORMS DATABASE SCHEMA**

## **📋 Database Schema Extensions**

### **New Tables Required:**

#### **1. delivery_platforms**

```sql
CREATE TABLE delivery_platforms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL, -- 'glovo', 'ubereats', etc.
    display_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    configuration JSONB NOT NULL, -- API keys, webhook URLs, etc.
    store_id VARCHAR(100), -- Platform-specific store identifier
    webhook_secret VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

    UNIQUE(name),
    CONSTRAINT valid_platform_name CHECK (name IN ('glovo', 'ubereats', 'justeat', 'deliveroo'))
);
```

#### **2. delivery_orders**

```sql
CREATE TABLE delivery_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id UUID NOT NULL REFERENCES delivery_platforms(id),
    platform_order_id VARCHAR(100) NOT NULL, -- External order ID
    order_number VARCHAR(50) UNIQUE NOT NULL, -- Internal order number

    -- Customer information
    customer_name VARCHAR(200),
    customer_phone VARCHAR(20),
    customer_notes TEXT,

    -- Order details
    order_time TIMESTAMP WITH TIME ZONE NOT NULL,
    estimated_pickup_time TIMESTAMP WITH TIME ZONE,
    estimated_delivery_time TIMESTAMP WITH TIME ZONE,

    -- Financial
    subtotal DECIMAL(10,2) NOT NULL,
    delivery_fee DECIMAL(10,2) DEFAULT 0,
    platform_fee DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,

    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'received',
    kitchen_status VARCHAR(50) DEFAULT 'pending',

    -- Staff assignment
    assigned_employee_id UUID REFERENCES employees(id),
    accepted_at TIMESTAMP WITH TIME ZONE,
    ready_at TIMESTAMP WITH TIME ZONE,
    picked_up_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancellation_reason TEXT,

    -- Integration
    raw_order_data JSONB, -- Store complete platform order data

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

    UNIQUE(platform_id, platform_order_id),
    CONSTRAINT valid_status CHECK (status IN ('received', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled')),
    CONSTRAINT valid_kitchen_status CHECK (kitchen_status IN ('pending', 'preparing', 'ready', 'completed'))
);
```

#### **3. delivery_order_items**

```sql
CREATE TABLE delivery_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_order_id UUID NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,

    -- Product mapping
    local_product_id UUID REFERENCES products(id),
    platform_product_id VARCHAR(100),

    -- Item details
    item_name VARCHAR(200) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    line_total DECIMAL(10,2) NOT NULL,

    -- Customizations/modifiers
    modifiers JSONB DEFAULT '[]', -- Array of modifications
    special_instructions TEXT,

    -- Kitchen workflow
    kitchen_station_id UUID REFERENCES kitchen_stations(id),
    preparation_status VARCHAR(50) DEFAULT 'pending',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

    CONSTRAINT valid_preparation_status CHECK (preparation_status IN ('pending', 'preparing', 'ready'))
);
```

#### **4. kitchen_stations**

```sql
CREATE TABLE kitchen_stations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    color VARCHAR(7) DEFAULT '#3B82F6', -- Hex color for UI

    -- Hardware integration
    printer_name VARCHAR(100), -- For station-specific printing
    display_terminal VARCHAR(100), -- Terminal/screen identifier

    -- Timing
    estimated_prep_time INTEGER DEFAULT 5, -- Minutes

    -- Status
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

    UNIQUE(name)
);
```

#### **5. platform_product_mappings**

```sql
CREATE TABLE platform_product_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    local_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    platform_id UUID NOT NULL REFERENCES delivery_platforms(id) ON DELETE CASCADE,
    platform_product_id VARCHAR(100) NOT NULL,

    -- Platform-specific data
    platform_name VARCHAR(200),
    platform_description TEXT,
    platform_price DECIMAL(10,2), -- Can override local price
    platform_category VARCHAR(100),

    -- Availability
    is_available BOOLEAN DEFAULT true,
    availability_schedule JSONB, -- Hours when available

    -- Sync tracking
    last_synced_at TIMESTAMP WITH TIME ZONE,
    needs_sync BOOLEAN DEFAULT false,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

    UNIQUE(local_product_id, platform_id),
    UNIQUE(platform_id, platform_product_id)
);
```

#### **6. order_status_history**

```sql
CREATE TABLE order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_order_id UUID NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,

    -- Status change details
    previous_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_by_employee_id UUID REFERENCES employees(id),
    change_reason TEXT,

    -- Timing
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

    -- Additional context
    notes TEXT,
    system_generated BOOLEAN DEFAULT false, -- True for automatic status changes

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

#### **7. kitchen_display_settings**

```sql
CREATE TABLE kitchen_display_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    station_id UUID REFERENCES kitchen_stations(id),
    employee_id UUID REFERENCES employees(id),

    -- Display preferences
    refresh_interval INTEGER DEFAULT 5, -- Seconds
    show_estimated_times BOOLEAN DEFAULT true,
    show_special_instructions BOOLEAN DEFAULT true,
    sort_by VARCHAR(50) DEFAULT 'order_time', -- 'order_time', 'pickup_time', 'priority'

    -- Notification settings
    sound_enabled BOOLEAN DEFAULT true,
    sound_volume INTEGER DEFAULT 70 CHECK (sound_volume BETWEEN 0 AND 100),

    -- UI preferences
    compact_view BOOLEAN DEFAULT false,
    theme VARCHAR(20) DEFAULT 'light',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

    UNIQUE(station_id, employee_id)
);
```

---

## **📊 Database Functions & Triggers**

### **1. Order Number Generation**

```sql
CREATE OR REPLACE FUNCTION generate_delivery_order_number()
RETURNS TEXT AS $$
DECLARE
    new_number TEXT;
    counter INTEGER;
BEGIN
    -- Get today's date in YYYYMMDD format
    SELECT TO_CHAR(CURRENT_DATE, 'YYYYMMDD') INTO new_number;

    -- Get count of orders today
    SELECT COUNT(*) + 1 INTO counter
    FROM delivery_orders
    WHERE DATE(created_at) = CURRENT_DATE;

    -- Format: DEL-20250809-001
    new_number := 'DEL-' || new_number || '-' || LPAD(counter::TEXT, 3, '0');

    RETURN new_number;
END;
$$ LANGUAGE plpgsql;
```

### **2. Automatic Status History Trigger**

```sql
CREATE OR REPLACE FUNCTION track_order_status_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Only track status changes
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO order_status_history (
            delivery_order_id,
            previous_status,
            new_status,
            system_generated
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            true
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER delivery_orders_status_history
    AFTER UPDATE ON delivery_orders
    FOR EACH ROW
    EXECUTE FUNCTION track_order_status_changes();
```

### **3. Kitchen Station Assignment Function**

```sql
CREATE OR REPLACE FUNCTION assign_items_to_stations(order_id UUID)
RETURNS VOID AS $$
DECLARE
    item_record RECORD;
    station_id UUID;
BEGIN
    -- Auto-assign items to stations based on product categories
    FOR item_record IN
        SELECT doi.id, p.category_id, c.name as category_name
        FROM delivery_order_items doi
        LEFT JOIN products p ON doi.local_product_id = p.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE doi.delivery_order_id = order_id
          AND doi.kitchen_station_id IS NULL
    LOOP
        -- Simple station assignment logic (can be enhanced)
        station_id := (
            SELECT ks.id
            FROM kitchen_stations ks
            WHERE ks.is_active = true
            ORDER BY ks.display_order
            LIMIT 1
        );

        UPDATE delivery_order_items
        SET kitchen_station_id = station_id
        WHERE id = item_record.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
```

---

## **🔒 Row Level Security Policies**

### **Delivery Orders**

```sql
-- Enable RLS
ALTER TABLE delivery_orders ENABLE ROW LEVEL SECURITY;

-- Admin/Manager can see all orders
CREATE POLICY delivery_orders_admin_access ON delivery_orders
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM employees
            WHERE id = auth.uid()
            AND role IN ('admin', 'manager')
        )
    );

-- Cashiers can only see orders assigned to them or unassigned
CREATE POLICY delivery_orders_cashier_access ON delivery_orders
    FOR SELECT TO authenticated
    USING (
        assigned_employee_id = auth.uid()
        OR assigned_employee_id IS NULL
        OR EXISTS (
            SELECT 1 FROM employees
            WHERE id = auth.uid()
            AND role = 'cashier'
            AND 'delivery_orders' = ANY(access_levels)
        )
    );
```

### **Kitchen Stations**

```sql
ALTER TABLE kitchen_stations ENABLE ROW LEVEL SECURITY;

-- Kitchen staff can see all active stations
CREATE POLICY kitchen_stations_access ON kitchen_stations
    FOR SELECT TO authenticated
    USING (
        is_active = true
        AND EXISTS (
            SELECT 1 FROM employees
            WHERE id = auth.uid()
            AND ('kitchen' = ANY(access_levels) OR role IN ('admin', 'manager'))
        )
    );
```

---

## **📈 Indexes for Performance**

```sql
-- Order lookup indexes
CREATE INDEX idx_delivery_orders_platform_order_id ON delivery_orders(platform_id, platform_order_id);
CREATE INDEX idx_delivery_orders_status ON delivery_orders(status) WHERE status IN ('received', 'preparing', 'ready');
CREATE INDEX idx_delivery_orders_date ON delivery_orders(DATE(order_time));
CREATE INDEX idx_delivery_orders_assigned_employee ON delivery_orders(assigned_employee_id) WHERE assigned_employee_id IS NOT NULL;

-- Kitchen workflow indexes
CREATE INDEX idx_delivery_order_items_station ON delivery_order_items(kitchen_station_id, preparation_status);
CREATE INDEX idx_delivery_order_items_order ON delivery_order_items(delivery_order_id);

-- Platform mapping indexes
CREATE INDEX idx_platform_mappings_product ON platform_product_mappings(local_product_id, is_available);
CREATE INDEX idx_platform_mappings_platform ON platform_product_mappings(platform_id, is_available);

-- Status history index
CREATE INDEX idx_order_status_history_order ON order_status_history(delivery_order_id, changed_at);
```

---

## **🔄 Migration Strategy**

### **Step 1: Create Tables**

Run the table creation scripts in order, ensuring foreign key dependencies are satisfied.

### **Step 2: Seed Data**

```sql
-- Insert default kitchen stations
INSERT INTO kitchen_stations (name, description, display_order, estimated_prep_time) VALUES
('Hot Kitchen', 'Main cooking station for hot items', 1, 8),
('Cold Station', 'Salads, sandwiches, cold items', 2, 3),
('Drinks', 'Beverages and desserts', 3, 2),
('Packaging', 'Final packaging and quality check', 4, 2);

-- Insert platform configurations (to be updated with real credentials)
INSERT INTO delivery_platforms (name, display_name, is_active, configuration) VALUES
('glovo', 'Glovo', false, '{"api_url": "https://api.glovoapp.com", "webhook_url": "/webhooks/glovo"}'),
('ubereats', 'Uber Eats', false, '{"api_url": "https://api.uber.com", "webhook_url": "/webhooks/ubereats"}');
```

### **Step 3: Update Existing Tables**

```sql
-- Add delivery-related fields to existing tables if needed
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS can_manage_delivery_orders BOOLEAN DEFAULT false;

-- Update access levels to include delivery permissions
UPDATE employees
SET access_levels = array_append(access_levels, 'delivery_orders')
WHERE role IN ('admin', 'manager');
```

This database schema provides a solid foundation for the delivery platform integration while maintaining compatibility with your existing POS system.
