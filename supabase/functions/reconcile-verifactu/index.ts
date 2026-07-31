// reconcile-verifactu — drive SIGN ES invoices whose AEAT registration is still PENDING to a final
// verdict (SIGN ES registration is async; ES-0 saw HTTP 200 ISSUED at issue + verdict later).
// Invoked by the per-minute pg_cron backstop (20260728000000) via pg_net; gated on a shared secret
// (verify_jwt=false), like notify-push. On a rejection (REQUIRES_CORRECTION/_INSPECTION/INVALID) it
// emits a critical VERIFACTU_REJECTED notification -> the P3 push pipeline buzzes the admin. fiskaly
// owns AEAT resubmission; this reconciles OUR copy + surfaces problems.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const HOST: Record<string, string> = { test: 'https://test.es.sign.fiskaly.com/api/v1', live: 'https://live.es.sign.fiskaly.com/api/v1' };
const REJECTED = new Set(['REQUIRES_CORRECTION', 'REQUIRES_INSPECTION', 'INVALID']);
const KNOWN = new Set(['PENDING', 'REGISTERED', 'STORED', 'REQUIRES_CORRECTION', 'REQUIRES_INSPECTION', 'INVALID']);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const shared = Deno.env.get('RECONCILE_SHARED_SECRET') ?? '';
  if (!shared || req.headers.get('x-webhook-secret') !== shared) return json({ error: 'unauthorized' }, 401);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !serviceKey) return json({ error: 'server_misconfigured' }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // PENDING within the last 7 days (matches the cron's give-up bound so a permanently-stuck doc
  // eventually drops out of the batch instead of starving newer ones).
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: docs, error } = await admin.from('fiscal_documents')
    .select('id, tenant_id, store_id, device_id, transaction_id, environment, fiskaly_record_id, series, number, signed_payload')
    .eq('verifactu_registration', 'PENDING').gt('created_at', cutoff).order('created_at', { ascending: true }).limit(100);
  if (error) return json({ error: 'query_failed', detail: error.message }, 500);
  if (!docs?.length) return json({ status: 'ok', pending: 0 });

  // token cache per (tenant, env) INCLUDING failures (negative cache) so a broken-creds tenant can't
  // trigger 100 sequential /auth attempts per pass.
  const tokens = new Map<string, string | null>();
  async function tokenFor(tenantId: string, env: string): Promise<string | null> {
    const k = `${tenantId}:${env}`;
    if (tokens.has(k)) return tokens.get(k)!;
    let tok: string | null = null;
    try {
      const { data: sec } = await admin.from('tenant_fiscal_secrets').select('fiskaly_api_key,fiskaly_api_secret').eq('tenant_id', tenantId).eq('environment', env).maybeSingle();
      if (sec?.fiskaly_api_key) {
        const a = await fetch(`${HOST[env]}/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { api_key: sec.fiskaly_api_key, api_secret: sec.fiskaly_api_secret } }) });
        tok = (await a.json())?.content?.access_token?.bearer ?? null;
      }
    } catch { tok = null; }
    tokens.set(k, tok);
    return tok;
  }

  let checked = 0, updated = 0, alerted = 0, skipped = 0;
  for (const d of docs) {
    const clientId = (d.signed_payload as { content?: { client?: { id?: string } } })?.content?.client?.id;
    if (!clientId || !d.fiskaly_record_id) { skipped++; continue; }
    const tok = await tokenFor(d.tenant_id, d.environment);
    if (!tok) { skipped++; continue; }
    try {
      const r = await fetch(`${HOST[d.environment]}/clients/${clientId}/invoices/${d.fiskaly_record_id}`, { headers: { Authorization: `Bearer ${tok}` } });
      if (!r.ok) { skipped++; continue; }
      const inv = await r.json();
      const c = inv?.content ?? inv;
      const reg = c?.transmission?.registration;
      checked++;
      if (!reg || reg === 'PENDING') continue;
      if (!KNOWN.has(reg)) { console.error(`[reconcile] unknown registration '${reg}' for doc ${d.id}; refreshing payload only`); await admin.from('fiscal_documents').update({ signed_payload: inv }).eq('id', d.id); skipped++; continue; }

      const { error: upErr } = await admin.from('fiscal_documents').update({
        verifactu_registration: reg,
        verifactu_cancellation: c?.transmission?.cancellation ?? undefined,
        signed_payload: inv,
      }).eq('id', d.id).eq('verifactu_registration', 'PENDING'); // don't clobber a concurrent update
      if (upErr) { console.error(`[reconcile] update failed for doc ${d.id}:`, upErr.message); skipped++; continue; }
      updated++;

      if (REJECTED.has(reg)) {
        const detail = (Array.isArray(c?.validations) && c.validations[0]?.description) ? String(c.validations[0].description).slice(0, 300) : `AEAT registration: ${reg}`;
        // plain insert + tolerate 23505: uq_notif_once is a PARTIAL index -> not an ON CONFLICT arbiter.
        const { error: nErr } = await admin.from('notification_events').insert({
          tenant_id: d.tenant_id, store_id: d.store_id, device_id: d.device_id,
          event_type: 'VERIFACTU_REJECTED', severity: 'critical', entity_table: 'fiscal_documents', entity_id: d.id,
          payload: { state: reg, error: detail, series: d.series, number: d.number, transaction_id: d.transaction_id, source: 'sign_es' },
        });
        if (nErr && (nErr as { code?: string }).code !== '23505') console.error(`[reconcile] alert insert failed for doc ${d.id}:`, nErr.message);
        else alerted++;
      }
    } catch { skipped++; }
  }
  return json({ status: 'ok', pending: docs.length, checked, updated, alerted, skipped });
});
