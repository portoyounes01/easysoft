import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { ActionButton } from '../ui/ActionButton';
import { AdminActionButton } from '../ui/AdminActionButton';
import { ListRow } from '../ui/ListRow';

// Browser (PWA host) human login: username OR email + password, wired to the pwa-login
// edge fn via the auth context. On success the SIGNED_IN handler mints the membership
// principal and App's /login route redirects. Multi-tenant users get a tenant picker.
const LoginFormPwa: React.FC = () => {
  const { t } = useTranslation();
  const { signInWithPwaCredentials, isLoading } = useSupabaseAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<{ tenant_id: string; role: string }[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (tenantId?: string) => {
    setError(null);
    setSubmitting(true);
    const res = await signInWithPwaCredentials(identifier.trim(), password, tenantId);
    setSubmitting(false);
    if (res.success) return; // auth state change redirects away from /login
    if (res.memberships && res.memberships.length > 0) {
      setMemberships(res.memberships);
      return;
    }
    setError(res.error ?? t('loginPwa.loginFailed'));
  };

  const busy = submitting || isLoading;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-slate-200 p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">{t('login2.welcome')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {memberships ? t('loginPwa.selectWorkspace') : t('loginPwa.signInToAccount')}
          </p>
        </div>

        {!memberships ? (
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('loginPwa.usernameOrEmail')}</label>
              <input
                type="text"
                autoFocus
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('login.credentialPassword')}</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>
            )}
            <ActionButton
              type="submit"
              disabled={busy || !identifier.trim() || !password}
              label={busy ? t('loginPwa.signingIn') : t('login.signIn')}
            />
          </form>
        ) : (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-gray-100">
              {memberships.map((m) => (
                <ListRow
                  key={m.tenant_id}
                  onClick={() => void submit(m.tenant_id)}
                  disabled={busy}
                  className="disabled:opacity-50"
                >
                  {/* pwa-login's select_tenant response carries tenant_id + role only (no name yet) */}
                  <span className="flex-1 min-w-0 font-mono text-xs text-slate-500 truncate">{m.tenant_id}</span>
                  <span className="ml-3 shrink-0 text-sm font-medium capitalize text-slate-700">{m.role}</span>
                </ListRow>
              ))}
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>
            )}
            <AdminActionButton
              variant="ghost"
              type="button"
              onClick={() => { setMemberships(null); setError(null); }}
              label={`← ${t('login.back')}`}
              className="w-full text-sm"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginFormPwa;
