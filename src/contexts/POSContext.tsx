import React, { createContext, useContext, useReducer } from 'react';
import { Transaction, CashDrawer } from '../types';
import { LocalProduct, LocalCustomer } from '../types/supabase';
import { transactionLocalService, customerLocalService } from '../lib/localDatabase';
import { supabase } from '../lib/supabase';
import { transactionService } from '../services/transactionService';
import { connectionStatus } from '../lib/supabase';
import { calculateTaxAmount, calculatePriceWithoutTax } from '../types/supabase';

interface POSState {
  currentTransaction: Partial<Transaction> | null;
  cart: Array<{
    product: LocalProduct;
    quantity: number;
    discount: number;
  }>;
  cashDrawer: CashDrawer | null;
  selectedCustomer: LocalCustomer | null;
}

interface POSContextType extends POSState {
  addToCart: (product: LocalProduct, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  applyDiscount: (productId: string, discount: number) => void;
  clearCart: () => void;
  selectCustomer: (customer: LocalCustomer | null) => void;
  openDrawer: (initialFloat: number) => void;
  closeDrawer: (finalCount: number) => void;
  processTransaction: (paymentData: any, onTransactionComplete?: () => void, globalDiscount?: { type: 'none' | 'percentage' | 'fixed'; value: number; amount: number }) => Promise<string>;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

type POSAction =
  | { type: 'ADD_TO_CART'; payload: { product: LocalProduct; quantity: number } }
  | { type: 'REMOVE_FROM_CART'; payload: string }
  | { type: 'UPDATE_QUANTITY'; payload: { productId: string; quantity: number } }
  | { type: 'APPLY_DISCOUNT'; payload: { productId: string; discount: number } }
  | { type: 'CLEAR_CART' }
  | { type: 'SELECT_CUSTOMER'; payload: LocalCustomer | null }
  | { type: 'OPEN_DRAWER'; payload: CashDrawer }
  | { type: 'CLOSE_DRAWER'; payload: { finalCount: number } };

const posReducer = (state: POSState, action: POSAction): POSState => {
  switch (action.type) {
    case 'ADD_TO_CART': {
      const existingItem = state.cart.find(item => item.product.id === action.payload.product.id);
      if (existingItem) {
        return {
          ...state,
          cart: state.cart.map(item =>
            item.product.id === action.payload.product.id
              ? { ...item, quantity: item.quantity + action.payload.quantity }
              : item
          )
        };
      }
      return {
        ...state,
        cart: [...state.cart, { product: action.payload.product, quantity: action.payload.quantity, discount: 0 }]
      };
    }
    case 'REMOVE_FROM_CART':
      return {
        ...state,
        cart: state.cart.filter(item => item.product.id !== action.payload)
      };
    case 'UPDATE_QUANTITY':
      return {
        ...state,
        cart: state.cart.map(item =>
          item.product.id === action.payload.productId
            ? { ...item, quantity: action.payload.quantity }
            : item
        )
      };
    case 'APPLY_DISCOUNT':
      return {
        ...state,
        cart: state.cart.map(item =>
          item.product.id === action.payload.productId
            ? { ...item, discount: action.payload.discount }
            : item
        )
      };
    case 'CLEAR_CART':
      return { ...state, cart: [], selectedCustomer: null };
    case 'SELECT_CUSTOMER':
      return { ...state, selectedCustomer: action.payload };
    case 'OPEN_DRAWER':
      return { ...state, cashDrawer: action.payload };
    case 'CLOSE_DRAWER':
      return {
        ...state,
        cashDrawer: state.cashDrawer ? {
          ...state.cashDrawer,
          closeTime: new Date().toISOString(),
          finalCount: action.payload.finalCount,
          status: 'closed'
        } : null
      };
    default:
      return state;
  }
};

export const POSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(posReducer, {
    currentTransaction: null,
    cart: [],
    cashDrawer: null,
    selectedCustomer: null
  });

  const addToCart = (product: LocalProduct, quantity = 1) => {
    dispatch({ type: 'ADD_TO_CART', payload: { product, quantity } });
  };

  const removeFromCart = (productId: string) => {
    dispatch({ type: 'REMOVE_FROM_CART', payload: productId });
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
    } else {
      dispatch({ type: 'UPDATE_QUANTITY', payload: { productId, quantity } });
    }
  };

  const applyDiscount = (productId: string, discount: number) => {
    dispatch({ type: 'APPLY_DISCOUNT', payload: { productId, discount } });
  };

  const clearCart = () => {
    dispatch({ type: 'CLEAR_CART' });
  };

  const selectCustomer = (customer: LocalCustomer | null) => {
    dispatch({ type: 'SELECT_CUSTOMER', payload: customer });
  };

  const openDrawer = (initialFloat: number) => {
    const drawer: CashDrawer = {
      id: `drawer-${Date.now()}`,
      employeeId: 'current-user',
      openTime: new Date().toISOString(),
      initialFloat,
      denominations: [],
      status: 'open'
    };
    dispatch({ type: 'OPEN_DRAWER', payload: drawer });
  };

  const closeDrawer = (finalCount: number) => {
    dispatch({ type: 'CLOSE_DRAWER', payload: { finalCount } });
  };

  const processTransaction = async (paymentData: {
    paymentMethod: 'cash' | 'card' | 'mixed';
    amountPaid?: number;
    employeeId: string;
    employeeName: string;
    employeeNumber?: string;
  }, onTransactionComplete?: () => void, globalDiscount?: { type: 'none' | 'percentage' | 'fixed'; value: number; amount: number }): Promise<string> => {
    try {
      // Calculate transaction totals
      // Subtotal should be the original amount before ANY discounts (individual or global)
      const originalSubtotal = state.cart.reduce((sum, item) => {
        const itemTotal = item.product.price * item.quantity;
        return sum + itemTotal;
      }, 0);

      // Calculate after individual item discounts but before global discount
      const subtotalAfterItemDiscounts = state.cart.reduce((sum, item) => {
        const itemTotal = item.product.price * item.quantity;
        const discountAmount = (itemTotal * item.discount) / 100;
        return sum + (itemTotal - discountAmount);
      }, 0);

      const totalTax = state.cart.reduce((sum, item) => {
        const itemTotal = item.product.price * item.quantity;
        const discountAmount = (itemTotal * item.discount) / 100;
        const discountedTotal = itemTotal - discountAmount;
        return sum + calculateTaxAmount(discountedTotal, item.product.iva_rate);
      }, 0);

      // Apply global discount to the subtotal after item discounts
      const globalDiscountAmount = globalDiscount?.amount || 0;
      const finalSubtotal = subtotalAfterItemDiscounts - globalDiscountAmount;
      const total = finalSubtotal;
      const changeGiven = paymentData.paymentMethod === 'cash' && paymentData.amountPaid ?
        Math.max(0, paymentData.amountPaid - total) : 0;

      // Generate transaction number (offline fallback)
      const transactionNumber = transactionLocalService.generateTransactionNumber();
      const now = new Date();
      const transactionDate = now.toISOString().split('T')[0];
      const transactionTime = now.toTimeString().split(' ')[0];

      // Total discount is the difference between original and final amounts
      const totalDiscountAmount = originalSubtotal - finalSubtotal;

      // Create transaction data
      const transactionData = {
        transaction_number: transactionNumber,
        employee_id: paymentData.employeeId,
        employee_name: paymentData.employeeName,
        customer_id: state.selectedCustomer?.id || null,
        customer_name: state.selectedCustomer?.name || null,
        transaction_date: transactionDate,
        transaction_time: transactionTime,
        subtotal: originalSubtotal,
        discount: totalDiscountAmount,
        discount_type: ((globalDiscount && globalDiscount.type !== 'none') ? globalDiscount.type : (state.cart.some(i => i.discount > 0) ? 'percentage' : 'none')) as 'none' | 'percentage' | 'fixed',
        discount_percentage: (globalDiscount && globalDiscount.type === 'percentage')
          ? Number(globalDiscount.value)
          : (state.cart.every(i => i.discount === state.cart[0]?.discount) ? Number(state.cart[0]?.discount || 0) : 0),
        tax: totalTax,
        total: total,
        payment_method: paymentData.paymentMethod,
        amount_paid: paymentData.amountPaid || null,
        change_given: changeGiven,
        status: 'completed' as const,
        notes: null,
        receipt_number: `REC-${transactionNumber}`,
        deleted_at: null,
      };

      // Create transaction items
      const transactionItems = state.cart.map(item => {
        const itemTotal = item.product.price * item.quantity;
        const discountAmount = (itemTotal * item.discount) / 100;
        const discountedTotal = itemTotal - discountAmount;
        const taxAmount = calculateTaxAmount(discountedTotal, item.product.iva_rate);
        const basePrice = calculatePriceWithoutTax(item.product.price, item.product.iva_rate);
        const profitAmount = (basePrice - item.product.cost) * item.quantity;

        return {
          product_id: item.product.id,
          product_name: item.product.name,
          product_sku: item.product.sku,
          category_id: item.product.category_id,
          category_name: item.product.category_name,
          quantity: item.quantity,
          unit_price: item.product.price,
          unit_cost: item.product.cost,
          iva_rate: item.product.iva_rate,
          line_total: discountedTotal,
          tax_amount: taxAmount,
          profit_amount: profitAmount,
          discount_amount: discountAmount,
          discount_percentage: item.discount,
          transaction_id: '', // Will be set by the service
          deleted_at: null,
        };
      });

      // Check if online and try server first
      const connectionState = connectionStatus.getStatus();
      let receiptNumber: string = transactionData.receipt_number;
      let localTransactionItems: any[] = [];

      if (connectionState.isOnline && connectionState.isSupabaseOnline) {
        try {
          console.log('POS: Processing transaction online...');
          console.log('POS: Transaction data:', transactionData);
          console.log('POS: Transaction items:', transactionItems);
          console.log('POS: Cart state:', state.cart);

          // Check if any products in the cart need to be synced first
          console.log('POS: Checking if products need syncing before transaction...');
          try {
            // Import the product sync service directly
            const { productSyncService } = await import('../services/productService');
            await productSyncService.fullSync();
            console.log('POS: Products synced successfully before transaction');
          } catch (syncError) {
            console.warn('POS: Product sync failed before transaction, continuing anyway:', syncError);
          }

          // Resolve canonical employee UUID by employee_number if provided
          let serverEmployeeId = paymentData.employeeId;
          if (paymentData.employeeNumber) {
            try {
              const { data: empRow } = await supabase
                .from('employees')
                .select('id')
                .eq('employee_number', paymentData.employeeNumber)
                .single();
              if (empRow?.id) serverEmployeeId = empRow.id;
            } catch { }
          }

          // Use resolved server employee id
          const serverTransactionData = { ...transactionData, employee_id: serverEmployeeId } as any;

          console.log('POS: Server transaction data:', serverTransactionData);

          // Try to process through server
          const result = await transactionService.createTransaction(serverTransactionData, transactionItems);
          const transactionId = result.transaction.id;
          receiptNumber = result.transaction.receipt_number || receiptNumber;

          console.log('POS: Transaction processed online successfully');
          console.log('POS: Server result:', result);
        } catch (error) {
          console.warn('POS: Server transaction failed, falling back to offline:', error);

          // Fallback to offline processing - create proper LocalTransactionItem objects
          localTransactionItems = transactionItems.map(item => ({
            ...item,
            id: '', // Will be set by the service
            created_at: new Date(),
            updated_at: new Date(),
            last_synced_at: null,
            needs_push: true,
            is_conflicted: false,
          }));

          const transactionId = await transactionLocalService.createTransaction(transactionData, localTransactionItems);
        }
      } else {
        console.log('POS: Processing transaction offline...');
        console.log('POS: Offline transaction data:', transactionData);
        console.log('POS: Offline transaction items:', transactionItems);

        // Process offline - create proper LocalTransactionItem objects
        localTransactionItems = transactionItems.map(item => ({
          ...item,
          id: '', // Will be set by the service
          created_at: new Date(),
          updated_at: new Date(),
          last_synced_at: null,
          needs_push: true,
          is_conflicted: false,
        }));

        const transactionId = await transactionLocalService.createTransaction(transactionData, localTransactionItems);
      }

      // Update product stock levels locally - use transactionItems for online, localTransactionItems for offline
      const itemsForStockUpdate = connectionState.isOnline && connectionState.isSupabaseOnline ? transactionItems : localTransactionItems;
      await transactionLocalService.updateProductStock(itemsForStockUpdate);

      // Update customer totals if customer selected
      if (state.selectedCustomer) {
        await customerLocalService.updateCustomer(state.selectedCustomer.id, {
          total_spent: (state.selectedCustomer.total_spent || 0) + total,
          transaction_count: (state.selectedCustomer.transaction_count || 0) + 1,
        });
      }

      // Clear cart and reset discount after successful transaction
      clearCart();

      // Call the completion callback to reset discount in POS
      if (onTransactionComplete) {
        onTransactionComplete();
      }

      console.log(`POS: Transaction ${transactionNumber} processed successfully`);
      return receiptNumber;

    } catch (error) {
      console.error('POS: Transaction processing failed:', error);
      throw new Error(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <POSContext.Provider value={{
      ...state,
      addToCart,
      removeFromCart,
      updateQuantity,
      applyDiscount,
      clearCart,
      selectCustomer,
      openDrawer,
      closeDrawer,
      processTransaction
    }}>
      {children}
    </POSContext.Provider>
  );
};

export const usePOS = () => {
  const context = useContext(POSContext);
  if (context === undefined) {
    throw new Error('usePOS must be used within a POSProvider');
  }
  return context;
};