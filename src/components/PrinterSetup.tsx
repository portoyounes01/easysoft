import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Wifi, Printer, Search, CheckCircle, AlertCircle, Loader, Usb, RefreshCw } from 'lucide-react';
import { useDesignSystem2Customization } from '../contexts/DesignSystem2CustomizationContext';
import { TabToggle } from './ui/TabToggle';
import type { UsbPrintDevice } from '../types/electron';
import '../styles/design-system-2-scope.css';

export interface PrinterConnectedDetails {
    ip?: string;
    port?: number;
    serial?: string;
    uri?: string;
    brand?: string;
    model?: string;
    isThermal?: boolean;
    confidence?: string;
}

export interface PrinterConnectedPayload {
    success?: boolean;
    message?: string;
    printerName?: string;
    details?: PrinterConnectedDetails;
}

const DS2_PRIMARY_BTN =
    'rounded-2xl min-h-touch-sm inline-flex items-center justify-center gap-2 px-4 font-medium text-neutral-50 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';
const DS2_SECONDARY_BTN =
    'rounded-xl min-h-touch-sm inline-flex items-center justify-center gap-2 px-4 font-semibold text-gray-900 bg-gray-100 hover:bg-gray-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';

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
  /** Windows only: 'winusb' = direct mode possible; 'windows-driver' = print via its Windows queue (System tab). */
  driverState?: 'winusb' | 'windows-driver';
}

interface PrinterSetupProps {
    onPrinterConnected: (printerInfo: PrinterConnectedPayload) => void;
    onClose: () => void;
}

const PrinterSetup: React.FC<PrinterSetupProps> = ({ onPrinterConnected, onClose }) => {
    const { t } = useTranslation();
    const { visualStyle, prefs } = useDesignSystem2Customization();
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
  // Windows: printers as the OS sees them BEFORE any queue exists, with their
  // real driver binding. A till often has no queue named for its printer at
  // all (the reference till had two queues for other models on its port).
  const [usbPrintDevices, setUsbPrintDevices] = useState<UsbPrintDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [setupBusyPort, setSetupBusyPort] = useState<string | null>(null);

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
      // Full scan trail in the DevTools console (F12) — the main-process log is
      // invisible on a till, and "found 0" must never be unexplained.
      console.log('[usb-scan]', result);

      if (result?.success) {
        setUsbPrinters(result.printers || []);
        const diagnostics = (result as { diagnostics?: string[] }).diagnostics;
        const count = result.printers?.length || 0;
        setCurrentStatus(
          count === 0 && diagnostics?.length
            ? `Found 0 USB printer(s) — ${diagnostics.join(' · ')}`
            : `Found ${count} USB printer(s)`,
        );
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

  const listUsbPrintDevices = async () => {
    if (!window.electronAPI?.hardware?.listUsbPrintDevices) return;
    setDevicesLoading(true);
    try {
      const result = await window.electronAPI.hardware.listUsbPrintDevices();
      setUsbPrintDevices(result?.success ? result.devices ?? [] : []);
    } catch (error) {
      console.error('USB print device listing failed:', error);
      setUsbPrintDevices([]);
    } finally {
      setDevicesLoading(false);
    }
  };

  // One click: stage the in-box driver, create a queue on the printer's port,
  // adopt it as the receipt printer. No vendor driver, no version matching —
  // the RAW datatype we print with bypasses driver rendering entirely.
  const setUpDevice = async (device: UsbPrintDevice) => {
    if (!window.electronAPI?.hardware?.setupUsbPrinter || !device.port) return;
    setSetupBusyPort(device.port);
    setCurrentStatus(`Setting up ${device.model}...`);
    try {
      const queueName = device.model?.trim() || `Thermal ${device.port}`;
      const result = await window.electronAPI.hardware.setupUsbPrinter({
        port: device.port,
        queueName,
      });
      if (result?.success) {
        await listUsbPrintDevices();
        await listSystemPrinters();
        if (result.roleAssigned === false) {
          // The queue exists but nothing will print to it — do NOT claim the
          // receipt printer was set.
          setCurrentStatus(
            `${queueName} was created, but selecting it as the receipt printer failed: ${result.error ?? 'unknown error'}. Pick it from the list below.`
          );
        } else {
          setCurrentStatus(
            result.alreadyExisted
              ? `${queueName} was already set up and is now the receipt printer.`
              : `Created ${queueName} and set it as the receipt printer.`
          );
          onPrinterConnected({
            success: true,
            message: `Receipt printer set to: ${queueName}`,
            details: { model: device.model },
          });
        }
      } else {
        setCurrentStatus(
          result?.needsElevation
            ? `Windows refused: ${result.error}. Creating a printer needs administrator rights — run the app as administrator and try again.`
            : `Setup failed: ${result?.error ?? 'unknown error'}`
        );
      }
    } catch (error) {
      setCurrentStatus(`Setup failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSetupBusyPort(null);
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
        onPrinterConnected(result as PrinterConnectedPayload);
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
        onPrinterConnected(result as PrinterConnectedPayload);
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
        onPrinterConnected(result as PrinterConnectedPayload);
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
    // Keep each tab's scan results across switches — scans are slow on a till
    // and wiping them forced a rescan on every tab visit. Only the transient
    // status line resets; the System tab refreshes IN PLACE (the previous list
    // stays visible until the fresh one lands).
    setCurrentStatus('');
    if (activeTab === 'system') {
      listSystemPrinters();
      void listUsbPrintDevices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        className="ds2-visual-scope bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        style={visualStyle}
        data-ds2-neutral={prefs.neutralFamilyId}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <Printer className="h-6 w-6 text-blue-600" />
              <h2 className="text-xl font-semibold">Thermal Printer Setup</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl flex min-h-touch-sm min-w-touch-sm items-center justify-center text-2xl font-bold text-gray-700 transition-colors hover:bg-gray-100"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Tabs */}
          <div className="mb-6">
            <TabToggle
              options={[
                { value: 'auto', label: 'Network', icon: Search },
                { value: 'usb', label: 'USB', icon: Usb },
                { value: 'manual', label: 'Manual', icon: Wifi },
                { value: 'system', label: 'System', icon: Printer },
              ]}
              value={activeTab}
              onChange={setActiveTab}
            />
          </div>

          {activeTab === 'auto' && (
            <div>
              {/* Auto Discovery Tab */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-gray-600">
                  Automatically discover thermal printers on your network
                </p>
                <button
                  type="button"
                  onClick={scanForPrinters}
                  disabled={isScanning || isConnecting}
                  className={DS2_PRIMARY_BTN}
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
                              <p className="text-sm text-gray-500">ID: {printer.identification}</p>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => connectToPrinter(printer)}
                          disabled={isConnecting}
                          className={`${DS2_PRIMARY_BTN} ml-4 shrink-0`}
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
                  type="button"
                  onClick={scanForUSBPrinters}
                  disabled={isScanning || isConnecting}
                  className={DS2_PRIMARY_BTN}
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
                            {printer.driverState === 'windows-driver' && (
                              <p className="text-xs font-medium text-amber-700">
                                Managed by a Windows print driver — print through its queue: System tab → select it → Use This.
                              </p>
                            )}
                            {printer.driverState === 'winusb' && (
                              <p className="text-xs font-medium text-emerald-700">
                                Direct USB mode available.
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => connectToUSBPrinter(printer)}
                          disabled={isConnecting}
                          className={`${DS2_PRIMARY_BTN} ml-4 shrink-0`}
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
                  {t('printerSetup.manualIntro')}
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
                      {t('printerSetup.portLabel')}
                    </label>
                    <input
                      type="number"
                      value={manualPort}
                      onChange={(e) => setManualPort(e.target.value)}
                      placeholder="9100"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      {t('printerSetup.portHint')}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={connectToManualPrinter}
                    disabled={isConnecting || !manualIP.trim()}
                    className={`${DS2_PRIMARY_BTN} w-full py-3`}
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
                  type="button"
                  onClick={listSystemPrinters}
                  disabled={systemLoading}
                  className={DS2_SECONDARY_BTN}
                >
                  {systemLoading ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  <span>{systemLoading ? 'Refreshing...' : 'Refresh'}</span>
                </button>
              </div>

              {/* Detected USB printers — what Windows sees BEFORE any queue
                  exists. A till frequently has no queue named for its printer,
                  or several queues for other models sharing its port. */}
              {usbPrintDevices.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-medium text-gray-900 mb-2">Detected USB printers</h3>
                  <div className="space-y-3">
                    {usbPrintDevices.map(device => {
                      const hasOwnQueue = device.queues.some(
                        q => q.trim().toLowerCase() === device.model.trim().toLowerCase()
                      );
                      const rebound = device.service && device.service.toLowerCase() !== 'usbprint';
                      return (
                        <div key={device.instanceId} className="p-4 border border-gray-200 rounded-lg bg-white">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2">
                                <Usb className="h-4 w-4 text-gray-500" />
                                <span className="font-medium">{device.model}</span>
                                <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full font-mono">
                                  {device.port || 'no port'}
                                </span>
                              </div>
                              <div className="mt-1 space-y-1 text-sm text-gray-600">
                                <p>
                                  USB <span className="font-mono">{device.vendorId}:{device.productId}</span>
                                  {' · driver '}
                                  <span className="font-mono">{device.service || 'none'}</span>
                                </p>
                                {rebound && (
                                  <p className="text-orange-700">
                                    Bound to {device.service}, not the Windows print driver — it will not appear as a printer.
                                  </p>
                                )}
                                {device.queues.length === 0 ? (
                                  <p className="text-orange-700">No Windows queue exists for this printer yet.</p>
                                ) : (
                                  <p>
                                    Queues on this port: {device.queues.join(', ')}
                                    {!hasOwnQueue && ' — none of them is named for this printer.'}
                                  </p>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => void setUpDevice(device)}
                              disabled={setupBusyPort === device.port || !device.port}
                              className={`${DS2_PRIMARY_BTN} shrink-0 px-4 py-2`}
                            >
                              {setupBusyPort === device.port ? (
                                <Loader className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle className="h-4 w-4" />
                              )}
                              <span>{setupBusyPort === device.port ? 'Setting up...' : 'Set up for me'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Creates a queue using the driver built into Windows — no download, and it works
                    regardless of printer model, because receipts are sent as raw ESC/POS.
                  </p>
                </div>
              )}
              {devicesLoading && usbPrintDevices.length === 0 && (
                <div className="mb-4 flex items-center space-x-2 text-sm text-gray-600">
                  <Loader className="h-4 w-4 animate-spin" />
                  <span>Looking for USB printers...</span>
                </div>
              )}

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
                            type="button"
                            onClick={async () => {
                              // Windows: actually wire the selection into the print
                              // engine — the 'receipt' role makes this queue the
                              // winspool raw-print target (previously the click only
                              // updated local React state and nothing could print).
                              // macOS keeps its long-standing behavior untouched: the
                              // CUPS print target is managed by the USB-tab setup flow.
                              const isWindows = window.electronAPI?.app?.platform === 'win32';
                              if (isWindows) {
                                const roleResult = await window.electronAPI?.hardware?.setPrinterRole?.(p.name, 'receipt');
                                if (roleResult && roleResult.success === false) {
                                  setCurrentStatus(`Could not select ${p.name}: ${roleResult.error ?? 'unknown error'}`);
                                  return;
                                }
                              }
                              onPrinterConnected({
                                success: true,
                                message: isWindows
                                  ? `Receipt printer set to: ${p.name}`
                                  : `Selected system printer: ${p.name}`,
                                printerName: p.name,
                              });
                            }}
                            className={DS2_PRIMARY_BTN}
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
                  <div className="p-4 border border-dashed rounded-lg text-gray-500 text-sm">No system printers found.</div>
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
