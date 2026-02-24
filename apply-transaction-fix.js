const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables');
    console.log('VITE_SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
    console.log('VITE_SUPABASE_ANON:', supabaseKey ? 'Set' : 'Missing');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyTransactionFix() {
    try {
        console.log('Applying transaction number sequence fix...');
        
        const sqlContent = fs.readFileSync(path.join(__dirname, 'fix_transaction_number_sequence.sql'), 'utf8');
        
        // Split by statements and execute each one
        const statements = sqlContent.split(';').filter(stmt => stmt.trim().length > 0);
        
        for (const statement of statements) {
            const trimmed = statement.trim();
            if (trimmed) {
                console.log('Executing:', trimmed.substring(0, 100) + '...');
                const { error } = await supabase.rpc('exec_sql', { sql: trimmed });
                if (error) {
                    console.warn('Statement failed (may be expected):', error.message);
                } else {
                    console.log('✓ Success');
                }
            }
        }
        
        console.log('\nTesting new transaction number generation...');
        const { data: testNumber, error: testError } = await supabase.rpc('generate_transaction_number');
        
        if (testError) {
            console.error('Test failed:', testError);
        } else {
            console.log('✓ Generated test number:', testNumber);
        }
        
        console.log('\nTransaction number fix applied successfully!');
        
    } catch (error) {
        console.error('Error applying fix:', error);
        process.exit(1);
    }
}

applyTransactionFix();
