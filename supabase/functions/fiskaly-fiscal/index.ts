import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Fiskaly SIGN PT proxy. Exchanges the API key/secret (FISKALY_API_KEY / FISKALY_API_SECRET)
 * for a JWT, then signs documents via POST /records. Keys stay server-side.
 * Base URLs: test.api.fiskaly.com (test) / live.api.fiskaly.com (live).
 */

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type Environment = 'test' | 'live';

interface RequestBody {
  action?: 'issue_document' | 'saft' | 'health_check';
  environment?: Environment;
  taxpayerId?: string;
  locationId?: string;
  systemId?: string;
  idempotencyKey?: string;
  record?: Record<string, unknown>;
  year?: number;
  month?: number;
}

const API_VERSION = '2026-05-04';

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
  const data = await fiskalyFetch(baseUrl, null, '/tokens', {
    method: 'POST',
    body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret }),
  });
  const token = data && typeof data === 'object' ? (data as Record<string, unknown>).access_token : null;
  if (!token || typeof token !== 'string') {
    throw new Error('Fiskaly did not return an access_token');
  }
  return token;
}

async function issueDocument(body: RequestBody) {
  if (!body.record || typeof body.record !== 'object') {
    throw new Error('record is required');
  }
  if (!body.systemId) {
    throw new Error('systemId is required');
  }
  const baseUrl = baseUrlFor(body.environment);
  const token = await createToken(baseUrl);
  const recordId = body.idempotencyKey ?? crypto.randomUUID();
  const data = await fiskalyFetch(
    baseUrl,
    token,
    `/systems/${body.systemId}/records/${recordId}`,
    { method: 'PUT', body: JSON.stringify(body.record) },
    body.idempotencyKey
  );
  return jsonResponse({ document: data as JsonValue });
}

async function exportSaft(body: RequestBody) {
  if (!body.year || !body.month || body.month < 1 || body.month > 12) {
    throw new Error('year and month are required');
  }
  if (!body.taxpayerId) {
    throw new Error('taxpayerId is required');
  }
  const baseUrl = baseUrlFor(body.environment);
  const token = await createToken(baseUrl);
  const period = `${body.year}-${String(body.month).padStart(2, '0')}`;
  const data = await fiskalyFetch(
    baseUrl,
    token,
    `/taxpayers/${body.taxpayerId}/exports/saft?period=${period}`,
    { method: 'GET' }
  );
  if (!data || typeof data !== 'object' || !('xml' in data)) {
    throw new Error('Fiskaly SAF-T response did not include xml');
  }
  return jsonResponse({ xml: String((data as { xml: unknown }).xml) });
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
