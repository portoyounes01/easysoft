// provision-human — an owner/admin creates ANOTHER human INTO THEIR OWN tenant.
// verify_jwt=true. This is the claim-ISSUANCE authority, so it enforces hard authz
// invariants (docs/pwa-plan.md §3.2c / REGISTER D21) — a malformed issuer here would let
// any authenticated human mint an owner in any tenant (total takeover). Invariants:
//   * caller must be app_role owner|admin (from the VERIFIED JWT — never the body);
//   * new user's tenant is FORCED to the caller's tenant (body tenant_id is ignored);
//   * new role may not exceed the caller's (admin cannot mint an owner);
//   * store_ids must be a subset of the caller's when the caller is store-scoped;
//   * never stamps device_id / app_role 'device'.
// Onboarding is admin-set password (no email/SMTP), per the v1 decision.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const RANK: Record<string, number> = { owner: 3, admin: 2, manager: 1 };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  // ADMIN_SERVICE_KEY (explicit secret) preferred over the injected env: functions
  // created after Supabase's new-API-keys rollout get injected a credential GoTrue's
  // ADMIN endpoints cannot verify ("unrecognized JWT kid <nil> for algorithm ES256"
  // — PostgREST accepts it, auth.admin.* fails). Set via:
  //   supabase secrets set ADMIN_SERVICE_KEY=<legacy service_role JWT>
  const serviceKey = Deno.env.get('ADMIN_SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !serviceKey) return json({ error: 'server_misconfigured' }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // caller identity from the VERIFIED JWT (never trust the body for authority)
  const authz = req.headers.get('Authorization') ?? '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  const { data: userData } = await admin.auth.getUser(token);
  const caller = userData?.user;
  if (!caller) return json({ error: 'unauthorized' }, 401);
  const cmeta = (caller.app_metadata ?? {}) as { tenant_id?: string; app_role?: string; store_ids?: string[] };
  const callerTenant = cmeta.tenant_id;
  const callerRole = cmeta.app_role ?? '';
  if (!callerTenant || !(callerRole === 'owner' || callerRole === 'admin')) return json({ error: 'forbidden' }, 403);

  let body: { email?: string; username?: string; password?: string; role?: string; store_ids?: string[]; display_name?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const email = String(body.email ?? '').trim();
  const username = body.username ? String(body.username).trim() : null;
  const password = String(body.password ?? '');
  const role = String(body.role ?? 'manager');
  // Lowercased at the boundary: uuids are case-insensitive but Postgres returns
  // them lowercase, so mixed-case input would false-fail the existence check.
  // Empty array normalized to null — a stamped [] reads as scoped-to-zero-stores
  // in edge-fn scope gates (manage-devices), silently bricking the member.
  const storeIds = Array.isArray(body.store_ids) && body.store_ids.length > 0
    ? body.store_ids.map((s) => String(s).toLowerCase())
    : null;
  const displayName = body.display_name ? String(body.display_name) : (username || email);

  if (!email || !password) return json({ error: 'email_password_required' }, 400);
  if (!(role in RANK)) return json({ error: 'bad_role' }, 400);
  // role may not exceed the caller (admin cannot mint an owner)
  if (RANK[role] > RANK[callerRole]) return json({ error: 'role_exceeds_caller' }, 403);
  // store_ids must be within the caller's scope when the caller is store-scoped
  const callerStores = Array.isArray(cmeta.store_ids) ? cmeta.store_ids : null;
  if (callerStores && storeIds && !storeIds.every((s) => callerStores.includes(s))) {
    return json({ error: 'store_scope_exceeds_caller' }, 403);
  }
  // store_ids must name REAL stores of THIS tenant — a membership scoped to
  // nonexistent/foreign stores is a silent authz misconfiguration (the DB
  // trigger app.validate_tenant_member_store_ids is the schema-level backstop).
  if (storeIds && storeIds.length > 0) {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!storeIds.every((s) => UUID_RE.test(s))) return json({ error: 'store_ids_not_uuids' }, 400);
    const { data: storeRows, error: sErr } = await admin
      .from('stores').select('id').eq('tenant_id', callerTenant).in('id', storeIds);
    if (sErr) return json({ error: 'store_lookup_failed', detail: sErr.message }, 500);
    const known = new Set((storeRows ?? []).map((r) => String(r.id)));
    const missing = storeIds.filter((s) => !known.has(s));
    if (missing.length > 0) return json({ error: 'unknown_store_ids', detail: missing.join(',') }, 400);
  }

  // tenant is FORCED to the caller's verified tenant — body tenant_id is never honored
  const tenant = callerTenant;
  const app_metadata = { tenant_id: tenant, app_role: role, ...(storeIds ? { store_ids: storeIds } : {}) };

  // create the auth user (or reuse + update if the email already exists — enables a
  // SECOND membership for an existing person, which is intended under multi-tenant)
  let userId: string;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata });
  if (cErr) {
    if (String(cErr.message || '').toLowerCase().includes('already')) {
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list?.users?.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
      if (!existing) return json({ error: 'user_exists_unresolvable' }, 409);
      userId = existing.id;
      // do NOT reset an existing user's password on a second-tenant add
    } else {
      return json({ error: 'create_failed', detail: cErr.message }, 500);
    }
  } else {
    userId = created!.user.id;
  }

  // Platform admins can never be tenant members (v1 disjointness — see
  // docs/platform-console-runbook.md). GENERIC error on purpose: a tenant owner
  // must not learn which emails are platform operators.
  const { data: paRow } = await admin.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle();
  if (paRow) return json({ error: 'create_failed' }, 500);

  if (username) {
    const { error: pErr } = await admin.from('user_profiles').upsert(
      { user_id: userId, username, display_name: displayName, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (pErr) return json({ error: 'username_taken_or_failed', detail: pErr.message }, 409);
  }

  const { error: mErr } = await admin.from('tenant_members').upsert(
    { user_id: userId, tenant_id: tenant, role, store_ids: storeIds },
    { onConflict: 'user_id,tenant_id' },
  );
  if (mErr) return json({ error: 'membership_failed', detail: mErr.message }, 500);

  return json({ status: 'ok', user_id: userId, tenant, role, store_ids: storeIds });
});
