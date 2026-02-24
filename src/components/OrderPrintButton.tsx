import React from 'react';
import { Printer, CheckCircle, AlertTriangle } from 'lucide-react';
import { useOrderPrinting } from '../hooks/useOrderPrinting';

interface OrderPrintButtonProps {
  order: {
    id: string;
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
    employee?: {
      id: string;
      name: string;
    };
  };
  disabled?: boolean;
  className?: string;
  onPrintComplete?: () => void;
}

const OrderPrintButton: React.FC<OrderPrintButtonProps> = ({
  order,
  disabled = false,
  className = '',
  onPrintComplete
}) => {
  const [isPrinting, setIsPrinting] = React.useState(false);
  const [lastPrintResult, setLastPrintResult] = React.useState<{
    success: boolean;
    message: string;
    timestamp: Date;
  } | null>(null);

  const { printOrder, isConfigured } = useOrderPrinting({
    onPrintSuccess: (results) => {
      const totalJobs = results.reduce((sum, station) => sum + station.jobs.length, 0);
      const successfulJobs = results.reduce((sum, station) => 
        sum + station.jobs.filter(job => job.success).length, 0
      );

      setLastPrintResult({
        success: successfulJobs === totalJobs && totalJobs > 0,
        message: totalJobs === 0 
          ? 'No printers configured'
          : successfulJobs === totalJobs 
            ? `Printed to all ${totalJobs} printer(s)`
            : `Printed to ${successfulJobs}/${totalJobs} printer(s)`,
        timestamp: new Date()
      });

      if (onPrintComplete) {
        onPrintComplete();
      }
    },
    onPrintError: (error) => {
      setLastPrintResult({
        success: false,
        message: error.message,
        timestamp: new Date()
      });
    }
  });

  const handlePrint = async () => {
    setIsPrinting(true);
    setLastPrintResult(null);

    try {
      await printOrder({
        orderId: order.id,
        items: order.items,
        customer: order.customer,
        total: order.total,
        employeeId: order.employee?.id,
        employeeName: order.employee?.name
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const configured = isConfigured();
  const buttonDisabled = disabled || isPrinting || !configured;

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handlePrint}
        disabled={buttonDisabled}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors
          ${buttonDisabled
            ? 'bg-gray-300 text-gray-50 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
          }
          ${className}
        `}
        title={!configured ? 'No printer stations configured' : undefined}
      >
        <Printer className={`h-4 w-4 ${isPrinting ? 'animate-pulse' : ''}`} />
        {isPrinting ? 'Printing...' : 'Print Order'}
      </button>

      {/* Print Status */}
      {lastPrintResult && (
        <div className={`
          flex items-center gap-1 text-xs px-2 py-1 rounded
          ${lastPrintResult.success 
            ? 'bg-green-100 text-green-700' 
            : 'bg-red-100 text-red-700'
          }
        `}>
          {lastPrintResult.success ? (
            <CheckCircle className="h-3 w-3" />
          ) : (
            <AlertTriangle className="h-3 w-3" />
          )}
          <span>{lastPrintResult.message}</span>
        </div>
      )}

      {!configured && (
        <div className="text-xs text-yellow-600 text-center">
          Configure printer stations first
        </div>
      )}
    </div>
  );
};

export default OrderPrintButton;
