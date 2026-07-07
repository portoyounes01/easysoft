import { useEffect, useState } from 'react';
import { canInstall, promptInstall, PWA_INSTALL_EVENT } from '../pwa';

// True once the app is running as an installed PWA (standalone window / iOS home-screen app).
function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari exposes navigator.standalone for home-screen apps
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !('MSStream' in window);
}

// Reactive install state for the UI: whether the native prompt is available, whether we're
// on iOS (manual install), and whether the app is already installed.
export function useInstall() {
  const [installable, setInstallable] = useState<boolean>(() => canInstall());
  const [standalone, setStandalone] = useState<boolean>(() => detectStandalone());
  const ios = detectIOS();

  useEffect(() => {
    const update = () => {
      setInstallable(canInstall());
      setStandalone(detectStandalone());
    };
    window.addEventListener(PWA_INSTALL_EVENT, update);
    const mq = window.matchMedia?.('(display-mode: standalone)');
    mq?.addEventListener?.('change', update);
    return () => {
      window.removeEventListener(PWA_INSTALL_EVENT, update);
      mq?.removeEventListener?.('change', update);
    };
  }, []);

  return { installable, standalone, ios, promptInstall };
}
