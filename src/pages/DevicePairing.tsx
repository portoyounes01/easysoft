import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QrCode, Building2, MapPin, MonitorSmartphone, Camera, HelpCircle } from 'lucide-react';
import { PairingButton } from '../components/ui/PairingButton';

interface DevicePairingProps { }

const DevicePairing: React.FC<DevicePairingProps> = () => {
    const { t } = useTranslation();
    // 1. Hooks
    const [organizationCode, setOrganizationCode] = useState('');
    const [locationCode, setLocationCode] = useState('');
    const [deviceName, setDeviceName] = useState(() => t('devicePairing.placeholderDeviceName'));

    // 2. Event handlers
    const handlePair = () => {
        // Mock only: no behavior
    };

    const handleScanQr = () => {
        // Mock only: no behavior
    };

    // 3. Computed values
    // 4. Effects
    // 5. Render
    return (
        <div className="min-h-screen bg-gray-50 py-10">
            <div className="max-w-4xl mx-auto px-6">
                <div className="text-center mb-10">
                    <h1 className="text-6xl font-bold text-gray-900 mb-3">{t('devicePairing.pairTitle')}</h1>
                    <p className="text-gray-600 text-lg">{t('devicePairing.pairSubtitle')}</p>
                </div>

                <div className="bg-white rounded-3xl shadow-2xl p-8 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xl font-semibold text-gray-800">
                                <Building2 className="w-6 h-6 text-blue-600" /> {t('devicePairing.organizationCode')}
                            </label>
                            <input
                                type="text"
                                value={organizationCode}
                                onChange={(e) => setOrganizationCode(e.target.value)}
                                className="w-full min-h-touch text-xl border border-gray-300 rounded-2xl px-4 focus:outline-none focus:ring-4 focus:ring-blue-200"
                                placeholder={t('devicePairing.placeholderOrg')}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xl font-semibold text-gray-800">
                                <MapPin className="w-6 h-6 text-purple-600" /> {t('devicePairing.locationCode')}
                            </label>
                            <input
                                type="text"
                                value={locationCode}
                                onChange={(e) => setLocationCode(e.target.value)}
                                className="w-full min-h-touch text-xl border border-gray-300 rounded-2xl px-4 focus:outline-none focus:ring-4 focus:ring-purple-200"
                                placeholder={t('devicePairing.placeholderLocation')}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xl font-semibold text-gray-800">
                            <MonitorSmartphone className="w-6 h-6 text-emerald-600" /> {t('devicePairing.deviceName')}
                        </label>
                        <input
                            type="text"
                            value={deviceName}
                            onChange={(e) => setDeviceName(e.target.value)}
                            className="w-full min-h-touch text-xl border border-gray-300 rounded-2xl px-4 focus:outline-none focus:ring-4 focus:ring-emerald-200"
                            placeholder={t('devicePairing.placeholderDeviceName')}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <PairingButton
                            variant="primary"
                            label={t('devicePairing.pairMock')}
                            onClick={handlePair}
                            disabled
                        />

                        <PairingButton
                            variant="secondary"
                            label={t('devicePairing.scanQrMock')}
                            icon={Camera}
                            onClick={handleScanQr}
                            disabled
                        />
                    </div>

                    <div className="flex items-start gap-3 bg-blue-50 rounded-2xl p-4">
                        <QrCode className="w-6 h-6 text-blue-600 mt-1" />
                        <div>
                            <p className="text-gray-800 text-lg font-semibold">{t('devicePairing.howItWorks')}</p>
                            <ul className="list-disc list-inside text-gray-600 text-base mt-1 space-y-1">
                                <li>{t('devicePairing.step1')}</li>
                                <li>{t('devicePairing.step2')}</li>
                                <li>{t('devicePairing.step3')}</li>
                            </ul>
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-gray-600">
                            <HelpCircle className="w-5 h-5" />
                            <span className="text-base">{t('devicePairing.needHelp')}</span>
                        </div>
                        <div className="text-sm text-gray-500">{t('devicePairing.uiOnly')}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DevicePairing;


