// pair-device — enroll a pre-provisioned till from a one-time pairing code.
//
// A fresh till has NO session (verify_jwt=false); the high-entropy pairing code
// IS the credential. Flow (plan §6.2): platform/admin pre-creates a `devices`
// row (status='provisioned') + a `device_pairing_codes` row (only the sha256
// code_hash stored). The till POSTs {code, device_label?, fingerprint?}; this
// function (service role) verifies hash+TTL+single-use+attempt-cap, creates/
// updates the device auth user with server-controlled app_metadata claims,
// mints a session, marks the device 'enrolled', and returns the session.
//
// Never trusts client-supplied tenant/store/device — all derived from the
// pre-provisioned device row keyed by the code.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const MAX_ATTEMPTS = 8;

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!url || !serviceKey || !anonKey) return json({ error: 'server_misconfigured' }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let body: { code?: string; device_label?: string; fingerprint?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const code = (body.code ?? '').trim();
  if (!code) return json({ error: 'missing_code' }, 400);

  const codeHash = await sha256Hex(code);

  const { data: pc, error: pcErr } = await admin
    .from('device_pairing_codes')
    .select('id, tenant_id, store_id, device_id, expires_at, used_at, attempt_count')
    .eq('code_hash', codeHash)
    .maybeSingle();
  if (pcErr) return json({ error: 'lookup_failed' }, 500);
  // Unknown code: nothing to rate-limit against; do not leak which codes exist.
  if (!pc) return json({ error: 'invalid_code' }, 401);

  // Rate-limit: bump attempt_count on every presentation of a known code.
  await admin.from('device_pairing_codes')
    .update({ attempt_count: (pc.attempt_count ?? 0) + 1 }).eq('id', pc.id);

  const fail = async (reason: string, status = 401) => {
    await admin.from('notification_events').insert({
      tenant_id: pc.tenant_id, store_id: pc.store_id, device_id: pc.device_id,
      event_type: 'PAIRING_FAILED', severity: 'warning', payload: { reason },
    });
    return json({ error: reason }, status);
  };

  if (pc.used_at) return await fail('code_already_used');
  if (new Date(pc.expires_at).getTime() < Date.now()) return await fail('code_expired');
  if ((pc.attempt_count ?? 0) >= MAX_ATTEMPTS) return await fail('too_many_attempts', 429);
  if (!pc.device_id) return await fail('code_not_linked_to_device', 400);

  const { data: device, error: dErr } = await admin
    .from('devices').select('id, tenant_id, store_id, status, auth_user_id, label')
    .eq('id', pc.device_id).maybeSingle();
  if (dErr || !device) return await fail('device_not_found', 404);
  if (device.status === 'revoked') return await fail('device_revoked', 403);

  const claims = {
    tenant_id: device.tenant_id, store_id: device.store_id,
    device_id: device.id, app_role: 'device',
  };
  const email = `device-${device.id}@devices.internal`;
  const password = `${crypto.randomUUID()}${crypto.randomUUID()}`;

  // Create (first pairing) or update (re-pairing) the device auth user.
  let userId: string | null = device.auth_user_id ?? null;
  if (userId) {
    const { error: uErr } = await admin.auth.admin.updateUserById(userId, { password, app_metadata: claims });
    if (uErr) return await fail('user_update_failed', 500);
  } else {
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, app_metadata: claims,
    });
    if (cErr || !created?.user) return await fail('user_create_failed', 500);
    userId = created.user.id;
  }

  // Mint a session with the fresh password, then discard the password.
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: sess, error: sErr } = await anon.auth.signInWithPassword({ email, password });
  if (sErr || !sess?.session) return await fail('session_mint_failed', 500);

  const nowIso = new Date().toISOString();
  const label = (body.device_label ?? '').trim() || device.label;
  await admin.from('devices').update({
    status: 'enrolled', auth_user_id: userId, enrolled_at: nowIso, last_seen_at: nowIso, label,
  }).eq('id', device.id);
  await admin.from('device_pairing_codes').update({ used_at: nowIso }).eq('id', pc.id);
  await admin.from('notification_events').insert({
    tenant_id: device.tenant_id, store_id: device.store_id, device_id: device.id,
    event_type: 'DEVICE_ENROLLED', severity: 'info', payload: { label, fingerprint: body.fingerprint ?? null },
  });

  return json({
    access_token: sess.session.access_token,
    refresh_token: sess.session.refresh_token,
    expires_at: sess.session.expires_at,
    tenant_id: device.tenant_id, store_id: device.store_id, device_id: device.id,
  });
});
