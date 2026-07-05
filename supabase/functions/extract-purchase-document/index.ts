import { createClient } from 'jsr:@supabase/supabase-js@2';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

type DocumentType = 'auto' | 'receipt' | 'invoice';
type AzureField = {
  type?: string;
  content?: string;
  confidence?: number;
  valueString?: string;
  valueNumber?: number;
  valueInteger?: number;
  valueDate?: string;
  valueCurrency?: { amount?: number; currencyCode?: string };
  valueArray?: AzureField[];
  valueObject?: Record<string, AzureField>;
};

type AzureAnalyzeResult = {
  status?: string;
  error?: { message?: string };
  analyzeResult?: {
    documents?: Array<{
      confidence?: number;
      fields?: Record<string, AzureField>;
    }>;
  };
};

interface RequestBody {
  employee_id?: string;
  employee_number?: string;
  file_name?: string;
  mime_type?: string;
  document_type?: DocumentType;
  base64_source?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const valueText = (field?: AzureField): string | null =>
  field?.valueString ?? field?.valueDate ?? field?.content?.trim() ?? null;

const valueNumber = (field?: AzureField): number | null => {
  const value = field?.valueCurrency?.amount ?? field?.valueNumber ?? field?.valueInteger;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number((field?.content ?? '').replace(/[^\d,.-]/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const fieldConfidence = (...fields: Array<AzureField | undefined>): number => {
  const values = fields
    .map(field => field?.confidence)
    .filter((value): value is number => typeof value === 'number');
  return values.length ? Math.min(...values) : 0;
};

const normalizeLine = (item: AzureField) => {
  const object = item.valueObject ?? {};
  const description = valueText(object.Description ?? object.Name) ?? '';
  const productCode = valueText(object.ProductCode ?? object.ItemCode ?? object.SKU);
  const quantity = valueNumber(object.Quantity) ?? 1;
  const unitCost =
    valueNumber(object.UnitPrice ?? object.Price) ??
    ((valueNumber(object.Amount ?? object.TotalPrice) ?? 0) / Math.max(quantity, 1));
  const lineTotal = valueNumber(object.Amount ?? object.TotalPrice) ?? unitCost * quantity;
  return {
    description,
    productCode,
    quantity,
    unitCost,
    lineTotal,
    confidence: fieldConfidence(
      object.Description ?? object.Name,
      object.Quantity,
      object.UnitPrice ?? object.Price,
      object.Amount ?? object.TotalPrice,
    ),
  };
};

const normalizeAzureResult = (
  result: AzureAnalyzeResult,
  model: 'prebuilt-receipt' | 'prebuilt-invoice',
) => {
  const document = result.analyzeResult?.documents?.[0];
  const fields = document?.fields ?? {};
  const itemField = fields.Items;
  const lines = (itemField?.valueArray ?? [])
    .map(normalizeLine)
    .filter(line => line.description || line.lineTotal > 0);
  const supplier =
    valueText(fields.MerchantName) ??
    valueText(fields.VendorName) ??
    valueText(fields.SupplierName);
  const currency =
    fields.Total?.valueCurrency?.currencyCode ??
    fields.InvoiceTotal?.valueCurrency?.currencyCode ??
    fields.Subtotal?.valueCurrency?.currencyCode ??
    'EUR';

  return {
    provider: 'azure_document_intelligence',
    model,
    supplierName: supplier,
    supplierTaxNumber:
      valueText(fields.VendorTaxId) ??
      valueText(fields.SupplierTaxId) ??
      valueText(fields.MerchantTaxId),
    documentNumber:
      valueText(fields.InvoiceId) ??
      valueText(fields.ReceiptId) ??
      valueText(fields.TransactionId),
    purchaseDate: valueText(fields.InvoiceDate) ?? valueText(fields.TransactionDate),
    currency,
    subtotal: valueNumber(fields.SubTotal ?? fields.Subtotal),
    tax: valueNumber(fields.TotalTax ?? fields.Tax),
    total: valueNumber(fields.InvoiceTotal ?? fields.Total),
    confidence: document?.confidence ?? fieldConfidence(
      fields.MerchantName ?? fields.VendorName,
      fields.InvoiceTotal ?? fields.Total,
      itemField,
    ),
    lines,
  };
};

const hasInventoryPermission = (role: string, accessLevels: string[]): boolean =>
  role === 'admin' ||
  role === 'manager' ||
  accessLevels.includes('all') ||
  accessLevels.includes('inventory');

async function authorize(body: RequestBody, req: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase configuration');
  const admin = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return { error: jsonResponse({ error: 'Bearer session required' }, 401) };
  }
  const userResult = await admin.auth.getUser(authHeader.slice(7));
  const user = userResult.data.user;
  if (!user) return { error: jsonResponse({ error: 'Invalid session' }, 401) };

  const tenantId = user.app_metadata.tenant_id;
  const appRole = user.app_metadata.app_role;
  if (typeof tenantId !== 'string' || !tenantId) {
    return { error: jsonResponse({ error: 'Tenant claim required' }, 403) };
  }

  if (appRole === 'device') {
    const deviceId = user.app_metadata.device_id;
    if (typeof deviceId !== 'string' || !deviceId) {
      return { error: jsonResponse({ error: 'Device claim required' }, 403) };
    }
    const { data: device } = await admin
      .from('devices')
      .select('id')
      .eq('id', deviceId)
      .eq('tenant_id', tenantId)
      .eq('auth_user_id', user.id)
      .eq('status', 'enrolled')
      .maybeSingle();
    if (!device) return { error: jsonResponse({ error: 'Device is not enrolled' }, 403) };
  }

  let employeeQuery = admin
    .from('employees')
    .select('id,is_active,role,access_levels,employee_number')
    .eq('tenant_id', tenantId);
  if (appRole === 'device') {
    employeeQuery = body.employee_id
      ? employeeQuery.eq('id', body.employee_id)
      : employeeQuery.eq('employee_number', body.employee_number ?? '');
  } else {
    employeeQuery = employeeQuery.eq('auth_id', user.id);
  }
  const { data: employee } = await employeeQuery.maybeSingle();

  if (!employee) return { error: jsonResponse({ error: 'Employee not found' }, 401) };
  if (!employee.is_active) return { error: jsonResponse({ error: 'Employee inactive' }, 403) };
  if (!hasInventoryPermission(
    String(employee.role),
    Array.isArray(employee.access_levels) ? employee.access_levels.map(String) : [],
  )) {
    return { error: jsonResponse({ error: 'Missing inventory permission' }, 403) };
  }
  return { employee };
}

async function analyzeWithAzure(
  base64Source: string,
  model: 'prebuilt-receipt' | 'prebuilt-invoice',
): Promise<ReturnType<typeof normalizeAzureResult>> {
  const endpoint = (Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT') ?? '').replace(/\/+$/, '');
  const key = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY') ?? '';
  if (!endpoint || !key) {
    throw new Error(
      'Azure Document Intelligence is not configured. Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY.',
    );
  }

  const analyzeUrl =
    `${endpoint}/documentintelligence/documentModels/${model}:analyze` +
    '?_overload=analyzeDocument&api-version=2024-11-30&locale=pt-PT&features=ocrHighResolution,barcodes';
  const analyzeResponse = await fetch(analyzeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': key,
    },
    body: JSON.stringify({ base64Source }),
  });
  if (!analyzeResponse.ok) {
    throw new Error(`Azure analysis request failed (${analyzeResponse.status}): ${await analyzeResponse.text()}`);
  }
  const operationLocation = analyzeResponse.headers.get('Operation-Location');
  if (!operationLocation) throw new Error('Azure did not return an operation location.');

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, attempt < 3 ? 500 : 1000));
    const resultResponse = await fetch(operationLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': key },
    });
    if (!resultResponse.ok) {
      throw new Error(`Azure result request failed (${resultResponse.status}): ${await resultResponse.text()}`);
    }
    const result = await resultResponse.json() as AzureAnalyzeResult;
    if (result.status === 'succeeded') return normalizeAzureResult(result, model);
    if (result.status === 'failed') throw new Error(result.error?.message ?? 'Azure document analysis failed.');
  }
  throw new Error('Azure document analysis timed out.');
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json() as RequestBody;
    const authorization = await authorize(body, req);
    if ('error' in authorization) return authorization.error;
    if (!body.base64_source) return jsonResponse({ error: 'Document content is required' }, 400);
    if (!body.mime_type?.match(/^(image\/(jpeg|jpg|png|webp|heif|tiff)|application\/pdf)$/)) {
      return jsonResponse({ error: 'Only JPG, PNG, WebP, HEIF, TIFF, and PDF files are supported' }, 400);
    }

    const documentType = body.document_type ?? 'auto';
    if (documentType === 'receipt') {
      return jsonResponse(await analyzeWithAzure(body.base64_source, 'prebuilt-receipt'));
    }
    if (documentType === 'invoice') {
      return jsonResponse(await analyzeWithAzure(body.base64_source, 'prebuilt-invoice'));
    }

    const receipt = await analyzeWithAzure(body.base64_source, 'prebuilt-receipt');
    if (receipt.lines.length > 0 && receipt.confidence >= 0.45) return jsonResponse(receipt);
    const invoice = await analyzeWithAzure(body.base64_source, 'prebuilt-invoice');
    return jsonResponse(invoice.lines.length >= receipt.lines.length ? invoice : receipt);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Document extraction failed',
    }, 500);
  }
});
