import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Settings as SettingsIcon,
    Clock,
    Shield,
    Save,
    RotateCcw,
    ChevronRight,
    AlertTriangle,
    CheckCircle,
    Monitor,
    DollarSign,
    Bell,
    Printer,
    FileDown,
} from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useTranslation } from 'react-i18next';
import { cloneSettingsSnapshot, logCommittedSettingsChanges } from '../fiscal/fiscalAuditLog';
import type { SystemSettings } from '../contexts/SettingsContext';
import { initializeLocalDatabase, transactionLocalService } from '../lib/localDatabase';
import { buildSaftAuditFileXml } from '../fiscal/saft/exportSaft';
import { buildChainScope, computeSeriesKey } from '../fiscal/seriesUtils';
import { fetchVendusSaftXml } from '../fiscal/vendusFiscalIssuer';
import type { FiscalSeriesDocKey, ReceiptSeriesProfile } from '../fiscal/receiptSeriesProfile';
import { generateUUID } from '../utils/uuid';
import { IVA_RATES } from '../types/supabase';
import type { ReceiptLanguage } from '../utils/receiptLanguage';
import { PrinterSettingsPanel, type HardwareSettingsTool } from './PrinterTestPage';
import { SeedManagementPanel } from './SeedManagement';
import { CashierTestingPanel } from './CashierTesting';
import { ElectronTestingPanel } from './ElectronCashierTesting';
import { useDesignSystem2Customization } from '../contexts/DesignSystem2CustomizationContext';
import '../styles/design-system-2-scope.css';

const Settings: React.FC = () => {
    const { settings, updateSettings, resetToDefaults, isLoading } = useSettings();
    const { employee } = useSupabaseAuth();
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const { visualStyle, prefs, layoutClasses } = useDesignSystem2Customization();
    const [activeTab, setActiveTab] = useState('security');
    const [hardwareTool, setHardwareTool] = useState<HardwareSettingsTool>('printer');
    const [pendingChanges, setPendingChanges] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [saftStart, setSaftStart] = useState(() => new Date().toISOString().slice(0, 10));
    const [saftEnd, setSaftEnd] = useState(() => new Date().toISOString().slice(0, 10));
    const [saftBusy, setSaftBusy] = useState(false);
    const [saftMessage, setSaftMessage] = useState<string | null>(null);
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

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                await initializeLocalDatabase();
                const now = new Date();
                const next: Record<FiscalSeriesDocKey, string | null> = { FS: null, FT: null, NC: null };
                const keys: FiscalSeriesDocKey[] = ['FT', 'NC'];
                for (const k of keys) {
                    const prof = settings.receipt.seriesProfiles[k];
                    const at = prof.atValidationCode.trim();
                    if (!at) continue;
                    const sk = computeSeriesKey(prof, now);
                    const cs = buildChainScope(at, sk);
                    const last = await transactionLocalService.getLastFiscalDocumentInChain(cs);
                    next[k] = last?.invoice_no ?? null;
                }
                if (!cancelled) setChainTips(next);
            } catch {
                if (!cancelled) setChainTips({ FS: null, FT: null, NC: null });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [seriesProfilesFingerprint]);

    // const [showPrinterSetup, setShowPrinterSetup] = useState(false);
    // const [printerStatus, setPrinterStatus] = useState<any>(null);

    const tabs = useMemo(
        () => [
            {
                id: 'security',
                label: t('settings.tabs.security.label'),
                icon: Shield,
                description: t('settings.tabs.security.description'),
            },
            {
                id: 'pos',
                label: t('settings.tabs.pos.label'),
                icon: DollarSign,
                description: t('settings.tabs.pos.description'),
            },
            {
                id: 'display',
                label: t('settings.tabs.display.label'),
                icon: Monitor,
                description: t('settings.tabs.display.description'),
            },
            {
                id: 'hardware',
                label: t('settings.tabs.hardware.label'),
                icon: Printer,
                description: t('settings.tabs.hardware.description'),
            },
            {
                id: 'company',
                label: t('settings.tabs.company.label'),
                icon: SettingsIcon,
                description: t('settings.tabs.company.description'),
            },
        ],
        [t]
    );

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

    const hardwareToolBtn = (tool: HardwareSettingsTool) =>
        `min-h-touch-sm flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-200 ${
            hardwareTool === tool
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
        }`;

    const handleSettingsChange = (category: string, field: string, value: unknown) => {
        updateSettings({ [category]: { [field]: value } } as Parameters<typeof updateSettings>[0]);
        setPendingChanges(true);
    };

    const handleReceiptProfileChange = useCallback(
        (key: FiscalSeriesDocKey, field: keyof ReceiptSeriesProfile, value: string | number | boolean | undefined) => {
            updateSettings({
                receipt: {
                    seriesProfiles: {
                        [key]: { [field]: value },
                    },
                },
            } as Parameters<typeof updateSettings>[0]);
            setPendingChanges(true);
        },
        [updateSettings]
    );

    const handleTrainingModeChange = (next: boolean) => {
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
    };

    const handleFiscalIssuerChange = (issuer: SystemSettings['fiscal']['issuer']) => {
        updateSettings({
            fiscal: {
                issuer,
                vendus: {
                    enabled: issuer === 'vendus',
                },
            },
        });
        setPendingChanges(true);
    };

    const handleVendusSettingChange = <K extends keyof SystemSettings['fiscal']['vendus']>(
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
        setPendingChanges(true);
    };

    const handleVendusPaymentMethodChange = (
        method: keyof SystemSettings['fiscal']['vendus']['paymentMethodIds'],
        value: string
    ) => {
        updateSettings({
            fiscal: {
                vendus: {
                    paymentMethodIds: {
                        [method]: value,
                    },
                },
            },
        } as Parameters<typeof updateSettings>[0]);
        setPendingChanges(true);
    };

    const handleVendusExemptTaxChange = (
        field: keyof SystemSettings['fiscal']['vendus']['exemptTax'],
        value: string
    ) => {
        updateSettings({
            fiscal: {
                vendus: {
                    exemptTax: {
                        [field]: value,
                    },
                },
            },
        } as Parameters<typeof updateSettings>[0]);
        setPendingChanges(true);
    };

    const handleSave = async () => {
        setSaveStatus('saving');
        try {
            const baseline = savedSettingsBaselineRef.current ?? cloneSettingsSnapshot(settings);
            await logCommittedSettingsChanges(baseline, settings, employee?.id);
            savedSettingsBaselineRef.current = cloneSettingsSnapshot(settings);
            setSaveStatus('saved');
            setPendingChanges(false);
        } catch (e) {
            console.error('Failed to save settings audit log:', e);
            setSaveStatus('error');
        }

        setTimeout(() => {
            setSaveStatus('idle');
        }, 2000);
    };

    const handleReset = () => {
        if (confirm(t('settings.confirm.resetAll'))) {
            resetToDefaults();
            savedSettingsBaselineRef.current = null;
            setPendingChanges(false);
            setSaveStatus('idle');
        }
    };

    const handleExportSaft = async () => {
        setSaftBusy(true);
        setSaftMessage(null);
        try {
            if (settings.fiscal.issuer === 'vendus') {
                const [startYear, startMonth] = saftStart.split('-').map(Number);
                const [endYear, endMonth] = saftEnd.split('-').map(Number);
                if (startYear !== endYear || startMonth !== endMonth) {
                    throw new Error('A exportação SAF-T Vendus deve ser mensal. Escolha datas dentro do mesmo mês.');
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
                a.download = `SAFT_VENDUS_${startYear}_${String(startMonth).padStart(2, '0')}.xml`;
                a.click();
                URL.revokeObjectURL(url);
                setSaftMessage('SAF-T Vendus descarregado. A cópia local não foi marcada como exportada.');
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
        } catch (e) {
            setSaftMessage(e instanceof Error ? e.message : t('settings.messages.saftExportFail'));
        } finally {
            setSaftBusy(false);
        }
    };

    if (isLoading) {
        return (
            <div
                className="ds2-visual-scope flex min-h-64 w-full items-center justify-center"
                style={visualStyle}
                data-ds2-neutral={prefs.neutralFamilyId}
            >
                <div className="text-center">
                    <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
                    <p className="text-gray-600">{t('settings.loading')}</p>
                </div>
            </div>
        );
    }

    return (
        <div
            className="ds2-visual-scope min-h-0 w-full pb-6"
            style={visualStyle}
            data-ds2-neutral={prefs.neutralFamilyId}
        >
        <div className={`space-y-6 ${layoutClasses.contentInsetX}`}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">{t('settings.header.title')}</h1>
                    <p className="text-gray-600 mt-1">{t('settings.header.subtitle')}</p>
                </div>

                <div className="flex items-center space-x-3">
                    {pendingChanges && (
                        <div className="flex items-center space-x-2 bg-yellow-50 text-yellow-700 px-4 py-2 rounded-lg">
                            <AlertTriangle className="w-4 h-4" />
                            <span className="text-sm font-medium">{t('settings.header.unsavedChanges')}</span>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleReset}
                        className="ds2-control-radius-lg flex min-h-touch-sm items-center space-x-2 rounded-lg bg-gray-500 px-4 py-2 font-semibold text-white transition-all hover:bg-gray-600"
                    >
                        <RotateCcw className="w-4 h-4" />
                        <span>{t('settings.header.resetToDefaults')}</span>
                    </button>

                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={!pendingChanges || saveStatus === 'saving'}
                        className="ds2-control-radius-lg flex min-h-touch-sm items-center space-x-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-2 font-semibold text-white transition-all hover:from-blue-600 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500"
                    >
                        {saveStatus === 'saving' ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                <span>{t('settings.header.saving')}</span>
                            </>
                        ) : saveStatus === 'saved' ? (
                            <>
                                <CheckCircle className="w-4 h-4" />
                                <span>{t('settings.header.saved')}</span>
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                <span>{t('settings.header.saveChanges')}</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            <div className="flex space-x-6">
                {/* Sidebar Navigation */}
                <div className={`${layoutClasses.sidebarW} shrink-0 space-y-2`}>
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        return (
                            <button
                                type="button"
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`w-full rounded-xl p-4 text-left transition-all duration-200 ${activeTab === tab.id
                                    ? 'border-2 border-blue-200 bg-blue-50 text-blue-800'
                                    : 'border-2 border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                                    }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                        <Icon className="w-5 h-5" />
                                        <div>
                                            <p className="font-semibold">{tab.label}</p>
                                            <p className="text-sm opacity-70">{tab.description}</p>
                                        </div>
                                    </div>
                                    <ChevronRight className={`w-4 h-4 transition-transform ${activeTab === tab.id ? 'rotate-90' : ''
                                        }`} />
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Settings Content */}
                <div className="flex-1 rounded-xl bg-white p-8 shadow-lg">
                    {/* Security & Auto-Logout Tab */}
                    {activeTab === 'security' && (
                        <div className="space-y-6">
                            <div className="flex items-center space-x-3 mb-6">
                                <Shield className="w-6 h-6 text-blue-600" />
                                <h2 className="text-2xl font-bold text-gray-800">{t('settings.security.title')}</h2>
                            </div>

                            {/* Auto-Logout Enable/Disable */}
                            <div className="p-6 bg-blue-50 rounded-xl border border-blue-200">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-800">{t('settings.security.autoLogoutTitle')}</h3>
                                        <p className="text-sm text-gray-600">{t('settings.security.autoLogoutDesc')}</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={settings.autoLogout.enabled}
                                            onChange={(e) => handleSettingsChange('autoLogout', 'enabled', e.target.checked)}
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>

                                {settings.autoLogout.enabled && (
                                    <div className="space-y-4">
                                        {/* Timeout Settings */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    <Clock className="w-4 h-4 inline mr-2" />
                                                    {t('settings.security.timeoutLabel')}
                                                </label>
                                                <select
                                                    value={settings.autoLogout.timeoutMinutes}
                                                    onChange={(e) => handleSettingsChange('autoLogout', 'timeoutMinutes', parseInt(e.target.value))}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                >
                                                    <option value={1}>{t('settings.security.durations.m1')}</option>
                                                    <option value={5}>{t('settings.security.durations.m5')}</option>
                                                    <option value={10}>{t('settings.security.durations.m10')}</option>
                                                    <option value={15}>{t('settings.security.durations.m15')}</option>
                                                    <option value={20}>{t('settings.security.durations.m20')}</option>
                                                    <option value={30}>{t('settings.security.durations.m30')}</option>
                                                    <option value={45}>{t('settings.security.durations.m45')}</option>
                                                    <option value={60}>{t('settings.security.durations.h1')}</option>
                                                    <option value={120}>{t('settings.security.durations.h2')}</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    <Bell className="w-4 h-4 inline mr-2" />
                                                    {t('settings.security.warningLabel')}
                                                </label>
                                                <select
                                                    value={settings.autoLogout.warningSeconds}
                                                    onChange={(e) => handleSettingsChange('autoLogout', 'warningSeconds', parseInt(e.target.value))}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                >
                                                    <option value={10}>{t('settings.security.durations.s10')}</option>
                                                    <option value={15}>{t('settings.security.durations.s15')}</option>
                                                    <option value={30}>{t('settings.security.durations.s30')}</option>
                                                    <option value={45}>{t('settings.security.durations.s45')}</option>
                                                    <option value={60}>{t('settings.security.durations.s60')}</option>
                                                    <option value={90}>{t('settings.security.durations.s90')}</option>
                                                    <option value={120}>{t('settings.security.durations.s120')}</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* Cart Protection */}
                                        <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
                                            <div>
                                                <h4 className="font-medium text-gray-800">{t('settings.security.protectActiveSales')}</h4>
                                                <p className="text-sm text-gray-600">{t('settings.security.protectActiveSalesDesc')}</p>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={settings.autoLogout.protectWhenCartHasItems}
                                                    onChange={(e) => handleSettingsChange('autoLogout', 'protectWhenCartHasItems', e.target.checked)}
                                                />
                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                            </label>
                                        </div>

                                        {/* Preview */}
                                        <div className="p-4 bg-gray-50 rounded-lg">
                                            <h4 className="font-medium text-gray-800 mb-2">{t('settings.security.currentConfig')}</h4>
                                            <div className="text-sm text-gray-600 space-y-1">
                                                <p>{t('settings.security.summaryMinutes', { minutes: settings.autoLogout.timeoutMinutes })}</p>
                                                <p>{t('settings.security.summaryWarning', { seconds: settings.autoLogout.warningSeconds })}</p>
                                                <p>{settings.autoLogout.protectWhenCartHasItems ? t('settings.security.summaryProtectOn') : t('settings.security.summaryProtectOff')}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* POS Configuration Tab */}
                    {activeTab === 'pos' && (
                        <div className="space-y-6">
                            <div className="flex items-center space-x-3 mb-6">
                                <DollarSign className="w-6 h-6 text-green-600" />
                                <h2 className="text-2xl font-bold text-gray-800">{t('settings.pos.title')}</h2>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="p-6 bg-green-50 rounded-xl border border-green-200">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('settings.pos.currencySettings')}</h3>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.pos.currencySymbol')}</label>
                                            <select
                                                value={settings.pos.currencySymbol}
                                                onChange={(e) => handleSettingsChange('pos', 'currencySymbol', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                            >
                                                <option value="€">{t('settings.pos.currency.euro')}</option>
                                                <option value="$">{t('settings.pos.currency.dollar')}</option>
                                                <option value="£">{t('settings.pos.currency.pound')}</option>
                                                <option value="¥">{t('settings.pos.currency.yen')}</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.pos.defaultTaxRate')}</label>
                                            <select
                                                value={settings.pos.taxRate}
                                                onChange={(e) => handleSettingsChange('pos', 'taxRate', parseFloat(e.target.value))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                            >
                                                {IVA_RATES.map(rate => (
                                                    <option key={rate.value} value={rate.value}>
                                                        {rate.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/*
                                  AGENTS: Do not delete this commented block — stock/inventory settings UI preserved for re-enable.
                                  Remove only if explicitly requested by a human.
                                <div className="p-6 bg-orange-50 rounded-xl border border-orange-200">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('settings.pos.inventorySettings')}</h3>

                                    <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
                                        <div>
                                            <h4 className="font-medium text-gray-800">{t('settings.pos.allowNegativeStock')}</h4>
                                            <p className="text-sm text-gray-600">{t('settings.pos.allowNegativeStockDesc')}</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={settings.pos.allowNegativeStock}
                                                onChange={(e) => handleSettingsChange('pos', 'allowNegativeStock', e.target.checked)}
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                                        </label>
                                    </div>

                                    <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 mt-4">
                                        <div>
                                            <h4 className="font-medium text-gray-800">{t('settings.pos.trackInventory')}</h4>
                                            <p className="text-sm text-gray-600">{t('settings.pos.trackInventoryDesc')}</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={settings.pos.trackInventory}
                                                onChange={(e) => handleSettingsChange('pos', 'trackInventory', e.target.checked)}
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                                        </label>
                                    </div>
                                </div>
                                */}

                                {/* Auto-Clear Cart Settings */}
                                <div className="p-6 bg-yellow-50 rounded-xl border border-yellow-200 md:col-span-2">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-800">{t('settings.pos.autoClearCart')}</h3>
                                            <p className="text-sm text-gray-600">{t('settings.pos.autoClearCartDesc')}</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={settings.pos.autoClearCart.enabled}
                                                onChange={(e) => handleSettingsChange('pos', 'autoClearCart', {
                                                    ...settings.pos.autoClearCart,
                                                    enabled: e.target.checked
                                                })}
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-yellow-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-600"></div>
                                        </label>
                                    </div>

                                    {settings.pos.autoClearCart.enabled && (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    <Clock className="w-4 h-4 inline mr-2" />
                                                    {t('settings.pos.clearCartAfter')}
                                                </label>
                                                <select
                                                    value={settings.pos.autoClearCart.timeoutMinutes}
                                                    onChange={(e) => handleSettingsChange('pos', 'autoClearCart', {
                                                        ...settings.pos.autoClearCart,
                                                        timeoutMinutes: parseInt(e.target.value)
                                                    })}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                                                >
                                                    <option value={0}>{t('settings.pos.never')}</option>
                                                    <option value={1}>{t('settings.security.durations.m1')}</option>
                                                    <option value={2}>{t('settings.security.durations.m2')}</option>
                                                    <option value={5}>{t('settings.security.durations.m5')}</option>
                                                    <option value={10}>{t('settings.security.durations.m10')}</option>
                                                    <option value={15}>{t('settings.security.durations.m15')}</option>
                                                    <option value={30}>{t('settings.security.durations.m30')}</option>
                                                    <option value={60}>{t('settings.security.durations.h1')}</option>
                                                </select>
                                            </div>

                                            {/* Preview */}
                                            <div className="p-4 bg-white rounded-lg border border-gray-200">
                                                <h4 className="font-medium text-gray-800 mb-2">{t('settings.pos.autoClearPreview')}</h4>
                                                <div className="text-sm text-gray-600">
                                                    {settings.pos.autoClearCart.timeoutMinutes === 0 ? (
                                                        <p>{t('settings.pos.neverCleared')}</p>
                                                    ) : (
                                                        <p>{t('settings.pos.clearedAfter', { minutes: settings.pos.autoClearCart.timeoutMinutes })}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Display & Interface Tab */}
                    {activeTab === 'display' && (
                        <div className="space-y-6">
                            <div className="flex items-center space-x-3 mb-6">
                                <Monitor className="w-6 h-6 text-purple-600" />
                                <h2 className="text-2xl font-bold text-gray-800">{t('settings.display.title')}</h2>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="p-6 bg-purple-50 rounded-xl border border-purple-200">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('settings.display.displayPreferences')}</h3>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.display.itemsPerPage')}</label>
                                            <select
                                                value={settings.display.itemsPerPage}
                                                onChange={(e) => handleSettingsChange('display', 'itemsPerPage', parseInt(e.target.value))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                            >
                                                <option value={10}>{t('settings.display.itemsOption', { count: 10 })}</option>
                                                <option value={20}>{t('settings.display.itemsOption', { count: 20 })}</option>
                                                <option value={50}>{t('settings.display.itemsOption', { count: 50 })}</option>
                                                <option value={100}>{t('settings.display.itemsOption', { count: 100 })}</option>
                                            </select>
                                        </div>

                                        <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
                                            <div>
                                                <h4 className="font-medium text-gray-800">{t('settings.display.compactMode')}</h4>
                                                <p className="text-sm text-gray-600">{t('settings.display.compactModeDesc')}</p>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={settings.display.compactMode}
                                                    onChange={(e) => handleSettingsChange('display', 'compactMode', e.target.checked)}
                                                />
                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 bg-indigo-50 rounded-xl border border-indigo-200">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('settings.display.employeeInterface')}</h3>

                                    <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
                                        <div>
                                            <h4 className="font-medium text-gray-800">{t('settings.display.showEmployeePhotos')}</h4>
                                            <p className="text-sm text-gray-600">{t('settings.display.showEmployeePhotosDesc')}</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={settings.display.showEmployeePhotos}
                                                onChange={(e) => handleSettingsChange('display', 'showEmployeePhotos', e.target.checked)}
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Hardware & tools */}
                    {activeTab === 'hardware' && (
                        <div className="space-y-6">
                            <div className="flex items-center space-x-3 mb-2">
                                <Printer className="w-6 h-6 text-blue-600" />
                                <h2 className="text-2xl font-bold text-gray-800">{t('settings.tabs.hardware.label')}</h2>
                            </div>
                            <p className="text-gray-600 mb-4">{t('settings.tabs.hardware.description')}</p>

                            <div className="flex flex-wrap gap-2 p-2 bg-gray-100 rounded-xl">
                                <button type="button" className={hardwareToolBtn('printer')} onClick={() => setHardwareTool('printer')}>
                                    {t('settings.tabs.hardwareTools.printer')}
                                </button>
                                <button type="button" className={hardwareToolBtn('seed')} onClick={() => setHardwareTool('seed')}>
                                    {t('settings.tabs.hardwareTools.seed')}
                                </button>
                                <button type="button" className={hardwareToolBtn('cashier')} onClick={() => setHardwareTool('cashier')}>
                                    {t('settings.tabs.hardwareTools.cashier')}
                                </button>
                                <button type="button" className={hardwareToolBtn('electron')} onClick={() => setHardwareTool('electron')}>
                                    {t('settings.tabs.hardwareTools.electron')}
                                </button>
                            </div>

                            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                {hardwareTool === 'printer' && <PrinterSettingsPanel embedded />}
                                {hardwareTool === 'seed' && <SeedManagementPanel embedded />}
                                {hardwareTool === 'cashier' && <CashierTestingPanel embedded />}
                                {hardwareTool === 'electron' && <ElectronTestingPanel embedded />}
                            </div>
                        </div>
                    )}

                    {/* Company & Fiscal Tab */}
                    {activeTab === 'company' && (
                        <div className="space-y-6">
                            <div className="flex items-center space-x-3 mb-6">
                                <SettingsIcon className="w-6 h-6 text-slate-600" />
                                <h2 className="text-2xl font-bold text-gray-800">{t('settings.company.title')}</h2>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="p-6 bg-slate-50 rounded-xl border border-slate-200">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('settings.company.companyInfo')}</h3>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.companyName')}</label>
                                            <input
                                                type="text"
                                                value={settings.company.name}
                                                onChange={(e) => handleSettingsChange('company', 'name', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.address')}</label>
                                            <input
                                                type="text"
                                                value={settings.company.address}
                                                onChange={(e) => handleSettingsChange('company', 'address', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="md:col-span-1">
                                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.postalCode')}</label>
                                                <input
                                                    type="text"
                                                    value={settings.company.postalCode}
                                                    onChange={(e) => handleSettingsChange('company', 'postalCode', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                                                />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.city')}</label>
                                                <input
                                                    type="text"
                                                    value={settings.company.city}
                                                    onChange={(e) => handleSettingsChange('company', 'city', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.taxNumber')}</label>
                                            <input
                                                type="text"
                                                value={settings.company.taxNumber}
                                                onChange={(e) => handleSettingsChange('company', 'taxNumber', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.phone')}</label>
                                                <input
                                                    type="text"
                                                    value={settings.company.phone || ''}
                                                    onChange={(e) => handleSettingsChange('company', 'phone', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.email')}</label>
                                                <input
                                                    type="email"
                                                    value={settings.company.email || ''}
                                                    onChange={(e) => handleSettingsChange('company', 'email', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.slogan')}</label>
                                            <input
                                                type="text"
                                                value={settings.company.slogan || ''}
                                                onChange={(e) => handleSettingsChange('company', 'slogan', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.softwareInfo')}</label>
                                            <input
                                                type="text"
                                                value={settings.company.softwareInfo || ''}
                                                onChange={(e) => handleSettingsChange('company', 'softwareInfo', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 bg-blue-50 rounded-xl border border-blue-200">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('settings.company.receiptNumbering')}</h3>
                                    <p className="text-sm text-gray-600 mb-4">{t('settings.company.seriesPerDocTypeIntro')}</p>
                                        <div className="space-y-6">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.receiptLanguage')}</label>
                                                <p className="text-sm text-gray-600 mb-2">{t('settings.company.receiptLanguageDesc')}</p>
                                                <select
                                                    value={settings.receipt.receiptLanguage}
                                                    onChange={(e) =>
                                                        handleSettingsChange('receipt', 'receiptLanguage', e.target.value as ReceiptLanguage)
                                                    }
                                                    className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                                                >
                                                    <option value="pt">{t('settings.company.receiptLanguagePt')}</option>
                                                    <option value="en">{t('settings.company.receiptLanguageEn')}</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.counterLabel')}</label>
                                                <input
                                                    type="text"
                                                    value={settings.receipt.counterLabel}
                                                    onChange={(e) => handleSettingsChange('receipt', 'counterLabel', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                />
                                            </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.configureSeriesDocType')}</label>
                                            <select
                                                value={seriesEditorKey}
                                                onChange={(e) => {
                                                    setSeriesEditorKey(e.target.value as FiscalSeriesDocKey);
                                                }}
                                                className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                                            >
                                                <option value="FT">{t('settings.company.seriesHeading.FT')}</option>
                                                <option value="NC">{t('settings.company.seriesHeading.NC')}</option>
                                            </select>
                                            {seriesEditorKey === 'NC' ? (
                                                <p className="text-sm text-gray-600 mt-2">{t('settings.company.ncSeriesEditorHint')}</p>
                                            ) : (
                                                <p className="text-sm text-gray-600 mt-2">
                                                    {t('settings.company.defaultCheckoutDoc')}{' '}
                                                    <strong>{t('settings.company.docTypeInvoice')}</strong>
                                                </p>
                                            )}
                                        </div>

                                        {(() => {
                                            const docKey = seriesEditorKey;
                                            const prof = settings.receipt.seriesProfiles[docKey];
                                            return (
                                                <div className="p-4 bg-white rounded-xl border border-blue-100 space-y-4">
                                                    <h4 className="font-semibold text-xl text-gray-800">
                                                        {t(`settings.company.seriesHeading.${docKey}`)}
                                                    </h4>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.seriesForAT')}</label>
                                                        <input
                                                            type="text"
                                                            value={prof.series}
                                                            onChange={(e) => handleReceiptProfileChange(docKey, 'series', e.target.value)}
                                                            placeholder={t('settings.company.seriesForATPlaceholder')}
                                                            className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                                                        />
                                                        <p className="text-xs text-gray-500 mt-1">{t('settings.company.seriesForATHelp')}</p>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.seriesDescription')}</label>
                                                        <input
                                                            type="text"
                                                            value={prof.seriesDescription ?? ''}
                                                            onChange={(e) => handleReceiptProfileChange(docKey, 'seriesDescription', e.target.value)}
                                                            placeholder={t('settings.company.seriesDescriptionPlaceholder')}
                                                            className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.numericWidth')}</label>
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                value={prof.numericWidth}
                                                                onChange={(e) =>
                                                                    handleReceiptProfileChange(
                                                                        docKey,
                                                                        'numericWidth',
                                                                        parseInt(e.target.value, 10)
                                                                    )
                                                                }
                                                                className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                                {t('settings.company.currentSequentialNumber')}
                                                            </label>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                step={1}
                                                                value={prof.currentNumber}
                                                                onChange={(e) => {
                                                                    const n = parseInt(e.target.value, 10);
                                                                    handleReceiptProfileChange(
                                                                        docKey,
                                                                        'currentNumber',
                                                                        Number.isFinite(n) && n >= 0 ? n : 0
                                                                    );
                                                                }}
                                                                className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                                                            />
                                                            <p className="text-xs text-gray-500 mt-1">{t('settings.company.currentSequentialHelp')}</p>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.seriesStartDate')}</label>
                                                            <input
                                                                type="date"
                                                                value={prof.seriesStartDate?.trim() || ''}
                                                                onChange={(e) =>
                                                                    handleReceiptProfileChange(
                                                                        docKey,
                                                                        'seriesStartDate',
                                                                        e.target.value || undefined
                                                                    )
                                                                }
                                                                className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.seriesEndDate')}</label>
                                                            <input
                                                                type="date"
                                                                value={prof.seriesEndDate?.trim() || ''}
                                                                onChange={(e) =>
                                                                    handleReceiptProfileChange(
                                                                        docKey,
                                                                        'seriesEndDate',
                                                                        e.target.value || undefined
                                                                    )
                                                                }
                                                                className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                                                            />
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-gray-500 -mt-2">{t('settings.company.seriesDateHelp')}</p>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.atValidationCode')}</label>
                                                        <input
                                                            type="text"
                                                            value={prof.atValidationCode}
                                                            onChange={(e) =>
                                                                handleReceiptProfileChange(docKey, 'atValidationCode', e.target.value)
                                                            }
                                                            placeholder={t('settings.company.atValidationPlaceholder')}
                                                            className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                                                        />
                                                        <p className="text-xs text-gray-500 mt-1">{t('settings.company.atValidationHelp')}</p>
                                                    </div>
                                                    <div className="p-4 bg-blue-50/50 rounded-lg border border-blue-100">
                                                        <h4 className="font-medium text-gray-800 mb-2">{t('settings.company.seriesStatus')}</h4>
                                                        <p className="text-sm text-gray-600">
                                                            {t('settings.company.lastSeriesKey')}{' '}
                                                            <strong>{prof.lastSeriesKey || '—'}</strong>
                                                        </p>
                                                        <p className="text-sm text-gray-600">
                                                            {t('settings.company.lastDocInChain')}{' '}
                                                            <strong>{chainTips[docKey] ?? '—'}</strong>
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>

                                <div className="p-6 bg-emerald-50 rounded-xl border border-emerald-200 md:col-span-2">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('settings.fiscalAT.sectionTitle')}</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4 md:col-span-2">
                                            <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 min-h-touch">
                                                <div>
                                                    <h4 className="font-medium text-gray-800">{t('settings.fiscalAT.trainingTitle')}</h4>
                                                    <p className="text-sm text-gray-600">{t('settings.fiscalAT.trainingDesc')}</p>
                                                </div>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={settings.fiscal.trainingMode}
                                                        onChange={(e) => handleTrainingModeChange(e.target.checked)}
                                                    />
                                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                                                </label>
                                            </div>
                                        </div>
                                        <div className="space-y-4 md:col-span-2">
                                            <div className="p-4 bg-white rounded-lg border border-gray-200">
                                                <h4 className="font-medium text-gray-800 mb-2">Emissor fiscal</h4>
                                                <p className="text-sm text-gray-600 mb-4">
                                                    Use Vendus apenas enquanto a certificação/licença AT local ainda não estiver ativa.
                                                    Em modo Vendus, a venda fica bloqueada sem ligação.
                                                </p>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Emissor ativo</label>
                                                        <select
                                                            value={settings.fiscal.issuer}
                                                            onChange={(e) =>
                                                                handleFiscalIssuerChange(e.target.value as SystemSettings['fiscal']['issuer'])
                                                            }
                                                            className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-lg"
                                                        >
                                                            <option value="local_at">Local AT</option>
                                                            <option value="vendus">Vendus</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Modo Vendus</label>
                                                        <select
                                                            value={settings.fiscal.vendus.mode}
                                                            onChange={(e) =>
                                                                handleVendusSettingChange(
                                                                    'mode',
                                                                    e.target.value as SystemSettings['fiscal']['vendus']['mode']
                                                                )
                                                            }
                                                            className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-lg"
                                                        >
                                                            <option value="tests">Tests</option>
                                                            <option value="normal">Normal</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Register ID</label>
                                                        <input
                                                            type="text"
                                                            value={settings.fiscal.vendus.registerId}
                                                            onChange={(e) => handleVendusSettingChange('registerId', e.target.value)}
                                                            className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-lg"
                                                            placeholder="12345"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Store ID</label>
                                                        <input
                                                            type="text"
                                                            value={settings.fiscal.vendus.storeId || ''}
                                                            onChange={(e) => handleVendusSettingChange('storeId', e.target.value)}
                                                            className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-lg"
                                                            placeholder="Opcional"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de documento</label>
                                                        <select
                                                            value={settings.fiscal.vendus.documentType}
                                                            onChange={(e) =>
                                                                handleVendusSettingChange(
                                                                    'documentType',
                                                                    e.target.value as SystemSettings['fiscal']['vendus']['documentType']
                                                                )
                                                            }
                                                            className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-lg"
                                                        >
                                                            <option value="FT">FT</option>
                                                            <option value="FS">FS</option>
                                                            <option value="FR">FR</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Output oficial</label>
                                                        <select
                                                            value={settings.fiscal.vendus.output}
                                                            onChange={(e) =>
                                                                handleVendusSettingChange(
                                                                    'output',
                                                                    e.target.value as SystemSettings['fiscal']['vendus']['output']
                                                                )
                                                            }
                                                            className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-lg"
                                                        >
                                                            <option value="html">HTML</option>
                                                            <option value="pdf_url">PDF URL</option>
                                                            <option value="pdf">PDF</option>
                                                            <option value="escpos">ESC/POS</option>
                                                            <option value="auto">Auto</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Pagamento cash ID</label>
                                                        <input
                                                            type="text"
                                                            value={settings.fiscal.vendus.paymentMethodIds.cash || ''}
                                                            onChange={(e) => handleVendusPaymentMethodChange('cash', e.target.value)}
                                                            className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-lg"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Pagamento card ID</label>
                                                        <input
                                                            type="text"
                                                            value={settings.fiscal.vendus.paymentMethodIds.card || ''}
                                                            onChange={(e) => handleVendusPaymentMethodChange('card', e.target.value)}
                                                            className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-lg"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Pagamento mixed ID</label>
                                                        <input
                                                            type="text"
                                                            value={settings.fiscal.vendus.paymentMethodIds.mixed || ''}
                                                            onChange={(e) => handleVendusPaymentMethodChange('mixed', e.target.value)}
                                                            className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-lg"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Código isenção IVA</label>
                                                        <input
                                                            type="text"
                                                            value={settings.fiscal.vendus.exemptTax.code || ''}
                                                            onChange={(e) => handleVendusExemptTaxChange('code', e.target.value)}
                                                            className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-lg"
                                                            placeholder="M99"
                                                        />
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Lei/motivo isenção IVA</label>
                                                        <input
                                                            type="text"
                                                            value={settings.fiscal.vendus.exemptTax.law || ''}
                                                            onChange={(e) => handleVendusExemptTaxChange('law', e.target.value)}
                                                            className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-lg"
                                                            placeholder="Obrigatório se usar artigos isentos"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-8 pt-6 border-t border-emerald-200">
                                        <h4 className="text-md font-semibold text-gray-800 mb-3">{t('settings.fiscalAT.saftTitle')}</h4>
                                        <p className="text-sm text-gray-600 mb-4">
                                            {t('settings.fiscalAT.saftDesc')}
                                        </p>
                                        <div className="flex flex-col md:flex-row gap-4 md:items-end">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.fiscalAT.dateFrom')}</label>
                                                <input
                                                    type="date"
                                                    value={saftStart}
                                                    onChange={(e) => setSaftStart(e.target.value)}
                                                    className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg text-xl"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.fiscalAT.dateTo')}</label>
                                                <input
                                                    type="date"
                                                    value={saftEnd}
                                                    onChange={(e) => setSaftEnd(e.target.value)}
                                                    className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg text-xl"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleExportSaft}
                                                disabled={saftBusy}
                                                className="inline-flex items-center justify-center gap-2 min-h-20 px-6 rounded-2xl font-semibold text-xl text-white bg-green-500 hover:bg-green-600 transition-colors duration-200 disabled:opacity-50"
                                            >
                                                <FileDown className="w-6 h-6" />
                                                {saftBusy ? t('settings.fiscalAT.saftExporting') : t('settings.fiscalAT.saftDownload')}
                                            </button>
                                        </div>
                                        {saftMessage && (
                                            <p className="text-sm text-gray-700 mt-3">{saftMessage}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
        </div>
    );
};

export default Settings;
