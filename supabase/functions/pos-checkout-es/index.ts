// pos-checkout-es — server-side fiscal issuance for SPAIN (fiskaly SIGN ES / Veri*factu).
//
// Contract VERIFIED in TEST (docs/es-sign-contract-capture.md, ES-0):
//   auth  POST /auth {content:{api_key,api_secret}} -> content.access_token.bearer
//   issue PUT  /clients/{client_id}/invoices/{invoice_id}   (we assign series+number; decimal STRINGS)
//   response: state=ISSUED + compliance{code.image.data(base64 png), text(legend), url(AEAT QR)}
//             + transmission.registration (async AEAT verdict).
//   idempotency: identical (client_id, invoice_id, body) -> 200 echo; changed body -> 409.
//
// RETRY MODEL (hardened after the ES-2 review): the correlative number is reserved ONCE per
// checkout_id and REUSED on every retry regardless of prior status, so the body stays byte-stable
// and a retry echoes (200) instead of 409. A post-issue failure (e.g. persist crash) is recovered
// on retry: a 409 means "already issued at fiskaly" -> GET + persist (never a second document, never
// a burned number, never a lost archive row). All ledger/doc access is tenant-scoped.
//
// SIMPLIFIED (factura simplificada) is ES-0-verified. COMPLETE (buyer NIF) is spec-shaped (its
// wrapper matches the OpenAPI CompleteInvoice: {type:COMPLETE, data:<SimplifiedInvoice>, recipients})
// but not yet issued in TEST — verify before first LIVE buyer-NIF sale. CORRECTING = ES-4.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const SIGN_ES_HOST: Record<string, string> = {
  test: 'https://test.es.sign.fiskaly.com/api/v1',
  live: 'https://live.es.sign.fiskaly.com/api/v1',
};
const SERIES_CODE: Record<string, string> = { SIMPLIFIED: 'FS', COMPLETE: 'FC' }; // no I/O/W (fiskaly legibility)
const REJECTED = new Set(['REQUIRES_CORRECTION', 'REQUIRES_INSPECTION', 'INVALID']);
const DEC2 = /^\d{1,12}(\.\d{1,2})?$/;   // invoice full_amount (Decimal12p2), non-negative
const DEC8 = /^\d{1,12}(\.\d{1,8})?$/;   // item amounts (Decimal12p8), non-negative
const ES_NIF = /^[A-Z0-9]{9}$/;          // DNI/NIE/CIF shape (fiskaly does the checksum)

function decodeClaims(jwt: string): Record<string, unknown> {
  try { return JSON.parse(atob(jwt.split('.')[1])); } catch { return {}; }
}
async function derivedUuidV4(seed: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed)));
  const b = Array.from(d.slice(0, 16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

interface EsItem { text?: string; quantity?: string; unit_amount?: string; full_amount?: string; discount?: string; system?: unknown; }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !serviceKey) return json({ error: 'server_misconfigured' }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const meta = (decodeClaims(token).app_metadata ?? {}) as Record<string, string>;
  const tenantId = meta.tenant_id, storeId = meta.store_id, deviceId = meta.device_id;
  if (!tenantId || !deviceId) return json({ error: 'no_tenant_context' }, 401);
  if (meta.app_role !== 'device') return json({ error: 'not_a_device_session' }, 403);

  const { data: device } = await admin.from('devices')
    .select('id,status,training_mode,sign_es_client_id_test,sign_es_client_id_live')
    .eq('id', deviceId).eq('tenant_id', tenantId).maybeSingle();
  if (!device || device.status !== 'enrolled') return json({ error: 'device_not_enrolled' }, 403);

  let body: {
    checkout_id?: string; transaction_id?: string; doc_type?: string;
    text?: string; full_amount?: string; items?: EsItem[];
    recipient?: { nif?: string; legal_name?: string; address_line?: string; postal_code?: string };
    issued_at?: string;
  };
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const checkoutId = (body.checkout_id ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(checkoutId)) return json({ error: 'invalid_checkout_id' }, 400);

  const docType = (body.doc_type ?? 'SIMPLIFIED').toUpperCase();
  if (!SERIES_CODE[docType]) return json({ error: 'unsupported_doc_type', detail: 'ES-2 issues SIMPLIFIED|COMPLETE; CORRECTING = ES-4' }, 400);

  // ---- validate money BEFORE reserving a correlative number (a bad body must never burn one) ----
  if (typeof body.full_amount !== 'string' || !DEC2.test(body.full_amount)) return json({ error: 'invalid_full_amount', detail: 'non-negative decimal string, <=2dp' }, 400);
  if (!Array.isArray(body.items) || body.items.length === 0) return json({ error: 'items_required' }, 400);
  let itemsSum = 0;
  for (const [i, it] of body.items.entries()) {
    if (typeof it.text !== 'string' || !it.text) return json({ error: 'invalid_item', detail: `items[${i}].text` }, 400);
    for (const f of ['quantity', 'unit_amount', 'full_amount'] as const) {
      if (typeof it[f] !== 'string' || !DEC8.test(it[f] as string)) return json({ error: 'invalid_item', detail: `items[${i}].${f} must be a non-negative decimal string` }, 400);
    }
    if (!it.system) return json({ error: 'invalid_item', detail: `items[${i}].system (VAT regime) required` }, 400);
    itemsSum += Number(it.full_amount);
  }
  // SIGN ES requires sum(item.full_amount) == invoice.full_amount.
  if (Math.abs(itemsSum - Number(body.full_amount)) > 0.005) return json({ error: 'items_sum_mismatch', detail: `items sum ${itemsSum.toFixed(2)} != full_amount ${body.full_amount}` }, 400);
  if (docType === 'COMPLETE' && !ES_NIF.test((body.recipient?.nif ?? '').toUpperCase())) return json({ error: 'recipient_nif_required', detail: 'COMPLETE invoices need a valid buyer NIF' }, 400);

  // ---- idempotency ledger (TENANT-SCOPED) ----
  const priorQ = () => admin.from('fiscal_issue_attempts').select('*').eq('checkout_id', checkoutId).eq('tenant_id', tenantId).maybeSingle();
  let { data: prior } = await priorQ();
  if (prior?.status === 'issued' && prior.fiscal_document_id) {
    const { data: doc } = await admin.from('fiscal_documents').select('*').eq('id', prior.fiscal_document_id).eq('tenant_id', tenantId).maybeSingle();
    return json({ status: 'already_issued', fiscal_document: doc });
  }
  if (!prior) {
    // PK(checkout_id) is the concurrency gate: a second concurrent request conflicts here and re-reads.
    const { error: insErr } = await admin.from('fiscal_issue_attempts').insert({ checkout_id: checkoutId, tenant_id: tenantId, device_id: deviceId, status: 'pending' });
    if (insErr) ({ data: prior } = await priorQ());
  }
  const fail = async (reason: string, status = 502, detail?: unknown) => {
    await admin.from('fiscal_issue_attempts').update({ status: 'failed', error: reason, updated_at: new Date().toISOString() }).eq('checkout_id', checkoutId).eq('tenant_id', tenantId);
    return json({ error: reason, detail }, status);
  };
  const emitRejected = async (docId: string, reg: string, detail: string) => {
    // plain insert; uq_notif_once is a PARTIAL index so ON CONFLICT can't target it — tolerate 23505.
    const { error } = await admin.from('notification_events').insert({
      tenant_id: tenantId, store_id: storeId, device_id: deviceId,
      event_type: 'VERIFACTU_REJECTED', severity: 'critical', entity_table: 'fiscal_documents', entity_id: docId,
      payload: { state: reg, error: detail, source: 'sign_es' },
    });
    if (error && (error as { code?: string }).code !== '23505') console.error('[es] emitRejected failed:', error.message);
  };

  // ---- per-tenant config + secret ----
  const environment = device.training_mode ? 'test' : 'live';
  const clientId = environment === 'test' ? device.sign_es_client_id_test : device.sign_es_client_id_live;
  const { data: cfg } = await admin.from('tenant_fiscal_config').select('issuer').eq('tenant_id', tenantId).eq('environment', environment).maybeSingle();
  const { data: secret } = await admin.from('tenant_fiscal_secrets').select('fiskaly_api_key,fiskaly_api_secret').eq('tenant_id', tenantId).eq('environment', environment).maybeSingle();
  if (!cfg || cfg.issuer !== 'sign_es') return await fail('fiscal_config_missing', 409, "tenant_fiscal_config.issuer must be 'sign_es'");
  if (!clientId) return await fail('device_not_provisioned', 409, `devices.sign_es_client_id_${environment} is null`);
  if (!secret?.fiskaly_api_key || !secret?.fiskaly_api_secret) return await fail('fiscal_secret_missing', 409);

  // ---- series + correlative number: reserve ONCE, reuse on EVERY retry (any prior status) ----
  const year = new Date().getUTCFullYear();
  const seriesName = `${SERIES_CODE[docType]}${environment === 'test' ? 'T' : 'L'}${year}`;
  let number: string;
  if (prior?.document_number && prior.series) {
    number = prior.document_number;
  } else {
    await admin.from('fiscal_series').upsert(
      { tenant_id: tenantId, environment, doc_type: docType, series: seriesName, store_id: storeId, device_id: deviceId, year },
      { onConflict: 'tenant_id,environment,doc_type,series', ignoreDuplicates: true },
    );
    const { data: n, error: nErr } = await admin.rpc('allocate_fiscal_number', { p_tenant: tenantId, p_env: environment, p_doc_type: docType, p_series: seriesName });
    if (nErr || !n) return await fail('number_allocation_failed', 500, nErr?.message);
    number = String(n);
    // write the reservation only if not already set (guards the concurrent-allocation race; a wasted
    // number in the rare race is a tolerable series gap, but we never overwrite a committed reservation).
    const { data: reserved } = await admin.from('fiscal_issue_attempts')
      .update({ document_number: number, series: seriesName }).eq('checkout_id', checkoutId).eq('tenant_id', tenantId).is('document_number', null).select('document_number').maybeSingle();
    if (!reserved) { ({ data: prior } = await priorQ()); number = prior?.document_number ?? number; }
  }

  // ---- SIGN ES: auth -> issue (with 409-recovery) ----
  const host = SIGN_ES_HOST[environment];
  let esToken = '';
  try {
    const a = await fetch(`${host}/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { api_key: secret.fiskaly_api_key, api_secret: secret.fiskaly_api_secret } }) });
    if (!a.ok) return await fail('signes_auth_failed', 502, await a.text());
    esToken = (await a.json())?.content?.access_token?.bearer;
    if (!esToken) return await fail('signes_auth_no_token', 502);
  } catch (e) { return await fail('signes_unreachable', 503, String(e)); }

  const invoiceId = await derivedUuidV4(`${checkoutId}:es-invoice`); // retry-stable
  const authH = { Authorization: `Bearer ${esToken}` };
  const simplified = { type: 'SIMPLIFIED', series: seriesName, number, text: (body.text ?? 'Venta TPV').slice(0, 250), full_amount: body.full_amount, items: body.items, ...(body.issued_at ? { issued_at: body.issued_at } : {}) };
  const content = docType === 'COMPLETE'
    ? { type: 'COMPLETE', data: simplified, recipients: [{ id: { legal_name: body.recipient?.legal_name ?? 'Cliente', tax_number: (body.recipient?.nif ?? '').toUpperCase() }, address_line: body.recipient?.address_line ?? '-', postal_code: body.recipient?.postal_code ?? '-' }] }
    : simplified;

  const persist = async (inv: unknown) => {
    const c = (inv as { content?: Record<string, unknown> })?.content ?? (inv as Record<string, unknown>);
    const trans = (c?.transmission ?? {}) as { registration?: string; cancellation?: string };
    const comp = (c?.compliance ?? {}) as { url?: string; text?: string };
    const reg = trans.registration ?? 'PENDING';
    const { data: doc, error: docErr } = await admin.from('fiscal_documents').insert({
      tenant_id: tenantId, store_id: storeId, device_id: deviceId, transaction_id: body.transaction_id ?? null,
      environment, is_training: environment === 'test', doc_type: docType, series: seriesName, number,
      fiskaly_record_id: (c?.id as string) ?? invoiceId,
      qr_data: comp.url ?? null, aeat_validation_url: comp.url ?? null, compliance_legend: comp.text ?? null,
      invoice_kind: docType, verifactu_registration: reg, verifactu_cancellation: trans.cancellation ?? 'NOT_CANCELLED',
      signed_payload: inv, status: 'issued',
    }).select().single();
    if (docErr) return await fail('fiscal_persist_failed', 500, docErr.message);
    await admin.from('fiscal_issue_attempts').update({ status: 'issued', fiskaly_record_id: doc.fiskaly_record_id, fiscal_document_id: doc.id, updated_at: new Date().toISOString() }).eq('checkout_id', checkoutId).eq('tenant_id', tenantId);
    // A verdict already final AND rejected at issue time is never seen by the PENDING-only reconciler — alert now.
    if (REJECTED.has(reg)) {
      const v = (c?.validations as Array<{ description?: string }>)?.[0]?.description;
      await emitRejected(doc.id, reg, (v ?? `AEAT registration: ${reg}`).slice(0, 300));
    }
    return json({ status: 'issued', fiscal_document: doc, registration: reg });
  };

  try {
    const iRes = await fetch(`${host}/clients/${clientId}/invoices/${invoiceId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authH }, body: JSON.stringify({ content }) });
    if (iRes.status === 409) {
      // Already exists at fiskaly (a prior attempt issued it but failed to persist). Recover: GET + persist.
      const g = await fetch(`${host}/clients/${clientId}/invoices/${invoiceId}`, { headers: authH });
      if (!g.ok) return await fail('signes_recover_failed', 502, await g.text());
      return await persist(await g.json());
    }
    if (!iRes.ok) return await fail('signes_issue_failed', 502, await iRes.text());
    return await persist(await iRes.json());
  } catch (e) {
    // Network drop AFTER fiskaly may have processed the PUT: don't burn/deadlock — a retry reuses the
    // same number+UUID and either echoes (200) or 409-recovers. Mark pending (retryable), not failed.
    await admin.from('fiscal_issue_attempts').update({ status: 'pending', error: 'signes_unreachable', updated_at: new Date().toISOString() }).eq('checkout_id', checkoutId).eq('tenant_id', tenantId);
    return json({ error: 'signes_unreachable', detail: String(e) }, 503);
  }
});
