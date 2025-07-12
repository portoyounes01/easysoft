// Legacy Employee interfaces removed – use types from src/types/supabase.ts instead.

export interface Product {
  id: string;
  name: string;
  description: string;
  sku: string;
  barcode?: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  imageUrl?: string;
  isActive: boolean;
  taxRate: number;
  supplier?: string;
  location?: string;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  parentId?: string;
  color: string;
  icon: string;
}

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