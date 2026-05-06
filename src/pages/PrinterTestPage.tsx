import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer, Wifi, Search, Settings } from 'lucide-react';
import PrinterSetup, { type PrinterConnectedPayload } from '../components/PrinterSetup';
import PrinterManager from '../components/PrinterManager';
import PrinterWorkflowManager from '../components/PrinterWorkflowManager';
import {
    useDesignSystem2Customization,
} from '../contexts/DesignSystem2CustomizationContext';
import '../styles/design-system-2-scope.css';

interface HardwareStatusPayload {
    status?: {
        initialized?: boolean;
        discoveryMode?: string;
        printer?: { connected?: boolean; type?: string; name?: string };
        network?: { ip?: string; port?: number; brand?: string; confidence?: string };
    };
}

const DS2_PRIMARY_ACTION =
    'ds2-control-radius-lg min-h-touch-sm inline-flex items-center justify-center gap-2 px-5 font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';
const DS2_SECONDARY_ACTION =
    'ds2-control-radius-lg min-h-touch-sm inline-flex items-center justify-center gap-2 px-5 font-semibold text-white bg-gray-600 hover:bg-gray-700 shadow-sm transition-all duration-200';

const PrinterTestPageInner: React.FC = () => {
    const { t } = useTranslation();
    const { visualStyle, prefs, layoutClasses } = useDesignSystem2Customization();
    const [showPrinterSetup, setShowPrinterSetup] = useState(false);
    const [printerInfo, setPrinterInfo] = useState<PrinterConnectedPayload | null>(null);
    const [hardwareStatus, setHardwareStatus] = useState<HardwareStatusPayload | null>(null);
    const [activeTab, setActiveTab] = useState<'setup' | 'workflow'>('setup');

    const handlePrinterConnected = (info: PrinterConnectedPayload) => {
        setPrinterInfo(info);
        setShowPrinterSetup(false);
        void checkHardwareStatus();
    };

    const checkHardwareStatus = async () => {
        try {
            const status = await window.electronAPI?.hardware.getHardwareStatus();
            setHardwareStatus((status ?? null) as HardwareStatusPayload | null);
        } catch (error) {
            console.error('Failed to get hardware status:', error);
        }
    };

    const testPrint = async () => {
        try {
            const result = await window.electronAPI?.hardware.testPrinter();
            alert(
                result?.success
                    ? t('printerTest.alertTestOk')
                    : t('printerTest.alertTestFail', { error: result?.error ?? t('common.unknown') })
            );
        } catch {
            alert(t('printerTest.alertTestCommFail'));
        }
    };

    React.useEffect(() => {
        void checkHardwareStatus();
    }, []);

    const tabBtn = (tab: 'setup' | 'workflow') =>
        `flex min-h-touch-sm flex-1 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors ds2-control-radius-md ${
            activeTab === tab ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
        }`;

    const hs = hardwareStatus;

    return (
        <div
            className="ds2-visual-scope min-h-screen bg-gray-100 p-8"
            style={visualStyle}
            data-ds2-neutral={prefs.neutralFamilyId}
        >
            <div className={`mx-auto max-w-6xl ${layoutClasses.contentInsetX}`}>
                <div className="mb-6 rounded-lg bg-white p-6 shadow-lg">
                    <div className="mb-6 flex items-center space-x-3">
                        <Printer className="h-8 w-8 text-blue-600" />
                        <h1 className="text-2xl font-bold text-gray-900">{t('printerTest.title')}</h1>
                    </div>

                    <div className="ds2-control-radius-lg flex space-x-1 bg-gray-100 p-1">
                        <button type="button" onClick={() => setActiveTab('setup')} className={tabBtn('setup')}>
                            <Printer className="h-4 w-4" />
                            {t('printerTest.tabSetup')}
                        </button>
                        <button type="button" onClick={() => setActiveTab('workflow')} className={tabBtn('workflow')}>
                            <Settings className="h-4 w-4" />
                            {t('printerTest.tabWorkflow')}
                        </button>
                    </div>
                </div>

                {activeTab === 'setup' && (
                    <>
                        <div className="mb-6">
                            <PrinterManager />
                        </div>

                        <div className="rounded-lg bg-white p-6 shadow-lg">
                            <div className="mb-6 flex items-center space-x-3">
                                <Printer className="h-6 w-6 text-blue-600" />
                                <h2 className="text-xl font-bold text-gray-900">{t('printerTest.testingTitle')}</h2>
                            </div>

                            <div className="mb-6 rounded-lg bg-gray-50 p-4">
                                <h3 className="mb-3 text-lg font-semibold">{t('printerTest.hardwareStatus')}</h3>
                                {hs ? (
                                    <div className="space-y-2">
                                        <p>
                                            <strong>{t('printerTest.initialized')}</strong>{' '}
                                            {hs.status?.initialized ? `✅ ${t('common.yes')}` : `❌ ${t('common.no')}`}
                                        </p>
                                        <p>
                                            <strong>{t('printerTest.discoveryMode')}</strong>{' '}
                                            {hs.status?.discoveryMode || t('common.unknown')}
                                        </p>
                                        <p>
                                            <strong>{t('printerTest.printerConnected')}</strong>{' '}
                                            {hs.status?.printer?.connected ? `✅ ${t('common.yes')}` : `❌ ${t('common.no')}`}
                                        </p>
                                        <p>
                                            <strong>{t('printerTest.printerType')}</strong>{' '}
                                            {hs.status?.printer?.type || t('common.unknown')}
                                        </p>
                                        <p>
                                            <strong>{t('printerTest.printerName')}</strong>{' '}
                                            {hs.status?.printer?.name || t('common.unknown')}
                                        </p>
                                        {hs.status?.network && (
                                            <div className="mt-2 rounded bg-blue-50 p-2">
                                                <p>
                                                    <strong>{t('printerTest.networkDetails')}</strong>
                                                </p>
                                                <p>
                                                    {t('printerTest.ipPort', {
                                                        ip: hs.status.network.ip,
                                                        port: hs.status.network.port,
                                                    })}
                                                </p>
                                                {hs.status.network.brand && (
                                                    <p>{t('printerTest.brandLine', { brand: hs.status.network.brand })}</p>
                                                )}
                                                <p>
                                                    {t('printerTest.confidenceLine', {
                                                        confidence: hs.status.network.confidence,
                                                    })}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-gray-500">{t('printerTest.loadingStatus')}</p>
                                )}
                            </div>

                            {printerInfo && (
                                <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
                                    <h3 className="mb-2 text-lg font-semibold text-green-800">
                                        {t('printerTest.recentlyConnected')}
                                    </h3>
                                    <p className="text-green-700">{printerInfo.message}</p>
                                    {printerInfo.details && (
                                        <div className="mt-2 text-sm text-green-600">
                                            {printerInfo.details.ip != null && printerInfo.details.port != null && (
                                                <p>
                                                    {t('printerTest.ipPort', {
                                                        ip: printerInfo.details.ip,
                                                        port: printerInfo.details.port,
                                                    })}
                                                </p>
                                            )}
                                            {printerInfo.details.serial && (
                                                <p>{t('printerTest.serialLine', { serial: printerInfo.details.serial })}</p>
                                            )}
                                            {printerInfo.details.uri && (
                                                <p>{t('printerTest.uriLine', { uri: printerInfo.details.uri })}</p>
                                            )}
                                            {printerInfo.details.brand && (
                                                <p>{t('printerTest.brandLine', { brand: printerInfo.details.brand })}</p>
                                            )}
                                            {printerInfo.details.model && (
                                                <p>{t('printerTest.modelLine', { model: printerInfo.details.model })}</p>
                                            )}
                                            {printerInfo.details.isThermal !== undefined && (
                                                <p>
                                                    {t('printerTest.thermalType', {
                                                        type: printerInfo.details.isThermal
                                                            ? t('printerTest.thermalPrinter')
                                                            : t('printerTest.standardPrinter'),
                                                    })}
                                                </p>
                                            )}
                                            {printerInfo.details.confidence && (
                                                <p>
                                                    {t('printerTest.confidenceLine', {
                                                        confidence: printerInfo.details.confidence,
                                                    })}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex flex-wrap gap-4">
                                <button type="button" onClick={() => setShowPrinterSetup(true)} className={DS2_PRIMARY_ACTION}>
                                    <Search className="h-5 w-5" />
                                    <span>{t('printerTest.setupThermal')}</span>
                                </button>

                                <button type="button" onClick={() => void checkHardwareStatus()} className={DS2_SECONDARY_ACTION}>
                                    <Wifi className="h-5 w-5" />
                                    <span>{t('printerTest.refreshStatus')}</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => void testPrint()}
                                    disabled={!hs?.status?.printer?.connected}
                                    className={DS2_PRIMARY_ACTION}
                                >
                                    <Printer className="h-5 w-5" />
                                    <span>{t('printerTest.testPrint')}</span>
                                </button>
                            </div>

                            <div className="mt-8 rounded-lg bg-blue-50 p-4">
                                <h3 className="mb-2 font-semibold text-blue-800">{t('printerTest.instructionsTitle')}</h3>
                                <ol className="list-inside list-decimal space-y-1 text-sm text-blue-700">
                                    <li>{t('printerTest.instruction1')}</li>
                                    <li>{t('printerTest.instruction2')}</li>
                                    <li>{t('printerTest.instruction3')}</li>
                                    <li>{t('printerTest.instruction4')}</li>
                                    <li>{t('printerTest.instruction5')}</li>
                                </ol>
                            </div>
                        </div>
                    </>
                )}

                {activeTab === 'workflow' && (
                    <div className="rounded-lg bg-white p-6 shadow-lg">
                        <PrinterWorkflowManager />
                    </div>
                )}
            </div>

            {showPrinterSetup && (
                <PrinterSetup
                    onPrinterConnected={handlePrinterConnected}
                    onClose={() => setShowPrinterSetup(false)}
                />
            )}
        </div>
    );
};

export default PrinterTestPageInner;
