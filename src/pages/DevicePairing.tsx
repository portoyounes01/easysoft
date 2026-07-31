import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QrCode, MonitorSmartphone, HelpCircle, Loader2, CheckCircle2, AlertCircle, KeyRound, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PairingButton } from '../components/ui/PairingButton';
import i18n from '../i18n';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { saveDevicePairingScope, hasDevicePairingScope } from '../utils/devicePairingStorage';
import { isTillHost } from '../lib/host';
import { useDesignSystem2VisualStyleSafe } from '../contexts/DesignSystem2CustomizationContext';
import '../styles/design-system-2-scope.css';

// Tills are Electron-only (multi-tenant-plan A5): a browser must not redeem a pairing
// code and become a phantom "till" (no hardware, and it would burn the one-time code).
// Dev builds stay exempt so the browser POS flows remain testable locally.
const canPairHere = isTillHost || import.meta.env.DEV;

type PairStatus = 'idle' | 'pairing' | 'success' | 'error';

// Map the pair-device edge function's machine-readable error codes to operator-facing text.
function friendlyError(code: string): string {
  switch (code) {
    case 'invalid_code': return i18n.t('devicePairing.errors.invalidCode');
    case 'code_expired': return i18n.t('devicePairing.errors.codeExpired');
    case 'code_already_used': return i18n.t('devicePairing.errors.codeAlreadyUsed');
    case 'too_many_attempts': return i18n.t('devicePairing.errors.tooManyAttempts');
    case 'device_revoked': return i18n.t('devicePairing.errors.deviceRevoked');
    case 'missing_code': return i18n.t('devicePairing.errors.missingCode');
    default: return i18n.t('devicePairing.errors.generic');
  }
}

const DevicePairing: React.FC = () => {
  // 1. Hooks
  const { t } = useTranslation();
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
      const url = `${supabaseUrl}/functions/v1/pair-device`;
      const anon = supabaseAnonKey;
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
      if (sessErr) throw new Error(t('devicePairing.errors.sessionNotEstablished'));
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
  if (!canPairHere) {
    return (
      <div className="ds2-visual-scope min-h-screen bg-gray-50 py-10" style={visualStyle}>
        <div className="max-w-2xl mx-auto px-6 pt-16">
          <div className="bg-white rounded-3xl shadow-2xl p-10 text-center">
            <MonitorSmartphone className="w-14 h-14 mx-auto mb-5 text-gray-400" />
            <h1 className="text-4xl font-bold text-gray-900 mb-3">{t('devicePairing.tillOnlyTitle')}</h1>
            <p className="text-gray-600 text-lg">
              {t('devicePairing.tillOnlyBody')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const pairing = status === 'pairing';
  return (
    <div className="ds2-visual-scope min-h-screen bg-gray-50 py-10" style={visualStyle}>
      <div className="max-w-2xl mx-auto px-6">
        <div className="text-center mb-10">
          <h1 className="text-6xl font-bold text-gray-900 mb-3">{t('devicePairing.pairTillTitle')}</h1>
          <p className="text-gray-600 text-lg">{t('devicePairing.pairTillSubtitle')}</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-8 space-y-8">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xl font-semibold text-gray-800">
              <KeyRound className="w-6 h-6 text-blue-600" /> {t('devicePairing.codeLabel')}
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
              <MonitorSmartphone className="w-6 h-6 text-emerald-600" /> {t('devicePairing.deviceName')} <span className="text-base font-normal text-gray-400">{t('common.optionalInParens')}</span>
            </label>
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              className="w-full min-h-touch text-xl border border-gray-300 rounded-2xl px-4 focus:outline-none focus:ring-4 focus:ring-emerald-200"
              placeholder={t('devices.tillNamePlaceholder')}
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
              <p className="text-green-700 text-lg font-medium">{t('devicePairing.successMessage')}</p>
            </div>
          )}

          <PairingButton
            variant="primary"
            label={pairing ? t('devicePairing.pairButtonBusy') : t('devicePairing.pairButton')}
            icon={pairing ? Loader2 : undefined}
            onClick={handlePair}
            disabled={pairing || status === 'success'}
            className={`w-full ${pairing ? '[&>svg]:animate-spin' : ''}`}
          />

          <div className="flex items-start gap-3 bg-blue-50 rounded-2xl p-4">
            <QrCode className="w-6 h-6 text-blue-600 mt-1 shrink-0" />
            <div>
              <p className="text-gray-800 text-lg font-semibold">{t('devicePairing.howItWorksTitle')}</p>
              <ul className="list-disc list-inside text-gray-600 text-base mt-1 space-y-1">
                <li>{t('devicePairing.howItWorksStep1')}</li>
                <li>{t('devicePairing.howItWorksStep2')}</li>
                <li>{t('devicePairing.howItWorksStep3')}</li>
              </ul>
            </div>
          </div>

          <div className="flex items-center gap-2 text-gray-600">
            <HelpCircle className="w-5 h-5" />
            <span className="text-base">{t('devicePairing.needHelpCode')}</span>
          </div>

          {/* A till that already holds pairing data may have landed here via "Re-pair this
              till" — give it a way back (the kiosk has no URL bar). */}
          {hasDevicePairingScope() && status !== 'success' && (
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="mx-auto flex min-h-touch items-center gap-2 rounded-2xl px-4 text-lg font-semibold text-gray-900 hover:bg-gray-100"
            >
              <ArrowLeft className="w-5 h-5" /> {t('devicePairing.backToSignIn')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DevicePairing;
