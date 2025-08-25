import { useCallback } from 'react';
import { OrderPrintRequest, PrintJobResult } from '../types/printerWorkflow';
import { printerWorkflowService } from '../services/printerWorkflowService';

export interface UseOrderPrintingOptions {
  onPrintSuccess?: (results: PrintJobResult[]) => void;
  onPrintError?: (error: Error) => void;
  showNotifications?: boolean;
}

export const useOrderPrinting = (options: UseOrderPrintingOptions = {}) => {
  const { onPrintSuccess, onPrintError, showNotifications = true } = options;

  const printOrder = useCallback(async (orderData: {
    orderId: string;
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      price: number;
      categoryId: string;
      categoryName: string;
      notes?: string;
    }>;
    customer?: string;
    total: number;
    date?: Date;
    employeeId?: string;
    employeeName?: string;
  }) => {
    try {
      const printRequest: OrderPrintRequest = {
        orderId: orderData.orderId,
        orderData: {
          ...orderData,
          date: orderData.date || new Date()
        }
      };

      const results = await printerWorkflowService.processOrderPrint(printRequest);
      
      // Calculate success statistics
      const totalJobs = results.reduce((sum, station) => sum + station.jobs.length, 0);
      const successfulJobs = results.reduce((sum, station) => 
        sum + station.jobs.filter(job => job.success).length, 0
      );

      // Show notifications if enabled
      if (showNotifications) {
        if (successfulJobs === totalJobs && totalJobs > 0) {
          console.log('✅ Order printed successfully to all stations');
        } else if (successfulJobs > 0) {
          console.warn(`⚠️ Order printed to ${successfulJobs}/${totalJobs} printers`);
        } else if (totalJobs > 0) {
          console.error('❌ Failed to print order to any printers');
        } else {
          console.info('ℹ️ No printer stations configured for this order');
        }
      }

      // Call success callback
      if (onPrintSuccess) {
        onPrintSuccess(results);
      }

      return {
        success: successfulJobs > 0 || totalJobs === 0,
        results,
        stats: {
          totalJobs,
          successfulJobs,
          failedJobs: totalJobs - successfulJobs
        }
      };

    } catch (error) {
      console.error('Order printing failed:', error);
      
      if (onPrintError && error instanceof Error) {
        onPrintError(error);
      }

      if (showNotifications) {
        console.error('❌ Order printing failed:', error);
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        results: [],
        stats: {
          totalJobs: 0,
          successfulJobs: 0,
          failedJobs: 1
        }
      };
    }
  }, [onPrintSuccess, onPrintError, showNotifications]);

  const getStationConfiguration = useCallback(() => {
    return printerWorkflowService.getStations();
  }, []);

  const isConfigured = useCallback(() => {
    const stations = printerWorkflowService.getStations();
    return stations.some(station => 
      station.isActive && station.printerNames.length > 0
    );
  }, []);

  return {
    printOrder,
    getStationConfiguration,
    isConfigured
  };
};
