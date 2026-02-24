import React, { useState } from 'react';
import { Eye, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { OrderPrintRequest } from '../types/printerWorkflow';
import { printerWorkflowService } from '../services/printerWorkflowService';

const RoutingDebugger: React.FC = () => {
  const [testOrder, setTestOrder] = useState<OrderPrintRequest>({
    orderId: `debug-${Date.now()}`,
    orderData: {
      items: [
        {
          id: '1',
          name: 'Premium Coffee Beans',
          quantity: 1,
          price: 12.50,
          categoryId: '550e8400-e29b-41d4-a716-446655440001',
          categoryName: 'Beverages',
          productId: 'COF001',
          sku: 'COF001',
          tags: ['hot-beverage', 'requires-grinder'],
          menuName: 'Coffee Menu'
        },
        {
          id: '2',
          name: 'Artisan Bread',
          quantity: 1,
          price: 4.50,
          categoryId: '550e8400-e29b-41d4-a716-446655440003',
          categoryName: 'Bakery',
          productId: 'BRD001',
          sku: 'BRD001',
          tags: ['requires-oven', 'fresh-daily'],
          menuName: 'Bakery Menu'
        }
      ],
      customer: 'Debug Customer',
      total: 17.00,
      date: new Date(),
      employeeName: 'Test Employee'
    }
  });

  const [routingDetails, setRoutingDetails] = useState<ReturnType<typeof printerWorkflowService.getRoutingDetails> | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const analyzeRouting = () => {
    const details = printerWorkflowService.getRoutingDetails(testOrder);
    setRoutingDetails(details);
    setShowDetails(true);
  };

  const updateTestItem = (index: number, field: string, value: any) => {
    const newItems = [...testOrder.orderData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setTestOrder({
      ...testOrder,
      orderData: { ...testOrder.orderData, items: newItems }
    });
  };

  const addTestItem = () => {
    const newItem = {
      id: `item-${Date.now()}`,
      name: 'New Item',
      quantity: 1,
      price: 0,
      categoryId: '',
      categoryName: '',
      productId: '',
      sku: '',
      tags: [],
      menuName: ''
    };
    setTestOrder({
      ...testOrder,
      orderData: {
        ...testOrder.orderData,
        items: [...testOrder.orderData.items, newItem]
      }
    });
  };

  const removeTestItem = (index: number) => {
    const newItems = testOrder.orderData.items.filter((_, i) => i !== index);
    setTestOrder({
      ...testOrder,
      orderData: { ...testOrder.orderData, items: newItems }
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <Eye className="h-6 w-6 text-purple-600" />
        <h2 className="text-xl font-semibold text-gray-900">Routing Debugger</h2>
      </div>

      <div className="space-y-6">
        {/* Test Order Configuration */}
        <div>
          <h3 className="font-medium text-gray-900 mb-3">Test Order Items</h3>
          <div className="space-y-3">
            {testOrder.orderData.items.map((item, index) => (
              <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Item Name</label>
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updateTestItem(index, 'name', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Product ID</label>
                    <input
                      type="text"
                      value={item.productId || ''}
                      onChange={(e) => updateTestItem(index, 'productId', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Category ID</label>
                    <input
                      type="text"
                      value={item.categoryId}
                      onChange={(e) => updateTestItem(index, 'categoryId', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Menu Name</label>
                    <input
                      type="text"
                      value={item.menuName || ''}
                      onChange={(e) => updateTestItem(index, 'menuName', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Tags (comma separated)</label>
                    <input
                      type="text"
                      value={item.tags?.join(', ') || ''}
                      onChange={(e) => updateTestItem(index, 'tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
                <button
                  onClick={() => removeTestItem(index)}
                  className="mt-2 text-xs text-red-600 hover:text-red-800"
                >
                  Remove Item
                </button>
              </div>
            ))}
          </div>
          
          <div className="flex gap-3 mt-4">
            <button
              onClick={addTestItem}
              className="px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Add Item
            </button>
            <button
              onClick={analyzeRouting}
              className="px-4 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              Analyze Routing
            </button>
          </div>
        </div>

        {/* Routing Results */}
        {showDetails && routingDetails && (
          <div>
            <h3 className="font-medium text-gray-900 mb-3">Routing Analysis</h3>
            
            {routingDetails.length === 0 ? (
              <div className="flex items-center gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                <span className="text-yellow-800">No stations would print for this order</span>
              </div>
            ) : (
              <div className="space-y-4">
                {routingDetails.map((detail) => (
                  <div key={detail.stationId} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <h4 className="font-medium text-gray-900">{detail.stationName}</h4>
                      <span className="text-sm text-gray-500">({detail.items.length} items)</span>
                    </div>

                    <div className="mb-3">
                      <h5 className="text-sm font-medium text-gray-700 mb-1">Items to print:</h5>
                      <div className="flex flex-wrap gap-1">
                        {detail.items.map((item, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded"
                          >
                            {item.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h5 className="text-sm font-medium text-gray-700 mb-1">Matched rules:</h5>
                      <div className="space-y-1">
                        {detail.matchedRules.map((rule, index) => (
                          <div key={index} className="flex items-center gap-2 text-xs text-gray-600">
                            <Info className="h-3 w-3" />
                            <span>{rule}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Usage Instructions */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h4 className="font-medium text-purple-900 mb-2">How to use:</h4>
          <ul className="text-sm text-purple-800 space-y-1">
            <li>• Modify the test order items above to match your products</li>
            <li>• Add product IDs, category IDs, menu names, or tags</li>
            <li>• Click "Analyze Routing" to see which stations would print</li>
            <li>• This helps you test your routing rules before going live</li>
            <li>• Configure routing rules in the station management above</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default RoutingDebugger;
