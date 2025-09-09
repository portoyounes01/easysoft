const path = require('path');
const dotenv = require('dotenv');

function loadEnv() {
    // Load root .env for Vite variables
    dotenv.config({ path: path.resolve(process.cwd(), '.env') });
    // Load supabase/.env for service role
    dotenv.config({ path: path.resolve(process.cwd(), 'supabase', '.env') });

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    const online = Boolean(supabaseUrl && serviceKey);
    return { supabaseUrl, serviceKey, online };
}

module.exports = { loadEnv };


