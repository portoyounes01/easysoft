import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer, Wifi, Search, Settings } from 'lucide-react';
import PrinterSetup from '../components/PrinterSetup';
import PrinterManager from '../components/PrinterManager';
import PrinterWorkflowManager from '../components/PrinterWorkflowManager';

const PrinterTestPage: React.FC = () => {
  const { t } = useTranslation();
  const [showPrinterSetup, setShowPrinterSetup] = useState(false);
  const [printerInfo, setPrinterInfo] = useState<any>(null);
  const [hardwareStatus, setHardwareStatus] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'setup' | 'workflow'>('setup');

  const handlePrinterConnected = (info: any) => {
    setPrinterInfo(info);
    setShowPrinterSetup(false);
    checkHardwareStatus();
  };

  const checkHardwareStatus = async () => {
    try {
      const status = await window.electronAPI?.hardware.getHardwareStatus();
      setHardwareStatus(status);
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
    } catch (error) {
      alert(t('printerTest.alertTestCommFail'));
    }
  };

  React.useEffect(() => {
    checkHardwareStatus();
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center space-x-3 mb-6">
            <Printer className="h-8 w-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">{t('printerTest.title')}</h1>
          </div>

          {/* Tab Navigation */}
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('setup')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'setup'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Printer className="h-4 w-4" />
              {t('printerTest.tabSetup')}
            </button>
            <button
              onClick={() => setActiveTab('workflow')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'workflow'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Settings className="h-4 w-4" />
              {t('printerTest.tabWorkflow')}
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'setup' && (
          <>
            {/* Printer Manager Section */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <PrinterManager />
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex items-center space-x-3 mb-6">
                <Printer className="h-6 w-6 text-blue-600" />
                <h2 className="text-xl font-bold text-gray-900">{t('printerTest.testingTitle')}</h2>
              </div>

              {/* Current Status */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="text-lg font-semibold mb-3">{t('printerTest.hardwareStatus')}</h3>
                {hardwareStatus ? (
                  <div className="space-y-2">
                    <p><strong>{t('printerTest.initialized')}</strong> {hardwareStatus.status?.initialized ? `✅ ${t('common.yes')}` : `❌ ${t('common.no')}`}</p>
                    <p><strong>{t('printerTest.discoveryMode')}</strong> {hardwareStatus.status?.discoveryMode || t('common.unknown')}</p>
                    <p><strong>{t('printerTest.printerConnected')}</strong> {hardwareStatus.status?.printer?.connected ? `✅ ${t('common.yes')}` : `❌ ${t('common.no')}`}</p>
                    <p><strong>{t('printerTest.printerType')}</strong> {hardwareStatus.status?.printer?.type || t('common.unknown')}</p>
                    <p><strong>{t('printerTest.printerName')}</strong> {hardwareStatus.status?.printer?.name || t('common.unknown')}</p>
                    {hardwareStatus.status?.network && (
                      <div className="mt-2 p-2 bg-blue-50 rounded">
                        <p><strong>{t('printerTest.networkDetails')}</strong></p>
                        <p>{t('printerTest.ipPort', { ip: hardwareStatus.status.network.ip, port: hardwareStatus.status.network.port })}</p>
                        {hardwareStatus.status.network.brand && (
                          <p>{t('printerTest.brandLine', { brand: hardwareStatus.status.network.brand })}</p>
                        )}
                        <p>{t('printerTest.confidenceLine', { confidence: hardwareStatus.status.network.confidence })}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500">{t('printerTest.loadingStatus')}</p>
                )}
              </div>

              {/* Connection Info */}
              {printerInfo && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <h3 className="text-lg font-semibold text-green-800 mb-2">{t('printerTest.recentlyConnected')}</h3>
                  <p className="text-green-700">{printerInfo.message}</p>
                  {printerInfo.details && (
                    <div className="mt-2 text-sm text-green-600">
                      {/* Network printer details */}
                      {printerInfo.details.ip && printerInfo.details.port && (
                        <p>{t('printerTest.ipPort', { ip: printerInfo.details.ip, port: printerInfo.details.port })}</p>
                      )}
                      {/* USB printer details */}
                      {printerInfo.details.serial && (
                        <p>{t('printerTest.serialLine', { serial: printerInfo.details.serial })}</p>
                      )}
                      {printerInfo.details.uri && (
                        <p>{t('printerTest.uriLine', { uri: printerInfo.details.uri })}</p>
                      )}
                      {/* Common details */}
                      {printerInfo.details.brand && <p>{t('printerTest.brandLine', { brand: printerInfo.details.brand })}</p>}
                      {printerInfo.details.model && <p>{t('printerTest.modelLine', { model: printerInfo.details.model })}</p>}
                      {printerInfo.details.isThermal !== undefined && (
                        <p>{t('printerTest.thermalType', {
                          type: printerInfo.details.isThermal ? t('printerTest.thermalPrinter') : t('printerTest.standardPrinter'),
                        })}</p>
                      )}
                      {printerInfo.details.confidence && <p>{t('printerTest.confidenceLine', { confidence: printerInfo.details.confidence })}</p>}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-4">
                <button
                  onClick={() => setShowPrinterSetup(true)}
                  className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Search className="h-5 w-5" />
                  <span>{t('printerTest.setupThermal')}</span>
                </button>

                <button
                  onClick={checkHardwareStatus}
                  className="flex items-center space-x-2 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <Wifi className="h-5 w-5" />
                  <span>{t('printerTest.refreshStatus')}</span>
                </button>

                <button
                  onClick={testPrint}
                  disabled={!hardwareStatus?.status?.printer?.connected}
                  className="flex items-center space-x-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Printer className="h-5 w-5" />
                  <span>{t('printerTest.testPrint')}</span>
                </button>
              </div>

              {/* Instructions */}
              <div className="mt-8 p-4 bg-blue-50 rounded-lg">
                <h3 className="font-semibold text-blue-800 mb-2">{t('printerTest.instructionsTitle')}</h3>
                <ol className="list-decimal list-inside space-y-1 text-blue-700 text-sm">
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
          <div className="bg-white rounded-lg shadow-lg p-6">
            <PrinterWorkflowManager />
          </div>
        )}
      </div>

      {/* Printer Setup Modal */}
      {showPrinterSetup && (
        <PrinterSetup
          onPrinterConnected={handlePrinterConnected}
          onClose={() => setShowPrinterSetup(false)}
        />
      )}
    </div>
  );
};

export default PrinterTestPage;
