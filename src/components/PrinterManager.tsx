import React, { useState, useEffect } from 'react';
import { Printer, RefreshCw, Wifi, WifiOff, Usb, Zap } from 'lucide-react';
import { ConfiguredPrinter } from '../types/electron';

const PrinterManager: React.FC = () => {
  const [printers, setPrinters] = useState<ConfiguredPrinter[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadPrinters = async () => {
    setRefreshing(true);
    try {
      const result = await window.electronAPI?.hardware.quickListPrinters();
      if (result?.success) {
        setPrinters(result.printers || []);
        setLastRefresh(new Date());
      } else {
        console.error('Failed to load printers:', result?.error);
        setPrinters([]);
      }
    } catch (error) {
      console.error('Error loading printers:', error);
      setPrinters([]);
    } finally {
      setRefreshing(false);
    }
  };

  const checkPrinterStatus = async () => {
    setCheckingStatus(true);
    try {
      const result = await window.electronAPI?.hardware.quickListPrintersWithStatus(true);
      if (result?.success) {
        setPrinters(result.printers || []);
        setLastRefresh(new Date());
      } else {
        console.error('Failed to check printer status:', result?.error);
      }
    } catch (error) {
      console.error('Error checking printer status:', error);
    } finally {
      setCheckingStatus(false);
    }
  };

  useEffect(() => {
    // Load printers immediately on mount
    loadPrinters().then(() => {
      // Only start hardware monitoring AFTER initial load completes
      const startHardwareMonitoring = async () => {
        try {
          console.log('🚀 Starting hardware monitoring from PrinterManager...');
          if (window.electronAPI?.startMonitoring) {
            const result = await window.electronAPI.startMonitoring(5000); // Check every 5 seconds
            if (result?.success) {
              console.log('✅ Hardware monitoring started successfully');
            } else {
              console.error('❌ Failed to start hardware monitoring:', result?.error);
            }
          } else {
            console.warn('⚠️ startMonitoring not available in electronAPI');
          }
        } catch (error) {
          console.error('❌ Error starting hardware monitoring:', error);
        }
      };

      // Start monitoring immediately after load completes
      startHardwareMonitoring();
    });

    // Set up hardware change listener
    let hardwareChangeCleanup: (() => void) | undefined;
    
    if (window.electronAPI?.onHardwareChange) {
      try {
        hardwareChangeCleanup = window.electronAPI.onHardwareChange((changeData) => {
          console.log('🔌 Hardware change detected in PrinterManager:', changeData);
          
          // Only refresh for USB changes or printer-related changes
          if (changeData.type === 'usb' || changeData.isLikelyPrinter) {
            console.log('📊 Checking printer status after hardware change');
            checkPrinterStatus();
          }
        });
      } catch (error) {
        console.error('❌ Error setting up hardware change listener:', error);
      }
    } else {
      console.warn('⚠️ onHardwareChange not available in electronAPI');
    }

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up PrinterManager...');
      
      try {
        // Clean up hardware change listener
        if (hardwareChangeCleanup && typeof hardwareChangeCleanup === 'function') {
          hardwareChangeCleanup();
        }
        
        // Stop monitoring
        if (window.electronAPI?.stopMonitoring) {
          window.electronAPI.stopMonitoring().catch((error) => {
            console.error('❌ Error stopping monitoring:', error);
          });
        }
      } catch (error) {
        console.error('❌ Error during PrinterManager cleanup:', error);
      }
    };
  }, []);

  const getStatusColor = (printer: ConfiguredPrinter) => {
    // Handle enhanced status checks first
    if (printer.connectionStatus === 'connected') return 'text-green-600';
    if (printer.connectionStatus === 'offline' || printer.connectionStatus === 'timeout') return 'text-red-600';
    if (printer.connectionStatus === 'quick_list') return 'text-gray-600';
    
    // Fallback to legacy status logic
    if (!printer.connected || printer.isStale) return 'text-red-600';
    if (printer.status === 'ready') return 'text-green-600';
    if (printer.status === 'not_accepting') return 'text-yellow-600';
    if (printer.status === 'default') return 'text-gray-600';
    return 'text-gray-600';
  };

  const getStatusIcon = (printer: ConfiguredPrinter) => {
    // For quick list, always show grey icons since we don't know the real status
    if (printer.connectionStatus === 'quick_list') {
      return printer.type === 'usb' ? 
        <Usb className="h-4 w-4 text-gray-500" /> : 
        <Wifi className="h-4 w-4 text-gray-500" />;
    }
    
    // For enhanced status checks, show actual connectivity
    if (!printer.connected || printer.isStale) {
      return printer.type === 'usb' ? 
        <Usb className="h-4 w-4 text-red-500" /> : 
        <WifiOff className="h-4 w-4 text-red-500" />;
    }
    
    return printer.type === 'usb' ? 
      <Usb className="h-4 w-4 text-green-500" /> : 
      <Wifi className="h-4 w-4 text-green-500" />;
  };

  const getTypeDisplay = (type: string) => {
    switch (type) {
      case 'usb': return 'USB';
      case 'network': return 'Network';
      case 'system': return 'System';
      default: return type;
    }
  };

  if (printers.length === 0 && !refreshing) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Printer className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">System Printers</h2>
          </div>
          <div className="flex items-center space-x-3">
            {lastRefresh && (
              <span className="text-sm text-gray-500">
                Last updated: {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={loadPrinters}
              disabled={refreshing}
              className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={checkPrinterStatus}
              disabled={checkingStatus}
              className="flex items-center space-x-2 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Zap className={`h-4 w-4 ${checkingStatus ? 'animate-pulse' : ''}`} />
              <span>Check Status</span>
            </button>
          </div>
        </div>
        <div className="text-center py-8 text-gray-500">
          <Printer className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No printers found on this system</p>
          <p className="text-sm mt-1">Make sure printers are installed and configured</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <Printer className="h-6 w-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900">System Printers</h2>
        </div>
        <div className="flex items-center space-x-3">
          {lastRefresh && (
            <span className="text-sm text-gray-500">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={loadPrinters}
            disabled={refreshing}
            className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={checkPrinterStatus}
            disabled={checkingStatus}
            className="flex items-center space-x-2 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <Zap className={`h-4 w-4 ${checkingStatus ? 'animate-pulse' : ''}`} />
            <span>Check Status</span>
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {printers.map((printer, index) => (
          <div
            key={`${printer.name}-${index}`}
            className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                {getStatusIcon(printer)}
                <Printer className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">{printer.name}</h3>
                <div className="flex items-center space-x-4 text-sm text-gray-600">
                  <span className={`font-medium ${getStatusColor(printer)}`}>
                    {printer.connectionStatus === 'quick_list' ? 'Unknown' :
                     printer.connectionStatus === 'connected' ? 'Connected' :
                     printer.connectionStatus === 'offline' ? 'Offline' :
                     printer.connectionStatus === 'timeout' ? 'Timeout' :
                     (printer.connected && !printer.isStale ? 
                      (printer.status === 'ready' ? 'Ready' : 
                       printer.status === 'not_accepting' ? 'Not Accepting' : 
                       printer.status === 'default' ? 'Unknown' :
                       'Unknown') : 
                      'Offline')}
                  </span>
                  <span>•</span>
                  <span>{getTypeDisplay(printer.type)}</span>
                  {printer.hasQueuedJobs && printer.queueCount && printer.queueCount > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-orange-600">
                        {printer.queueCount} job{printer.queueCount !== 1 ? 's' : ''}
                      </span>
                    </>
                  )}
                </div>
                {printer.device && printer.device !== 'unknown' && (
                  <p className="text-xs text-gray-500 mt-1 truncate max-w-md">
                    {printer.device}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PrinterManager;
