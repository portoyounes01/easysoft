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
    Package,
    Bell,
    Eye,
    Users,
    Printer,
} from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import PrinterSetup from '../components/PrinterSetup';

const Settings: React.FC = () => {
    const { settings, updateSettings, resetToDefaults, isLoading } = useSettings();
    const [activeTab, setActiveTab] = useState('security');
    const [pendingChanges, setPendingChanges] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [showPrinterSetup, setShowPrinterSetup] = useState(false);
    const [printerStatus, setPrinterStatus] = useState<any>(null);

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
    ];

    const handleSettingsChange = (category: string, field: string, value: any) => {
        const newSettings = {
            ...settings,
            [category]: {
                ...settings[category as keyof typeof settings],
                [field]: value,
            },
        };

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
                    <h1 className="text-3xl font-bold text-gray-800">System Settings</h1>
                    <p className="text-gray-600 mt-1">Configure system-wide preferences and security settings</p>
                </div>

                <div className="flex items-center space-x-3">
                    {pendingChanges && (
                        <div className="flex items-center space-x-2 bg-yellow-50 text-yellow-700 px-4 py-2 rounded-lg">
                            <AlertTriangle className="w-4 h-4" />
                            <span className="text-sm font-medium">Unsaved changes</span>
                        </div>
                    )}

                    <button
                        onClick={handleReset}
                        className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold transition-all flex items-center space-x-2"
                    >
                        <RotateCcw className="w-4 h-4" />
                        <span>Reset to Defaults</span>
                    </button>

                    <button
                        onClick={handleSave}
                        disabled={!pendingChanges || saveStatus === 'saving'}
                        className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white px-6 py-2 rounded-lg font-semibold transition-all flex items-center space-x-2"
                    >
                        {saveStatus === 'saving' ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                <span>Saving...</span>
                            </>
                        ) : saveStatus === 'saved' ? (
                            <>
                                <CheckCircle className="w-4 h-4" />
                                <span>Saved!</span>
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                <span>Save Changes</span>
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
                </div>
            </div>
        </div>
    );
};

export default Settings; 