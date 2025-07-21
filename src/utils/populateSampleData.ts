import { localDb } from '../lib/localDatabase';
import { LocalCategory, LocalProduct } from '../types/supabase';
import { generateUUID } from './uuid';

// Sample categories data
const sampleCategories = [
    {
        name: 'Beverages',
        description: 'Coffee, tea, sodas, and other drinks',
        color: 'from-amber-500 to-orange-600',
        icon: 'coffee',
        display_order: 1,
        is_active: true,
        deleted_at: null,
    },
    {
        name: 'Dairy',
        description: 'Milk, cheese, yogurt, and dairy products',
        color: 'from-blue-500 to-cyan-600',
        icon: 'milk',
        display_order: 2,
        is_active: true,
        deleted_at: null,
    },
    {
        name: 'Bakery',
        description: 'Fresh bread, pastries, and baked goods',
        color: 'from-yellow-500 to-amber-600',
        icon: 'cake',
        display_order: 3,
        is_active: true,
        deleted_at: null,
    },
    {
        name: 'Confectionery',
        description: 'Chocolates, candies, and sweet treats',
        color: 'from-pink-500 to-rose-600',
        icon: 'candy',
        display_order: 4,
        is_active: true,
        deleted_at: null,
    },
];

// Sample products data
const sampleProducts = [
    {
        name: 'Premium Coffee Beans',
        description: 'High-quality arabica coffee beans',
        sku: 'COF001',
        barcode: null,
        category_name: 'Beverages',
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
        deleted_at: null,
    },
    {
        name: 'Organic Milk',
        description: 'Fresh organic whole milk',
        sku: 'MLK001',
        barcode: null,
        category_name: 'Dairy',
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
        deleted_at: null,
    },
    {
        name: 'Artisan Bread',
        description: 'Freshly baked sourdough bread',
        sku: 'BRD001',
        barcode: null,
        category_name: 'Bakery',
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
        deleted_at: null,
    },
    {
        name: 'Dark Chocolate Bar',
        description: '85% cocoa premium chocolate',
        sku: 'CHC001',
        barcode: null,
        category_name: 'Confectionery',
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
        deleted_at: null,
    },
    {
        name: 'Espresso Machine',
        description: 'Professional grade espresso machine',
        sku: 'COF002',
        barcode: null,
        category_name: 'Beverages',
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
        deleted_at: null,
    },
    {
        name: 'Greek Yogurt',
        description: 'Creamy Greek-style yogurt',
        sku: 'MLK002',
        barcode: null,
        category_name: 'Dairy',
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
        deleted_at: null,
    },
];

export const populateSampleData = async () => {
    try {
        console.log('🗄️  Starting sample data population...');

        // Check if data already exists
        const existingCategories = await localDb.categories.count();
        const existingProducts = await localDb.products.count();

        if (existingCategories > 0 || existingProducts > 0) {
            console.log('⚠️  Database already contains data:');
            console.log(`   Categories: ${existingCategories}`);
            console.log(`   Products: ${existingProducts}`);
            console.log('   Run the clear script first if you want to replace existing data.');
            return;
        }

        // Create categories
        console.log('📂 Creating categories...');
        const categoryIdMap = new Map<string, string>();

        await localDb.transaction('rw', [localDb.categories], async () => {
            for (const categoryData of sampleCategories) {
                const categoryId = generateUUID();
                const category: LocalCategory = {
                    ...categoryData,
                    id: categoryId,
                    created_at: new Date(),
                    updated_at: new Date(),
                    last_synced_at: null,
                    needs_push: false,
                    is_conflicted: false,
                };

                await localDb.categories.add(category);
                categoryIdMap.set(categoryData.name, categoryId);
                console.log(`   ✅ Created category: ${categoryData.name}`);
            }
        });

        // Create products
        console.log('📦 Creating products...');

        await localDb.transaction('rw', [localDb.products], async () => {
            for (const productData of sampleProducts) {
                const categoryId = categoryIdMap.get(productData.category_name);
                if (!categoryId) {
                    console.warn(`⚠️  Category not found for product: ${productData.name}`);
                    continue;
                }

                const productId = generateUUID();
                const product: LocalProduct = {
                    ...productData,
                    id: productId,
                    category_id: categoryId,
                    created_at: new Date(),
                    updated_at: new Date(),
                    last_synced_at: null,
                    needs_push: false,
                    is_conflicted: false,
                };

                await localDb.products.add(product);
                console.log(`   ✅ Created product: ${productData.name}`);
            }
        });

        console.log('🎉 Sample data population completed successfully!');
        console.log(`   Created ${sampleCategories.length} categories`);
        console.log(`   Created ${sampleProducts.length} products`);

    } catch (error) {
        console.error('❌ Error populating sample data:', error);
        throw error;
    }
};

// Main execution block - runs when script is called directly
if (typeof window === 'undefined' && import.meta.url) {
    // This is a Node.js environment and we can check if this is the main module
    const currentFilePath = new URL(import.meta.url).pathname;
    const isMainModule = process.argv[1] && process.argv[1].endsWith(currentFilePath.split('/').pop() || '');

    if (isMainModule) {
        console.log('🚀 Running populate sample data script...');
        populateSampleData()
            .then(() => {
                console.log('✅ Script completed successfully');
                process.exit(0);
            })
            .catch((error) => {
                console.error('💥 Script failed:', error);
                process.exit(1);
            });
    }
} 