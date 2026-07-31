import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Fiskaly SIGN PT proxy — SIGN PT is the Portugal service of fiskaly's UNIFIED API
 * (shared hosts test.api.fiskaly.com / live.api.fiskaly.com; NOT a specialized
 * per-country API like SIGN ES). Exchanges the API key/secret (FISKALY_API_KEY /
 * FISKALY_API_SECRET) for a JWT, then issues via the verified two-step
 * POST /records flow (INTENTION -> TRANSACTION). Keys stay server-side.
 *
 * Contract verified 2026-07-19 against the official SIGN PT OpenAPI 2026-06-01 +
 * live schema-echo probes (REGISTER B16, docs/fiskaly-pt-contract-capture.md):
 *  - auth body is {content:{type:"API_KEY",key,secret}} (flat api_key/api_secret is
 *    schema-rejected); token at content.authentication.bearer;
 *  - X-Api-Version + X-Idempotency-Key (uuid) are required on every POST, /tokens too;
 *  - PUT /systems/{id}/records/{rid} does NOT exist (the pre-rewrite shape of this
 *    proxy was modeled on SIGN DE and never matched the real API);
 *  - SAF-T (PT) = POST /files {type:"AUDIT",range} then stream artifact.path (zip).
 * ⚠️ RUNTIME-UNVERIFIED: SIGN PT is not enabled on our fiskaly org — no authenticated
 * call has ever succeeded. Do not trust this path for real issuance until a live
 * TEST round trip is captured.
 */

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type Environment = 'test' | 'live';

interface RequestBody {
  action?: 'issue_document' | 'saft' | 'health_check';
  environment?: Environment;
  taxpayerId?: string;
  systemId?: string;
  /** uuid v4 — seeds the deterministic INTENTION/TRANSACTION idempotency keys. */
  checkoutId?: string;
  /** Spec-shaped TRANSACTION operation (RECEIPT/INVOICE/...) built by the client. */
  operation?: Record<string, unknown>;
  cashierLabel?: string;
  training?: boolean;
  /** SAF-T range (inclusive, ISO dates). Must not extend into the current month. */
  from?: string;
  to?: string;
}

const API_VERSION = '2026-06-01';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, JsonValue>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function badRequest(message: string) {
  return jsonResponse({ error: message }, 400);
}

function serverError(message: string) {
  return jsonResponse({ error: message }, 500);
}

function baseUrlFor(environment: Environment | undefined): string {
  return environment === 'live' ? 'https://live.api.fiskaly.com' : 'https://test.api.fiskaly.com';
}

function credentials() {
  const apiKey = Deno.env.get('FISKALY_API_KEY')?.trim();
  const apiSecret = Deno.env.get('FISKALY_API_SECRET')?.trim();
  if (!apiKey || !apiSecret) {
    throw new Error('Missing FISKALY_API_KEY / FISKALY_API_SECRET');
  }
  return { apiKey, apiSecret };
}

// Deterministic uuid-v4-format key from a seed (SHA-256, version/variant nibbles set).
// Fiskaly regex-checks the v4 shape only, so a retry of the same logical call re-sends
// the same X-Idempotency-Key and dedupes instead of issuing twice.
async function derivedUuidV4(seed: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed)));
  const b = Array.from(digest.slice(0, 16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

async function fiskalyFetch(
  baseUrl: string,
  token: string | null,
  path: string,
  init: RequestInit = {},
  idempotencyKey?: string
) {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('X-Api-Version', API_VERSION);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (idempotencyKey) {
    headers.set('X-Idempotency-Key', idempotencyKey);
  }
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data
        ? String((data as { message: unknown }).message)
        : `Fiskaly HTTP ${res.status}`;
    throw new Error(message);
  }
  return data;
}

async function createToken(baseUrl: string): Promise<string> {
  const { apiKey, apiSecret } = credentials();
  // X-Idempotency-Key is required on /tokens too (probe-verified 400 without it);
  // replay semantics are not applied there, so a fresh uuid per call is correct.
  const data = await fiskalyFetch(
    baseUrl,
    null,
    '/tokens',
    {
      method: 'POST',
      body: JSON.stringify({ content: { type: 'API_KEY', key: apiKey, secret: apiSecret } }),
    },
    crypto.randomUUID()
  );
  const content = (data as { content?: { authentication?: { bearer?: unknown } } } | null)?.content;
  const token = content?.authentication?.bearer;
  if (!token || typeof token !== 'string') {
    throw new Error('Fiskaly did not return a bearer token (content.authentication.bearer)');
  }
  return token;
}

interface RecordContentShape {
  id?: string;
  state?: string;
  mode?: string;
  logs?: unknown;
  compliance?: unknown;
  [key: string]: unknown;
}

function recordContent(data: unknown): RecordContentShape {
  const content = (data as { content?: RecordContentShape } | null)?.content;
  if (!content || typeof content !== 'object' || !content.id) {
    throw new Error('Fiskaly record response has no content.id');
  }
  return content;
}

function assertNotRejected(content: RecordContentShape, phase: string): void {
  // HTTP 200 does NOT mean accepted — REJECTED/FAILED arrive as 200 with logs.
  if (content.state === 'REJECTED' || content.state === 'FAILED') {
    throw new Error(`Fiskaly ${phase} ${content.state}: ${JSON.stringify(content.logs ?? null)}`);
  }
}

async function issueDocument(body: RequestBody) {
  if (!body.operation || typeof body.operation !== 'object') {
    throw new Error('operation (spec-shaped TRANSACTION operation) is required');
  }
  if (!body.systemId) {
    throw new Error('systemId is required');
  }
  if (!body.checkoutId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(body.checkoutId)) {
    throw new Error('checkoutId (uuid v4) is required — it seeds the idempotency keys');
  }
  const baseUrl = baseUrlFor(body.environment);
  const token = await createToken(baseUrl);

  // 1) INTENTION
  const intentionData = await fiskalyFetch(
    baseUrl,
    token,
    '/records',
    {
      method: 'POST',
      body: JSON.stringify({
        content: {
          type: 'INTENTION',
          system: { id: body.systemId },
          operation: {
            type: 'TRANSACTION',
            details: {
              creators: [{ type: 'PERSON', label: ((body.cashierLabel ?? '').trim() || 'cashier').slice(0, 128) }],
              ...(body.training ? { training: true } : {}),
            },
          },
        },
      }),
    },
    await derivedUuidV4(`${body.checkoutId}:intention`)
  );
  const intention = recordContent(intentionData);
  assertNotRejected(intention, 'INTENTION');

  // 2) TRANSACTION with the client-built operation (RECEIPT/INVOICE/...)
  const txData = await fiskalyFetch(
    baseUrl,
    token,
    '/records',
    {
      method: 'POST',
      body: JSON.stringify({ content: { type: 'TRANSACTION', record: { id: intention.id }, operation: body.operation } }),
    },
    await derivedUuidV4(`${body.checkoutId}:transaction`)
  );
  let tx = recordContent(txData);
  assertNotRejected(tx, 'TRANSACTION');

  // mode PROCESSING = compliance may not be final yet — bounded re-read.
  // ⚠️ RUNTIME-UNVERIFIED: real PROCESSING->FINISHED timing needs a live TEST pass.
  for (let i = 0; i < 3 && tx.mode === 'PROCESSING' && !tx.compliance; i++) {
    await new Promise((r) => setTimeout(r, 700));
    try {
      const refreshed = recordContent(await fiskalyFetch(baseUrl, token, `/records/${tx.id}`, { method: 'GET' }));
      tx = refreshed;
      assertNotRejected(tx, 'TRANSACTION');
    } catch {
      break;
    }
  }

  return jsonResponse({ record: tx as unknown as JsonValue });
}

async function exportSaft(body: RequestBody) {
  if (!body.from || !body.to) {
    throw new Error('from and to (ISO dates, inclusive; month must have ended) are required');
  }
  if (!body.taxpayerId && !body.systemId) {
    throw new Error('taxpayerId or systemId is required to scope the AUDIT file');
  }
  const baseUrl = baseUrlFor(body.environment);
  const token = await createToken(baseUrl);

  // ⚠️ The spec does NOT declare X-Idempotency-Key on POST /files (unlike /tokens and
  // /records), so create-replay is NOT guaranteed. To avoid piling up AUDIT files on
  // user retries, LIST existing files for the same scope first and reuse one whose
  // range matches; only create when none exists (still sending a deterministic key —
  // harmless if ignored). Runtime-unverified — capture doc §6.
  const listPath = (body.taxpayerId
    ? `/files?taxpayer_id=${body.taxpayerId}`
    : `/files?system_id=${body.systemId}`) + '&type=AUDIT&limit=100';
  const listFiles = async (): Promise<Array<Record<string, unknown>>> => {
    const listed = await fiskalyFetch(baseUrl, token, listPath, { method: 'GET' }).catch(() => null);
    const results = (listed as { content?: { results?: Array<{ content?: Record<string, unknown> }> } } | null)?.content?.results
      ?? (listed as { results?: Array<{ content?: Record<string, unknown> }> } | null)?.results;
    return Array.isArray(results) ? results.map((r) => r?.content).filter((c): c is Record<string, unknown> => !!c) : [];
  };
  const rangeMatches = (c: Record<string, unknown>): boolean => {
    const range = c.range as { from?: string; to?: string } | undefined;
    return c.type === 'AUDIT' && range?.from === body.from && range?.to === body.to && c.state !== 'FAILED';
  };
  const existing = (await listFiles()).filter(rangeMatches);
  let file = existing.find((c) => c.state === 'COMPLETED') ?? existing[0];
  if (!file) {
    const scope = body.taxpayerId ? `taxpayer:${body.taxpayerId}` : `system:${body.systemId}`;
    const createKey = await derivedUuidV4(`saft:${body.environment ?? 'test'}:${scope}:${body.from}:${body.to}`);
    const created = await fiskalyFetch(
      baseUrl,
      token,
      '/files',
      {
        method: 'POST',
        body: JSON.stringify({
          content: {
            type: 'AUDIT',
            range: { from: body.from, to: body.to },
            ...(body.taxpayerId ? { taxpayer: { id: body.taxpayerId } } : {}),
            ...(body.systemId ? { system: { id: body.systemId } } : {}),
          },
        }),
      },
      createKey
    );
    file = (created as { content?: Record<string, unknown> } | null)?.content;
  }
  if (!file?.id) {
    throw new Error('Fiskaly did not return a File resource');
  }

  // No GET /files/{id} exists — poll the list (bounded) until COMPLETED.
  for (let i = 0; i < 4 && file.state !== 'COMPLETED' && file.state !== 'FAILED'; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const match = (await listFiles()).find((c) => c.id === file?.id);
    if (match) file = match;
  }
  if (file.state === 'FAILED') {
    throw new Error('Fiskaly AUDIT file generation FAILED');
  }
  const artifact = file.artifact as { type?: string; path?: string } | undefined;
  if (file.state !== 'COMPLETED' || !artifact?.path) {
    // Generation still running — client re-calls with the same range (same
    // idempotency key) and picks the file up once COMPLETED.
    return jsonResponse({ status: 'processing', file: file as unknown as JsonValue });
  }

  // artifact.path is e.g. /files/<uuidv7>.zip — a SAF-T (PT) zip, streamed as octets.
  const streamRes = await fetch(`${baseUrl}${artifact.path}`, {
    headers: { 'X-Api-Version': API_VERSION, Authorization: `Bearer ${token}` },
  });
  if (!streamRes.ok) {
    throw new Error(`Fiskaly file stream failed: HTTP ${streamRes.status}`);
  }
  const bytes = new Uint8Array(await streamRes.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return jsonResponse({
    status: 'completed',
    artifact_type: artifact.type ?? 'application/zip',
    zip_base64: btoa(binary),
  });
}

async function healthCheck(body: RequestBody) {
  const baseUrl = baseUrlFor(body.environment);
  const token = await createToken(baseUrl);
  const organization = await fiskalyFetch(baseUrl, token, '/organizations', { method: 'GET' }).catch(() => null);
  const system = body.systemId
    ? await fiskalyFetch(baseUrl, token, `/systems/${body.systemId}`, { method: 'GET' }).catch(() => null)
    : null;
  return jsonResponse({ ok: true, organization: organization as JsonValue, system: system as JsonValue });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  // §4.2 L2 (docs/pwa-plan.md): this legacy issuer uses GLOBAL provider credentials and
  // would otherwise issue a real fiscal document for ANY caller — including the public
  // anon key or a PWA human JWT (it was never role/tenant/device checked). Fiscal
  // issuance is DEVICE-ONLY: reject anything whose app_role claim is not 'device'. Full
  // deletion is the coordinated cutover D30 (once the client is wired to pos-checkout);
  // this closes the abuse vector meanwhile. Pair with verify_jwt=true in config.toml.
  {
    const authz = req.headers.get('Authorization') ?? '';
    const tok = authz.startsWith('Bearer ') ? authz.slice(7) : '';
    let role = '';
    try {
      const claims = JSON.parse(atob(tok.split('.')[1])) as { app_metadata?: { app_role?: string } };
      role = claims.app_metadata?.app_role ?? '';
    } catch { role = ''; }
    if (role !== 'device') {
      return new Response(JSON.stringify({ error: 'device_session_required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  try {
    switch (body.action) {
      case 'issue_document':
        return await issueDocument(body);
      case 'saft':
        return await exportSaft(body);
      case 'health_check':
        return await healthCheck(body);
      default:
        return badRequest('Unsupported action');
    }
  } catch (error) {
    return serverError(error instanceof Error ? error.message : String(error));
  }
});
