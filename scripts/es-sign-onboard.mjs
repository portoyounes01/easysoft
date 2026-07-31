// ES-2 — onboard ONE tenant onto SIGN ES for a given environment.
// Provisions the SIGN ES tree (taxpayer → signer → one client per device) inside an already-created
// managed organization, then prints the SQL to persist the ids into tenant_fiscal_config / devices /
// tenant_fiscal_secrets. Split of duties (classifier reality): you (a) create the managed org + mint
// its API key via the Management API / dashboard, and (b) run the emitted SQL; this script does the
// SIGN ES API provisioning in between.
//
// Prereqs: a managed org + its API key (see docs/es-sign-contract-capture.md finding #1 for the
// Management API one-liners). For LIVE, sales-enablement + signed agreement first (B13).
//
// Usage:
//   ES_KEY=<managed-org key> ES_SECRET=<secret> ES_ORG_ID=<managed org uuid> \
//   TENANT_ID=<uuid> ENV=test LEGAL_NAME="Comercio SL" NIF=<valid ES NIF> TERRITORY=SPAIN_OTHER \
//   DEVICE_IDS=<uuid>,<uuid>  node scripts/es-sign-onboard.mjs
import { randomUUID } from 'crypto';

const need = (k) => { const v = process.env[k]; if (!v) { console.error(`missing env ${k}`); process.exit(1); } return v; };
const ES_KEY = need('ES_KEY'), ES_SECRET = need('ES_SECRET'), ES_ORG_ID = need('ES_ORG_ID');
const TENANT_ID = need('TENANT_ID'), ENV = need('ENV'), LEGAL_NAME = need('LEGAL_NAME'), NIF = need('NIF');
const TERRITORY = process.env.TERRITORY || 'SPAIN_OTHER';
const DEVICE_IDS = (process.env.DEVICE_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
if (!['test', 'live'].includes(ENV)) { console.error("ENV must be test|live"); process.exit(1); }
if (!DEVICE_IDS.length) { console.error('DEVICE_IDS required (comma-separated device uuids)'); process.exit(1); }

const BASE = ENV === 'test' ? 'https://test.es.sign.fiskaly.com/api/v1' : 'https://live.es.sign.fiskaly.com/api/v1';
const sql = (s) => s.trim();

async function call(method, path, body, token) {
  const r = await fetch(`${BASE}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}

const auth = await call('POST', '/auth', { content: { api_key: ES_KEY, api_secret: ES_SECRET } });
if (auth.status !== 200) { console.error('auth failed', auth.j); process.exit(2); }
const TOK = auth.j.content.access_token.bearer;

// taxpayer (idempotent: 409 = exists)
let tp = await call('PUT', '/taxpayer', { content: { issuer: { legal_name: LEGAL_NAME, tax_number: NIF }, territory: TERRITORY } }, TOK);
console.log(`taxpayer PUT -> ${tp.status}${tp.status >= 400 ? ' ' + JSON.stringify(tp.j).slice(0, 200) : ''}`);
if (tp.status >= 400 && tp.status !== 409) process.exit(3);

// signer (one shared per tenant+env; empty content = fiskaly-managed cert)
const signerId = process.env.SIGNER_ID || randomUUID();
const sg = await call('PUT', `/signers/${signerId}`, {}, TOK);
console.log(`signer PUT ${signerId} -> ${sg.status}`);
if (sg.status >= 400) { console.error(sg.j); process.exit(4); }

// one client per device
const deviceClient = {};
for (const dev of DEVICE_IDS) {
  const clientId = randomUUID();
  const cl = await call('PUT', `/clients/${clientId}`, { content: { signer_id: signerId } }, TOK);
  console.log(`client PUT ${clientId} (device ${dev}) -> ${cl.status}`);
  if (cl.status >= 400) { console.error(cl.j); process.exit(5); }
  deviceClient[dev] = clientId;
}

// ---- emit persistence SQL (run in the Supabase SQL editor) ----
const col = ENV === 'test' ? 'sign_es_client_id_test' : 'sign_es_client_id_live';
console.log('\n===== RUN THIS SQL (Supabase SQL editor) =====\n');
console.log(sql(`
-- SIGN ES onboarding for tenant ${TENANT_ID} (${ENV})
UPDATE public.tenant_fiscal_config
   SET issuer = 'sign_es', sign_es_org_id = '${ES_ORG_ID}', sign_es_signer_id = '${signerId}', updated_at = now()
 WHERE tenant_id = '${TENANT_ID}' AND environment = '${ENV}';
`));
for (const [dev, cid] of Object.entries(deviceClient)) {
  console.log(sql(`UPDATE public.devices SET ${col} = '${cid}' WHERE id = '${dev}' AND tenant_id = '${TENANT_ID}';`));
}
console.log(`
-- And put the managed-org API key/secret in tenant_fiscal_secrets (service-role only; secret shown once):
--   UPDATE public.tenant_fiscal_secrets SET fiskaly_api_key = '<ES_KEY>', fiskaly_api_secret = '<ES_SECRET>'
--    WHERE tenant_id = '${TENANT_ID}' AND environment = '${ENV}';
-- (create the tenant_fiscal_config/secrets rows first if absent)
`);
console.log('===== END SQL =====');
console.log(JSON.stringify({ tenant: TENANT_ID, env: ENV, org: ES_ORG_ID, signer: signerId, deviceClient }, null, 1));
