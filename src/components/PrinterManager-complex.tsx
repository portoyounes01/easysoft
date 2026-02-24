import React, { useState, useEffect } from 'react';
import { Printer, Settings, Trash2, TestTube, RefreshCw, Tag } from 'lucide-react';
import { ConfiguredPrinter } from '../types/electron';

const PrinterManager: React.FC = () => {
  const [printers, setPrinters] = useState<ConfiguredPrinter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPrinter, setSelectedPrinter] = useState<string | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');

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
    // Simple: Load printers and their status on mount
    loadPrintersWithStatus();
  }, []);

  const loadPrintersWithStatus = async () => {
    try {
      setLoading(true);
      
      // Get printer list
      const result = await window.electronAPI?.hardware.listPrinters();
      if (result?.success) {
        setPrinters(result.printers || []);
      }
      
      // Then check connections
      await checkAllConnections();
    } catch (error) {
      console.error('Error loading printers:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkAllConnections = async () => {
    try {
      setRefreshing(true);
      const result = await window.electronAPI?.checkAllConnections();
      if (result?.success && result.changed?.length > 0) {
        // Update printers with new status
        setPrinters(prev => {
          const updated = [...prev];
          result.changed.forEach(changedPrinter => {
            const index = updated.findIndex(p => p.name === changedPrinter.name);
            if (index >= 0) {
              updated[index] = { ...updated[index], ...changedPrinter };
            }
          });
          return updated;
        });
      }
    } catch (error) {
      console.error('Error checking connections:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    loadPrintersWithStatus();
  };

  const handleSetRole = async () => {
    if (!selectedPrinter || !selectedRole) return;

    try {
      const result = await window.electronAPI?.hardware.setPrinterRole(selectedPrinter, selectedRole);
      if (result?.success) {
        // Update the printer in the list
        setPrinters(prev => prev.map(printer => 
          printer.name === selectedPrinter 
            ? { ...printer, role: selectedRole }
            : printer
        ));
        setShowRoleModal(false);
        setSelectedPrinter(null);
        setSelectedRole('');
      }
    } catch (error) {
      console.error('Error setting printer role:', error);
    }
  };

  const handleRemovePrinter = async (printerName: string) => {
    if (!confirm(`Remove printer "${printerName}"?`)) return;

    try {
      const result = await window.electronAPI?.hardware.removePrinter(printerName);
      if (result?.success) {
        setPrinters(prev => prev.filter(p => p.name !== printerName));
      }
    } catch (error) {
      console.error('Error removing printer:', error);
    }
  };

  const handleTestPrinter = async (printerName: string, testType: string = 'basic') => {
    try {
      const result = await window.electronAPI?.hardware.testPrinterByName(printerName, testType);
      if (result?.success) {
        alert(`Test successful: ${result.message}`);
      } else {
        alert(`Test failed: ${result?.error}`);
      }
    } catch (error) {
      console.error('Error testing printer:', error);
      alert('Test failed: Network error');
    }
  };

  const getStatusColor = (status: string, connected: boolean) => {
    if (!connected) return 'text-red-500';
    switch (status) {
      case 'connected':
        return 'text-green-500';
      case 'disconnected':
        return 'text-red-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-grey-50';
    }
  };

  const getStatusText = (printer: ConfiguredPrinter) => {
    if (!printer.connected) return 'Offline';
    switch (printer.status) {
      case 'connected':
        return 'Connected';
      case 'disconnected':
        return 'Disconnected';
      case 'error':
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Printer className="h-6 w-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-900">Printer Management</h2>
        </div>
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-3 text-gray-600">Loading printers...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Printer className="h-6 w-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-900">Printer Management</h2>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {printers.length === 0 ? (
        <div className="text-center py-12">
          <Printer className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No printers configured</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {printers.map((printer) => (
            <div key={printer.name} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Printer className="h-5 w-5 text-gray-600" />
                  <div>
                    <h3 className="font-medium text-gray-900">{printer.name}</h3>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span>Type: {printer.type}</span>
                      <span>•</span>
                      <span>Role: {printer.role || 'unassigned'}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-medium ${getStatusColor(printer.status, printer.connected)}`}>
                    {getStatusText(printer)}
                  </span>
                  
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setSelectedPrinter(printer.name);
                        setSelectedRole(printer.role || 'unassigned');
                        setShowRoleModal(true);
                      }}
                      className="p-2 text-gray-400 hover:text-blue-600 rounded"
                      title="Set Role"
                    >
                      <Tag className="h-4 w-4" />
                    </button>
                    
                    <button
                      onClick={() => handleTestPrinter(printer.name)}
                      className="p-2 text-gray-400 hover:text-green-600 rounded"
                      title="Test Printer"
                    >
                      <TestTube className="h-4 w-4" />
                    </button>
                    
                    <button
                      onClick={() => handleRemovePrinter(printer.name)}
                      className="p-2 text-gray-400 hover:text-red-600 rounded"
                      title="Remove Printer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Role Assignment Modal */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Set Printer Role</h3>
            <p className="text-gray-600 mb-4">Assign a role to "{selectedPrinter}"</p>
            
            <div className="space-y-2 mb-6">
              {roles.map((role) => (
                <label key={role.value} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    name="role"
                    value={role.value}
                    checked={selectedRole === role.value}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className="text-blue-600"
                  />
                  <div>
                    <div className="font-medium">{role.label}</div>
                    <div className="text-sm text-gray-500">{role.description}</div>
                  </div>
                </label>
              ))}
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRoleModal(false);
                  setSelectedPrinter(null);
                  setSelectedRole('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSetRole}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Set Role
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrinterManager;
