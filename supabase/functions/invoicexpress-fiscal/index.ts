import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * InvoiceXpress fiscal proxy. Holds the API key server-side (INVOICEXPRESS_API_KEY)
 * and drives the create -> finalize -> qrcode flow so the browser never sees the key.
 * Account base URL: https://{accountName}.app.invoicexpress.com (auth via ?api_key=).
 */

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type DocumentType = 'invoice_receipt' | 'simplified_invoice' | 'invoice';

interface RequestBody {
  action?: 'issue_document' | 'saft' | 'health_check';
  accountName?: string;
  documentType?: DocumentType;
  finalize?: boolean;
  idempotencyKey?: string;
  document?: Record<string, unknown>;
  year?: number;
  month?: number;
}

/** documentType -> { plural endpoint segment, singular JSON root key }. */
const DOC_MAP: Record<DocumentType, { endpoint: string; root: string }> = {
  invoice_receipt: { endpoint: 'invoice_receipts', root: 'invoice_receipt' },
  simplified_invoice: { endpoint: 'simplified_invoices', root: 'simplified_invoice' },
  invoice: { endpoint: 'invoices', root: 'invoice' },
};

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

function config(accountName: string) {
  const apiKey = Deno.env.get('INVOICEXPRESS_API_KEY')?.trim();
  if (!apiKey) {
    throw new Error('Missing INVOICEXPRESS_API_KEY');
  }
  if (!accountName) {
    throw new Error('accountName is required');
  }
  const baseUrl = `https://${accountName}.app.invoicexpress.com`;
  return { apiKey, baseUrl };
}

async function ixFetch(baseUrl: string, apiKey: string, path: string, init: RequestInit = {}) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${baseUrl}${path}${sep}api_key=${encodeURIComponent(apiKey)}`;
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, { ...init, headers });
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
      data && typeof data === 'object' && 'errors' in data
        ? JSON.stringify((data as { errors: unknown }).errors)
        : `InvoiceXpress HTTP ${res.status}`;
    throw new Error(message);
  }
  return data;
}

/** InvoiceXpress wraps single-document responses under the root key. */
function unwrapDocument(data: unknown, root: string): Record<string, unknown> {
  if (data && typeof data === 'object' && root in (data as Record<string, unknown>)) {
    return (data as Record<string, Record<string, unknown>>)[root];
  }
  return (data as Record<string, unknown>) ?? {};
}

async function issueDocument(body: RequestBody) {
  const docType = body.documentType ?? 'invoice_receipt';
  const map = DOC_MAP[docType];
  if (!map) {
    throw new Error(`Unsupported documentType: ${docType}`);
  }
  if (!body.document || typeof body.document !== 'object') {
    throw new Error('document is required');
  }
  const { apiKey, baseUrl } = config(body.accountName ?? '');

  // 1. Create (draft)
  const created = unwrapDocument(
    await ixFetch(baseUrl, apiKey, `/${map.endpoint}.json`, {
      method: 'POST',
      body: JSON.stringify({ [map.root]: body.document }),
    }),
    map.root
  );

  const id = created.id;
  if (id == null) {
    throw new Error('InvoiceXpress did not return a document id');
  }

  let final = created;

  // 2. Finalize (draft -> finalized) so ATCUD / hash are assigned
  if (body.finalize !== false) {
    await ixFetch(baseUrl, apiKey, `/${map.endpoint}/${id}/change-state.json`, {
      method: 'PUT',
      body: JSON.stringify({ [map.root]: { state: 'finalized' } }),
    });
    final = unwrapDocument(
      await ixFetch(baseUrl, apiKey, `/${map.endpoint}/${id}.json`, { method: 'GET' }),
      map.root
    );
  }

  // 3. QR code (best-effort; not all accounts expose it)
  try {
    const qr = await ixFetch(baseUrl, apiKey, `/${map.endpoint}/${id}/qr_code.json`, { method: 'GET' });
    if (qr && typeof qr === 'object') {
      const q = qr as Record<string, unknown>;
      final.qr_code = (q.qr_code ?? q.url ?? q.qr_code_url) as JsonValue;
      final.qr_code_url = (q.url ?? q.qr_code_url) as JsonValue;
    }
  } catch {
    // QR is optional for the first integration pass.
  }

  return jsonResponse({ document: final as JsonValue });
}

async function exportSaft(body: RequestBody) {
  if (!body.year || !body.month || body.month < 1 || body.month > 12) {
    throw new Error('year and month are required');
  }
  const { apiKey, baseUrl } = config(body.accountName ?? '');
  const data = await ixFetch(
    baseUrl,
    apiKey,
    `/api/pt/saft/exports.json?type=invoicing&year=${body.year}&month=${body.month}`,
    { method: 'GET' }
  );
  if (!data || typeof data !== 'object' || !('xml' in data)) {
    throw new Error('InvoiceXpress SAF-T response did not include xml');
  }
  return jsonResponse({ xml: String((data as { xml: unknown }).xml) });
}

async function healthCheck(body: RequestBody) {
  const { apiKey, baseUrl } = config(body.accountName ?? '');
  const [account, sequences] = await Promise.all([
    ixFetch(baseUrl, apiKey, '/api/me.json', { method: 'GET' }).catch(() => null),
    ixFetch(baseUrl, apiKey, '/sequences.json', { method: 'GET' }).catch(() => null),
  ]);
  return jsonResponse({ ok: true, account: account as JsonValue, sequences: sequences as JsonValue });
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
