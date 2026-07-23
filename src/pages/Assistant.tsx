import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Send, Bot, User, RefreshCw, Lock, MessageCircle, Check, Copy, X, Mic, Square, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AssistantProvider, useAssistant } from '../contexts/AssistantContext';
import { assistantService, WhatsAppPairCode } from '../services/assistantService';
import { generateQRCodeImage } from '../utils/qrCode';
import { useDesignSystem2Customization } from '../contexts/DesignSystem2CustomizationContext';
import { AdminActionButton } from '../components/ui/AdminActionButton';
import { TableActionButton } from '../components/ui/TableActionButton';
import '../styles/design-system-2-scope.css';

// "Link WhatsApp" panel: shows linked status, and generates a pairing code the
// owner texts from their phone to the business WhatsApp number.
const WhatsAppLink: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState<{ phone_e164: string; verified_at: string }[]>([]);
  const [code, setCode] = useState<WhatsAppPairCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [justLinked, setJustLinked] = useState<string | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null);
  const baselineRef = useRef<Set<string>>(new Set());

  const fetchConnected = async () => {
    try { return await assistantService.getConnectedWhatsApp(); } catch { return null; }
  };
  const load = async () => { const list = await fetchConnected(); if (list) setConnected(list); };
  const toggle = async () => { const next = !open; setOpen(next); if (next) await load(); };
  const unlink = async (phone: string) => {
    try {
      await assistantService.unlinkWhatsApp(phone);
      if (justLinked === phone) setJustLinked(null);
      setConfirmUnlink(null);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to disconnect.'); setConfirmUnlink(null); }
  };
  const getCode = async () => {
    setBusy(true); setErr(null); setQr(null); setJustLinked(null);
    try {
      const c = await assistantService.getWhatsAppPairCode();
      baselineRef.current = new Set(connected.map((x) => x.phone_e164)); // numbers already linked before this code
      setCode(c);
      const digits = (c.business_number ?? '').replace(/\D/g, '');
      if (digits) {
        const waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(c.code)}`;
        try { setQr(await generateQRCodeImage(waUrl)); } catch { /* qr optional */ }
      }
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed.'); }
    finally { setBusy(false); }
  };

  // While a pairing code is on screen, poll for the new number to appear (the
  // webhook binds it server-side when the owner sends the code). The instant a
  // number that wasn't linked before shows up, flip straight to "Connected".
  useEffect(() => {
    if (!open || !code) return;
    let stopped = false;
    const id = setInterval(async () => {
      const list = await fetchConnected();
      if (stopped || !list) return;
      setConnected(list);
      const fresh = list.find((x) => !baselineRef.current.has(x.phone_e164));
      if (fresh) {
        setJustLinked(fresh.phone_e164);
        setCode(null); setQr(null);
        clearInterval(id);
      }
    }, 3000);
    return () => { stopped = true; clearInterval(id); };
  }, [open, code]);

  return (
    <div className="relative">
      <AdminActionButton variant="ghost" icon={MessageCircle} label="WhatsApp" onClick={toggle} className="text-sm" />
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-2xl shadow-xl p-4 z-20 text-sm">
          <p className="font-semibold text-gray-900 mb-1">Use the assistant on WhatsApp</p>
          {justLinked && (
            <div className="mb-3 flex items-start gap-2 bg-green-100 border border-green-300 rounded-xl px-3 py-2 text-green-800">
              <Check className="w-5 h-5 shrink-0 mt-0.5" />
              <span><b>Connected!</b> {justLinked} is now linked — ask it anything from WhatsApp.</span>
            </div>
          )}
          {connected.length > 0 ? (
            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-1">Connected numbers</p>
              <ul className="space-y-1">
                {connected.map((c) => (
                  <li key={c.phone_e164} className={`flex items-center gap-2 border rounded-xl px-2.5 py-2 ${c.phone_e164 === justLinked ? 'bg-green-100 border-green-300' : 'bg-green-50 border-green-200'}`}>
                    <Check className="w-4 h-4 text-green-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-green-800 leading-tight truncate">{c.phone_e164}</div>
                      <div className="text-[11px] text-green-600/70 leading-tight">Linked {new Date(c.verified_at).toLocaleDateString()}</div>
                    </div>
                    {confirmUnlink === c.phone_e164 ? (
                      <div className="shrink-0 flex items-center gap-1">
                        <button
                          onClick={() => unlink(c.phone_e164)}
                          className="text-xs font-semibold text-white bg-[var(--ds2-danger-solid,#dc2626)] hover:bg-[var(--ds2-danger-hover,#b91c1c)] px-2 py-1 rounded-xl transition-colors"
                        >
                          Remove
                        </button>
                        <button
                          onClick={() => setConfirmUnlink(null)}
                          className="text-xs font-medium text-gray-900 hover:bg-gray-100 px-1.5 py-1 rounded-2xl transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <TableActionButton
                        variant="delete"
                        icon={X}
                        label="Disconnect"
                        onClick={() => setConfirmUnlink(c.phone_e164)}
                        title="Disconnect this number"
                        aria-label="Disconnect"
                        className="shrink-0 gap-1 text-xs font-medium"
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-gray-500 mb-3">No numbers connected yet. Link your WhatsApp to ask about your business from your phone.</p>
          )}
          {!code ? (
            <button onClick={getCode} disabled={busy} className="w-full bg-gradient-primary hover:opacity-90 text-white rounded-xl py-2.5 font-semibold transition-opacity disabled:opacity-50">
              {busy ? 'Getting code…' : connected.length ? 'Link another number' : 'Get my pairing code'}
            </button>
          ) : (
            <div>
              <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 mb-2">
                <span className="font-mono text-lg font-bold tracking-widest">{code.code}</span>
                <button onClick={() => { navigator.clipboard?.writeText(code.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="p-2 hover:bg-gray-100 text-gray-700 rounded-2xl">
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <ol className="list-decimal pl-5 space-y-1 text-gray-600">
                <li>Open WhatsApp on your phone.</li>
                <li>Send this code{code.business_number ? <> to <b>{code.business_number}</b></> : ' to the business WhatsApp number'}.</li>
                <li>This panel switches to <b>Connected</b> on its own — no need to refresh.</li>
              </ol>
              {qr && (
                <div className="mt-3 text-center border-t border-gray-100 pt-3">
                  <p className="text-xs text-gray-500 mb-2">📱 Or scan this to open WhatsApp with the code ready — just press send:</p>
                  <img src={qr} alt="Scan to link WhatsApp" className="mx-auto w-40 h-40 rounded-lg border border-gray-200" />
                </div>
              )}
              <div className="mt-3 flex items-center justify-center gap-2 text-xs text-green-700">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Waiting for your code… linking happens automatically.
              </div>
              <p className="text-xs text-gray-400 mt-1.5 text-center">Code expires in {code.expires_in_minutes} minutes.</p>
            </div>
          )}
          {err && <p className="text-red-600 text-xs mt-2">{err}</p>}
        </div>
      )}
    </div>
  );
};

// Styled renderers so the assistant's markdown (tables, lists, bold, images)
// looks clean in the chat bubble.
const md = {
  p: (p: any) => <p className="mb-2 last:mb-0" {...p} />,
  ul: (p: any) => <ul className="list-disc pl-5 mb-2 space-y-1" {...p} />,
  ol: (p: any) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...p} />,
  strong: (p: any) => <strong className="font-semibold" {...p} />,
  a: (p: any) => <a className="text-blue-600 underline" target="_blank" rel="noreferrer" {...p} />,
  code: (p: any) => <code className="bg-gray-100 rounded px-1 py-0.5 text-[0.85em]" {...p} />,
  img: (p: any) => <img className="max-w-full rounded-lg border border-gray-200 my-2" loading="lazy" {...p} />,
  h1: (p: any) => <h3 className="font-semibold text-base mt-1 mb-1" {...p} />,
  h2: (p: any) => <h3 className="font-semibold text-base mt-1 mb-1" {...p} />,
  h3: (p: any) => <h4 className="font-semibold mt-1 mb-1" {...p} />,
  table: (p: any) => <div className="overflow-x-auto my-2"><table className="w-full text-sm border-collapse" {...p} /></div>,
  th: (p: any) => <th className="border border-gray-200 px-2 py-1 bg-gray-50 text-left font-semibold" {...p} />,
  td: (p: any) => <td className="border border-gray-200 px-2 py-1" {...p} />,
};

const AssistantInner: React.FC = () => {
  const { t } = useTranslation();
  const { messages, loading, error, ask, reset } = useAssistant();
  const { visualStyle, prefs } = useDesignSystem2Customization();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Voice input (mic -> Soniox -> text in the composer)
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  };

  const startRecording = async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stopStream();
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        chunksRef.current = [];
        if (blob.size < 1200) return; // ignore an accidental tap
        setTranscribing(true);
        try {
          const text = await assistantService.transcribe(blob);
          if (text) setInput((prev) => (prev ? prev.trim() + ' ' : '') + text);
        } catch (e) {
          setMicError(e instanceof Error ? e.message : 'Could not transcribe. Please try again.');
        } finally {
          setTranscribing(false);
        }
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
    } catch {
      setMicError('Microphone access was blocked. Allow it in your browser to use voice input.');
    }
  };

  const stopRecording = () => {
    try { recorderRef.current?.stop(); } catch { /* ignore */ }
    recorderRef.current = null;
    setRecording(false);
  };

  const toggleMic = () => {
    if (transcribing) return;
    if (recording) stopRecording();
    else void startRecording();
  };

  // clean up the mic if the user leaves mid-recording
  useEffect(() => () => { try { recorderRef.current?.stop(); } catch { /* ignore */ } stopStream(); }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const submit = (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput('');
    void ask(q);
  };

  const examples = t('assistant.examples', { returnObjects: true }) as string[];
  const isEmpty = messages.length === 0;

  return (
    <div className="ds2-visual-scope flex flex-col h-full max-w-3xl mx-auto w-full" style={visualStyle} data-ds2-neutral={prefs.neutralFamilyId}>
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-4">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-primary rounded-2xl p-2.5 text-white">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{t('assistant.title')}</h1>
            <p className="text-sm text-gray-500">{t('assistant.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <WhatsAppLink />
          {!isEmpty && (
            <AdminActionButton
              variant="ghost"
              icon={RefreshCw}
              label={t('assistant.newChat')}
              onClick={reset}
              className="text-sm"
            />
          )}
        </div>
      </div>

      {/* Read-only reassurance */}
      <div className="mx-2 mb-3 flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
        <Lock className="w-3.5 h-3.5 shrink-0" />
        <span>{t('assistant.readOnlyNote')}</span>
      </div>

      {/* Thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 space-y-4">
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-10">
            <div className="bg-gray-100 rounded-full p-4 mb-4">
              <Bot className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-lg font-medium text-gray-700">{t('assistant.empty.title')}</p>
            <p className="text-sm text-gray-500 mb-6">{t('assistant.empty.hint')}</p>
            <div className="grid sm:grid-cols-2 gap-3 w-full max-w-xl">
              {Array.isArray(examples) && examples.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => submit(ex)}
                  className="text-left text-sm bg-white border border-gray-200 rounded-2xl px-4 py-3 hover:bg-gray-50 transition-all min-h-touch-sm"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`shrink-0 rounded-full p-2 h-9 w-9 flex items-center justify-center ${m.role === 'user' ? 'bg-gray-200 text-gray-700' : 'bg-gradient-primary text-white'}`}>
                {m.role === 'user' ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
              </div>
              <div
                className={`rounded-2xl px-4 py-3 max-w-[80%] leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-gradient-primary text-white whitespace-pre-wrap'
                    : 'bg-white border border-gray-200 text-gray-800 shadow-sm text-sm'
                }`}
              >
                {m.role === 'user'
                  ? m.content
                  : <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>{m.content}</ReactMarkdown>}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex gap-3">
            <div className="shrink-0 rounded-full p-2 h-9 w-9 flex items-center justify-center bg-gradient-primary text-white">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="rounded-2xl px-4 py-3 bg-white border border-gray-200 shadow-sm text-gray-400 flex items-center gap-1">
              <span className="animate-pulse">{t('assistant.thinking')}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-red-700 text-sm">{error}</div>
        )}
      </div>

      {/* Composer */}
      <div className="p-2 pt-3">
        {(micError || recording || transcribing) && (
          <div className={`mx-1 mb-2 text-xs px-3 py-1.5 rounded-lg ${micError ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
            {micError
              ? micError
              : recording
                ? <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> {t('assistant.listening')}</span>
                : <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('assistant.transcribing')}</span>}
          </div>
        )}
        <div className="flex items-end gap-2 bg-white border border-gray-300 rounded-2xl p-2 shadow-sm focus-within:ring-1 focus-within:ring-green-500 focus-within:border-green-500 transition-all">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            rows={1}
            placeholder={recording ? t('assistant.listening') : transcribing ? t('assistant.transcribing') : t('assistant.placeholder')}
            className="flex-1 resize-none max-h-40 bg-transparent px-2 py-2 focus:outline-none text-gray-900 placeholder-gray-400"
          />
          <button
            onClick={toggleMic}
            disabled={loading || transcribing}
            aria-label={recording ? t('assistant.stopVoice') : t('assistant.voice')}
            title={recording ? t('assistant.stopVoice') : t('assistant.voice')}
            className={`rounded-xl p-3 transition-colors min-h-touch-xs disabled:opacity-40 ${
              recording ? 'bg-red-500 text-white animate-pulse'
                : transcribing ? 'bg-gray-100 text-gray-400'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {transcribing ? <Loader2 className="w-5 h-5 animate-spin" /> : recording ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <button
            onClick={() => submit()}
            disabled={loading || !input.trim()}
            aria-label={t('assistant.send')}
            className="bg-gradient-primary text-white rounded-xl p-3 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity min-h-touch-xs"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

const Assistant: React.FC = () => (
  <AssistantProvider>
    <AssistantInner />
  </AssistantProvider>
);

export default Assistant;
