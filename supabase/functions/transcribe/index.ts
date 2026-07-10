// transcribe — in-app voice input for the assistant.
// Accepts an audio blob (raw request body), transcribes it with Soniox (hinted
// to Portuguese/Spanish, auto-detected), and returns { text }. Same owner/admin
// auth as the assistant. GDPR: the audio + transcription are deleted from Soniox
// immediately after the text is read, so no voice data is retained at the processor.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const ALLOWED_ROLES = new Set(['owner', 'admin']);
const MAX_BYTES = 16 * 1024 * 1024; // 16 MB — plenty for a spoken question

async function transcribeWithSoniox(bytes: Uint8Array, mime: string, apiKey: string): Promise<string> {
  const base = 'https://api.soniox.com';
  const auth = { Authorization: `Bearer ${apiKey}` };
  const ext = mime.includes('ogg') ? 'ogg'
    : mime.includes('webm') ? 'webm'
    : mime.includes('mpeg') || mime.includes('mp3') ? 'mp3'
    : mime.includes('mp4') || mime.includes('m4a') ? 'm4a'
    : mime.includes('wav') ? 'wav' : 'audio';
  const fd = new FormData();
  fd.append('file', new Blob([bytes], { type: mime }), `voice.${ext}`);
  const up = await fetch(`${base}/v1/files`, { method: 'POST', headers: auth, body: fd });
  if (!up.ok) { console.error('soniox upload failed', up.status, await up.text()); return ''; }
  const fileId = (await up.json()).id;
  const cr = await fetch(`${base}/v1/transcriptions`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'stt-async-preview', file_id: fileId, language_hints: ['pt', 'es'] }),
  });
  if (!cr.ok) {
    console.error('soniox create failed', cr.status, await cr.text());
    fetch(`${base}/v1/files/${fileId}`, { method: 'DELETE', headers: auth }).catch(() => {});
    return '';
  }
  const tid = (await cr.json()).id;
  let text = '';
  try {
    for (let i = 0; i < 25; i++) {
      const st = await (await fetch(`${base}/v1/transcriptions/${tid}`, { headers: auth })).json();
      if (st.status === 'completed') {
        const tr = await (await fetch(`${base}/v1/transcriptions/${tid}/transcript`, { headers: auth })).json();
        text = (tr.text ?? '').trim();
        break;
      }
      if (st.status === 'error') { console.error('soniox error', st.error_type, st.error_message); break; }
      await new Promise((r) => setTimeout(r, 1200));
    }
  } finally {
    fetch(`${base}/v1/transcriptions/${tid}`, { method: 'DELETE', headers: auth }).catch(() => {});
    fetch(`${base}/v1/files/${fileId}`, { method: 'DELETE', headers: auth }).catch(() => {});
  }
  return text;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const sonioxKey = Deno.env.get('SONIOX_API_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server not configured' }, 500);
  if (!sonioxKey) return json({ error: 'Voice input is not configured (missing SONIOX_API_KEY)' }, 500);

  const admin = createClient(supabaseUrl, serviceKey);

  // --- auth: verified JWT -> owner/admin only (same gate as the assistant) ---
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Sign in required' }, 401);
  const { data: userData } = await admin.auth.getUser(authHeader.slice(7));
  const user = userData.user;
  if (!user) return json({ error: 'Invalid session' }, 401);
  const appRole = user.app_metadata?.app_role;
  if (typeof appRole !== 'string' || !ALLOWED_ROLES.has(appRole)) {
    return json({ error: 'Voice input is available to owners and admins only.' }, 403);
  }

  // --- audio in -> text out ---
  const mime = req.headers.get('content-type') || 'audio/webm';
  const buf = new Uint8Array(await req.arrayBuffer());
  if (!buf.length) return json({ error: 'No audio received.' }, 400);
  if (buf.length > MAX_BYTES) return json({ error: 'Audio is too long.' }, 413);

  try {
    const text = await transcribeWithSoniox(buf, mime, sonioxKey);
    if (!text) return json({ error: "Couldn't understand the audio. Please try again." }, 422);
    return json({ text });
  } catch (e) {
    console.error('transcribe error', e);
    return json({ error: 'Transcription failed. Please try again.' }, 502);
  }
});
