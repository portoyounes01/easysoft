import React, { useState } from 'react';
import { QrCode, Building2, MapPin, MonitorSmartphone, Camera, HelpCircle } from 'lucide-react';

interface DevicePairingProps { }

const DevicePairing: React.FC<DevicePairingProps> = () => {
    // 1. Hooks
    const [organizationCode, setOrganizationCode] = useState('');
    const [locationCode, setLocationCode] = useState('');
    const [deviceName, setDeviceName] = useState('This Terminal');

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
                    <h1 className="text-6xl font-bold text-gray-900 mb-3">Pair this terminal</h1>
                    <p className="text-gray-600 text-lg">Bind this device to a restaurant (and optionally a location). This is a mock interface.</p>
                </div>

                <div className="bg-white rounded-3xl shadow-2xl p-8 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xl font-semibold text-gray-800">
                                <Building2 className="w-6 h-6 text-blue-600" /> Organization Code
                            </label>
                            <input
                                type="text"
                                value={organizationCode}
                                onChange={(e) => setOrganizationCode(e.target.value)}
                                className="w-full min-h-[60px] text-xl border border-gray-300 rounded-2xl px-4 focus:outline-none focus:ring-4 focus:ring-blue-200"
                                placeholder="e.g. ACME-PORTO"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xl font-semibold text-gray-800">
                                <MapPin className="w-6 h-6 text-purple-600" /> Location Code (optional)
                            </label>
                            <input
                                type="text"
                                value={locationCode}
                                onChange={(e) => setLocationCode(e.target.value)}
                                className="w-full min-h-[60px] text-xl border border-gray-300 rounded-2xl px-4 focus:outline-none focus:ring-4 focus:ring-purple-200"
                                placeholder="e.g. FRONT-COUNTER"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xl font-semibold text-gray-800">
                            <MonitorSmartphone className="w-6 h-6 text-emerald-600" /> Device Name
                        </label>
                        <input
                            type="text"
                            value={deviceName}
                            onChange={(e) => setDeviceName(e.target.value)}
                            className="w-full min-h-[60px] text-xl border border-gray-300 rounded-2xl px-4 focus:outline-none focus:ring-4 focus:ring-emerald-200"
                            placeholder="This Terminal"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <button
                            onClick={handlePair}
                            disabled
                            className="min-h-[80px] text-2xl font-medium text-white rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 transition-transform duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            Pair Device (mock)
                        </button>

                        <button
                            onClick={handleScanQr}
                            disabled
                            className="min-h-[80px] text-2xl font-medium rounded-2xl bg-white border border-gray-300 hover:bg-gray-50 transition-colors duration-150 flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <Camera className="w-7 h-7 text-gray-700" /> Scan QR (mock)
                        </button>
                    </div>

                    <div className="flex items-start gap-3 bg-blue-50 rounded-2xl p-4">
                        <QrCode className="w-6 h-6 text-blue-600 mt-1" />
                        <div>
                            <p className="text-gray-800 text-lg font-semibold">How it works (mock)</p>
                            <ul className="list-disc list-inside text-gray-600 text-base mt-1 space-y-1">
                                <li>Enter your organization code (and location if used), then pair.</li>
                                <li>Or scan a short-lived pairing QR generated by an admin.</li>
                                <li>After pairing, the employee PIN login shows only your restaurant’s staff.</li>
                            </ul>
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-gray-600">
                            <HelpCircle className="w-5 h-5" />
                            <span className="text-base">Need help? Contact your administrator.</span>
                        </div>
                        <div className="text-sm text-gray-500">UI only • No backend yet</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DevicePairing;


