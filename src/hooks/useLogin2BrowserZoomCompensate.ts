import { useEffect, type RefObject } from 'react';

/**
 * Counteracts browser zoom (Cmd/Ctrl +/-) on a host element so layout keeps stable physical size.
 * Uses CSS `zoom` (Chromium / Electron). Host should fill the viewport with flex layout inside.
 */
export function useLogin2BrowserZoomCompensate(hostRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const apply = () => {
      const host = hostRef.current;
      if (!host) return;
      const browserZoom = window.visualViewport?.scale ?? 1;
      host.style.zoom = String(1 / browserZoom);
    };

    apply();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', apply);
    window.addEventListener('resize', apply);
    return () => {
      vv?.removeEventListener('resize', apply);
      window.removeEventListener('resize', apply);
      const host = hostRef.current;
      if (host) host.style.zoom = '';
    };
  }, [hostRef]);
}
