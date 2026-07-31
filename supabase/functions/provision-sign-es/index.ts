// provision-sign-es — ONE-CALL Spain/SIGN ES onboarding for a tenant (ES-3).
//
// Built for non-technical operators: a technician or the owner fills a form in the PWA and this
// function does the ENTIRE chain server-side — fiskaly Management API (create managed org + mint
// its API key) -> SIGN ES (taxpayer -> signer -> one client per till) -> persist everything into
// tenant_fiscal_config / tenant_fiscal_secrets / devices. No CLI, no SQL, no dashboard.
// (scripts/es-sign-onboard.mjs remains as a dev/debug tool only.)
//
// AuthZ mirrors provision-human: verify_jwt=true + in-body caller must be a HUMAN owner|admin of
// the tenant (from the VERIFIED JWT; tenant is FORCED to the caller's — body tenant is ignored).
//
// Idempotent: re-runs reuse the stored managed org/signer (tenant_fiscal_config) and only create
// what's missing (e.g. clients for newly added tills). Taxpayer PUT 409 (already exists) is OK.
// The merchant NIF is IMMUTABLE once resources are enabled (ES-0 finding #7) — changing it
// requires a fresh managed org, so the form must get it right.
//
// Root Management-API credentials come from edge secrets (set once by the platform operator):
//   FISKALY_ROOT_API_KEY_TEST / FISKALY_ROOT_API_SECRET_TEST  (+ _LIVE when sales-enabled)
//   FISKALY_ROOT_ORG_ID — the managing organization id (group1).
// The per-merchant managed-org key is minted HERE and stored in tenant_fiscal_secrets; it never
// leaves the server.
//
// NOT automated (legal step): the social-collaboration agreement needs the legal representative's
// PAdES signature (POST /taxpayer/agreement -> sign -> PUT upload). Returned as `next_steps`.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const MGMT = 'https://dashboard.fiskaly.com/api/v0';
const SIGN_ES: Record<string, string> = { test: 'https://test.es.sign.fiskaly.com/api/v1', live: 'https://live.es.sign.fiskaly.com/api/v1' };
const TERRITORIES = new Set(['ARABA', 'BIZKAIA', 'GIPUZKOA', 'NAVARRE', 'CANARY_ISLANDS', 'CEUTA', 'MELILLA', 'SPAIN_OTHER']);
const ES_NIF = /^[A-Z0-9]{9}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !serviceKey) return json({ error: 'server_misconfigured' }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // ---- caller: HUMAN owner|admin; tenant FORCED from the verified JWT ----
  const authz = req.headers.get('Authorization') ?? '';
  const jwt = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  const { data: userData } = await admin.auth.getUser(jwt);
  const caller = userData?.user;
  if (!caller) return json({ error: 'unauthorized' }, 401);
  const cmeta = (caller.app_metadata ?? {}) as { tenant_id?: string; app_role?: string };
  const tenantId = cmeta.tenant_id;
  if (!tenantId || !(cmeta.app_role === 'owner' || cmeta.app_role === 'admin')) return json({ error: 'forbidden' }, 403);

  let body: {
    environment?: string; legal_name?: string; nif?: string; territory?: string;
    address_line1?: string; zip?: string; town?: string; email?: string;
    device_ids?: string[];
  };
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const environment = (body.environment ?? 'test').toLowerCase();
  if (!['test', 'live'].includes(environment)) return json({ error: 'invalid_environment' }, 400);
  const legalName = (body.legal_name ?? '').trim();
  const nif = (body.nif ?? '').trim().toUpperCase();
  const territory = (body.territory ?? 'SPAIN_OTHER').toUpperCase();
  if (!legalName) return json({ error: 'legal_name_required' }, 400);
  if (!ES_NIF.test(nif)) return json({ error: 'invalid_nif', detail: 'Spanish NIF/CIF/NIE: 9 alphanumeric chars' }, 400);
  if (!TERRITORIES.has(territory)) return json({ error: 'invalid_territory' }, 400);

  // root creds (platform-level, per environment)
  const envSuffix = environment.toUpperCase();
  const rootKey = Deno.env.get(`FISKALY_ROOT_API_KEY_${envSuffix}`) ?? '';
  const rootSecret = Deno.env.get(`FISKALY_ROOT_API_SECRET_${envSuffix}`) ?? '';
  const rootOrgId = Deno.env.get('FISKALY_ROOT_ORG_ID') ?? '';
  if (!rootKey || !rootSecret || !rootOrgId) return json({ error: 'platform_not_configured', detail: `FISKALY_ROOT_API_*_${envSuffix} / FISKALY_ROOT_ORG_ID edge secrets missing` }, 503);

  // devices to provision: explicit list or every enrolled till of the tenant
  let deviceIds = Array.isArray(body.device_ids) ? body.device_ids.map(String) : [];
  const clientCol = environment === 'test' ? 'sign_es_client_id_test' : 'sign_es_client_id_live';
  const { data: devices } = await admin.from('devices')
    .select(`id, status, ${clientCol}`)
    .eq('tenant_id', tenantId).eq('status', 'enrolled');
  const enrolled = (devices ?? []) as Array<Record<string, string>>;
  if (!deviceIds.length) deviceIds = enrolled.map((d) => d.id);
  const unknown = deviceIds.filter((id) => !enrolled.some((d) => d.id === id));
  if (unknown.length) return json({ error: 'unknown_devices', detail: unknown }, 400);

  // ---- reuse-or-create: existing config wins (idempotent re-run) ----
  const { data: cfg } = await admin.from('tenant_fiscal_config')
    .select('id, sign_es_org_id, sign_es_signer_id').eq('tenant_id', tenantId).eq('environment', environment).maybeSingle();
  const { data: sec } = await admin.from('tenant_fiscal_secrets')
    .select('tenant_id, fiskaly_api_key, fiskaly_api_secret').eq('tenant_id', tenantId).eq('environment', environment).maybeSingle();

  let orgId = cfg?.sign_es_org_id as string | null;
  let merchantKey = sec?.fiskaly_api_key as string | null;
  let merchantSecret = sec?.fiskaly_api_secret as string | null;
  const created: string[] = [];

  try {
    if (!orgId || !merchantKey || !merchantSecret) {
      // 1) Management API: managed org + api key
      const mAuth = await fetch(`${MGMT}/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: rootKey, api_secret: rootSecret }) });
      if (!mAuth.ok) return json({ error: 'mgmt_auth_failed', detail: await mAuth.text() }, 502);
      const mTok = (await mAuth.json())?.access_token;
      if (!mTok) return json({ error: 'mgmt_auth_no_token' }, 502);
      const mH = { Authorization: `Bearer ${mTok}`, 'Content-Type': 'application/json' };

      if (!orgId) {
        const oRes = await fetch(`${MGMT}/organizations`, { method: 'POST', headers: mH, body: JSON.stringify({
          name: `${legalName} (${envSuffix})`.slice(0, 100),
          address_line1: body.address_line1 ?? '-', zip: body.zip ?? '-', town: body.town ?? '-',
          country_code: 'ESP', managed_by_organization_id: rootOrgId,
        }) });
        if (!oRes.ok) return json({ error: 'org_create_failed', detail: await oRes.text() }, 502);
        orgId = (await oRes.json())?._id;
        if (!orgId) return json({ error: 'org_create_no_id' }, 502);
        created.push(`managed_org:${orgId}`);
      }
      if (!merchantKey || !merchantSecret) {
        const kRes = await fetch(`${MGMT}/organizations/${orgId}/api-keys`, { method: 'POST', headers: mH, body: JSON.stringify({ name: `pos-${environment}`, status: 'enabled' }) });
        if (!kRes.ok) return json({ error: 'key_create_failed', detail: await kRes.text() }, 502);
        const k = await kRes.json();
        merchantKey = k?.key; merchantSecret = k?.secret;
        if (!merchantKey || !merchantSecret) return json({ error: 'key_create_no_secret' }, 502);
        created.push('api_key');
      }
    }

    // 2) SIGN ES: auth as the merchant org
    const esAuth = await fetch(`${SIGN_ES[environment]}/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { api_key: merchantKey, api_secret: merchantSecret } }) });
    if (!esAuth.ok) return json({ error: 'signes_auth_failed', detail: await esAuth.text() }, 502);
    const esTok = (await esAuth.json())?.content?.access_token?.bearer;
    if (!esTok) return json({ error: 'signes_auth_no_token' }, 502);
    const esH = { Authorization: `Bearer ${esTok}`, 'Content-Type': 'application/json' };

    // 3) taxpayer (409 = already exists — fine; NIF immutable once resources enabled)
    const tpRes = await fetch(`${SIGN_ES[environment]}/taxpayer`, { method: 'PUT', headers: esH, body: JSON.stringify({
      content: { issuer: { legal_name: legalName, tax_number: nif }, territory,
        ...(body.address_line1 ? { address: { address_line: body.address_line1, postal_code: body.zip ?? '-', town: body.town ?? '-' } } : {}),
        ...(body.email ? { email: body.email } : {}) },
    }) });
    if (!tpRes.ok && tpRes.status !== 409) return json({ error: 'taxpayer_failed', detail: await tpRes.text() }, 502);
    if (tpRes.ok) created.push('taxpayer');

    // 4) signer (shared per tenant+env; empty content => fiskaly-managed certificate)
    let signerId = cfg?.sign_es_signer_id as string | null;
    if (!signerId) {
      signerId = crypto.randomUUID();
      const sRes = await fetch(`${SIGN_ES[environment]}/signers/${signerId}`, { method: 'PUT', headers: esH, body: JSON.stringify({}) });
      if (!sRes.ok) return json({ error: 'signer_failed', detail: await sRes.text() }, 502);
      created.push(`signer:${signerId}`);
    }

    // 5) one client per till (only for tills that don't have one yet)
    const deviceClient: Record<string, string> = {};
    for (const dev of deviceIds) {
      const row = enrolled.find((d) => d.id === dev)!;
      if (row[clientCol]) { deviceClient[dev] = row[clientCol]; continue; }
      const clientId = crypto.randomUUID();
      const cRes = await fetch(`${SIGN_ES[environment]}/clients/${clientId}`, { method: 'PUT', headers: esH, body: JSON.stringify({ content: { signer_id: signerId } }) });
      if (!cRes.ok) return json({ error: 'client_failed', detail: await cRes.text() }, 502);
      deviceClient[dev] = clientId;
      created.push(`client:${dev}`);
    }

    // 6) persist (service role): config + secrets + device clients
    const { error: cfgErr } = await admin.from('tenant_fiscal_config').upsert({
      tenant_id: tenantId, environment, issuer: 'sign_es', sign_es_org_id: orgId, sign_es_signer_id: signerId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,environment' });
    if (cfgErr) return json({ error: 'persist_config_failed', detail: cfgErr.message }, 500);
    const { error: secErr } = await admin.from('tenant_fiscal_secrets').upsert({
      tenant_id: tenantId, environment, fiskaly_api_key: merchantKey, fiskaly_api_secret: merchantSecret,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,environment' });
    if (secErr) return json({ error: 'persist_secrets_failed', detail: secErr.message }, 500);
    // Provisioning Spain implies the tenant operates in Spain — stamp it so every
    // country-aware surface (e.g. the assistant's tax/legal guardrail) engages even
    // when the tenant was created with a placeholder NIF that kept the PT default.
    // Best-effort: the tenants_nif_format CHECK can reject the stamp for a tenant
    // whose stored NIF is PT-shaped (digits-only); fiscal provisioning must not
    // fail on that — the NIF/country pair gets corrected with the real tax id.
    const { error: countryErr } = await admin.from('tenants').update({ country: 'ES' }).eq('id', tenantId).neq('country', 'ES');
    if (countryErr) console.error('tenants.country stamp failed (non-fatal)', countryErr.message);
    for (const [dev, cid] of Object.entries(deviceClient)) {
      const { error: dErr } = await admin.from('devices').update({ [clientCol]: cid }).eq('id', dev).eq('tenant_id', tenantId);
      if (dErr) return json({ error: 'persist_device_failed', detail: `${dev}: ${dErr.message}` }, 500);
    }

    return json({
      status: 'ok', environment, org_id: orgId, signer_id: signerId, devices: deviceClient, created,
      next_steps: [
        'Social-collaboration agreement: generate (POST /taxpayer/agreement), have the legal representative sign the PAdES PDF, upload it — required for AEAT submission in Verifactu territories.',
        ...(environment === 'live' ? ['LIVE issuance additionally requires fiskaly sales enablement for this organization.'] : []),
      ],
    });
  } catch (e) {
    return json({ error: 'provisioning_failed', detail: String(e) }, 502);
  }
});
