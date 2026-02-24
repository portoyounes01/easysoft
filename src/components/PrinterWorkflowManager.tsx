import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Plus, 
  Edit, 
  Trash2, 
  Printer, 
  MapPin,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { ConfiguredPrinter } from '../types/electron';
import { 
  PrinterStation, 
  PrinterCategory 
} from '../types/printerWorkflow';
import { printerWorkflowService } from '../services/printerWorkflowService';
import ProductAssignmentManager from './ProductAssignmentManager';

const PrinterWorkflowManager: React.FC = () => {
  const [stations, setStations] = useState<PrinterStation[]>([]);
  const [availablePrinters, setAvailablePrinters] = useState<ConfiguredPrinter[]>([]);
  const [categories] = useState<PrinterCategory[]>(printerWorkflowService.getAvailableCategories());
  const [selectedStation, setSelectedStation] = useState<PrinterStation | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    // Load stations
    const stationList = printerWorkflowService.getStations();
    setStations(stationList);

    // Load available printers
    try {
      if (window.electronAPI?.hardware) {
        const result = await window.electronAPI.hardware.quickListPrinters();
        if (result?.success) {
          setAvailablePrinters(result.printers || []);
        }
      }
    } catch (error) {
      console.error('Error loading printers:', error);
    }
  };

  const handleEditStation = (station: PrinterStation) => {
    setSelectedStation({ ...station });
    setIsEditing(true);
    setShowModal(true);
  };

  const handleCreateStation = () => {
    setSelectedStation({
      id: `station-${Date.now()}`,
      name: '',
      description: '',
      categoryId: categories[0]?.id || 'kitchen-hot',
      printerNames: [],
      isActive: true,
      printTemplate: 'kitchen',
      productIds: []
    });
    setIsEditing(false);
    setShowModal(true);
  };

  const handleSaveStation = () => {
    if (!selectedStation) return;

    printerWorkflowService.saveStation(selectedStation);
    setStations(printerWorkflowService.getStations());
    setShowModal(false);
    setSelectedStation(null);
  };

  const handleDeleteStation = (stationId: string) => {
    if (confirm('Are you sure you want to delete this station?')) {
      printerWorkflowService.removeStation(stationId);
      setStations(printerWorkflowService.getStations());
    }
  };

  const getCategoryInfo = (categoryId: string) => {
    return categories.find(cat => cat.id === categoryId) || categories[0];
  };

  const getStationStatus = (station: PrinterStation) => {
    if (!station.isActive) return { status: 'inactive', color: 'text-gray-500', icon: XCircle };
    if (!station.printerNames || station.printerNames.length === 0) return { status: 'no-printers', color: 'text-grey-50', icon: AlertCircle };
    
    const connectedPrinters = station.printerNames.filter(name =>
      availablePrinters.some(p => p.name === name && p.connected)
    );
    
    if (connectedPrinters.length === 0) return { status: 'offline', color: 'text-red-500', icon: XCircle };
    if (connectedPrinters.length === station.printerNames.length) return { status: 'online', color: 'text-green-500', icon: CheckCircle };
    return { status: 'partial', color: 'text-grey-50', icon: AlertCircle };
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-900">Printer Workflow Configuration</h2>
        </div>
        <button
          onClick={handleCreateStation}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Station
        </button>
      </div>

      {/* Environment Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-center gap-2 text-blue-800">
          <MapPin className="h-5 w-5" />
          <span className="font-medium">
            Environment: {window.electronAPI ? 'POS Station' : 'Web Interface'}
          </span>
        </div>
        <p className="text-blue-700 text-sm mt-1">
          {window.electronAPI 
            ? 'Configure receipt and kitchen printing stations. Assign specific products to each station.'
            : 'Administrative printing only. Kitchen stations are managed from POS terminals.'
          }
        </p>
      </div>

      {/* Stations Grid */}
      <div className="grid gap-4">
        {stations.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No printer stations configured</p>
            <button
              onClick={handleCreateStation}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create First Station
            </button>
          </div>
        ) : (
          stations.map((station) => {
            const category = getCategoryInfo(station.categoryId);
            const status = getStationStatus(station);
            const StatusIcon = status.icon;

            return (
              <div
                key={station.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg bg-gradient-to-r ${category.color}`}>
                      <Printer className="h-6 w-6 text-white" />
                    </div>
                    
                    <div>
                      <h3 className="font-semibold text-gray-900">{station.name}</h3>
                      <p className="text-sm text-gray-600">{station.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <span className="text-gray-500">
                          Category: {category.name}
                        </span>
                        <span className="text-gray-500">
                          Printers: {station.printerNames?.length || 0}
                        </span>
                        <span className="text-gray-500">
                          Products: {station.categoryId === 'receipt' ? 'All' : (station.productIds?.length || 0)}
                        </span>
                        <div className={`flex items-center gap-1 ${status.color}`}>
                          <StatusIcon className="h-4 w-4" />
                          <span className="capitalize">{status.status.replace('-', ' ')}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEditStation(station)}
                      className="p-2 text-gray-400 hover:text-blue-600 rounded"
                      title="Edit Station"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteStation(station.id)}
                      className="p-2 text-gray-400 hover:text-red-600 rounded"
                      title="Delete Station"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Station Details */}
                {station.printerNames && station.printerNames.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Assigned Printers:</h4>
                    <div className="flex flex-wrap gap-2">
                      {station.printerNames.map((printerName) => {
                        const printer = availablePrinters.find(p => p.name === printerName);
                        const isConnected = printer?.connected || false;
                        
                        return (
                          <span
                            key={printerName}
                            className={`px-2 py-1 rounded text-xs ${
                              isConnected 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {printerName} {isConnected ? '✓' : '✗'}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Product Assignment Summary */}
                {station.categoryId !== 'receipt' && station.productIds && station.productIds.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                      Assigned Products ({station.productIds.length}):
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {station.productIds.slice(0, 5).map((productId) => (
                        <span
                          key={productId}
                          className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800 font-mono"
                        >
                          {productId}
                        </span>
                      ))}
                      {station.productIds.length > 5 && (
                        <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-600">
                          +{station.productIds.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Edit/Create Station Modal */}
      {showModal && selectedStation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">
              {isEditing ? 'Edit Station' : 'Create Station'}
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column - Basic Configuration */}
              <div className="space-y-4">
                {/* Basic Info */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Station Name
                  </label>
                  <input
                    type="text"
                    value={selectedStation.name}
                    onChange={(e) => setSelectedStation({
                      ...selectedStation,
                      name: e.target.value
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Main Kitchen, Bar Station"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={selectedStation.description}
                    onChange={(e) => setSelectedStation({
                      ...selectedStation,
                      description: e.target.value
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Brief description of this station"
                  />
                </div>

                {/* Category Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Station Category
                  </label>
                  <select
                    value={selectedStation.categoryId}
                    onChange={(e) => {
                      const categoryId = e.target.value;
                      setSelectedStation({
                        ...selectedStation,
                        categoryId,
                        printTemplate: categoryId === 'receipt' ? 'receipt' : 
                                     categoryId === 'administrative' ? 'administrative' :
                                     categoryId === 'bar' ? 'bar' : 'kitchen'
                      });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name} - {category.description}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Printer Assignment */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assigned Printers
                  </label>
                  <div className="border border-gray-300 rounded-md p-3 max-h-32 overflow-y-auto">
                    {availablePrinters.length === 0 ? (
                      <p className="text-gray-500 text-sm">No printers available</p>
                    ) : (
                      availablePrinters.map((printer) => (
                        <label key={printer.name} className="flex items-center gap-2 py-1">
                          <input
                            type="checkbox"
                            checked={selectedStation.printerNames?.includes(printer.name) || false}
                            onChange={(e) => {
                              const currentPrinters = selectedStation.printerNames || [];
                              const newPrinters = e.target.checked
                                ? [...currentPrinters, printer.name]
                                : currentPrinters.filter(name => name !== printer.name);
                              
                              setSelectedStation({
                                ...selectedStation,
                                printerNames: newPrinters
                              });
                            }}
                            className="text-blue-600"
                          />
                          <span className="text-sm">
                            {printer.name}
                            <span className={`ml-2 ${printer.connected ? 'text-green-600' : 'text-red-600'}`}>
                              ({printer.connected ? 'Connected' : 'Offline'})
                            </span>
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Active Status */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="stationActive"
                    checked={selectedStation.isActive}
                    onChange={(e) => setSelectedStation({
                      ...selectedStation,
                      isActive: e.target.checked
                    })}
                    className="text-blue-600"
                  />
                  <label htmlFor="stationActive" className="text-sm font-medium text-gray-700">
                    Station is active
                  </label>
                </div>
              </div>

              {/* Right Column - Product Assignment */}
              <div>
                <ProductAssignmentManager
                  station={selectedStation}
                  onStationUpdate={(updatedStation) => setSelectedStation(updatedStation)}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowModal(false);
                  setSelectedStation(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStation}
                disabled={!selectedStation.name.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isEditing ? 'Update Station' : 'Create Station'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrinterWorkflowManager;
