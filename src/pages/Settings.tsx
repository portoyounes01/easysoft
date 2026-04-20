import React, { useState } from 'react';
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
import { useTranslation } from 'react-i18next';
import { transactionLocalService } from '../lib/localDatabase';
import { buildSaftAuditFileXml } from '../fiscal/saft/exportSaft';
import { generateUUID } from '../utils/uuid';
// import PrinterSetup from '../components/PrinterSetup';

const Settings: React.FC = () => {
    const { settings, updateSettings, resetToDefaults, isLoading } = useSettings();
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('security');
    const [pendingChanges, setPendingChanges] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [saftStart, setSaftStart] = useState(() => new Date().toISOString().slice(0, 10));
    const [saftEnd, setSaftEnd] = useState(() => new Date().toISOString().slice(0, 10));
    const [saftBusy, setSaftBusy] = useState(false);
    const [saftMessage, setSaftMessage] = useState<string | null>(null);
    const [fiscalElectronMsg, setFiscalElectronMsg] = useState<string | null>(null);
    // const [showPrinterSetup, setShowPrinterSetup] = useState(false);
    // const [printerStatus, setPrinterStatus] = useState<any>(null);

    const tabs = [
        {
            id: 'security',
            label: 'Security & Auto-Logout',
            icon: Shield,
            description: 'Session timeout and security settings'
        },
        {
            id: 'pos',
            label: 'POS Configuration',
            icon: DollarSign,
            description: 'Currency, tax rates, and checkout settings'
        },
        {
            id: 'display',
            label: 'Display & Interface',
            icon: Monitor,
            description: 'UI preferences and display options'
        },
        {
            id: 'hardware',
            label: 'Hardware & Printers',
            icon: Printer,
            description: 'Thermal printer and cash drawer setup'
        },
        {
            id: 'company',
            label: 'Company & Fiscal',
            icon: SettingsIcon,
            description: 'Company details and receipt numbering'
        },
    ];

    const handleSettingsChange = (category: string, field: string, value: any) => {
        updateSettings({ [category]: { [field]: value } } as any);
        setPendingChanges(true);
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
        if (confirm('Are you sure you want to reset all settings to defaults? This action cannot be undone.')) {
            resetToDefaults();
            setPendingChanges(false);
            setSaveStatus('idle');
        }
    };

    const handleStoreFiscalPemInElectron = async () => {
        setFiscalElectronMsg(null);
        const api = typeof window !== 'undefined' ? window.electronAPI?.fiscal : undefined;
        if (!api) {
            setFiscalElectronMsg('Disponível apenas na aplicação Electron.');
            return;
        }
        const pem = settings.fiscal.privateKeyPem?.trim();
        if (!pem) {
            setFiscalElectronMsg('Cole a chave PEM antes de guardar.');
            return;
        }
        const r = await api.storePrivateKeyPem(pem);
        if (r.success) {
            setFiscalElectronMsg(
                'Chave guardada no armazenamento seguro do sistema. Pode limpar o campo local se já não precisar dele no browser.'
            );
        } else {
            setFiscalElectronMsg(r.error || 'Falha ao guardar.');
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
            await transactionLocalService.markFiscalDocumentsSaftExported(
                fiscalDocs.map(d => d.id),
                batchId,
                new Date().toISOString()
            );
            setSaftMessage(`Exportadas ${fiscalDocs.length} faturas (intervalo local).`);
        } catch (e) {
            setSaftMessage(e instanceof Error ? e.message : 'Falha na exportação SAF-T.');
        } finally {
            setSaftBusy(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading settings...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
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
                        onClick={handleReset}
                        className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold transition-all flex items-center space-x-2"
                    >
                        <RotateCcw className="w-4 h-4" />
                        <span>{t('settings.header.resetToDefaults')}</span>
                    </button>

                    <button
                        onClick={handleSave}
                        disabled={!pendingChanges || saveStatus === 'saving'}
                        className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white px-6 py-2 rounded-lg font-semibold transition-all flex items-center space-x-2"
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
                <div className="w-80 space-y-2">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`w-full text-left p-4 rounded-xl transition-all duration-200 ${activeTab === tab.id
                                    ? 'bg-blue-50 border-2 border-blue-200 text-blue-800'
                                    : 'bg-white hover:bg-gray-50 border-2 border-gray-200 text-gray-700'
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
                <div className="flex-1 bg-white rounded-xl shadow-lg p-8">
                    {/* Security & Auto-Logout Tab */}
                    {activeTab === 'security' && (
                        <div className="space-y-6">
                            <div className="flex items-center space-x-3 mb-6">
                                <Shield className="w-6 h-6 text-blue-600" />
                                <h2 className="text-2xl font-bold text-gray-800">Security & Auto-Logout</h2>
                            </div>

                            {/* Auto-Logout Enable/Disable */}
                            <div className="p-6 bg-blue-50 rounded-xl border border-blue-200">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-800">Auto-Logout Protection</h3>
                                        <p className="text-sm text-gray-600">Automatically log out inactive users for security</p>
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
                                                    Timeout Duration (minutes)
                                                </label>
                                                <select
                                                    value={settings.autoLogout.timeoutMinutes}
                                                    onChange={(e) => handleSettingsChange('autoLogout', 'timeoutMinutes', parseInt(e.target.value))}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                >
                                                    <option value={1}>1 minute</option>
                                                    <option value={5}>5 minutes</option>
                                                    <option value={10}>10 minutes</option>
                                                    <option value={15}>15 minutes</option>
                                                    <option value={20}>20 minutes</option>
                                                    <option value={30}>30 minutes</option>
                                                    <option value={45}>45 minutes</option>
                                                    <option value={60}>1 hour</option>
                                                    <option value={120}>2 hours</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    <Bell className="w-4 h-4 inline mr-2" />
                                                    Warning Time (seconds)
                                                </label>
                                                <select
                                                    value={settings.autoLogout.warningSeconds}
                                                    onChange={(e) => handleSettingsChange('autoLogout', 'warningSeconds', parseInt(e.target.value))}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                >
                                                    <option value={10}>10 seconds</option>
                                                    <option value={15}>15 seconds</option>
                                                    <option value={30}>30 seconds</option>
                                                    <option value={45}>45 seconds</option>
                                                    <option value={60}>1 minute</option>
                                                    <option value={90}>90 seconds</option>
                                                    <option value={120}>2 minutes</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* Cart Protection */}
                                        <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
                                            <div>
                                                <h4 className="font-medium text-gray-800">Protect Active Sales</h4>
                                                <p className="text-sm text-gray-600">Prevent logout when cart contains items</p>
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
                                            <h4 className="font-medium text-gray-800 mb-2">Current Configuration</h4>
                                            <div className="text-sm text-gray-600 space-y-1">
                                                <p>• Users will be logged out after <strong>{settings.autoLogout.timeoutMinutes} minutes</strong> of inactivity</p>
                                                <p>• Warning will appear <strong>{settings.autoLogout.warningSeconds} seconds</strong> before logout</p>
                                                <p>• {settings.autoLogout.protectWhenCartHasItems ? 'Active sales are protected' : 'No protection for active sales'}</p>
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
                                <h2 className="text-2xl font-bold text-gray-800">POS Configuration</h2>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="p-6 bg-green-50 rounded-xl border border-green-200">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Currency Settings</h3>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Currency Symbol</label>
                                            <select
                                                value={settings.pos.currencySymbol}
                                                onChange={(e) => handleSettingsChange('pos', 'currencySymbol', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                            >
                                                <option value="€">€ Euro</option>
                                                <option value="$">$ Dollar</option>
                                                <option value="£">£ Pound</option>
                                                <option value="¥">¥ Yen</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Default Tax Rate</label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="1"
                                                step="0.01"
                                                value={settings.pos.taxRate}
                                                onChange={(e) => handleSettingsChange('pos', 'taxRate', parseFloat(e.target.value))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                            />
                                            <p className="text-sm text-gray-500 mt-1">{(settings.pos.taxRate * 100).toFixed(1)}% tax rate</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 bg-orange-50 rounded-xl border border-orange-200">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Inventory Settings</h3>

                                    <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
                                        <div>
                                            <h4 className="font-medium text-gray-800">Allow Negative Stock</h4>
                                            <p className="text-sm text-gray-600">Permit sales even when stock is low</p>
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
                                            <h3 className="text-lg font-semibold text-gray-800">Auto-Clear Cart</h3>
                                            <p className="text-sm text-gray-600">Automatically clear cart after period of inactivity</p>
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
                                                    Clear Cart After (minutes)
                                                </label>
                                                <select
                                                    value={settings.pos.autoClearCart.timeoutMinutes}
                                                    onChange={(e) => handleSettingsChange('pos', 'autoClearCart', {
                                                        ...settings.pos.autoClearCart,
                                                        timeoutMinutes: parseInt(e.target.value)
                                                    })}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                                                >
                                                    <option value={0}>Never</option>
                                                    <option value={1}>1 minute</option>
                                                    <option value={2}>2 minutes</option>
                                                    <option value={5}>5 minutes</option>
                                                    <option value={10}>10 minutes</option>
                                                    <option value={15}>15 minutes</option>
                                                    <option value={30}>30 minutes</option>
                                                    <option value={60}>1 hour</option>
                                                </select>
                                            </div>

                                            {/* Preview */}
                                            <div className="p-4 bg-white rounded-lg border border-gray-200">
                                                <h4 className="font-medium text-gray-800 mb-2">Current Configuration</h4>
                                                <div className="text-sm text-gray-600">
                                                    {settings.pos.autoClearCart.timeoutMinutes === 0 ? (
                                                        <p>• Cart will <strong>never</strong> be automatically cleared</p>
                                                    ) : (
                                                        <p>• Cart will be cleared after <strong>{settings.pos.autoClearCart.timeoutMinutes} minutes</strong> of inactivity</p>
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
                                <h2 className="text-2xl font-bold text-gray-800">Display & Interface</h2>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="p-6 bg-purple-50 rounded-xl border border-purple-200">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Display Preferences</h3>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Items Per Page</label>
                                            <select
                                                value={settings.display.itemsPerPage}
                                                onChange={(e) => handleSettingsChange('display', 'itemsPerPage', parseInt(e.target.value))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                            >
                                                <option value={10}>10 items</option>
                                                <option value={20}>20 items</option>
                                                <option value={50}>50 items</option>
                                                <option value={100}>100 items</option>
                                            </select>
                                        </div>

                                        <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
                                            <div>
                                                <h4 className="font-medium text-gray-800">Compact Mode</h4>
                                                <p className="text-sm text-gray-600">Reduce spacing for smaller screens</p>
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
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Employee Interface</h3>

                                    <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
                                        <div>
                                            <h4 className="font-medium text-gray-800">Show Employee Photos</h4>
                                            <p className="text-sm text-gray-600">Display profile pictures in employee lists</p>
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
                                <h2 className="text-2xl font-bold text-gray-800">Company & Fiscal</h2>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="p-6 bg-slate-50 rounded-xl border border-slate-200">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Company Information</h3>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Company Name</label>
                                            <input
                                                type="text"
                                                value={settings.company.name}
                                                onChange={(e) => handleSettingsChange('company', 'name', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                                            <input
                                                type="text"
                                                value={settings.company.address}
                                                onChange={(e) => handleSettingsChange('company', 'address', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="md:col-span-1">
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Postal Code</label>
                                                <input
                                                    type="text"
                                                    value={settings.company.postalCode}
                                                    onChange={(e) => handleSettingsChange('company', 'postalCode', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                                                />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                                                <input
                                                    type="text"
                                                    value={settings.company.city}
                                                    onChange={(e) => handleSettingsChange('company', 'city', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Tax Number (NIF)</label>
                                            <input
                                                type="text"
                                                value={settings.company.taxNumber}
                                                onChange={(e) => handleSettingsChange('company', 'taxNumber', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                                                <input
                                                    type="text"
                                                    value={settings.company.phone || ''}
                                                    onChange={(e) => handleSettingsChange('company', 'phone', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                                                <input
                                                    type="email"
                                                    value={settings.company.email || ''}
                                                    onChange={(e) => handleSettingsChange('company', 'email', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Slogan (optional)</label>
                                            <input
                                                type="text"
                                                value={settings.company.slogan || ''}
                                                onChange={(e) => handleSettingsChange('company', 'slogan', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Software Info (optional)</label>
                                            <input
                                                type="text"
                                                value={settings.company.softwareInfo || ''}
                                                onChange={(e) => handleSettingsChange('company', 'softwareInfo', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Certification Number (optional)</label>
                                            <input
                                                type="text"
                                                value={settings.company.certificationNumber || ''}
                                                onChange={(e) => handleSettingsChange('company', 'certificationNumber', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Software Certification Number (AT)</label>
                                            <input
                                                type="text"
                                                value={settings.company.softwareCertNumber || ''}
                                                onChange={(e) => handleSettingsChange('company', 'softwareCertNumber', e.target.value)}
                                                placeholder="PTR-A-001"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">Official AT certification number for software</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 bg-blue-50 rounded-xl border border-blue-200">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Receipt Numbering</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Series Name (for AT Registration)</label>
                                            <input
                                                type="text"
                                                value={settings.receipt.series}
                                                onChange={(e) => handleSettingsChange('receipt', 'series', e.target.value)}
                                                placeholder="FAT2026"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">Series identifier to register with AT portal</p>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Series Prefix</label>
                                                <input
                                                    type="text"
                                                    value={settings.receipt.seriesPrefix}
                                                    onChange={(e) => handleSettingsChange('receipt', 'seriesPrefix', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Numeric Width</label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    value={settings.receipt.numericWidth}
                                                    onChange={(e) => handleSettingsChange('receipt', 'numericWidth', parseInt(e.target.value))}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Reset Policy</label>
                                                <select
                                                    value={settings.receipt.resetPolicy}
                                                    onChange={(e) => handleSettingsChange('receipt', 'resetPolicy', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                >
                                                    <option value="monthly">Monthly</option>
                                                    <option value="yearly">Yearly</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Default Document Type</label>
                                                <select
                                                    value={settings.receipt.defaultDocumentType}
                                                    onChange={(e) => handleSettingsChange('receipt', 'defaultDocumentType', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                >
                                                    <option value="FATURA_SIMPLIFICADA">Fatura Simplificada</option>
                                                    <option value="FATURA">Fatura</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Counter Label</label>
                                                <input
                                                    type="text"
                                                    value={settings.receipt.counterLabel}
                                                    onChange={(e) => handleSettingsChange('receipt', 'counterLabel', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">AT Validation Code (ATCUD)</label>
                                                <input
                                                    type="text"
                                                    value={settings.receipt.atValidationCode}
                                                    onChange={(e) => handleSettingsChange('receipt', 'atValidationCode', e.target.value)}
                                                    placeholder="AT56789X1"
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                />
                                                <p className="text-xs text-gray-500 mt-1">Code from AT portal after series registration</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 min-h-[60px]">
                                            <div>
                                                <h4 className="font-medium text-gray-800">Série descontinuada</h4>
                                                <p className="text-sm text-gray-600">Impede novas emissões nesta série (AT).</p>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={Boolean(settings.receipt.seriesDiscontinued)}
                                                    onChange={(e) => handleSettingsChange('receipt', 'seriesDiscontinued', e.target.checked)}
                                                />
                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                            </label>
                                        </div>

                                        {/* Current Series Preview */}
                                        <div className="p-4 bg-white rounded-lg border border-gray-200">
                                            <h4 className="font-medium text-gray-800 mb-2">Current Series Status</h4>
                                            <p className="text-sm text-gray-600">Last series key: <strong>{settings.receipt.lastSeriesKey || '—'}</strong></p>
                                            <p className="text-sm text-gray-600">Current number: <strong>{settings.receipt.currentNumber}</strong></p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 bg-emerald-50 rounded-xl border border-emerald-200 md:col-span-2">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Fiscal AT (certificação)</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">HashControl (versão)</label>
                                                <input
                                                    type="text"
                                                    value={settings.fiscal.hashControlVersion}
                                                    onChange={(e) => handleSettingsChange('fiscal', 'hashControlVersion', e.target.value)}
                                                    className="w-full min-h-[60px] px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-xl"
                                                />
                                            </div>
                                            <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 min-h-[60px]">
                                                <div>
                                                    <h4 className="font-medium text-gray-800">Modo de formação</h4>
                                                    <p className="text-sm text-gray-600">Documentos sem valor fiscal (AT).</p>
                                                </div>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={settings.fiscal.trainingMode}
                                                        onChange={(e) => handleSettingsChange('fiscal', 'trainingMode', e.target.checked)}
                                                    />
                                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                                                </label>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Chave privada RSA (PEM PKCS#8 ou PKCS#1) — apenas ambiente controlado
                                            </label>
                                            <textarea
                                                value={settings.fiscal.privateKeyPem || ''}
                                                onChange={(e) => handleSettingsChange('fiscal', 'privateKeyPem', e.target.value)}
                                                placeholder="-----BEGIN PRIVATE KEY----- ou -----BEGIN RSA PRIVATE KEY-----"
                                                rows={6}
                                                className="w-full font-mono text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                            />
                                            {typeof window !== 'undefined' && window.electronAPI?.fiscal && (
                                                <button
                                                    type="button"
                                                    onClick={handleStoreFiscalPemInElectron}
                                                    className="mt-3 w-full md:w-auto min-h-[60px] px-6 rounded-2xl font-semibold text-xl text-white bg-green-500 hover:bg-green-600 transition-colors duration-200"
                                                >
                                                    Guardar chave no armazenamento seguro (Electron)
                                                </button>
                                            )}
                                            {fiscalElectronMsg && (
                                                <p className="mt-2 text-sm text-gray-700">{fiscalElectronMsg}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-8 pt-6 border-t border-emerald-200">
                                        <h4 className="text-md font-semibold text-gray-800 mb-3">Exportar SAF-T (PT) 1.04_01</h4>
                                        <p className="text-sm text-gray-600 mb-4">
                                            Gera ficheiro XML a partir de documentos fiscais guardados localmente (intervalo de datas).
                                        </p>
                                        <div className="flex flex-col md:flex-row gap-4 md:items-end">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">De</label>
                                                <input
                                                    type="date"
                                                    value={saftStart}
                                                    onChange={(e) => setSaftStart(e.target.value)}
                                                    className="w-full min-h-[60px] px-3 py-2 border border-gray-300 rounded-lg text-xl"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Até</label>
                                                <input
                                                    type="date"
                                                    value={saftEnd}
                                                    onChange={(e) => setSaftEnd(e.target.value)}
                                                    className="w-full min-h-[60px] px-3 py-2 border border-gray-300 rounded-lg text-xl"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleExportSaft}
                                                disabled={saftBusy}
                                                className="inline-flex items-center justify-center gap-2 min-h-[80px] px-6 rounded-2xl font-semibold text-xl text-white bg-green-500 hover:bg-green-600 transition-colors duration-200 disabled:opacity-50"
                                            >
                                                <FileDown className="w-6 h-6" />
                                                {saftBusy ? 'A exportar…' : 'Descarregar SAF-T'}
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
    );
};

export default Settings; 