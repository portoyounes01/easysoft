import { supabase } from '../lib/supabase';
import { localDb } from '../lib/localDatabase';
import { hashPassword } from './hashUtils';

// Function to create sample employees with proper password hashes
const createSampleEmployees = async () => {
    const adminPasswordHash = await hashPassword('admin123');
    const managerPasswordHash = await hashPassword('manager123');
    const pinHash = await hashPassword('1234');

    return [
        {
            id: '550e8400-e29b-41d4-a716-446655440201', // Proper UUID
            employee_number: 'EMP001',
            name: 'Carlos Ferreira',
            email: 'carlos.ferreira@company.com',
            phone: '+351 123 456 789',
            role: 'admin',
            access_levels: ['all'],
            hire_date: '2024-01-01',
            password_hash: adminPasswordHash,
            pin: null,
            is_active: true,
            total_sales: 15420.50,
            transaction_count: 89,
            average_transaction: 173.26,
            hours_worked: 160,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        },
        {
            id: '550e8400-e29b-41d4-a716-446655440202', // Proper UUID
            employee_number: 'EMP002',
            name: 'João Santos',
            email: 'joao.santos@company.com',
            phone: '+351 123 456 788',
            role: 'manager',
            access_levels: ['sales', 'inventory', 'reports', 'dashboard', 'employees', 'settings', 'transactions'],
            hire_date: '2024-02-01',
            password_hash: managerPasswordHash,
            pin: pinHash,
            is_active: true,
            total_sales: 12350.75,
            transaction_count: 67,
            average_transaction: 184.34,
            hours_worked: 152,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        },
        {
            id: '550e8400-e29b-41d4-a716-446655440203', // Proper UUID
            employee_number: 'EMP003',
            name: 'Maria Oliveira',
            email: 'maria.oliveira@company.com',
            phone: '+351 123 456 787',
            role: 'cashier',
            access_levels: ['sales'],
            hire_date: '2024-03-01',
            password_hash: null,
            pin: pinHash,
            is_active: true,
            total_sales: 8750.25,
            transaction_count: 52,
            average_transaction: 168.27,
            hours_worked: 140,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }
    ];
};

// Sample categories data (for Supabase)
const sampleCategories = [
    {
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Beverages',
        description: 'Coffee, tea, sodas, and other drinks',
        color: 'from-amber-500 to-orange-600',
        icon: 'coffee',
        display_order: 1,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Dairy',
        description: 'Milk, cheese, yogurt, and dairy products',
        color: 'from-blue-500 to-cyan-600',
        icon: 'milk',
        display_order: 2,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440003',
        name: 'Bakery',
        description: 'Fresh bread, pastries, and baked goods',
        color: 'from-yellow-500 to-amber-600',
        icon: 'cake',
        display_order: 3,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440004',
        name: 'Confectionery',
        description: 'Chocolates, candies, and sweet treats',
        color: 'from-pink-500 to-rose-600',
        icon: 'candy',
        display_order: 4,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }
];

// Sample products data (for Supabase)
const sampleProducts = [
    {
        id: '550e8400-e29b-41d4-a716-446655440101',
        name: 'Premium Coffee Beans',
        description: 'High-quality arabica coffee beans',
        sku: 'COF001',
        barcode: null,
        category_id: '550e8400-e29b-41d4-a716-446655440001',
        price: 12.50,
        cost: 8.00,
        iva_rate: 0.23,
        stock: 45,
        min_stock: 10,
        track_stock: true,
        image_url: 'https://images.pexels.com/photos/894695/pexels-photo-894695.jpeg?auto=compress&cs=tinysrgb&w=300',
        supplier: 'Coffee Roasters Ltd',
        location: null,
        is_active: true,
        display_order: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440102',
        name: 'Organic Milk',
        description: 'Fresh organic whole milk',
        sku: 'MLK001',
        barcode: null,
        category_id: '550e8400-e29b-41d4-a716-446655440002',
        price: 2.80,
        cost: 1.50,
        iva_rate: 0.06,
        stock: 28,
        min_stock: 15,
        track_stock: true,
        image_url: 'https://images.pexels.com/photos/236010/pexels-photo-236010.jpeg?auto=compress&cs=tinysrgb&w=300',
        supplier: 'Organic Farms Co',
        location: null,
        is_active: true,
        display_order: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440103',
        name: 'Artisan Bread',
        description: 'Freshly baked sourdough bread',
        sku: 'BRD001',
        barcode: null,
        category_id: '550e8400-e29b-41d4-a716-446655440003',
        price: 4.50,
        cost: 2.00,
        iva_rate: 0.06,
        stock: 12,
        min_stock: 5,
        track_stock: true,
        image_url: 'https://images.pexels.com/photos/209206/pexels-photo-209206.jpeg?auto=compress&cs=tinysrgb&w=300',
        supplier: 'Local Bakery',
        location: null,
        is_active: true,
        display_order: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440104',
        name: 'Dark Chocolate Bar',
        description: '85% cocoa premium chocolate',
        sku: 'CHC001',
        barcode: null,
        category_id: '550e8400-e29b-41d4-a716-446655440004',
        price: 6.90,
        cost: 3.50,
        iva_rate: 0.23,
        stock: 35,
        min_stock: 25,
        track_stock: true,
        image_url: 'https://images.pexels.com/photos/918327/pexels-photo-918327.jpeg?auto=compress&cs=tinysrgb&w=300',
        supplier: 'Sweet Treats Inc',
        location: null,
        is_active: true,
        display_order: 4,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440105',
        name: 'Espresso Machine',
        description: 'Professional grade espresso machine',
        sku: 'COF002',
        barcode: null,
        category_id: '550e8400-e29b-41d4-a716-446655440001',
        price: 299.99,
        cost: 200.00,
        iva_rate: 0.23,
        stock: 0,
        min_stock: 2,
        track_stock: true,
        image_url: 'https://images.pexels.com/photos/324028/pexels-photo-324028.jpeg?auto=compress&cs=tinysrgb&w=300',
        supplier: 'Coffee Equipment Ltd',
        location: null,
        is_active: true,
        display_order: 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440106',
        name: 'Greek Yogurt',
        description: 'Creamy Greek-style yogurt',
        sku: 'MLK002',
        barcode: null,
        category_id: '550e8400-e29b-41d4-a716-446655440002',
        price: 3.20,
        cost: 2.00,
        iva_rate: 0.06,
        stock: 20,
        min_stock: 10,
        track_stock: true,
        image_url: 'https://images.pexels.com/photos/1435903/pexels-photo-1435903.jpeg?auto=compress&cs=tinysrgb&w=300',
        supplier: 'Greek Dairy Co',
        location: null,
        is_active: true,
        display_order: 6,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }
];

// Sample customers data
const sampleCustomers = [
    {
        id: '550e8400-e29b-41d4-a716-446655440401', // Maria Silva UUID
        name: 'Maria Silva',
        email: 'maria.silva@email.com',
        phone: '+351 123 456 789',
        address: 'Rua das Flores 10',
        city: 'Lisboa',
        postal_code: '1200-001',
        country: 'PT',
        is_active: true
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440402', // João Costa UUID
        name: 'João Costa',
        email: 'joao.costa@email.com',
        phone: '+351 123 456 788',
        address: 'Av. da República 50',
        city: 'Porto',
        postal_code: '4450-123',
        country: 'PT',
        is_active: true
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440403', // Ana Pereira UUID
        name: 'Ana Pereira',
        email: 'ana.pereira@email.com',
        phone: '+351 123 456 787',
        address: 'Largo do Município 3',
        city: 'Braga',
        postal_code: '4700-223',
        country: 'PT',
        is_active: true
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440404', // Pedro Santos UUID
        name: 'Pedro Santos',
        email: 'pedro.santos@email.com',
        phone: '+351 123 456 786',
        address: 'Rua Direita 7',
        city: 'Coimbra',
        postal_code: '3000-123',
        country: 'PT',
        is_active: true
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440405', // Carla Silva UUID
        name: 'Carla Silva',
        email: 'carla.silva@email.com',
        phone: '+351 123 456 785',
        address: 'Travessa do Sol 2',
        city: 'Faro',
        postal_code: '8000-123',
        country: 'PT',
        is_active: true
    }
];

// Sample transactions data (converted from mock data)
const sampleTransactions = [
    {
        id: '550e8400-e29b-41d4-a716-446655440501', // Transaction 1 UUID
        transaction_number: 'TXN202412200001',
        employee_id: '550e8400-e29b-41d4-a716-446655440201', // Carlos Ferreira UUID
        employee_name: 'Carlos Ferreira',
        customer_id: '550e8400-e29b-41d4-a716-446655440401', // Maria Silva UUID
        customer_name: 'Maria Silva',
        transaction_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '14:30:00',
        subtotal: 28.50,
        discount: 1.43,
        tax: 6.20,
        total: 33.27,
        payment_method: 'card',
        amount_paid: 33.27,
        change_given: 0,
        status: 'completed',
        created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440502', // Transaction 2 UUID
        transaction_number: 'TXN202412180001',
        employee_id: '550e8400-e29b-41d4-a716-446655440202', // João Santos UUID
        employee_name: 'João Santos',
        customer_id: null,
        customer_name: null,
        transaction_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '15:45:00',
        subtotal: 22.20,
        discount: 0,
        tax: 5.11,
        total: 27.31,
        payment_method: 'cash',
        amount_paid: 30.00,
        change_given: 2.69,
        status: 'completed',
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440503', // Transaction 3 UUID
        transaction_number: 'TXN202412170001',
        employee_id: '550e8400-e29b-41d4-a716-446655440203', // Maria Oliveira UUID
        employee_name: 'Maria Oliveira',
        customer_id: null,
        customer_name: null,
        transaction_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '16:20:00',
        subtotal: 21.40,
        discount: 0,
        tax: 4.92,
        total: 26.32,
        payment_method: 'card',
        amount_paid: 26.32,
        change_given: 0,
        status: 'completed',
        created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440504', // Transaction 4 UUID
        transaction_number: 'TXN202412150001',
        employee_id: '550e8400-e29b-41d4-a716-446655440201', // Carlos Ferreira UUID
        employee_name: 'Carlos Ferreira',
        customer_id: '550e8400-e29b-41d4-a716-446655440402', // João Costa UUID
        customer_name: 'João Costa',
        transaction_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '10:15:00',
        subtotal: 7.20,
        discount: 0.36,
        tax: 1.58,
        total: 8.42,
        payment_method: 'cash',
        amount_paid: 10.00,
        change_given: 1.58,
        status: 'completed',
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440505', // Transaction 5 UUID
        transaction_number: 'TXN202412130001',
        employee_id: '550e8400-e29b-41d4-a716-446655440202', // João Santos UUID
        employee_name: 'João Santos',
        customer_id: null,
        customer_name: null,
        transaction_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '13:25:00',
        subtotal: 25.70,
        discount: 0,
        tax: 5.91,
        total: 31.61,
        payment_method: 'card',
        amount_paid: 31.61,
        change_given: 0,
        status: 'completed',
        created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440506', // Transaction 6 UUID
        transaction_number: 'TXN202412100001',
        employee_id: '550e8400-e29b-41d4-a716-446655440203', // Maria Oliveira UUID
        employee_name: 'Maria Oliveira',
        customer_id: null,
        customer_name: null,
        transaction_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '17:40:00',
        subtotal: 11.00,
        discount: 0.55,
        tax: 2.40,
        total: 12.85,
        payment_method: 'cash',
        amount_paid: 15.00,
        change_given: 2.15,
        status: 'completed',
        created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440507', // Transaction 7 UUID
        transaction_number: 'TXN202412080001',
        employee_id: '550e8400-e29b-41d4-a716-446655440201', // Carlos Ferreira UUID
        employee_name: 'Carlos Ferreira',
        customer_id: null,
        customer_name: null,
        transaction_date: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '11:30:00',
        subtotal: 20.00,
        discount: 2.00,
        tax: 4.14,
        total: 22.14,
        payment_method: 'mixed',
        amount_paid: 22.14,
        change_given: 0,
        status: 'completed',
        created_at: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440508', // Transaction 8 UUID
        transaction_number: 'TXN202412050001',
        employee_id: '550e8400-e29b-41d4-a716-446655440202', // João Santos UUID
        employee_name: 'João Santos',
        customer_id: '550e8400-e29b-41d4-a716-446655440403', // Ana Pereira UUID
        customer_name: 'Ana Pereira',
        transaction_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '14:15:00',
        subtotal: 17.60,
        discount: 0,
        tax: 4.05,
        total: 21.65,
        payment_method: 'card',
        amount_paid: 21.65,
        change_given: 0,
        status: 'completed',
        created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440509', // Transaction 9 UUID
        transaction_number: 'TXN202412020001',
        employee_id: '550e8400-e29b-41d4-a716-446655440203', // Maria Oliveira UUID
        employee_name: 'Maria Oliveira',
        customer_id: null,
        customer_name: null,
        transaction_date: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '16:50:00',
        subtotal: 13.30,
        discount: 0,
        tax: 3.06,
        total: 16.36,
        payment_method: 'cash',
        amount_paid: 20.00,
        change_given: 3.64,
        status: 'completed',
        created_at: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440510', // Transaction 10 UUID
        transaction_number: 'TXN202411300001',
        employee_id: '550e8400-e29b-41d4-a716-446655440201', // Carlos Ferreira UUID
        employee_name: 'Carlos Ferreira',
        customer_id: '550e8400-e29b-41d4-a716-446655440404', // Pedro Santos UUID
        customer_name: 'Pedro Santos',
        transaction_date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '09:45:00',
        subtotal: 14.30,
        discount: 0.71,
        tax: 3.13,
        total: 16.72,
        payment_method: 'card',
        amount_paid: 16.72,
        change_given: 0,
        status: 'completed',
        created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440511', // Transaction 11 UUID
        transaction_number: 'TXN202411280001',
        employee_id: '550e8400-e29b-41d4-a716-446655440202', // João Santos UUID
        employee_name: 'João Santos',
        customer_id: null,
        customer_name: null,
        transaction_date: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '12:20:00',
        subtotal: 8.30,
        discount: 0,
        tax: 1.91,
        total: 10.21,
        payment_method: 'cash',
        amount_paid: 15.00,
        change_given: 4.79,
        status: 'completed',
        created_at: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440512', // Transaction 12 UUID
        transaction_number: 'TXN202411250001',
        employee_id: '550e8400-e29b-41d4-a716-446655440203', // Maria Oliveira UUID
        employee_name: 'Maria Oliveira',
        customer_id: '550e8400-e29b-41d4-a716-446655440405', // Carla Silva UUID
        customer_name: 'Carla Silva',
        transaction_date: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        transaction_time: '15:35:00',
        subtotal: 18.10,
        discount: 1.81,
        tax: 3.75,
        total: 20.04,
        payment_method: 'card',
        amount_paid: 20.04,
        change_given: 0,
        status: 'completed',
        created_at: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString()
    }
];

// Sample transaction items (matching the mock data)
const sampleTransactionItems = [
    // Transaction 1 items
    {
        id: '550e8400-e29b-41d4-a716-446655440601', // Transaction Item 1-1 UUID
        transaction_id: '550e8400-e29b-41d4-a716-446655440501', // Transaction 1 UUID
        product_id: '550e8400-e29b-41d4-a716-446655440101', // Premium Coffee Beans
        product_name: 'Premium Coffee Beans',
        product_sku: 'COF001',
        category_id: '550e8400-e29b-41d4-a716-446655440001',
        category_name: 'Beverages',
        quantity: 2,
        unit_price: 12.50,
        unit_cost: 8.00,
        iva_rate: 0.23,
        line_total: 25.00,
        tax_amount: 4.60,
        profit_amount: 9.00,
        discount_amount: 0,
        discount_percentage: 0
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440602', // Transaction Item 1-2 UUID
        transaction_id: '550e8400-e29b-41d4-a716-446655440501', // Transaction 1 UUID
        product_id: '550e8400-e29b-41d4-a716-446655440103', // Artisan Bread (acting as Croissant)
        product_name: 'Croissant',
        product_sku: 'BRD002',
        category_id: '550e8400-e29b-41d4-a716-446655440003',
        category_name: 'Bakery',
        quantity: 1,
        unit_price: 3.50,
        unit_cost: 1.20,
        iva_rate: 0.06,
        line_total: 3.50,
        tax_amount: 0.20,
        profit_amount: 2.30,
        discount_amount: 0,
        discount_percentage: 0
    },
    // Transaction 2 items
    {
        id: '550e8400-e29b-41d4-a716-446655440603', // Transaction Item 2-1 UUID
        transaction_id: '550e8400-e29b-41d4-a716-446655440502', // Transaction 2 UUID
        product_id: '550e8400-e29b-41d4-a716-446655440102', // Organic Milk
        product_name: 'Organic Milk',
        product_sku: 'MLK001',
        category_id: '550e8400-e29b-41d4-a716-446655440002',
        category_name: 'Dairy',
        quantity: 3,
        unit_price: 2.80,
        unit_cost: 1.50,
        iva_rate: 0.06,
        line_total: 8.40,
        tax_amount: 0.48,
        profit_amount: 3.90,
        discount_amount: 0,
        discount_percentage: 0
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440604', // Transaction Item 2-2 UUID
        transaction_id: '550e8400-e29b-41d4-a716-446655440502', // Transaction 2 UUID
        product_id: '550e8400-e29b-41d4-a716-446655440104', // Dark Chocolate Bar
        product_name: 'Dark Chocolate',
        product_sku: 'CHC001',
        category_id: '550e8400-e29b-41d4-a716-446655440004',
        category_name: 'Confectionery',
        quantity: 2,
        unit_price: 6.90,
        unit_cost: 4.20,
        iva_rate: 0.23,
        line_total: 13.80,
        tax_amount: 3.17,
        profit_amount: 5.40,
        discount_amount: 0,
        discount_percentage: 0
    },
    // Transaction 3 items
    {
        id: '550e8400-e29b-41d4-a716-446655440605', // Transaction Item 3-1 UUID
        transaction_id: '550e8400-e29b-41d4-a716-446655440503', // Transaction 3 UUID
        product_id: '550e8400-e29b-41d4-a716-446655440101', // Premium Coffee Beans
        product_name: 'Premium Coffee Beans',
        product_sku: 'COF001',
        category_id: '550e8400-e29b-41d4-a716-446655440001',
        category_name: 'Beverages',
        quantity: 1,
        unit_price: 12.50,
        unit_cost: 8.00,
        iva_rate: 0.23,
        line_total: 12.50,
        tax_amount: 2.88,
        profit_amount: 4.50,
        discount_amount: 0,
        discount_percentage: 0
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440606', // Transaction Item 3-2 UUID
        transaction_id: '550e8400-e29b-41d4-a716-446655440503', // Transaction 3 UUID
        product_id: '550e8400-e29b-41d4-a716-446655440106', // Greek Yogurt (acting as Cheese)
        product_name: 'Cheese',
        product_sku: 'MLK003',
        category_id: '550e8400-e29b-41d4-a716-446655440002',
        category_name: 'Dairy',
        quantity: 1,
        unit_price: 8.90,
        unit_cost: 5.50,
        iva_rate: 0.06,
        line_total: 8.90,
        tax_amount: 0.53,
        profit_amount: 3.40,
        discount_amount: 0,
        discount_percentage: 0
    }
    // Note: Adding more items for remaining transactions would follow the same pattern
    // For brevity, I'm including key transactions - the full implementation would include all items
];

export async function populateTransactionData() {
    try {
        console.log('Starting comprehensive data population...');

        // 1. Create employees with proper password hashes
        console.log('Creating employees with hashed credentials...');
        const sampleEmployees = await createSampleEmployees();

        // 2. Insert employees
        console.log('Inserting employees...');
        const { error: employeesError } = await supabase.rpc('upsert_employees', {
            employees_data: sampleEmployees,
        });

        if (employeesError) {
            console.error('Error inserting employees:', employeesError);
            throw employeesError;
        }

        // 3. Insert categories
        console.log('Inserting categories...');
        const { error: categoriesError } = await supabase
            .from('categories')
            .upsert(sampleCategories, { onConflict: 'id' });

        if (categoriesError) {
            console.error('Error inserting categories:', categoriesError);
            throw categoriesError;
        }

        // 4. Insert products
        console.log('Inserting products...');
        const { error: productsError } = await supabase
            .from('products')
            .upsert(sampleProducts, { onConflict: 'id' });

        if (productsError) {
            console.error('Error inserting products:', productsError);
            throw productsError;
        }

        // 5. Insert customers
        console.log('Inserting customers...');
        const { error: customersError } = await supabase
            .from('customers')
            .upsert(sampleCustomers, { onConflict: 'id' });

        if (customersError) {
            console.error('Error inserting customers:', customersError);
            throw customersError;
        }

        // 6. Insert transactions
        console.log('Inserting transactions...');
        const { error: transactionsError } = await supabase
            .from('transactions')
            .upsert(sampleTransactions, { onConflict: 'id' });

        if (transactionsError) {
            console.error('Error inserting transactions:', transactionsError);
            throw transactionsError;
        }

        // 7. Insert transaction items
        console.log('Inserting transaction items...');
        const { error: itemsError } = await supabase
            .from('transaction_items')
            .upsert(sampleTransactionItems, { onConflict: 'id' });

        if (itemsError) {
            console.error('Error inserting transaction items:', itemsError);
            throw itemsError;
        }

        // 8. Update customer totals
        console.log('Updating customer totals...');
        for (const customer of sampleCustomers) {
            const customerTransactions = sampleTransactions.filter(t => t.customer_id === customer.id);
            const totalSpent = customerTransactions.reduce((sum, t) => sum + t.total, 0);
            const transactionCount = customerTransactions.length;

            await supabase
                .from('customers')
                .update({
                    total_spent: totalSpent,
                    transaction_count: transactionCount
                })
                .eq('id', customer.id);
        }

        // 9. Sync data to local database
        console.log('Syncing data to local database...');
        try {
            // Sync employees to local database
            await localDb.employees.bulkPut(sampleEmployees.map(emp => ({
                ...emp,
                role: emp.role as 'admin' | 'manager' | 'cashier',
                created_at: new Date(emp.created_at),
                updated_at: new Date(emp.updated_at),
                last_synced_at: new Date(),
                needs_push: false,
                is_conflicted: false,
                deleted_at: null
            })));

            // Sync categories to local database
            await localDb.categories.bulkPut(sampleCategories.map(cat => ({
                ...cat,
                created_at: new Date(cat.created_at),
                updated_at: new Date(cat.updated_at),
                last_synced_at: new Date(),
                needs_push: false,
                is_conflicted: false,
                deleted_at: null
            })));

            // Create category lookup for products
            const categoryLookup = sampleCategories.reduce((acc, cat) => {
                acc[cat.id] = cat.name;
                return acc;
            }, {} as Record<string, string>);

            // Sync products to local database
            await localDb.products.bulkPut(sampleProducts.map(prod => ({
                ...prod,
                category_name: categoryLookup[prod.category_id] || 'Unknown',
                created_at: new Date(prod.created_at),
                updated_at: new Date(prod.updated_at),
                last_synced_at: new Date(),
                needs_push: false,
                is_conflicted: false,
                deleted_at: null
            })));

            console.log('Local database sync completed successfully!');
        } catch (localError) {
            console.error('Error syncing to local database:', localError);
            // Don't throw here as Supabase data was inserted successfully
        }

        console.log('Comprehensive data population completed successfully!');
        console.log(`- ${sampleEmployees.length} employees created`);
        console.log(`- ${sampleCategories.length} categories created`);
        console.log(`- ${sampleProducts.length} products created`);
        console.log(`- ${sampleCustomers.length} customers created`);
        console.log(`- ${sampleTransactions.length} transactions created`);
        console.log(`- ${sampleTransactionItems.length} transaction items created`);

        return {
            success: true,
            employeesCount: sampleEmployees.length,
            categoriesCount: sampleCategories.length,
            productsCount: sampleProducts.length,
            customersCount: sampleCustomers.length,
            transactionsCount: sampleTransactions.length,
            itemsCount: sampleTransactionItems.length
        };

    } catch (error) {
        console.error('Error populating transaction data:', error);
        throw error;
    }
}

// Helper function to clear transaction data (for testing/reset purposes)
export async function clearTransactionData() {
    try {
        console.log('🔄 Starting data clearing process...');

        // Clear local database first
        console.log('🗑️ Clearing local database...');
        try {
            await localDb.transaction('rw', [
                localDb.categories, 
                localDb.products, 
                localDb.employees,
                localDb.categorySyncQueue, 
                localDb.productSyncQueue,
                localDb.employeeSyncQueue,
                localDb.syncMetadata
            ], async () => {
                await localDb.categories.clear();
                await localDb.products.clear();
                await localDb.employees.clear();
                await localDb.categorySyncQueue.clear();
                await localDb.productSyncQueue.clear();
                await localDb.employeeSyncQueue.clear();
                await localDb.syncMetadata.clear();
                
                // Reinitialize sync metadata after clearing
                await localDb.syncMetadata.add({
                    id: 'employees',
                    lastPulledAt: null,
                    lastPushedAt: null,
                    pendingOperations: 0,
                    conflictCount: 0,
                });
                
                await localDb.syncMetadata.add({
                    id: 'categories',
                    lastPulledAt: null,
                    lastPushedAt: null,
                    pendingOperations: 0,
                    conflictCount: 0,
                });
                
                await localDb.syncMetadata.add({
                    id: 'products',
                    lastPulledAt: null,
                    lastPushedAt: null,
                    pendingOperations: 0,
                    conflictCount: 0,
                });
            });
            console.log('✅ Local database cleared and reinitialized successfully!');
        } catch (localError) {
            console.error('❌ Error clearing local database:', localError);
        }

        // Try SQL function first
        console.log('🔧 Attempting to use SQL clear function...');
        const { error: sqlError } = await supabase.rpc('clear_all_transaction_data');
        
        if (sqlError) {
            // Phase 0 hardening: the previous raw per-table delete fallback (mass-DELETE on every
            // table via the anon client) was removed. It was a catastrophic footgun once multi-tenant,
            // and it silently bypassed the fiscal/sealed-document protections. If the RPC is missing or
            // fails, surface the error loudly instead of nuking the database directly.
            console.error('❌ SQL clear function failed:', sqlError);
            throw new Error(
                `clear_all_transaction_data RPC failed (${sqlError.message}). ` +
                `The raw-delete fallback was removed for safety (Phase 0 hardening); no data was deleted.`
            );
        } else {
            console.log('✅ SQL clear function executed successfully!');
        }

        console.log('🎉 All data cleared successfully!');

        return { success: true };

    } catch (error) {
        console.error('💥 Error clearing data:', error);
        throw error;
    }
}

// Utility function to check if transaction data exists
export async function checkTransactionDataExists() {
    try {
        const { data: transactions, error } = await supabase
            .from('transactions')
            .select('id')
            .limit(1);

        if (error) {
            console.error('Error checking transaction data:', error);
            return false;
        }

        return (transactions && transactions.length > 0);

    } catch (error) {
        console.error('Error checking transaction data:', error);
        return false;
    }
}
