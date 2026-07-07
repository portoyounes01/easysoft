// manage-devices — tenant-scoped till enrollment administration.
//
// A device JWT proves which tenant is calling, but employee login is only an
// attribution layer under that JWT. Device callers therefore re-enter an
// administrator PIN; this function verifies it through employee_pin_login
// before using the service role. Future human owner/admin JWTs are accepted
// directly. The service-role key never reaches the renderer.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PAIRING_TTL_MINUTES = 15;

interface RequestBody {
  action?: 'list' | 'create' | 'reissue' | 'revoke';
  employee_number?: string;
  secret?: string;
  device_id?: string;
  store_id?: string;
  label?: string;
}

interface EmployeeLoginRow {
  employee_id: string | null;
  employee_number: string | null;
  name: string | null;
  role: string | null;
  success: boolean;
  error: string | null;
}

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!url || !serviceKey || !anonKey) return json({ error: 'server_misconfigured' }, 500);

  const authorization = req.headers.get('Authorization') ?? '';
  const accessToken = authorization.replace(/^Bearer\s+/i, '');
  if (!accessToken) return json({ error: 'missing_session' }, 401);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  const user = userData.user;
  if (userError || !user) return json({ error: 'invalid_session' }, 401);

  const tenantId = typeof user.app_metadata?.tenant_id === 'string'
    ? user.app_metadata.tenant_id
    : '';
  const appRole = typeof user.app_metadata?.app_role === 'string'
    ? user.app_metadata.app_role
    : '';
  if (!tenantId) return json({ error: 'no_tenant_context' }, 403);

  let actorEmployeeId: string | null = null;
  let actorLabel = user.email ?? user.id;

  if (appRole === 'device') {
    const employeeNumber = body.employee_number?.trim() ?? '';
    const secret = body.secret ?? '';
    if (!employeeNumber || !secret) return json({ error: 'admin_reauth_required' }, 401);

    const caller = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: loginData, error: loginError } = await caller.rpc('employee_pin_login', {
      p_employee_number: employeeNumber,
      p_secret: secret,
    });
    const login = (loginData as EmployeeLoginRow[] | null)?.[0];
    if (loginError || !login?.success) {
      return json({ error: login?.error === 'locked' ? 'admin_locked' : 'invalid_admin_credentials' }, 401);
    }
    if (login.role !== 'admin') return json({ error: 'admin_required' }, 403);
    actorEmployeeId = login.employee_id;
    actorLabel = login.name ?? login.employee_number ?? actorLabel;
  } else if (!['owner', 'admin'].includes(appRole)) {
    return json({ error: 'admin_required' }, 403);
  }

  const action = body.action;
  if (!action) return json({ error: 'missing_action' }, 400);

  if (action === 'list') {
    const [{ data: stores, error: storesError }, { data: devices, error: devicesError }] = await Promise.all([
      admin
        .from('stores')
        .select('id, name, status')
        .eq('tenant_id', tenantId)
        .order('name'),
      admin
        .from('devices')
        .select('id, store_id, label, status, enrolled_at, last_seen_at, presence, presence_changed_at, created_at, device_pairing_codes(expires_at, used_at, created_at)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false }),
    ]);
    if (storesError || devicesError) return json({ error: 'device_list_failed' }, 500);
    return json({ stores: stores ?? [], devices: devices ?? [] });
  }

  if (action === 'create') {
    const label = body.label?.trim() ?? '';
    const storeId = body.store_id?.trim() ?? '';
    if (!label || label.length > 80) return json({ error: 'invalid_device_label' }, 400);
    if (!storeId) return json({ error: 'store_required' }, 400);

    const { data: store, error: storeError } = await admin
      .from('stores')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', storeId)
      .eq('status', 'active')
      .maybeSingle();
    if (storeError || !store) return json({ error: 'store_not_found' }, 404);

    const { data: device, error: deviceError } = await admin
      .from('devices')
      .insert({ tenant_id: tenantId, store_id: storeId, label, status: 'provisioned' })
      .select('id, store_id, label, status, enrolled_at, last_seen_at, presence, presence_changed_at, created_at')
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
      created_by: user.id,
    });
    if (codeError) {
      await admin.from('devices').delete().eq('id', device.id).eq('tenant_id', tenantId);
      return json({ error: 'pairing_code_create_failed' }, 500);
    }

    return json({ device, pairing_code: code, expires_at: expiresAt }, 201);
  }

  const deviceId = body.device_id?.trim() ?? '';
  if (!deviceId) return json({ error: 'device_required' }, 400);

  const { data: device, error: deviceError } = await admin
    .from('devices')
    .select('id, tenant_id, store_id, label, status, auth_user_id')
    .eq('tenant_id', tenantId)
    .eq('id', deviceId)
    .maybeSingle();
  if (deviceError || !device) return json({ error: 'device_not_found' }, 404);

  if (action === 'reissue') {
    if (device.status !== 'provisioned') return json({ error: 'device_already_enrolled' }, 409);
    const now = new Date().toISOString();
    await admin
      .from('device_pairing_codes')
      .update({ used_at: now })
      .eq('tenant_id', tenantId)
      .eq('device_id', device.id)
      .is('used_at', null);

    const code = pairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MINUTES * 60_000).toISOString();
    const { error: codeError } = await admin.from('device_pairing_codes').insert({
      tenant_id: tenantId,
      store_id: device.store_id,
      device_id: device.id,
      code_hash: await sha256Hex(code),
      expires_at: expiresAt,
      created_by: user.id,
    });
    if (codeError) return json({ error: 'pairing_code_create_failed' }, 500);
    return json({ pairing_code: code, expires_at: expiresAt });
  }

  if (action === 'revoke') {
    const now = new Date().toISOString();
    const { error: revokeError } = await admin
      .from('devices')
      .update({ status: 'revoked' })
      .eq('tenant_id', tenantId)
      .eq('id', device.id);
    if (revokeError) return json({ error: 'device_revoke_failed' }, 500);

    await admin
      .from('device_pairing_codes')
      .update({ used_at: now })
      .eq('tenant_id', tenantId)
      .eq('device_id', device.id)
      .is('used_at', null);
    if (device.auth_user_id) {
      await admin.auth.admin.updateUserById(device.auth_user_id, { ban_duration: '876000h' });
    }
    await admin.from('notification_events').insert({
      tenant_id: tenantId,
      store_id: device.store_id,
      device_id: device.id,
      event_type: 'DEVICE_REVOKED',
      severity: 'warning',
      actor_employee_id: actorEmployeeId,
      payload: { label: device.label, actor: actorLabel },
    });
    return json({ success: true });
  }

  return json({ error: 'unsupported_action' }, 400);
});
