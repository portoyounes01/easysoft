// AI assistant backend (Phase 1, in-app).
//
// Auth mirrors extract-purchase-document: verify the JWT, read the
// server-controlled app_metadata claims, and require an owner/admin human.
// The resolved tenant_id is the ONLY tenant the curated read RPCs will ever
// see — a prompt-injected message cannot widen it. The model is reached via
// the channel-agnostic core (core.ts); the same core will back the Phase 2
// WhatsApp webhook.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { runAssistant } from './core.ts';
import { PiiVault } from './pii.ts';
import type { ToolContext } from './tools.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Only human owners/admins may use the assistant (reporting-capable, non-till).
const ALLOWED_ROLES = new Set(['owner', 'admin']);
const MAX_QUESTION_LEN = 2000;

function lisbonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server not configured' }, 500);
  if (!anthropicKey) return json({ error: 'Assistant is not configured (missing ANTHROPIC_API_KEY)' }, 500);

  const admin = createClient(supabaseUrl, serviceKey);

  // --- auth: verified JWT -> tenant + role ---
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Sign in required' }, 401);
  const { data: userData } = await admin.auth.getUser(authHeader.slice(7));
  const user = userData.user;
  if (!user) return json({ error: 'Invalid session' }, 401);

  const tenantId = user.app_metadata?.tenant_id;
  const appRole = user.app_metadata?.app_role;
  if (typeof tenantId !== 'string' || !tenantId) return json({ error: 'Tenant claim required' }, 403);
  if (typeof appRole !== 'string' || !ALLOWED_ROLES.has(appRole)) {
    return json({ error: 'The assistant is available to owners and admins only.' }, 403);
  }

  // --- request ---
  let body: { question?: string; conversation_id?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  const question = (body.question ?? '').trim();
  if (!question) return json({ error: 'Ask a question.' }, 400);
  if (question.length > MAX_QUESTION_LEN) return json({ error: 'Question is too long.' }, 400);

  // --- business name for the prompt (best-effort) ---
  const { data: tenant } = await admin
    .from('tenants').select('name, legal_name').eq('id', tenantId).maybeSingle();
  const businessName = tenant?.name ?? tenant?.legal_name ?? undefined;

  // --- run the model over the curated read-only tools ---
  const vault = new PiiVault();
  const ctx: ToolContext = { admin, tenantId, vault };
  let answer: string;
  let toolsUsed: string[] = [];
  try {
    const result = await runAssistant({
      apiKey: anthropicKey,
      todayIso: lisbonToday(),
      businessName,
      history: [], // Phase 1: stateless to the model (see index.ts header note)
      question,
      ctx,
    });
    // Re-hydrate pseudonyms -> real names for the owner's eyes only.
    answer = vault.rehydrate(result.answer);
    toolsUsed = result.toolsUsed;
  } catch (e) {
    console.error('assistant error', e);
    return json({ error: 'The assistant could not answer right now. Please try again.' }, 502);
  }

  // --- persist conversation + audit (best-effort; never fail the answer) ---
  let conversationId = typeof body.conversation_id === 'string' ? body.conversation_id : null;
  try {
    if (conversationId) {
      const { data: conv } = await admin
        .from('assistant_conversations').select('id')
        .eq('id', conversationId).eq('tenant_id', tenantId).maybeSingle();
      if (!conv) conversationId = null;
    }
    if (!conversationId) {
      const { data: created } = await admin
        .from('assistant_conversations')
        .insert({ tenant_id: tenantId, user_id: user.id, channel: 'in_app', title: question.slice(0, 60) })
        .select('id').single();
      conversationId = created?.id ?? null;
    }
    if (conversationId) {
      await admin.from('assistant_messages').insert([
        { conversation_id: conversationId, tenant_id: tenantId, role: 'user', content: question },
        { conversation_id: conversationId, tenant_id: tenantId, role: 'assistant', content: answer },
      ]);
      await admin.from('assistant_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
    }
    await admin.from('assistant_audit_log').insert({
      tenant_id: tenantId, user_id: user.id, channel: 'in_app', question, tools_used: toolsUsed,
    });
  } catch (e) {
    console.error('assistant persist error', e);
  }

  return json({ answer, conversation_id: conversationId });
});
