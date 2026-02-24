#!/usr/bin/env node

// Enhanced Bootstrap script to create initial admin user
// Supports both online (Supabase) and offline (local JSON) modes
// This solves the chicken-and-egg problem for offline initialization

const crypto = require('crypto');

// Check if we're running in Node.js environment
if (typeof window !== 'undefined') {
    console.error('❌ This script should be run in Node.js, not in the browser');
    process.exit(1);
}

// Environment variables (optional for offline mode)
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON;

// Determine mode: online (with Supabase) or offline (local only)
const isOnlineMode = supabaseUrl && supabaseKey && 
    supabaseUrl.includes('supabase.co') && supabaseKey.startsWith('eyJ');

let supabase = null;

if (isOnlineMode) {
    console.log('🌐 Running in ONLINE mode - will create admin in Supabase');
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(supabaseUrl, supabaseKey);
} else {
    console.log('📱 Running in OFFLINE mode - will create admin in local database');
    console.log('💡 This admin will be available when the app starts offline');
}

// Simple password hashing (matches the app's hashUtils)
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Generate UUID (matches the app's uuid utils)
function generateUUID() {
    return crypto.randomUUID();
}

// Admin user data
const adminUserData = {
    id: generateUUID(),
    employee_number: 'ADMIN001',
    name: 'System Administrator',
    email: 'admin@company.com',
    phone: null,
    password_hash: hashPassword('admin123'),
    pin: hashPassword('1234'),
    role: 'admin',
    access_levels: ['all'],
    is_active: true,
    hire_date: new Date().toISOString().split('T')[0],
    total_sales: 0,
    transaction_count: 0,
    average_transaction: 0,
    hours_worked: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_synced_at: null,
    deleted_at: null
};

// Create admin in Supabase (online mode)
async function createAdminOnline() {
    try {
        console.log('🔍 Checking if employees exist in Supabase...');
        
        const { data: existingEmployees, error: checkError } = await supabase
            .from('employees')
            .select('id')
            .limit(1);

        if (checkError) {
            console.error('❌ Error checking employees:', checkError.message);
            return false;
        }

        if (existingEmployees && existingEmployees.length > 0) {
            console.log('✅ Employees already exist in Supabase. No need to create initial admin.');
            console.log('💡 You can log in with existing credentials.');
            return true;
        }

        console.log('👤 Creating initial admin user in Supabase...');
        
        const { error: insertError } = await supabase
            .from('employees')
            .insert([adminUserData]);

        if (insertError) {
            console.error('❌ Error creating admin user:', insertError.message);
            return false;
        }

        console.log('✅ Initial admin user created successfully in Supabase!');
        return true;
    } catch (error) {
        console.error('💥 Unexpected error in online mode:', error.message);
        return false;
    }
}

// Create admin in local IndexedDB (offline mode)
async function createAdminOffline() {
    try {
        console.log('🔍 Setting up local database for offline admin...');
        
        // We'll create a JSON file that the app can read on startup
        const fs = require('fs');
        const path = require('path');
        
        // Create a bootstrap data file
        const bootstrapData = {
            employees: [adminUserData],
            created_at: new Date().toISOString(),
            version: '1.0',
            description: 'Bootstrap admin user for offline initialization'
        };
        
        const bootstrapPath = path.join(__dirname, 'bootstrap-data.json');
        
        // Check if bootstrap file already exists
        if (fs.existsSync(bootstrapPath)) {
            console.log('✅ Bootstrap data already exists. No need to recreate.');
            console.log('💡 Delete bootstrap-data.json if you want to recreate it.');
            return true;
        }
        
        fs.writeFileSync(bootstrapPath, JSON.stringify(bootstrapData, null, 2));
        
        // Also copy to public directory for app access
        const publicPath = path.join(__dirname, 'public', 'bootstrap-data.json');
        const publicDir = path.join(__dirname, 'public');
        
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
        }
        
        fs.writeFileSync(publicPath, JSON.stringify(bootstrapData, null, 2));
        
        console.log('✅ Bootstrap data file created successfully!');
        console.log(`📁 Location: ${bootstrapPath}`);
        console.log(`� Public Location: ${publicPath}`);
        console.log('');
        console.log('🚀 NEXT STEPS:');
        console.log('1. Start your app normally (npm run dev)');
        console.log('2. The app will automatically load this admin user when starting offline');
        console.log('3. After login, you can create more employees offline');
        console.log('4. When you come online later, all data will sync to Supabase');
        console.log('');
        
        return true;
    } catch (error) {
        console.error('💥 Unexpected error in offline mode:', error.message);
        return false;
    }
}

// Main execution
async function main() {
    console.log('🚀 POS System Admin Bootstrap');
    console.log('=============================');
    console.log('');
    
    let success = false;
    
    if (isOnlineMode) {
        success = await createAdminOnline();
    } else {
        success = await createAdminOffline();
    }
    
    if (success) {
        console.log('');
        console.log('🔑 DEFAULT LOGIN CREDENTIALS:');
        console.log('   Employee Number: ADMIN001');
        console.log('   Password: admin123');
        console.log('   PIN: 1234');
        console.log('');
        console.log('⚠️  IMPORTANT: Change these credentials after first login!');
        
        if (isOnlineMode) {
            console.log('💡 You can now log in to the system and create more employees.');
            console.log('💡 Use "Admin Mode" on the login screen to access admin functions.');
        } else {
            console.log('💡 The app will load this admin automatically when offline.');
            console.log('💡 When you connect online later, the admin will sync to Supabase.');
        }
    } else {
        console.log('❌ Bootstrap failed. Please check the errors above.');
        process.exit(1);
    }
}

// Run the script
main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
});