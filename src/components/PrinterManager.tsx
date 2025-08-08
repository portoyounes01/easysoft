import React, { useState, useEffect } from 'react';
import { Printer, Settings, Trash2, TestTube, RefreshCw, Tag, CheckCircle } from 'lucide-react';
import { ConfiguredPrinter } from '../types/electron';

const PrinterManager: React.FC = () => {
  const [printers, setPrinters] = useState<ConfiguredPrinter[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoUpdating, setAutoUpdating] = useState(false);
  const [updatingPrinters, setUpdatingPrinters] = useState<Set<string>>(new Set());
  const [selectedPrinter, setSelectedPrinter] = useState<string | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [scanProgress, setScanProgress] = useState({
    stage: '',
    progress: 0,
    total: 0,
    message: ''
  });

  const roles = [
    { value: 'receipt', label: 'Receipt Printer', description: 'Main customer receipts' },
    { value: 'kitchen', label: 'Kitchen Printer', description: 'Food orders' },
    { value: 'bar', label: 'Bar Printer', description: 'Drink orders' },
    { value: 'label', label: 'Label Printer', description: 'Product labels' },
    { value: 'backup', label: 'Backup Printer', description: 'Backup/emergency use' },
    { value: 'unassigned', label: 'Unassigned', description: 'No specific role' }
  ];

  const testTypes = [
    { value: 'basic', label: 'Basic Test' },
    { value: 'receipt', label: 'Receipt Test' },
    { value: 'kitchen', label: 'Kitchen Order Test' }
  ];

  useEffect(() => {
    // On mount, quickly list printers
    listPrintersOnly().then(() => {
      // After initial list loads, automatically check statuses
      setTimeout(() => {
        console.log('🔄 Auto-starting printer status check...');
        setAutoUpdating(true);
        checkAllConnections().finally(() => setAutoUpdating(false));
      }, 500); // Small delay to let UI render first
    });

    // Set up real-time monitoring
    const cleanup = setupRealtimeMonitoring();
    
    return () => {
      cleanup();
    };
  }, []);

  // Set up real-time printer monitoring
  const setupRealtimeMonitoring = () => {
    console.log('� Setting up real-time hardware monitoring...');
    
    // Start hardware monitoring after initial load
    setTimeout(async () => {
      try {
        const result = await window.electronAPI?.startMonitoring(); // Use new real-time monitoring
        if (result?.success) {
          console.log('✅ Real-time hardware monitoring started');
        }
      } catch (error) {
        console.error('Failed to start hardware monitoring:', error);
      }
    }, 2000);

    // Set up hardware change listener (for USB/network changes)
    const removeHardwareListener = window.electronAPI?.onHardwareChange?.((changeData) => {
      console.log('🔌 Hardware change detected:', changeData);
      
      // For USB changes that might be printers, respond immediately
      if (changeData.type === 'usb' && changeData.isLikelyPrinter) {
        console.log(`🖨️ Printer-like USB device ${changeData.action}, instant refresh!`);
      }
      
      // Use instant refresh for immediate UI updates (no status checks initially)
      quickRefreshForHardwareChange();
    });

    // Set up status change listener (for existing functionality)
    const removeStatusListener = window.electronAPI?.onStatusChange((statusData) => {
      console.log('📊 Status change received:', statusData.printer.name, statusData);
      
      // Update the specific printer in the list
      setPrinters(prev => prev.map(printer => {
        if (printer.name === statusData.printer.name) {
          return {
            ...printer,
            connected: statusData.printer.connected,
            status: statusData.printer.status,
            connectionStatus: statusData.printer.connectionStatus,
            lastSeen: statusData.printer.lastSeen
          };
        }
        return printer;
      }));

      // Show a brief visual indicator that this printer was updated
      setUpdatingPrinters(prev => new Set(prev).add(statusData.printer.name));
      setTimeout(() => {
        setUpdatingPrinters(prev => {
          const newSet = new Set(prev);
          newSet.delete(statusData.printer.name);
          return newSet;
        });
      }, 2000);
    });

    // Cleanup function
    return () => {
      console.log('� Cleaning up real-time monitoring...');
      if (removeStatusListener) {
        removeStatusListener();
      }
      if (removeHardwareListener) {
        removeHardwareListener();
      }
      window.electronAPI?.stopMonitoring().catch(console.error);
    };
  };

  // Manual connection check for all printers
  const checkAllConnections = async () => {
    try {
      console.log('🔍 Manually checking all printer connections...');
      const result = await window.electronAPI?.checkAllConnections();
      
      if (result?.success && result.changed?.length > 0) {
        console.log(`📊 Found ${result.changed.length} printers with status changes`);
        
        // Update changed printers in the UI
        setPrinters(prev => prev.map(printer => {
          const changed = result.changed.find((c: any) => c.name === printer.name);
          return changed ? { ...printer, ...changed } : printer;
        }));
        
        // Show visual feedback for changed printers
        result.changed.forEach((changedPrinter: any) => {
          setUpdatingPrinters(prev => new Set(prev).add(changedPrinter.name));
          setTimeout(() => {
            setUpdatingPrinters(prev => {
              const newSet = new Set(prev);
              newSet.delete(changedPrinter.name);
              return newSet;
            });
          }, 2000);
        });
      }
    } catch (error) {
      console.error('Failed to check connections:', error);
    }
  };

  // Progressive scan of printers (USB and system) with live updates
  const loadPrinters = async () => {
    setLoading(true);
    setUpdatingPrinters(new Set()); // Clear any previous updating state
    // Do not clear printers list; update statuses progressively
    setScanProgress({ stage: '', progress: 0, total: 0, message: 'Starting scan...' });
    
    try {
      // Use progressive scanning
      const result = await window.electronAPI?.scanPrintersProgressively((updateData: any) => {
        console.log('🎯 Frontend received update:', updateData.type, updateData.stage, updateData);
        
        if (updateData.type === 'progress') {
          setScanProgress({
            stage: updateData.stage || '',
            progress: updateData.progress || 0,
            total: updateData.total || 0,
            message: updateData.message || ''
          });
        } else if (updateData.type === 'printer-found' && updateData.printer) {
          console.log('🖨️ Adding printer to UI:', updateData.printer.name);
          
          // Mark this printer as currently being updated
          setUpdatingPrinters(prev => new Set(prev).add(updateData.printer!.name));
          
          // Add printer to list progressively
          setPrinters(prev => {
            const existing = prev.find(p => p.name === updateData.printer!.name);
            if (existing) {
              // Update existing printer
              return prev.map(p => p.name === updateData.printer!.name ? updateData.printer! : p);
            } else {
              // Add new printer
              return [...prev, updateData.printer!];
            }
          });
          
          // Remove from updating state after a brief delay to show the update
          setTimeout(() => {
            setUpdatingPrinters(prev => {
              const newSet = new Set(prev);
              newSet.delete(updateData.printer!.name);
              return newSet;
            });
          }, 1500); // Longer delay to make the update indicator more visible
        } else if (updateData.type === 'complete') {
          console.log('✅ Scan complete, final printer count:', updateData.printers?.length);
          if (updateData.printers) {
            setPrinters(updateData.printers);
          }
          setUpdatingPrinters(new Set()); // Clear all updating states
          setScanProgress({ stage: '', progress: 0, total: 0, message: 'Scan complete' });
        }
      });
      
      if (!result?.success) {
        console.error('Failed to load printers:', result?.error);
        // Fallback to standard method
        const fallbackResult = await window.electronAPI?.hardware.getConfiguredPrinters();
        if (fallbackResult?.success) {
          setPrinters(fallbackResult.printers || []);
        }
      }
    } catch (error) {
      console.error('Error loading printers:', error);
      // Fallback to standard method
      try {
        const fallbackResult = await window.electronAPI?.hardware.getConfiguredPrinters();
        if (fallbackResult?.success) {
          setPrinters(fallbackResult.printers || []);
        }
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
      }
    } finally {
      setLoading(false);
      setUpdatingPrinters(new Set()); // Clear all updating states
      setScanProgress({ stage: '', progress: 0, total: 0, message: '' });
    }
  };

  // List printers names only (status unknown) on mount
  const listPrintersOnly = async () => {
    setLoading(true);
    try {
  const result = await window.electronAPI?.hardware.listPrinters();
      if (result?.success) {
        setPrinters(result.printers);
      } else {
        console.error('Failed to list printers:', result?.error);
      }
    } catch (error) {
      console.error('Error listing printers:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fast refresh for hardware changes - gets list quickly then checks connections
  const quickRefreshForHardwareChange = async () => {
    try {
      console.log('⚡ Instant refresh for hardware change...');
      
      // Immediately get the current printer list without ANY status checks
      const listResult = await window.electronAPI?.hardware.listPrinters();
      if (listResult?.success) {
        setPrinters(listResult.printers);
        console.log(`⚡ Instantly updated printer list with ${listResult.printers.length} printers`);
      }
      
      // Do status checks in background after a delay (non-blocking)
      setTimeout(() => {
        checkAllConnections();
      }, 2000); // 2 second delay so user sees instant list update first
      
    } catch (error) {
      console.error('Instant refresh failed:', error);
    }
  };

  const handleSetRole = async (printerName: string, role: string) => {
    try {
      const result = await window.electronAPI?.hardware.setPrinterRole(printerName, role);
      if (result?.success) {
        await loadPrinters(); // Refresh the list
        setShowRoleModal(false);
        setSelectedPrinter(null);
      } else {
        alert(`Failed to set role: ${result?.error}`);
      }
    } catch (error) {
      alert(`Error setting role: ${error}`);
    }
  };

  const handleRemovePrinter = async (printerName: string) => {
    if (!confirm(`Are you sure you want to remove printer "${printerName}"?`)) {
      return;
    }

    try {
      const result = await window.electronAPI?.hardware.removePrinter(printerName);
      if (result?.success) {
        await loadPrinters(); // Refresh the list
      } else {
        alert(`Failed to remove printer: ${result?.error}`);
      }
    } catch (error) {
      alert(`Error removing printer: ${error}`);
    }
  };

  const handleTestPrinter = async (printerName: string, testType: string = 'basic') => {
    try {
      const result = await window.electronAPI?.hardware.testPrinterByName(printerName, testType);
      if (result?.success) {
        alert(`Test print sent to ${printerName}!\n${result.message}`);
      } else {
        alert(`Test failed: ${result?.error}`);
      }
    } catch (error) {
      alert(`Error testing printer: ${error}`);
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'receipt': return 'bg-blue-100 text-blue-800';
      case 'kitchen': return 'bg-orange-100 text-orange-800';
      case 'bar': return 'bg-purple-100 text-purple-800';
      case 'label': return 'bg-green-100 text-green-800';
      case 'backup': return 'bg-gray-100 text-gray-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getStatusColor = (status: string, connected: boolean) => {
    if (!connected) return 'text-red-600';
    
    switch (status) {
      case 'ready': return 'text-green-600';
      case 'idle': return 'text-green-600';
      case 'printing': return 'text-blue-600';
      case 'stopped': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getConnectionStatusText = (connected: boolean, connectionStatus: string) => {
    if (connected) return 'Connected';
    
    switch (connectionStatus) {
      case 'disconnected': return 'Disconnected';
      case 'network_unreachable': return 'Network Unreachable';
      case 'not_accepting': return 'Not Accepting Jobs';
      case 'unreachable': return 'Unreachable';
      case 'error': return 'Connection Error';
      default: return 'Offline';
    }
  };

  const getConnectionIcon = (connected: boolean) => {
    return connected ? '🟢' : '🔴';
  };

  const getTypeIcon = () => {
    // Always return printer icon for main display
    return '🖨️';
  };

  const getConnectionTypeIcon = (type: string) => {
    switch (type) {
      case 'usb': return '🔌';
      case 'network': return '🌐';
      case 'ipp': return '📡';
      case 'lpd': return '📄';
      default: return '';
    }
  };

  // Only show full-screen loader if no printers yet
  if (loading && printers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
        <div className="text-center">
          <div className="text-gray-600">
            {scanProgress.message || 'Loading printers...'}
          </div>
          {scanProgress.stage && (
            <div className="text-sm text-gray-500 mt-1">
              Scanning {scanProgress.stage} printers...
            </div>
          )}
          {scanProgress.total > 0 && (
            <div className="w-64 bg-gray-200 rounded-full h-2 mt-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(scanProgress.progress / scanProgress.total) * 100}%` }}
              ></div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Inline progress bar while loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center p-4 space-y-2">
          <div className="text-gray-600">{scanProgress.message}</div>
          {scanProgress.stage && (
            <div className="text-sm text-gray-500">
              Scanning {scanProgress.stage} printers...
            </div>
          )}
          {scanProgress.total > 0 && (
            <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(scanProgress.progress / scanProgress.total) * 100}%` }}
              ></div>
            </div>
          )}
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Printer className="h-6 w-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900">Configured Printers</h2>
          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
            {printers.length} total
          </span>
          <span className="px-2 py-1 bg-green-100 text-green-800 text-sm rounded-full">
            {printers.filter(p => p.connected).length} connected
          </span>
          {(autoUpdating || updatingPrinters.size > 0) && (
            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-sm rounded-full flex items-center space-x-1">
              <RefreshCw className="h-3 w-3 animate-spin" />
              <span>
                {autoUpdating ? 'Auto-updating...' : `Updating ${updatingPrinters.size} printer${updatingPrinters.size !== 1 ? 's' : ''}...`}
              </span>
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={checkAllConnections}
            className="flex items-center space-x-2 px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors text-sm"
            title="Check all printer connections now"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Check Status</span>
          </button>
          <button
            onClick={() => {
              setAutoUpdating(false); // Stop auto-update indicator
              setUpdatingPrinters(new Set()); // Clear any previous updating state
              quickRefreshForHardwareChange();
            }}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Quick Refresh</span>
          </button>
        </div>
      </div>

      {/* Printers List */}
      {printers.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Printer className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Printers Configured</h3>
          <p className="text-gray-600 mb-4">Set up your first printer using the "Setup Thermal Printer" button</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {printers.map((printer) => (
            <div
              key={printer.name}
              className={`bg-white rounded-lg border p-6 hover:shadow-md transition-shadow ${
                printer.isStale 
                  ? 'border-red-200 bg-red-50 opacity-75' 
                  : printer.connected 
                    ? 'border-gray-200' 
                    : 'border-orange-200 bg-orange-50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <span className="text-2xl">{getTypeIcon()}</span>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {printer.name}
                          {printer.isActive && (
                            <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                              Active
                            </span>
                          )}
                        </h3>
                        {updatingPrinters.has(printer.name) && (
                          <div className="flex items-center space-x-1">
                            <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                            <span className="text-xs text-blue-600 font-medium">Updating...</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <div className="flex items-center space-x-1">
                          <span>{getConnectionIcon(printer.connected)}</span>
                          <span className={`font-medium ${getStatusColor(printer.status, printer.connected)}`}>
                            {getConnectionStatusText(printer.connected, printer.connectionStatus)}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <span>Type:</span>
                          <span>{getConnectionTypeIcon(printer.type)}</span>
                          <span>{printer.type.toUpperCase()}</span>
                        </div>
                        {printer.hasQueuedJobs && (
                          <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">
                            {printer.queueCount} queued
                          </span>
                        )}
                        {printer.isStale && (
                          <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                            Stale/Ghost
                          </span>
                        )}
                        {printer.lastConnected && (
                          <span>Setup: {new Date(printer.lastConnected).toLocaleDateString()}</span>
                        )}
                        {printer.lastSeen && printer.connected && (
                          <span>Last seen: {new Date(printer.lastSeen).toLocaleTimeString()}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mb-3">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getRoleColor(printer.role)}`}>
                      <Tag className="h-3 w-3 mr-1" />
                      {roles.find(r => r.value === printer.role)?.label || printer.role}
                    </span>
                  </div>

                  <div className="text-sm text-gray-500 font-mono bg-gray-50 p-2 rounded">
                    {printer.device}
                  </div>
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  {/* Test Dropdown */}
                  <div className="relative group">
                    <button 
                      disabled={!printer.connected}
                      className={`flex items-center space-x-1 px-3 py-2 rounded-lg transition-colors ${
                        printer.connected 
                          ? 'bg-green-100 hover:bg-green-200 text-green-700' 
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <TestTube className="h-4 w-4" />
                      <span>Test</span>
                    </button>
                    {printer.connected && (
                      <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                        {testTypes.map((test) => (
                          <button
                            key={test.value}
                            onClick={() => handleTestPrinter(printer.name, test.value)}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                          >
                            {test.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Set Role Button */}
                  <button
                    onClick={() => {
                      setSelectedPrinter(printer.name);
                      setSelectedRole(printer.role);
                      setShowRoleModal(true);
                    }}
                    className="flex items-center space-x-1 px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
                  >
                    <Settings className="h-4 w-4" />
                    <span>Role</span>
                  </button>

                  {/* Remove Button */}
                  <button
                    onClick={() => handleRemovePrinter(printer.name)}
                    className="flex items-center space-x-1 px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Remove</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Role Assignment Modal */}
      {showRoleModal && selectedPrinter && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                <Tag className="h-6 w-6 text-blue-600" />
                <h3 className="text-lg font-semibold">Set Printer Role</h3>
              </div>
              
              <p className="text-gray-600 mb-4">
                Assign a role to <strong>{selectedPrinter}</strong>
              </p>

              <div className="space-y-3 mb-6">
                {roles.map((role) => (
                  <label
                    key={role.value}
                    className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="role"
                      value={role.value}
                      checked={selectedRole === role.value}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium text-gray-900">{role.label}</div>
                      <div className="text-sm text-gray-600">{role.description}</div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowRoleModal(false);
                    setSelectedPrinter(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSetRole(selectedPrinter, selectedRole)}
                  className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span>Set Role</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrinterManager;
