// whatsapp-pair-code — the logged-in owner generates a short pairing code. They
// then send this code FROM their WhatsApp to the business number; the webhook
// matches it and binds that number to their tenant. Mirrors device pairing:
// only the sha256 hash is stored, the code expires, is single-use, attempt-capped.
// verify_jwt=true — only an authenticated owner/admin can request a code.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
const CODE_LEN = 6;
const TTL_MIN = 15;

function makeCode(): string {
  const b = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join('');
}
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !serviceKey) return json({ error: 'server_misconfigured' }, 500);
  const admin = createClient(url, serviceKey);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'sign_in_required' }, 401);
  const { data: userData } = await admin.auth.getUser(authHeader.slice(7));
  const user = userData.user;
  if (!user) return json({ error: 'invalid_session' }, 401);
  const tenantId = user.app_metadata?.tenant_id;
  const appRole = user.app_metadata?.app_role;
  if (typeof tenantId !== 'string' || !tenantId) return json({ error: 'tenant_required' }, 403);
  if (appRole !== 'owner' && appRole !== 'admin') return json({ error: 'owners_admins_only' }, 403);

  const code = makeCode();
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + TTL_MIN * 60_000).toISOString();

  // Invalidate the owner's previous unused codes, then insert the new one.
  await admin.from('owner_whatsapp_pairing_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', user.id).is('used_at', null);

  const { error } = await admin.from('owner_whatsapp_pairing_codes').insert({
    code_hash: codeHash, user_id: user.id, tenant_id: tenantId, expires_at: expiresAt,
  });
  if (error) return json({ error: 'could_not_create_code' }, 500);

  return json({
    code,
    expires_in_minutes: TTL_MIN,
    business_number: Deno.env.get('WHATSAPP_BUSINESS_NUMBER') ?? null, // for display in the UI
    instructions: 'Open WhatsApp and send this code to the business number to link your number.',
  });
});
