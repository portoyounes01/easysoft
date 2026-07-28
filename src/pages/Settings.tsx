import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import ReceiptLogoPicker from '../components/ReceiptLogoPicker';
import { readDevicePairingScope } from '../utils/devicePairingStorage';
import { DialogSwitch } from '../components/ui/dialogParts';
import { AdminActionButton } from '../components/ui/AdminActionButton';
import { TableActionButton } from '../components/ui/TableActionButton';
import { TabToggle } from '../components/ui/TabToggle';
import { useSearchParams } from 'react-router-dom';
import {
    AlertTriangle,
    BadgeCheck,
    Bell,
    Building2,
    CheckCircle,
    ChevronRight,
    Clock,
    Cloud,
    CreditCard,
    Database,
    DollarSign,
    FileDown,
    Mail,
    FileText,
    Gift,
    KeyRound,
    Languages,
    CalendarDays,
    DownloadCloud,
    Monitor,
    PackageCheck,
    Plus,
    Printer,
    Receipt,
    RotateCcw,
    Save,
    Settings as SettingsIcon,
    Shield,
    Store,
    Ticket,
    Trash2,
    Weight,
    Wifi,
    type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../contexts/SettingsContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import type { LoyaltyVoucher, SystemSettings } from '../contexts/SettingsContext';
import { cloneSettingsSnapshot, logCommittedSettingsChanges } from '../fiscal/fiscalAuditLog';
import { buildSaftAuditFileXml } from '../fiscal/saft/exportSaft';
import { buildChainScope, computeSeriesKey } from '../fiscal/seriesUtils';
import { checkVendusFiscalHealth, fetchVendusSaftXml } from '../fiscal/vendusFiscalIssuer';
import type { FiscalSeriesDocKey, ReceiptSeriesProfile } from '../fiscal/receiptSeriesProfile';
import { initializeLocalDatabase, transactionLocalService } from '../lib/localDatabase';
import { ivaRatesForCountry } from '../types/supabase';
import { getCountryProfile, OPERATING_COUNTRIES, type OperatingCountry } from '../lib/countryProfile';
import { useLanguage } from '../contexts/LanguageContext';
import { isSystemAdministrator } from '../utils/systemAdmin';
import { generateUUID } from '../utils/uuid';
import type { ReceiptLanguage } from '../utils/receiptLanguage';
import { PrinterSettingsPanel, type HardwareSettingsTool } from './PrinterTestPage';
import ScaleSettingsPanel from '../components/ScaleSettingsPanel';
import UpdateSettingsPanel from '../components/UpdateSettingsPanel';
import NotificationSettings from '../components/notifications/NotificationSettings';
import { isPwaHost } from '../lib/host';
import { SeedManagementPanel } from './SeedManagement';
import { CashierTestingPanel } from './CashierTesting';
import { ElectronTestingPanel } from './ElectronCashierTesting';
import { useDesignSystem2Customization } from '../contexts/DesignSystem2CustomizationContext';
import '../styles/design-system-2-scope.css';

type SettingsTabId = 'security' | 'pos' | 'loyalty' | 'hr' | 'display' | 'hardware' | 'company' | 'alerts';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type VendusCheckStatus = 'idle' | 'checking' | 'ok' | 'error';

const glassCard =
    'rounded-[2rem] border border-white/70 bg-white/80 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur-xl';
const fieldClass =
    'min-h-touch-sm w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-base font-medium text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-200';
const subtleFieldClass =
    'min-h-touch-sm w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-base font-medium text-slate-900 outline-none transition-all duration-200 focus:border-slate-400 focus:ring-4 focus:ring-slate-200';

// Editable starting points for the monthly holiday accrual rate (days/month),
// roughly aligned with the statutory annual minimum in each country. These are
// convenience presets, not legal advice — managers adjust the rate to match the
// applicable collective agreement.
const HOLIDAY_ACCRUAL_PRESETS = [
    { id: 'portugal', label: 'Portugal (~22 days/year)', rate: 1.83 },
    { id: 'spain', label: 'Spain (~30 days/year)', rate: 2.5 },
    { id: 'belgium', label: 'Belgium (~20 days/year)', rate: 1.67 },
] as const;

interface SettingCardProps {
    title: string;
    description?: string;
    icon: LucideIcon;
    children: React.ReactNode;
    accent?: string;
    className?: string;
}

const SettingCard: React.FC<SettingCardProps> = ({
    title,
    description,
    icon: Icon,
    children,
    accent = 'from-slate-900 to-slate-700',
    className = '',
}) => (
    <section className={`${glassCard} overflow-hidden ${className}`}>
        <div className="flex items-start gap-4 border-b border-slate-200/70 px-6 py-5">
            <div className={`rounded-2xl bg-gradient-to-br ${accent} p-3 text-white shadow-lg`}>
                <Icon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
                <h2 className="text-xl font-semibold tracking-tight text-slate-950">{title}</h2>
                {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>}
            </div>
        </div>
        <div className="p-5 sm:p-6">{children}</div>
    </section>
);

interface SettingsRowProps {
    title: string;
    description?: string;
    icon?: LucideIcon;
    children: React.ReactNode;
}

const SettingsRow: React.FC<SettingsRowProps> = ({ title, description, icon: Icon, children }) => (
    <div
        className="flex flex-col gap-4 border-b border-slate-200/70 px-1 py-5 last:border-b-0 md:flex-row md:flex-wrap md:items-center"
        data-settings-row-title={title}
    >
        <div className="flex min-w-0 gap-3 md:min-w-56 md:flex-[1_1_16rem]">
            {Icon && (
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                    <Icon className="h-5 w-5" />
                </div>
            )}
            <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-950">{title}</h3>
                {description && <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>}
            </div>
        </div>
        <div className="min-w-0 md:ml-auto md:flex-[1_1_17.5rem] md:max-w-[26.25rem]">{children}</div>
    </div>
);

interface ToggleSwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ checked, onChange, label }) => (
    <DialogSwitch checked={checked} onChange={() => onChange(!checked)} label={label} />
);

interface SegmentOption<T extends string> {
    value: T;
    label: string;
    description?: string;
}

function SegmentedControl<T extends string>({
    value,
    options,
    onChange,
}: {
    value: T;
    options: SegmentOption<T>[];
    onChange: (value: T) => void;
}) {
    return <TabToggle options={options} value={value} onChange={onChange} />;
}

interface StatusPillProps {
    label: string;
    tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue';
}

const StatusPill: React.FC<StatusPillProps> = ({ label, tone = 'slate' }) => {
    const tones: Record<NonNullable<StatusPillProps['tone']>, string> = {
        slate: 'bg-slate-100 text-slate-700 ring-slate-200',
        green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
        amber: 'bg-amber-50 text-amber-700 ring-amber-200',
        red: 'bg-rose-50 text-rose-700 ring-rose-200',
        blue: 'bg-blue-50 text-blue-700 ring-blue-200',
    };
    return (
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${tones[tone]}`}>
            {label}
        </span>
    );
};

interface ReadinessItem {
    label: string;
    ok: boolean;
    detail: string;
}

const ReadinessList: React.FC<{ items: ReadinessItem[] }> = ({ items }) => (
    <div className="space-y-3">
        {items.map(item => (
            <div key={item.label} className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                <div
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                        item.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}
                >
                    {item.ok ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                </div>
                <div>
                    <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                    <p className="text-xs leading-5 text-slate-500">{item.detail}</p>
                </div>
            </div>
        ))}
    </div>
);

const Settings: React.FC = () => {
    const { settings, updateSettings, resetToDefaults, isLoading } = useSettings();
    const { employee, principal } = useSupabaseAuth();
    // Owner (a membership human with no employee row) is the tenant's top authority and
    // gets the system-admin surface; till SYS001 keeps it via isSystemAdministrator.
    const isSystemAdmin = isSystemAdministrator(employee) || principal?.role === 'owner';
    const { t } = useTranslation();
    const { setLanguage } = useLanguage();
    const countryProfile = getCountryProfile(settings.operatingCountry);
    const [searchParams] = useSearchParams();
    const { visualStyle, prefs, layoutClasses } = useDesignSystem2Customization();
    const [activeTab, setActiveTab] = useState<SettingsTabId>('security');
    const [hardwareTool, setHardwareTool] = useState<HardwareSettingsTool>('printer');
    // Phase 0 hardening: seed/cashier/electron panels are dev-only; the 'printer' panel is always available.
    const devToolsEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DANGEROUS_DATA_TOOLS === 'true';
    const [pendingChanges, setPendingChanges] = useState(false);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [saftStart, setSaftStart] = useState(() => new Date().toISOString().slice(0, 10));
    const [saftEnd, setSaftEnd] = useState(() => new Date().toISOString().slice(0, 10));
    const [saftBusy, setSaftBusy] = useState(false);
    const [saftMessage, setSaftMessage] = useState<string | null>(null);
    const [vendusCheck, setVendusCheck] = useState<{ status: VendusCheckStatus; message: string }>({
        status: 'idle',
        message: '',
    });
    const [externalCheck, setExternalCheck] = useState<{ status: VendusCheckStatus; message: string }>({
        status: 'idle',
        message: '',
    });
    const [chainTips, setChainTips] = useState<Record<FiscalSeriesDocKey, string | null>>({
        FS: null,
        FT: null,
        NC: null,
    });
    const [seriesEditorKey, setSeriesEditorKey] = useState<FiscalSeriesDocKey>('FT');
    const savedSettingsBaselineRef = useRef<SystemSettings | null>(null);

    const seriesProfilesFingerprint = useMemo(
        () => JSON.stringify(settings.receipt.seriesProfiles),
        [settings.receipt.seriesProfiles]
    );

    const tabs = useMemo(
        () => [
            {
                id: 'security' as const,
                label: t('settings.tabSecurityLabel'),
                icon: Shield,
                description: t('settings.tabSecurityDesc'),
            },
            {
                id: 'pos' as const,
                label: t('settings.tabPosLabel'),
                icon: DollarSign,
                description: t('settings.tabPosDesc'),
            },
            {
                id: 'loyalty' as const,
                label: t('settings.tabLoyaltyLabel'),
                icon: Gift,
                description: t('settings.tabLoyaltyDesc'),
            },
            {
                id: 'hr' as const,
                label: t('settings.tabHrLabel'),
                icon: CalendarDays,
                description: t('settings.tabHrDesc'),
            },
            {
                id: 'display' as const,
                label: t('settings.tabDisplayLabel'),
                icon: Monitor,
                description: t('settings.tabDisplayDesc'),
            },
            {
                id: 'hardware' as const,
                label: t('settings.tabHardwareLabel'),
                icon: Printer,
                description: t('settings.tabHardwareDesc'),
            },
            {
                id: 'company' as const,
                label: t('settings.tabCompanyLabel'),
                icon: SettingsIcon,
                description: t('settings.tabCompanyDesc'),
            },
            // Alert thresholds drive the server-side notification triggers — PWA-admin concern only.
            ...(isPwaHost
                ? [{
                    id: 'alerts' as const,
                    label: t('settings.tabAlertsLabel'),
                    icon: Bell,
                    description: t('settings.tabAlertsDesc'),
                }]
                : []),
        ],
        [t]
    );

    const vendusReadiness = useMemo<ReadinessItem[]>(
        () => [
            {
                label: t('settings.vendusReadyRegisterLabel'),
                ok: Boolean(settings.fiscal.vendus.registerId.trim()),
                detail: settings.fiscal.vendus.registerId.trim()
                    ? t('settings.vendusReadyRegisterDetailSet', { id: settings.fiscal.vendus.registerId.trim() })
                    : t('settings.vendusReadyRegisterDetailUnset'),
            },
            {
                label: t('settings.vendusReadyPaymentLabel'),
                ok: Boolean(
                    settings.fiscal.vendus.paymentMethodIds.cash?.trim() &&
                        settings.fiscal.vendus.paymentMethodIds.card?.trim() &&
                        settings.fiscal.vendus.paymentMethodIds.mixed?.trim()
                ),
                detail: t('settings.vendusReadyPaymentDetail'),
            },
            {
                label: t('settings.vendusReadyOutputLabel'),
                ok: Boolean(settings.fiscal.vendus.output),
                detail: t('settings.vendusReadyOutputDetail', { output: settings.fiscal.vendus.output.toUpperCase() }),
            },
            {
                label: t('settings.vendusReadyEnvLabel'),
                ok: true,
                detail:
                    settings.fiscal.vendus.mode === 'normal'
                        ? t('settings.vendusReadyEnvNormal')
                        : t('settings.vendusReadyEnvTests'),
            },
        ],
        [settings.fiscal.vendus, t]
    );

    const vendusReadyCount = vendusReadiness.filter(item => item.ok).length;
    const fiscalIssuerLabel =
        settings.fiscal.issuer === 'vendus'
            ? 'Vendus'
            : settings.fiscal.issuer === 'invoicexpress'
                ? 'InvoiceXpress'
                : settings.fiscal.issuer === 'fiskaly'
                    ? 'Fiskaly'
                    : settings.fiscal.issuer === 'sign_es'
                        ? 'SIGN ES'
                        : 'Local AT';
    const isExternalIssuer =
        settings.fiscal.issuer === 'invoicexpress' || settings.fiscal.issuer === 'fiskaly';
    const activeTabMeta = tabs.find(tab => tab.id === activeTab) ?? tabs[0];

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                await initializeLocalDatabase();
                const now = new Date();
                const next: Record<FiscalSeriesDocKey, string | null> = { FS: null, FT: null, NC: null };
                const keys: FiscalSeriesDocKey[] = ['FT', 'NC'];
                for (const key of keys) {
                    const prof = settings.receipt.seriesProfiles[key];
                    const at = prof.atValidationCode.trim();
                    if (!at) continue;
                    const seriesKey = computeSeriesKey(prof, now);
                    const chainScope = buildChainScope(at, seriesKey);
                    const last = await transactionLocalService.getLastFiscalDocumentInChain(chainScope);
                    next[key] = last?.invoice_no ?? null;
                }
                if (!cancelled) setChainTips(next);
            } catch {
                if (!cancelled) setChainTips({ FS: null, FT: null, NC: null });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [seriesProfilesFingerprint, settings.receipt.seriesProfiles]);

    useEffect(() => {
        if (!isLoading && savedSettingsBaselineRef.current === null) {
            savedSettingsBaselineRef.current = cloneSettingsSnapshot(settings);
        }
    }, [isLoading, settings]);

    useEffect(() => {
        const hw = searchParams.get('hw');
        const allowed: HardwareSettingsTool[] = devToolsEnabled
            ? ['printer', 'scale', 'updates', 'seed', 'cashier', 'electron']
            : ['printer', 'scale', 'updates'];
        if (hw && (allowed as string[]).includes(hw)) {
            setActiveTab('hardware');
            setHardwareTool(hw as HardwareSettingsTool);
        }
    }, [searchParams, devToolsEnabled]);

    const markChanged = useCallback(() => {
        setPendingChanges(true);
        setSaveStatus('idle');
    }, []);

    const handleSettingsChange = useCallback(
        (category: string, field: string, value: unknown) => {
            updateSettings({ [category]: { [field]: value } } as Parameters<typeof updateSettings>[0]);
            markChanged();
        },
        [markChanged, updateSettings]
    );

    const handleReceiptProfileChange = useCallback(
        (key: FiscalSeriesDocKey, field: keyof ReceiptSeriesProfile, value: string | number | boolean | undefined) => {
            updateSettings({
                receipt: {
                    seriesProfiles: {
                        [key]: { [field]: value },
                    },
                },
            } as Parameters<typeof updateSettings>[0]);
            markChanged();
        },
        [markChanged, updateSettings]
    );

    const updateVouchers = useCallback(
        (vouchers: LoyaltyVoucher[]) => {
            updateSettings({ loyalty: { vouchers } });
            markChanged();
        },
        [markChanged, updateSettings]
    );

    const handleAddVoucher = useCallback(() => {
        updateVouchers([
            ...settings.loyalty.vouchers,
            {
                id: generateUUID(),
                code: '',
                description: '',
                type: 'fixed',
                value: 0,
                enabled: true,
            },
        ]);
    }, [settings.loyalty.vouchers, updateVouchers]);

    const handleVoucherChange = useCallback(
        (id: string, patch: Partial<LoyaltyVoucher>) => {
            updateVouchers(
                settings.loyalty.vouchers.map(voucher =>
                    voucher.id === id ? { ...voucher, ...patch } : voucher
                )
            );
        },
        [settings.loyalty.vouchers, updateVouchers]
    );

    const [pendingTrainingMode, setPendingTrainingMode] = useState<boolean | null>(null);

    const handleTrainingModeChange = useCallback(
        (next: boolean) => {
            setPendingTrainingMode(next);
        },
        []
    );

    const confirmTrainingModeChange = useCallback(
        () => {
            if (pendingTrainingMode === null) return;
            const next = pendingTrainingMode;
            setPendingTrainingMode(null);
            try {
                if (next) {
                    localStorage.setItem('pos_dexie_slot', 'training');
                } else {
                    localStorage.removeItem('pos_dexie_slot');
                }
            } catch {
                /* ignore */
            }
            updateSettings({ fiscal: { trainingMode: next } });
            setPendingChanges(false);
            window.setTimeout(() => window.location.reload(), 200);
        },
        [pendingTrainingMode, updateSettings]
    );

    const handleFiscalIssuerChange = useCallback(
        (issuer: SystemSettings['fiscal']['issuer']) => {
            updateSettings({
                fiscal: {
                    issuer,
                    vendus: { enabled: issuer === 'vendus' },
                    invoicexpress: { enabled: issuer === 'invoicexpress' },
                    fiskaly: { enabled: issuer === 'fiskaly' },
                },
            });
            markChanged();
        },
        [markChanged, updateSettings]
    );

    const handleOperatingCountryChange = useCallback(
        (country: OperatingCountry) => {
            const profile = getCountryProfile(country);
            // Switching country resets the fiscal issuer to the country's only/default valid
            // issuer (ES ⇒ sign_es; PT ⇒ local_at), the standard IVA rate, and the default
            // UI + receipt language. The user can still re-pick language afterwards.
            updateSettings({
                operatingCountry: country,
                pos: { taxRate: profile.defaultVatRate },
                receipt: { receiptLanguage: profile.defaultLanguage },
                fiscal: {
                    issuer: profile.defaultFiscalIssuer,
                    vendus: { enabled: profile.defaultFiscalIssuer === 'vendus' },
                    invoicexpress: { enabled: profile.defaultFiscalIssuer === 'invoicexpress' },
                    fiskaly: { enabled: profile.defaultFiscalIssuer === 'fiskaly' },
                },
            } as Parameters<typeof updateSettings>[0]);
            setLanguage(profile.defaultLanguage);
            markChanged();
        },
        [markChanged, updateSettings, setLanguage]
    );

    const handleInvoiceXpressSettingChange = useCallback(
        <K extends keyof SystemSettings['fiscal']['invoicexpress']>(
            field: K,
            value: SystemSettings['fiscal']['invoicexpress'][K]
        ) => {
            updateSettings({
                fiscal: { invoicexpress: { [field]: value } },
            } as Parameters<typeof updateSettings>[0]);
            setExternalCheck({ status: 'idle', message: '' });
            markChanged();
        },
        [markChanged, updateSettings]
    );

    const handleFiskalySettingChange = useCallback(
        <K extends keyof SystemSettings['fiscal']['fiskaly']>(
            field: K,
            value: SystemSettings['fiscal']['fiskaly'][K]
        ) => {
            updateSettings({
                fiscal: { fiskaly: { [field]: value } },
            } as Parameters<typeof updateSettings>[0]);
            setExternalCheck({ status: 'idle', message: '' });
            markChanged();
        },
        [markChanged, updateSettings]
    );

    const handleExternalHealthCheck = useCallback(async () => {
        setExternalCheck({ status: 'checking', message: t('settings.extCheckContacting') });
        try {
            if (settings.fiscal.issuer === 'invoicexpress') {
                const { checkInvoiceXpressFiscalHealth } = await import('../fiscal/invoicexpressFiscalIssuer');
                const result = await checkInvoiceXpressFiscalHealth(settings);
                setExternalCheck({
                    status: result.ok ? 'ok' : 'error',
                    message: result.ok
                        ? t('settings.extCheckIxOk')
                        : t('settings.extCheckIxNotReady'),
                });
            } else if (settings.fiscal.issuer === 'fiskaly') {
                const { checkFiskalyFiscalHealth } = await import('../fiscal/fiskalyFiscalIssuer');
                const result = await checkFiskalyFiscalHealth(settings);
                setExternalCheck({
                    status: result.ok ? 'ok' : 'error',
                    message: result.ok
                        ? t('settings.extCheckFkOk')
                        : t('settings.extCheckFkNotReady'),
                });
            }
        } catch (error) {
            setExternalCheck({
                status: 'error',
                message: error instanceof Error ? error.message : t('settings.extCheckFail'),
            });
        }
    }, [settings, t]);

    const handleVendusSettingChange = useCallback(
        <K extends keyof SystemSettings['fiscal']['vendus']>(
            field: K,
            value: SystemSettings['fiscal']['vendus'][K]
        ) => {
            updateSettings({
                fiscal: {
                    vendus: {
                        [field]: value,
                    },
                },
            } as Parameters<typeof updateSettings>[0]);
            setVendusCheck({ status: 'idle', message: '' });
            markChanged();
        },
        [markChanged, updateSettings]
    );

    const handleVendusPaymentMethodChange = useCallback(
        (method: keyof SystemSettings['fiscal']['vendus']['paymentMethodIds'], value: string) => {
            updateSettings({
                fiscal: {
                    vendus: {
                        paymentMethodIds: {
                            [method]: value,
                        },
                    },
                },
            } as Parameters<typeof updateSettings>[0]);
            setVendusCheck({ status: 'idle', message: '' });
            markChanged();
        },
        [markChanged, updateSettings]
    );

    const handleVendusExemptTaxChange = useCallback(
        (field: keyof SystemSettings['fiscal']['vendus']['exemptTax'], value: string) => {
            updateSettings({
                fiscal: {
                    vendus: {
                        exemptTax: {
                            [field]: value,
                        },
                    },
                },
            } as Parameters<typeof updateSettings>[0]);
            markChanged();
        },
        [markChanged, updateSettings]
    );

    const handleVendusHealthCheck = useCallback(async () => {
        setVendusCheck({ status: 'checking', message: t('settings.vendusCheckChecking') });
        try {
            const result = await checkVendusFiscalHealth(settings);
            setVendusCheck({
                status: result.ok ? 'ok' : 'error',
                message: result.ok
                    ? t('settings.vendusCheckOk')
                    : t('settings.vendusCheckNotReady'),
            });
        } catch (error) {
            setVendusCheck({
                status: 'error',
                message: error instanceof Error ? error.message : t('settings.vendusCheckFail'),
            });
        }
    }, [settings, t]);

    const handleSave = useCallback(async () => {
        setSaveStatus('saving');
        try {
            const baseline = savedSettingsBaselineRef.current ?? cloneSettingsSnapshot(settings);
            await logCommittedSettingsChanges(baseline, settings, employee?.id);
            savedSettingsBaselineRef.current = cloneSettingsSnapshot(settings);
            setSaveStatus('saved');
            setPendingChanges(false);
        } catch (error) {
            console.error('Failed to save settings audit log:', error);
            setSaveStatus('error');
        }

        setTimeout(() => {
            setSaveStatus('idle');
        }, 2000);
    }, [employee?.id, settings]);

    const handleReset = useCallback(() => {
        if (confirm(t('settings.confirm.resetAll'))) {
            resetToDefaults();
            savedSettingsBaselineRef.current = null;
            setPendingChanges(false);
            setSaveStatus('idle');
        }
    }, [resetToDefaults, t]);

    const handleExportSaft = useCallback(async () => {
        setSaftBusy(true);
        setSaftMessage(null);
        try {
            if (settings.fiscal.issuer === 'vendus') {
                const [startYear, startMonth] = saftStart.split('-').map(Number);
                const [endYear, endMonth] = saftEnd.split('-').map(Number);
                if (startYear !== endYear || startMonth !== endMonth) {
                    throw new Error(
                        isSystemAdmin
                            ? t('settings.saftMonthlyAdminVendus')
                            : t('settings.saftMonthly')
                    );
                }
                const xml = await fetchVendusSaftXml({
                    settings,
                    year: startYear,
                    month: startMonth,
                });
                const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = isSystemAdmin
                    ? `SAFT_VENDUS_${startYear}_${String(startMonth).padStart(2, '0')}.xml`
                    : `SAFT_${startYear}_${String(startMonth).padStart(2, '0')}.xml`;
                a.click();
                URL.revokeObjectURL(url);
                setSaftMessage(
                    isSystemAdmin
                        ? t('settings.saftVendusDownloadedAdmin')
                        : t('settings.saftDownloadedNonAdmin')
                );
                return;
            }

            if (isExternalIssuer) {
                const [startYear, startMonth] = saftStart.split('-').map(Number);
                const [endYear, endMonth] = saftEnd.split('-').map(Number);
                if (startYear !== endYear || startMonth !== endMonth) {
                    throw new Error(
                        isSystemAdmin
                            ? t('settings.saftMonthlyAdminCloud')
                            : t('settings.saftMonthly')
                    );
                }
                // fiskaly (unified API) delivers SAF-T as a zip artifact; InvoiceXpress as bare XML.
                let blob: Blob;
                let extension: 'xml' | 'zip';
                if (settings.fiscal.issuer === 'invoicexpress') {
                    const xml = await (await import('../fiscal/invoicexpressFiscalIssuer')).fetchInvoiceXpressSaftXml({
                        settings,
                        year: startYear,
                        month: startMonth,
                    });
                    blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
                    extension = 'xml';
                } else {
                    const archive = await (await import('../fiscal/fiskalyFiscalIssuer')).fetchFiskalySaftArchive({
                        settings,
                        year: startYear,
                        month: startMonth,
                    });
                    blob = new Blob([archive.bytes], { type: archive.mimeType });
                    extension = archive.mimeType.includes('zip') ? 'zip' : 'xml';
                }
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = isSystemAdmin
                    ? `SAFT_${settings.fiscal.issuer.toUpperCase()}_${startYear}_${String(startMonth).padStart(2, '0')}.${extension}`
                    : `SAFT_${startYear}_${String(startMonth).padStart(2, '0')}.${extension}`;
                a.click();
                URL.revokeObjectURL(url);
                setSaftMessage(
                    isSystemAdmin
                        ? t('settings.saftCloudDownloadedAdmin', { issuer: fiscalIssuerLabel })
                        : t('settings.saftDownloadedNonAdmin')
                );
                return;
            }

            const fiscalDocs = await transactionLocalService.getFiscalDocumentsByDateRange(saftStart, saftEnd);
            const xml = await buildSaftAuditFileXml({
                settings,
                startDateYmd: saftStart,
                endDateYmd: saftEnd,
                fiscalDocuments: fiscalDocs,
                loadTransaction: id => transactionLocalService.getTransactionById(id),
                productVersion: '0.1.0',
            });
            const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `SAFT_PT_${saftStart}_${saftEnd}.xml`;
            a.click();
            URL.revokeObjectURL(url);
            const batchId = generateUUID();
            const exportedAt = new Date().toISOString();
            await transactionLocalService.markFiscalDocumentsSaftExported(
                fiscalDocs.map(d => d.id),
                batchId,
                exportedAt
            );
            await transactionLocalService.appendFiscalAuditEvent({
                event_type: 'SAFT_EXPORTED',
                payload_json: JSON.stringify({
                    startDateYmd: saftStart,
                    endDateYmd: saftEnd,
                    documentCount: fiscalDocs.length,
                    batchId,
                    exportedAt,
                }),
                employee_id: null,
            });
            setSaftMessage(t('settings.messages.saftExported', { count: fiscalDocs.length }));
        } catch (error) {
            setSaftMessage(error instanceof Error ? error.message : t('settings.messages.saftExportFail'));
        } finally {
            setSaftBusy(false);
        }
    }, [fiscalIssuerLabel, isExternalIssuer, isSystemAdmin, saftEnd, saftStart, settings, t]);

    const renderSaveLabel = () => {
        if (saveStatus === 'saving') return t('settings.saveSaving');
        if (saveStatus === 'saved') return t('settings.saveSaved');
        if (saveStatus === 'error') return t('settings.saveRetry');
        return t('settings.saveChangesLabel');
    };

    const renderSecurity = () => (
        <div className="space-y-6">
            <SettingCard
                title={t('settings.securityCardTitle')}
                description={t('settings.securityCardDesc')}
                icon={Shield}
                accent="from-blue-600 to-sky-500"
            >
                <SettingsRow
                    title={t('settings.autoLockTitle')}
                    description={t('settings.autoLockDesc')}
                    icon={Clock}
                >
                    <div className="flex justify-end">
                        <ToggleSwitch
                            checked={settings.autoLogout.enabled}
                            onChange={checked => handleSettingsChange('autoLogout', 'enabled', checked)}
                            label={t('settings.autoLockToggleAria')}
                        />
                    </div>
                </SettingsRow>

                <SettingsRow title={t('settings.lockAfterTitle')} description={t('settings.lockAfterDesc')} icon={Bell}>
                    <select
                        value={settings.autoLogout.timeoutMinutes}
                        onChange={event => handleSettingsChange('autoLogout', 'timeoutMinutes', parseInt(event.target.value, 10))}
                        className={fieldClass}
                        disabled={!settings.autoLogout.enabled}
                    >
                        {[1, 5, 10, 15, 20, 30, 45, 60, 120].map(minutes => (
                            <option key={minutes} value={minutes}>
                                {minutes < 60
                                    ? t('settings.minutesOption', { count: minutes })
                                    : minutes === 60
                                        ? t('settings.oneHour')
                                        : t('settings.hoursOption', { count: minutes / 60 })}
                            </option>
                        ))}
                    </select>
                </SettingsRow>

                <SettingsRow title={t('settings.warnBeforeTitle')} description={t('settings.warnBeforeDesc')} icon={AlertTriangle}>
                    <select
                        value={settings.autoLogout.warningSeconds}
                        onChange={event => handleSettingsChange('autoLogout', 'warningSeconds', parseInt(event.target.value, 10))}
                        className={fieldClass}
                        disabled={!settings.autoLogout.enabled}
                    >
                        {[10, 15, 30, 45, 60, 90, 120].map(seconds => (
                            <option key={seconds} value={seconds}>
                                {t('settings.secondsOption', { count: seconds })}
                            </option>
                        ))}
                    </select>
                </SettingsRow>

                <SettingsRow
                    title={t('settings.protectSalesTitle')}
                    description={t('settings.protectSalesDesc')}
                    icon={PackageCheck}
                >
                    <div className="flex justify-end">
                        <ToggleSwitch
                            checked={settings.autoLogout.protectWhenCartHasItems}
                            onChange={checked => handleSettingsChange('autoLogout', 'protectWhenCartHasItems', checked)}
                            label={t('settings.protectSalesAria')}
                        />
                    </div>
                </SettingsRow>
            </SettingCard>
        </div>
    );

    const renderPos = () => (
        <div className="space-y-6">
            <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,32rem),1fr))]">
                <SettingCard
                    title={t('settings.moneyVatTitle')}
                    description={t('settings.moneyVatDesc')}
                    icon={DollarSign}
                    accent="from-emerald-600 to-teal-500"
                >
                    <SettingsRow title={t('settings.currencySymbolTitle')} description={t('settings.currencySymbolDesc')}>
                        <select
                            value={settings.pos.currencySymbol}
                            onChange={event => handleSettingsChange('pos', 'currencySymbol', event.target.value)}
                            className={fieldClass}
                        >
                            <option value="€">{t('settings.currencyEuro')}</option>
                            <option value="$">{t('settings.currencyDollar')}</option>
                            <option value="£">{t('settings.currencyPound')}</option>
                            <option value="¥">{t('settings.currencyYen')}</option>
                        </select>
                    </SettingsRow>
                    <SettingsRow title={t('settings.defaultIvaTitle')} description={t('settings.defaultIvaDesc')}>
                        <select
                            value={settings.pos.taxRate}
                            onChange={event => handleSettingsChange('pos', 'taxRate', parseFloat(event.target.value))}
                            className={fieldClass}
                        >
                            {(() => {
                                const rates = ivaRatesForCountry(settings.operatingCountry).map((r) => ({ value: r.value as number, label: r.label as string }));
                                if (!rates.some((r) => r.value === settings.pos.taxRate)) {
                                    rates.unshift({ value: settings.pos.taxRate, label: `${Math.round(settings.pos.taxRate * 100)}%` });
                                }
                                return rates.map((rate) => (
                                    <option key={rate.value} value={rate.value}>
                                        {rate.label}
                                    </option>
                                ));
                            })()}
                        </select>
                    </SettingsRow>
                </SettingCard>

                <SettingCard
                    title={t('settings.inventoryTitle')}
                    description={t('settings.inventoryDesc')}
                    icon={Database}
                    accent="from-orange-500 to-amber-500"
                >
                    <SettingsRow title={t('settings.pos.trackInventory')} description={t('settings.trackInventoryDesc')}>
                        <div className="flex justify-end">
                            <ToggleSwitch
                                checked={settings.pos.trackInventory}
                                onChange={checked => handleSettingsChange('pos', 'trackInventory', checked)}
                                label={t('settings.pos.trackInventory')}
                            />
                        </div>
                    </SettingsRow>
                    <SettingsRow title={t('settings.allowNegativeStockTitle')} description={t('settings.allowNegativeStockDesc')}>
                        <div className="flex justify-end">
                            <ToggleSwitch
                                checked={settings.pos.allowNegativeStock}
                                onChange={checked => handleSettingsChange('pos', 'allowNegativeStock', checked)}
                                label={t('settings.allowNegativeStockTitle')}
                            />
                        </div>
                    </SettingsRow>
                    {/*
                      AGENTS: Stock/inventory settings were previously kept as a do-not-delete commented block.
                      They are intentionally re-enabled here as first-class POS controls.
                    */}
                </SettingCard>
            </div>

            <SettingCard
                title={t('settings.cartBehaviorTitle')}
                description={t('settings.cartBehaviorDesc')}
                icon={Clock}
                accent="from-yellow-500 to-orange-500"
            >
                <SettingsRow title={t('settings.autoClearTitle')} description={t('settings.autoClearDesc')}>
                    <div className="flex justify-end">
                        <ToggleSwitch
                            checked={settings.pos.autoClearCart.enabled}
                            onChange={checked =>
                                handleSettingsChange('pos', 'autoClearCart', {
                                    ...settings.pos.autoClearCart,
                                    enabled: checked,
                                })
                            }
                            label={t('settings.autoClearAria')}
                        />
                    </div>
                </SettingsRow>
                <SettingsRow title={t('settings.clearAfterTitle')} description={t('settings.clearAfterDesc')}>
                    <select
                        value={settings.pos.autoClearCart.timeoutMinutes}
                        onChange={event =>
                            handleSettingsChange('pos', 'autoClearCart', {
                                ...settings.pos.autoClearCart,
                                timeoutMinutes: parseInt(event.target.value, 10),
                            })
                        }
                        className={fieldClass}
                        disabled={!settings.pos.autoClearCart.enabled}
                    >
                        {[0, 1, 2, 5, 10, 15, 30, 60].map(minutes => (
                            <option key={minutes} value={minutes}>
                                {minutes === 0 ? t('settings.pos.never') : t('settings.minutesOption', { count: minutes })}
                            </option>
                        ))}
                    </select>
                </SettingsRow>
            </SettingCard>

            <SettingCard
                title={t('settings.ticketTitle')}
                description={t('settings.ticketDesc')}
                icon={Ticket}
                accent="from-cyan-600 to-blue-500"
            >
                <SettingsRow title={t('settings.ticketEnableTitle')} description={t('settings.ticketEnableDesc')}>
                    <div className="flex justify-end">
                        <ToggleSwitch
                            checked={settings.orderQueue.enabled}
                            onChange={checked => handleSettingsChange('orderQueue', 'enabled', checked)}
                            label={t('settings.ticketEnableTitle')}
                        />
                    </div>
                </SettingsRow>
                <SettingsRow title={t('settings.ticketPrefixTitle')} description={t('settings.ticketPrefixDesc')}>
                    <input
                        value={settings.orderQueue.prefix}
                        onChange={event =>
                            handleSettingsChange(
                                'orderQueue',
                                'prefix',
                                event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
                            )
                        }
                        placeholder="A"
                        className={fieldClass}
                        disabled={!settings.orderQueue.enabled}
                    />
                </SettingsRow>
                <SettingsRow title={t('settings.ticketFirstNumberTitle')} description={t('settings.ticketFirstNumberDesc')}>
                    <input
                        type="number"
                        min="0"
                        step="1"
                        value={settings.orderQueue.startNumber}
                        onChange={event =>
                            handleSettingsChange(
                                'orderQueue',
                                'startNumber',
                                Math.max(0, Math.floor(Number(event.target.value) || 0))
                            )
                        }
                        className={fieldClass}
                        disabled={!settings.orderQueue.enabled}
                    />
                </SettingsRow>
                <SettingsRow title={t('settings.ticketNumberLengthTitle')} description={t('settings.ticketNumberLengthDesc')}>
                    <select
                        value={settings.orderQueue.padding}
                        onChange={event =>
                            handleSettingsChange('orderQueue', 'padding', Number(event.target.value))
                        }
                        className={fieldClass}
                        disabled={!settings.orderQueue.enabled}
                    >
                        <option value={2}>{t('settings.ticketDigits2')}</option>
                        <option value={3}>{t('settings.ticketDigits3')}</option>
                        <option value={4}>{t('settings.ticketDigits4')}</option>
                    </select>
                </SettingsRow>
                <SettingsRow title={t('settings.ticketReadyTitle')} description={t('settings.ticketReadyDesc')}>
                    <select
                        value={settings.orderQueue.readyRetentionMinutes}
                        onChange={event =>
                            handleSettingsChange(
                                'orderQueue',
                                'readyRetentionMinutes',
                                Number(event.target.value)
                            )
                        }
                        className={fieldClass}
                        disabled={!settings.orderQueue.enabled}
                    >
                        {[5, 10, 15, 20, 30, 60].map(minutes => (
                            <option key={minutes} value={minutes}>{t('settings.minutesOption', { count: minutes })}</option>
                        ))}
                    </select>
                </SettingsRow>
                <div className="rounded-2xl bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
                    {t('settings.ticketPreview', {
                        code: `${settings.orderQueue.prefix.toUpperCase()}${String(settings.orderQueue.startNumber).padStart(settings.orderQueue.padding, '0')}`,
                    })}
                </div>
            </SettingCard>
        </div>
    );

    const renderLoyalty = () => (
        <div className="space-y-6">
            <SettingCard
                title={t('settings.loyaltyPointsTitle')}
                description={t('settings.loyaltyPointsDesc')}
                icon={Gift}
                accent="from-emerald-600 to-green-500"
            >
                <SettingsRow
                    title={t('settings.loyaltyEnableTitle')}
                    description={t('settings.loyaltyEnableDesc')}
                >
                    <div className="flex justify-end">
                        <ToggleSwitch
                            checked={settings.loyalty.enabled}
                            onChange={checked => handleSettingsChange('loyalty', 'enabled', checked)}
                            label={t('settings.loyaltyEnableTitle')}
                        />
                    </div>
                </SettingsRow>
                <SettingsRow title={t('settings.loyaltyProgramNameTitle')} description={t('settings.loyaltyProgramNameDesc')}>
                    <input
                        value={settings.loyalty.programName}
                        onChange={event => handleSettingsChange('loyalty', 'programName', event.target.value)}
                        className={fieldClass}
                        disabled={!settings.loyalty.enabled}
                    />
                </SettingsRow>
                <SettingsRow
                    title={t('settings.loyaltyEarnTitle')}
                    description={t('settings.loyaltyEarnDesc')}
                >
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={settings.loyalty.pointsPerEuroEarned}
                        onChange={event =>
                            handleSettingsChange(
                                'loyalty',
                                'pointsPerEuroEarned',
                                Math.max(0, Number(event.target.value))
                            )
                        }
                        className={fieldClass}
                        disabled={!settings.loyalty.enabled}
                    />
                </SettingsRow>
                <SettingsRow
                    title={t('settings.loyaltyRedeemTitle')}
                    description={t('settings.loyaltyRedeemDesc')}
                >
                    <input
                        type="number"
                        min="1"
                        step="1"
                        value={settings.loyalty.pointsPerEuroRedeemed}
                        onChange={event =>
                            handleSettingsChange(
                                'loyalty',
                                'pointsPerEuroRedeemed',
                                Math.max(1, Math.floor(Number(event.target.value) || 1))
                            )
                        }
                        className={fieldClass}
                        disabled={!settings.loyalty.enabled}
                    />
                </SettingsRow>
                <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
                    {t('settings.loyaltyPointsInfo')}
                </div>
            </SettingCard>

            <SettingCard
                title={t('settings.vouchersTitle')}
                description={t('settings.vouchersDesc')}
                icon={Ticket}
                accent="from-orange-500 to-amber-500"
            >
                <SettingsRow title={t('settings.vouchersEnableTitle')} description={t('settings.vouchersEnableDesc')}>
                    <div className="flex justify-end">
                        <ToggleSwitch
                            checked={settings.loyalty.vouchersEnabled}
                            onChange={checked => handleSettingsChange('loyalty', 'vouchersEnabled', checked)}
                            label={t('settings.vouchersEnableTitle')}
                        />
                    </div>
                </SettingsRow>

                <div className="space-y-3 pt-4">
                    {settings.loyalty.vouchers.map(voucher => (
                        <div
                            key={voucher.id}
                            className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:grid-cols-[1.1fr_1.5fr_0.8fr_0.8fr_auto_auto]"
                        >
                            <input
                                aria-label={t('settings.voucherCodeAria')}
                                value={voucher.code}
                                onChange={event =>
                                    handleVoucherChange(voucher.id, {
                                        code: event.target.value.toUpperCase().replace(/\s/g, ''),
                                    })
                                }
                                placeholder={t('settings.voucherCodePlaceholder')}
                                className={subtleFieldClass}
                            />
                            <input
                                aria-label={t('settings.voucherDescAria')}
                                value={voucher.description}
                                onChange={event =>
                                    handleVoucherChange(voucher.id, { description: event.target.value })
                                }
                                placeholder={t('settings.voucherDescPlaceholder')}
                                className={subtleFieldClass}
                            />
                            <select
                                aria-label={t('settings.voucherTypeAria')}
                                value={voucher.type}
                                onChange={event =>
                                    handleVoucherChange(voucher.id, {
                                        type: event.target.value as LoyaltyVoucher['type'],
                                    })
                                }
                                className={subtleFieldClass}
                            >
                                <option value="fixed">{t('settings.voucherTypeFixed')}</option>
                                <option value="percentage">{t('settings.voucherTypePercentage')}</option>
                            </select>
                            <input
                                aria-label={t('settings.voucherValueAria')}
                                type="number"
                                min="0"
                                max={voucher.type === 'percentage' ? 100 : undefined}
                                step={voucher.type === 'percentage' ? 1 : 0.01}
                                value={voucher.value}
                                onChange={event =>
                                    handleVoucherChange(voucher.id, {
                                        value: Math.max(0, Number(event.target.value)),
                                    })
                                }
                                className={subtleFieldClass}
                            />
                            <ToggleSwitch
                                checked={voucher.enabled}
                                onChange={enabled => handleVoucherChange(voucher.id, { enabled })}
                                label={t('settings.voucherEnableAria', { name: voucher.code || voucher.id })}
                            />
                            <TableActionButton
                                variant="delete"
                                icon={Trash2}
                                type="button"
                                onClick={() =>
                                    updateVouchers(
                                        settings.loyalty.vouchers.filter(item => item.id !== voucher.id)
                                    )
                                }
                                aria-label={t('settings.voucherDeleteAria')}
                            />
                        </div>
                    ))}
                    {settings.loyalty.vouchers.length === 0 && (
                        <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                            {t('settings.noVouchers')}
                        </p>
                    )}
                    <AdminActionButton
                        variant="primary"
                        type="button"
                        onClick={handleAddVoucher}
                        icon={Plus}
                        label={t('settings.addVoucher')}
                    />
                </div>
            </SettingCard>
        </div>
    );

    const renderHr = () => {
        const holidayPresetLabels: Record<string, string> = {
            portugal: t('settings.holidayPresetPortugal'),
            spain: t('settings.holidayPresetSpain'),
            belgium: t('settings.holidayPresetBelgium'),
        };
        return (
        <div className="space-y-6">
            <SettingCard
                title={t('settings.attendanceSecTitle')}
                description={t('settings.attendanceSecDesc')}
                icon={KeyRound}
                accent="from-blue-600 to-indigo-500"
            >
                <SettingsRow
                    title={t('settings.pinRequiredTitle')}
                    description={t('settings.pinRequiredDesc')}
                >
                    <div className="flex justify-end">
                        <ToggleSwitch
                            checked
                            onChange={() => undefined}
                            label={t('settings.pinRequiredAria')}
                        />
                    </div>
                </SettingsRow>
            </SettingCard>

            <SettingCard
                title={t('settings.employmentDefaultsTitle')}
                description={t('settings.employmentDefaultsDesc')}
                icon={CalendarDays}
                accent="from-emerald-600 to-teal-500"
            >
                <SettingsRow
                    title={t('settings.holidayPresetTitle')}
                    description={t('settings.holidayPresetDesc')}
                >
                    <select
                        value={HOLIDAY_ACCRUAL_PRESETS.find(
                            preset => preset.rate === settings.hr.monthlyHolidayAccrualRate
                        )?.id ?? 'custom'}
                        onChange={event => {
                            const preset = HOLIDAY_ACCRUAL_PRESETS.find(item => item.id === event.target.value);
                            if (preset) handleSettingsChange('hr', 'monthlyHolidayAccrualRate', preset.rate);
                        }}
                        className={fieldClass}
                    >
                        {HOLIDAY_ACCRUAL_PRESETS.map(preset => (
                            <option key={preset.id} value={preset.id}>{holidayPresetLabels[preset.id] ?? preset.label}</option>
                        ))}
                        <option value="custom">{t('settings.holidayPresetCustom')}</option>
                    </select>
                </SettingsRow>
                <SettingsRow
                    title={t('settings.holidayRateTitle')}
                    description={t('settings.holidayRateDesc')}
                >
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={settings.hr.monthlyHolidayAccrualRate}
                        onChange={event =>
                            handleSettingsChange(
                                'hr',
                                'monthlyHolidayAccrualRate',
                                Math.max(0, Number(event.target.value) || 0)
                            )
                        }
                        className={fieldClass}
                    />
                </SettingsRow>
                <SettingsRow
                    title={t('settings.contractExpiryTitle')}
                    description={t('settings.contractExpiryDesc')}
                >
                    <input
                        type="number"
                        min="1"
                        step="1"
                        value={settings.hr.contractExpiryWarningDays}
                        onChange={event =>
                            handleSettingsChange(
                                'hr',
                                'contractExpiryWarningDays',
                                Math.max(1, Math.floor(Number(event.target.value) || 1))
                            )
                        }
                        className={fieldClass}
                    />
                </SettingsRow>
            </SettingCard>
        </div>
        );
    };

    const renderDisplay = () => (
        <div className="space-y-6">
            <SettingCard
                title={t('settings.interfaceTitle')}
                description={t('settings.interfaceDesc')}
                icon={Monitor}
                accent="from-violet-600 to-fuchsia-500"
            >
                <SettingsRow title={t('settings.itemsPerPageTitle')} description={t('settings.itemsPerPageDesc')}>
                    <select
                        value={settings.display.itemsPerPage}
                        onChange={event => handleSettingsChange('display', 'itemsPerPage', parseInt(event.target.value, 10))}
                        className={fieldClass}
                    >
                        {[10, 20, 50, 100].map(count => (
                            <option key={count} value={count}>
                                {t('settings.display.itemsOption', { count })}
                            </option>
                        ))}
                    </select>
                </SettingsRow>
                <SettingsRow title={t('settings.compactModeTitle')} description={t('settings.compactModeDesc')}>
                    <div className="flex justify-end">
                        <ToggleSwitch
                            checked={settings.display.compactMode}
                            onChange={checked => handleSettingsChange('display', 'compactMode', checked)}
                            label={t('settings.compactModeTitle')}
                        />
                    </div>
                </SettingsRow>
                <SettingsRow title={t('settings.showPhotosTitle')} description={t('settings.showPhotosDesc')}>
                    <div className="flex justify-end">
                        <ToggleSwitch
                            checked={settings.display.showEmployeePhotos}
                            onChange={checked => handleSettingsChange('display', 'showEmployeePhotos', checked)}
                            label={t('settings.showPhotosTitle')}
                        />
                    </div>
                </SettingsRow>
            </SettingCard>
        </div>
    );

    const renderHardware = () => {
        const tools: Array<{ id: HardwareSettingsTool; label: string; description: string; icon: LucideIcon }> = [
            { id: 'printer', label: t('settings.hwPrintersLabel'), description: t('settings.hwPrintersDesc'), icon: Printer },
            { id: 'scale', label: t('settings.hwScaleLabel'), description: t('settings.hwScaleDesc'), icon: Weight },
            { id: 'updates', label: t('settings.hwUpdatesLabel', { defaultValue: 'Updates' }), description: t('settings.hwUpdatesDesc', { defaultValue: 'Till software updates' }), icon: DownloadCloud },
            { id: 'seed', label: t('settings.hwSeedLabel'), description: t('settings.hwSeedDesc'), icon: Database },
            { id: 'cashier', label: t('settings.hwCashierLabel'), description: t('settings.hwCashierDesc'), icon: BadgeCheck },
            { id: 'electron', label: 'Electron', description: t('settings.hwElectronDesc'), icon: Monitor },
        ].filter(tool => tool.id === 'printer' || tool.id === 'scale' || tool.id === 'updates' || devToolsEnabled);
        return (
            <div className="space-y-6">
                <SettingCard
                    title={t('settings.hwCardTitle')}
                    description={t('settings.hwCardDesc')}
                    icon={Printer}
                    accent="from-blue-700 to-cyan-500"
                >
                    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr))]">
                        {tools.map(tool => {
                            const Icon = tool.icon;
                            const active = hardwareTool === tool.id;
                            return (
                                <button
                                    key={tool.id}
                                    type="button"
                                    onClick={() => setHardwareTool(tool.id)}
                                    className={`min-h-touch rounded-[10px] border p-4 text-left transition-all duration-200 ${
                                        active
                                            ? 'border-green-500 bg-green-50 text-green-900'
                                            : 'border-gray-200 bg-white text-slate-600 hover:bg-gray-50 hover:text-slate-950'
                                    }`}
                                >
                                    <Icon className="h-5 w-5" />
                                    <span className="mt-3 block text-sm font-semibold">{tool.label}</span>
                                    <span className="mt-1 block text-xs opacity-75">{tool.description}</span>
                                </button>
                            );
                        })}
                    </div>
                </SettingCard>

                <div className={`${glassCard} p-3 sm:p-5`}>
                    {hardwareTool === 'printer' && <PrinterSettingsPanel embedded />}
                    {hardwareTool === 'scale' && <ScaleSettingsPanel embedded />}
                    {hardwareTool === 'updates' && <UpdateSettingsPanel embedded />}
                    {devToolsEnabled && hardwareTool === 'seed' && <SeedManagementPanel embedded />}
                    {devToolsEnabled && hardwareTool === 'cashier' && <CashierTestingPanel embedded />}
                    {devToolsEnabled && hardwareTool === 'electron' && <ElectronTestingPanel embedded />}
                </div>
            </div>
        );
    };

    const renderCompanyIdentity = () => (
        <SettingCard
            title={t('settings.companyIdentityTitle')}
            description={t('settings.companyIdentityDesc')}
            icon={Building2}
            accent="from-slate-900 to-slate-600"
        >
            <div className="grid gap-4 lg:grid-cols-2">
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">{t('settings.companyNameLabel')}</label>
                    <input
                        type="text"
                        value={settings.company.name}
                        onChange={event => handleSettingsChange('company', 'name', event.target.value)}
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">{t('settings.taxNumberLabel')}</label>
                    <input
                        type="text"
                        value={settings.company.taxNumber}
                        onChange={event => handleSettingsChange('company', 'taxNumber', event.target.value)}
                        className={fieldClass}
                    />
                </div>
                <div className="lg:col-span-2">
                    <label className="mb-2 block text-sm font-semibold text-slate-700">{t('settings.company.address')}</label>
                    <input
                        type="text"
                        value={settings.company.address}
                        onChange={event => handleSettingsChange('company', 'address', event.target.value)}
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">{t('settings.postalCodeLabel')}</label>
                    <input
                        type="text"
                        value={settings.company.postalCode}
                        onChange={event => handleSettingsChange('company', 'postalCode', event.target.value)}
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">{t('settings.company.city')}</label>
                    <input
                        type="text"
                        value={settings.company.city}
                        onChange={event => handleSettingsChange('company', 'city', event.target.value)}
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">{t('settings.company.phone')}</label>
                    <input
                        type="text"
                        value={settings.company.phone || ''}
                        onChange={event => handleSettingsChange('company', 'phone', event.target.value)}
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">{t('settings.company.email')}</label>
                    <input
                        type="email"
                        value={settings.company.email || ''}
                        onChange={event => handleSettingsChange('company', 'email', event.target.value)}
                        className={fieldClass}
                    />
                </div>
                <div className="md:col-span-2">
                    <ReceiptLogoPicker
                        value={settings.company.logo}
                        onChange={logo => handleSettingsChange('company', 'logo', logo)}
                        canPublish={isSystemAdmin || principal?.role === 'owner' || principal?.role === 'admin'}
                        storeId={readDevicePairingScope()?.storeId ?? (principal?.storeIds?.length === 1 ? principal.storeIds[0] : null)}
                    />
                </div>
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">{t('settings.receiptSloganLabel')}</label>
                    <input
                        type="text"
                        value={settings.company.slogan || ''}
                        onChange={event => handleSettingsChange('company', 'slogan', event.target.value)}
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">{t('settings.softwareLineLabel')}</label>
                    <input
                        type="text"
                        value={settings.company.softwareInfo || ''}
                        onChange={event => handleSettingsChange('company', 'softwareInfo', event.target.value)}
                        className={fieldClass}
                    />
                </div>
            </div>
        </SettingCard>
    );

    const renderReceiptBasics = () => (
        <SettingCard
            title={t('settings.receiptBasicsTitle')}
            description={t('settings.receiptBasicsDesc')}
            icon={Receipt}
            accent="from-indigo-600 to-blue-500"
        >
            <SettingsRow title={t('settings.company.receiptLanguage')} description={t('settings.receiptLanguageIndependentDesc')} icon={Languages}>
                <select
                    value={settings.receipt.receiptLanguage}
                    onChange={event => handleSettingsChange('receipt', 'receiptLanguage', event.target.value as ReceiptLanguage)}
                    className={fieldClass}
                >
                    <option value="pt">{t('settings.company.receiptLanguagePt')}</option>
                    <option value="en">{t('settings.company.receiptLanguageEn')}</option>
                    <option value="es">{t('settings.company.receiptLanguageEs')}</option>
                </select>
            </SettingsRow>
            <SettingsRow title={t('settings.counterLabelTitle')} description={t('settings.counterLabelDesc')} icon={Store}>
                <input
                    type="text"
                    value={settings.receipt.counterLabel}
                    onChange={event => handleSettingsChange('receipt', 'counterLabel', event.target.value)}
                    className={fieldClass}
                />
            </SettingsRow>
        </SettingCard>
    );

    const renderLocalAtSeries = () => {
        const docKey = seriesEditorKey;
        const prof = settings.receipt.seriesProfiles[docKey];
        return (
            <SettingCard
                title={t('settings.atSeriesCardTitle')}
                icon={KeyRound}
                accent="from-emerald-600 to-green-500"
            >
                <SettingsRow title={t('settings.docFamilyTitle')} description={t('settings.docFamilyDesc')}>
                    <SegmentedControl
                        value={seriesEditorKey}
                        onChange={setSeriesEditorKey}
                        options={[
                            { value: 'FT', label: t('settings.segFtLabel'), description: t('settings.segFtDesc') },
                            { value: 'NC', label: t('settings.segNcLabel'), description: t('settings.segNcDesc') },
                        ]}
                    />
                </SettingsRow>
                <SettingsRow title={t('settings.atSeriesCardTitle')} description={t('settings.atSeriesRowDesc')}>
                    <input
                        type="text"
                        value={prof.series}
                        onChange={event => handleReceiptProfileChange(docKey, 'series', event.target.value)}
                        className={fieldClass}
                    />
                </SettingsRow>
                <SettingsRow title={t('settings.seriesDescTitle')} description={t('settings.seriesDescDesc')}>
                    <input
                        type="text"
                        value={prof.seriesDescription ?? ''}
                        onChange={event => handleReceiptProfileChange(docKey, 'seriesDescription', event.target.value)}
                        className={fieldClass}
                    />
                </SettingsRow>
                <div className="grid gap-4 md:grid-cols-2">
                    <SettingsRow title={t('settings.numberWidthTitle')} description={t('settings.numberWidthDesc')}>
                        <input
                            type="number"
                            min={1}
                            value={prof.numericWidth}
                            onChange={event =>
                                handleReceiptProfileChange(docKey, 'numericWidth', parseInt(event.target.value, 10))
                            }
                            className={fieldClass}
                        />
                    </SettingsRow>
                    <SettingsRow title={t('settings.currentNumberTitle')} description={t('settings.currentNumberDesc')}>
                        <input
                            type="number"
                            min={0}
                            step={1}
                            value={prof.currentNumber}
                            onChange={event => {
                                const value = parseInt(event.target.value, 10);
                                handleReceiptProfileChange(docKey, 'currentNumber', Number.isFinite(value) && value >= 0 ? value : 0);
                            }}
                            className={fieldClass}
                        />
                    </SettingsRow>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                    <SettingsRow title={t('settings.startDateTitle')} description={t('settings.startDateDesc')}>
                        <input
                            type="date"
                            value={prof.seriesStartDate?.trim() || ''}
                            onChange={event =>
                                handleReceiptProfileChange(docKey, 'seriesStartDate', event.target.value || undefined)
                            }
                            className={fieldClass}
                        />
                    </SettingsRow>
                    <SettingsRow title={t('settings.endDateTitle')} description={t('settings.endDateDesc')}>
                        <input
                            type="date"
                            value={prof.seriesEndDate?.trim() || ''}
                            onChange={event =>
                                handleReceiptProfileChange(docKey, 'seriesEndDate', event.target.value || undefined)
                            }
                            className={fieldClass}
                        />
                    </SettingsRow>
                </div>
                <SettingsRow title={t('settings.atValidationTitle')} description={t('settings.atValidationDesc')}>
                    <input
                        type="text"
                        value={prof.atValidationCode}
                        onChange={event => handleReceiptProfileChange(docKey, 'atValidationCode', event.target.value)}
                        className={fieldClass}
                    />
                </SettingsRow>
                <div className="mt-4 grid gap-3 rounded-3xl bg-emerald-50 p-4 text-sm md:grid-cols-2">
                    <div>
                        <p className="font-semibold text-emerald-900">{t('settings.lastSeriesKeyLabel')}</p>
                        <p className="mt-1 text-emerald-700">{prof.lastSeriesKey || t('settings.notIssuedYet')}</p>
                    </div>
                    <div>
                        <p className="font-semibold text-emerald-900">{t('settings.lastDocInChainLabel')}</p>
                        <p className="mt-1 text-emerald-700">{chainTips[docKey] ?? t('settings.notIssuedYet')}</p>
                    </div>
                </div>
            </SettingCard>
        );
    };

    const renderFiscalIssuer = () => (
        <SettingCard
            title={t('settings.fiscalControlsTitle')}
            description={
                isSystemAdmin
                    ? t('settings.fiscalControlsDescAdmin')
                    : t('settings.fiscalControlsDescUser')
            }
            icon={BadgeCheck}
            accent="from-slate-950 to-blue-700"
        >
            {isSystemAdmin && (
                <SettingsRow title={t('settings.operatingCountryTitle')} description={t('settings.operatingCountryDesc')}>
                    <SegmentedControl
                        value={settings.operatingCountry}
                        onChange={handleOperatingCountryChange}
                        options={OPERATING_COUNTRIES.map((c) => ({
                            value: c,
                            label: getCountryProfile(c).name,
                            description: c === 'PT'
                                ? t('settings.operatingCountryPtDesc')
                                : t('settings.operatingCountryEsDesc'),
                        }))}
                    />
                </SettingsRow>
            )}

            {isSystemAdmin && (
                <SettingsRow title={t('settings.activeIssuerTitle')} description={t('settings.activeIssuerDesc')}>
                    <SegmentedControl
                        value={settings.fiscal.issuer}
                        onChange={handleFiscalIssuerChange}
                        options={[
                            { value: 'local_at', label: 'Local AT', description: t('settings.issuerLocalAtDesc') },
                            { value: 'vendus', label: 'Vendus', description: t('settings.issuerVendusDesc') },
                            { value: 'invoicexpress', label: 'InvoiceXpress', description: t('settings.issuerIxDesc') },
                            { value: 'fiskaly', label: 'Fiskaly', description: t('settings.issuerFiskalyDesc') },
                            { value: 'sign_es', label: t('settings.issuerSignEsLabel'), description: t('settings.issuerSignEsDesc') },
                        ].filter((o) => countryProfile.fiscalIssuers.includes(o.value as SystemSettings['fiscal']['issuer']))}
                    />
                </SettingsRow>
            )}

            <SettingsRow title={t('settings.fiscalAT.trainingTitle')} description={t('settings.trainingModeDesc')}>
                <div className="flex justify-end">
                    <ToggleSwitch
                        checked={settings.fiscal.trainingMode}
                        onChange={handleTrainingModeChange}
                        label={t('settings.fiscalAT.trainingTitle')}
                    />
                </div>
            </SettingsRow>

            {isSystemAdmin && (
                <div
                    className={`mt-5 rounded-[1.75rem] border p-5 ${
                        settings.fiscal.issuer === 'local_at'
                            ? 'border-emerald-200 bg-emerald-50/80'
                            : 'border-blue-200 bg-blue-50/80'
                    }`}
                >
                    <div className="flex flex-wrap items-center gap-3">
                        <StatusPill
                            label={t('settings.activeIssuerPill', { issuer: fiscalIssuerLabel })}
                            tone={settings.fiscal.issuer === 'local_at' ? 'green' : 'blue'}
                        />
                        <StatusPill
                            label={settings.fiscal.trainingMode ? t('settings.trainingDbPill') : t('settings.productionDbPill')}
                            tone={settings.fiscal.trainingMode ? 'amber' : 'slate'}
                        />
                        {settings.fiscal.issuer === 'vendus' && (
                            <StatusPill
                                label={t('settings.setupChecksPill', { done: vendusReadyCount, total: vendusReadiness.length })}
                                tone={vendusReadyCount === vendusReadiness.length ? 'green' : 'amber'}
                            />
                        )}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                        {settings.fiscal.issuer === 'local_at'
                            ? t('settings.fiscalOwnsLocalAt')
                            : t('settings.fiscalOwnsExternal', { issuer: fiscalIssuerLabel })}
                    </p>
                </div>
            )}
        </SettingCard>
    );

    const renderExternalIssuerSetup = () => {
        const ix = settings.fiscal.invoicexpress;
        const fk = settings.fiscal.fiskaly;
        const isIx = settings.fiscal.issuer === 'invoicexpress';
        return (
            <SettingCard
                title={t('settings.externalSetupTitle', { issuer: fiscalIssuerLabel })}
                description={t('settings.externalSetupDesc')}
                icon={Cloud}
                accent="from-indigo-600 to-blue-500"
            >
                <div className="space-y-5">
                    {isIx ? (
                        <>
                            <SettingsRow title={t('settings.accountNameTitle')} description={t('settings.accountNameDesc')}>
                                <input
                                    type="text"
                                    value={ix.accountName}
                                    onChange={e => handleInvoiceXpressSettingChange('accountName', e.target.value)}
                                    placeholder={t('settings.ixAccountNamePlaceholder')}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                />
                            </SettingsRow>
                            <SettingsRow title={t('settings.documentTypeTitle')} description={t('settings.ixDocTypeDesc')}>
                                <SegmentedControl
                                    value={ix.documentType}
                                    onChange={v => handleInvoiceXpressSettingChange('documentType', v)}
                                    options={[
                                        { value: 'invoice_receipt', label: t('settings.docFrLabel'), description: t('settings.docPaidOnIssue') },
                                        { value: 'simplified_invoice', label: t('settings.docFsLabel'), description: t('settings.docFinalConsumer') },
                                        { value: 'invoice', label: t('settings.docFtLabel'), description: t('settings.docWithNif') },
                                    ]}
                                />
                            </SettingsRow>
                            <SettingsRow title={t('settings.ixSeriesTitle')} description={t('settings.ixSeriesDesc')}>
                                <input
                                    type="text"
                                    value={ix.sequenceId ?? ''}
                                    onChange={e => handleInvoiceXpressSettingChange('sequenceId', e.target.value)}
                                    placeholder={t('settings.defaultPlaceholder')}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                />
                            </SettingsRow>
                            <SettingsRow title={t('settings.ixFinalizeTitle')} description={t('settings.ixFinalizeDesc')}>
                                <div className="flex justify-end">
                                    <ToggleSwitch
                                        checked={ix.finalizeOnIssue}
                                        onChange={v => handleInvoiceXpressSettingChange('finalizeOnIssue', v)}
                                        label={t('settings.finalizeAria')}
                                    />
                                </div>
                            </SettingsRow>
                            <SettingsRow title={t('settings.exemptCodeTitle')} description={t('settings.ixExemptDesc')}>
                                <input
                                    type="text"
                                    value={ix.exemptTax.code ?? ''}
                                    onChange={e =>
                                        handleInvoiceXpressSettingChange('exemptTax', { ...ix.exemptTax, code: e.target.value })
                                    }
                                    placeholder="M99"
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                />
                            </SettingsRow>
                        </>
                    ) : (
                        <>
                            <SettingsRow title={t('settings.environmentTitle')} description={t('settings.fkEnvDesc')}>
                                <SegmentedControl
                                    value={fk.environment}
                                    onChange={v => handleFiskalySettingChange('environment', v)}
                                    options={[
                                        { value: 'test', label: t('settings.fkEnvTestLabel'), description: t('settings.sandbox') },
                                        { value: 'live', label: t('settings.fkEnvLiveLabel'), description: t('settings.production') },
                                    ]}
                                />
                            </SettingsRow>
                            <SettingsRow title={t('settings.documentTypeTitle')} description={t('settings.fkDocTypeDesc')}>
                                <SegmentedControl
                                    value={fk.documentType}
                                    onChange={v => handleFiskalySettingChange('documentType', v)}
                                    options={[
                                        { value: 'FT', label: t('settings.docFtLabel'), description: t('settings.docWithNif') },
                                        { value: 'FS', label: t('settings.docFsShortLabel'), description: t('settings.docFinalConsumer') },
                                        { value: 'FR', label: t('settings.docFrLabel'), description: t('settings.docPaidOnIssue') },
                                    ]}
                                />
                            </SettingsRow>
                            <SettingsRow title={t('settings.fkTaxpayerTitle')} description={t('settings.fkTaxpayerDesc')}>
                                <input
                                    type="text"
                                    value={fk.taxpayerId}
                                    onChange={e => handleFiskalySettingChange('taxpayerId', e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                />
                            </SettingsRow>
                            <SettingsRow title={t('settings.fkLocationTitle')} description={t('settings.fkLocationDesc')}>
                                <input
                                    type="text"
                                    value={fk.locationId}
                                    onChange={e => handleFiskalySettingChange('locationId', e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                />
                            </SettingsRow>
                            <SettingsRow title={t('settings.fkSystemTitle')} description={t('settings.fkSystemDesc')}>
                                <input
                                    type="text"
                                    value={fk.systemId}
                                    onChange={e => handleFiskalySettingChange('systemId', e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                />
                            </SettingsRow>
                            <SettingsRow title={t('settings.fkSeriesTitle')} description={t('settings.fkSeriesDesc')}>
                                <input
                                    type="text"
                                    value={fk.seriesId ?? ''}
                                    onChange={e => handleFiskalySettingChange('seriesId', e.target.value)}
                                    placeholder={t('settings.defaultPlaceholder')}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                />
                            </SettingsRow>
                        </>
                    )}

                    <div className="flex flex-wrap items-center gap-3">
                        <AdminActionButton
                            variant="primary"
                            type="button"
                            onClick={handleExternalHealthCheck}
                            disabled={externalCheck.status === 'checking'}
                            label={externalCheck.status === 'checking' ? t('settings.checking') : t('settings.checkConnection')}
                            className="text-sm disabled:opacity-50"
                        />
                        {externalCheck.message && (
                            <StatusPill
                                label={externalCheck.message}
                                tone={externalCheck.status === 'ok' ? 'green' : externalCheck.status === 'error' ? 'amber' : 'slate'}
                            />
                        )}
                    </div>
                </div>
            </SettingCard>
        );
    };

    const renderSignEsSetup = () => (
        <SettingCard
            title={t('settings.signEsSetupTitle')}
            description={t('settings.signEsSetupDesc')}
            icon={Cloud}
            accent="from-rose-600 to-orange-500"
        >
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
                {t('settings.signEsSetupNote')}
            </div>
        </SettingCard>
    );

    const renderVendusSetup = () => (
        <SettingCard
            title={t('settings.vendusSetupTitle')}
            description={t('settings.vendusSetupDesc')}
            icon={Cloud}
            accent="from-blue-600 to-cyan-500"
        >
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-5">
                    <SettingsRow title={t('settings.environmentTitle')} description={t('settings.vendusEnvDesc')} icon={Wifi}>
                        <SegmentedControl
                            value={settings.fiscal.vendus.mode}
                            onChange={value => handleVendusSettingChange('mode', value)}
                            options={[
                                { value: 'tests', label: t('settings.vendusTestsLabel'), description: t('settings.vendusTestsDesc') },
                                { value: 'normal', label: t('settings.vendusNormalLabel'), description: t('settings.vendusNormalDesc') },
                            ]}
                        />
                    </SettingsRow>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-700">{t('settings.registerIdLabel')}</label>
                            <input
                                type="text"
                                value={settings.fiscal.vendus.registerId}
                                onChange={event => handleVendusSettingChange('registerId', event.target.value)}
                                className={fieldClass}
                                placeholder={t('settings.requiredPlaceholder')}
                            />
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-700">{t('settings.storeIdLabel')}</label>
                            <input
                                type="text"
                                value={settings.fiscal.vendus.storeId || ''}
                                onChange={event => handleVendusSettingChange('storeId', event.target.value)}
                                className={fieldClass}
                                placeholder={t('settings.optionalPlaceholder')}
                            />
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-700">{t('settings.documentTypeTitle')}</label>
                            <select
                                value={settings.fiscal.vendus.documentType}
                                onChange={event =>
                                    handleVendusSettingChange(
                                        'documentType',
                                        event.target.value as SystemSettings['fiscal']['vendus']['documentType']
                                    )
                                }
                                className={fieldClass}
                            >
                                <option value="FT">{t('settings.vendusDocFt')}</option>
                                <option value="FS">{t('settings.vendusDocFs')}</option>
                                <option value="FR">{t('settings.vendusDocFr')}</option>
                            </select>
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-700">{t('settings.officialOutputLabel')}</label>
                            <select
                                value={settings.fiscal.vendus.output}
                                onChange={event =>
                                    handleVendusSettingChange(
                                        'output',
                                        event.target.value as SystemSettings['fiscal']['vendus']['output']
                                    )
                                }
                                className={fieldClass}
                            >
                                <option value="html">{t('settings.outputHtml')}</option>
                                <option value="pdf_url">{t('settings.outputPdfUrl')}</option>
                                <option value="pdf">{t('settings.outputPdf')}</option>
                                <option value="escpos">ESC/POS</option>
                                <option value="auto">{t('settings.outputAuto')}</option>
                            </select>
                        </div>
                    </div>

                    <div className="rounded-[1.75rem] bg-slate-50 p-4">
                        <div className="mb-3 flex items-center gap-2">
                            <CreditCard className="h-5 w-5 text-slate-500" />
                            <h3 className="font-semibold text-slate-950">{t('settings.paymentMappingTitle')}</h3>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                            {(['cash', 'card', 'mixed'] as const).map(method => (
                                <div key={method}>
                                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        {method === 'cash'
                                            ? t('settings.paymentCash')
                                            : method === 'card'
                                                ? t('settings.paymentCard')
                                                : t('settings.paymentMixed')}
                                    </label>
                                    <input
                                        type="text"
                                        value={settings.fiscal.vendus.paymentMethodIds[method] || ''}
                                        onChange={event => handleVendusPaymentMethodChange(method, event.target.value)}
                                        className={subtleFieldClass}
                                        placeholder={t('settings.vendusIdPlaceholder')}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-[1.75rem] bg-slate-50 p-4">
                        <div className="mb-3 flex items-center gap-2">
                            <FileText className="h-5 w-5 text-slate-500" />
                            <h3 className="font-semibold text-slate-950">{t('settings.ivaExemptTitle')}</h3>
                        </div>
                        <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
                            <div>
                                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    {t('settings.codeLabel')}
                                </label>
                                <input
                                    type="text"
                                    value={settings.fiscal.vendus.exemptTax.code || ''}
                                    onChange={event => handleVendusExemptTaxChange('code', event.target.value)}
                                    className={subtleFieldClass}
                                    placeholder="M99"
                                />
                            </div>
                            <div>
                                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    {t('settings.lawOrReasonLabel')}
                                </label>
                                <input
                                    type="text"
                                    value={settings.fiscal.vendus.exemptTax.law || ''}
                                    onChange={event => handleVendusExemptTaxChange('law', event.target.value)}
                                    className={subtleFieldClass}
                                    placeholder={t('settings.lawPlaceholder')}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <aside className="space-y-4">
                    <div className="rounded-[1.75rem] bg-white p-4 shadow-sm ring-1 ring-slate-200">
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <h3 className="font-semibold text-slate-950">{t('settings.readinessTitle')}</h3>
                                <p className="text-xs text-slate-500">{t('settings.readinessDesc')}</p>
                            </div>
                            <StatusPill
                                label={`${vendusReadyCount}/${vendusReadiness.length}`}
                                tone={vendusReadyCount === vendusReadiness.length ? 'green' : 'amber'}
                            />
                        </div>
                        <ReadinessList items={vendusReadiness} />
                    </div>

                    <div className="rounded-[1.75rem] bg-slate-950 p-4 text-white shadow-xl">
                        <div className="flex items-start gap-3">
                            <div className="rounded-2xl bg-white/10 p-2">
                                <Wifi className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="font-semibold">{t('settings.connectionCheckTitle')}</h3>
                                <p className="mt-1 text-sm leading-6 text-white/70">
                                    {t('settings.connectionCheckDesc')}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleVendusHealthCheck}
                            disabled={vendusCheck.status === 'checking'}
                            className="mt-4 min-h-touch-sm w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 font-semibold text-gray-900 transition-all hover:bg-gray-50 disabled:opacity-60"
                        >
                            {vendusCheck.status === 'checking' ? t('settings.checking') : t('settings.checkVendus')}
                        </button>
                        {vendusCheck.message && (
                            <p
                                className={`mt-3 rounded-2xl px-3 py-2 text-sm leading-6 ${
                                    vendusCheck.status === 'ok'
                                        ? 'bg-emerald-400/15 text-emerald-100'
                                        : vendusCheck.status === 'error'
                                            ? 'bg-rose-400/15 text-rose-100'
                                            : 'bg-white/10 text-white/70'
                                }`}
                            >
                                {vendusCheck.message}
                            </p>
                        )}
                    </div>
                </aside>
            </div>
        </SettingCard>
    );

    const renderSaftExport = () => (
        <SettingCard
            title={t('settings.saftExportTitle')}
            description={
                isSystemAdmin
                    ? settings.fiscal.issuer === 'vendus'
                        ? t('settings.saftDescVendus')
                        : settings.fiscal.issuer === 'local_at'
                            ? t('settings.saftDescLocalAt')
                            : t('settings.saftDescExternal', { issuer: fiscalIssuerLabel })
                    : t('settings.saftDescUser')
            }
            icon={FileDown}
            accent="from-green-600 to-emerald-500"
        >
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">{t('settings.fiscalAT.dateFrom')}</label>
                    <input type="date" value={saftStart} onChange={event => setSaftStart(event.target.value)} className={fieldClass} />
                </div>
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">{t('settings.fiscalAT.dateTo')}</label>
                    <input type="date" value={saftEnd} onChange={event => setSaftEnd(event.target.value)} className={fieldClass} />
                </div>
                <button
                    type="button"
                    onClick={handleExportSaft}
                    disabled={saftBusy}
                    className="min-h-touch rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-3 font-medium text-neutral-50 transition-all hover:from-blue-600 hover:to-blue-700 disabled:opacity-50"
                >
                    {saftBusy
                        ? t('settings.saftExportingBtn')
                        : !isSystemAdmin
                            ? t('settings.fiscalAT.saftDownload')
                            : settings.fiscal.issuer === 'local_at'
                            ? t('settings.saftDownloadLocal')
                            : t('settings.saftDownloadExternal', { issuer: fiscalIssuerLabel })}
                </button>
            </div>
            {saftMessage && <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{saftMessage}</p>}

            <div className="mt-6 border-t border-slate-200/70 pt-4">
                <SettingsRow
                    title={t('settings.saft.autoEmailTitle')}
                    description={t('settings.saft.autoEmailDescription')}
                    icon={Mail}
                >
                    <ToggleSwitch
                        checked={settings.fiscal.accounting.autoEmailSaft}
                        onChange={next => updateSettings({ fiscal: { accounting: { autoEmailSaft: next } } })}
                        label={t('settings.saft.autoEmailTitle')}
                    />
                </SettingsRow>
                {settings.fiscal.accounting.autoEmailSaft && (
                    <div className="grid gap-4 px-1 pb-2 md:grid-cols-[1fr_auto] md:items-end">
                        <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-700">
                                {t('settings.saft.accountantEmail')}
                            </label>
                            <input
                                type="email"
                                value={settings.fiscal.accounting.accountantEmail}
                                onChange={event =>
                                    updateSettings({ fiscal: { accounting: { accountantEmail: event.target.value } } })
                                }
                                placeholder={t('settings.saft.accountantEmailPlaceholder')}
                                className={fieldClass}
                            />
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-700">
                                {t('settings.saft.frequency')}
                            </label>
                            <select
                                value={settings.fiscal.accounting.frequency}
                                onChange={event =>
                                    updateSettings({
                                        fiscal: {
                                            accounting: {
                                                frequency: event.target.value as 'monthly' | 'quarterly',
                                            },
                                        },
                                    })
                                }
                                className={fieldClass}
                            >
                                <option value="monthly">{t('settings.saft.frequencyMonthly')}</option>
                                <option value="quarterly">{t('settings.saft.frequencyQuarterly')}</option>
                            </select>
                        </div>
                        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700 md:col-span-2">
                            {t('settings.saft.autoEmailNotConnected')}
                        </p>
                    </div>
                )}
            </div>
        </SettingCard>
    );

    const renderCompany = () => (
        <div className="space-y-6">
            {renderCompanyIdentity()}
            {renderReceiptBasics()}
            {renderFiscalIssuer()}
            {settings.fiscal.issuer === 'local_at'
                ? renderLocalAtSeries()
                : isSystemAdmin
                    ? settings.fiscal.issuer === 'vendus'
                        ? renderVendusSetup()
                        : settings.fiscal.issuer === 'sign_es'
                            ? renderSignEsSetup()
                            : renderExternalIssuerSetup()
                    : null}
            {/* SAF-T is a Portugal-only fiscal export; Spain (Veri*factu) has no SAF-T obligation. */}
            {settings.operatingCountry === 'PT' && renderSaftExport()}
        </div>
    );

    const renderContent = () => {
        if (activeTab === 'security') return renderSecurity();
        if (activeTab === 'pos') return renderPos();
        if (activeTab === 'loyalty') return renderLoyalty();
        if (activeTab === 'hr') return renderHr();
        if (activeTab === 'display') return renderDisplay();
        if (activeTab === 'hardware') return renderHardware();
        if (activeTab === 'alerts') return <NotificationSettings />;
        return renderCompany();
    };

    if (isLoading) {
        return (
            <div
                className="ds2-visual-scope flex min-h-96 w-full items-center justify-center"
                style={visualStyle}
                data-ds2-neutral={prefs.neutralFamilyId}
            >
                <div className={`${glassCard} px-10 py-8 text-center`}>
                    <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-950" />
                    <p className="font-semibold text-slate-700">{t('settings.loading')}</p>
                </div>
            </div>
        );
    }

    return (
        <div
            className="ds2-visual-scope relative min-h-full overflow-hidden bg-[#f7f7f7] pb-8"
            style={visualStyle}
            data-ds2-neutral={prefs.neutralFamilyId}
        >
            <div className={`relative z-10 mx-auto max-w-[1500px] space-y-6 pt-6 ${layoutClasses.contentInsetX}`}>
                {isSystemAdmin && (
                    <header className={`${glassCard} overflow-hidden`}>
                        <div className="p-4 sm:p-6 lg:p-8">
                            {/* One glanceable status strip: 3-across even on mobile (was a vertical stack). */}
                            <div className="grid grid-cols-3 gap-2 sm:gap-3">
                                <div className="rounded-2xl bg-white/75 p-2.5 ring-1 ring-slate-200 sm:rounded-3xl sm:p-4">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:text-xs">{t('settings.statFiscalIssuer')}</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-950 sm:mt-2 sm:text-lg">{fiscalIssuerLabel}</p>
                                </div>
                                <div className="rounded-2xl bg-white/75 p-2.5 ring-1 ring-slate-200 sm:rounded-3xl sm:p-4">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:text-xs">{t('settings.statDatabase')}</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-950 sm:mt-2 sm:text-lg">
                                        {settings.fiscal.trainingMode ? t('settings.statTraining') : t('settings.statProduction')}
                                    </p>
                                </div>
                                <div className="rounded-2xl bg-white/75 p-2.5 ring-1 ring-slate-200 sm:rounded-3xl sm:p-4">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:text-xs">{t('settings.statSaveState')}</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-950 sm:mt-2 sm:text-lg">
                                        {pendingChanges ? t('settings.statUnsaved') : saveStatus === 'saved' ? t('settings.statSaved') : t('settings.statClean')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </header>
                )}

                <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                    <aside className="xl:sticky xl:top-6 xl:self-start">
                        <div className={`${glassCard} p-3`}>
                            <div className="mb-3 px-3 py-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('settings.sectionsLabel')}</p>
                            </div>
                            <div className="space-y-2">
                                {tabs.map(tab => {
                                    const Icon = tab.icon;
                                    const active = activeTab === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`group flex min-h-touch w-full items-center gap-3 rounded-3xl px-4 py-3 text-left transition-all duration-200 ${
                                                active
                                                    ? 'bg-gradient-primary text-white shadow-xl'
                                                    : 'text-slate-600 hover:bg-white hover:text-slate-950'
                                            }`}
                                        >
                                            <span
                                                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                                                    active ? 'bg-white/15' : 'bg-slate-100 group-hover:bg-slate-200'
                                                }`}
                                            >
                                                <Icon className="h-5 w-5" />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-semibold">{tab.label}</span>
                                                <span className={`mt-0.5 block text-xs leading-5 ${active ? 'text-white/65' : 'text-slate-400'}`}>
                                                    {tab.description}
                                                </span>
                                            </span>
                                            <ChevronRight className={`h-4 w-4 transition-transform ${active ? 'translate-x-0.5' : ''}`} />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </aside>

                    <main className="min-w-0 space-y-6">
                        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">{activeTabMeta.label}</p>
                                <h2 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{activeTabMeta.description}</h2>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {pendingChanges && <StatusPill label={t('settings.header.unsavedChanges')} tone="amber" />}
                                {saveStatus === 'saved' && <StatusPill label={t('settings.statSaved')} tone="green" />}
                                {saveStatus === 'error' && <StatusPill label={t('settings.saveFailed')} tone="red" />}
                            </div>
                        </div>

                        {renderContent()}
                    </main>
                </div>

                <div className="sticky bottom-4 z-30">
                    <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-[2rem] border border-white/70 bg-white/90 p-3 shadow-[0_20px_60px_rgba(15,23,42,0.18)] backdrop-blur-xl">
                        <div className="hidden min-w-0 px-3 sm:block">
                            <p className="text-sm font-semibold text-slate-950">
                                {pendingChanges ? t('settings.unsavedSettingsMsg') : t('settings.settingsUpToDateMsg')}
                            </p>
                            <p className="text-xs text-slate-500">{t('settings.saveAuditNote')}</p>
                        </div>
                        <div className="ml-auto flex gap-2">
                            <button
                                type="button"
                                onClick={handleReset}
                                className="min-h-touch-sm rounded-xl border border-[var(--ds2-danger-border,#fca5a5)] px-4 py-3 font-semibold text-[var(--ds2-danger-solid,#dc2626)] transition-all hover:bg-[var(--ds2-danger-tint-bg,#fef2f2)]"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <RotateCcw className="h-4 w-4" />
                                    {t('settings.resetButton')}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={!pendingChanges || saveStatus === 'saving'}
                                className="min-h-touch-sm rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 px-5 py-3 font-medium text-neutral-50 transition-all hover:from-blue-600 hover:to-blue-700 disabled:opacity-50"
                            >
                                <span className="inline-flex items-center gap-2">
                                    {saveStatus === 'saved' ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                                    {renderSaveLabel()}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            {pendingTrainingMode !== null && (
                <ConfirmDialog
                    tone="warning"
                    title={t('settings.fiscalAT.trainingTitle')}
                    message={pendingTrainingMode ? t('settings.confirm.trainingOn') : t('settings.confirm.trainingOff')}
                    cancelLabel={t('common.cancel')}
                    confirmLabel={t('common.confirm')}
                    onCancel={() => setPendingTrainingMode(null)}
                    onConfirm={confirmTrainingModeChange}
                />
            )}
        </div>
    );
};

export default Settings;
