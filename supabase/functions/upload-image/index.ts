// Unified image upload helper function
// - Requires a paired device/human JWT and scopes employee lookup to its tenant
// - Checks inventory permission (admin/manager OR access_levels includes 'inventory' or 'all')
// - Returns a short-lived signed upload URL and a final public URL (if bucket is public) or a path
//
// Request: POST
//   Headers:
//     Content-Type: application/json
//   Body (JSON):
//     {
//       "employee_number": string,
//       "file_name": string,           // original filename to infer extension
//       "content_type": string         // mime type
//     }
//
// Response 200:
//     {
//       "uploadUrl": string,          // signed URL to PUT the bytes to
//       "path": string,                // storage path where the file will be stored
//       "expiresIn": number            // seconds until expiry
//     }
//
// Security notes:
// - Service role key is used only here on the server
// - We never return the service key to the client
// - We mint a signed upload URL for direct-to-storage upload to avoid proxying file bytes

import { createClient } from 'jsr:@supabase/supabase-js@2';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Json = Record<string, unknown> | null;

interface UploadRequestBody {
  employee_number?: string;
  employee_id?: string;
  file_name?: string;
  content_type?: string;
  path?: string;
}

interface EmployeeAuthorizationRow {
  id: string;
  is_active: boolean;
  role: string;
  access_levels: string[];
  employee_number: string;
}

const BUCKET_ID = 'product-images';
const SIGNED_EXPIRY_SECONDS = 5 * 60; // 5 minutes

function jsonResponse(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function badRequest(message: string) {
  return jsonResponse({ error: message }, 400);
}

function unauthorized(message = 'Unauthorized') {
  return jsonResponse({ error: message }, 401);
}

function forbidden(message = 'Forbidden') {
  return jsonResponse({ error: message }, 403);
}

function serverError(message: string) {
  return jsonResponse({ error: message }, 500);
}

// Basic filename sanitization
function sanitizeFileName(name: string): string {
  const trimmed = name.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
  return trimmed.length > 0 ? trimmed : `file_${Date.now()}`;
}

function inferExtension(name: string): string {
  const match = name.match(/\.[a-zA-Z0-9]+$/);
  return match ? match[0] : '';
}

function hasInventoryPermission(role: string, accessLevels: string[]): boolean {
  if (role === 'admin' || role === 'manager') return true;
  return accessLevels?.includes('all') || accessLevels?.includes('inventory');
}

function buildObjectPath(employeeId: string, fileName: string): string {
  const ext = inferExtension(fileName);
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return `products/${employeeId}/${unique}${ext}`;
}

function isAllowedContentType(ct: string | undefined): boolean {
  if (!ct) return false;
  return /^(image\/)(jpeg|jpg|png|gif|webp|svg\+xml)$/.test(ct);
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
};

async function handleUpload(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) {
    const res = serverError('Missing Supabase configuration');
    // attach CORS
    corsHeaders['Content-Type'] = 'application/json';
    return new Response(await res.text(), { status: 500, headers: corsHeaders });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  let body: UploadRequestBody;
  try {
    body = await req.json();
  } catch {
    const res = badRequest('Invalid JSON body');
    corsHeaders['Content-Type'] = 'application/json';
    return new Response(await res.text(), { status: 400, headers: corsHeaders });
  }

  const employeeNumber = (body.employee_number || '').toString();
  const employeeIdFromBody = (body.employee_id || '').toString();
  const fileName = sanitizeFileName((body.file_name || '').toString());
  const contentType = (body.content_type || '').toString();

  if (!employeeNumber && !employeeIdFromBody) return new Response(JSON.stringify({ error: 'employee_number or employee_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  // For DELETE, we expect a path to delete in file_name (re-using field) or a dedicated "path"
  const deletePath = body.path;
  if (req.method === 'DELETE') {
    const targetPath = deletePath || fileName;
    if (!targetPath) return new Response(JSON.stringify({ error: 'path required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    // continue to auth then delete at the bottom
  } else {
    if (!fileName) return badRequest('file_name is required');
    if (!isAllowedContentType(contentType)) return badRequest('Unsupported content_type');
  }

  let employee: EmployeeAuthorizationRow | null = null;
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return unauthorized('Bearer session required');
  const token = authHeader.slice(7);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return unauthorized('Invalid session');

  const tenantId = userData.user.app_metadata.tenant_id;
  const appRole = userData.user.app_metadata.app_role;
  if (typeof tenantId !== 'string' || !tenantId) return forbidden('Tenant claim required');

  if (appRole === 'device') {
    const deviceId = userData.user.app_metadata.device_id;
    if (typeof deviceId !== 'string' || !deviceId) return forbidden('Device claim required');
    const { data: device } = await admin
      .from('devices')
      .select('id')
      .eq('id', deviceId)
      .eq('tenant_id', tenantId)
      .eq('auth_user_id', userData.user.id)
      .eq('status', 'enrolled')
      .maybeSingle();
    if (!device) return forbidden('Device is not enrolled');
  }

  let employeeQuery = admin
    .from('employees')
    .select('id, is_active, role, access_levels, employee_number')
    .eq('tenant_id', tenantId);
  if (appRole === 'device') {
    employeeQuery = employeeIdFromBody
      ? employeeQuery.eq('id', employeeIdFromBody)
      : employeeQuery.eq('employee_number', employeeNumber);
  } else {
    employeeQuery = employeeQuery.eq('auth_id', userData.user.id);
  }
  const employeeResult = await employeeQuery.maybeSingle();
  if (employeeResult.error) return serverError(`Employee lookup failed: ${employeeResult.error.message}`);
  employee = employeeResult.data;

  if (!employee) return new Response(JSON.stringify({ error: 'Employee not found' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (!employee.is_active) return new Response(JSON.stringify({ error: 'Employee inactive' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (!hasInventoryPermission(employee.role, employee.access_levels)) {
    return new Response(JSON.stringify({ error: 'Missing inventory permission' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (req.method === 'DELETE') {
    const targetPath = deletePath || fileName; // file_name used as path alias
    const { error: delErr } = await admin.storage
      .from(BUCKET_ID)
      .remove([targetPath!]);
    if (delErr) {
      return new Response(JSON.stringify({ success: false, error: delErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ success: true, path: targetPath }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } else {
    // POST: create signed upload URL
    const objectPath = buildObjectPath(employee.id, fileName);
    const { data: signedData, error: signErr } = await admin.storage
      .from(BUCKET_ID)
      .createSignedUploadUrl(objectPath, { expiresIn: SIGNED_EXPIRY_SECONDS, contentType });

    if (signErr || !signedData) {
      return new Response(JSON.stringify({ error: `Failed to create signed upload URL: ${signErr?.message}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      uploadUrl: signedData.signedUrl,
      token: signedData.token,
      path: objectPath,
      expiresIn: SIGNED_EXPIRY_SECONDS
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

// Deno entrypoint
Deno.serve((req) => handleUpload(req));
