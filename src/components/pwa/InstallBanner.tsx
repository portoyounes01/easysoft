import React, { useState } from 'react';
import { Download, X, Share, Plus } from 'lucide-react';
import { useInstall } from '../../hooks/useInstall';

const DISMISS_KEY = 'pwa-install-dismissed';

// A compact, dismissible "Install app" prompt for the PWA (browser) host. On Chrome/Android
// it triggers the native install dialog; on iOS Safari (no programmatic install) it reveals
// the Share -> Add to Home Screen steps. Hidden once installed or dismissed for the session.
const InstallBanner: React.FC = () => {
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
          <p className="text-sm font-semibold text-emerald-950">Install EasySoft</p>
          <p className="text-xs text-emerald-800/80 truncate">
            Add it to your home screen for a full-screen app.
          </p>
        </div>
        {installable ? (
          <button
            type="button"
            onClick={onInstall}
            className="flex-shrink-0 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
          >
            Install
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowIosHelp((v) => !v)}
            className="flex-shrink-0 rounded-lg bg-white border border-emerald-300 text-emerald-800 text-sm font-semibold px-3.5 py-2 hover:bg-emerald-100 transition-colors"
          >
            How
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="flex-shrink-0 p-1.5 rounded-lg text-emerald-700/70 hover:text-emerald-900 hover:bg-emerald-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* iOS: no programmatic install — show the manual steps. */}
      {ios && showIosHelp && (
        <div className="border-t border-emerald-200 px-4 py-3 text-sm text-emerald-900">
          <p className="mb-2 font-medium">To install on iPhone/iPad:</p>
          <ol className="space-y-1.5 text-emerald-800">
            <li className="flex items-center gap-2">
              <span className="font-semibold">1.</span> Tap the Share button
              <Share className="w-4 h-4 inline" />
            </li>
            <li className="flex items-center gap-2">
              <span className="font-semibold">2.</span> Choose "Add to Home Screen"
              <Plus className="w-4 h-4 inline" />
            </li>
            <li className="flex items-center gap-2">
              <span className="font-semibold">3.</span> Tap "Add"
            </li>
          </ol>
        </div>
      )}
    </div>
  );
};

export default InstallBanner;
