#!/usr/bin/env node
// provision-human.mjs — bootstrap a PWA human (owner/admin/manager) for a tenant.
//
// Service-role only. Use this for the FIRST owner of a tenant (no existing admin to
// authorize it); additional humans are created in-app via the `provision-human` EDGE
// function, which enforces caller authz (D21). See docs/pwa-p1-auth-design.md.
//
// Stamps app_metadata = { tenant_id, app_role, store_ids? } — the exact keys the
// app.tenant_id()/app.app_role()/app.store_ids() helpers read (20260707000000).
//
// Usage:
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<key> \
//   node scripts/provision-human.mjs --email a@b.com --username alice --password 'Secret123!' \
//       [--tenant <uuid>] [--role owner|admin|manager] [--store-ids uuid,uuid] [--display-name "Alice"]
import { createClient } from '@supabase/supabase-js';

const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001';
const RANK = ['owner', 'admin', 'manager'];

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('ERROR: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
    process.exit(1);
  }
  const email = arg('email');
  const username = arg('username');
  const password = arg('password');
  if (!email || !password) {
    console.error('ERROR: --email and --password are required.');
    process.exit(1);
  }
  const tenant = arg('tenant', DEFAULT_TENANT);
  const role = arg('role', 'owner');
  if (!RANK.includes(role)) {
    console.error('ERROR: --role must be owner|admin|manager.');
    process.exit(1);
  }
  const storeIds = arg('store-ids') ? arg('store-ids').split(',').map((s) => s.trim()).filter(Boolean) : null;
  const displayName = arg('display-name', username || email);

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const app_metadata = { tenant_id: tenant, app_role: role, ...(storeIds ? { store_ids: storeIds } : {}) };

  // create the auth user (or reuse + update if the email already exists)
  let userId;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, app_metadata,
  });
  if (cErr) {
    if (String(cErr.message || '').toLowerCase().includes('already')) {
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list?.users?.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
      if (!existing) { console.error('ERROR: user exists but could not be located:', cErr.message); process.exit(1); }
      userId = existing.id;
      await admin.auth.admin.updateUserById(userId, { password, app_metadata });
    } else {
      console.error('ERROR creating user:', cErr.message);
      process.exit(1);
    }
  } else {
    userId = created.user.id;
  }

  if (username) {
    const { error: pErr } = await admin.from('user_profiles').upsert(
      { user_id: userId, username, display_name: displayName, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (pErr) { console.error('ERROR writing user_profiles (username may be taken):', pErr.message); process.exit(1); }
  }

  const { error: mErr } = await admin.from('tenant_members').upsert(
    { user_id: userId, tenant_id: tenant, role, store_ids: storeIds },
    { onConflict: 'user_id,tenant_id' },
  );
  if (mErr) { console.error('ERROR writing tenant_members:', mErr.message); process.exit(1); }

  console.log(JSON.stringify({ ok: true, user_id: userId, email, username, tenant, role, store_ids: storeIds }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
