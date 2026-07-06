import React, { useState } from 'react';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';

// Browser (PWA host) human login: username OR email + password, wired to the pwa-login
// edge fn via the auth context. On success the SIGNED_IN handler mints the membership
// principal and App's /login route redirects. Multi-tenant users get a tenant picker.
const LoginFormPwa: React.FC = () => {
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
    setError(res.error ?? 'Login failed.');
  };

  const busy = submitting || isLoading;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-slate-200 p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Welcome</h1>
          <p className="text-sm text-slate-500 mt-1">
            {memberships ? 'Select a workspace to continue' : 'Sign in to your account'}
          </p>
        </div>

        {!memberships ? (
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Username or email</label>
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
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
            <button
              type="submit"
              disabled={busy || !identifier.trim() || !password}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 transition-colors"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <div className="space-y-3">
            {memberships.map((m) => (
              <button
                key={m.tenant_id}
                type="button"
                onClick={() => void submit(m.tenant_id)}
                disabled={busy}
                className="w-full flex items-center justify-between rounded-lg border border-slate-300 hover:border-blue-500 hover:bg-blue-50 px-4 py-3 text-left transition-colors disabled:opacity-50"
              >
                {/* pwa-login's select_tenant response carries tenant_id + role only (no name yet) */}
                <span className="font-mono text-xs text-slate-500 truncate">{m.tenant_id}</span>
                <span className="ml-3 shrink-0 text-sm font-medium capitalize text-slate-700">{m.role}</span>
              </button>
            ))}
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>
            )}
            <button
              type="button"
              onClick={() => { setMemberships(null); setError(null); }}
              className="w-full text-sm text-slate-500 hover:text-slate-700 py-1"
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginFormPwa;
