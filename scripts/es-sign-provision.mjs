// ES-0 — fiskaly SIGN ES contract verification (docs/fiskaly-strategy-brief.md).
// Provisions the blank TEST org (taxpayer → signer → client), issues ONE SIMPLIFIED
// invoice, polls the async AEAT transmission to a final state, probes same-UUID retry
// (idempotency) and a CORRECTING invoice, and captures every request/response verbatim.
//
// TEST-only by construction: base URL is the TEST host and the magic AEAT-stubbed NIF
// T00000001 is used (per SIGN ES docs, TEST validates T00000001–T00000004 offline).
// Idempotent: resource UUIDs persist in scripts/.es-sign-state.json so re-runs PUT the
// same resources (SIGN ES PUTs are idempotent by id).
//
// Usage:  node scripts/es-sign-provision.mjs            (uses FISKALY_TEST_API_* from .env)
// Output: docs/es-sign-contract-capture.md (+ raw JSON captures inline)
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';

const BASE = 'https://test.es.sign.fiskaly.com/api/v1';
const STATE_FILE = new URL('./.es-sign-state.json', import.meta.url).pathname;
const CAPTURE_FILE = new URL('../docs/es-sign-contract-capture.md', import.meta.url).pathname;

// --- env ---
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url).pathname, 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
);
// SIGN ES resources live in a MANAGED organization (the root org 401s on PUT /taxpayer:
// "not a managed organization"). Use the managed-org key (FISKALY_ES_TEST_API_*); the root
// key (FISKALY_TEST_API_*) only works for the Management API (dashboard.fiskaly.com/api/v0).
const API_KEY = env.FISKALY_ES_TEST_API_KEY || env.FISKALY_TEST_API_KEY;
const API_SECRET = env.FISKALY_ES_TEST_API_SECRET || env.FISKALY_TEST_API_SECRET;
if (!env.FISKALY_ES_TEST_API_KEY) console.warn('⚠️ FISKALY_ES_TEST_API_KEY not set — falling back to the ROOT key, taxpayer.put will 401');
if (!API_KEY || !API_SECRET) { console.error('FISKALY_*_TEST_API_* missing in .env'); process.exit(1); }

// --- state (stable UUIDs across runs) ---
const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {};
state.signer_id ??= randomUUID();
state.client_id ??= randomUUID();
state.invoice_id ??= randomUUID();
state.correcting_id ??= randomUUID();
state.series ??= 'ES0TEST';
state.next_number ??= 1;
writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

// --- capture log ---
const captures = [];
async function call(label, method, path, body, token) {
  const url = `${BASE}${path}`;
  const started = Date.now();
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  captures.push({ label, method, path, status: res.status, ms: Date.now() - started, request: body ?? null, response: json });
  console.log(`[${label}] ${method} ${path} -> ${res.status} (${Date.now() - started}ms)`);
  return { status: res.status, json };
}

const redact = (o) => JSON.parse(JSON.stringify(o), (k, v) =>
  ['api_key', 'api_secret', 'bearer', 'token'].includes(k) ? '<redacted>' : v);

// ================= run =================
// 1) auth
const auth = await call('auth', 'POST', '/auth', { content: { api_key: API_KEY, api_secret: API_SECRET } });
if (auth.status !== 200) { console.error('AUTH FAILED'); finish(1); }
const TOK = auth.json.content.access_token.bearer;

// 2) taxpayer (idempotent-ish: 409/conflict means it exists -> GET)
let tp = await call('taxpayer.put', 'PUT', '/taxpayer', {
  content: {
    issuer: { legal_name: 'EasySoft POS Pruebas SL', tax_number: 'T00000001' },
    territory: 'SPAIN_OTHER', // Verifactu common territory (TEST-enabled per changelog)
  },
}, TOK);
if (tp.status === 409) tp = await call('taxpayer.get', 'GET', '/taxpayer', undefined, TOK);

// 3) software (read-only; 409'd while no taxpayer existed)
await call('software.get', 'GET', '/software', undefined, TOK);

// 4) signer (empty content -> fiskaly-managed certificate)
await call('signer.put', 'PUT', `/signers/${state.signer_id}`, {}, TOK);

// 5) client (the till), linked to the signer
await call('client.put', 'PUT', `/clients/${state.client_id}`, { content: { signer_id: state.signer_id } }, TOK);

// 6) ONE SIMPLIFIED invoice — clean numbers: net 10.00 + 21% VAT = 12.10
const number = String(state.next_number);
const invoiceBody = {
  content: {
    type: 'SIMPLIFIED',
    series: state.series,
    number,
    text: 'Venta TPV — prueba de contrato ES-0',
    full_amount: '12.10',
    items: [{
      text: 'Producto de prueba',
      quantity: '1.00',
      unit_amount: '10.00',   // net, before VAT
      full_amount: '12.10',   // gross incl. VAT
      system: { type: 'REGULAR', category: { type: 'VAT', rate: '21.0' } },
    }],
  },
};
const inv = await call('invoice.put', 'PUT', `/clients/${state.client_id}/invoices/${state.invoice_id}`, invoiceBody, TOK);

// 7) poll transmission state to a final verdict (async AEAT registration, ~60-70s batches)
let finalState = null;
if (inv.status === 200) {
  state.next_number += 1; writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 15000));
    const g = await call(`invoice.poll.${i}`, 'GET', `/clients/${state.client_id}/invoices/${state.invoice_id}`, undefined, TOK);
    const trans = g.json?.content?.transmission ?? g.json?.content?.state ?? null;
    const regState = trans?.registration?.state ?? trans?.state ?? JSON.stringify(trans)?.slice(0, 80);
    console.log(`   poll ${i}: ${regState}`);
    if (regState && !/PENDING/i.test(String(regState))) { finalState = regState; break; }
  }
}

// 8) idempotency probe — same UUID, same body again
await call('invoice.retry-same-uuid', 'PUT', `/clients/${state.client_id}/invoices/${state.invoice_id}`, invoiceBody, TOK);

// 9) CORRECTING invoice probe (rectificativa). Shape per the spec (confirmed by the API's own
// 400 schema echo): wrapper { type:'CORRECTING', id:<original invoice uuid>, code, method,
// invoice:<the replacement SIMPLIFIED/COMPLETE invoice> } — the replacement is NESTED.
const correctingBody = {
  content: {
    type: 'CORRECTING',
    id: state.invoice_id,          // the invoice being corrected
    code: 'CORRECTION_4',          // "other reasons" — generic POS refund/void
    method: 'SUBSTITUTION',
    invoice: {
      type: 'SIMPLIFIED',
      series: `${state.series}R`,  // separate series for rectificativas (Spanish rule)
      number: '1',
      text: 'Rectificativa de prueba — anulación total',
      full_amount: '0.00',         // SUBSTITUTION: the replacement invoice's new totals
      items: [{
        text: 'Producto de prueba (rectificación)',
        quantity: '1.00',
        unit_amount: '0.00',
        full_amount: '0.00',
        system: { type: 'REGULAR', category: { type: 'VAT', rate: '21.0' } },
      }],
    },
  },
};
await call('invoice.correcting', 'PUT', `/clients/${state.client_id}/invoices/${state.correcting_id}`, correctingBody, TOK);
// follow-up poll on the correcting invoice's transmission
await new Promise((r) => setTimeout(r, 15000));
await call('invoice.correcting.poll', 'GET', `/clients/${state.client_id}/invoices/${state.correcting_id}`, undefined, TOK);
// and re-check the ORIGINAL's final registration verdict one more time
await call('invoice.original.recheck', 'GET', `/clients/${state.client_id}/invoices/${state.invoice_id}`, undefined, TOK);

finish(0, finalState);

function finish(code, final) {
  const md = [
    '# SIGN ES — captured TEST contract (ES-0)',
    '',
    `Run: ${new Date().toISOString()} · org \`7a0289c1…\` · base \`${BASE}\``,
    `Final transmission state of first invoice: **${final ?? 'not reached in polling window'}**`,
    '',
    ...captures.map((c) => [
      `## ${c.label} — \`${c.method} ${c.path}\` → ${c.status} (${c.ms}ms)`,
      c.request ? `Request:\n\`\`\`json\n${JSON.stringify(redact(c.request), null, 1)}\n\`\`\`` : '_no body_',
      `Response:\n\`\`\`json\n${JSON.stringify(redact(c.response), null, 1)}\n\`\`\``,
      '',
    ].join('\n')),
  ].join('\n');
  writeFileSync(CAPTURE_FILE, md);
  console.log(`\ncapture written: ${CAPTURE_FILE} (${captures.length} calls)`);
  process.exit(code);
}
