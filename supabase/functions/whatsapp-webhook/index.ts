// whatsapp-webhook — Meta WhatsApp Cloud API webhook for the AI assistant.
//   GET  : Meta verification handshake (hub.challenge).
//   POST : inbound messages. Verifies the X-Hub-Signature-256 HMAC, resolves the
//          sender's number to a tenant (or runs the pairing flow for unknown
//          numbers), then answers with the SAME assistant core used in-app
//          (read-only, tenant-scoped, PII-safe) in plain-text WhatsApp mode.
// verify_jwt=false — Meta calls this with no Supabase session; the HMAC signature
// is the authenticity check.
//
// NOTE: brute-force / flood rate-limiting per sender is not implemented yet
// (flagged, like pwa-login). Add per-number throttling before heavy use.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { runAssistant } from '../assistant/core.ts';
import { PiiVault } from '../assistant/pii.ts';
import type { ToolContext } from '../assistant/tools.ts';

const MAX_ATTEMPTS = 8;

function lisbonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
}
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, '0')).join('');
}
async function verifySignature(raw: string, secret: string, header: string | null): Promise<boolean> {
  if (!header || !header.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  const hex = Array.from(new Uint8Array(sig), (x) => x.toString(16).padStart(2, '0')).join('');
  const provided = header.slice(7);
  if (provided.length !== hex.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= provided.charCodeAt(i) ^ hex.charCodeAt(i);
  return diff === 0;
}
async function sendText(phoneNumberId: string, token: string, to: string, body: string) {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: body.slice(0, 4000) } }),
    });
    if (!res.ok) console.error('sendText non-ok', res.status, await res.text());
  } catch (e) {
    console.error('sendText failed', e);
  }
}

// Download a WhatsApp media object (voice note / audio) by its media id.
// Meta returns a short-lived URL that must itself be fetched with the token.
async function fetchWhatsAppMedia(mediaId: string, token: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  try {
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!metaRes.ok) { console.error('media meta fetch failed', metaRes.status, await metaRes.text()); return null; }
    const meta = await metaRes.json();
    const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!binRes.ok) { console.error('media download failed', binRes.status); return null; }
    return { bytes: new Uint8Array(await binRes.arrayBuffer()), mime: meta.mime_type ?? 'audio/ogg' };
  } catch (e) { console.error('fetchWhatsAppMedia error', e); return null; }
}

// Transcribe audio with Soniox (async file API), hinted to Portuguese/Spanish.
// GDPR: the file + transcription are deleted from Soniox right after we read the text.
async function transcribeWithSoniox(bytes: Uint8Array, mime: string, apiKey: string): Promise<string> {
  const base = 'https://api.soniox.com';
  const auth = { Authorization: `Bearer ${apiKey}` };
  const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mpeg') || mime.includes('mp3') ? 'mp3' : mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : 'audio';
  const fd = new FormData();
  fd.append('file', new Blob([bytes], { type: mime }), `wa_voice.${ext}`);
  const up = await fetch(`${base}/v1/files`, { method: 'POST', headers: auth, body: fd });
  if (!up.ok) { console.error('soniox upload failed', up.status, await up.text()); return ''; }
  const fileId = (await up.json()).id;
  const cr = await fetch(`${base}/v1/transcriptions`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'stt-async-preview', file_id: fileId, language_hints: ['pt', 'es'] }),
  });
  if (!cr.ok) { console.error('soniox create failed', cr.status, await cr.text()); fetch(`${base}/v1/files/${fileId}`, { method: 'DELETE', headers: auth }).catch(() => {}); return ''; }
  const tid = (await cr.json()).id;
  let text = '';
  try {
    for (let i = 0; i < 20; i++) {
      const st = await (await fetch(`${base}/v1/transcriptions/${tid}`, { headers: auth })).json();
      if (st.status === 'completed') {
        const tr = await (await fetch(`${base}/v1/transcriptions/${tid}/transcript`, { headers: auth })).json();
        text = (tr.text ?? '').trim();
        break;
      }
      if (st.status === 'error') { console.error('soniox error', st.error_type, st.error_message); break; }
      await new Promise((r) => setTimeout(r, 1500));
    }
  } finally {
    fetch(`${base}/v1/transcriptions/${tid}`, { method: 'DELETE', headers: auth }).catch(() => {});
    fetch(`${base}/v1/files/${fileId}`, { method: 'DELETE', headers: auth }).catch(() => {});
  }
  return text;
}

Deno.serve(async (req: Request) => {
  const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';
  const APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') ?? '';
  const TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? '';

  // --- Meta verification handshake ---
  if (req.method === 'GET') {
    const u = new URL(req.url);
    if (u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === VERIFY_TOKEN) {
      return new Response(u.searchParams.get('hub.challenge') ?? '', { status: 200 });
    }
    return new Response('forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });

  const raw = await req.text();
  if (!APP_SECRET || !(await verifySignature(raw, APP_SECRET, req.headers.get('x-hub-signature-256')))) {
    return new Response('bad_signature', { status: 401 });
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  const admin = createClient(url, serviceKey);

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return new Response('ok', { status: 200 }); }

  const messages: Array<{ value: any; msg: any }> = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        if (msg.type === 'text' || msg.type === 'audio') messages.push({ value: change.value, msg });
      }
    }
  }

  const sonioxKey = Deno.env.get('SONIOX_API_KEY') ?? '';

  const processAll = async () => {
    for (const { value, msg } of messages) {
      const phoneNumberId = value?.metadata?.phone_number_id || Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
      const from: string = msg.from; // digits, no '+'
      const phoneE164 = `+${from}`;

      try {
        // Resolve the user's question — typed text, or a voice note transcribed via Soniox (PT/ES).
        let text = '';
        if (msg.type === 'text') {
          text = (msg.text?.body ?? '').trim();
        } else if (msg.type === 'audio') {
          const media = msg.audio?.id ? await fetchWhatsAppMedia(msg.audio.id, TOKEN) : null;
          if (media && sonioxKey) text = (await transcribeWithSoniox(media.bytes, media.mime, sonioxKey)).trim();
          if (!text) {
            await sendText(phoneNumberId, TOKEN, from, "Sorry, I couldn't understand that voice message. Please type your question or try recording again.");
            continue;
          }
        }
        if (!text) continue;

        // 1) known number? -> answer
        const { data: reg } = await admin
          .from('owner_whatsapp_numbers').select('tenant_id, user_id').eq('phone_e164', phoneE164).maybeSingle();

        if (reg?.tenant_id) {
          const { data: tenant } = await admin.from('tenants').select('name, legal_name').eq('id', reg.tenant_id).maybeSingle();
          const vault = new PiiVault();
          const ctx: ToolContext = { admin, tenantId: reg.tenant_id, vault };
          const result = await runAssistant({
            apiKey: anthropicKey, todayIso: lisbonToday(),
            businessName: tenant?.name ?? tenant?.legal_name ?? undefined,
            history: [], question: text, ctx, channel: 'whatsapp',
          });
          await sendText(phoneNumberId, TOKEN, from, vault.rehydrate(result.answer));
          try {
            await admin.from('assistant_audit_log').insert({
              tenant_id: reg.tenant_id, user_id: reg.user_id, channel: 'whatsapp', question: text, tools_used: result.toolsUsed,
            });
          } catch (_) { /* audit is best-effort, never break the reply */ }
          continue;
        }

        // 2) unknown number -> maybe a pairing code
        const candidate = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (candidate.length >= 5 && candidate.length <= 10) {
          const codeHash = await sha256Hex(candidate);
          const { data: pc } = await admin
            .from('owner_whatsapp_pairing_codes')
            .select('id, user_id, tenant_id, expires_at, used_at, attempt_count')
            .eq('code_hash', codeHash).maybeSingle();
          if (pc && !pc.used_at && new Date(pc.expires_at) > new Date() && pc.attempt_count < MAX_ATTEMPTS) {
            await admin.from('owner_whatsapp_numbers').upsert({ phone_e164: phoneE164, user_id: pc.user_id, tenant_id: pc.tenant_id });
            await admin.from('owner_whatsapp_pairing_codes').update({ used_at: new Date().toISOString() }).eq('id', pc.id);
            await sendText(phoneNumberId, TOKEN, from, '✅ Your WhatsApp is now linked! Ask me anything about your business — for example: "How much did I sell today?"');
            continue;
          }
          if (pc && !pc.used_at) {
            await admin.from('owner_whatsapp_pairing_codes').update({ attempt_count: (pc.attempt_count ?? 0) + 1 }).eq('id', pc.id);
          }
        }

        await sendText(phoneNumberId, TOKEN, from,
          'Your number isn\'t linked yet. In the app open Assistant → "Link WhatsApp" to get a code, then send that code here to connect.');
      } catch (e) {
        console.error('whatsapp handler error', e);
        await sendText(phoneNumberId, TOKEN, from, 'Sorry, something went wrong. Please try again in a moment.');
      }
    }
  };

  // Meta expects a fast 200; transcription + the model can take several seconds.
  // Ack immediately and keep working in the background so Meta doesn't retry (double-reply).
  // @ts-ignore EdgeRuntime is provided by the Supabase edge runtime
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(processAll());
  else await processAll();
  return new Response('ok', { status: 200 });
});
