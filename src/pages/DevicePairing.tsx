import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QrCode, MonitorSmartphone, HelpCircle, Loader2, CheckCircle2, AlertCircle, KeyRound, ArrowLeft } from 'lucide-react';
import { PairingButton } from '../components/ui/PairingButton';
import { supabase } from '../lib/supabase';
import { saveDevicePairingScope, hasDevicePairingScope } from '../utils/devicePairingStorage';
import { useDesignSystem2VisualStyleSafe } from '../contexts/DesignSystem2CustomizationContext';
import '../styles/design-system-2-scope.css';

type PairStatus = 'idle' | 'pairing' | 'success' | 'error';

// Map the pair-device edge function's machine-readable error codes to operator-facing text.
function friendlyError(code: string): string {
  switch (code) {
    case 'invalid_code': return 'That pairing code is not valid. Check it and try again.';
    case 'code_expired': return 'This pairing code has expired. Ask your administrator for a new one.';
    case 'code_already_used': return 'This pairing code has already been used. Ask for a new one.';
    case 'too_many_attempts': return 'Too many attempts on this code. Ask your administrator for a new one.';
    case 'device_revoked': return 'This device has been revoked. Contact your administrator.';
    case 'missing_code': return 'Enter the pairing code from your administrator.';
    default: return 'Pairing failed. Please check the code and try again.';
  }
}

const DevicePairing: React.FC = () => {
  // 1. Hooks
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState(() => searchParams.get('code')?.trim().toUpperCase() ?? '');
  const [deviceName, setDeviceName] = useState('');
  const [status, setStatus] = useState<PairStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const visualStyle = useDesignSystem2VisualStyleSafe();

  // 2. Event handlers
  const handlePair = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { setError(friendlyError('missing_code')); setStatus('error'); return; }
    setStatus('pairing');
    setError(null);
    try {
      // pair-device is verify_jwt=false; the pairing code is the credential. Raw fetch so we
      // get the JSON body (and its error code) regardless of HTTP status.
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pair-device`;
      const anon = import.meta.env.VITE_SUPABASE_ANON ?? '';
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${anon}` },
        body: JSON.stringify({ code: trimmed, device_label: deviceName.trim() || undefined }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || !body?.access_token) {
        throw new Error(friendlyError(body?.error ?? 'pairing_failed'));
      }
      // Persist the device session (Supabase client persistSession -> localStorage; Electron
      // mirrors this into safeStorage — validated separately in the packaged app).
      const { error: sessErr } = await supabase.auth.setSession({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
      });
      if (sessErr) throw new Error('Paired, but could not establish the device session locally.');
      saveDevicePairingScope({
        tenantId: body.tenant_id,
        storeId: body.store_id,
        deviceId: body.device_id,
        pairedAt: new Date().toISOString(),
      });
      setStatus('success');
      // Reload so the module-level Dexie singleton opens the newly scoped DB.
      setTimeout(() => window.location.replace('/'), 900);
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : friendlyError('pairing_failed'));
    }
  };

  // 5. Render
  const pairing = status === 'pairing';
  return (
    <div className="ds2-visual-scope min-h-screen bg-gray-50 py-10" style={visualStyle}>
      <div className="max-w-2xl mx-auto px-6">
        <div className="text-center mb-10">
          <h1 className="text-6xl font-bold text-gray-900 mb-3">Pair this till</h1>
          <p className="text-gray-600 text-lg">Enter the pairing code from your administrator to connect this device.</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-8 space-y-8">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xl font-semibold text-gray-800">
              <KeyRound className="w-6 h-6 text-blue-600" /> Pairing code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => { setCode(e.target.value); if (status === 'error') setStatus('idle'); }}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="w-full min-h-touch text-2xl tracking-widest font-mono uppercase border border-gray-300 rounded-2xl px-4 focus:outline-none focus:ring-4 focus:ring-blue-200"
              placeholder="XXXX-XXXX-XXXX-…"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xl font-semibold text-gray-800">
              <MonitorSmartphone className="w-6 h-6 text-emerald-600" /> Device name <span className="text-base font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              className="w-full min-h-touch text-xl border border-gray-300 rounded-2xl px-4 focus:outline-none focus:ring-4 focus:ring-emerald-200"
              placeholder="e.g. Front Counter"
            />
          </div>

          {status === 'error' && error && (
            <div className="flex items-start gap-3 bg-red-50 border-2 border-red-200 rounded-2xl p-4" role="alert">
              <AlertCircle className="w-6 h-6 text-red-600 mt-0.5 shrink-0" />
              <p className="text-red-700 text-lg font-medium">{error}</p>
            </div>
          )}
          {status === 'success' && (
            <div className="flex items-start gap-3 bg-green-50 border-2 border-green-200 rounded-2xl p-4" role="status">
              <CheckCircle2 className="w-6 h-6 text-green-600 mt-0.5 shrink-0" />
              <p className="text-green-700 text-lg font-medium">Paired! Taking you to sign in…</p>
            </div>
          )}

          <PairingButton
            variant="primary"
            label={pairing ? 'Pairing…' : 'Pair device'}
            icon={pairing ? Loader2 : undefined}
            onClick={handlePair}
            disabled={pairing || status === 'success'}
            className={`w-full ${pairing ? '[&>svg]:animate-spin' : ''}`}
          />

          <div className="flex items-start gap-3 bg-blue-50 rounded-2xl p-4">
            <QrCode className="w-6 h-6 text-blue-600 mt-1 shrink-0" />
            <div>
              <p className="text-gray-800 text-lg font-semibold">How it works</p>
              <ul className="list-disc list-inside text-gray-600 text-base mt-1 space-y-1">
                <li>Your administrator provisions this till and gives you a one-time code.</li>
                <li>Enter the code above to connect the till to your business.</li>
                <li>After pairing, sign in with your employee PIN.</li>
              </ul>
            </div>
          </div>

          <div className="flex items-center gap-2 text-gray-600">
            <HelpCircle className="w-5 h-5" />
            <span className="text-base">Need help? Contact your administrator for a new pairing code.</span>
          </div>

          {/* A till that already holds pairing data may have landed here via "Re-pair this
              till" — give it a way back (the kiosk has no URL bar). */}
          {hasDevicePairingScope() && status !== 'success' && (
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="mx-auto flex min-h-touch items-center gap-2 rounded-2xl px-4 text-lg font-semibold text-gray-900 hover:bg-gray-100"
            >
              <ArrowLeft className="w-5 h-5" /> Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DevicePairing;
