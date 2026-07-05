// pos-checkout — server-side fiscal issuance for the online-required v1 POS.
//
// Verified request contract (fiskaly SIGN PT, X-Api-Version 2026-06-01), from the
// TEST-API probe: auth POST /tokens {content:{type:"API_KEY",key,secret}} + headers
// X-Api-Version + X-Idempotency-Key(uuid v4); issuance = root POST /records twice
// (INTENTION -> TRANSACTION). See docs/PHASE-STATUS.md and docs/multi-tenant-plan.md §7.
//
// ⚠️ VERIFICATION STATUS:
//   - REQUEST contract: VERIFIED against test.api.fiskaly.com (schema-echo).
//   - RESPONSE contract (ATCUD/number-authority/hash/cert/token lifetime): ASSUMED
//     (best-effort from the SIGN IT guide + plan). Marked ⚠️ASSUMED inline.
//   - HAPPY PATH: NOT end-to-end tested — the provisioned TEST API_KEY `key`+`secret`
//     are not yet available (the .env values are a subject *name* + secret and return
//     invalid_grant). Reachable error paths (missing config, bad session) ARE testable.
//   Do NOT rely on this for real issuance until one live POST /records is confirmed.
//
// Tenant/store/device are derived from the device-session JWT — never the payload.
// Idempotency via fiscal_issue_attempts(checkout_id) so fiskaly<->Postgres can't diverge.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const FISKALY_HOST: Record<string, string> = {
  test: 'https://test.api.fiskaly.com',
  live: 'https://live.api.fiskaly.com',
};
const API_VERSION = '2026-06-01';

function decodeClaims(jwt: string): Record<string, unknown> {
  try { return JSON.parse(atob(jwt.split('.')[1])); } catch { return {}; }
}
function uuidV4(): string { return crypto.randomUUID(); }

// Deterministic UUID-v4-*format* string from a seed (SHA-256 -> set version/variant
// nibbles). Fiskaly only regex-checks the v4 shape, so this passes while giving us a
// STABLE X-Idempotency-Key per (checkout_id, phase): a retry of the same checkout
// re-sends the same key and fiskaly returns the original record instead of issuing
// a second tax document. INTENTION and TRANSACTION use different salts (two records).
async function derivedUuidV4(seed: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed)));
  const b = Array.from(digest.slice(0, 16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  const h = b.map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !serviceKey) return json({ error: 'server_misconfigured' }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // ---- session -> tenant/store/device (from the verified device JWT) ----
  const authz = req.headers.get('Authorization') ?? '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  const claims = decodeClaims(token);
  const meta = (claims.app_metadata ?? {}) as Record<string, string>;
  const tenantId = meta.tenant_id, storeId = meta.store_id, deviceId = meta.device_id;
  if (!tenantId || !deviceId) return json({ error: 'no_tenant_context' }, 401);

  // device must be enrolled (covers the <=JWT-lifetime revocation window)
  const { data: device } = await admin.from('devices').select('id,status,training_mode').eq('id', deviceId).eq('tenant_id', tenantId).maybeSingle();
  if (!device || device.status !== 'enrolled') return json({ error: 'device_not_enrolled' }, 403);

  let body: {
    checkout_id?: string; transaction_id?: string; doc_type?: string;
    customer?: { nif?: string; name?: string; address?: string; code?: string };
    entries?: unknown[]; payments?: unknown[]; breakdown?: unknown[]; totals?: unknown;
    cashier_label?: string;
  };
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const checkoutId = (body.checkout_id ?? '').trim();
  // checkout_id MUST be a uuid v4 — it becomes the fiskaly X-Idempotency-Key (regex-enforced).
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(checkoutId)) {
    return json({ error: 'invalid_checkout_id' }, 400);
  }

  // ---- idempotency: never issue twice for one checkout_id ----
  const { data: prior } = await admin.from('fiscal_issue_attempts').select('*').eq('checkout_id', checkoutId).maybeSingle();
  if (prior?.status === 'issued' && prior.fiscal_document_id) {
    const { data: doc } = await admin.from('fiscal_documents').select('*').eq('id', prior.fiscal_document_id).maybeSingle();
    return json({ status: 'already_issued', fiscal_document: doc });
  }
  if (!prior) {
    await admin.from('fiscal_issue_attempts').insert({ checkout_id: checkoutId, tenant_id: tenantId, device_id: deviceId, status: 'pending' });
  }

  const fail = async (reason: string, status = 502, detail?: unknown) => {
    await admin.from('fiscal_issue_attempts').update({ status: 'failed', error: reason, updated_at: new Date().toISOString() }).eq('checkout_id', checkoutId);
    return json({ error: reason, detail }, status);
  };

  // ---- resolve per-tenant fiscal config + secret (environment) ----
  const environment = device.training_mode ? 'test' : 'live'; // training tills always TEST tree (§7.5)
  const { data: cfg } = await admin.from('tenant_fiscal_config').select('*').eq('tenant_id', tenantId).eq('environment', environment).maybeSingle();
  const { data: secret } = await admin.from('tenant_fiscal_secrets').select('fiskaly_api_key,fiskaly_api_secret').eq('tenant_id', tenantId).eq('environment', environment).maybeSingle();
  if (!cfg || cfg.issuer !== 'fiskaly') return await fail('fiscal_config_missing', 409);
  if (!secret?.fiskaly_api_key || !secret?.fiskaly_api_secret) return await fail('fiscal_secret_missing', 409);

  // ---- resolve series + document.number (reuse on a crashed 'pending' retry) ----
  const docType = (body.doc_type ?? 'FS').toUpperCase();
  const year = new Date().getUTCFullYear();
  let seriesName: string;
  let documentNumber: string;
  if (prior?.status === 'pending' && prior.document_number && prior.series) {
    // resume a crashed attempt with the SAME number — fiskaly (deterministic key) dedups.
    seriesName = prior.series;
    documentNumber = prior.document_number;
  } else {
    // Series naming default: <docType>-<env>-<year>; one series per (tenant, env, doc_type) for v1.
    seriesName = `${docType}-${environment === 'test' ? 'T' : 'L'}01-${year}`;
    await admin.from('fiscal_series').upsert(
      { tenant_id: tenantId, environment, doc_type: docType, series: seriesName, store_id: storeId, device_id: deviceId, year },
      { onConflict: 'tenant_id,environment,doc_type,series', ignoreDuplicates: true },
    );
    const { data: bumped, error: bumpErr } = await admin.rpc('allocate_fiscal_number', {
      p_tenant: tenantId, p_env: environment, p_doc_type: docType, p_series: seriesName,
    });
    if (bumpErr || !bumped) return await fail('number_allocation_failed', 500, bumpErr?.message);
    documentNumber = `${seriesName}/${bumped}`;
    // persist the reservation so a retry reuses it rather than burning a fresh number
    await admin.from('fiscal_issue_attempts').update({ document_number: documentNumber, series: seriesName }).eq('checkout_id', checkoutId);
  }

  // ---- fiskaly: token -> INTENTION -> TRANSACTION ----
  const host = FISKALY_HOST[environment];
  const idem = () => ({ 'X-Api-Version': API_VERSION, 'X-Idempotency-Key': uuidV4(), 'Content-Type': 'application/json' });
  let fiskalyToken = '';
  try {
    const tRes = await fetch(`${host}/tokens`, { method: 'POST', headers: idem(),
      body: JSON.stringify({ content: { type: 'API_KEY', key: secret.fiskaly_api_key, secret: secret.fiskaly_api_secret } }) });
    if (!tRes.ok) return await fail('fiskaly_auth_failed', 502, await tRes.text());
    const tBody = await tRes.json();
    // VERIFIED against test.api.fiskaly.com: token is content.authentication.bearer
    // (a ~24h RS256 JWT; content.authentication.expires_at). Responses wrap in `content`.
    fiskalyToken = tBody?.content?.authentication?.bearer;
    if (!fiskalyToken) return await fail('fiskaly_auth_no_token', 502, tBody);
  } catch (e) {
    return await fail('fiskaly_unreachable', 503, String(e)); // online-required: client blocks, nothing queued
  }
  // deterministic, phase-distinct idempotency keys derived from checkout_id (retry-safe)
  const intentionKey = await derivedUuidV4(`${checkoutId}:intention`);
  const transactionKey = await derivedUuidV4(`${checkoutId}:transaction`);
  const recHeaders = (key: string) => ({ 'X-Api-Version': API_VERSION, 'X-Idempotency-Key': key, 'Content-Type': 'application/json', Authorization: `Bearer ${fiskalyToken}` });

  const systemId = cfg.fiskaly_taxpayer_id; // ⚠️ NOTE: this must be the System (till) id; provisioning must store it. Using a config field as placeholder.
  const training = !!device.training_mode;

  try {
    // 1) INTENTION
    const iRes = await fetch(`${host}/records`, { method: 'POST', headers: recHeaders(intentionKey),
      body: JSON.stringify({ content: { type: 'INTENTION', system: { id: systemId },
        operation: { type: 'TRANSACTION', details: { creators: [{ type: 'PERSON', label: (body.cashier_label ?? 'cashier').slice(0, 64) }], training, properties: {} } } } }) });
    if (!iRes.ok) return await fail('fiskaly_intention_failed', 502, await iRes.text());
    const intention = await iRes.json();
    const intentionId = intention?.id ?? intention?.content?.id; // ⚠️ASSUMED response shape

    // 2) TRANSACTION — RECEIPT (FS/FR) unless a validated NIF forces INVOICE (FT)
    const wantsInvoice = docType === 'FT' || !!body.customer?.nif;
    const operation = wantsInvoice
      ? { type: 'INVOICE', document: { number: documentNumber, series: seriesName },
          recipients: [{ type: body.customer?.nif ? 'BUSINESS' : 'CONSUMER',
            ...(body.customer?.nif ? { name: body.customer?.name ?? 'Cliente', address: body.customer?.address ?? 'PT',
              identification: { type: 'VAT', number: body.customer.nif } } : {}) }],
          entries: body.entries ?? [], payments: body.payments ?? [], breakdown: body.breakdown ?? [], totals: body.totals ?? { vat: [] } }
      : { type: 'RECEIPT', document: { number: documentNumber, series: seriesName, simplified_invoice: docType === 'FS' },
          ...(body.customer?.code || body.customer?.nif ? { customer: { type: 'EXTERNAL', code: (body.customer?.code ?? body.customer?.nif ?? '').slice(0, 128) } } : {}),
          entries: body.entries ?? [], payments: body.payments ?? [], breakdown: body.breakdown ?? [], totals: body.totals ?? { vat: [] } };

    const trRes = await fetch(`${host}/records`, { method: 'POST', headers: recHeaders(transactionKey),
      body: JSON.stringify({ content: { type: 'TRANSACTION', record: { id: intentionId }, operation } }) });
    if (!trRes.ok) return await fail('fiskaly_transaction_failed', 502, await trRes.text());
    const tx = await trRes.json();

    // ---- persist the signed document (⚠️ASSUMED response field names) ----
    const c = tx?.content ?? tx;
    const { data: doc, error: docErr } = await admin.from('fiscal_documents').insert({
      tenant_id: tenantId, store_id: storeId, device_id: deviceId, transaction_id: body.transaction_id ?? null,
      environment, is_training: training, doc_type: docType, series: seriesName,
      number: c?.document?.number ?? documentNumber,        // fiskaly's returned number is authoritative if present
      atcud: c?.atcud ?? c?.compliance?.atcud ?? null,
      fiskaly_record_id: tx?.id ?? c?.id ?? null,
      hash: c?.hash ?? c?.compliance?.hash ?? null,
      qr_data: c?.qr_code ?? c?.compliance?.qr_code ?? null,
      software_certificate: c?.compliance?.software_certificate ?? null,
      signed_payload: tx, status: 'issued',
    }).select().single();
    if (docErr) return await fail('fiscal_persist_failed', 500, docErr.message);

    await admin.from('fiscal_issue_attempts').update({ status: 'issued', fiskaly_record_id: doc.fiskaly_record_id, fiscal_document_id: doc.id, updated_at: new Date().toISOString() }).eq('checkout_id', checkoutId);
    return json({ status: 'issued', fiscal_document: doc });
  } catch (e) {
    return await fail('fiskaly_unreachable', 503, String(e));
  }
});
