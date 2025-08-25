// Simplified Printer Workflow Types - Product-based routing only
export interface PrinterCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  availableIn: 'pos' | 'web' | 'both'; // Where this category can be used
  color: string;
}

export interface PrinterStation {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  printerNames: string[]; // Multiple printers can serve one station
  isActive: boolean;
  printTemplate: 'receipt' | 'kitchen' | 'bar' | 'administrative';
  // Simple product-based routing only
  productIds: string[]; // Which specific product IDs route to this station
}

export interface PrintJob {
  id: string;
  orderId: string;
  stationId: string;
  printerName: string;
  template: string;
  data: any;
  status: 'pending' | 'printing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface OrderPrintRequest {
  orderId: string;
  orderData: {
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      price: number;
      categoryId: string;
      categoryName: string;
      notes?: string;
      // Simple product identification
      productId?: string;
      sku?: string;
    }>;
    customer?: string;
    total: number;
    date: Date;
    employeeId?: string;
    employeeName?: string;
  };
}

export interface PrintJobResult {
  stationId: string;
  stationName: string;
  jobs: Array<{
    printerName: string;
    success: boolean;
    jobId?: string;
    error?: string;
  }>;
}

// Default printer categories
export const DEFAULT_PRINTER_CATEGORIES: PrinterCategory[] = [
  {
    id: 'receipt',
    name: 'Receipt Printers',
    description: 'Customer receipts and invoices',
    icon: 'receipt',
    availableIn: 'pos',
    color: 'from-blue-500 to-blue-600'
  },
  {
    id: 'kitchen-hot',
    name: 'Hot Kitchen',
    description: 'Hot food preparation station',
    icon: 'chef-hat',
    availableIn: 'pos',
    color: 'from-red-500 to-red-600'
  },
  {
    id: 'kitchen-cold',
    name: 'Cold Kitchen',
    description: 'Cold food and salad station',
    icon: 'snowflake',
    availableIn: 'pos',
    color: 'from-cyan-500 to-cyan-600'
  },
  {
    id: 'kitchen-grill',
    name: 'Grill Station',
    description: 'Grilled items and barbecue',
    icon: 'flame',
    availableIn: 'pos',
    color: 'from-orange-500 to-orange-600'
  },
  {
    id: 'kitchen-pastry',
    name: 'Pastry Station',
    description: 'Bakery and dessert preparation',
    icon: 'cake',
    availableIn: 'pos',
    color: 'from-pink-500 to-pink-600'
  },
  {
    id: 'bar',
    name: 'Bar/Beverage Station',
    description: 'Drinks and beverages',
    icon: 'coffee',
    availableIn: 'pos',
    color: 'from-amber-500 to-amber-600'
  },
  {
    id: 'administrative',
    name: 'Administrative',
    description: 'Reports, inventory, and management documents',
    icon: 'file-text',
    availableIn: 'web',
    color: 'from-gray-500 to-gray-600'
  }
];
