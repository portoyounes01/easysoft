// revoke-human — an owner/admin removes a human's membership FROM THEIR OWN tenant.
// verify_jwt=true. Companion to provision-human (which only CREATES members). Closes the
// off-device Web Push leak a removed manager would otherwise keep (docs/pwa-notifications-plan.md P3d).
//
// Authz mirrors provision-human: caller must be owner|admin (from the VERIFIED JWT, never the
// body); tenant is FORCED to the caller's tenant; target role may not exceed the caller's.
// Effects: delete membership + delete push_subscriptions (immediate off-device stop) + re-stamp
// app_metadata if the removed tenant was the target's ACTIVE one. NOTE: supabase-js admin.signOut
// needs the target's JWT (not their id), so we cannot force-invalidate the live access token here;
// the custom_access_token hook (migration 20260724000000) drops the tenant claim at the next
// refresh, bounding the residual feed/REST access to ≤ jwt_expiry. Push is closed immediately.
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
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !serviceKey) return json({ error: 'server_misconfigured' }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // caller identity from the VERIFIED JWT (never trust the body for authority)
  const authz = req.headers.get('Authorization') ?? '';
  const jwt = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  const { data: userData } = await admin.auth.getUser(jwt);
  const caller = userData?.user;
  if (!caller) return json({ error: 'unauthorized' }, 401);
  const cmeta = (caller.app_metadata ?? {}) as { tenant_id?: string; app_role?: string };
  const callerTenant = cmeta.tenant_id;
  const callerRole = cmeta.app_role ?? '';
  if (!callerTenant || !(callerRole === 'owner' || callerRole === 'admin')) return json({ error: 'forbidden' }, 403);

  let body: { user_id?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const targetUser = String(body.user_id ?? '').trim();
  if (!targetUser) return json({ error: 'user_id_required' }, 400);
  if (targetUser === caller.id) return json({ error: 'cannot_remove_self' }, 400);

  const tenant = callerTenant; // FORCED to the caller's verified tenant

  // Enforce rank: an admin cannot remove an owner. Idempotent if there is no membership.
  const { data: mem } = await admin.from('tenant_members').select('role').eq('user_id', targetUser).eq('tenant_id', tenant).maybeSingle();
  if (!mem) return json({ status: 'ok', note: 'no_membership' });
  if (RANK[mem.role as string] > RANK[callerRole]) return json({ error: 'role_exceeds_caller' }, 403);

  // 1) remove the membership via the last-owner-guarded RPC — serializes concurrent revokes so
  //    two owners removing each other can't zero out ownership, and refuses to drop the last owner.
  const { data: revokeResult, error: dmErr } = await admin.rpc('revoke_tenant_member', { p_tenant: tenant, p_user: targetUser });
  if (dmErr) return json({ error: 'membership_delete_failed', detail: dmErr.message }, 500);
  if (revokeResult === 'last_owner') return json({ error: 'cannot_remove_last_owner' }, 409);
  if (revokeResult === 'no_membership') return json({ status: 'ok', note: 'no_membership' });

  // 2) drop this user's push subscriptions for the tenant — stops off-device push at once,
  //    independent of the delivery-side membership join (defense in depth).
  await admin.from('push_subscriptions').delete().eq('user_id', targetUser).eq('tenant_id', tenant);

  // 2b) drop the user's linked WhatsApp numbers for the tenant — the assistant's WhatsApp
  //     channel is another standing off-device credential; the webhook also re-checks
  //     membership per message (defense in depth), but unlink here stops it at once.
  await admin.from('owner_whatsapp_numbers').delete().eq('user_id', targetUser).eq('tenant_id', tenant);

  // 3) if the removed tenant was the user's ACTIVE claim, re-point it at a remaining membership
  //    (or clear tenant claims). The custom_access_token hook enforces this at refresh regardless.
  const { data: tu } = await admin.auth.admin.getUserById(targetUser);
  const targetMeta = (tu?.user?.app_metadata ?? {}) as Record<string, unknown>;
  if (targetMeta.tenant_id === tenant) {
    const { data: remaining } = await admin.from('tenant_members')
      .select('tenant_id, role, store_ids').eq('user_id', targetUser).limit(1);
    const next = remaining?.[0] as { tenant_id: string; role: string; store_ids: string[] | null } | undefined;
    let newMeta: Record<string, unknown>;
    if (next) {
      newMeta = { ...targetMeta, tenant_id: next.tenant_id, app_role: next.role };
      if (next.store_ids) newMeta.store_ids = next.store_ids; else delete newMeta.store_ids;
    } else {
      newMeta = { ...targetMeta };
      delete newMeta.tenant_id; delete newMeta.app_role; delete newMeta.store_ids; delete newMeta.store_id;
    }
    const { error: upErr } = await admin.auth.admin.updateUserById(targetUser, { app_metadata: newMeta });
    if (upErr) return json({ error: 'restamp_failed', detail: upErr.message }, 500);
  }

  return json({ status: 'ok', user_id: targetUser, tenant, reassigned: targetMeta.tenant_id === tenant });
});
