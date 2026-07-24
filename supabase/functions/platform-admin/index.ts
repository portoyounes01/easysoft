// platform-admin — the platform (sysadmin) console backend: cross-tenant control of
// tenants, stores, owner accounts, and ALL tills. docs/platform-console-runbook.md.
//
// verify_jwt=true. Authority model (multi-tenant-plan §6.5: "platform tooling =
// service role from back-office only, no RLS carve-outs"):
//   * the caller must have a public.platform_admins row — checked PER REQUEST against
//     the table (the SSOT), never against the app_metadata.platform_admin claim
//     (that claim exists only so the client can render a platform principal);
//   * tenant/store/device ids come from the body BY DESIGN (this is the cross-tenant
//     surface) — every id is still resolved server-side before acting on it;
//   * all DB work runs under the service role; every mutation appends a
//     platform_audit_log row (a console that can touch every tenant must not be
//     able to act invisibly). Pairing codes and passwords are NEVER audited.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const RANK: Record<string, number> = { owner: 3, admin: 2, manager: 1 };
const TENANT_STATUSES = ['provisioning', 'active', 'suspended', 'offboarding'];
const SUBSCRIPTION_PLANS = ['trial', 'basic', 'standard', 'premium']; // provisional names — 20260801 migration
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PAIRING_TTL_MINUTES = 15;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pairingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  let value = '';
  for (let offset = 0; offset + 5 <= bits.length; offset += 5) {
    value += CODE_ALPHABET[Number.parseInt(bits.slice(offset, offset + 5), 2)];
  }
  return value.match(/.{1,4}/g)?.join('-') ?? value;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

const uuidOrNull = (v: unknown): string | null => {
  const s = String(v ?? '').trim().toLowerCase(); // Postgres returns uuids lowercase
  return UUID_RE.test(s) ? s : null;
};

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

  // caller identity from the VERIFIED JWT; authority from the platform_admins TABLE
  const authz = req.headers.get('Authorization') ?? '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  const { data: userData } = await admin.auth.getUser(token);
  const caller = userData?.user;
  if (!caller) return json({ error: 'unauthorized' }, 401);
  const { data: pa, error: paErr } = await admin
    .from('platform_admins').select('user_id').eq('user_id', caller.id).maybeSingle();
  if (paErr) return json({ error: 'authz_check_failed' }, 500);
  if (!pa) return json({ error: 'not_platform_admin' }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const action = String(body.action ?? '');
  if (!action) return json({ error: 'missing_action' }, 400);

  // Every mutation is audited; an audit failure is loud in the function logs but does
  // not roll back the mutation (PostgREST has no cross-request transaction).
  const audit = async (act: string, target: Record<string, unknown>) => {
    const { error } = await admin.from('platform_audit_log').insert({ actor_user_id: caller.id, action: act, target });
    if (error) console.error(`platform-admin: AUDIT WRITE FAILED for ${act}:`, error.message, JSON.stringify(target));
  };

  // ---------------------------------------------------------------- tenants
  if (action === 'list_tenants') {
    const [tn, st, dv, mb] = await Promise.all([
      admin.from('tenants').select('id, name, legal_name, nif, country, status, subscription_plan, created_at').order('created_at'),
      admin.from('stores').select('id, tenant_id, status'),
      admin.from('devices').select('id, tenant_id, status, presence'),
      admin.from('tenant_members').select('tenant_id, user_id, role'),
    ]);
    if (tn.error || st.error || dv.error || mb.error) return json({ error: 'tenant_list_failed' }, 500);
    const tenants = (tn.data ?? []).map((t) => {
      const stores = (st.data ?? []).filter((s) => s.tenant_id === t.id);
      const devices = (dv.data ?? []).filter((d) => d.tenant_id === t.id);
      const members = (mb.data ?? []).filter((m) => m.tenant_id === t.id);
      return {
        ...t,
        counts: {
          stores: stores.length,
          stores_active: stores.filter((s) => s.status === 'active').length,
          devices: devices.length,
          devices_enrolled: devices.filter((d) => d.status === 'enrolled').length,
          devices_online: devices.filter((d) => d.presence === 'online').length,
          members: members.length,
          owners: members.filter((m) => m.role === 'owner').length,
        },
      };
    });
    return json({ tenants });
  }

  if (action === 'create_tenant') {
    const name = String(body.name ?? '').trim();
    const legalName = String(body.legal_name ?? '').trim();
    const nif = String(body.nif ?? '').trim().toUpperCase();
    const country = (String(body.country ?? 'PT').trim().toUpperCase() || 'PT');
    const plan = String(body.subscription_plan ?? 'basic');
    const status = String(body.status ?? 'active');
    if (!name || name.length > 200) return json({ error: 'invalid_name' }, 400);
    if (!legalName || legalName.length > 200) return json({ error: 'invalid_legal_name' }, 400);
    if (!nif) return json({ error: 'invalid_nif' }, 400);
    if (!SUBSCRIPTION_PLANS.includes(plan)) return json({ error: 'bad_subscription_plan' }, 400);
    if (!TENANT_STATUSES.includes(status)) return json({ error: 'bad_status' }, 400);
    const { data: tenant, error } = await admin
      .from('tenants')
      .insert({ name, legal_name: legalName, nif, country, status, subscription_plan: plan })
      .select('id, name, legal_name, nif, country, status, subscription_plan, created_at')
      .single();
    // surface CHECK-constraint detail (e.g. PT nif must be 9 digits) so the console can say why
    if (error || !tenant) return json({ error: 'tenant_create_failed', detail: error?.message }, 500);
    await audit('create_tenant', { tenant_id: tenant.id, name, nif, country, subscription_plan: plan, status });
    return json({ status: 'ok', tenant }, 201);
  }

  if (action === 'update_tenant') {
    const tenantId = uuidOrNull(body.tenant_id);
    if (!tenantId) return json({ error: 'tenant_required' }, 400);
    const patchIn = (body.patch ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const key of ['name', 'legal_name', 'nif', 'country', 'status', 'subscription_plan', 'registry_number'] as const) {
      if (patchIn[key] != null) patch[key] = String(patchIn[key]).trim();
    }
    if (typeof patch.nif === 'string') patch.nif = (patch.nif as string).toUpperCase();
    if (typeof patch.country === 'string') patch.country = (patch.country as string).toUpperCase();
    if (patch.name != null && (patch.name === '' || String(patch.name).length > 200)) return json({ error: 'invalid_name' }, 400);
    if (patch.legal_name != null && (patch.legal_name === '' || String(patch.legal_name).length > 200)) return json({ error: 'invalid_legal_name' }, 400);
    if (patch.nif === '') return json({ error: 'invalid_nif' }, 400);
    if (patch.status != null && !TENANT_STATUSES.includes(String(patch.status))) return json({ error: 'bad_status' }, 400);
    if (patch.subscription_plan != null && !SUBSCRIPTION_PLANS.includes(String(patch.subscription_plan))) return json({ error: 'bad_subscription_plan' }, 400);
    if (Object.keys(patch).length === 0) return json({ error: 'empty_patch' }, 400);
    patch.updated_at = new Date().toISOString();
    const { data: tenant, error } = await admin
      .from('tenants').update(patch).eq('id', tenantId)
      .select('id, name, legal_name, nif, country, status, subscription_plan')
      .maybeSingle();
    if (error) return json({ error: 'tenant_update_failed', detail: error.message }, 500);
    if (!tenant) return json({ error: 'tenant_not_found' }, 404);
    await audit('update_tenant', { tenant_id: tenantId, patch: { ...patch, updated_at: undefined } });
    return json({ status: 'ok', tenant });
  }

  if (action === 'delete_tenant') {
    const tenantId = uuidOrNull(body.tenant_id);
    if (!tenantId) return json({ error: 'tenant_required' }, 400);
    // Collect BEFORE the teardown: device auth users to delete, members to re-stamp.
    // Abort on a read failure — proceeding would guarantee orphaned auth users.
    const [devicesRes, membersRes] = await Promise.all([
      admin.from('devices').select('auth_user_id').eq('tenant_id', tenantId).not('auth_user_id', 'is', null),
      admin.from('tenant_members').select('user_id').eq('tenant_id', tenantId),
    ]);
    if (devicesRes.error || membersRes.error) return json({ error: 'tenant_delete_precheck_failed' }, 500);
    const tenantDevices = devicesRes.data ?? [];
    const tenantMembers = membersRes.data ?? [];
    const { data: result, error: delErr } = await admin.rpc('platform_delete_tenant', { p_tenant: tenantId });
    if (delErr) return json({ error: 'tenant_delete_failed', detail: delErr.message }, 500);
    if (result === 'no_tenant') return json({ error: 'tenant_not_found' }, 404);
    if (result !== 'deleted') return json({ error: String(result) }, 409); // tenant_has_transactions / tenant_has_fiscal_documents
    // Device auth users are tenant-exclusive synthetic identities — delete them. If a
    // delete fails, BAN the credential so it cannot refresh, and report the residue
    // (the hook never strips device sessions, so a live credential would persist).
    const deviceUserFailures: string[] = [];
    for (const d of tenantDevices) {
      const uid = String(d.auth_user_id);
      const { error: duErr } = await admin.auth.admin.deleteUser(uid);
      if (duErr) {
        console.error(`platform-admin delete_tenant: deleteUser ${uid} failed:`, duErr.message);
        const { error: banErr } = await admin.auth.admin.updateUserById(uid, { ban_duration: '876000h' });
        if (banErr) console.error(`platform-admin delete_tenant: ban fallback ${uid} failed:`, banErr.message);
        deviceUserFailures.push(uid);
      }
    }
    // Humans may belong to other tenants: clear/repoint their ACTIVE claim only.
    // GoTrue MERGES app_metadata key-by-key — absent keys survive; explicit nulls delete.
    const restampFailures: string[] = [];
    for (const m of tenantMembers) {
      const memberId = String(m.user_id);
      const { data: tu } = await admin.auth.admin.getUserById(memberId);
      const meta = (tu?.user?.app_metadata ?? {}) as Record<string, unknown>;
      if (meta.tenant_id !== tenantId) continue;
      const { data: remaining } = await admin.from('tenant_members')
        .select('tenant_id, role, store_ids').eq('user_id', memberId).limit(1);
      const next = remaining?.[0] as { tenant_id: string; role: string; store_ids: string[] | null } | undefined;
      const app_metadata = next
        ? { tenant_id: next.tenant_id, app_role: next.role, store_ids: next.store_ids?.length ? next.store_ids : null, store_id: null }
        : { tenant_id: null, app_role: null, store_ids: null, store_id: null };
      const { error: reErr } = await admin.auth.admin.updateUserById(memberId, { app_metadata });
      if (reErr) {
        console.error(`platform-admin delete_tenant: restamp ${memberId} failed:`, reErr.message);
        restampFailures.push(memberId);
      }
    }
    await audit('delete_tenant', {
      tenant_id: tenantId,
      device_users_deleted: tenantDevices.length - deviceUserFailures.length,
      device_user_failures: deviceUserFailures,
      members_unlinked: tenantMembers.length - restampFailures.length,
      member_restamp_failures: restampFailures,
    });
    const residue = deviceUserFailures.length || restampFailures.length
      ? { residue: { device_user_failures: deviceUserFailures, member_restamp_failures: restampFailures } }
      : {};
    return json({ status: 'ok', deleted: tenantId, ...residue });
  }

  // ---------------------------------------------------------------- stores
  if (action === 'list_stores') {
    const tenantId = uuidOrNull(body.tenant_id);
    if (!tenantId) return json({ error: 'tenant_required' }, 400);
    const { data: stores, error } = await admin
      .from('stores')
      .select('id, tenant_id, name, address, postal_code, city, phone, email, timezone, status, created_at')
      .eq('tenant_id', tenantId).order('name');
    if (error) return json({ error: 'store_list_failed' }, 500);
    return json({ stores: stores ?? [] });
  }

  if (action === 'create_store') {
    const tenantId = uuidOrNull(body.tenant_id);
    const name = String(body.name ?? '').trim();
    if (!tenantId) return json({ error: 'tenant_required' }, 400);
    if (!name || name.length > 200) return json({ error: 'invalid_name' }, 400);
    const { data: tenant } = await admin.from('tenants').select('id').eq('id', tenantId).maybeSingle();
    if (!tenant) return json({ error: 'tenant_not_found' }, 404);
    const optional: Record<string, unknown> = {};
    for (const key of ['address', 'postal_code', 'city', 'phone', 'email', 'timezone'] as const) {
      if (body[key] != null && String(body[key]).trim()) optional[key] = String(body[key]).trim();
    }
    const { data: store, error } = await admin
      .from('stores').insert({ tenant_id: tenantId, name, ...optional })
      .select('id, tenant_id, name, address, postal_code, city, phone, email, timezone, status, created_at')
      .single();
    if (error || !store) return json({ error: 'store_create_failed', detail: error?.message }, 500);
    await audit('create_store', { tenant_id: tenantId, store_id: store.id, name });
    return json({ status: 'ok', store }, 201);
  }

  if (action === 'update_store') {
    const storeId = uuidOrNull(body.store_id);
    if (!storeId) return json({ error: 'store_required' }, 400);
    const patchIn = (body.patch ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const key of ['name', 'address', 'postal_code', 'city', 'phone', 'email', 'timezone', 'status'] as const) {
      if (patchIn[key] != null) patch[key] = String(patchIn[key]).trim();
    }
    if (patch.status != null && !['active', 'closed'].includes(String(patch.status))) return json({ error: 'bad_status' }, 400);
    if (Object.keys(patch).length === 0) return json({ error: 'empty_patch' }, 400);
    patch.updated_at = new Date().toISOString();
    const { data: store, error } = await admin
      .from('stores').update(patch).eq('id', storeId)
      .select('id, tenant_id, name, status').maybeSingle();
    if (error) return json({ error: 'store_update_failed', detail: error.message }, 500);
    if (!store) return json({ error: 'store_not_found' }, 404);
    await audit('update_store', { store_id: storeId, tenant_id: store.tenant_id, patch: { ...patch, updated_at: undefined } });
    return json({ status: 'ok', store });
  }

  // ---------------------------------------------------------------- members (owner accounts)
  if (action === 'list_members') {
    const tenantId = uuidOrNull(body.tenant_id);
    if (!tenantId) return json({ error: 'tenant_required' }, 400);
    const { data: members, error } = await admin
      .from('tenant_members').select('user_id, role, store_ids, created_at').eq('tenant_id', tenantId);
    if (error) return json({ error: 'member_list_failed' }, 500);
    const ids = (members ?? []).map((m) => String(m.user_id));
    const { data: profiles } = ids.length
      ? await admin.from('user_profiles').select('user_id, username, display_name').in('user_id', ids)
      : { data: [] as { user_id: string; username: string | null; display_name: string | null }[] };
    const enriched = [];
    for (const m of members ?? []) {
      const { data: u } = await admin.auth.admin.getUserById(String(m.user_id));
      const prof = (profiles ?? []).find((p) => p.user_id === m.user_id);
      enriched.push({
        user_id: m.user_id, role: m.role, store_ids: m.store_ids, created_at: m.created_at,
        email: u?.user?.email ?? null, username: prof?.username ?? null, display_name: prof?.display_name ?? null,
      });
    }
    return json({ members: enriched });
  }

  if (action === 'create_member') {
    // Mirrors provision-human, with platform authority: any role incl. owner, any tenant.
    const tenantId = uuidOrNull(body.tenant_id);
    const email = String(body.email ?? '').trim();
    const password = String(body.password ?? '');
    const username = body.username ? String(body.username).trim() : null;
    const role = String(body.role ?? 'owner');
    // empty array normalized to null — [] would lock the member out of store-scoped
    // surfaces (manage-devices treats [] as scoped-to-zero-stores)
    const storeIds = Array.isArray(body.store_ids) && body.store_ids.length > 0
      ? body.store_ids.map((s) => String(s).toLowerCase())
      : null;
    const displayName = body.display_name ? String(body.display_name) : (username || email);
    if (!tenantId) return json({ error: 'tenant_required' }, 400);
    if (!email || !password) return json({ error: 'email_password_required' }, 400);
    if (!Object.hasOwn(RANK, role)) return json({ error: 'bad_role' }, 400); // `in` would accept prototype keys
    const { data: tenant } = await admin.from('tenants').select('id').eq('id', tenantId).maybeSingle();
    if (!tenant) return json({ error: 'tenant_not_found' }, 404);
    if (storeIds && storeIds.length > 0) {
      if (!storeIds.every((s) => UUID_RE.test(s))) return json({ error: 'store_ids_not_uuids' }, 400);
      const { data: storeRows, error: sErr } = await admin
        .from('stores').select('id').eq('tenant_id', tenantId).in('id', storeIds);
      if (sErr) return json({ error: 'store_lookup_failed', detail: sErr.message }, 500);
      const known = new Set((storeRows ?? []).map((r) => String(r.id)));
      const missing = storeIds.filter((s) => !known.has(s));
      if (missing.length > 0) return json({ error: 'unknown_store_ids', detail: missing.join(',') }, 400);
    }
    const app_metadata = { tenant_id: tenantId, app_role: role, ...(storeIds ? { store_ids: storeIds } : {}) };
    let userId: string;
    const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata });
    if (cErr) {
      if (String(cErr.message || '').toLowerCase().includes('already')) {
        const { data: list } = await admin.auth.admin.listUsers();
        const existing = list?.users?.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
        if (!existing) return json({ error: 'user_exists_unresolvable' }, 409);
        userId = existing.id; // second membership for an existing person — do NOT reset their password
      } else {
        return json({ error: 'create_failed', detail: cErr.message }, 500);
      }
    } else {
      userId = created!.user.id;
    }
    // Disjointness (v1): a platform admin must never also become a tenant member —
    // pwa-login would route them to the tenant path and the hook strips the console
    // claim from any member's JWT, stranding them; and a member with platform table
    // access would blur the authority model. Same invariant as the bootstrap script.
    const { data: paRow, error: paRowErr } = await admin
      .from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle();
    if (paRowErr) return json({ error: 'authz_check_failed' }, 500);
    if (paRow) return json({ error: 'target_is_platform_admin' }, 409);
    if (username) {
      const { error: pErr } = await admin.from('user_profiles').upsert(
        { user_id: userId, username, display_name: displayName, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
      if (pErr) return json({ error: 'username_taken_or_failed', detail: pErr.message }, 409);
    }
    const { error: mErr } = await admin.from('tenant_members').upsert(
      { user_id: userId, tenant_id: tenantId, role, store_ids: storeIds },
      { onConflict: 'user_id,tenant_id' },
    );
    if (mErr) return json({ error: 'membership_failed', detail: mErr.message }, 500);
    // Role/scope EDITS of an existing member must bind to their live session too —
    // nothing forces a re-login, and GoTrue merge means claims never resync on their
    // own. If this tenant is the target's ACTIVE claim, restamp it now (explicit null
    // deletes store_ids under GoTrue's merge; the hook also re-syncs at refresh).
    const { data: tu } = await admin.auth.admin.getUserById(userId);
    const tmeta = (tu?.user?.app_metadata ?? {}) as Record<string, unknown>;
    if (tmeta.tenant_id === tenantId) {
      const { error: rsErr } = await admin.auth.admin.updateUserById(userId, {
        app_metadata: { tenant_id: tenantId, app_role: role, store_ids: storeIds, store_id: null },
      });
      if (rsErr) return json({ error: 'restamp_failed', detail: rsErr.message }, 500);
    }
    await audit('create_member', { tenant_id: tenantId, user_id: userId, email, role, store_ids: storeIds });
    return json({ status: 'ok', user_id: userId, tenant: tenantId, role, store_ids: storeIds }, 201);
  }

  if (action === 'remove_member') {
    // Mirrors revoke-human (same off-device cleanup), with platform authority (no rank
    // check). Still refuses to drop the LAST owner — full teardown is delete_tenant's job.
    const tenantId = uuidOrNull(body.tenant_id);
    const targetUser = uuidOrNull(body.user_id);
    if (!tenantId) return json({ error: 'tenant_required' }, 400);
    if (!targetUser) return json({ error: 'user_id_required' }, 400);
    const { data: revokeResult, error: dmErr } = await admin.rpc('revoke_tenant_member', { p_tenant: tenantId, p_user: targetUser });
    if (dmErr) return json({ error: 'membership_delete_failed', detail: dmErr.message }, 500);
    if (revokeResult === 'last_owner') return json({ error: 'cannot_remove_last_owner' }, 409);
    if (revokeResult === 'no_membership') return json({ status: 'ok', note: 'no_membership' });
    await admin.from('push_subscriptions').delete().eq('user_id', targetUser).eq('tenant_id', tenantId);
    await admin.from('owner_whatsapp_numbers').delete().eq('user_id', targetUser).eq('tenant_id', tenantId);
    await admin.from('owner_whatsapp_pairing_codes').delete().eq('user_id', targetUser).eq('tenant_id', tenantId).is('used_at', null);
    const { data: tu } = await admin.auth.admin.getUserById(targetUser);
    const targetMeta = (tu?.user?.app_metadata ?? {}) as Record<string, unknown>;
    if (targetMeta.tenant_id === tenantId) {
      const { data: remaining } = await admin.from('tenant_members')
        .select('tenant_id, role, store_ids').eq('user_id', targetUser).limit(1);
      const next = remaining?.[0] as { tenant_id: string; role: string; store_ids: string[] | null } | undefined;
      // GoTrue MERGES app_metadata key-by-key — absent keys survive; explicit nulls
      // delete. A spread-and-delete copy here would leave the old tenant authority in
      // the DB record, which every edge fn reads via getUser.
      const app_metadata = next
        ? { tenant_id: next.tenant_id, app_role: next.role, store_ids: next.store_ids?.length ? next.store_ids : null, store_id: null }
        : { tenant_id: null, app_role: null, store_ids: null, store_id: null };
      const { error: upErr } = await admin.auth.admin.updateUserById(targetUser, { app_metadata });
      if (upErr) return json({ error: 'restamp_failed', detail: upErr.message }, 500);
    }
    await audit('remove_member', { tenant_id: tenantId, user_id: targetUser });
    return json({ status: 'ok', user_id: targetUser, tenant: tenantId });
  }

  // ---------------------------------------------------------------- devices (ALL tills)
  if (action === 'list_devices') {
    const tenantId = body.tenant_id != null ? uuidOrNull(body.tenant_id) : null;
    if (body.tenant_id != null && !tenantId) return json({ error: 'bad_tenant_id' }, 400);
    let q = admin
      .from('devices')
      .select('id, tenant_id, store_id, label, status, training_mode, enrolled_at, last_seen_at, presence, presence_changed_at, created_at, device_pairing_codes(expires_at, used_at, created_at)')
      .order('created_at', { ascending: false });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const [{ data: devices, error: dErr }, { data: tenants, error: tErr }, { data: stores, error: sErr }] = await Promise.all([
      q,
      admin.from('tenants').select('id, name'),
      admin.from('stores').select('id, tenant_id, name'),
    ]);
    if (dErr || tErr || sErr) return json({ error: 'device_list_failed' }, 500);
    return json({ devices: devices ?? [], tenants: tenants ?? [], stores: stores ?? [] });
  }

  if (action === 'create_device') {
    const tenantId = uuidOrNull(body.tenant_id);
    const storeId = uuidOrNull(body.store_id);
    const label = String(body.label ?? '').trim();
    if (!tenantId) return json({ error: 'tenant_required' }, 400);
    if (!storeId) return json({ error: 'store_required' }, 400);
    if (!label || label.length > 80) return json({ error: 'invalid_device_label' }, 400);
    const { data: store, error: storeError } = await admin
      .from('stores').select('id').eq('tenant_id', tenantId).eq('id', storeId).eq('status', 'active').maybeSingle();
    if (storeError || !store) return json({ error: 'store_not_found' }, 404);
    const { data: device, error: deviceError } = await admin
      .from('devices')
      .insert({ tenant_id: tenantId, store_id: storeId, label, status: 'provisioned' })
      .select('id, tenant_id, store_id, label, status, enrolled_at, last_seen_at, presence, presence_changed_at, created_at')
      .single();
    if (deviceError || !device) return json({ error: 'device_create_failed' }, 500);
    const code = pairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MINUTES * 60_000).toISOString();
    const { error: codeError } = await admin.from('device_pairing_codes').insert({
      tenant_id: tenantId,
      store_id: storeId,
      device_id: device.id,
      code_hash: await sha256Hex(code),
      expires_at: expiresAt,
      created_by: caller.id,
    });
    if (codeError) {
      await admin.from('devices').delete().eq('id', device.id).eq('tenant_id', tenantId);
      return json({ error: 'pairing_code_create_failed' }, 500);
    }
    await audit('create_device', { tenant_id: tenantId, store_id: storeId, device_id: device.id, label });
    return json({ device, pairing_code: code, expires_at: expiresAt }, 201);
  }

  // remaining device actions operate on a device resolved platform-wide by id
  if (action === 'reissue_code' || action === 'revoke_device' || action === 'update_device') {
    const deviceId = uuidOrNull(body.device_id);
    if (!deviceId) return json({ error: 'device_required' }, 400);
    const { data: device, error: deviceError } = await admin
      .from('devices')
      .select('id, tenant_id, store_id, label, status, auth_user_id')
      .eq('id', deviceId).maybeSingle();
    if (deviceError || !device) return json({ error: 'device_not_found' }, 404);

    if (action === 'update_device') {
      const label = String(body.label ?? '').trim();
      if (!label || label.length > 80) return json({ error: 'invalid_device_label' }, 400);
      const { error } = await admin.from('devices').update({ label }).eq('id', device.id);
      if (error) return json({ error: 'device_update_failed' }, 500);
      await audit('update_device', { tenant_id: device.tenant_id, device_id: device.id, label, previous_label: device.label });
      const { auth_user_id: _omit, ...safeDevice } = device; // never send the till's auth user id to the browser
      return json({ status: 'ok', device: { ...safeDevice, label } });
    }

    if (action === 'reissue_code') {
      if (device.status !== 'provisioned') return json({ error: 'device_already_enrolled' }, 409);
      const now = new Date().toISOString();
      await admin.from('device_pairing_codes')
        .update({ used_at: now }).eq('tenant_id', device.tenant_id).eq('device_id', device.id).is('used_at', null);
      const code = pairingCode();
      const expiresAt = new Date(Date.now() + PAIRING_TTL_MINUTES * 60_000).toISOString();
      const { error: codeError } = await admin.from('device_pairing_codes').insert({
        tenant_id: device.tenant_id,
        store_id: device.store_id,
        device_id: device.id,
        code_hash: await sha256Hex(code),
        expires_at: expiresAt,
        created_by: caller.id,
      });
      if (codeError) return json({ error: 'pairing_code_create_failed' }, 500);
      await audit('reissue_code', { tenant_id: device.tenant_id, device_id: device.id });
      return json({ pairing_code: code, expires_at: expiresAt });
    }

    // revoke_device — mirrors manage-devices revoke (ban ≈ 100y, code void, tenant feed event)
    const now = new Date().toISOString();
    const { error: revokeError } = await admin
      .from('devices').update({ status: 'revoked' }).eq('id', device.id);
    if (revokeError) return json({ error: 'device_revoke_failed' }, 500);
    await admin.from('device_pairing_codes')
      .update({ used_at: now }).eq('tenant_id', device.tenant_id).eq('device_id', device.id).is('used_at', null);
    if (device.auth_user_id) {
      await admin.auth.admin.updateUserById(device.auth_user_id, { ban_duration: '876000h' });
    }
    await admin.from('notification_events').insert({
      tenant_id: device.tenant_id,
      store_id: device.store_id,
      device_id: device.id,
      event_type: 'DEVICE_REVOKED',
      severity: 'warning',
      payload: { label: device.label, actor: 'platform' },
    });
    await audit('revoke_device', { tenant_id: device.tenant_id, device_id: device.id, label: device.label });
    return json({ status: 'ok' });
  }

  // ---------------------------------------------------------------- audit trail
  if (action === 'audit_log') {
    const limitRaw = Number(body.limit ?? 100);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 500) : 100;
    const { data: rows, error } = await admin
      .from('platform_audit_log')
      .select('id, actor_user_id, action, target, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return json({ error: 'audit_list_failed' }, 500);
    const actorIds = [...new Set((rows ?? []).map((r) => String(r.actor_user_id)))];
    const actors: Record<string, string | null> = {};
    for (const id of actorIds) {
      const { data: u } = await admin.auth.admin.getUserById(id);
      actors[id] = u?.user?.email ?? null;
    }
    return json({ entries: rows ?? [], actors });
  }

  return json({ error: 'unsupported_action' }, 400);
});
