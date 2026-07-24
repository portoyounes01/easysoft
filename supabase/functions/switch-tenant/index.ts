// switch-tenant — for a MULTI-TENANT human, re-stamp app_metadata to another tenant they
// belong to; the client then calls supabase.auth.refreshSession() to pick up the new
// claims. app_metadata holds the ACTIVE selection; tenant_members is the source of truth.
// verify_jwt=true (must already be logged in).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !serviceKey) return json({ error: 'server_misconfigured' }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // identify the caller from their verified JWT
  const authz = req.headers.get('Authorization') ?? '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body: { tenant_id?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const tenantId = String(body.tenant_id ?? '');
  if (!tenantId) return json({ error: 'tenant_id_required' }, 400);

  // must actually be a member of the target tenant
  const { data: m } = await admin.from('tenant_members')
    .select('tenant_id, role, store_ids').eq('user_id', user.id).eq('tenant_id', tenantId).maybeSingle();
  if (!m) return json({ error: 'not_a_member' }, 403);

  // GoTrue MERGES app_metadata: store_ids must be EXPLICITLY nulled when the target
  // membership has none, or the previous tenant's store scope survives the switch
  // (and empty arrays normalize to null — [] reads as scoped-to-zero-stores).
  const app_metadata = {
    tenant_id: m.tenant_id,
    app_role: m.role,
    store_ids: m.store_ids?.length ? m.store_ids : null,
    store_id: null,
  };
  const { error } = await admin.auth.admin.updateUserById(user.id, { app_metadata });
  if (error) return json({ error: 'claim_stamp_failed' }, 500);

  // client MUST refreshSession() next — the current access token still has the old claims.
  return json({ status: 'ok', active: { tenant_id: m.tenant_id, role: m.role, store_ids: m.store_ids ?? null } });
});
