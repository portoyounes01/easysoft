#!/usr/bin/env node

/**
 * Setup Supabase Auth Users for Employees with Inventory Access
 * 
 * This script creates Supabase authentication users for employees who have
 * inventory management permissions, allowing them to upload images to cloud storage.
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const dotenv = require('dotenv');

// Load root .env (VITE_SUPABASE_URL for app) and supabase/.env (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'supabase', '.env') });

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // defined in supabase/.env

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase configuration in environment');
    console.error('Required: SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

// Create Supabase client with service role key for admin operations
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// Password provisioning strategy
// PROVISION_PASSWORD_SOURCE: 'PIN' to attempt using employee PIN when plausible, otherwise 'FIXED'
// DEFAULT_SUPABASE_PASSWORD: used when PIN unavailable/invalid or when source is FIXED
const PASSWORD_SOURCE = (process.env.PROVISION_PASSWORD_SOURCE || 'FIXED').toUpperCase();
const DEFAULT_PASSWORD = process.env.DEFAULT_SUPABASE_PASSWORD || 'ChangeMe123!';

function isLikelyBcrypt(value) {
    return typeof value === 'string' && value.startsWith('$2');
}

function chooseProvisionPassword(employee) {
    if (PASSWORD_SOURCE === 'PIN') {
        // Use PIN only if it looks like plaintext numeric (avoid using hashes)
        if (employee.pin && !isLikelyBcrypt(employee.pin) && /^[0-9]{4,10}$/.test(employee.pin)) {
            return String(employee.pin);
        }
        // Optional: attempt password_hash if it seems plaintext (rare); otherwise fallback
        if (employee.password_hash && !isLikelyBcrypt(employee.password_hash) && employee.password_hash.length >= 4 && employee.password_hash.length <= 50) {
            return String(employee.password_hash);
        }
    }
    return DEFAULT_PASSWORD;
}

async function setupSupabaseAuthUsers() {
    console.log('🚀 Setting up Supabase auth users for employees with inventory/all access...\n');

    // Auto-detect employees requiring Supabase auth
    const { data: employees, error: listError } = await supabase
        .from('employees')
        .select('id, employee_number, name, email, role, access_levels, auth_id, pin, password_hash, deleted_at, is_active')
        .or('access_levels.cs.{inventory},access_levels.cs.{all}')
        .eq('is_active', true)
        .is('deleted_at', null);

    if (listError) {
        console.error('❌ Failed to list employees with inventory/all access:', listError.message);
        process.exit(1);
    }

    if (!employees || employees.length === 0) {
        console.log('ℹ️  No employees with inventory/all access found. Nothing to do.');
        return;
    }

    for (const employee of employees) {
        try {
            console.log(`👤 Processing ${employee.name} (${employee.employee_number})...`);

            if (employee.auth_id) {
                console.log(`✅ Already provisioned (auth_id exists)`);
                continue;
            }

            if (!employee.email) {
                console.log('⚠️  Skipping: employee has no email set. Set an email to provision.');
                continue;
            }

            const provisionPassword = chooseProvisionPassword(employee);

            // Create Supabase auth user
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                email: employee.email,
                password: provisionPassword,
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

            // Update employee record with auth_id (and ensure email persisted)
            const { error: updateError } = await supabase
                .from('employees')
                .update({
                    auth_id: authData.user.id,
                    email: employee.email,
                    updated_at: new Date().toISOString()
                })
                .eq('id', employee.id);

            if (updateError) {
                console.log(`❌ Failed to update employee record for ${employee.name}: ${updateError.message}`);
                // Optionally delete the created auth user here
                continue;
            }

            console.log(`✅ Created Supabase auth user for ${employee.name}`);
            console.log(`   📧 Email: ${employee.email}`);
            if (PASSWORD_SOURCE === 'PIN') {
                console.log(`   🔐 Password source: PIN (fallback to default if unavailable)`);
            } else {
                console.log(`   🔐 Password source: FIXED`);
            }
            if (provisionPassword === DEFAULT_PASSWORD) {
                console.log(`   🔑 Provisioned with DEFAULT_SUPABASE_PASSWORD`);
            }
            console.log(`   🆔 Auth ID: ${authData.user.id}\n`);

        } catch (error) {
            console.log(`💥 Unexpected error processing ${employee.name}: ${error.message}\n`);
        }
    }

    console.log('🎉 Supabase auth user setup complete!');
    console.log('\n📝 Next steps:');
    console.log('1. Ensure app .env has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
    console.log('2. Test image uploads with any inventory-enabled account');
    console.log('3. If Supabase sign-in fails in POS, align Supabase password with POS credential');
}

// Add auth_id column to employees table if it doesn't exist
async function ensureAuthIdColumnExistsOrExit() {
    console.log('🔧 Checking that auth_id column exists in employees table...');
    // We cannot run DDL via REST. Detect column presence by selecting it.
    const { error } = await supabase
        .from('employees')
        .select('auth_id')
        .limit(1);

    if (error) {
        const msg = String(error.message || error);
        const missingColumn = msg.includes('column') && msg.includes('auth_id') && msg.includes('does not exist');
        if (missingColumn) {
            console.error('❌ Missing column auth_id on public.employees.');
            console.error('   Please run this SQL in Supabase SQL editor (or add a migration):');
            console.error('   ALTER TABLE public.employees ADD COLUMN auth_id UUID REFERENCES auth.users(id);');
            console.error('   CREATE INDEX IF NOT EXISTS idx_employees_auth_id ON public.employees(auth_id);');
            process.exit(1);
        }
        console.error('❌ Failed to verify employees.auth_id:', msg);
        process.exit(1);
    }
    console.log('✅ auth_id column detected\n');
}

// Main execution
async function main() {
    console.log('🏗️  Setting up proper Supabase authentication for inventory management\n');

    // First ensure the database schema is ready (without attempting DDL via REST)
    await ensureAuthIdColumnExistsOrExit();

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

module.exports = { setupSupabaseAuthUsers, ensureAuthIdColumnExistsOrExit };
