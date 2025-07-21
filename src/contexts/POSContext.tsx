import React, { createContext, useContext, useReducer } from 'react';
import { Product, Transaction, Customer, CashDrawer } from '../types';
import { LocalProduct } from '../types/supabase';

interface POSState {
  currentTransaction: Partial<Transaction> | null;
  cart: Array<{
    product: LocalProduct;
    quantity: number;
    discount: number;
  }>;
  cashDrawer: CashDrawer | null;
  selectedCustomer: Customer | null;
}

interface POSContextType extends POSState {
  addToCart: (product: LocalProduct, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  applyDiscount: (productId: string, discount: number) => void;
  clearCart: () => void;
  selectCustomer: (customer: Customer | null) => void;
  openDrawer: (initialFloat: number) => void;
  closeDrawer: (finalCount: number) => void;
  processTransaction: (paymentData: any) => Promise<string>;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

type POSAction =
  | { type: 'ADD_TO_CART'; payload: { product: LocalProduct; quantity: number } }
  | { type: 'REMOVE_FROM_CART'; payload: string }
  | { type: 'UPDATE_QUANTITY'; payload: { productId: string; quantity: number } }
  | { type: 'APPLY_DISCOUNT'; payload: { productId: string; discount: number } }
  | { type: 'CLEAR_CART' }
  | { type: 'SELECT_CUSTOMER'; payload: Customer | null }
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

  const selectCustomer = (customer: Customer | null) => {
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

  const processTransaction = async (paymentData: any): Promise<string> => {
    // Simulate transaction processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    const receiptNumber = `REC-${Date.now()}`;
    clearCart();
    return receiptNumber;
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