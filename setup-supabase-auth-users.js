#!/usr/bin/env node

/**
 * Setup Supabase Auth Users for Employees with Inventory Access
 * 
 * This script creates Supabase authentication users for employees who have
 * inventory management permissions, allowing them to upload images to cloud storage.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Supabase configuration
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // You'll need to add this to .env

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase configuration in .env file');
    console.error('Required: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

// Create Supabase client with service role key for admin operations
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// Employees who should have Supabase auth accounts (those with inventory access)
const employeesWithInventoryAccess = [
    {
        employee_number: 'EMP001',
        name: 'Carlos Ferreira',
        email: 'carlos@company.com',
        password: 'admin123',
        role: 'admin',
        access_levels: ['all']
    },
    {
        employee_number: 'EMP002', 
        name: 'João Santos',
        email: 'joao@company.com',
        password: 'manager123',
        role: 'manager',
        access_levels: ['inventory', 'reports', 'dashboard']
    }
    // Note: EMP003 (Maria Oliveira) is a cashier with only 'sales' access, so no Supabase auth needed
];

async function setupSupabaseAuthUsers() {
    console.log('🚀 Setting up Supabase auth users for employees with inventory access...\n');

    for (const employee of employeesWithInventoryAccess) {
        try {
            console.log(`👤 Processing ${employee.name} (${employee.employee_number})...`);

            // Check if user already exists
            const { data: existingEmployee } = await supabase
                .from('employees')
                .select('id, auth_id')
                .eq('employee_number', employee.employee_number)
                .single();

            if (!existingEmployee) {
                console.log(`❌ Employee ${employee.employee_number} not found in database`);
                continue;
            }

            if (existingEmployee.auth_id) {
                console.log(`✅ Employee ${employee.name} already has Supabase auth user`);
                continue;
            }

            // Create Supabase auth user
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                email: employee.email,
                password: employee.password,
                email_confirm: true,
                user_metadata: {
                    name: employee.name,
                    employee_number: employee.employee_number,
                    role: employee.role
                }
            });

            if (authError) {
                console.log(`❌ Failed to create auth user for ${employee.name}: ${authError.message}`);
                continue;
            }

            // Update employee record with auth_id
            const { error: updateError } = await supabase
                .from('employees')
                .update({ 
                    auth_id: authData.user.id,
                    email: employee.email,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingEmployee.id);

            if (updateError) {
                console.log(`❌ Failed to update employee record for ${employee.name}: ${updateError.message}`);
                // Optionally delete the created auth user here
                continue;
            }

            console.log(`✅ Created Supabase auth user for ${employee.name}`);
            console.log(`   📧 Email: ${employee.email}`);
            console.log(`   🔐 Password: ${employee.password}`);
            console.log(`   🆔 Auth ID: ${authData.user.id}\n`);

        } catch (error) {
            console.log(`💥 Unexpected error processing ${employee.name}: ${error.message}\n`);
        }
    }

    console.log('🎉 Supabase auth user setup complete!');
    console.log('\n📝 Next steps:');
    console.log('1. Run the updated SQL in Supabase SQL Editor (supabase_storage_setup.sql)');
    console.log('2. Test image uploads with admin/manager accounts');
    console.log('3. Verify cashiers see base64 fallback with permission message');
}

// Add auth_id column to employees table if it doesn't exist
async function addAuthIdColumn() {
    try {
        console.log('🔧 Ensuring auth_id column exists in employees table...');
        
        const { error } = await supabase.rpc('exec_sql', {
            sql: `
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name='employees' AND column_name='auth_id'
                    ) THEN
                        ALTER TABLE public.employees ADD COLUMN auth_id UUID REFERENCES auth.users(id);
                        CREATE INDEX IF NOT EXISTS idx_employees_auth_id ON public.employees(auth_id);
                    END IF;
                END $$;
            `
        });

        if (error) {
            console.log('❌ Failed to add auth_id column:', error.message);
            return false;
        }

        console.log('✅ auth_id column ready\n');
        return true;
    } catch (error) {
        console.log('💥 Error setting up database:', error.message);
        return false;
    }
}

// Main execution
async function main() {
    console.log('🏗️  Setting up proper Supabase authentication for inventory management\n');
    
    // First ensure the database schema is ready
    const schemaReady = await addAuthIdColumn();
    if (!schemaReady) {
        console.log('❌ Database schema setup failed. Exiting.');
        process.exit(1);
    }

    // Then create the auth users
    await setupSupabaseAuthUsers();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Goodbye!');
    process.exit(0);
});

// Run the script
if (require.main === module) {
    main().catch(error => {
        console.error('💥 Script failed:', error);
        process.exit(1);
    });
}

module.exports = { setupSupabaseAuthUsers, addAuthIdColumn };
