import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface VendusFiscalRequest {
  action?: 'issue_document' | 'saft' | 'health_check';
  document?: Record<string, unknown>;
  year?: number;
  month?: number;
  mode?: 'normal' | 'tests';
}

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

function vendusConfig() {
  const apiKey = Deno.env.get('VENDUS_API_KEY')?.trim();
  const baseUrl = (Deno.env.get('VENDUS_BASE_URL')?.trim() || 'https://www.vendus.pt/ws/v1.1').replace(/\/+$/, '');
  if (!apiKey) {
    throw new Error('Missing VENDUS_API_KEY');
  }
  return { apiKey, baseUrl };
}

async function vendusFetch(path: string, init: RequestInit = {}) {
  const { apiKey, baseUrl } = vendusConfig();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${apiKey}`);
  headers.set('Accept', 'application/json');
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
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
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Vendus HTTP ${res.status}`;
    throw new Error(message);
  }
  return data;
}

async function issueDocument(document: Record<string, unknown>) {
  if (!document.register_id) {
    throw new Error('register_id is required');
  }
  if (!document.type) {
    throw new Error('type is required');
  }
  if (!document.tx_id) {
    throw new Error('tx_id is required');
  }
  const data = await vendusFetch('/documents/', {
    method: 'POST',
    body: JSON.stringify(document),
  });
  return jsonResponse({ document: data as JsonValue });
}

async function exportSaft(year: number | undefined, month: number | undefined, mode: 'normal' | 'tests' | undefined) {
  if (!year || !month || month < 1 || month > 12) {
    throw new Error('year and month are required');
  }
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
  });
  if (mode) {
    params.set('mode', mode);
  }
  const data = await vendusFetch(`/taxauthority/saft/?${params.toString()}`, {
    method: 'GET',
  });
  if (!data || typeof data !== 'object' || !('xml' in data)) {
    throw new Error('Vendus SAF-T response did not include xml');
  }
  return jsonResponse({ xml: String((data as { xml: unknown }).xml) });
}

async function healthCheck() {
  const [account, taxes, paymentMethods] = await Promise.all([
    vendusFetch('/account/', { method: 'GET' }),
    vendusFetch('/taxes/', { method: 'GET' }),
    vendusFetch('/documents/paymentmethods/', { method: 'GET' }),
  ]);
  return jsonResponse({
    ok: true,
    account: account as JsonValue,
    taxes: taxes as JsonValue,
    paymentMethods: paymentMethods as JsonValue,
  });
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

  let body: VendusFiscalRequest;
  try {
    body = await req.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  try {
    switch (body.action) {
      case 'issue_document':
        if (!body.document || typeof body.document !== 'object') {
          return badRequest('document is required');
        }
        return await issueDocument(body.document);
      case 'saft':
        return await exportSaft(body.year, body.month, body.mode);
      case 'health_check':
        return await healthCheck();
      default:
        return badRequest('Unsupported action');
    }
  } catch (error) {
    return serverError(error instanceof Error ? error.message : String(error));
  }
});
