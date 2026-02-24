const { createClient } = require('@supabase/supabase-js');

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

async function testTransactionNumbers() {
    console.log('Testing transaction number generation (current implementation)...\n');
    
    // Generate multiple numbers quickly to see if we get duplicates
    const promises = [];
    for (let i = 0; i < 5; i++) {
        promises.push(supabase.rpc('generate_transaction_number'));
    }
    
    try {
        const results = await Promise.all(promises);
        const numbers = results.map(r => r.data);
        
        console.log('Generated numbers:');
        numbers.forEach((num, i) => console.log(`${i + 1}: ${num}`));
        
        // Check for duplicates
        const unique = new Set(numbers);
        if (unique.size !== numbers.length) {
            console.log('\n❌ DUPLICATES DETECTED - This confirms the race condition!');
            console.log('Unique count:', unique.size, 'Total count:', numbers.length);
        } else {
            console.log('\n✓ No duplicates in this test batch');
        }
        
        console.log('\n📋 To fix this, you need to run the SQL in fix_transaction_number_sequence.sql');
        console.log('   in your Supabase SQL editor or via CLI.');
        
    } catch (error) {
        console.error('Error testing:', error);
    }
}

testTransactionNumbers();
