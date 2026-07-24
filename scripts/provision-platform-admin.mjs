#!/usr/bin/env node
// provision-platform-admin.mjs — bootstrap a PLATFORM (sysadmin) console operator.
//
// Service-role only, and deliberately NOT self-service: there is no in-app way to
// mint a platform admin (the platform-admin edge fn manages tenants, not its own
// operators). docs/platform-console-runbook.md.
//
// Creates/finds the auth user, inserts the public.platform_admins row (the SSOT the
// edge fn checks per request), stamps app_metadata.platform_admin = true (UI-only
// claim so the client can derive a platform principal on reload; the access-token
// hook strips it if the row is ever deleted), and optionally a user_profiles
// username so pwa-login's username path works.
//
// A platform admin must NOT also hold tenant memberships (pwa-login gives the
// tenant path precedence — the console would become unreachable for that user).
// The script refuses in that case.
//
// Usage:
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<key> \
//   node scripts/provision-platform-admin.mjs --email you@example.com --password 'Secret123!' \
//       [--username khalil] [--note "Khalil — founder"] [--display-name "Khalil"]
//
// Removal: DELETE FROM public.platform_admins WHERE user_id = '<uuid>'; the hook
// strips the claim at the next token refresh (≤1h) and the edge fn refuses at once.
import { createClient } from '@supabase/supabase-js';

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
  const password = arg('password');
  if (!email || !password) {
    console.error('ERROR: --email and --password are required.');
    process.exit(1);
  }
  const username = arg('username');
  const note = arg('note', null);
  const displayName = arg('display-name', username || email);

  const admin = createClient(url, key, { auth: { persistSession: false } });

  // Platform access and tenant membership are DISJOINT in v1 (pwa-login prefers the
  // tenant path, which would strand this user outside the console). MUST run before
  // any mutation: the exists-branch below resets the user's password, and doing that
  // to a production tenant owner's login before refusing would be the real damage.
  const refuseIfTenantMember = async (userId) => {
    const { data: memberships, error: memErr } = await admin
      .from('tenant_members').select('tenant_id, role').eq('user_id', userId);
    if (memErr) { console.error('ERROR checking tenant_members:', memErr.message); process.exit(1); }
    if ((memberships ?? []).length > 0) {
      console.error('ERROR: this user holds tenant memberships:', JSON.stringify(memberships));
      console.error('Platform admins must be dedicated accounts. Use a different email.');
      process.exit(1);
    }
  };

  // create the auth user (or reuse + update if the email already exists)
  let userId;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, app_metadata: { platform_admin: true },
  });
  if (cErr) {
    if (String(cErr.message || '').toLowerCase().includes('already')) {
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list?.users?.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
      if (!existing) { console.error('ERROR: user exists but could not be located:', cErr.message); process.exit(1); }
      userId = existing.id;
      await refuseIfTenantMember(userId); // BEFORE touching the account
      const meta = existing.app_metadata ?? {};
      await admin.auth.admin.updateUserById(userId, { password, app_metadata: { ...meta, platform_admin: true } });
    } else {
      console.error('ERROR creating user:', cErr.message);
      process.exit(1);
    }
  } else {
    userId = created.user.id;
    await refuseIfTenantMember(userId); // fresh user: vacuous, kept for symmetry
  }

  const { error: paErr } = await admin.from('platform_admins').upsert(
    { user_id: userId, note },
    { onConflict: 'user_id' },
  );
  if (paErr) { console.error('ERROR writing platform_admins:', paErr.message); process.exit(1); }

  if (username) {
    const { error: pErr } = await admin.from('user_profiles').upsert(
      { user_id: userId, username, display_name: displayName, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (pErr) { console.error('ERROR writing user_profiles (username may be taken):', pErr.message); process.exit(1); }
  }

  console.log(JSON.stringify({ ok: true, user_id: userId, email, username, note }, null, 2));
  console.log('Sign in on the PWA with these credentials — you will land on /platform.');
}

main().catch((e) => { console.error(e); process.exit(1); });
