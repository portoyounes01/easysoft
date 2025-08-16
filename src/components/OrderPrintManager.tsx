import React, { useState } from 'react';
import { Printer, Check, X, AlertCircle, Clock } from 'lucide-react';
import { OrderPrintRequest, PrintJobResult } from '../types/printerWorkflow';
import { printerWorkflowService } from '../services/printerWorkflowService';

interface OrderPrintManagerProps {
  onPrintComplete?: (results: PrintJobResult[]) => void;
}

const OrderPrintManager: React.FC<OrderPrintManagerProps> = ({ onPrintComplete }) => {
  const [printResults, setPrintResults] = useState<PrintJobResult[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [lastPrintTime, setLastPrintTime] = useState<Date | null>(null);

  // Example function to print an order (you would call this from your cashier interface)
  const printOrder = async (orderData: OrderPrintRequest) => {
    setIsPrinting(true);
    setPrintResults([]);

    try {
      const results = await printerWorkflowService.processOrderPrint(orderData);
      setPrintResults(results);
      setLastPrintTime(new Date());
      
      if (onPrintComplete) {
        onPrintComplete(results);
      }

      // Show success/failure notification
      const totalJobs = results.reduce((sum, station) => sum + station.jobs.length, 0);
      const successfulJobs = results.reduce((sum, station) => 
        sum + station.jobs.filter(job => job.success).length, 0
      );

      if (successfulJobs === totalJobs) {
        console.log('✅ All print jobs completed successfully');
      } else if (successfulJobs > 0) {
        console.warn(`⚠️ ${successfulJobs}/${totalJobs} print jobs completed successfully`);
      } else {
        console.error('❌ All print jobs failed');
      }

    } catch (error) {
      console.error('Print processing error:', error);
    } finally {
      setIsPrinting(false);
    }
  };

  // Helper function to create a sample order (for testing)
  const createSampleOrder = (): OrderPrintRequest => {
    return {
      orderId: `order-${Date.now()}`,
      orderData: {
        items: [
          {
            id: '1',
            name: 'Premium Coffee Beans',
            quantity: 2,
            price: 12.50,
            categoryId: '550e8400-e29b-41d4-a716-446655440001', // Beverages
            categoryName: 'Beverages'
          },
          {
            id: '2',
            name: 'Artisan Bread',
            quantity: 1,
            price: 4.50,
            categoryId: '550e8400-e29b-41d4-a716-446655440003', // Bakery
            categoryName: 'Bakery',
            notes: 'Extra crispy'
          },
          {
            id: '3',
            name: 'Dark Chocolate Bar',
            quantity: 3,
            price: 6.90,
            categoryId: '550e8400-e29b-41d4-a716-446655440004', // Confectionery
            categoryName: 'Confectionery'
          }
        ],
        customer: 'John Doe',
        total: 50.20,
        date: new Date(),
        employeeName: 'Jane Smith'
      }
    };
  };

  const getJobStatusIcon = (success: boolean) => {
    return success ? (
      <Check className="h-4 w-4 text-green-600" />
    ) : (
      <X className="h-4 w-4 text-red-600" />
    );
  };

  const getStationStatusColor = (jobs: PrintJobResult['jobs']) => {
    const successCount = jobs.filter(job => job.success).length;
    if (successCount === jobs.length) return 'border-green-200 bg-green-50';
    if (successCount > 0) return 'border-yellow-200 bg-yellow-50';
    return 'border-red-200 bg-red-50';
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Printer className="h-6 w-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900">Order Printing</h2>
        </div>
        
        <div className="flex items-center gap-3">
          {lastPrintTime && (
            <span className="text-sm text-gray-500">
              Last print: {lastPrintTime.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => printOrder(createSampleOrder())}
            disabled={isPrinting}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isPrinting ? (
              <>
                <Clock className="h-4 w-4 animate-spin" />
                Printing...
              </>
            ) : (
              <>
                <Printer className="h-4 w-4" />
                Test Print Order
              </>
            )}
          </button>
        </div>
      </div>

      {/* Print Status */}
      {printResults.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-medium text-gray-900">Print Results:</h3>
          
          {printResults.map((station) => (
            <div
              key={station.stationId}
              className={`border rounded-lg p-4 ${getStationStatusColor(station.jobs)}`}
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900">{station.stationName}</h4>
                <div className="flex items-center gap-2">
                  {station.jobs.filter(job => job.success).length === station.jobs.length ? (
                    <Check className="h-5 w-5 text-green-600" />
                  ) : station.jobs.some(job => job.success) ? (
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                  ) : (
                    <X className="h-5 w-5 text-red-600" />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {station.jobs.map((job, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      {getJobStatusIcon(job.success)}
                      <span className="text-gray-700">{job.printerName}</span>
                    </div>
                    
                    <div className="text-right">
                      {job.success ? (
                        <span className="text-green-600">
                          {job.jobId ? `Job: ${job.jobId}` : 'Success'}
                        </span>
                      ) : (
                        <span className="text-red-600">
                          {job.error || 'Failed'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Usage Instructions */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-medium text-gray-900 mb-2">How it works:</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• Orders are automatically routed to configured printer stations</li>
          <li>• Receipt printers get the full order details</li>
          <li>• Kitchen stations only get items relevant to their category</li>
          <li>• All configured printers in a station will print simultaneously</li>
          <li>• Configure stations in the Printer Workflow Configuration page</li>
        </ul>
      </div>
    </div>
  );
};

export default OrderPrintManager;
