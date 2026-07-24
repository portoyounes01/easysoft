import React, { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  AlertCircle,
  Ban,
  Check,
  Copy,
  KeyRound,
  Loader2,
  LockKeyhole,
  MonitorSmartphone,
  Plus,
  RefreshCw,
  ShieldCheck,
  Store,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { toDataURL } from 'qrcode';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import {
  deviceManagementService,
  type DeviceAdminCredentials,
  type DeviceListResponse,
  type ManagedDevice,
  type PairingCodeResponse,
} from '../services/deviceManagementService';
import { useDesignSystem2Customization } from '../contexts/DesignSystem2CustomizationContext';
import '../styles/design-system-2-scope.css';

type RequestState = 'idle' | 'loading' | 'error';

const statusStyle: Record<ManagedDevice['status'], string> = {
  provisioned: 'bg-amber-100 text-amber-800 border-amber-200',
  enrolled: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  revoked: 'bg-red-100 text-red-800 border-red-200',
};

// Presence (P3c) is maintained by the till heartbeat + offline sweep; only meaningful once enrolled.
const presenceStyle: Record<ManagedDevice['presence'], { cls: string; label: string }> = {
  online: { cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 'Online' },
  offline: { cls: 'bg-red-100 text-red-800 border-red-200', label: 'Offline' },
  unknown: { cls: 'bg-gray-100 text-gray-600 border-gray-200', label: 'Unknown' },
};

function latestPairingCode(device: ManagedDevice) {
  return [...(device.device_pairing_codes ?? [])]
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
}

const Devices: React.FC = () => {
  // 1. Hooks
  const { employee, principal } = useSupabaseAuth();
  const { visualStyle, prefs } = useDesignSystem2Customization();
  const [pin, setPin] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  // PWA human path: an owner/admin MEMBERSHIP JWT is the authority server-side
  // (manage-devices accepts it directly) — no employee row, no PIN re-auth step.
  // The till path (device JWT + employee attribution) keeps the PIN unlock.
  const isMembershipAdmin =
    principal?.source === 'membership' && (principal.role === 'owner' || principal.role === 'admin');
  const [requestState, setRequestState] = useState<RequestState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DeviceListResponse>({ stores: [], devices: [] });
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState('');
  const [storeId, setStoreId] = useState('');
  const [pairing, setPairing] = useState<PairingCodeResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);
  const [revokingDevice, setRevokingDevice] = useState<ManagedDevice | null>(null);

  const credentials = useMemo<DeviceAdminCredentials | undefined>(() => (
    isMembershipAdmin
      ? undefined
      : { employeeNumber: employee?.employee_number ?? '', secret: pin }
  ), [isMembershipAdmin, employee?.employee_number, pin]);

  useEffect(() => {
    let active = true;
    if (!pairing?.pairing_code) {
      setQrDataUrl('');
      return;
    }
    toDataURL(pairing.pairing_code, { width: 240, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => { if (active) setQrDataUrl(url); })
      .catch(() => { if (active) setQrDataUrl(''); });
    return () => { active = false; };
  }, [pairing?.pairing_code]);

  // PWA human: no PIN gate — load straight away (the membership JWT is the authority).
  // Once-ref, not a state guard: StrictMode replays the effect before any setState
  // lands, so a requestState check can't dedupe — and a ref stays safe even if
  // someone later adds deps that would otherwise create a refetch-after-error loop.
  const autoLoadStarted = React.useRef(false);
  useEffect(() => {
    if (isMembershipAdmin && !isUnlocked && !autoLoadStarted.current) {
      autoLoadStarted.current = true;
      void loadDevices(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMembershipAdmin]);

  // 2. Event handlers
  const loadDevices = async (nextCredentials = credentials) => {
    setRequestState('loading');
    setError(null);
    try {
      const response = await deviceManagementService.list(nextCredentials);
      setData(response);
      setStoreId((current) => current || response.stores.find((store) => store.status === 'active')?.id || '');
      setIsUnlocked(true);
      setRequestState('idle');
    } catch (loadError) {
      setRequestState('error');
      setError(loadError instanceof Error ? loadError.message : 'The till list could not be loaded.');
    }
  };

  const handleUnlock = async (event: React.FormEvent) => {
    event.preventDefault();
    await loadDevices();
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setRequestState('loading');
    setError(null);
    try {
      const response = await deviceManagementService.create(credentials, { label: label.trim(), storeId });
      setPairing(response);
      setLabel('');
      setShowCreate(false);
      await loadDevices();
    } catch (createError) {
      setRequestState('error');
      setError(createError instanceof Error ? createError.message : 'The till could not be created.');
    }
  };

  const handleReissue = async (deviceId: string) => {
    setBusyDeviceId(deviceId);
    setError(null);
    try {
      const response = await deviceManagementService.reissue(credentials, deviceId);
      setPairing(response);
      await loadDevices();
    } catch (reissueError) {
      setError(reissueError instanceof Error ? reissueError.message : 'A new code could not be issued.');
    } finally {
      setBusyDeviceId(null);
    }
  };

  const handleRevoke = (device: ManagedDevice) => {
    setRevokingDevice(device);
  };

  const confirmRevoke = async () => {
    if (!revokingDevice) return;
    const device = revokingDevice;
    setRevokingDevice(null);
    setBusyDeviceId(device.id);
    setError(null);
    try {
      await deviceManagementService.revoke(credentials, device.id);
      await loadDevices();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : 'The till could not be revoked.');
    } finally {
      setBusyDeviceId(null);
    }
  };

  const handleCopy = async () => {
    if (!pairing?.pairing_code) return;
    await navigator.clipboard.writeText(pairing.pairing_code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleLock = () => {
    setPin('');
    setIsUnlocked(false);
    setData({ stores: [], devices: [] });
    setPairing(null);
    setShowCreate(false);
    setError(null);
  };

  // 3. Computed values
  const storesById = useMemo(
    () => new Map(data.stores.map((store) => [store.id, store.name])),
    [data.stores],
  );

  // 5. Render
  if (!isMembershipAdmin && employee?.role !== 'admin') {
    return (
      <div className="ds2-visual-scope min-h-full bg-[#f7f7f7] p-8" style={visualStyle} data-ds2-neutral={prefs.neutralFamilyId}>
        <div className="mx-auto max-w-2xl rounded-3xl border-2 border-red-200 bg-red-50 p-8 text-center">
          <ShieldCheck className="mx-auto mb-4 h-14 w-14 text-red-600" />
          <h1 className="text-3xl font-bold text-gray-900">Administrator access required</h1>
          <p className="mt-3 text-lg text-gray-600">Only an administrator can provision or revoke tills.</p>
        </div>
      </div>
    );
  }

  if (!isUnlocked && isMembershipAdmin) {
    // Auto-load in flight (or it failed) — show progress/error instead of a PIN form
    // that a membership human cannot answer.
    return (
      <div className="ds2-visual-scope min-h-full bg-[#f7f7f7] p-8" style={visualStyle} data-ds2-neutral={prefs.neutralFamilyId}>
        <div className="mx-auto max-w-xl pt-16 text-center">
          {requestState === 'error' ? (
            <div className="rounded-3xl border-2 border-red-200 bg-red-50 p-8">
              <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-600" />
              <p className="text-lg font-medium text-red-700">{error ?? 'The till list could not be loaded.'}</p>
              <button
                type="button"
                onClick={() => void loadDevices(undefined)}
                className="mx-auto mt-6 flex min-h-touch-sm items-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 text-gray-900 hover:bg-gray-50"
              >
                <RefreshCw className="h-5 w-5" /> Try again
              </button>
            </div>
          ) : (
            <p className="flex items-center justify-center gap-3 text-xl text-gray-600">
              <Loader2 className="h-6 w-6 animate-spin" /> Loading tills…
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!isUnlocked) {
    return (
      <div className="ds2-visual-scope min-h-full bg-[#f7f7f7] p-8" style={visualStyle} data-ds2-neutral={prefs.neutralFamilyId}>
        <div className="mx-auto max-w-xl pt-10">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-red-500 to-pink-600 shadow-lg">
              <LockKeyhole className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900">Manage tills</h1>
            <p className="mt-3 text-lg text-gray-600">Confirm your administrator PIN to view pairing controls.</p>
          </div>
          <form onSubmit={handleUnlock} className="rounded-3xl border border-gray-200 bg-white p-8 shadow-xl">
            <label className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-800" htmlFor="device-admin-pin">
              <KeyRound className="h-6 w-6 text-red-500" /> Administrator PIN
            </label>
            <input
              id="device-admin-pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              className="min-h-touch w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-6 text-2xl tracking-widest focus:border-transparent focus:outline-none focus:ring-4 focus:ring-red-200"
              autoFocus
            />
            {error && (
              <div className="mt-5 flex items-start gap-3 rounded-2xl border-2 border-red-200 bg-red-50 p-4" role="alert">
                <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-red-600" />
                <p className="text-lg font-medium text-red-700">{error}</p>
              </div>
            )}
            <button
              type="submit"
              disabled={!pin || requestState === 'loading'}
              className="mt-6 flex min-h-20 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 px-6 text-2xl font-medium text-neutral-50 transition-all duration-200 hover:from-blue-600 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {requestState === 'loading' ? <Loader2 className="h-7 w-7 animate-spin" /> : <ShieldCheck className="h-7 w-7" />}
              Unlock device management
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="ds2-visual-scope min-h-full bg-[#f7f7f7] p-6 lg:p-8" style={visualStyle} data-ds2-neutral={prefs.neutralFamilyId}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <MonitorSmartphone className="h-9 w-9 text-emerald-600" />
              <h1 className="text-4xl font-bold text-gray-900">Tills</h1>
            </div>
            <p className="text-lg text-gray-600">Provision tills, issue one-time pairing codes, and revoke access.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => loadDevices()}
              disabled={requestState === 'loading'}
              className="flex min-h-touch-sm items-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 text-gray-900 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-5 w-5 ${requestState === 'loading' ? 'animate-spin' : ''}`} /> Refresh
            </button>
            {!isMembershipAdmin && (
              <button
                type="button"
                onClick={handleLock}
                className="flex min-h-touch-sm items-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 text-gray-900 hover:bg-gray-50"
              >
                <LockKeyhole className="h-5 w-5" /> Lock
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex min-h-touch-sm items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 px-6 font-medium text-neutral-50 hover:from-blue-600 hover:to-purple-700"
            >
              <Plus className="h-5 w-5" /> Pair a new till
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border-2 border-red-200 bg-red-50 p-4" role="alert">
            <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-red-600" />
            <p className="text-lg font-medium text-red-700">{error}</p>
          </div>
        )}

        {pairing && (
          <div className="mb-8 overflow-hidden rounded-3xl border-2 border-emerald-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 bg-emerald-50 p-6">
              <div className="flex items-start gap-3">
                <Check className="mt-1 h-7 w-7 text-emerald-600" />
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Pairing code ready</h2>
                  <p className="mt-1 text-gray-600">This code is shown once and expires at {new Date(pairing.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</p>
                </div>
              </div>
              <button type="button" onClick={() => setPairing(null)} className="min-h-touch-xs min-w-[44px] rounded-2xl p-2 text-gray-700 hover:bg-gray-100" aria-label="Close pairing code">
                <X className="mx-auto h-6 w-6" />
              </button>
            </div>
            <div className="grid gap-8 p-6 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">Enter on the new till</p>
                <div className="break-all rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 p-5 font-mono text-3xl font-bold tracking-widest text-gray-900">
                  {pairing.pairing_code}
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="mt-4 flex min-h-touch-sm items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 px-6 font-medium text-neutral-50 hover:from-blue-600 hover:to-purple-700"
                >
                  {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                  {copied ? 'Copied' : 'Copy code'}
                </button>
              </div>
              {qrDataUrl && (
                <div className="text-center">
                  <img src={qrDataUrl} alt="Pairing code QR" className="mx-auto h-52 w-52 rounded-2xl border border-gray-200 bg-white p-2" />
                  <p className="mt-2 text-sm text-gray-500">Pairing code QR</p>
                </div>
              )}
            </div>
          </div>
        )}

        {showCreate && (
          <form onSubmit={handleCreate} className="mb-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-lg">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Pair a new till</h2>
                <p className="mt-1 text-gray-600">Create the till first, then enter the generated code on that machine.</p>
              </div>
              <button type="button" onClick={() => setShowCreate(false)} className="min-h-touch-xs min-w-[44px] rounded-2xl p-2 text-gray-700 hover:bg-gray-100" aria-label="Cancel">
                <X className="mx-auto h-6 w-6" />
              </button>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="till-label" className="mb-2 block text-lg font-semibold text-gray-800">Till name</label>
                <input
                  id="till-label"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  maxLength={80}
                  placeholder="e.g. Front Counter"
                  className="min-h-touch w-full rounded-2xl border-2 border-gray-200 px-5 text-xl focus:border-transparent focus:outline-none focus:ring-4 focus:ring-emerald-200"
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="till-store" className="mb-2 block text-lg font-semibold text-gray-800">Store</label>
                <select
                  id="till-store"
                  value={storeId}
                  onChange={(event) => setStoreId(event.target.value)}
                  className="min-h-touch w-full rounded-2xl border-2 border-gray-200 bg-white px-5 text-xl focus:border-transparent focus:outline-none focus:ring-4 focus:ring-emerald-200"
                >
                  {data.stores.filter((store) => store.status === 'active').map((store) => (
                    <option key={store.id} value={store.id}>{store.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={!label.trim() || !storeId || requestState === 'loading'}
              className="mt-6 flex min-h-touch items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 px-7 text-lg font-medium text-neutral-50 hover:from-blue-600 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {requestState === 'loading' ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}
              Create till and code
            </button>
          </form>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          {data.devices.map((device) => {
            const latestCode = latestPairingCode(device);
            const hasLiveCode = device.status === 'provisioned'
              && latestCode
              && !latestCode.used_at
              && new Date(latestCode.expires_at).getTime() > Date.now();
            const busy = busyDeviceId === device.id;
            return (
              <article key={device.id} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gray-100">
                      <MonitorSmartphone className="h-7 w-7 text-gray-700" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-2xl font-bold text-gray-900">{device.label}</h2>
                      <p className="mt-1 flex items-center gap-2 text-gray-600"><Store className="h-4 w-4" /> {storesById.get(device.store_id) ?? 'Unknown store'}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {device.status === 'enrolled' && (
                      <span className={`rounded-full border px-3 py-1 text-sm font-bold ${presenceStyle[device.presence].cls}`}>
                        {presenceStyle[device.presence].label}
                      </span>
                    )}
                    <span className={`rounded-full border px-3 py-1 text-sm font-bold capitalize ${statusStyle[device.status]}`}>{device.status}</span>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600 sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    {device.status === 'enrolled' && device.presence === 'online'
                      ? <Wifi className="h-4 w-4 text-emerald-600" />
                      : <WifiOff className="h-4 w-4 text-gray-400" />}
                    Last seen: {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : 'Never'}
                  </div>
                  <div>Created: {new Date(device.created_at).toLocaleDateString()}</div>
                </div>

                {hasLiveCode && (
                  <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 font-medium text-amber-800">
                    A code is active until {new Date(latestCode.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Its raw value cannot be shown again.
                  </p>
                )}

                <div className="mt-5 flex flex-wrap gap-3">
                  {device.status === 'provisioned' && !hasLiveCode && (
                    <button
                      type="button"
                      onClick={() => handleReissue(device.id)}
                      disabled={busy}
                      className="flex min-h-touch-sm items-center gap-2 rounded-2xl border border-gray-300 bg-white px-5 font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
                      Issue new code
                    </button>
                  )}
                  {device.status !== 'revoked' && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(device)}
                      disabled={busy}
                      className="flex min-h-touch-sm items-center gap-2 rounded-xl border border-[var(--ds2-danger-border,#fca5a5)] bg-white px-5 font-semibold text-[var(--ds2-danger-solid,#dc2626)] hover:bg-[var(--ds2-danger-tint-bg,#fef2f2)] disabled:opacity-50"
                    >
                      <Ban className="h-5 w-5" /> Revoke
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {data.devices.length === 0 && (
          <div className="rounded-3xl border-2 border-dashed border-gray-300 bg-white p-12 text-center">
            <MonitorSmartphone className="mx-auto h-14 w-14 text-gray-400" />
            <h2 className="mt-4 text-2xl font-bold text-gray-900">No tills yet</h2>
            <p className="mt-2 text-gray-600">Create the first till to generate its one-time pairing code.</p>
          </div>
        )}
      </div>
      {revokingDevice && (
        <ConfirmDialog
          tone="danger"
          title="Revoke till?"
          message={`Revoke “${revokingDevice.label}”? This till will lose access and cannot be restored from this screen.`}
          cancelLabel="Cancel"
          confirmLabel="Yes, revoke"
          onCancel={() => setRevokingDevice(null)}
          onConfirm={() => void confirmRevoke()}
        />
      )}
    </div>
  );
};

export default Devices;
