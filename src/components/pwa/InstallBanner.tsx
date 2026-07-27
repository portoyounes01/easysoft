import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, X, Share, Plus } from 'lucide-react';
import { useInstall } from '../../hooks/useInstall';
import { AdminActionButton } from '../ui/AdminActionButton';

const DISMISS_KEY = 'pwa-install-dismissed';

// A compact, dismissible "Install app" prompt for the PWA (browser) host. On Chrome/Android
// it triggers the native install dialog; on iOS Safari (no programmatic install) it reveals
// the Share -> Add to Home Screen steps. Hidden once installed or dismissed for the session.
const InstallBanner: React.FC = () => {
  const { t } = useTranslation();
  const { installable, standalone, ios, promptInstall } = useInstall();
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === '1');
  const [showIosHelp, setShowIosHelp] = useState(false);

  // Nothing to offer: already installed, dismissed, or a browser that can't install (and not iOS).
  if (standalone || dismissed) return null;
  if (!installable && !ios) return null;

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ }
  };

  const onInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') dismiss();
  };

  return (
    <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
          <Download className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-950">{t('installBanner.title')}</p>
          <p className="text-xs text-emerald-800/80 truncate">
            {t('installBanner.blurb')}
          </p>
        </div>
        {installable ? (
          <AdminActionButton
            type="button"
            variant="primary"
            label={t('installBanner.install')}
            onClick={onInstall}
            className="flex-shrink-0 text-sm"
          />
        ) : (
          <AdminActionButton
            type="button"
            variant="outline"
            label={t('installBanner.how')}
            onClick={() => setShowIosHelp((v) => !v)}
            className="flex-shrink-0 text-sm"
          />
        )}
        <AdminActionButton
          type="button"
          variant="icon"
          icon={X}
          onClick={dismiss}
          aria-label={t('login.syncDegradedDismiss')}
          className="flex-shrink-0"
        />
      </div>

      {/* iOS: no programmatic install — show the manual steps. */}
      {ios && showIosHelp && (
        <div className="border-t border-emerald-200 px-4 py-3 text-sm text-emerald-900">
          <p className="mb-2 font-medium">{t('installBanner.iosStepsTitle')}</p>
          <ol className="space-y-1.5 text-emerald-800">
            <li className="flex items-center gap-2">
              <span className="font-semibold">1.</span> {t('installBanner.iosStep1')}
              <Share className="w-4 h-4 inline" />
            </li>
            <li className="flex items-center gap-2">
              <span className="font-semibold">2.</span> {t('installBanner.iosStep2')}
              <Plus className="w-4 h-4 inline" />
            </li>
            <li className="flex items-center gap-2">
              <span className="font-semibold">3.</span> {t('installBanner.iosStep3')}
            </li>
          </ol>
        </div>
      )}
    </div>
  );
};

export default InstallBanner;
