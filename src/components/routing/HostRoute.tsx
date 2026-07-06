import React from 'react';
import { Navigate } from 'react-router-dom';
import { isPwaHost } from '../../lib/host';

// Where an authenticated PWA (browser) human lands / falls back to. Dashboard ('/') is
// still mock, so v1 lands on /reports (docs/pwa-p1-refactor-plan.md open issue).
export const PWA_LANDING = '/reports';

// Renders children only on the matching host; otherwise redirects. Till-only routes
// (POS, order queue, hardware, drawer) must never render in a browser/PWA build
// (docs/pwa-plan.md §2.3) — a manager who navigates to /pos is bounced to PWA_LANDING.
export const HostRoute: React.FC<{ host: 'till' | 'pwa'; children: React.ReactNode }> = ({ host, children }) => {
  const matches = host === 'pwa' ? isPwaHost : !isPwaHost;
  if (!matches) return <Navigate to={isPwaHost ? PWA_LANDING : '/pos'} replace />;
  return <>{children}</>;
};
