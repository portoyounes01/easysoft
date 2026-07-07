import React, { useEffect, useState, useCallback } from 'react';
import { Bell, BellRing, Loader2, Check, AlertTriangle, Percent, WifiOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { enableAlerts, disableAlerts, currentSubscriptionState, type AlertsState } from '../../lib/push';

// Mirrors the server-side alerts config the notification triggers read via app.tenant_setting
// (tenant_settings.data.alerts). Kept in sync with the seed in 20260721000000_notif_producer_helpers.sql.
interface AlertsConfig {
  large_discount: { enabled: boolean; amount: number | null; percentage: number | null };
  offline: { enabled: boolean; grace_seconds: number };
}

const DEFAULTS: AlertsConfig = {
  large_discount: { enabled: true, amount: 50, percentage: 30 },
  offline: { enabled: true, grace_seconds: 300 },
};

function numOrNull(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const cardClass = 'rounded-3xl bg-white/75 p-6 ring-1 ring-slate-200';
const toggleClass = (on: boolean) =>
  `relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300'}`;

// PWA-only settings panel for server-side alert thresholds. Reads/writes tenant_settings.data.alerts
// directly (RLS scopes it to the signed-in tenant). The triggers already deployed read these values,
// so a change here re-tunes LARGE_DISCOUNT / offline detection with no redeploy.
const NotificationSettings: React.FC = () => {
  const { principal, session } = useSupabaseAuth();
  const tenantId = principal?.tenantId ?? null;
  const userId = session?.user?.id ?? null;

  const [cfg, setCfg] = useState<AlertsConfig>(DEFAULTS);
  const [rawData, setRawData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // Background Web Push (P3b) opt-in state.
  const [pushCap, setPushCap] = useState<AlertsState>('default');
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void currentSubscriptionState().then((s) => {
      if (cancelled) return;
      setPushCap(s.capability);
      setPushSubscribed(s.subscribed);
    });
    return () => { cancelled = true; };
  }, []);

  const togglePush = useCallback(async () => {
    if (!userId || !tenantId) return;
    setPushBusy(true);
    try {
      if (pushSubscribed) {
        await disableAlerts(userId, tenantId);
        setPushSubscribed(false);
      } else {
        const res = await enableAlerts(userId, tenantId); // requestPermission runs in this click gesture
        setPushCap(res);
        setPushSubscribed(res === 'granted');
      }
    } finally {
      setPushBusy(false);
    }
  }, [userId, tenantId, pushSubscribed]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase.from('tenant_settings').select('data').maybeSingle();
      if (cancelled) return;
      if (!error && data?.data) {
        const d = data.data as Record<string, unknown>;
        setRawData(d);
        const a = (d.alerts ?? {}) as Partial<AlertsConfig>;
        setCfg({
          large_discount: {
            enabled: a.large_discount?.enabled ?? DEFAULTS.large_discount.enabled,
            amount: a.large_discount?.amount ?? DEFAULTS.large_discount.amount,
            percentage: a.large_discount?.percentage ?? DEFAULTS.large_discount.percentage,
          },
          offline: {
            enabled: a.offline?.enabled ?? DEFAULTS.offline.enabled,
            grace_seconds: a.offline?.grace_seconds ?? DEFAULTS.offline.grace_seconds,
          },
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const save = useCallback(async () => {
    if (!tenantId) return;
    setSaving(true);
    setStatus('idle');
    const merged = { ...rawData, alerts: cfg };
    const { error } = await supabase
      .from('tenant_settings')
      .update({ data: merged, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId);
    setSaving(false);
    if (error) {
      setStatus('error');
      console.warn('[notifications] failed to save alert config:', error.message);
    } else {
      setRawData(merged);
      setStatus('saved');
    }
  }, [tenantId, rawData, cfg]);

  if (loading) {
    return (
      <div className={`${cardClass} flex items-center gap-3 text-slate-500`}>
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading alert settings…</span>
      </div>
    );
  }

  const ld = cfg.large_discount;
  const off = cfg.offline;

  const pushDisabledMsg: Partial<Record<AlertsState, string>> = {
    unsupported: "This browser doesn't support background alerts.",
    'needs-install': 'Install the app to your home screen first, then enable background alerts here.',
    blocked: 'Notifications are blocked in your browser settings. Re-enable them there, then try again.',
  };

  return (
    <div className="space-y-6">
      {/* Background Web Push */}
      <div className={cardClass}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
              <BellRing className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-950">Background alerts (push)</p>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">
                Buzz this device for <span className="font-semibold">critical</span> events (fiscal cancellation, fiscal issuing failed) even when the app is closed.
              </p>
            </div>
          </div>
          {pushDisabledMsg[pushCap] ? null : (
            <button
              type="button"
              role="switch"
              aria-checked={pushSubscribed}
              disabled={pushBusy}
              onClick={togglePush}
              className={`${toggleClass(pushSubscribed)} ${pushBusy ? 'opacity-60' : ''}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${pushSubscribed ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          )}
        </div>
        {pushDisabledMsg[pushCap] && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>{pushDisabledMsg[pushCap]}</span>
          </div>
        )}
        {!pushDisabledMsg[pushCap] && (
          <p className="mt-4 text-xs text-slate-500">
            {pushSubscribed ? 'This device will receive background alerts.' : 'Turn on to receive alerts on this device.'}
          </p>
        )}
      </div>

      {/* Large discount */}
      <div className={cardClass}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <Percent className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-950">Large discount alert</p>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">
                Notify when a sale's discount is at or above the amount <span className="font-semibold">or</span> the percentage below.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={ld.enabled}
            onClick={() => setCfg((c) => ({ ...c, large_discount: { ...c.large_discount, enabled: !c.large_discount.enabled } }))}
            className={toggleClass(ld.enabled)}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${ld.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <div className={`mt-5 grid gap-4 sm:grid-cols-2 ${ld.enabled ? '' : 'pointer-events-none opacity-50'}`}>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Amount (€)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={ld.amount ?? ''}
              onChange={(e) => setCfg((c) => ({ ...c, large_discount: { ...c.large_discount, amount: numOrNull(e.target.value) } }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
              placeholder="—"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Percentage (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step="1"
              value={ld.percentage ?? ''}
              onChange={(e) => setCfg((c) => ({ ...c, large_discount: { ...c.large_discount, percentage: numOrNull(e.target.value) } }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
              placeholder="—"
            />
          </label>
        </div>
      </div>

      {/* Offline / till heartbeat */}
      <div className={cardClass}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
              <WifiOff className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-950">Till offline alert</p>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">
                Notify when a till stops checking in for longer than the grace period.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={off.enabled}
            onClick={() => setCfg((c) => ({ ...c, offline: { ...c.offline, enabled: !c.offline.enabled } }))}
            className={toggleClass(off.enabled)}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${off.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <div className={`mt-5 ${off.enabled ? '' : 'pointer-events-none opacity-50'}`}>
          <label className="block max-w-[16rem]">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Grace period (seconds)</span>
            <input
              type="number"
              min={120}
              step="30"
              value={off.grace_seconds}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setCfg((c) => ({ ...c, offline: { ...c.offline, grace_seconds: Number.isNaN(n) ? DEFAULTS.offline.grace_seconds : n } }));
              }}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
            />
          </label>
          <div className="mt-3 flex items-start gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>A till is flagged offline after this much silence. Minimum 120s (2× the heartbeat); lower values are floored server-side to avoid false alarms on a healthy till.</span>
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div className="flex items-center justify-end gap-3">
        {status === 'saved' && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
        {status === 'error' && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600">
            <AlertTriangle className="h-4 w-4" /> Save failed
          </span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving || !tenantId}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Save alert settings'}
        </button>
      </div>
    </div>
  );
};

export default NotificationSettings;
