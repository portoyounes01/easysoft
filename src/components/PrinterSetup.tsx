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
    setCurrentStatus(t('printerSetup.statusScanningNetwork'));
    setDiscoveredPrinters([]);

    try {
      // Call the Electron main process to discover printers
      const result = await window.electronAPI?.discoverThermalPrinters();

      if (result?.success) {
        setDiscoveredPrinters(result.printers || []);
        setCurrentStatus(t('printerSetup.statusFoundThermal', { n: result.printers?.length || 0 }));
      } else {
        setCurrentStatus(t('printerSetup.statusScanFailed', { error: result?.error || t('printerSetup.unknownError') }));
      }
    } catch (error) {
      console.error('Printer discovery failed:', error);
      setCurrentStatus(t('printerSetup.statusScanFailedController'));
    } finally {
      setIsScanning(false);
    }
  };

  const scanForUSBPrinters = async () => {
    setIsScanning(true);
    setCurrentStatus(t('printerSetup.statusScanningUsb'));
    setUsbPrinters([]);
    // Refresh Windows' view alongside the scan, so a scan result can never be
    // merged against a stale (or not-yet-loaded) device list.
    void listUsbPrintDevices();

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
            ? t('printerSetup.statusFoundNoUsbWithDiagnostics', { diagnostics: diagnostics.join(' · ') })
            : t('printerSetup.statusFoundUsb', { n: count }),
        );
      } else {
        setCurrentStatus(t('printerSetup.statusScanFailed', { error: result?.error || t('printerSetup.unknownError') }));
      }
    } catch (error) {
      console.error('USB printer discovery failed:', error);
      setCurrentStatus(t('printerSetup.statusScanFailedController'));
    } finally {
      setIsScanning(false);
    }
  };

  /** One row per physical USB printer. Windows' PnP view is authoritative
   *  (port, driver binding, existing queues); the libusb scan adds whether
   *  direct USB is possible. Showing both lists meant the same printer twice. */
  const usbRows = React.useMemo(() => {
    // The scan emits usbwin://vid=0x2aaf&pid=0x6004 — the 0x prefix is optional
    // here so a format change on either side does not silently unmerge the row
    // and show the same printer twice.
    const idsFromUri = (uri?: string) => {
      const m = /vid=(?:0x)?([0-9a-f]{4}).*?pid=(?:0x)?([0-9a-f]{4})/i.exec(uri ?? '');
      return m ? { vid: m[1].toUpperCase(), pid: m[2].toUpperCase() } : null;
    };
    const scanned = new Map<string, USBPrinter>();
    usbPrinters.forEach(printer => {
      const ids = idsFromUri(printer.uri);
      if (ids) scanned.set(`${ids.vid}:${ids.pid}`, printer);
    });

    const matched = new Set<string>();
    const rows = usbPrintDevices.map(device => {
      const key = `${device.vendorId}:${device.productId}`.toUpperCase();
      const legacy = scanned.get(key);
      if (legacy) matched.add(key);
      return {
        key: device.instanceId,
        label: device.model,
        ids: key,
        port: device.port,
        queues: device.queues,
        ownQueue: device.queues.find(
          q => q.trim().toLowerCase() === device.model.trim().toLowerCase()
        ),
        driverState: legacy?.driverState,
        isThermal: legacy?.isThermal,
        device,
        legacy,
      };
    });

    usbPrinters.forEach(printer => {
      const ids = idsFromUri(printer.uri);
      const key = ids ? `${ids.vid}:${ids.pid}` : '';
      if (key && matched.has(key)) return;
      // A driver-bound scan hit that did not merge is the SAME printer Windows
      // already listed, seen through libusb — it has no port, no action (it
      // cannot be opened directly) and nothing the Windows row does not say.
      // Rendering it produced a second card for one printer.
      if (printer.driverState === 'windows-driver' && usbPrintDevices.length > 0) return;
      rows.push({
        key: printer.serial || printer.uri,
        label: `${printer.brand} ${printer.model}`.trim(),
        ids: key,
        port: '',
        queues: [],
        ownQueue: undefined,
        driverState: printer.driverState,
        isThermal: printer.isThermal,
        device: undefined as unknown as UsbPrintDevice,
        legacy: printer,
      });
    });
    return rows;
  }, [usbPrintDevices, usbPrinters]);

  /** Adopt an existing queue as the receipt printer (Windows). */
  const useExistingQueue = async (queueName: string) => {
    setSetupBusyPort(queueName);
    try {
      const result = await window.electronAPI?.hardware?.setPrinterRole?.(queueName, 'receipt');
      if (result && result.success === false) {
        setCurrentStatus(t('printerSetup.statusCouldNotSelect', { name: queueName, error: result.error ?? t('printerSetup.unknownErrorLower') }));
        return;
      }
      setCurrentStatus(t('printerSetup.statusReceiptPrinterSet', { name: queueName }));
      onPrinterConnected({ success: true, message: t('printerSetup.messageReceiptPrinterSet', { name: queueName }) });
    } finally {
      setSetupBusyPort(null);
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
    setCurrentStatus(t('printerSetup.statusSettingUp', { name: device.model }));
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
            t('printerSetup.statusQueueCreatedRoleFailed', {
              queueName,
              error: result.error ?? t('printerSetup.unknownErrorLower'),
            })
          );
        } else {
          setCurrentStatus(
            result.alreadyExisted
              ? t('printerSetup.statusQueueAlreadySetUp', { queueName })
              : t('printerSetup.statusQueueCreated', { queueName })
          );
          onPrinterConnected({
            success: true,
            message: t('printerSetup.messageReceiptPrinterSet', { name: queueName }),
            details: { model: device.model },
          });
        }
      } else {
        setCurrentStatus(
          result?.needsElevation
            ? t('printerSetup.statusSetupNeedsElevation', { error: result.error })
            : t('printerSetup.statusSetupFailed', { error: result?.error ?? t('printerSetup.unknownErrorLower') })
        );
      }
    } catch (error) {
      setCurrentStatus(t('printerSetup.statusSetupFailed', { error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setSetupBusyPort(null);
    }
  };

  const listSystemPrinters = async () => {
    setSystemLoading(true);
    setCurrentStatus(t('printerSetup.statusListingSystem'));
    try {
      const result = await window.electronAPI?.hardware.listPrinters();
      if (result?.success) {
        setSystemPrinters(result.printers || []);
        setCurrentStatus(t('printerSetup.statusFoundSystem', { n: result.printers?.length || 0 }));
      } else {
        setSystemPrinters([]);
        setCurrentStatus(t('printerSetup.statusListingFailed', { error: result?.error || t('printerSetup.unknownError') }));
      }
    } catch (error) {
      console.error('System printers listing failed:', error);
      setSystemPrinters([]);
      setCurrentStatus(t('printerSetup.statusListingFailedController'));
    } finally {
      setSystemLoading(false);
    }
  };

  const connectToUSBPrinter = async (printer: USBPrinter) => {
    setIsConnecting(true);
    setCurrentStatus(t('printerSetup.statusConnectingUsb', { name: `${printer.brand} ${printer.model}` }));

    try {
      const result = await window.electronAPI?.connectToUSBPrinter(
        printer.uri,
        `${printer.brand}_${printer.model}_USB`
      );

      if (result?.success) {
        setCurrentStatus(t('printerSetup.statusUsbConnected'));
        onPrinterConnected(result as PrinterConnectedPayload);
        setTimeout(() => onClose(), 2000);
      } else {
        setCurrentStatus(t('printerSetup.statusConnectionFailed', { error: result?.error || t('printerSetup.unknownError') }));
      }
    } catch (error) {
      console.error('USB printer connection failed:', error);
      setCurrentStatus(t('printerSetup.statusConnectionFailedController'));
    } finally {
      setIsConnecting(false);
    }
  };

  const connectToPrinter = async (printer: NetworkPrinter) => {
    setIsConnecting(true);
    setCurrentStatus(t('printerSetup.statusConnectingTo', { target: `${printer.ip}:${printer.port}` }));

    try {
      const result = await window.electronAPI?.connectToNetworkPrinter(
        printer.ip,
        printer.port,
        printer.brand ? `${printer.brand}_Thermal` : undefined
      );

      if (result?.success) {
        setCurrentStatus(t('printerSetup.statusConnectionSuccessful'));
        onPrinterConnected(result as PrinterConnectedPayload);
        setTimeout(() => onClose(), 2000);
      } else {
        setCurrentStatus(t('printerSetup.statusConnectionFailed', { error: result?.error || t('printerSetup.unknownError') }));
      }
    } catch (error) {
      console.error('Printer connection failed:', error);
      setCurrentStatus(t('printerSetup.statusConnectionFailedController'));
    } finally {
      setIsConnecting(false);
    }
  };

  const connectToManualPrinter = async () => {
    if (!manualIP.trim()) {
      setCurrentStatus(t('printerSetup.statusEnterIp'));
      return;
    }

    setIsConnecting(true);
    setCurrentStatus(t('printerSetup.statusConnectingTo', { target: `${manualIP}:${manualPort}` }));

    try {
      const result = await window.electronAPI?.connectToNetworkPrinter(
        manualIP.trim(),
        parseInt(manualPort),
        'ThermalPrinter_Manual'
      );

      if (result?.success) {
        setCurrentStatus(t('printerSetup.statusConnectionSuccessful'));
        onPrinterConnected(result as PrinterConnectedPayload);
        setTimeout(() => onClose(), 2000);
      } else {
        setCurrentStatus(t('printerSetup.statusConnectionFailed', { error: result?.error || t('printerSetup.unknownError') }));
      }
    } catch (error) {
      console.error('Manual printer connection failed:', error);
      setCurrentStatus(t('printerSetup.statusConnectionFailedController'));
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
    }
    // The USB tab is where someone who just plugged a printer in looks, and
    // where the "managed by a Windows driver" dead end used to be. Load the
    // device list without waiting for a scan — it is a single fast query.
    if (activeTab === 'usb') {
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
              <h2 className="text-xl font-semibold">{t('printerSetup.title')}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl flex min-h-touch-sm min-w-touch-sm items-center justify-center text-2xl font-bold text-gray-700 transition-colors hover:bg-gray-100"
              aria-label={t('common.close')}
            >
              ×
            </button>
          </div>

          {/* Tabs */}
          <div className="mb-6">
            <TabToggle
              options={[
                { value: 'auto', label: t('printerSetup.tabNetwork'), icon: Search },
                { value: 'usb', label: t('printerSetup.tabUsb'), icon: Usb },
                { value: 'manual', label: t('printerSetup.tabManual'), icon: Wifi },
                { value: 'system', label: t('printerSetup.tabSystem'), icon: Printer },
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
                  {t('printerSetup.autoIntro')}
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
                  <span>{isScanning ? t('printerSetup.scanning') : t('printerSetup.scanNetwork')}</span>
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
                  <h3 className="font-medium text-gray-900">{t('printerSetup.discoveredHeading')}</h3>
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
                                {t('printerSetup.recommended')}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 space-y-1">
                            <p className={`text-sm ${getConfidenceColor(printer.confidence)}`}>
                              {t('printerSetup.confidenceLine', {
                                confidence: printer.confidence,
                                type: printer.isThermal ? t('printerSetup.thermal') : t('printerSetup.confidenceUnknown'),
                              })}
                            </p>
                            {printer.brand && (
                              <p className="text-sm text-gray-600">{t('printerSetup.brandLine', { brand: printer.brand })}</p>
                            )}
                            {printer.identification && (
                              <p className="text-sm text-gray-500">{t('printerSetup.idLine', { id: printer.identification })}</p>
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
                            t('printerSetup.connect')
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
                  {t('printerSetup.usbIntro')}
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
                  <span>{isScanning ? t('printerSetup.scanning') : t('printerSetup.scanUsb')}</span>
                </button>
              </div>

              {/* Status */}
              {currentStatus && activeTab === 'usb' && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700">{currentStatus}</p>
                </div>
              )}

              {devicesLoading && usbRows.length === 0 && (
                <div className="mb-4 flex items-center space-x-2 text-sm text-gray-600">
                  <Loader className="h-4 w-4 animate-spin" />
                  <span>{t('printerSetup.lookingForUsb')}</span>
                </div>
              )}

              {usbRows.length > 0 && (
                <div className="space-y-3">
                  {usbRows.map(row => {
                    const busy = setupBusyPort === row.port || setupBusyPort === row.ownQueue;
                    const detail = row.ownQueue
                      ? t('printerSetup.detailQueue', { name: row.ownQueue })
                      : row.queues.length > 0
                        ? t('printerSetup.detailSharedPort', { queues: row.queues.join(', ') })
                        : row.port
                          ? t('printerSetup.detailNoQueueYet')
                          : row.driverState === 'winusb'
                            ? t('printerSetup.detailDirectUsb')
                            : row.driverState === 'windows-driver'
                              ? t('printerSetup.detailDriverHeld')
                              : '';
                    const action = row.ownQueue
                      ? { label: t('printerSetup.actionUseThis'), run: () => void useExistingQueue(row.ownQueue as string) }
                      : row.port
                        ? { label: t('printerSetup.actionSetUpForMe'), run: () => void setUpDevice(row.device) }
                        : row.legacy && row.driverState !== 'windows-driver'
                          // A driver-bound device CANNOT be opened directly —
                          // libusb returns NOT_SUPPORTED. Offering the button
                          // guarantees a failure message, so don't.
                          ? { label: t('printerSetup.connect'), run: () => connectToUSBPrinter(row.legacy as USBPrinter) }
                          : null;
                    return (
                      <div key={row.key} className="p-4 border border-gray-200 rounded-lg bg-white">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className="text-lg">🔌</span>
                              <span className="font-medium">{row.label}</span>
                              {row.isThermal && (
                                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">{t('printerSetup.thermal')}</span>
                              )}
                            </div>
                            <p className="mt-1 text-sm text-gray-600 font-mono">
                              {[row.ids, row.port, detail].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          {action && (
                            <button
                              type="button"
                              onClick={action.run}
                              disabled={busy || isConnecting}
                              className={`${DS2_PRIMARY_BTN} shrink-0 px-4 py-2`}
                            >
                              {busy ? <Loader className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                              <span>{busy ? t('printerSetup.working') : action.label}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
                      {t('printerSetup.ipLabel')}
                    </label>
                    <input
                      type="text"
                      value={manualIP}
                      onChange={(e) => setManualIP(e.target.value)}
                      placeholder={t('printerSetup.ipPlaceholder')}
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
                    <span>{isConnecting ? t('printerSetup.connecting') : t('printerSetup.connectToPrinter')}</span>
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
                  {t('printerSetup.systemIntro')}
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
                  <span>{systemLoading ? t('printerSetup.refreshing') : t('printerSetup.refresh')}</span>
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
                  <h3 className="font-medium text-gray-900">{t('printerSetup.systemPrintersHeading')}</h3>
                  {systemPrinters.map((p: any) => (
                    <div key={p.name} className={`p-4 border rounded-lg ${p.connected ? 'border-gray-200 bg-white' : 'border-orange-200 bg-orange-50'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-lg">🖨️</span>
                            <span className="font-medium">{p.name}</span>
                            {p.connected ? (
                              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">{t('printerSetup.statusConnected')}</span>
                            ) : (
                              <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">{t('printerSetup.statusOffline')}</span>
                            )}
                          </div>
                          <div className="mt-1 space-y-1 text-sm text-gray-600">
                            <p>{t('printerSetup.deviceLabel')} <span className="font-mono">{p.device}</span></p>
                            {/* The slot holds the raw device type, uppercased — the
                                fallback stays untranslated to match it. */}
                            <p>{t('printerSetup.typeLine', { type: p.type?.toUpperCase?.() || 'UNKNOWN' })}</p>
                            {p.hasQueuedJobs && (
                              <p className="text-orange-700">{t('printerSetup.queuedJobs', { n: p.queueCount })}</p>
                            )}
                            {p.isStale && (
                              <p className="text-red-600">{t('printerSetup.markedStale')}</p>
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
                                  setCurrentStatus(t('printerSetup.statusCouldNotSelect', { name: p.name, error: roleResult.error ?? t('printerSetup.unknownErrorLower') }));
                                  return;
                                }
                              }
                              onPrinterConnected({
                                success: true,
                                message: isWindows
                                  ? t('printerSetup.messageReceiptPrinterSet', { name: p.name })
                                  : t('printerSetup.messageSelectedSystemPrinter', { name: p.name }),
                                printerName: p.name,
                              });
                            }}
                            className={DS2_PRIMARY_BTN}
                          >
                            {t('printerSetup.useThis')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                !systemLoading && (
                  <div className="p-4 border border-dashed rounded-lg text-gray-500 text-sm">{t('printerSetup.noSystemPrinters')}</div>
                )
              )}
            </div>
          )}

          {/* Help Text */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">{t('printerSetup.tipsTitle')}</p>
                <ul className="space-y-1 text-xs">
                  <li>• <strong>{t('printerSetup.tabNetwork')}:</strong> {t('printerSetup.tipNetworkPowered')}</li>
                  <li>• <strong>{t('printerSetup.tabUsb')}:</strong> {t('printerSetup.tipUsbCable')}</li>
                  <li>• <strong>{t('printerSetup.tabNetwork')}:</strong> {t('printerSetup.tipSameWifi')}</li>
                  <li>• <strong>{t('printerSetup.tabManual')}:</strong> {t('printerSetup.tipManualIp')}</li>
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
