// Legacy interfaces – use types from src/types/supabase.ts instead for employees, products, and categories.

// Re-export commonly used types from supabase.ts for backward compatibility
export type {
  Product,
  Category,
  ProductRow,
  CategoryRow,
  LocalProduct,
  LocalCategory,
  ProductFormData,
  CategoryFormData,
  ProductFilters,
  CategoryFilters,
  IVA_RATES,
  IVARate
} from './supabase';

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  taxId?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  discountLevel: number;
  totalPurchases: number;
  totalOrders: number;
  lastPurchase?: string;
}

export interface Transaction {
  id: string;
  receiptNumber: string;
  employeeId: string;
  customerId?: string;
  items: TransactionItem[];
  subtotal: number;
  discounts: Discount[];
  taxAmount: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'mixed';
  cashAmount?: number;
  cardAmount?: number;
  changeGiven?: number;
  status: 'completed' | 'pending' | 'cancelled' | 'refunded';
  timestamp: string;
  notes?: string;
}

export interface TransactionItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface Discount {
  type: 'percentage' | 'fixed' | 'mobile' | 'voucher';
  value: number;
  code?: string;
  description: string;
}

export interface CashDrawer {
  id: string;
  employeeId: string;
  openTime: string;
  closeTime?: string;
  initialFloat: number;
  finalCount?: number;
  expectedAmount?: number;
  difference?: number;
  denominations: CashDenomination[];
  status: 'open' | 'closed';
}

export interface CashDenomination {
  value: number;
  count: number;
  total: number;
}

export interface Report {
  id: string;
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  dateRange: {
    start: string;
    end: string;
  };
  data: any;
  generatedBy: string;
  generatedAt: string;
}