import React, { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import QuickNumpad from './QuickNumpad';
import { ActionButton } from './ui/ActionButton';
import { BaseDialog } from './ui/BaseDialog';
import { TabToggle, TabToggleOption } from './ui/TabToggle';
import { InputField } from './ui/InputField';

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

    // 5. Render
    return (
        <BaseDialog
            open={open}
            onClose={onClose}
            title={t('pos.discountDialog.title')}
            width="29vw"
            height="70vh"
            footer={
                <div className="flex space-x-4">
                    <ActionButton
                        onClick={onClose}
                        label={t('common.cancel')}
                        variant="secondary"
                        className="flex-1"
                        style={{ height: '5vh', fontSize: '1.6vh' }}
                    />
                    <ActionButton
                        disabled={!canApply}
                        onClick={handleApply}
                        label={(activeTab === 'percentage' || activeTab === 'fixed') ? t('pos.discountDialog.buttons.add') : t('pos.discountDialog.buttons.apply')}
                        className={`flex-1 rounded-2xl ${canApply ? '' : 'bg-gray-300 cursor-not-allowed'}`}
                        style={{ height: '5vh', fontSize: '1.6vh' }}
                    />
                </div>
            }
        >
            <div className="flex-1 flex flex-col bg-gray-100" style={{ padding: '2vh', paddingLeft: '4vh', paddingRight: '4vh', paddingTop: '3vh' }}>
                {/* Tabs */}
                <div className="mb-5">
                    <TabToggle
                        options={[
                            { value: 'preset', label: t('pos.discountDialog.tabs.preset') },
                            { value: 'percentage', label: t('pos.discountDialog.tabs.percentage') },
                            { value: 'fixed', label: t('pos.discountDialog.tabs.fixed') }
                        ] as TabToggleOption<DiscountTab>[]}
                        value={activeTab}
                        onChange={handleSetTab}
                    />
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
                                    <InputField
                                        label={t('pos.discountDialog.labels.discountCode') || 'Discount Code'}
                                        value={newCode}
                                        onChange={(e) => setNewCode(e.target.value.slice(0, 32))}
                                        placeholder=""
                                        maxLength={32}
                                    />
                                </div>
                            )}
                            {(activeTab === 'percentage' || activeTab === 'fixed') && (
                                <div className="flex-1 flex flex-col min-h-0">
                                    <InputField
                                        label={activeTab === 'fixed' ? t('pos.discountDialog.labels.price') || 'Price' : t('pos.discountDialog.labels.percentage') || 'Percentage'}
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value.replace(/[^0-9.,]/g, ''))}
                                        className={inputValue && !isNumericValid ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'focus:ring-green-500 focus:border-green-500'}
                                        placeholder={activeTab === 'fixed' ? '5.00' : '15'}
                                    // We can't easily put the suffix inside InputField without modifying it to accept a string node for rightIcon or a suffix prop.
                                    // For now, let's use a workaround or just accept it doesn't have the suffix inside the input in the same way, OR add suffix support to InputField.
                                    // Adding suffix support to InputField is better.
                                    />
                                    {/* Suffix workaround or update InputField */}
                                    <div className="absolute top-[34px] right-4 text-gray-500 font-semibold pointer-events-none" style={{ fontSize: '1.6vh' }}>{activeTab === 'fixed' ? '€' : '%'}</div>

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
            </div>
        </BaseDialog>
    );
};

export default React.memo(DiscountDialog);


