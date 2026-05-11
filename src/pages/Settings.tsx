import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
    Key,
} from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useTranslation } from 'react-i18next';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { initializeLocalDatabase, transactionLocalService } from '../lib/localDatabase';
import { buildSaftAuditFileXml } from '../fiscal/saft/exportSaft';
import { nextHashControlVersion } from '../fiscal/hashControl';
import { buildChainScope, computeSeriesKey } from '../fiscal/seriesUtils';
import type { FiscalSeriesDocKey, ReceiptSeriesProfile } from '../fiscal/receiptSeriesProfile';
import { isSystemAdministrator } from '../utils/systemAdmin';
import { generateUUID } from '../utils/uuid';
// import PrinterSetup from '../components/PrinterSetup';
import { useDesignSystem2Customization } from '../contexts/DesignSystem2CustomizationContext';
import '../styles/design-system-2-scope.css';

const Settings: React.FC = () => {
    const { settings, updateSettings, resetToDefaults, isLoading } = useSettings();
    const { employee } = useSupabaseAuth();
    const { t } = useTranslation();
    const { visualStyle, prefs, layoutClasses } = useDesignSystem2Customization();
    const [activeTab, setActiveTab] = useState('security');
    const [pendingChanges, setPendingChanges] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [saftStart, setSaftStart] = useState(() => new Date().toISOString().slice(0, 10));
    const [saftEnd, setSaftEnd] = useState(() => new Date().toISOString().slice(0, 10));
    const [saftBusy, setSaftBusy] = useState(false);
    const [saftMessage, setSaftMessage] = useState<string | null>(null);
    const [fiscalElectronMsg, setFiscalElectronMsg] = useState<string | null>(null);
    const [chainTips, setChainTips] = useState<Record<FiscalSeriesDocKey, string | null>>({
        FS: null,
        FT: null,
        NC: null,
    });
    const [keyRotationBusy, setKeyRotationBusy] = useState(false);
    const [keyRotationMessage, setKeyRotationMessage] = useState<string | null>(null);
    const [seriesEditorKey, setSeriesEditorKey] = useState<FiscalSeriesDocKey>('FS');
    const prevDefaultDocType = useRef(settings.receipt.defaultDocumentType);
    const didInitSeriesEditor = useRef(false);

    useEffect(() => {
        const d = settings.receipt.defaultDocumentType;
        if (!didInitSeriesEditor.current) {
            didInitSeriesEditor.current = true;
            setSeriesEditorKey(d === 'FATURA' ? 'FT' : 'FS');
            prevDefaultDocType.current = d;
            return;
        }
        if (prevDefaultDocType.current !== d) {
            prevDefaultDocType.current = d;
            setSeriesEditorKey(d === 'FATURA' ? 'FT' : 'FS');
        }
    }, [settings.receipt.defaultDocumentType]);

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
                const keys: FiscalSeriesDocKey[] = ['FS', 'FT', 'NC'];
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

    const handleRegisterKeyRotation = async () => {
        if (!employee || !isSystemAdministrator(employee)) {
            return;
        }
        if (
            !window.confirm(t('settings.confirm.keyRotation'))
        ) {
            return;
        }
        setKeyRotationMessage(null);
        try {
            setKeyRotationBusy(true);
            const rawPrev = (settings.fiscal.hashControlVersion || '1').trim();
            const prev = rawPrev || '1';
            const next = nextHashControlVersion(prev);
            updateSettings({ fiscal: { hashControlVersion: next } });
            await initializeLocalDatabase();
            await transactionLocalService.appendFiscalAuditEvent({
                event_type: 'KEY_ROTATED',
                payload_json: JSON.stringify({
                    previousHashControl: prev,
                    nextHashControl: next,
                }),
                employee_id: employee.id,
            });
            setPendingChanges(false);
            setKeyRotationMessage(t('settings.messages.keyRotationSuccess', { prev, next }));
        } catch (e) {
            console.error(e);
            setKeyRotationMessage(
                e instanceof Error ? e.message : t('settings.messages.keyRotationFail')
            );
        } finally {
            setKeyRotationBusy(false);
        }
    };

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

    const handleSave = async () => {
        setSaveStatus('saving');
        // Simulate save operation
        await new Promise(resolve => setTimeout(resolve, 500));
        setSaveStatus('saved');
        setPendingChanges(false);

        setTimeout(() => {
            setSaveStatus('idle');
        }, 2000);
    };

    const handleReset = () => {
        if (confirm(t('settings.confirm.resetAll'))) {
            resetToDefaults();
            setPendingChanges(false);
            setSaveStatus('idle');
        }
    };

    const handleStoreFiscalPemInElectron = async () => {
        setFiscalElectronMsg(null);
        const api = typeof window !== 'undefined' ? window.electronAPI?.fiscal : undefined;
        if (!api) {
            setFiscalElectronMsg(t('settings.messages.electronOnly'));
            return;
        }
        const pem = settings.fiscal.privateKeyPem?.trim();
        if (!pem) {
            setFiscalElectronMsg(t('settings.messages.pastePemFirst'));
            return;
        }
        const r = await api.storePrivateKeyPem(pem);
        if (r.success) {
            setFiscalElectronMsg(t('settings.messages.pemStored'));
        } else {
            setFiscalElectronMsg(r.error || t('settings.messages.pemStoreFail'));
        }
    };

    const handleExportSaft = async () => {
        setSaftBusy(true);
        setSaftMessage(null);
        try {
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
                                            <input
                                                type="number"
                                                min="0"
                                                max="1"
                                                step="0.01"
                                                value={settings.pos.taxRate}
                                                onChange={(e) => handleSettingsChange('pos', 'taxRate', parseFloat(e.target.value))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                            />
                                            <p className="text-sm text-gray-500 mt-1">{t('settings.pos.taxRateSuffix', { percent: (settings.pos.taxRate * 100).toFixed(1) })}</p>
                                        </div>
                                    </div>
                                </div>

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
                                </div>

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
                                        {isSystemAdministrator(employee) ? (
                                            <>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.certificationNumber')}</label>
                                            <input
                                                type="text"
                                                value={settings.company.certificationNumber || ''}
                                                onChange={(e) => handleSettingsChange('company', 'certificationNumber', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.softwareCertNumber')}</label>
                                            <input
                                                type="text"
                                                value={settings.company.softwareCertNumber || ''}
                                                onChange={(e) => handleSettingsChange('company', 'softwareCertNumber', e.target.value)}
                                                placeholder={t('settings.company.softwareCertPlaceholder')}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">{t('settings.company.softwareCertHelp')}</p>
                                        </div>
                                            </>
                                        ) : (
                                            <p className="text-sm text-gray-600 bg-white border border-slate-200 rounded-xl px-4 py-3">
                                                {t('settings.systemAdminOnlyCert')}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="p-6 bg-blue-50 rounded-xl border border-blue-200">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('settings.company.receiptNumbering')}</h3>
                                    <p className="text-sm text-gray-600 mb-4">{t('settings.company.seriesPerDocTypeIntro')}</p>
                                        <div className="space-y-6">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.counterLabel')}</label>
                                                <input
                                                    type="text"
                                                    value={settings.receipt.counterLabel}
                                                    onChange={(e) => handleSettingsChange('receipt', 'counterLabel', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                />
                                            </div>
                                        <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 min-h-touch">
                                            <div>
                                                <h4 className="font-medium text-gray-800">{t('settings.company.printDuplicateTitle')}</h4>
                                                <p className="text-sm text-gray-600">{t('settings.company.printDuplicateDesc')}</p>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={settings.receipt.printDuplicateOnIssue !== false}
                                                    onChange={(e) => handleSettingsChange('receipt', 'printDuplicateOnIssue', e.target.checked)}
                                                />
                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                            </label>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.configureSeriesDocType')}</label>
                                            <select
                                                value={seriesEditorKey}
                                                onChange={(e) => {
                                                    const v = e.target.value as FiscalSeriesDocKey;
                                                    setSeriesEditorKey(v);
                                                    if (v === 'FS') {
                                                        handleSettingsChange('receipt', 'defaultDocumentType', 'FATURA_SIMPLIFICADA');
                                                    } else if (v === 'FT') {
                                                        handleSettingsChange('receipt', 'defaultDocumentType', 'FATURA');
                                                    }
                                                }}
                                                className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                                            >
                                                <option value="FS">{t('settings.company.seriesHeading.FS')}</option>
                                                <option value="FT">{t('settings.company.seriesHeading.FT')}</option>
                                                <option value="NC">{t('settings.company.seriesHeading.NC')}</option>
                                            </select>
                                            {seriesEditorKey === 'NC' ? (
                                                <p className="text-sm text-gray-600 mt-2">{t('settings.company.ncSeriesEditorHint')}</p>
                                            ) : (
                                                <p className="text-sm text-gray-600 mt-2">
                                                    {t('settings.company.defaultCheckoutDoc')}{' '}
                                                    <strong>
                                                        {settings.receipt.defaultDocumentType === 'FATURA'
                                                            ? t('settings.company.docTypeInvoice')
                                                            : t('settings.company.docTypeSimplified')}
                                                    </strong>
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
                                                    {docKey === 'NC' && (
                                                        <p className="text-sm text-gray-600">{t('settings.company.ncSeriesNote')}</p>
                                                    )}
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
                                                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.company.seriesPrefix')}</label>
                                                            <input
                                                                type="text"
                                                                value={prof.seriesPrefix}
                                                                onChange={(e) => handleReceiptProfileChange(docKey, 'seriesPrefix', e.target.value)}
                                                                className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                                                            />
                                                            <p className="text-xs text-amber-700 mt-1">{t('settings.company.seriesPrefixHelp')}</p>
                                                        </div>
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
                                                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-gray-200 min-h-touch">
                                                        <div>
                                                            <h4 className="font-medium text-gray-800">{t('settings.company.seriesDiscontinuedTitle')}</h4>
                                                            <p className="text-sm text-gray-600">{t('settings.company.seriesDiscontinuedDesc')}</p>
                                                        </div>
                                                        <label className="relative inline-flex items-center cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                className="sr-only peer"
                                                                checked={Boolean(prof.seriesDiscontinued)}
                                                                onChange={(e) =>
                                                                    handleReceiptProfileChange(docKey, 'seriesDiscontinued', e.target.checked)
                                                                }
                                                            />
                                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                                        </label>
                                                    </div>
                                                    <div className="p-4 bg-blue-50/50 rounded-lg border border-blue-100">
                                                        <h4 className="font-medium text-gray-800 mb-2">{t('settings.company.seriesStatus')}</h4>
                                                        <p className="text-sm text-gray-600">
                                                            {t('settings.company.lastSeriesKey')}{' '}
                                                            <strong>{prof.lastSeriesKey || '—'}</strong>
                                                        </p>
                                                        <p className="text-sm text-gray-600">
                                                            {t('settings.company.currentNumber')}{' '}
                                                            <strong>{prof.currentNumber}</strong>
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
                                    {isSystemAdministrator(employee) ? (
                                        <div className="p-4 bg-white rounded-lg border border-gray-200 space-y-3 mb-6">
                                            <div className="flex items-start gap-3">
                                                <Key className="w-6 h-6 text-emerald-700 shrink-0 mt-1" aria-hidden />
                                                <div>
                                                    <h4 className="font-medium text-gray-800">{t('settings.fiscalAT.hashTitle')}</h4>
                                                    <p className="text-sm text-gray-600 mt-1">
                                                        {t('settings.fiscalAT.hashDesc')}
                                                    </p>
                                                    <p className="text-lg font-semibold text-gray-900 mt-2">
                                                        {t('settings.fiscalAT.hashCurrent')}{' '}
                                                        <span className="font-mono">
                                                            {settings.fiscal.hashControlVersion?.trim() || '1'}
                                                        </span>
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => void handleRegisterKeyRotation()}
                                                disabled={keyRotationBusy}
                                                className="inline-flex items-center justify-center gap-2 min-h-touch px-6 rounded-2xl font-semibold text-xl text-white bg-orange-500 hover:bg-orange-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {keyRotationBusy
                                                    ? t('settings.fiscalAT.keyRotationBusy')
                                                    : t('settings.fiscalAT.keyRotationButton')}
                                            </button>
                                            {keyRotationMessage && (
                                                <p className="text-sm text-gray-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                                                    {keyRotationMessage}
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-600 bg-white border border-emerald-200 rounded-xl px-4 py-3 mb-6">
                                            {t('settings.fiscalAT.sysAdminOnlySection')}
                                        </p>
                                    )}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4 md:col-span-2">
                                            {import.meta.env.DEV && isSystemAdministrator(employee) && (
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.fiscalAT.hashDevLabel')}</label>
                                                    <input
                                                        type="text"
                                                        value={settings.fiscal.hashControlVersion}
                                                        onChange={(e) => handleSettingsChange('fiscal', 'hashControlVersion', e.target.value)}
                                                        className="w-full min-h-touch px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-xl"
                                                    />
                                                </div>
                                            )}
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
                                        {isSystemAdministrator(employee) && (
                                            <div className="md:col-span-2">
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    {t('settings.fiscalAT.pemLabel')}
                                                </label>
                                                <textarea
                                                    value={settings.fiscal.privateKeyPem || ''}
                                                    onChange={(e) => handleSettingsChange('fiscal', 'privateKeyPem', e.target.value)}
                                                    placeholder={t('settings.fiscalAT.pemPlaceholder')}
                                                    rows={6}
                                                    className="w-full font-mono text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                                />
                                                {typeof window !== 'undefined' && window.electronAPI?.fiscal && (
                                                    <button
                                                        type="button"
                                                        onClick={handleStoreFiscalPemInElectron}
                                                        className="mt-3 w-full md:w-auto min-h-touch px-6 rounded-2xl font-semibold text-xl text-white bg-green-500 hover:bg-green-600 transition-colors duration-200"
                                                    >
                                                        {t('settings.fiscalAT.electronStoreButton')}
                                                    </button>
                                                )}
                                                {fiscalElectronMsg && (
                                                    <p className="mt-2 text-sm text-gray-700">{fiscalElectronMsg}</p>
                                                )}
                                            </div>
                                        )}
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