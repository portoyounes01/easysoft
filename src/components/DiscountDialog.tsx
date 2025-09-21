import React, { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import QuickNumpad from './QuickNumpad';

interface CouponPreset {
    id: string;
    name: string;
    type: 'percentage' | 'fixed';
    value: number;
    code?: string;
    description?: string;
}

interface DiscountDialogResult {
    type: 'percentage' | 'fixed';
    value: number;
    source: 'preset' | 'percentage' | 'fixed' | 'new';
    code?: string;
}

interface DiscountDialogProps {
    open: boolean;
    onClose: () => void;
    onApply: (result: DiscountDialogResult) => void;
    presets?: CouponPreset[];
}

type DiscountTab = 'new' | 'preset' | 'percentage' | 'fixed';

const DiscountDialog: React.FC<DiscountDialogProps> = ({ open, onClose, onApply, presets = [] }) => {
    // 1. Hooks
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<DiscountTab>('preset');
    const [selectedPresetId, setSelectedPresetId] = useState<string>('');
    const [inputValue, setInputValue] = useState<string>('');
    const [newCode, setNewCode] = useState<string>('');

    // 2. Event handlers
    const handleSetTab = useCallback((tab: DiscountTab) => {
        setActiveTab(tab);
        setInputValue('');
        setSelectedPresetId('');
        setNewCode('');
    }, []);

    const handleApply = useCallback(() => {
        if (activeTab === 'new') {
            onApply({ type: 'percentage', value: 0, source: 'new', code: newCode || undefined });
            onClose();
            return;
        }
        if (activeTab === 'preset') {
            const preset = presets.find(p => p.id === selectedPresetId);
            if (!preset) return;
            onApply({ type: preset.type, value: preset.value, source: 'preset', code: preset.code });
            onClose();
            return;
        }

        const numeric = parseFloat(inputValue.replace(',', '.'));
        if (isNaN(numeric) || numeric <= 0) return;

        const type: 'percentage' | 'fixed' = activeTab === 'fixed' ? 'fixed' : 'percentage';
        const source: DiscountDialogResult['source'] = activeTab as 'percentage' | 'fixed';
        onApply({ type, value: numeric, source, code: newCode || undefined });
        onClose();
    }, [activeTab, inputValue, newCode, onApply, onClose, presets, selectedPresetId]);

    // 3. Computed values
    const parsedNumber = useMemo(() => parseFloat(inputValue.replace(',', '.')), [inputValue]);
    const isNumericValid = useMemo(() => {
        if (activeTab === 'percentage') {
            return !isNaN(parsedNumber) && parsedNumber > 0 && parsedNumber <= 100;
        }
        return !isNaN(parsedNumber) && parsedNumber > 0;
    }, [parsedNumber, activeTab]);
    const canApply = useMemo(() => {
        if (activeTab === 'preset') return Boolean(selectedPresetId);
        if (activeTab === 'new') return newCode.trim().length > 0;
        return isNumericValid;
    }, [activeTab, selectedPresetId, newCode, isNumericValid]);

    if (!open) return null;

    // 5. Render
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl w-[29vw] h-[70vh] shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="bg-gray-200 border-b rounded-t-xl" style={{ padding: '1.2vh 2vh' }}>
                    <div className="flex items-center justify-between">
                        <span className="opacity-0">✕</span>
                        <h3 className="font-bold text-gray-800 text-center" style={{ fontSize: '2vh' }}>{t('pos.discountDialog.title')}</h3>
                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                            style={{ padding: '0.6vh' }}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Full-width divider */}
                <div
                    className="border-t border-gray-300"
                    style={{ marginLeft: '-4vh', marginRight: '-4vh' }}
                />


                {/* Body */}
                <div className="flex-1 flex flex-col bg-gray-100" style={{ padding: '2vh', paddingLeft: '4vh', paddingRight: '4vh', paddingTop: '3vh' }}>
                    {/* Tabs */}
                    <div className="bg-gray-200 rounded-[10px] flex w-full border shadow-sm relative mb-6">
                        <div className="flex w-full relative">
                            {(['preset', 'percentage', 'fixed'] as DiscountTab[]).map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => handleSetTab(tab)}
                                    className={`flex-1 rounded-[10px] font-semibold transition-all relative ${activeTab === tab ? 'bg-white text-gray-900' : 'text-gray-600'}`}
                                    style={{ padding: '1.25vh', fontSize: '1.5vh' }}
                                >
                                    {/* {tab === 'new' && t('pos.discountDialog.tabs.new')} */}
                                    {tab === 'preset' && t('pos.discountDialog.tabs.preset')}
                                    {tab === 'percentage' && t('pos.discountDialog.tabs.percentage')}
                                    {tab === 'fixed' && t('pos.discountDialog.tabs.fixed')}
                                    {activeTab === tab && (
                                        <span
                                            className="absolute left-1/2 -translate-x-1/2 bottom-0 h-[0.4vh] bg-gradient-to-r from-green-500 to-green-600 rounded-full"
                                            style={{ width: '25%' }}
                                        />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-visible">
                        {activeTab === 'preset' ? (
                            <div className="h-full overflow-y-auto">
                                {presets.length === 0 ? (
                                    <div className="h-full flex items-center justify-center text-gray-500" style={{ fontSize: '1.5vh' }}>{t('pos.discountDialog.noPresets')}</div>
                                ) : (
                                    <ul className="divide-y divide-gray-200">
                                        {presets.map((p) => (
                                            <li key={p.id}>
                                                <button
                                                    onClick={() => setSelectedPresetId(p.id)}
                                                    className={`w-full text-left rounded-xs transition-all ${selectedPresetId === p.id ? 'bg-green-100' : 'hover:bg-gray-50'}`}
                                                    style={{ padding: '1.2vh 2vh' }}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-gray-900 font-semibold" style={{ fontSize: '1.6vh' }}>{p.name}</span>
                                                        <span className="text-red-500 font-semibold" style={{ fontSize: '1.6vh' }}>{p.type === 'percentage' ? `-${p.value}%` : `- ${p.value.toFixed(2)}`}</span>
                                                    </div>
                                                    {p.description && <div className="text-gray-600 mt-1" style={{ fontSize: '1.4vh' }}>{p.description}</div>}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col">
                                {activeTab === 'new' && (
                                    <div className="mb-4">
                                        <label className="block font-semibold text-gray-700 mb-2" style={{ fontSize: '1.4vh' }}>{t('pos.discountDialog.labels.discountCode')}</label>
                                        <input
                                            type="text"
                                            value={newCode}
                                            onChange={(e) => setNewCode(e.target.value.slice(0, 32))}
                                            className="w-full bg-white border border-gray-300 rounded-[10px] focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-all"
                                            style={{ padding: '1.2vh 2vh', fontSize: '1.6vh' }}
                                            placeholder=""
                                            maxLength={32}
                                        />
                                    </div>
                                )}
                                {(activeTab === 'percentage' || activeTab === 'fixed') && (
                                    <div className="flex-1 flex flex-col min-h-0">
                                        <label className="block font-semibold text-gray-700 mb-2" style={{ fontSize: '1.4vh' }}>
                                            {activeTab === 'fixed' ? t('pos.discountDialog.labels.price') : t('pos.discountDialog.labels.percentage')}
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={inputValue}
                                                onChange={(e) => setInputValue(e.target.value.replace(/[^0-9.,]/g, ''))}
                                                className={`w-full bg-white border rounded-[10px] focus:outline-none focus:ring-1 transition-all ${inputValue && !isNumericValid ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-green-500 focus:border-green-500'}`}
                                                style={{ padding: '1.2vh 2vh', paddingLeft: '4.5vh', fontSize: '1.8vh' }}
                                                placeholder={activeTab === 'fixed' ? '5.00' : '15'}
                                            />
                                            <div className="absolute top-1/2 -translate-y-1/2 text-gray-500 font-semibold" style={{ left: '2vh', fontSize: '1.6vh' }}>{activeTab === 'fixed' ? '€' : '%'}</div>
                                        </div>

                                        {/* Quick Numpad */}
                                        <div className="mt-4 flex-1 min-h-0" style={{ marginBottom: '2vh' }}>
                                            <QuickNumpad
                                                value={inputValue}
                                                onChange={(v) => setInputValue(v)}
                                                allowDecimal={activeTab === 'fixed'}
                                                quickValues={[100, 50, 20, 10]}
                                                className="h-full"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Full-width divider */}
                    <div className="border-t border-gray-300" style={{ marginLeft: '-6vh', marginRight: '-6vh' }} />

                    {/* Footer */}
                    <div className="flex space-x-4" style={{ padding: '1.2vh 2vh' }}>
                        <button
                            onClick={onClose}
                            className="flex-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-2xl transition-colors"
                            style={{ height: '6.5vh', fontSize: '1.6vh' }}
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            disabled={!canApply}
                            onClick={handleApply}
                            className={`flex-1 text-white font-bold rounded-2xl transition-colors ${canApply ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700' : 'bg-gray-300 cursor-not-allowed'}`}
                            style={{ height: '6.5vh', fontSize: '1.6vh' }}
                        >
                            {(activeTab === 'percentage' || activeTab === 'fixed') ? t('pos.discountDialog.buttons.add') : t('pos.discountDialog.buttons.apply')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default React.memo(DiscountDialog);


