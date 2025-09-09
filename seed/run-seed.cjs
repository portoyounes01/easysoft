#!/usr/bin/env node

/*
  YAML-driven seeding runner for Supabase-backed POS
  - Reads seed/employees.yml, seed/categories.yml, optional cashier-tests and cash-drawer-logs
  - ONLINE: uses service role to upsert/insert into Supabase
  - OFFLINE: writes consolidated JSON to public/seed-export.json

  This complements existing /setup bootstrap; it does not replace it.
*/

const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { loadEnv } = require('./lib/env.cjs');
const { readYamlIfExists } = require('./lib/loadYaml.cjs');
const { coerceToUuidOrDeterministic } = require('./lib/uuid.cjs');

function log(msg) { console.log(msg); }
function error(msg) { console.error(msg); }

function normalizeEmployees(input) {
    const rows = (input && input.employees) || [];
    return rows.map((e) => ({
        id: coerceToUuidOrDeterministic(e.id || e.employee_number),
        employee_number: e.employee_number,
        name: e.name,
        email: e.email || null,
        phone: e.phone || null,
        password_hash: e.password_hash || null,
        pin: e.pin || null,
        role: e.role,
        access_levels: Array.isArray(e.access_levels) ? e.access_levels : [],
        is_active: e.is_active !== false,
        hire_date: e.hire_date,
        total_sales: e.total_sales ?? 0,
        transaction_count: e.transaction_count ?? 0,
        average_transaction: e.average_transaction ?? 0,
        hours_worked: e.hours_worked ?? 0,
        created_at: e.created_at || new Date().toISOString(),
        updated_at: e.updated_at || new Date().toISOString(),
        last_synced_at: e.last_synced_at || null,
        deleted_at: e.deleted_at || null,
    }));
}

function normalizeCategories(input) {
    const rows = (input && input.categories) || [];
    return rows.map((c) => ({
        id: coerceToUuidOrDeterministic(c.id || c.name),
        name: c.name,
        description: c.description || null,
        color: c.color || 'from-gray-500 to-gray-600',
        icon: c.icon || 'package',
        display_order: c.display_order ?? 0,
        is_active: c.is_active !== false,
        created_at: c.created_at || new Date().toISOString(),
        updated_at: c.updated_at || new Date().toISOString(),
        deleted_at: c.deleted_at || null,
    }));
}

function normalizeCashierTests(input) {
    const rows = (input && input.cashier_tests) || [];
    return rows.map((t) => ({
        id: coerceToUuidOrDeterministic(t.id || `${t.employee_id}-${t.timestamp || ''}-${t.test_type}`),
        employee_id: coerceToUuidOrDeterministic(t.employee_id),
        test_type: t.test_type,
        test_details: t.test_details || {},
        timestamp: t.timestamp || new Date().toISOString(),
        success: t.success !== false,
        error_message: t.error_message || null,
        notes: t.notes || null,
        created_at: t.created_at || new Date().toISOString(),
        updated_at: t.updated_at || new Date().toISOString(),
    }));
}

function normalizeCashDrawerLogs(input) {
    const rows = (input && input.cash_drawer_logs) || [];
    return rows.map((r) => ({
        id: coerceToUuidOrDeterministic(r.id || `${r.employee_id}-${r.timestamp || ''}-${r.action}`),
        employee_id: coerceToUuidOrDeterministic(r.employee_id),
        transaction_id: r.transaction_id ? coerceToUuidOrDeterministic(r.transaction_id) : null,
        action: r.action,
        reason: r.reason || null,
        timestamp: r.timestamp || new Date().toISOString(),
        success: r.success !== false,
        error_message: r.error_message || null,
        created_at: r.created_at || new Date().toISOString(),
        updated_at: r.updated_at || new Date().toISOString(),
    }));
}

async function upsertEmployees(supabase, employees) {
    if (!employees.length) return 0;
    const { error: err } = await supabase.from('employees').upsert(employees, { onConflict: 'employee_number' });
    if (err) throw new Error(`employees upsert failed: ${err.message}`);
    return employees.length;
}

async function upsertCategories(supabase, categories) {
    if (!categories.length) return 0;
    const { error: err } = await supabase.from('categories').upsert(categories, { onConflict: 'id' });
    if (err) throw new Error(`categories upsert failed: ${err.message}`);
    return categories.length;
}

async function insertCashierTests(supabase, tests) {
    if (!tests.length) return 0;
    const { error: err } = await supabase.from('cashier_tests').insert(tests);
    if (err) throw new Error(`cashier_tests insert failed: ${err.message}`);
    return tests.length;
}

async function insertCashDrawerLogs(supabase, logs) {
    if (!logs.length) return 0;
    const { error: err } = await supabase.from('cash_drawer_logs').insert(logs);
    if (err) throw new Error(`cash_drawer_logs insert failed: ${err.message}`);
    return logs.length;
}

async function run() {
    log('🚀 Seeding runner starting...');

    const { supabaseUrl, serviceKey, online } = loadEnv();
    const employeesYaml = readYamlIfExists('seed/employees.yml');
    const categoriesYaml = readYamlIfExists('seed/categories.yml');
    const cashierTestsYaml = readYamlIfExists('seed/cashier-tests.yml');
    const cashDrawerLogsYaml = readYamlIfExists('seed/cash-drawer-logs.yml');

    const employees = normalizeEmployees(employeesYaml);
    const categories = normalizeCategories(categoriesYaml);
    const cashierTests = normalizeCashierTests(cashierTestsYaml);
    const cashDrawerLogs = normalizeCashDrawerLogs(cashDrawerLogsYaml);

    if (!online) {
        log('📱 Offline mode: writing consolidated seed export to public/seed-export.json');
        const out = {
            employees,
            categories,
            cashier_tests: cashierTests,
            cash_drawer_logs: cashDrawerLogs,
            created_at: new Date().toISOString(),
        };
        const outDir = path.resolve(process.cwd(), 'public');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const outPath = path.join(outDir, 'seed-export.json');
        fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
        log(`✅ Wrote ${outPath}`);
        process.exit(0);
    }

    log('🌐 Online mode: seeding Supabase');
    const supabase = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    try {
        const insertedEmployees = await upsertEmployees(supabase, employees);
        log(`👥 employees upserted: ${insertedEmployees}`);

        const insertedCategories = await upsertCategories(supabase, categories);
        log(`🏷️ categories upserted: ${insertedCategories}`);

        const testsInserted = await insertCashierTests(supabase, cashierTests);
        log(`🧪 cashier_tests inserted: ${testsInserted}`);

        const logsInserted = await insertCashDrawerLogs(supabase, cashDrawerLogs);
        log(`🗃️ cash_drawer_logs inserted: ${logsInserted}`);

        log('✅ Seeding completed successfully');
    } catch (e) {
        error(`❌ Seeding failed: ${e.message}`);
        process.exit(1);
    }
}

run();


