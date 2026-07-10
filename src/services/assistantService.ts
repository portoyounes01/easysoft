// Calls the read-only AI assistant edge function + the WhatsApp pairing helper.
// Mirrors the fetch + session pattern in purchaseReceiptService.ts.
import { supabase } from '../lib/supabase';

export interface AssistantResponse {
  answer: string;
  conversation_id: string | null;
}

export interface WhatsAppPairCode {
  code: string;
  expires_in_minutes: number;
  business_number: string | null;
}

async function authedFetch(fnName: string, body: unknown) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.access_token) {
    throw new Error('Your session has expired. Please sign in again.');
  }
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON ?? '',
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error((payload as { error?: string }).error || 'Request failed.');
  return payload;
}

class AssistantService {
  async ask(question: string, conversationId?: string | null): Promise<AssistantResponse> {
    const trimmed = question.trim();
    if (!trimmed) throw new Error('Ask a question.');
    return authedFetch('assistant', { question: trimmed, conversation_id: conversationId ?? undefined }) as Promise<AssistantResponse>;
  }

  /** Transcribe a recorded voice clip (in-app mic) to text via Soniox (PT/ES). */
  async transcribe(audio: Blob): Promise<string> {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.access_token) {
      throw new Error('Your session has expired. Please sign in again.');
    }
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': audio.type || 'audio/webm',
        apikey: import.meta.env.VITE_SUPABASE_ANON ?? '',
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
      body: audio,
    });
    const payload = await res.json();
    if (!res.ok) throw new Error((payload as { error?: string }).error || 'Transcription failed.');
    return (payload as { text?: string }).text ?? '';
  }

  /** Owner requests a WhatsApp pairing code to text from their phone (Phase 2). */
  async getWhatsAppPairCode(): Promise<WhatsAppPairCode> {
    return authedFetch('whatsapp-pair-code', {}) as Promise<WhatsAppPairCode>;
  }

  /** All WhatsApp numbers connected to this business (RLS: owner/admin, own tenant). */
  async getConnectedWhatsApp(): Promise<{ phone_e164: string; verified_at: string }[]> {
    const { data } = await supabase
      .from('owner_whatsapp_numbers')
      .select('phone_e164, verified_at')
      .order('verified_at', { ascending: false });
    return (data as { phone_e164: string; verified_at: string }[] | null) ?? [];
  }

  /** Unlink (disconnect) a WhatsApp number from this business. */
  async unlinkWhatsApp(phoneE164: string): Promise<void> {
    const { error } = await supabase.from('owner_whatsapp_numbers').delete().eq('phone_e164', phoneE164);
    if (error) throw new Error(error.message);
  }
}

export const assistantService = new AssistantService();
