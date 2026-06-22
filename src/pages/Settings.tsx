import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    FileText,
    KeyRound,
    Languages,
    Monitor,
    PackageCheck,
    Printer,
    Receipt,
    RotateCcw,
    Save,
    Settings as SettingsIcon,
    Shield,
    Store,
    Wifi,
    type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../contexts/SettingsContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import type { SystemSettings } from '../contexts/SettingsContext';
import { cloneSettingsSnapshot, logCommittedSettingsChanges } from '../fiscal/fiscalAuditLog';
import { buildSaftAuditFileXml } from '../fiscal/saft/exportSaft';
import { buildChainScope, computeSeriesKey } from '../fiscal/seriesUtils';
import { checkVendusFiscalHealth, fetchVendusSaftXml } from '../fiscal/vendusFiscalIssuer';
import type { FiscalSeriesDocKey, ReceiptSeriesProfile } from '../fiscal/receiptSeriesProfile';
import { initializeLocalDatabase, transactionLocalService } from '../lib/localDatabase';
import { IVA_RATES } from '../types/supabase';
import { isSystemAdministrator } from '../utils/systemAdmin';
import { generateUUID } from '../utils/uuid';
import type { ReceiptLanguage } from '../utils/receiptLanguage';
import { PrinterSettingsPanel, type HardwareSettingsTool } from './PrinterTestPage';
import { SeedManagementPanel } from './SeedManagement';
import { CashierTestingPanel } from './CashierTesting';
import { ElectronTestingPanel } from './ElectronCashierTesting';
import { useDesignSystem2Customization } from '../contexts/DesignSystem2CustomizationContext';
import '../styles/design-system-2-scope.css';

type SettingsTabId = 'security' | 'pos' | 'display' | 'hardware' | 'company';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type VendusCheckStatus = 'idle' | 'checking' | 'ok' | 'error';

const glassCard =
    'rounded-[2rem] border border-white/70 bg-white/80 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur-xl';
const fieldClass =
    'min-h-touch-sm w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-base font-medium text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-200';
const subtleFieldClass =
    'min-h-touch-sm w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-base font-medium text-slate-900 outline-none transition-all duration-200 focus:border-slate-400 focus:ring-4 focus:ring-slate-200';

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
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 ${
            checked ? 'bg-slate-950' : 'bg-slate-300'
        }`}
    >
        <span
            className={`inline-block h-6 w-6 rounded-full bg-white shadow-lg transition-transform duration-200 ${
                checked ? 'translate-x-7' : 'translate-x-1'
            }`}
        />
    </button>
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
    return (
        <div className="grid gap-2 rounded-[1.5rem] bg-slate-100 p-2 sm:grid-cols-2">
            {options.map(option => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => onChange(option.value)}
                        className={`min-h-touch rounded-2xl px-4 py-3 text-left transition-all duration-200 ${
                            active
                                ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200'
                                : 'text-slate-500 hover:bg-white/60 hover:text-slate-900'
                        }`}
                    >
                        <span className="block text-base font-semibold">{option.label}</span>
                        {option.description && <span className="mt-1 block text-xs leading-5 opacity-80">{option.description}</span>}
                    </button>
                );
            })}
        </div>
    );
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
    const { employee } = useSupabaseAuth();
    const isSystemAdmin = isSystemAdministrator(employee);
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const { visualStyle, prefs, layoutClasses } = useDesignSystem2Customization();
    const [activeTab, setActiveTab] = useState<SettingsTabId>('security');
    const [hardwareTool, setHardwareTool] = useState<HardwareSettingsTool>('printer');
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
                label: 'Security',
                icon: Shield,
                description: 'Session timeout and active-sale protection.',
            },
            {
                id: 'pos' as const,
                label: 'POS',
                icon: DollarSign,
                description: 'Currency, tax, stock, and cart behavior.',
            },
            {
                id: 'display' as const,
                label: 'Display',
                icon: Monitor,
                description: 'Density and employee interface preferences.',
            },
            {
                id: 'hardware' as const,
                label: 'Hardware',
                icon: Printer,
                description: 'Printers, seed tools, and device tests.',
            },
            {
                id: 'company' as const,
                label: 'Company & Fiscal',
                icon: SettingsIcon,
                description: 'Company identity, receipts, Local AT, and Vendus.',
            },
        ],
        []
    );

    const vendusReadiness = useMemo<ReadinessItem[]>(
        () => [
            {
                label: 'Register selected',
                ok: Boolean(settings.fiscal.vendus.registerId.trim()),
                detail: settings.fiscal.vendus.registerId.trim()
                    ? `Register ${settings.fiscal.vendus.registerId.trim()}`
                    : 'Required before Vendus can issue documents.',
            },
            {
                label: 'Payment methods mapped',
                ok: Boolean(
                    settings.fiscal.vendus.paymentMethodIds.cash?.trim() &&
                        settings.fiscal.vendus.paymentMethodIds.card?.trim() &&
                        settings.fiscal.vendus.paymentMethodIds.mixed?.trim()
                ),
                detail: 'Cash, card, and mixed payments need Vendus payment method IDs.',
            },
            {
                label: 'Official output chosen',
                ok: Boolean(settings.fiscal.vendus.output),
                detail: `${settings.fiscal.vendus.output.toUpperCase()} is used as the official customer receipt output.`,
            },
            {
                label: 'Environment is explicit',
                ok: true,
                detail:
                    settings.fiscal.vendus.mode === 'normal'
                        ? 'Normal mode will issue fiscal documents in Vendus.'
                        : 'Tests mode avoids production fiscal issuance.',
            },
        ],
        [settings.fiscal.vendus]
    );

    const vendusReadyCount = vendusReadiness.filter(item => item.ok).length;
    const fiscalIssuerLabel =
        settings.fiscal.issuer === 'vendus'
            ? 'Vendus'
            : settings.fiscal.issuer === 'invoicexpress'
                ? 'InvoiceXpress'
                : settings.fiscal.issuer === 'fiskaly'
                    ? 'Fiskaly'
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
        if (hw === 'printer' || hw === 'seed' || hw === 'cashier' || hw === 'electron') {
            setActiveTab('hardware');
            setHardwareTool(hw);
        }
    }, [searchParams]);

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

    const handleTrainingModeChange = useCallback(
        (next: boolean) => {
            const msg = next ? t('settings.confirm.trainingOn') : t('settings.confirm.trainingOff');
            if (!window.confirm(msg)) return;
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
        [t, updateSettings]
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
        setExternalCheck({ status: 'checking', message: 'A contactar o emissor fiscal...' });
        try {
            if (settings.fiscal.issuer === 'invoicexpress') {
                const { checkInvoiceXpressFiscalHealth } = await import('../fiscal/invoicexpressFiscalIssuer');
                const result = await checkInvoiceXpressFiscalHealth(settings);
                setExternalCheck({
                    status: result.ok ? 'ok' : 'error',
                    message: result.ok
                        ? 'InvoiceXpress respondeu. Conta e séries acessíveis.'
                        : 'InvoiceXpress respondeu mas não confirmou prontidão.',
                });
            } else if (settings.fiscal.issuer === 'fiskaly') {
                const { checkFiskalyFiscalHealth } = await import('../fiscal/fiskalyFiscalIssuer');
                const result = await checkFiskalyFiscalHealth(settings);
                setExternalCheck({
                    status: result.ok ? 'ok' : 'error',
                    message: result.ok
                        ? 'Fiskaly respondeu. Organização e sistema acessíveis.'
                        : 'Fiskaly respondeu mas não confirmou prontidão.',
                });
            }
        } catch (error) {
            setExternalCheck({
                status: 'error',
                message: error instanceof Error ? error.message : 'Health check falhou.',
            });
        }
    }, [settings]);

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
        setVendusCheck({ status: 'checking', message: 'Checking Vendus account, taxes, and payment methods...' });
        try {
            const result = await checkVendusFiscalHealth(settings);
            setVendusCheck({
                status: result.ok ? 'ok' : 'error',
                message: result.ok
                    ? 'Vendus responded successfully. Account, taxes, and payment methods are reachable.'
                    : 'Vendus responded, but the health check did not confirm readiness.',
            });
        } catch (error) {
            setVendusCheck({
                status: 'error',
                message: error instanceof Error ? error.message : 'Vendus health check failed.',
            });
        }
    }, [settings]);

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
                            ? 'A exportação SAF-T Vendus deve ser mensal. Escolha datas dentro do mesmo mês.'
                            : 'A exportação SAF-T deve ser mensal. Escolha datas dentro do mesmo mês.'
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
                        ? 'SAF-T Vendus descarregado. A cópia local não foi marcada como exportada.'
                        : 'SAF-T descarregado. A cópia local não foi marcada como exportada.'
                );
                return;
            }

            if (isExternalIssuer) {
                const [startYear, startMonth] = saftStart.split('-').map(Number);
                const [endYear, endMonth] = saftEnd.split('-').map(Number);
                if (startYear !== endYear || startMonth !== endMonth) {
                    throw new Error(
                        isSystemAdmin
                            ? 'A exportação SAF-T do emissor cloud deve ser mensal. Escolha datas dentro do mesmo mês.'
                            : 'A exportação SAF-T deve ser mensal. Escolha datas dentro do mesmo mês.'
                    );
                }
                const xml =
                    settings.fiscal.issuer === 'invoicexpress'
                        ? await (await import('../fiscal/invoicexpressFiscalIssuer')).fetchInvoiceXpressSaftXml({
                              settings,
                              year: startYear,
                              month: startMonth,
                          })
                        : await (await import('../fiscal/fiskalyFiscalIssuer')).fetchFiskalySaftXml({
                              settings,
                              year: startYear,
                              month: startMonth,
                          });
                const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = isSystemAdmin
                    ? `SAFT_${settings.fiscal.issuer.toUpperCase()}_${startYear}_${String(startMonth).padStart(2, '0')}.xml`
                    : `SAFT_${startYear}_${String(startMonth).padStart(2, '0')}.xml`;
                a.click();
                URL.revokeObjectURL(url);
                setSaftMessage(
                    isSystemAdmin
                        ? `SAF-T ${fiscalIssuerLabel} descarregado. A cópia local não foi marcada como exportada.`
                        : 'SAF-T descarregado. A cópia local não foi marcada como exportada.'
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
        if (saveStatus === 'saving') return 'Saving';
        if (saveStatus === 'saved') return 'Saved';
        if (saveStatus === 'error') return 'Retry save';
        return 'Save changes';
    };

    const renderSecurity = () => (
        <div className="space-y-6">
            <SettingCard
                title="Session protection"
                description="Keep tills secure without punishing active sales."
                icon={Shield}
                accent="from-blue-600 to-sky-500"
            >
                <SettingsRow
                    title="Auto-lock this terminal"
                    description="Sign the cashier out after a period without activity."
                    icon={Clock}
                >
                    <div className="flex justify-end">
                        <ToggleSwitch
                            checked={settings.autoLogout.enabled}
                            onChange={checked => handleSettingsChange('autoLogout', 'enabled', checked)}
                            label="Toggle auto-lock"
                        />
                    </div>
                </SettingsRow>

                <SettingsRow title="Lock after" description="Choose the inactivity window before logout begins." icon={Bell}>
                    <select
                        value={settings.autoLogout.timeoutMinutes}
                        onChange={event => handleSettingsChange('autoLogout', 'timeoutMinutes', parseInt(event.target.value, 10))}
                        className={fieldClass}
                        disabled={!settings.autoLogout.enabled}
                    >
                        {[1, 5, 10, 15, 20, 30, 45, 60, 120].map(minutes => (
                            <option key={minutes} value={minutes}>
                                {minutes < 60 ? `${minutes} minutes` : `${minutes / 60} hour${minutes === 60 ? '' : 's'}`}
                            </option>
                        ))}
                    </select>
                </SettingsRow>

                <SettingsRow title="Warn before locking" description="Give the operator time to extend the session." icon={AlertTriangle}>
                    <select
                        value={settings.autoLogout.warningSeconds}
                        onChange={event => handleSettingsChange('autoLogout', 'warningSeconds', parseInt(event.target.value, 10))}
                        className={fieldClass}
                        disabled={!settings.autoLogout.enabled}
                    >
                        {[10, 15, 30, 45, 60, 90, 120].map(seconds => (
                            <option key={seconds} value={seconds}>
                                {seconds} seconds
                            </option>
                        ))}
                    </select>
                </SettingsRow>

                <SettingsRow
                    title="Protect sales in progress"
                    description="Do not auto-lock when the cart has items."
                    icon={PackageCheck}
                >
                    <div className="flex justify-end">
                        <ToggleSwitch
                            checked={settings.autoLogout.protectWhenCartHasItems}
                            onChange={checked => handleSettingsChange('autoLogout', 'protectWhenCartHasItems', checked)}
                            label="Protect active sales"
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
                    title="Money and VAT"
                    description="Defaults used by the sales screen and new products."
                    icon={DollarSign}
                    accent="from-emerald-600 to-teal-500"
                >
                    <SettingsRow title="Currency symbol" description="Shown on POS totals and reports.">
                        <select
                            value={settings.pos.currencySymbol}
                            onChange={event => handleSettingsChange('pos', 'currencySymbol', event.target.value)}
                            className={fieldClass}
                        >
                            <option value="€">Euro - EUR</option>
                            <option value="$">Dollar - USD</option>
                            <option value="£">Pound - GBP</option>
                            <option value="¥">Yen - JPY</option>
                        </select>
                    </SettingsRow>
                    <SettingsRow title="Default IVA rate" description="Used when a product does not override tax.">
                        <select
                            value={settings.pos.taxRate}
                            onChange={event => handleSettingsChange('pos', 'taxRate', parseFloat(event.target.value))}
                            className={fieldClass}
                        >
                            {IVA_RATES.map(rate => (
                                <option key={rate.value} value={rate.value}>
                                    {rate.label}
                                </option>
                            ))}
                        </select>
                    </SettingsRow>
                </SettingCard>

                <SettingCard
                    title="Inventory"
                    description="Controls how sales affect stock on this till."
                    icon={Database}
                    accent="from-orange-500 to-amber-500"
                >
                    <SettingsRow title="Track inventory" description="When off, sales do not decrement product stock.">
                        <div className="flex justify-end">
                            <ToggleSwitch
                                checked={settings.pos.trackInventory}
                                onChange={checked => handleSettingsChange('pos', 'trackInventory', checked)}
                                label="Track inventory"
                            />
                        </div>
                    </SettingsRow>
                    <SettingsRow title="Allow negative stock" description="Let cashiers sell even when stock reaches zero.">
                        <div className="flex justify-end">
                            <ToggleSwitch
                                checked={settings.pos.allowNegativeStock}
                                onChange={checked => handleSettingsChange('pos', 'allowNegativeStock', checked)}
                                label="Allow negative stock"
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
                title="Cart behavior"
                description="Reduce abandoned carts without disrupting real sales."
                icon={Clock}
                accent="from-yellow-500 to-orange-500"
            >
                <SettingsRow title="Auto-clear inactive cart" description="Clear unpaid carts after a chosen idle period.">
                    <div className="flex justify-end">
                        <ToggleSwitch
                            checked={settings.pos.autoClearCart.enabled}
                            onChange={checked =>
                                handleSettingsChange('pos', 'autoClearCart', {
                                    ...settings.pos.autoClearCart,
                                    enabled: checked,
                                })
                            }
                            label="Auto-clear cart"
                        />
                    </div>
                </SettingsRow>
                <SettingsRow title="Clear after" description="Set to never for restaurants that keep orders open.">
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
                                {minutes === 0 ? 'Never' : `${minutes} minutes`}
                            </option>
                        ))}
                    </select>
                </SettingsRow>
            </SettingCard>
        </div>
    );

    const renderDisplay = () => (
        <div className="space-y-6">
            <SettingCard
                title="Interface"
                description="Tune screen density for the operator and device size."
                icon={Monitor}
                accent="from-violet-600 to-fuchsia-500"
            >
                <SettingsRow title="Items per page" description="Controls list pages outside the main POS grid.">
                    <select
                        value={settings.display.itemsPerPage}
                        onChange={event => handleSettingsChange('display', 'itemsPerPage', parseInt(event.target.value, 10))}
                        className={fieldClass}
                    >
                        {[10, 20, 50, 100].map(count => (
                            <option key={count} value={count}>
                                {count} items
                            </option>
                        ))}
                    </select>
                </SettingsRow>
                <SettingsRow title="Compact mode" description="Fit more content on screen with tighter spacing.">
                    <div className="flex justify-end">
                        <ToggleSwitch
                            checked={settings.display.compactMode}
                            onChange={checked => handleSettingsChange('display', 'compactMode', checked)}
                            label="Compact mode"
                        />
                    </div>
                </SettingsRow>
                <SettingsRow title="Show employee photos" description="Display employee avatars where available.">
                    <div className="flex justify-end">
                        <ToggleSwitch
                            checked={settings.display.showEmployeePhotos}
                            onChange={checked => handleSettingsChange('display', 'showEmployeePhotos', checked)}
                            label="Show employee photos"
                        />
                    </div>
                </SettingsRow>
            </SettingCard>
        </div>
    );

    const renderHardware = () => {
        const tools: Array<{ id: HardwareSettingsTool; label: string; description: string; icon: LucideIcon }> = [
            { id: 'printer', label: 'Printers', description: 'Receipts and routing', icon: Printer },
            { id: 'seed', label: 'Seed tools', description: 'Data setup', icon: Database },
            { id: 'cashier', label: 'Cashier tests', description: 'Auth and workflows', icon: BadgeCheck },
            { id: 'electron', label: 'Electron', description: 'Desktop hardware', icon: Monitor },
        ];
        return (
            <div className="space-y-6">
                <SettingCard
                    title="Hardware and operations"
                    description="Operational tools stay grouped here so production settings remain calm."
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
                                    className={`min-h-touch rounded-3xl border p-4 text-left transition-all duration-200 ${
                                        active
                                            ? 'border-blue-400 bg-gradient-primary text-white shadow-xl'
                                            : 'border-slate-200 bg-white/80 text-slate-600 hover:bg-white hover:text-slate-950'
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
                    {hardwareTool === 'seed' && <SeedManagementPanel embedded />}
                    {hardwareTool === 'cashier' && <CashierTestingPanel embedded />}
                    {hardwareTool === 'electron' && <ElectronTestingPanel embedded />}
                </div>
            </div>
        );
    };

    const renderCompanyIdentity = () => (
        <SettingCard
            title="Company identity"
            description="Printed on receipts, SAF-T exports, and customer documents."
            icon={Building2}
            accent="from-slate-900 to-slate-600"
        >
            <div className="grid gap-4 lg:grid-cols-2">
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Company name</label>
                    <input
                        type="text"
                        value={settings.company.name}
                        onChange={event => handleSettingsChange('company', 'name', event.target.value)}
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Tax number</label>
                    <input
                        type="text"
                        value={settings.company.taxNumber}
                        onChange={event => handleSettingsChange('company', 'taxNumber', event.target.value)}
                        className={fieldClass}
                    />
                </div>
                <div className="lg:col-span-2">
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Address</label>
                    <input
                        type="text"
                        value={settings.company.address}
                        onChange={event => handleSettingsChange('company', 'address', event.target.value)}
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Postal code</label>
                    <input
                        type="text"
                        value={settings.company.postalCode}
                        onChange={event => handleSettingsChange('company', 'postalCode', event.target.value)}
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">City</label>
                    <input
                        type="text"
                        value={settings.company.city}
                        onChange={event => handleSettingsChange('company', 'city', event.target.value)}
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Phone</label>
                    <input
                        type="text"
                        value={settings.company.phone || ''}
                        onChange={event => handleSettingsChange('company', 'phone', event.target.value)}
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Email</label>
                    <input
                        type="email"
                        value={settings.company.email || ''}
                        onChange={event => handleSettingsChange('company', 'email', event.target.value)}
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Receipt slogan</label>
                    <input
                        type="text"
                        value={settings.company.slogan || ''}
                        onChange={event => handleSettingsChange('company', 'slogan', event.target.value)}
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Software line</label>
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
            title="Receipt basics"
            description="Customer-facing receipt preferences that apply to both fiscal issuers."
            icon={Receipt}
            accent="from-indigo-600 to-blue-500"
        >
            <SettingsRow title="Receipt language" description="Independent from the app language." icon={Languages}>
                <select
                    value={settings.receipt.receiptLanguage}
                    onChange={event => handleSettingsChange('receipt', 'receiptLanguage', event.target.value as ReceiptLanguage)}
                    className={fieldClass}
                >
                    <option value="pt">Portuguese</option>
                    <option value="en">English</option>
                </select>
            </SettingsRow>
            <SettingsRow title="Counter label" description="Printed as the till/counter identifier." icon={Store}>
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
                title="AT series"
                icon={KeyRound}
                accent="from-emerald-600 to-green-500"
            >
                <SettingsRow title="Document family" description="FT is for sales. NC is for credit notes.">
                    <SegmentedControl
                        value={seriesEditorKey}
                        onChange={setSeriesEditorKey}
                        options={[
                            { value: 'FT', label: 'Fatura - FT', description: 'Default sale document' },
                            { value: 'NC', label: 'Nota de credito - NC', description: 'Reversal document' },
                        ]}
                    />
                </SettingsRow>
                <SettingsRow title="AT series" description="The series name communicated to AT.">
                    <input
                        type="text"
                        value={prof.series}
                        onChange={event => handleReceiptProfileChange(docKey, 'series', event.target.value)}
                        className={fieldClass}
                    />
                </SettingsRow>
                <SettingsRow title="Series description" description="Human label for backoffice/admin clarity.">
                    <input
                        type="text"
                        value={prof.seriesDescription ?? ''}
                        onChange={event => handleReceiptProfileChange(docKey, 'seriesDescription', event.target.value)}
                        className={fieldClass}
                    />
                </SettingsRow>
                <div className="grid gap-4 md:grid-cols-2">
                    <SettingsRow title="Number width" description="Padding used in invoice numbers.">
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
                    <SettingsRow title="Current number" description="Last issued number in this local series.">
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
                    <SettingsRow title="Start date" description="Optional series validity start.">
                        <input
                            type="date"
                            value={prof.seriesStartDate?.trim() || ''}
                            onChange={event =>
                                handleReceiptProfileChange(docKey, 'seriesStartDate', event.target.value || undefined)
                            }
                            className={fieldClass}
                        />
                    </SettingsRow>
                    <SettingsRow title="End date" description="Optional series validity end.">
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
                <SettingsRow title="AT validation code" description="Required for Local AT issuing.">
                    <input
                        type="text"
                        value={prof.atValidationCode}
                        onChange={event => handleReceiptProfileChange(docKey, 'atValidationCode', event.target.value)}
                        className={fieldClass}
                    />
                </SettingsRow>
                <div className="mt-4 grid gap-3 rounded-3xl bg-emerald-50 p-4 text-sm md:grid-cols-2">
                    <div>
                        <p className="font-semibold text-emerald-900">Last series key</p>
                        <p className="mt-1 text-emerald-700">{prof.lastSeriesKey || 'Not issued yet'}</p>
                    </div>
                    <div>
                        <p className="font-semibold text-emerald-900">Last document in chain</p>
                        <p className="mt-1 text-emerald-700">{chainTips[docKey] ?? 'Not issued yet'}</p>
                    </div>
                </div>
            </SettingCard>
        );
    };

    const renderFiscalIssuer = () => (
        <SettingCard
            title="Fiscal controls"
            description={
                isSystemAdmin
                    ? 'Choose exactly one production fiscal authority. Local AT stays untouched; Vendus can temporarily own issuance.'
                    : 'Training mode uses a separate local database. Fiscal issuer details are managed by the system administrator.'
            }
            icon={BadgeCheck}
            accent="from-slate-950 to-blue-700"
        >
            {isSystemAdmin && (
                <SettingsRow title="Active issuer" description="This controls checkout behavior. Vendus mode blocks checkout when offline.">
                    <SegmentedControl
                        value={settings.fiscal.issuer}
                        onChange={handleFiscalIssuerChange}
                        options={[
                            { value: 'local_at', label: 'Local AT', description: 'Offline-first local chain' },
                            { value: 'vendus', label: 'Vendus', description: 'Certified external issuer' },
                            { value: 'invoicexpress', label: 'InvoiceXpress', description: 'Certified cloud issuer' },
                            { value: 'fiskaly', label: 'Fiskaly', description: 'SIGN PT cloud issuer' },
                        ]}
                    />
                </SettingsRow>
            )}

            <SettingsRow title="Training mode" description="Uses the training IndexedDB slot and marks issued local documents as training.">
                <div className="flex justify-end">
                    <ToggleSwitch
                        checked={settings.fiscal.trainingMode}
                        onChange={handleTrainingModeChange}
                        label="Training mode"
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
                            label={`Active: ${fiscalIssuerLabel}`}
                            tone={settings.fiscal.issuer === 'local_at' ? 'green' : 'blue'}
                        />
                        <StatusPill
                            label={settings.fiscal.trainingMode ? 'Training database' : 'Production database'}
                            tone={settings.fiscal.trainingMode ? 'amber' : 'slate'}
                        />
                        {settings.fiscal.issuer === 'vendus' && (
                            <StatusPill
                                label={`${vendusReadyCount}/${vendusReadiness.length} setup checks`}
                                tone={vendusReadyCount === vendusReadiness.length ? 'green' : 'amber'}
                            />
                        )}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                        {settings.fiscal.issuer === 'local_at'
                            ? 'Local AT owns document number, ATCUD, hash chain, QR code, and local SAF-T export.'
                            : `${fiscalIssuerLabel} owns document number, ATCUD, hash, QR code, and SAF-T for this period.`}
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
                title={`${fiscalIssuerLabel} setup`}
                description="Routing config for the certified cloud issuer. API keys live in the edge-function environment, not here."
                icon={Cloud}
                accent="from-indigo-600 to-blue-500"
            >
                <div className="space-y-5">
                    {isIx ? (
                        <>
                            <SettingsRow title="Account name" description="Subdomain in {account}.app.invoicexpress.com.">
                                <input
                                    type="text"
                                    value={ix.accountName}
                                    onChange={e => handleInvoiceXpressSettingChange('accountName', e.target.value)}
                                    placeholder="minha-empresa"
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                />
                            </SettingsRow>
                            <SettingsRow title="Document type" description="Maps to the InvoiceXpress endpoint and SAF-T type.">
                                <SegmentedControl
                                    value={ix.documentType}
                                    onChange={v => handleInvoiceXpressSettingChange('documentType', v)}
                                    options={[
                                        { value: 'invoice_receipt', label: 'Fatura-Recibo (FR)', description: 'Paga na emissão' },
                                        { value: 'simplified_invoice', label: 'Fatura Simplificada (FS)', description: 'Consumidor final' },
                                        { value: 'invoice', label: 'Fatura (FT)', description: 'Com NIF' },
                                    ]}
                                />
                            </SettingsRow>
                            <SettingsRow title="Série (sequence id)" description="Opcional — vazio usa a série predefinida da conta.">
                                <input
                                    type="text"
                                    value={ix.sequenceId ?? ''}
                                    onChange={e => handleInvoiceXpressSettingChange('sequenceId', e.target.value)}
                                    placeholder="(predefinida)"
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                />
                            </SettingsRow>
                            <SettingsRow title="Finalizar na emissão" description="Muda o estado para finalized para atribuir ATCUD/hash.">
                                <div className="flex justify-end">
                                    <ToggleSwitch
                                        checked={ix.finalizeOnIssue}
                                        onChange={v => handleInvoiceXpressSettingChange('finalizeOnIssue', v)}
                                        label="Finalizar"
                                    />
                                </div>
                            </SettingsRow>
                            <SettingsRow title="Código de isenção" description="Aplicado a linhas isentas (ex.: M99).">
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
                            <SettingsRow title="Environment" description="Test usa test.api.fiskaly.com; Live emite documentos reais.">
                                <SegmentedControl
                                    value={fk.environment}
                                    onChange={v => handleFiskalySettingChange('environment', v)}
                                    options={[
                                        { value: 'test', label: 'Test', description: 'Sandbox' },
                                        { value: 'live', label: 'Live', description: 'Produção' },
                                    ]}
                                />
                            </SettingsRow>
                            <SettingsRow title="Document type" description="Tipo SAF-T do documento de venda.">
                                <SegmentedControl
                                    value={fk.documentType}
                                    onChange={v => handleFiskalySettingChange('documentType', v)}
                                    options={[
                                        { value: 'FT', label: 'Fatura (FT)', description: 'Com NIF' },
                                        { value: 'FS', label: 'Simplificada (FS)', description: 'Consumidor final' },
                                        { value: 'FR', label: 'Fatura-Recibo (FR)', description: 'Paga na emissão' },
                                    ]}
                                />
                            </SettingsRow>
                            <SettingsRow title="Taxpayer ID" description="Identificador do taxpayer Fiskaly.">
                                <input
                                    type="text"
                                    value={fk.taxpayerId}
                                    onChange={e => handleFiskalySettingChange('taxpayerId', e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                />
                            </SettingsRow>
                            <SettingsRow title="Location ID" description="Identificador da location Fiskaly.">
                                <input
                                    type="text"
                                    value={fk.locationId}
                                    onChange={e => handleFiskalySettingChange('locationId', e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                />
                            </SettingsRow>
                            <SettingsRow title="System ID" description="Identificador do system (POS) Fiskaly.">
                                <input
                                    type="text"
                                    value={fk.systemId}
                                    onChange={e => handleFiskalySettingChange('systemId', e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                />
                            </SettingsRow>
                            <SettingsRow title="Series ID" description="Opcional — série a usar para a numeração.">
                                <input
                                    type="text"
                                    value={fk.seriesId ?? ''}
                                    onChange={e => handleFiskalySettingChange('seriesId', e.target.value)}
                                    placeholder="(predefinida)"
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                />
                            </SettingsRow>
                        </>
                    )}

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={handleExternalHealthCheck}
                            disabled={externalCheck.status === 'checking'}
                            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                            {externalCheck.status === 'checking' ? 'A verificar...' : 'Verificar ligação'}
                        </button>
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

    const renderVendusSetup = () => (
        <SettingCard
            title="Vendus setup"
            description="A guided path for temporary outsourced fiscal issuing."
            icon={Cloud}
            accent="from-blue-600 to-cyan-500"
        >
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-5">
                    <SettingsRow title="Environment" description="Use tests until Vendus/accountant validates every scenario." icon={Wifi}>
                        <SegmentedControl
                            value={settings.fiscal.vendus.mode}
                            onChange={value => handleVendusSettingChange('mode', value)}
                            options={[
                                { value: 'tests', label: 'Tests', description: 'Safe validation' },
                                { value: 'normal', label: 'Normal', description: 'Live fiscal issuing' },
                            ]}
                        />
                    </SettingsRow>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-700">Register ID</label>
                            <input
                                type="text"
                                value={settings.fiscal.vendus.registerId}
                                onChange={event => handleVendusSettingChange('registerId', event.target.value)}
                                className={fieldClass}
                                placeholder="Required"
                            />
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-700">Store ID</label>
                            <input
                                type="text"
                                value={settings.fiscal.vendus.storeId || ''}
                                onChange={event => handleVendusSettingChange('storeId', event.target.value)}
                                className={fieldClass}
                                placeholder="Optional"
                            />
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-700">Document type</label>
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
                                <option value="FT">FT - Fatura</option>
                                <option value="FS">FS - Fatura Simplificada</option>
                                <option value="FR">FR - Fatura Recibo</option>
                            </select>
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-700">Official receipt output</label>
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
                                <option value="html">HTML preview</option>
                                <option value="pdf_url">PDF URL</option>
                                <option value="pdf">PDF payload</option>
                                <option value="escpos">ESC/POS</option>
                                <option value="auto">Auto</option>
                            </select>
                        </div>
                    </div>

                    <div className="rounded-[1.75rem] bg-slate-50 p-4">
                        <div className="mb-3 flex items-center gap-2">
                            <CreditCard className="h-5 w-5 text-slate-500" />
                            <h3 className="font-semibold text-slate-950">Payment method mapping</h3>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                            {(['cash', 'card', 'mixed'] as const).map(method => (
                                <div key={method}>
                                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        {method}
                                    </label>
                                    <input
                                        type="text"
                                        value={settings.fiscal.vendus.paymentMethodIds[method] || ''}
                                        onChange={event => handleVendusPaymentMethodChange(method, event.target.value)}
                                        className={subtleFieldClass}
                                        placeholder="Vendus ID"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-[1.75rem] bg-slate-50 p-4">
                        <div className="mb-3 flex items-center gap-2">
                            <FileText className="h-5 w-5 text-slate-500" />
                            <h3 className="font-semibold text-slate-950">IVA exemption fallback</h3>
                        </div>
                        <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
                            <div>
                                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Code
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
                                    Law or reason
                                </label>
                                <input
                                    type="text"
                                    value={settings.fiscal.vendus.exemptTax.law || ''}
                                    onChange={event => handleVendusExemptTaxChange('law', event.target.value)}
                                    className={subtleFieldClass}
                                    placeholder="Required if exempt products are sold"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <aside className="space-y-4">
                    <div className="rounded-[1.75rem] bg-white p-4 shadow-sm ring-1 ring-slate-200">
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <h3 className="font-semibold text-slate-950">Readiness</h3>
                                <p className="text-xs text-slate-500">Before switching live.</p>
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
                                <h3 className="font-semibold">Connection check</h3>
                                <p className="mt-1 text-sm leading-6 text-white/70">
                                    Calls the Vendus Edge Function and verifies account, taxes, and payment method endpoints.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleVendusHealthCheck}
                            disabled={vendusCheck.status === 'checking'}
                            className="mt-4 min-h-touch-sm w-full rounded-2xl bg-white px-4 py-3 font-semibold text-slate-950 transition-all hover:bg-slate-100 disabled:opacity-60"
                        >
                            {vendusCheck.status === 'checking' ? 'Checking...' : 'Check Vendus'}
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
            title="SAF-T export"
            description={
                isSystemAdmin
                    ? settings.fiscal.issuer === 'vendus'
                        ? 'Vendus periods use Vendus monthly SAF-T. Choose dates inside the same month.'
                        : settings.fiscal.issuer === 'local_at'
                            ? 'Local AT periods use local immutable fiscal rows.'
                            : `${fiscalIssuerLabel} periods use monthly SAF-T. Choose dates inside the same month.`
                    : 'Export fiscal audit data for the selected period.'
            }
            icon={FileDown}
            accent="from-green-600 to-emerald-500"
        >
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">From</label>
                    <input type="date" value={saftStart} onChange={event => setSaftStart(event.target.value)} className={fieldClass} />
                </div>
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">To</label>
                    <input type="date" value={saftEnd} onChange={event => setSaftEnd(event.target.value)} className={fieldClass} />
                </div>
                <button
                    type="button"
                    onClick={handleExportSaft}
                    disabled={saftBusy}
                    className="min-h-touch rounded-2xl bg-slate-950 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-slate-800 disabled:translate-y-0 disabled:opacity-60"
                >
                    {saftBusy
                        ? 'Exporting...'
                        : !isSystemAdmin
                            ? 'Download SAF-T'
                            : settings.fiscal.issuer === 'local_at'
                            ? 'Download local SAF-T'
                            : `Download ${fiscalIssuerLabel} SAF-T`}
                </button>
            </div>
            {saftMessage && <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{saftMessage}</p>}
        </SettingCard>
    );

    const renderCompany = () => (
        <div className="space-y-6">
            {renderCompanyIdentity()}
            {renderReceiptBasics()}
            {renderFiscalIssuer()}
            {isSystemAdmin &&
                (settings.fiscal.issuer === 'local_at'
                    ? renderLocalAtSeries()
                    : settings.fiscal.issuer === 'vendus'
                        ? renderVendusSetup()
                        : renderExternalIssuerSetup())}
            {renderSaftExport()}
        </div>
    );

    const renderContent = () => {
        if (activeTab === 'security') return renderSecurity();
        if (activeTab === 'pos') return renderPos();
        if (activeTab === 'display') return renderDisplay();
        if (activeTab === 'hardware') return renderHardware();
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
                    <p className="font-semibold text-slate-700">Loading settings...</p>
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
                        <div className="p-6 lg:p-8">
                            <div className="grid gap-3 sm:grid-cols-3">
                                <div className="rounded-3xl bg-white/75 p-4 ring-1 ring-slate-200">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Fiscal issuer</p>
                                    <p className="mt-2 text-lg font-semibold text-slate-950">{fiscalIssuerLabel}</p>
                                </div>
                                <div className="rounded-3xl bg-white/75 p-4 ring-1 ring-slate-200">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Database</p>
                                    <p className="mt-2 text-lg font-semibold text-slate-950">
                                        {settings.fiscal.trainingMode ? 'Training' : 'Production'}
                                    </p>
                                </div>
                                <div className="rounded-3xl bg-white/75 p-4 ring-1 ring-slate-200">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Save state</p>
                                    <p className="mt-2 text-lg font-semibold text-slate-950">
                                        {pendingChanges ? 'Unsaved' : saveStatus === 'saved' ? 'Saved' : 'Clean'}
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
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Sections</p>
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
                                {pendingChanges && <StatusPill label="Unsaved changes" tone="amber" />}
                                {saveStatus === 'saved' && <StatusPill label="Saved" tone="green" />}
                                {saveStatus === 'error' && <StatusPill label="Save failed" tone="red" />}
                            </div>
                        </div>

                        {renderContent()}
                    </main>
                </div>

                <div className="sticky bottom-4 z-30">
                    <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-[2rem] border border-white/70 bg-white/90 p-3 shadow-[0_20px_60px_rgba(15,23,42,0.18)] backdrop-blur-xl">
                        <div className="hidden min-w-0 px-3 sm:block">
                            <p className="text-sm font-semibold text-slate-950">
                                {pendingChanges ? 'You have unsaved settings.' : 'Settings are up to date.'}
                            </p>
                            <p className="text-xs text-slate-500">Save writes the audit event for fiscal settings changes.</p>
                        </div>
                        <div className="ml-auto flex gap-2">
                            <button
                                type="button"
                                onClick={handleReset}
                                className="min-h-touch-sm rounded-2xl bg-slate-100 px-4 py-3 font-semibold text-slate-700 transition-all hover:bg-slate-200"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <RotateCcw className="h-4 w-4" />
                                    Reset
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={!pendingChanges || saveStatus === 'saving'}
                                className="min-h-touch-sm rounded-2xl bg-slate-950 px-5 py-3 font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-slate-800 disabled:translate-y-0 disabled:bg-slate-300 disabled:shadow-none"
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
        </div>
    );
};

export default Settings;
