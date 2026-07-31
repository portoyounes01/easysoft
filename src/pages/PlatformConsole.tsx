// Platform (sysadmin) console — cross-tenant control of tenants, stores, owner
// accounts, and ALL tills. Reachable only by a platform principal (App.tsx
// PlatformRoute); every action round-trips through the platform-admin edge fn,
// which re-authorizes against public.platform_admins per request.
// docs/platform-console-runbook.md.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  AlertCircle,
  Ban,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  KeyRound,
  Loader2,
  MonitorSmartphone,
  Pencil,
  Plus,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Store,
  Trash2,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { toDataURL } from 'qrcode';
import { useTranslation } from 'react-i18next';
import {
  platformAdminService,
  type PlatformAuditEntry,
  type PlatformDeviceList,
  type PlatformMember,
  type PlatformPairingCode,
  type PlatformStore,
  type PlatformTenant,
} from '../services/platformAdminService';
import { useDesignSystem2Customization } from '../contexts/DesignSystem2CustomizationContext';
import '../styles/design-system-2-scope.css';

type Tab = 'tenants' | 'devices' | 'audit';

const TENANT_STATUSES = ['provisioning', 'active', 'suspended', 'offboarding'] as const;
const SUBSCRIPTION_PLANS = ['trial', 'basic', 'standard', 'premium'] as const;

const tenantStatusStyle: Record<string, string> = {
  provisioning: 'bg-amber-100 text-amber-800 border-amber-200',
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  suspended: 'bg-red-100 text-red-800 border-red-200',
  offboarding: 'bg-gray-200 text-gray-700 border-gray-300',
};

const deviceStatusStyle: Record<string, string> = {
  provisioned: 'bg-amber-100 text-amber-800 border-amber-200',
  enrolled: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  revoked: 'bg-red-100 text-red-800 border-red-200',
};

const presenceStyle: Record<string, { cls: string; label: string }> = {
  online: { cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 'Online' },
  offline: { cls: 'bg-red-100 text-red-800 border-red-200', label: 'Offline' },
  unknown: { cls: 'bg-gray-100 text-gray-600 border-gray-200', label: 'Unknown' },
};

const inputCls =
  'min-h-touch-sm w-full rounded-2xl border-2 border-gray-200 bg-white px-4 text-base focus:border-transparent focus:outline-none focus:ring-4 focus:ring-blue-200';
const primaryBtnCls =
  'flex min-h-touch-sm items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 px-5 font-medium text-neutral-50 hover:from-blue-600 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-50';
const ghostBtnCls =
  'flex min-h-touch-sm items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-gray-900 hover:bg-gray-50 disabled:opacity-50';
const dangerBtnCls =
  'flex min-h-touch-sm items-center gap-2 rounded-xl border border-[var(--ds2-danger-border,#fca5a5)] bg-white px-4 font-semibold text-[var(--ds2-danger-solid,#dc2626)] hover:bg-[var(--ds2-danger-tint-bg,#fef2f2)] disabled:opacity-50';

const PlatformConsole: React.FC = () => {
  const { t } = useTranslation();
  const { visualStyle, prefs } = useDesignSystem2Customization();

  const [tab, setTab] = useState<Tab>('tenants');
  // In-flight COUNTER, not a boolean: tab loads and form submits overlap, and a
  // boolean would let the first completion re-enable buttons / flash empty states
  // while another request is still pending.
  const [pending, setPending] = useState(0);
  const loading = pending > 0;
  const [error, setError] = useState<string | null>(null);

  // tenants
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [showCreateTenant, setShowCreateTenant] = useState(false);
  const [tenantForm, setTenantForm] = useState({ name: '', legal_name: '', nif: '', country: 'PT', subscription_plan: 'basic' });
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ stores: PlatformStore[]; members: PlatformMember[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingTenant, setEditingTenant] = useState<PlatformTenant | null>(null);
  const [editForm, setEditForm] = useState({ name: '', legal_name: '', nif: '', country: '', status: '', subscription_plan: '' });
  const [deletingTenant, setDeletingTenant] = useState<PlatformTenant | null>(null);
  const [storeForm, setStoreForm] = useState({ name: '', city: '' });
  const [memberForm, setMemberForm] = useState({ email: '', password: '', username: '', role: 'owner' });
  const [removingMember, setRemovingMember] = useState<{ tenantId: string; member: PlatformMember } | null>(null);

  // devices
  const [deviceData, setDeviceData] = useState<PlatformDeviceList>({ devices: [], tenants: [], stores: [] });
  const [deviceTenantFilter, setDeviceTenantFilter] = useState('');
  const [showCreateDevice, setShowCreateDevice] = useState(false);
  const [deviceForm, setDeviceForm] = useState({ tenantId: '', storeId: '', label: '' });
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);
  const [revokingDevice, setRevokingDevice] = useState<{ id: string; label: string } | null>(null);
  const [renamingDevice, setRenamingDevice] = useState<{ id: string; label: string } | null>(null);

  // pairing code (shared by tenant-detail and devices tab creates)
  const [pairing, setPairing] = useState<PlatformPairingCode | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  // audit
  const [audit, setAudit] = useState<{ entries: PlatformAuditEntry[]; actors: Record<string, string | null> }>({ entries: [], actors: {} });

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

  const run = async (fn: () => Promise<void>) => {
    setPending((p) => p + 1);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The request failed.');
    } finally {
      setPending((p) => p - 1);
    }
  };

  const loadTenants = () => run(async () => {
    const { tenants: rows } = await platformAdminService.listTenants();
    setTenants(rows);
  });

  // Mutation handlers reload the device list AFTER their await — read the CURRENT
  // filter through a ref, not the closure, so a filter change mid-mutation can't
  // resurrect the old filter's list.
  const deviceTenantFilterRef = useRef(deviceTenantFilter);
  deviceTenantFilterRef.current = deviceTenantFilter;
  const reloadDevices = async () => {
    const data = await platformAdminService.listDevices(deviceTenantFilterRef.current || undefined);
    setDeviceData(data);
  };

  const loadDevices = () => run(reloadDevices);

  const loadAudit = () => run(async () => {
    const data = await platformAdminService.auditLog(200);
    setAudit(data);
  });

  useEffect(() => {
    if (tab === 'tenants') void loadTenants();
    if (tab === 'devices') void loadDevices();
    if (tab === 'audit') void loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, deviceTenantFilter]);

  // Generation guard: only the LATEST expand's results may land. Without it, an
  // earlier tenant's slow detail fetch can overwrite the currently expanded tenant's
  // panel — and the row actions send ids from whatever is displayed, so a mis-render
  // would become a wrong-tenant mutation.
  const detailReq = useRef(0);
  const loadDetail = async (tenantId: string) => {
    const req = ++detailReq.current;
    setDetailLoading(true);
    setDetail(null);
    try {
      const [{ stores }, { members }] = await Promise.all([
        platformAdminService.listStores(tenantId),
        platformAdminService.listMembers(tenantId),
      ]);
      if (detailReq.current !== req) return; // a newer expand superseded this load
      setDetail({ stores, members });
    } catch (e) {
      if (detailReq.current === req) setError(e instanceof Error ? e.message : 'The tenant detail could not be loaded.');
    } finally {
      if (detailReq.current === req) setDetailLoading(false);
    }
  };

  const toggleTenant = (tenantId: string) => {
    if (expandedTenant === tenantId) {
      detailReq.current += 1; // an in-flight load must not repopulate a collapsed panel
      setExpandedTenant(null);
      setDetail(null);
      return;
    }
    setExpandedTenant(tenantId);
    setStoreForm({ name: '', city: '' });
    setMemberForm({ email: '', password: '', username: '', role: 'owner' });
    void loadDetail(tenantId);
  };

  const handleCreateTenant = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await platformAdminService.createTenant({ ...tenantForm, status: 'active' });
      setTenantForm({ name: '', legal_name: '', nif: '', country: 'PT', subscription_plan: 'basic' });
      setShowCreateTenant(false);
      const { tenants: rows } = await platformAdminService.listTenants();
      setTenants(rows);
    });
  };

  const openEditTenant = (tenant: PlatformTenant) => {
    setEditingTenant(tenant);
    setEditForm({
      name: tenant.name,
      legal_name: tenant.legal_name,
      nif: tenant.nif,
      country: tenant.country,
      status: tenant.status,
      subscription_plan: tenant.subscription_plan,
    });
  };

  const handleSaveTenant = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingTenant) return;
    const id = editingTenant.id;
    void run(async () => {
      await platformAdminService.updateTenant(id, editForm as Parameters<typeof platformAdminService.updateTenant>[1]);
      setEditingTenant(null);
      const { tenants: rows } = await platformAdminService.listTenants();
      setTenants(rows);
    });
  };

  const confirmDeleteTenant = () => {
    if (!deletingTenant) return;
    const id = deletingTenant.id;
    setDeletingTenant(null);
    void run(async () => {
      await platformAdminService.deleteTenant(id);
      setExpandedTenant(null);
      setDetail(null);
      const { tenants: rows } = await platformAdminService.listTenants();
      setTenants(rows);
    });
  };

  const handleCreateStore = (event: React.FormEvent) => {
    event.preventDefault();
    if (!expandedTenant) return;
    const tenantId = expandedTenant;
    void run(async () => {
      await platformAdminService.createStore(tenantId, { name: storeForm.name.trim(), ...(storeForm.city.trim() ? { city: storeForm.city.trim() } : {}) });
      setStoreForm({ name: '', city: '' });
      await loadDetail(tenantId);
    });
  };

  const handleCloseStore = (store: PlatformStore) => {
    void run(async () => {
      await platformAdminService.updateStore(store.id, { status: store.status === 'active' ? 'closed' : 'active' });
      if (expandedTenant) await loadDetail(expandedTenant);
    });
  };

  const handleCreateMember = (event: React.FormEvent) => {
    event.preventDefault();
    if (!expandedTenant) return;
    const tenantId = expandedTenant;
    void run(async () => {
      await platformAdminService.createMember(tenantId, {
        email: memberForm.email.trim(),
        password: memberForm.password,
        role: memberForm.role,
        ...(memberForm.username.trim() ? { username: memberForm.username.trim() } : {}),
      });
      setMemberForm({ email: '', password: '', username: '', role: 'owner' });
      await loadDetail(tenantId);
    });
  };

  const confirmRemoveMember = () => {
    if (!removingMember) return;
    const { tenantId, member } = removingMember;
    setRemovingMember(null);
    void run(async () => {
      await platformAdminService.removeMember(tenantId, member.user_id);
      if (expandedTenant === tenantId) await loadDetail(tenantId);
    });
  };

  const handleCreateDevice = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const response = await platformAdminService.createDevice({
        tenantId: deviceForm.tenantId,
        storeId: deviceForm.storeId,
        label: deviceForm.label.trim(),
      });
      setPairing(response);
      setDeviceForm((prev) => ({ ...prev, label: '' }));
      setShowCreateDevice(false);
      await reloadDevices();
    });
  };

  const handleReissue = async (deviceId: string) => {
    setBusyDeviceId(deviceId);
    setError(null);
    try {
      const response = await platformAdminService.reissueCode(deviceId);
      setPairing(response);
      await reloadDevices();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'A new code could not be issued.');
    } finally {
      setBusyDeviceId(null);
    }
  };

  const confirmRevokeDevice = async () => {
    if (!revokingDevice) return;
    const device = revokingDevice;
    setRevokingDevice(null);
    setBusyDeviceId(device.id);
    setError(null);
    try {
      await platformAdminService.revokeDevice(device.id);
      await reloadDevices();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The till could not be revoked.');
    } finally {
      setBusyDeviceId(null);
    }
  };

  const handleRename = (event: React.FormEvent) => {
    event.preventDefault();
    if (!renamingDevice) return;
    const { id, label } = renamingDevice;
    void run(async () => {
      await platformAdminService.renameDevice(id, label.trim());
      setRenamingDevice(null);
      await reloadDevices();
    });
  };

  const handleCopy = async () => {
    if (!pairing?.pairing_code) return;
    await navigator.clipboard.writeText(pairing.pairing_code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const storesById = useMemo(
    () => new Map(deviceData.stores.map((store) => [store.id, store.name])),
    [deviceData.stores],
  );
  const tenantsById = useMemo(
    () => new Map(deviceData.tenants.map((tenant) => [tenant.id, tenant.name])),
    [deviceData.tenants],
  );
  const deviceFormStores = useMemo(
    () => deviceData.stores.filter((store) => store.tenant_id === deviceForm.tenantId),
    [deviceData.stores, deviceForm.tenantId],
  );

  const tabButton = (key: Tab, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={`flex min-h-touch-sm items-center gap-2 rounded-2xl px-5 font-medium transition-colors ${
        tab === key ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-neutral-50 shadow-lg' : 'border border-gray-200 bg-white text-gray-900 hover:bg-gray-50'
      }`}
    >
      {icon} {label}
    </button>
  );

  return (
    <div className="ds2-visual-scope min-h-full bg-[#f7f7f7] p-6 lg:p-8" style={visualStyle} data-ds2-neutral={prefs.neutralFamilyId}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <ShieldCheck className="h-9 w-9 text-blue-600" />
              <h1 className="text-4xl font-bold text-gray-900">Platform Console</h1>
            </div>
            <p className="text-lg text-gray-600">
              {t('platformConsole.subtitle')}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {tabButton('tenants', <Building2 className="h-5 w-5" />, 'Tenants')}
            {tabButton('devices', <MonitorSmartphone className="h-5 w-5" />, 'All tills')}
            {tabButton('audit', <ScrollText className="h-5 w-5" />, 'Audit')}
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
                  <p className="mt-1 text-gray-600">
                    This code is shown once and expires at {new Date(pairing.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
                  </p>
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
                <button type="button" onClick={handleCopy} className={`mt-4 ${primaryBtnCls}`}>
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

        {/* ============================== TENANTS ============================== */}
        {tab === 'tenants' && (
          <>
            <div className="mb-6 flex flex-wrap gap-3">
              <button type="button" onClick={() => void loadTenants()} disabled={loading} className={ghostBtnCls}>
                <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <button type="button" onClick={() => setShowCreateTenant((v) => !v)} className={primaryBtnCls}>
                <Plus className="h-5 w-5" /> New tenant
              </button>
            </div>

            {showCreateTenant && (
              <form onSubmit={handleCreateTenant} className="mb-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-lg">
                <h2 className="mb-4 text-2xl font-bold text-gray-900">Create a tenant</h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="mb-1 block font-semibold text-gray-800" htmlFor="tenant-name">Business name</label>
                    <input id="tenant-name" className={inputCls} value={tenantForm.name} onChange={(e) => setTenantForm((p) => ({ ...p, name: e.target.value }))} autoFocus />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-gray-800" htmlFor="tenant-legal">Legal name</label>
                    <input id="tenant-legal" className={inputCls} value={tenantForm.legal_name} onChange={(e) => setTenantForm((p) => ({ ...p, legal_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-gray-800" htmlFor="tenant-nif">NIF</label>
                    <input id="tenant-nif" className={inputCls} value={tenantForm.nif} onChange={(e) => setTenantForm((p) => ({ ...p, nif: e.target.value }))} placeholder="PT: 9 digits" />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-gray-800" htmlFor="tenant-country">Country</label>
                    <input id="tenant-country" className={inputCls} value={tenantForm.country} onChange={(e) => setTenantForm((p) => ({ ...p, country: e.target.value.toUpperCase() }))} maxLength={2} />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-gray-800" htmlFor="tenant-plan">Plan</label>
                    <select id="tenant-plan" className={inputCls} value={tenantForm.subscription_plan} onChange={(e) => setTenantForm((p) => ({ ...p, subscription_plan: e.target.value }))}>
                      {SUBSCRIPTION_PLANS.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
                    </select>
                  </div>
                </div>
                <button type="submit" disabled={!tenantForm.name.trim() || !tenantForm.legal_name.trim() || !tenantForm.nif.trim() || loading} className={`mt-5 ${primaryBtnCls}`}>
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Building2 className="h-5 w-5" />}
                  Create tenant
                </button>
              </form>
            )}

            <div className="space-y-5">
              {tenants.map((tenant) => {
                const expanded = expandedTenant === tenant.id;
                return (
                  <article key={tenant.id} className="rounded-3xl border border-gray-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
                      <button type="button" onClick={() => toggleTenant(tenant.id)} className="flex min-w-0 items-center gap-4 text-left">
                        {expanded ? <ChevronDown className="h-6 w-6 shrink-0 text-gray-500" /> : <ChevronRight className="h-6 w-6 shrink-0 text-gray-500" />}
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gray-100">
                          <Building2 className="h-7 w-7 text-gray-700" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="truncate text-2xl font-bold text-gray-900">{tenant.name}</h2>
                          <p className="mt-0.5 truncate text-gray-600">{tenant.legal_name} · {tenant.country} {tenant.nif}</p>
                        </div>
                      </button>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-sm font-bold capitalize ${tenantStatusStyle[tenant.status] ?? tenantStatusStyle.provisioning}`}>{tenant.status}</span>
                        <span className="rounded-full border border-blue-200 bg-blue-100 px-3 py-1 text-sm font-bold capitalize text-blue-800">{tenant.subscription_plan}</span>
                        <span className="rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-sm text-gray-700">{tenant.counts.stores} stores</span>
                        <span className="rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-sm text-gray-700">{tenant.counts.devices_enrolled}/{tenant.counts.devices} tills paired</span>
                        <span className="rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-sm text-gray-700">{tenant.counts.members} accounts</span>
                        <button type="button" onClick={() => openEditTenant(tenant)} className={ghostBtnCls} aria-label={`Edit ${tenant.name}`}>
                          <Pencil className="h-4 w-4" /> Edit
                        </button>
                        <button type="button" onClick={() => setDeletingTenant(tenant)} className={dangerBtnCls} aria-label={`Delete ${tenant.name}`}>
                          <Trash2 className="h-4 w-4" /> Delete
                        </button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="border-t border-gray-100 p-6">
                        {detailLoading && (
                          <p className="flex items-center gap-2 text-gray-600"><Loader2 className="h-5 w-5 animate-spin" /> Loading tenant detail…</p>
                        )}
                        {detail && (
                          <div className="grid gap-8 lg:grid-cols-2">
                            <section>
                              <h3 className="mb-3 flex items-center gap-2 text-xl font-bold text-gray-900"><Store className="h-5 w-5 text-emerald-600" /> Stores</h3>
                              <ul className="space-y-2">
                                {detail.stores.map((store) => (
                                  <li key={store.id} className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-3">
                                    <div className="min-w-0">
                                      <p className="truncate font-semibold text-gray-900">{store.name}</p>
                                      <p className="text-sm text-gray-500">{store.city ?? '—'} · {store.status}</p>
                                    </div>
                                    <button type="button" onClick={() => handleCloseStore(store)} className={ghostBtnCls}>
                                      {store.status === 'active' ? 'Close' : 'Reopen'}
                                    </button>
                                  </li>
                                ))}
                                {detail.stores.length === 0 && <li className="rounded-2xl bg-gray-50 px-4 py-3 text-gray-500">No stores yet — a till needs a store.</li>}
                              </ul>
                              <form onSubmit={handleCreateStore} className="mt-4 flex flex-wrap items-end gap-3">
                                <div className="min-w-[180px] flex-1">
                                  <label className="mb-1 block text-sm font-semibold text-gray-700" htmlFor={`store-name-${tenant.id}`}>New store name</label>
                                  <input id={`store-name-${tenant.id}`} className={inputCls} value={storeForm.name} onChange={(e) => setStoreForm((p) => ({ ...p, name: e.target.value }))} />
                                </div>
                                <div className="min-w-[140px]">
                                  <label className="mb-1 block text-sm font-semibold text-gray-700" htmlFor={`store-city-${tenant.id}`}>City (optional)</label>
                                  <input id={`store-city-${tenant.id}`} className={inputCls} value={storeForm.city} onChange={(e) => setStoreForm((p) => ({ ...p, city: e.target.value }))} />
                                </div>
                                <button type="submit" disabled={!storeForm.name.trim() || loading} className={primaryBtnCls}>
                                  <Plus className="h-5 w-5" /> Add store
                                </button>
                              </form>
                            </section>

                            <section>
                              <h3 className="mb-3 flex items-center gap-2 text-xl font-bold text-gray-900"><Users className="h-5 w-5 text-blue-600" /> Accounts</h3>
                              <ul className="space-y-2">
                                {detail.members.map((member) => (
                                  <li key={member.user_id} className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-3">
                                    <div className="min-w-0">
                                      <p className="truncate font-semibold text-gray-900">{member.email ?? member.username ?? member.user_id}</p>
                                      <p className="text-sm text-gray-500 capitalize">{member.role}{member.username ? ` · @${member.username}` : ''}{member.store_ids ? ` · ${member.store_ids.length} store(s)` : ' · all stores'}</p>
                                    </div>
                                    <button type="button" onClick={() => setRemovingMember({ tenantId: tenant.id, member })} className={dangerBtnCls}>
                                      <Ban className="h-4 w-4" /> Remove
                                    </button>
                                  </li>
                                ))}
                                {detail.members.length === 0 && <li className="rounded-2xl bg-gray-50 px-4 py-3 text-gray-500">No accounts yet — create the owner login below.</li>}
                              </ul>
                              <form onSubmit={handleCreateMember} className="mt-4 grid gap-3 md:grid-cols-2">
                                <input aria-label="Email" placeholder="Email" type="email" className={inputCls} value={memberForm.email} onChange={(e) => setMemberForm((p) => ({ ...p, email: e.target.value }))} />
                                <input aria-label="Password" placeholder="Password" type="password" autoComplete="new-password" className={inputCls} value={memberForm.password} onChange={(e) => setMemberForm((p) => ({ ...p, password: e.target.value }))} />
                                <input aria-label="Username (optional)" placeholder="Username (optional)" className={inputCls} value={memberForm.username} onChange={(e) => setMemberForm((p) => ({ ...p, username: e.target.value }))} />
                                <select aria-label="Role" className={inputCls} value={memberForm.role} onChange={(e) => setMemberForm((p) => ({ ...p, role: e.target.value }))}>
                                  <option value="owner">owner</option>
                                  <option value="admin">admin</option>
                                  <option value="manager">manager</option>
                                </select>
                                <button type="submit" disabled={!memberForm.email.trim() || !memberForm.password || loading} className={`md:col-span-2 ${primaryBtnCls}`}>
                                  <UserPlus className="h-5 w-5" /> Create account
                                </button>
                              </form>
                            </section>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            {tenants.length === 0 && !loading && (
              <div className="rounded-3xl border-2 border-dashed border-gray-300 bg-white p-12 text-center">
                <Building2 className="mx-auto h-14 w-14 text-gray-400" />
                <h2 className="mt-4 text-2xl font-bold text-gray-900">No tenants</h2>
                <p className="mt-2 text-gray-600">Create the first tenant to onboard a business.</p>
              </div>
            )}
          </>
        )}

        {/* ============================== ALL TILLS ============================== */}
        {tab === 'devices' && (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void loadDevices()} disabled={loading} className={ghostBtnCls}>
                <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <select aria-label="Filter by tenant" className={`${inputCls} w-auto min-w-[220px]`} value={deviceTenantFilter} onChange={(e) => setDeviceTenantFilter(e.target.value)}>
                <option value="">All tenants</option>
                {deviceData.tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
              </select>
              <button type="button" onClick={() => setShowCreateDevice((v) => !v)} className={primaryBtnCls}>
                <Plus className="h-5 w-5" /> Pair a new till
              </button>
            </div>

            {showCreateDevice && (
              <form onSubmit={handleCreateDevice} className="mb-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-lg">
                <h2 className="mb-4 text-2xl font-bold text-gray-900">Pair a new till</h2>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block font-semibold text-gray-800" htmlFor="device-tenant">Tenant</label>
                    <select id="device-tenant" className={inputCls} value={deviceForm.tenantId} onChange={(e) => setDeviceForm((p) => ({ ...p, tenantId: e.target.value, storeId: '' }))}>
                      <option value="">Select…</option>
                      {deviceData.tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-gray-800" htmlFor="device-store">Store</label>
                    <select id="device-store" className={inputCls} value={deviceForm.storeId} onChange={(e) => setDeviceForm((p) => ({ ...p, storeId: e.target.value }))} disabled={!deviceForm.tenantId}>
                      <option value="">Select…</option>
                      {deviceFormStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-gray-800" htmlFor="device-label">Till name</label>
                    <input id="device-label" className={inputCls} value={deviceForm.label} maxLength={80} placeholder="e.g. Front Counter" onChange={(e) => setDeviceForm((p) => ({ ...p, label: e.target.value }))} />
                  </div>
                </div>
                <button type="submit" disabled={!deviceForm.tenantId || !deviceForm.storeId || !deviceForm.label.trim() || loading} className={`mt-5 ${primaryBtnCls}`}>
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}
                  Create till and code
                </button>
              </form>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              {deviceData.devices.map((device) => {
                const latestCode = [...(device.device_pairing_codes ?? [])].sort((l, r) => r.created_at.localeCompare(l.created_at))[0];
                const hasLiveCode = device.status === 'provisioned' && latestCode && !latestCode.used_at && new Date(latestCode.expires_at).getTime() > Date.now();
                const busy = busyDeviceId === device.id;
                const renaming = renamingDevice?.id === device.id;
                return (
                  <article key={device.id} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gray-100">
                          <MonitorSmartphone className="h-7 w-7 text-gray-700" />
                        </div>
                        <div className="min-w-0">
                          {renaming ? (
                            <form onSubmit={handleRename} className="flex items-center gap-2">
                              <input
                                aria-label="Till name"
                                className={inputCls}
                                value={renamingDevice.label}
                                maxLength={80}
                                autoFocus
                                onChange={(e) => setRenamingDevice({ id: device.id, label: e.target.value })}
                              />
                              <button type="submit" disabled={!renamingDevice.label.trim() || loading} className={primaryBtnCls} aria-label="Save name">
                                <Check className="h-5 w-5" />
                              </button>
                              <button type="button" onClick={() => setRenamingDevice(null)} className={ghostBtnCls} aria-label="Cancel rename">
                                <X className="h-5 w-5" />
                              </button>
                            </form>
                          ) : (
                            <h2 className="truncate text-2xl font-bold text-gray-900">{device.label}</h2>
                          )}
                          <p className="mt-1 flex items-center gap-2 text-gray-600">
                            <Building2 className="h-4 w-4" /> {tenantsById.get(device.tenant_id) ?? 'Unknown tenant'}
                            <Store className="ml-2 h-4 w-4" /> {storesById.get(device.store_id) ?? 'Unknown store'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {device.status === 'enrolled' && (
                          <span className={`rounded-full border px-3 py-1 text-sm font-bold ${(presenceStyle[device.presence] ?? presenceStyle.unknown).cls}`}>
                            {(presenceStyle[device.presence] ?? presenceStyle.unknown).label}
                          </span>
                        )}
                        <span className={`rounded-full border px-3 py-1 text-sm font-bold capitalize ${deviceStatusStyle[device.status] ?? deviceStatusStyle.provisioned}`}>{device.status}</span>
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
                        <button type="button" onClick={() => void handleReissue(device.id)} disabled={busy} className={ghostBtnCls}>
                          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
                          Issue new code
                        </button>
                      )}
                      {!renaming && (
                        <button type="button" onClick={() => setRenamingDevice({ id: device.id, label: device.label })} disabled={busy} className={ghostBtnCls}>
                          <Pencil className="h-5 w-5" /> Rename
                        </button>
                      )}
                      {device.status !== 'revoked' && (
                        <button type="button" onClick={() => setRevokingDevice({ id: device.id, label: device.label })} disabled={busy} className={dangerBtnCls}>
                          <Ban className="h-5 w-5" /> Revoke
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            {deviceData.devices.length === 0 && !loading && (
              <div className="rounded-3xl border-2 border-dashed border-gray-300 bg-white p-12 text-center">
                <MonitorSmartphone className="mx-auto h-14 w-14 text-gray-400" />
                <h2 className="mt-4 text-2xl font-bold text-gray-900">No tills</h2>
                <p className="mt-2 text-gray-600">Create a till to generate its one-time pairing code.</p>
              </div>
            )}
          </>
        )}

        {/* ============================== AUDIT ============================== */}
        {tab === 'audit' && (
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Platform audit trail</h2>
              <button type="button" onClick={() => void loadAudit()} disabled={loading} className={ghostBtnCls}>
                <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>
            <ul className="divide-y divide-gray-100">
              {audit.entries.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-1 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{entry.action}</p>
                    <p className="truncate text-sm text-gray-500">{JSON.stringify(entry.target)}</p>
                  </div>
                  <p className="shrink-0 text-sm text-gray-500">
                    {audit.actors[entry.actor_user_id] ?? entry.actor_user_id} · {new Date(entry.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
              {audit.entries.length === 0 && <li className="py-3 text-gray-500">No platform actions recorded yet.</li>}
            </ul>
          </div>
        )}
      </div>

      {deletingTenant && (
        <ConfirmDialog
          tone="danger"
          title={t('platformConsole.deleteTenantConfirmTitle')}
          message={`Delete “${deletingTenant.name}” permanently? Only possible while the tenant has NO sales and NO fiscal documents — its stores, accounts, and tills are removed. This cannot be undone.`}
          cancelLabel="Cancel"
          confirmLabel="Yes, delete"
          onCancel={() => setDeletingTenant(null)}
          onConfirm={confirmDeleteTenant}
        />
      )}
      {removingMember && (
        <ConfirmDialog
          tone="danger"
          title="Remove account?"
          message={`Remove ${removingMember.member.email ?? removingMember.member.user_id} from this tenant? Their access (including push and WhatsApp) stops.`}
          cancelLabel="Cancel"
          confirmLabel="Yes, remove"
          onCancel={() => setRemovingMember(null)}
          onConfirm={confirmRemoveMember}
        />
      )}
      {revokingDevice && (
        <ConfirmDialog
          tone="danger"
          title="Revoke till?"
          message={`Revoke “${revokingDevice.label}”? This till will lose access and cannot be restored from this screen.`}
          cancelLabel="Cancel"
          confirmLabel="Yes, revoke"
          onCancel={() => setRevokingDevice(null)}
          onConfirm={() => void confirmRevokeDevice()}
        />
      )}

      {editingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={`Edit ${editingTenant.name}`}>
          <form onSubmit={handleSaveTenant} className="ds2-visual-scope w-full max-w-2xl rounded-3xl bg-white p-8 shadow-2xl" style={visualStyle} data-ds2-neutral={prefs.neutralFamilyId}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Edit tenant</h2>
              <button type="button" onClick={() => setEditingTenant(null)} className="min-h-touch-xs min-w-[44px] rounded-2xl p-2 text-gray-700 hover:bg-gray-100" aria-label="Close">
                <X className="mx-auto h-6 w-6" />
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block font-semibold text-gray-800" htmlFor="edit-name">Business name</label>
                <input id="edit-name" className={inputCls} value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-gray-800" htmlFor="edit-legal">Legal name</label>
                <input id="edit-legal" className={inputCls} value={editForm.legal_name} onChange={(e) => setEditForm((p) => ({ ...p, legal_name: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-gray-800" htmlFor="edit-nif">NIF</label>
                <input id="edit-nif" className={inputCls} value={editForm.nif} onChange={(e) => setEditForm((p) => ({ ...p, nif: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-gray-800" htmlFor="edit-country">Country</label>
                <input id="edit-country" className={inputCls} value={editForm.country} maxLength={2} onChange={(e) => setEditForm((p) => ({ ...p, country: e.target.value.toUpperCase() }))} />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-gray-800" htmlFor="edit-status">Status</label>
                <select id="edit-status" className={inputCls} value={editForm.status} onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value }))}>
                  {TENANT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block font-semibold text-gray-800" htmlFor="edit-plan">Plan</label>
                <select id="edit-plan" className={inputCls} value={editForm.subscription_plan} onChange={(e) => setEditForm((p) => ({ ...p, subscription_plan: e.target.value }))}>
                  {SUBSCRIPTION_PLANS.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setEditingTenant(null)} className={ghostBtnCls}>Cancel</button>
              <button type="submit" disabled={loading || !editForm.name.trim() || !editForm.legal_name.trim() || !editForm.nif.trim()} className={primaryBtnCls}>
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                Save changes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default PlatformConsole;
