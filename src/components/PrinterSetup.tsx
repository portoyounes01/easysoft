import React, { useState, useEffect } from 'react';
import { Wifi, Printer, Search, CheckCircle, AlertCircle, Loader, Usb, RefreshCw } from 'lucide-react';

interface NetworkPrinter {
  ip: string;
  port: number;
  confidence: number;
  isThermal: boolean;
  brand?: string;
  identification?: string;
  recommended: boolean;
}

interface USBPrinter {
  type: 'usb';
  brand: string;
  model: string;
  serial: string;
  uri: string;
  isThermal: boolean;
  recommended: boolean;
}

interface PrinterSetupProps {
  onPrinterConnected: (printerInfo: any) => void;
  onClose: () => void;
}

const PrinterSetup: React.FC<PrinterSetupProps> = ({ onPrinterConnected, onClose }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredPrinters, setDiscoveredPrinters] = useState<NetworkPrinter[]>([]);
  const [usbPrinters, setUsbPrinters] = useState<USBPrinter[]>([]);
  const [currentStatus, setCurrentStatus] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [manualIP, setManualIP] = useState('');
  const [manualPort, setManualPort] = useState('9100');
  const [activeTab, setActiveTab] = useState<'auto' | 'usb' | 'manual' | 'system'>('auto');
  const [systemPrinters, setSystemPrinters] = useState<any[]>([]);
  const [systemLoading, setSystemLoading] = useState(false);

  const scanForPrinters = async () => {
    setIsScanning(true);
    setCurrentStatus('Scanning network for thermal printers...');
    setDiscoveredPrinters([]);

    try {
      // Call the Electron main process to discover printers
      const result = await window.electronAPI?.discoverThermalPrinters();
      
      if (result?.success) {
        setDiscoveredPrinters(result.printers || []);
        setCurrentStatus(`Found ${result.printers?.length || 0} thermal printer(s)`);
      } else {
        setCurrentStatus(`Scan failed: ${result?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Printer discovery failed:', error);
      setCurrentStatus('Scan failed: Unable to communicate with hardware controller');
    } finally {
      setIsScanning(false);
    }
  };

  const scanForUSBPrinters = async () => {
    setIsScanning(true);
    setCurrentStatus('Scanning for USB printers...');
    setUsbPrinters([]);

    try {
      // Call the Electron main process to discover USB printers
      const result = await window.electronAPI?.discoverUSBPrinters();
      
      if (result?.success) {
        setUsbPrinters(result.printers || []);
        setCurrentStatus(`Found ${result.printers?.length || 0} USB printer(s)`);
      } else {
        setCurrentStatus(`Scan failed: ${result?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('USB printer discovery failed:', error);
      setCurrentStatus('Scan failed: Unable to communicate with hardware controller');
    } finally {
      setIsScanning(false);
    }
  };

  const listSystemPrinters = async () => {
    setSystemLoading(true);
    setCurrentStatus('Listing system printers...');
    try {
      const result = await window.electronAPI?.hardware.listPrinters();
      if (result?.success) {
        setSystemPrinters(result.printers || []);
        setCurrentStatus(`Found ${result.printers?.length || 0} system printer(s)`);
      } else {
        setSystemPrinters([]);
        setCurrentStatus(`Listing failed: ${result?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('System printers listing failed:', error);
      setSystemPrinters([]);
      setCurrentStatus('Listing failed: Unable to communicate with hardware controller');
    } finally {
      setSystemLoading(false);
    }
  };

  const connectToUSBPrinter = async (printer: USBPrinter) => {
    setIsConnecting(true);
    setCurrentStatus(`Connecting to USB printer ${printer.brand} ${printer.model}...`);

    try {
      const result = await window.electronAPI?.connectToUSBPrinter(
        printer.uri,
        `${printer.brand}_${printer.model}_USB`
      );

      if (result?.success) {
        setCurrentStatus('USB printer connected successfully!');
        onPrinterConnected(result);
        setTimeout(() => onClose(), 2000);
      } else {
        setCurrentStatus(`Connection failed: ${result?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('USB printer connection failed:', error);
      setCurrentStatus('Connection failed: Unable to communicate with hardware controller');
    } finally {
      setIsConnecting(false);
    }
  };

  const connectToPrinter = async (printer: NetworkPrinter) => {
    setIsConnecting(true);
    setCurrentStatus(`Connecting to ${printer.ip}:${printer.port}...`);

    try {
      const result = await window.electronAPI?.connectToNetworkPrinter(
        printer.ip,
        printer.port,
        printer.brand ? `${printer.brand}_Thermal` : undefined
      );

      if (result?.success) {
        setCurrentStatus('Connection successful!');
        onPrinterConnected(result);
        setTimeout(() => onClose(), 2000);
      } else {
        setCurrentStatus(`Connection failed: ${result?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Printer connection failed:', error);
      setCurrentStatus('Connection failed: Unable to communicate with hardware controller');
    } finally {
      setIsConnecting(false);
    }
  };

  const connectToManualPrinter = async () => {
    if (!manualIP.trim()) {
      setCurrentStatus('Please enter an IP address');
      return;
    }

    setIsConnecting(true);
    setCurrentStatus(`Connecting to ${manualIP}:${manualPort}...`);

    try {
      const result = await window.electronAPI?.connectToNetworkPrinter(
        manualIP.trim(),
        parseInt(manualPort),
        'ThermalPrinter_Manual'
      );

      if (result?.success) {
        setCurrentStatus('Connection successful!');
        onPrinterConnected(result);
        setTimeout(() => onClose(), 2000);
      } else {
        setCurrentStatus(`Connection failed: ${result?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Manual printer connection failed:', error);
      setCurrentStatus('Connection failed: Unable to communicate with hardware controller');
    } finally {
      setIsConnecting(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-600';
    if (confidence >= 60) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 80) return '🔥';
    if (confidence >= 60) return '⭐';
    return '📄';
  };

  useEffect(() => {
    // Clear results when switching tabs
    if (activeTab === 'auto') {
      setDiscoveredPrinters([]);
      setCurrentStatus('');
    } else if (activeTab === 'usb') {
      setUsbPrinters([]);
      setCurrentStatus('');
    } else if (activeTab === 'manual') {
      setCurrentStatus('');
    } else if (activeTab === 'system') {
      setSystemPrinters([]);
      setCurrentStatus('');
      // Immediately list printers when opening the System tab
      listSystemPrinters();
    }
  }, [activeTab]);

  // Instant hardware monitoring updates inside the setup modal
  useEffect(() => {
    const removeHardwareListener = window.electronAPI?.onHardwareChange?.((changeData: {
      type: 'usb' | 'network';
      action: 'connected' | 'disconnected' | 'changed';
      device?: any;
      timestamp: string;
      isLikelyPrinter?: boolean;
      isDelayedVerification?: boolean;
    }) => {
      console.log('🔌 Hardware change detected in PrinterSetup:', changeData);
      
      // If the USB tab is active and a USB change occurred, rescan USB list quickly
      if (activeTab === 'usb' && (changeData?.type === 'usb' || changeData?.isLikelyPrinter)) {
        // Light debounce to avoid double triggers
        setTimeout(() => {
          scanForUSBPrinters();
        }, 150);
      }
      // If the System tab is active, refresh system printers list
      if (activeTab === 'system') {
        setTimeout(() => {
          listSystemPrinters();
        }, 150);
      }
    });

    return () => {
      if (removeHardwareListener) removeHardwareListener();
    };
  }, [activeTab]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <Printer className="h-6 w-6 text-blue-600" />
              <h2 className="text-xl font-semibold">Thermal Printer Setup</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl font-bold"
            >
              ×
            </button>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 mb-6 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('auto')}
              className={`flex-1 py-2 px-4 rounded-md transition-colors ${
                activeTab === 'auto'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <div className="flex items-center justify-center space-x-2">
                <Search className="h-4 w-4" />
                <span>Network</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('usb')}
              className={`flex-1 py-2 px-4 rounded-md transition-colors ${
                activeTab === 'usb'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <div className="flex items-center justify-center space-x-2">
                <Usb className="h-4 w-4" />
                <span>USB</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`flex-1 py-2 px-4 rounded-md transition-colors ${
                activeTab === 'manual'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <div className="flex items-center justify-center space-x-2">
                <Wifi className="h-4 w-4" />
                <span>Manual</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('system')}
              className={`flex-1 py-2 px-4 rounded-md transition-colors ${
                activeTab === 'system'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <div className="flex items-center justify-center space-x-2">
                <Printer className="h-4 w-4" />
                <span>System</span>
              </div>
            </button>
          </div>

          {activeTab === 'auto' && (
            <div>
              {/* Auto Discovery Tab */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-gray-600">
                  Automatically discover thermal printers on your network
                </p>
                <button
                  onClick={scanForPrinters}
                  disabled={isScanning || isConnecting}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isScanning ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  <span>{isScanning ? 'Scanning...' : 'Scan Network'}</span>
                </button>
              </div>

              {/* Status */}
              {currentStatus && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700">{currentStatus}</p>
                </div>
              )}

              {/* Discovered Printers */}
              {discoveredPrinters.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-medium text-gray-900">Discovered Printers:</h3>
                  {discoveredPrinters.map((printer) => (
                    <div
                      key={`${printer.ip}:${printer.port}`}
                      className={`p-4 border rounded-lg ${
                        printer.recommended
                          ? 'border-green-300 bg-green-50'
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-lg">{getConfidenceIcon(printer.confidence)}</span>
                            <span className="font-medium">{printer.ip}:{printer.port}</span>
                            {printer.recommended && (
                              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                                Recommended
                              </span>
                            )}
                          </div>
                          <div className="mt-1 space-y-1">
                            <p className={`text-sm ${getConfidenceColor(printer.confidence)}`}>
                              Confidence: {printer.confidence}% 
                              {printer.isThermal ? ' (Thermal)' : ' (Unknown)'}
                            </p>
                            {printer.brand && (
                              <p className="text-sm text-gray-600">Brand: {printer.brand}</p>
                            )}
                            {printer.identification && (
                              <p className="text-sm text-gray-50">ID: {printer.identification}</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => connectToPrinter(printer)}
                          disabled={isConnecting}
                          className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isConnecting ? (
                            <Loader className="h-4 w-4 animate-spin" />
                          ) : (
                            'Connect'
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'usb' && (
            <div>
              {/* USB Detection Tab */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-gray-600">
                  Detect thermal printers connected via USB
                </p>
                <button
                  onClick={scanForUSBPrinters}
                  disabled={isScanning || isConnecting}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isScanning ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <Usb className="h-4 w-4" />
                  )}
                  <span>{isScanning ? 'Scanning...' : 'Scan USB'}</span>
                </button>
              </div>

              {/* Status */}
              {currentStatus && activeTab === 'usb' && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700">{currentStatus}</p>
                </div>
              )}

              {/* USB Printers */}
              {usbPrinters.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-medium text-gray-900">USB Printers:</h3>
                  {usbPrinters.map((printer) => (
                    <div
                      key={printer.serial}
                      className={`p-4 border rounded-lg ${
                        printer.recommended
                          ? 'border-green-300 bg-green-50'
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-lg">🔌</span>
                            <span className="font-medium">{printer.brand} {printer.model}</span>
                            {printer.recommended && (
                              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                                Recommended
                              </span>
                            )}
                          </div>
                          <div className="mt-1 space-y-1">
                            <p className="text-sm text-green-600">
                              {printer.isThermal ? 'Thermal Printer ✅' : 'Standard Printer'}
                            </p>
                            <p className="text-sm text-gray-600">Serial: {printer.serial}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => connectToUSBPrinter(printer)}
                          disabled={isConnecting}
                          className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isConnecting ? (
                            <Loader className="h-4 w-4 animate-spin" />
                          ) : (
                            'Connect'
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'manual' && (
            <div>
              {/* Manual Setup Tab */}
              <div className="space-y-4">
                <p className="text-gray-600">
                  Connect to a thermal printer using its IP address
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      IP Address *
                    </label>
                    <input
                      type="text"
                      value={manualIP}
                      onChange={(e) => setManualIP(e.target.value)}
                      placeholder="e.g., 192.168.1.113"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Port
                    </label>
                    <input
                      type="number"
                      value={manualPort}
                      onChange={(e) => setManualPort(e.target.value)}
                      placeholder="9100"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-50">
                      Most thermal printers use port 9100
                    </p>
                  </div>

                  <button
                    onClick={connectToManualPrinter}
                    disabled={isConnecting || !manualIP.trim()}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isConnecting ? (
                      <Loader className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    <span>{isConnecting ? 'Connecting...' : 'Connect to Printer'}</span>
                  </button>
                </div>

                {/* Status for manual setup */}
                {currentStatus && activeTab === 'manual' && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-700">{currentStatus}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'system' && (
            <div>
              {/* System Printers Tab */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-gray-600">
                  Printers available to your OS (CUPS/Windows). Select a printer to use or verify connectivity.
                </p>
                <button
                  onClick={listSystemPrinters}
                  disabled={systemLoading}
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {systemLoading ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  <span>{systemLoading ? 'Refreshing...' : 'Refresh'}</span>
                </button>
              </div>

              {/* Status */}
              {currentStatus && activeTab === 'system' && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700">{currentStatus}</p>
                </div>
              )}

              {systemPrinters.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="font-medium text-gray-900">System Printers:</h3>
                  {systemPrinters.map((p: any) => (
                    <div key={p.name} className={`p-4 border rounded-lg ${p.connected ? 'border-gray-200 bg-white' : 'border-orange-200 bg-orange-50'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-lg">🖨️</span>
                            <span className="font-medium">{p.name}</span>
                            {p.connected ? (
                              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Connected</span>
                            ) : (
                              <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">Offline</span>
                            )}
                          </div>
                          <div className="mt-1 space-y-1 text-sm text-gray-600">
                            <p>Device: <span className="font-mono">{p.device}</span></p>
                            <p>Type: {p.type?.toUpperCase?.() || 'UNKNOWN'}</p>
                            {p.hasQueuedJobs && (
                              <p className="text-orange-700">Queued jobs: {p.queueCount}</p>
                            )}
                            {p.isStale && (
                              <p className="text-red-600">Marked as stale/ghost</p>
                            )}
                          </div>
                        </div>
                        <div className="ml-4">
                          <button
                            onClick={() => onPrinterConnected({ success: true, message: `Selected system printer: ${p.name}`, printerName: p.name })}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          >
                            Use This
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                !systemLoading && (
                  <div className="p-4 border border-dashed rounded-lg text-gray-50 text-sm">No system printers found.</div>
                )
              )}
            </div>
          )}

          {/* Help Text */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Tips:</p>
                <ul className="space-y-1 text-xs">
                  <li>• <strong>Network:</strong> Make sure your thermal printer is powered on and connected to the network</li>
                  <li>• <strong>USB:</strong> Connect your thermal printer via USB cable before scanning</li>
                  <li>• <strong>Network:</strong> Your computer and printer should be on the same WiFi network</li>
                  <li>• <strong>Manual:</strong> Check the printer's display for its IP address if manual setup is needed</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrinterSetup;
