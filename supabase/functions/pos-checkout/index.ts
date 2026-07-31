// pos-checkout — server-side fiscal issuance for the online-required v1 POS.
//
// Contract: fiskaly SIGN PT — the Portugal service of fiskaly's UNIFIED API
// (test/live.api.fiskaly.com, X-Api-Version 2026-06-01). "SIGN PT" is the real,
// current product name (launched 2026-05-21); it shares the unified hosts and is NOT
// a specialized per-country API like SIGN ES/DE/AT. Auth POST /tokens
// {content:{type:"API_KEY",key,secret}} -> content.authentication.bearer; headers
// X-Api-Version + X-Idempotency-Key (uuid, required on every POST incl. /tokens);
// issuance = root POST /records twice (INTENTION -> TRANSACTION). Document numbers
// and series are CLIENT-generated (DocumentIdentifier ^[0-9A-Z_/\-\.]{1,20}$).
// See docs/fiskaly-pt-contract-capture.md and docs/multi-tenant-plan.md §7.
//
// ⚠️ VERIFICATION STATUS (2026-07-19 pass, REGISTER B16):
//   - REQUEST + RESPONSE contract: VERIFIED at schema level against the official
//     SIGN PT OpenAPI 2026-06-01 (workspace.fiskaly.com) + live schema-echo probes.
//     Response: RecordResource{content: {id, state, mode, journal{signature},
//     compliance{data=ATCUD, qr_code, signature_hash, software_certificate}, ...}}.
//     A REJECTED/FAILED record still returns HTTP 200 — state MUST be checked.
//   - RUNTIME still UNVERIFIED (SIGN PT not enabled on org group1): no authenticated
//     issuance has ever run; actual ATCUD/QR values, PROCESSING->FINISHED timing and
//     fiskaly's real software_certificate number are unconfirmed.
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
  // Positive fiscal boundary: ONLY a device session may issue. A human/PWA JWT
  // (app_role owner/admin/manager) must never reach issuance — belt-and-braces with
  // the device_id check above so the fiscal-read-only constraint can't erode. (§4.2 L1)
  if (meta.app_role !== 'device') return json({ error: 'not_a_device_session' }, 403);

  // device must be enrolled (covers the <=JWT-lifetime revocation window)
  const { data: device } = await admin.from('devices').select('id,status,training_mode,fiskaly_system_id_test,fiskaly_system_id_live').eq('id', deviceId).eq('tenant_id', tenantId).maybeSingle();
  if (!device || device.status !== 'enrolled') return json({ error: 'device_not_enrolled' }, 403);

  let body: {
    checkout_id?: string; transaction_id?: string; doc_type?: string;
    customer?: { nif?: string; code?: string };
    /** Spec-shaped fiskaly recipients — REQUIRED for FT (INVOICE); built by the client. */
    recipients?: unknown[];
    entries?: unknown[]; payments?: unknown[]; breakdown?: unknown[];
    totals?: { vat?: { amount?: string; exclusive?: string; inclusive?: string } };
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

  // System (till) id = the device's fiskaly System resource for this environment.
  const systemId = environment === 'test' ? device.fiskaly_system_id_test : device.fiskaly_system_id_live;
  if (!systemId) return await fail('fiscal_system_unprovisioned', 409);

  // ---- validate the spec-shaped payload BEFORE burning a number ----
  // Per the verified OpenAPI: entries/payments/breakdown are minItems-1 arrays and
  // totals is {vat:{amount,exclusive,inclusive}} with decimal-STRING money values.
  // The client builds these shapes; we reject structurally-invalid payloads here so
  // schema failures never reach fiskaly with an allocated number attached.
  const docType = (body.doc_type ?? 'FS').toUpperCase();
  const wantsInvoice = docType === 'FT'; // NIF on a receipt stays a RECEIPT (customer.code) — no auto-upgrade
  if (!Array.isArray(body.entries) || body.entries.length === 0) return await fail('invalid_entries', 400);
  if (!Array.isArray(body.payments) || body.payments.length === 0) return await fail('invalid_payments', 400);
  if (!Array.isArray(body.breakdown) || body.breakdown.length === 0) return await fail('invalid_breakdown', 400);
  const vatTotals = body.totals?.vat;
  if (!vatTotals || typeof vatTotals.amount !== 'string' || typeof vatTotals.exclusive !== 'string' || typeof vatTotals.inclusive !== 'string') {
    return await fail('invalid_totals', 400);
  }
  // INVOICE (FT) requires full spec-shaped recipients (CONSUMER: name+address;
  // BUSINESS: name+address+identification) — the server cannot fabricate them.
  if (wantsInvoice && (!Array.isArray(body.recipients) || body.recipients.length === 0)) {
    return await fail('invoice_requires_recipients', 400);
  }

  // ---- resolve series + document.number (reuse on a crashed 'pending' retry) ----
  const year = new Date().getUTCFullYear();
  let seriesName: string;
  let documentNumber: string;
  if (prior?.document_number && prior.series) {
    // Resume ANY prior attempt (pending OR failed) with the SAME reserved number: the
    // derived idempotency keys are seeded by checkout_id only, so re-sending with a
    // fresh number would be same-key-different-payload (422) — and the prior record may
    // already be signed at fiskaly. Same number + same keys → fiskaly replays it.
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
  const getHeaders = () => ({ 'X-Api-Version': API_VERSION, Authorization: `Bearer ${fiskalyToken}` });

  const training = !!device.training_mode;

  try {
    // 1) INTENTION — response envelope is RecordResource{content: Record} (spec-verified)
    const iRes = await fetch(`${host}/records`, { method: 'POST', headers: recHeaders(intentionKey),
      body: JSON.stringify({ content: { type: 'INTENTION', system: { id: systemId },
        operation: { type: 'TRANSACTION', details: { creators: [{ type: 'PERSON', label: ((body.cashier_label ?? '').trim() || 'cashier').slice(0, 128) }], training } } } }) });
    if (!iRes.ok) return await fail('fiskaly_intention_failed', 502, await iRes.text());
    const intention = (await iRes.json())?.content;
    // HTTP 200 does NOT mean accepted: REJECTED/FAILED come back as 200 with logs.
    if (!intention?.id) return await fail('fiskaly_intention_no_id', 502, intention);
    if (intention.state === 'REJECTED' || intention.state === 'FAILED') {
      return await fail('fiskaly_intention_rejected', 502, intention.logs ?? intention);
    }

    // 2) TRANSACTION — RECEIPT (FS/FR; NIF travels as customer.code) or INVOICE (FT,
    // client-supplied recipients). Entries/payments/breakdown/totals are validated
    // spec-shaped pass-throughs built by the client.
    const operation = wantsInvoice
      ? { type: 'INVOICE', document: { number: documentNumber, series: seriesName },
          recipients: body.recipients,
          entries: body.entries, payments: body.payments, breakdown: body.breakdown, totals: body.totals }
      : { type: 'RECEIPT', document: { number: documentNumber, series: seriesName, simplified_invoice: docType === 'FS' },
          ...(body.customer?.code || body.customer?.nif ? { customer: { type: 'EXTERNAL', code: (body.customer?.code ?? body.customer?.nif ?? '').slice(0, 128) } } : {}),
          entries: body.entries, payments: body.payments, breakdown: body.breakdown, totals: body.totals };

    const trRes = await fetch(`${host}/records`, { method: 'POST', headers: recHeaders(transactionKey),
      body: JSON.stringify({ content: { type: 'TRANSACTION', record: { id: intention.id }, operation } }) });
    if (!trRes.ok) return await fail('fiskaly_transaction_failed', 502, await trRes.text());
    let c = (await trRes.json())?.content;
    if (!c?.id) return await fail('fiskaly_transaction_no_id', 502, c);
    if (c.state === 'REJECTED' || c.state === 'FAILED') {
      // Number stays reserved on the attempt row; a retry reuses it (deterministic keys).
      return await fail('fiskaly_transaction_rejected', 502, c.logs ?? c);
    }
    // mode PROCESSING = compliance data may not be final yet — bounded re-read.
    // ⚠️ RUNTIME-UNVERIFIED: real PROCESSING->FINISHED timing needs a live TEST pass.
    for (let i = 0; i < 3 && c.mode === 'PROCESSING' && !c.compliance; i++) {
      await new Promise((r) => setTimeout(r, 700));
      const gRes = await fetch(`${host}/records/${c.id}`, { headers: getHeaders() });
      if (!gRes.ok) break;
      const refreshed = (await gRes.json())?.content;
      if (refreshed?.id) c = refreshed;
      if (c.state === 'REJECTED' || c.state === 'FAILED') {
        return await fail('fiskaly_transaction_rejected', 502, c.logs ?? c);
      }
    }

    // A PT sale document is only lawfully printable with ATCUD (Portaria 195/2020),
    // the QR payload and the 4-char signature hash. If the record is still incomplete
    // after the bounded re-read, FAIL — never persist an ATCUD-less document as
    // 'issued' (the idempotency replay would serve it forever). The attempt keeps the
    // reserved number + deterministic keys, so a retry replays the SAME fiskaly record
    // and picks it up once FINISHED.
    if (!c?.compliance?.data || !c?.compliance?.qr_code || !c?.compliance?.signature_hash) {
      return await fail('fiskaly_record_incomplete', 502, { id: c?.id, state: c?.state, mode: c?.mode });
    }

    // ---- persist the signed document (field paths spec-verified, values runtime-unverified) ----
    // ATCUD = compliance.data; QR payload = compliance.qr_code (we render the QR);
    // printed 4-char hash = compliance.signature_hash; full chain signature = journal.signature.
    const { data: doc, error: docErr } = await admin.from('fiscal_documents').insert({
      tenant_id: tenantId, store_id: storeId, device_id: deviceId, transaction_id: body.transaction_id ?? null,
      environment, is_training: training, doc_type: docType, series: seriesName,
      number: documentNumber,                               // client-generated per spec; fiskaly never assigns numbers
      atcud: c.compliance.data,
      fiskaly_record_id: c.id,
      hash: c.compliance.signature_hash,
      qr_data: c.compliance.qr_code,
      software_certificate: c?.compliance?.software_certificate ?? null,
      signed_payload: c, status: 'issued',
    }).select().single();
    if (docErr) return await fail('fiscal_persist_failed', 500, docErr.message);

    await admin.from('fiscal_issue_attempts').update({ status: 'issued', fiskaly_record_id: doc.fiskaly_record_id, fiscal_document_id: doc.id, updated_at: new Date().toISOString() }).eq('checkout_id', checkoutId);
    return json({ status: 'issued', fiscal_document: doc });
  } catch (e) {
    return await fail('fiskaly_unreachable', 503, String(e));
  }
});
