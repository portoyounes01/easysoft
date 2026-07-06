// pwa-login — resolve a username-OR-email + password to a session whose JWT carries the
// active tenant's claims. Runs server-side (service role) so:
//   - username -> email resolution never leaks (all misses return ONE generic error;
//     no username/email enumeration oracle — docs/pwa-plan.md §3.2b / REGISTER D22);
//   - the active-tenant claims (tenant_id/app_role/store_ids) are minted here, not
//     dashboard-hook-derived. tenant_members is the source of truth.
// verify_jwt=false: this IS the login, there is no session yet.
//
// NOTE (REGISTER D22): brute-force RATE-LIMITING is not implemented here yet — the
// generic-error design defeats enumeration, but add per-identifier/IP throttling before
// heavy use. Flagged, not silently omitted.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const GENERIC = 'invalid_credentials'; // identical for unknown identifier AND wrong password

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!url || !serviceKey || !anonKey) return json({ error: 'server_misconfigured' }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });

  let body: { identifier?: string; password?: string; tenant_id?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const identifier = String(body.identifier ?? '').trim();
  const password = String(body.password ?? '');
  const wantTenant = body.tenant_id ? String(body.tenant_id) : null;
  if (!identifier || !password) return json({ error: GENERIC }, 401);

  // resolve identifier -> email (server-only; any miss => generic error)
  let email: string | null = null;
  if (identifier.includes('@')) {
    email = identifier;
  } else {
    const { data: prof } = await admin.from('user_profiles').select('user_id').eq('username', identifier).maybeSingle();
    if (prof?.user_id) {
      const { data: u } = await admin.auth.admin.getUserById(prof.user_id);
      email = u?.user?.email ?? null;
    }
  }
  if (!email) return json({ error: GENERIC }, 401);

  // verify the password
  const { data: signIn, error: sErr } = await anon.auth.signInWithPassword({ email, password });
  if (sErr || !signIn?.user) return json({ error: GENERIC }, 401);
  const userId = signIn.user.id;

  // load memberships (tenant_members is the source of truth)
  const { data: members } = await admin.from('tenant_members').select('tenant_id, role, store_ids').eq('user_id', userId);
  const memberships = members ?? [];
  if (memberships.length === 0) return json({ error: 'no_membership' }, 403);

  // choose the active tenant
  let active: { tenant_id: string; role: string; store_ids: string[] | null } | undefined;
  if (wantTenant) {
    active = memberships.find((m) => m.tenant_id === wantTenant);
    if (!active) return json({ error: 'not_a_member' }, 403);
  } else if (memberships.length === 1) {
    active = memberships[0];
  } else {
    // multiple memberships, none chosen — ask the client to pick (no session yet)
    return json({ status: 'select_tenant', memberships: memberships.map((m) => ({ tenant_id: m.tenant_id, role: m.role })) });
  }

  // stamp active-tenant claims, then re-mint a session so the JWT actually carries them
  const app_metadata = { tenant_id: active.tenant_id, app_role: active.role, ...(active.store_ids ? { store_ids: active.store_ids } : {}) };
  const { error: uErr } = await admin.auth.admin.updateUserById(userId, { app_metadata });
  if (uErr) return json({ error: 'claim_stamp_failed' }, 500);
  const { data: fresh, error: fErr } = await anon.auth.signInWithPassword({ email, password });
  if (fErr || !fresh?.session) return json({ error: 'session_mint_failed' }, 500);

  return json({
    status: 'ok',
    session: {
      access_token: fresh.session.access_token,
      refresh_token: fresh.session.refresh_token,
      expires_at: fresh.session.expires_at,
    },
    active: { tenant_id: active.tenant_id, role: active.role, store_ids: active.store_ids ?? null },
    memberships: memberships.map((m) => ({ tenant_id: m.tenant_id, role: m.role })),
  });
});
