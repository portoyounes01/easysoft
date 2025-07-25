#!/usr/bin/env node

// Bootstrap script to create initial admin user when no employees exist
// This allows access to the system to populate more data

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Supabase configuration from environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl.includes('supabase.co') || !supabaseKey.startsWith('eyJ')) {
  console.error('❌ Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Simple password hashing function
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Create initial admin user
async function createInitialAdmin() {
  try {
    console.log('🔍 Checking if employees exist...');

    // Check if any employees exist
    const { data: existingEmployees, error: checkError } = await supabase
      .from('employees')
      .select('id')
      .limit(1);

    if (checkError) {
      console.error('❌ Error checking employees:', checkError.message);
      return;
    }

    if (existingEmployees && existingEmployees.length > 0) {
      console.log('✅ Employees already exist. No need to create initial admin.');
      console.log('💡 You can log in with existing credentials.');
      return;
    }

    console.log('👤 Creating initial admin user...');

    // Create initial admin user
    const adminUser = {
      id: crypto.randomUUID(),
      employee_number: 'ADMIN001',
      name: 'System Administrator',
      email: 'admin@company.com',
      phone: null,
      role: 'admin',
      access_levels: ['all'],
      hire_date: new Date().toISOString().split('T')[0],
      password_hash: hashPassword('admin123'),
      pin: hashPassword('1234'),
      is_active: true,
      total_sales: 0,
      transaction_count: 0,
      average_transaction: 0,
      hours_worked: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error: insertError } = await supabase
      .from('employees')
      .insert([adminUser]);

    if (insertError) {
      console.error('❌ Error creating admin user:', insertError.message);
      return;
    }

    console.log('✅ Initial admin user created successfully!');
    console.log('');
    console.log('🔑 Login Credentials:');
    console.log('   Employee Number: ADMIN001');
    console.log('   Password: admin123');
    console.log('   PIN: 1234');
    console.log('');
    console.log('💡 You can now log in to the system and create more employees.');
    console.log('💡 Use "Admin Mode" on the login screen to access admin functions.');

  } catch (error) {
    console.error('💥 Unexpected error:', error.message);
  }
}

// Run the script
createInitialAdmin();