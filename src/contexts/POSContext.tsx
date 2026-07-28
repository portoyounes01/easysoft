import React, { createContext, useCallback, useContext, useReducer, useRef } from 'react';
import i18n from '../i18n';
import { Transaction, CashDrawer } from '../types';
import { LocalProduct, LocalCustomer } from '../types/supabase';
import { transactionLocalService, customerLocalService } from '../lib/localDatabase';
import { recipeService } from '../services/recipeService';
import { supabase } from '../lib/supabase';
import { transactionService } from '../services/transactionService';
import { connectionStatus } from '../lib/supabase';
import { calculateTaxAmount, calculatePriceWithoutTax } from '../types/supabase';
import type { SystemSettings, DeepPartial } from './SettingsContext';
import { runFiscalCheckout, type FiscalCheckoutResult, type FiscalCartLine } from '../fiscal/checkoutOrchestrator';
import { runNonFiscalFallbackSale, type NonFiscalFallbackDecision } from '../fiscal/nonFiscalFallback';
import { classifyFiscalIssueFailure } from '../fiscal/fiscalFailure';
import { localTransactionToServerInsert, localTransactionItemsToServerInsert } from '../fiscal/pushServer';

/** Options chosen in the POS item-options dialog for one cart line. */
export interface CartLineOptions {
  /** One selected option per enabled variant attribute (e.g. Size -> Large). */
  selections: { attribute: string; option: string; priceDelta: number }[];
  /** Chosen priced add-ons (enabled modifiers). */
  addOns: { name: string; priceDelta: number }[];
  notes: string | null;
  /** Per-unit sum of selection + add-on deltas (folded into the unit price). */
  priceDelta: number;
}

export interface CartLine {
  /** Line identity. Unit products use product.id (same-product taps merge);
   *  weighed products get a unique id per weighing (separate lines);
   *  optioned products share a line per identical option combination. */
  lineId: string;
  product: LocalProduct;
  /** Units for unit products; kg (3 decimals) for weighed products. */
  quantity: number;
  discount: number;
  options?: CartLineOptions;
}

/** Per-unit price of a cart line: product price + selected option deltas. */
export function cartLineUnitPrice(line: CartLine): number {
  return line.product.price + (line.options?.priceDelta ?? 0);
}

/** Compact "Large, Extra Cheese" summary for receipts and the cart panel. */
export function cartLineOptionsSummary(options: CartLineOptions): string {
  return [...options.selections.map(sel => sel.option), ...options.addOns.map(a => a.name)].join(', ');
}

/** The mutable table-order session currently loaded into the POS cart. */
export interface ActiveTableOrder {
  id: string;
  tableId: string;
  tableName: string;
}

interface POSState {
  currentTransaction: Partial<Transaction> | null;
  cart: CartLine[];
  cashDrawer: CashDrawer | null;
  selectedCustomer: LocalCustomer | null;
  activeTableOrder: ActiveTableOrder | null;
}

interface POSContextType extends POSState {
  addToCart: (product: LocalProduct, quantity?: number) => void;
  addOptionedToCart: (product: LocalProduct, quantity: number, options: CartLineOptions) => void;
  /** Adds one weighed line (kg). Never merges with existing lines. */
  addWeighedToCart: (product: LocalProduct, weightKg: number) => void;
  removeFromCart: (lineId: string) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  applyDiscount: (lineId: string, discount: number) => void;
  clearCart: () => void;
  /** Replaces the live cart from a saved, non-fiscal table order snapshot. */
  restoreCart: (cart: CartLine[], customer: LocalCustomer | null) => void;
  setActiveTableOrder: (order: ActiveTableOrder) => void;
  clearActiveTableOrder: () => void;
  selectCustomer: (customer: LocalCustomer | null) => void;
  openDrawer: (initialFloat: number) => void;
  closeDrawer: (finalCount: number) => void;
  processTransaction: (
    paymentData: {
      paymentMethod: 'cash' | 'card' | 'mixed';
      amountPaid?: number;
      employeeId: string;
      employeeName: string;
      employeeNumber?: string;
    },
    onTransactionComplete?: () => void,
    globalDiscount?: { type: 'none' | 'percentage' | 'fixed'; value: number; amount: number },
    fiscalContext?: {
      settings: SystemSettings;
      updateSettings: (patch: DeepPartial<SystemSettings>) => void;
    },
    loyaltyContext?: {
      enabled: boolean;
      pointsPerEuroEarned: number;
      pointsRedeemed?: number;
      customerId?: string;
    },
    overrides?: {
      cart: FiscalCartLine[];
      customer: LocalCustomer | null;
    },
    lifecycle?: {
      /** Runs immediately after the fiscal document is durably persisted. */
      onFiscalDocumentPersisted?: (fiscal: FiscalCheckoutResult) => void | Promise<void>;
    },
    /**
     * Present only on the operator-confirmed retry after a fiscal issuance
     * failed: complete this sale on a non-fiscal slip instead of a fatura.
     * Skips the fiscal issuer entirely rather than re-attempting it — a second
     * attempt could succeed after the operator already committed to writing the
     * paper invoice, leaving the sale with two legal documents.
     */
    nonFiscalFallback?: NonFiscalFallbackDecision
  ) => Promise<{ receiptNumber: string; transactionId?: string; fiscal?: FiscalCheckoutResult }>;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

type POSAction =
  | { type: 'ADD_TO_CART'; payload: { product: LocalProduct; quantity: number; lineId: string; merge: boolean; options?: CartLineOptions } }
  | { type: 'REMOVE_FROM_CART'; payload: string }
  | { type: 'UPDATE_QUANTITY'; payload: { lineId: string; quantity: number } }
  | { type: 'APPLY_DISCOUNT'; payload: { lineId: string; discount: number } }
  | { type: 'CLEAR_CART' }
  | { type: 'RESTORE_CART'; payload: { cart: CartLine[]; customer: LocalCustomer | null } }
  | { type: 'SET_ACTIVE_TABLE_ORDER'; payload: ActiveTableOrder | null }
  | { type: 'SELECT_CUSTOMER'; payload: LocalCustomer | null }
  | { type: 'OPEN_DRAWER'; payload: CashDrawer }
  | { type: 'CLOSE_DRAWER'; payload: { finalCount: number } };

const posReducer = (state: POSState, action: POSAction): POSState => {
  switch (action.type) {
    case 'ADD_TO_CART': {
      const { product, quantity, lineId, merge, options } = action.payload;
      const existingItem = merge ? state.cart.find(item => item.lineId === lineId) : undefined;
      if (existingItem) {
        return {
          ...state,
          cart: state.cart.map(item =>
            item.lineId === lineId
              ? { ...item, quantity: item.quantity + quantity }
              : item
          )
        };
      }
      return {
        ...state,
        cart: [...state.cart, { lineId, product, quantity, discount: 0, ...(options ? { options } : {}) }]
      };
    }
    case 'REMOVE_FROM_CART':
      return {
        ...state,
        cart: state.cart.filter(item => item.lineId !== action.payload)
      };
    case 'UPDATE_QUANTITY':
      return {
        ...state,
        cart: state.cart.map(item =>
          item.lineId === action.payload.lineId
            ? { ...item, quantity: action.payload.quantity }
            : item
        )
      };
    case 'APPLY_DISCOUNT': {
      const clamped = Math.min(100, Math.max(0, action.payload.discount));
      return {
        ...state,
        cart: state.cart.map(item =>
          item.lineId === action.payload.lineId
            ? { ...item, discount: clamped }
            : item
        )
      };
    }
    case 'CLEAR_CART':
      return { ...state, cart: [], selectedCustomer: null };
    case 'RESTORE_CART':
      return {
        ...state,
        // Copy every line so the live cart cannot mutate a saved table-order
        // snapshot by reference. Weighed lines retain their distinct lineId.
        cart: action.payload.cart.map(item => ({ ...item, product: { ...item.product } })),
        selectedCustomer: action.payload.customer ? { ...action.payload.customer } : null,
      };
    case 'SET_ACTIVE_TABLE_ORDER':
      return { ...state, activeTableOrder: action.payload };
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
    selectedCustomer: null,
    activeTableOrder: null,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  /** Applies reducer to ref synchronously so async handlers see updates in the same tick as batched dispatches. */
  const dispatchPos = useCallback((action: POSAction) => {
    stateRef.current = posReducer(stateRef.current, action);
    dispatch(action);
  }, [dispatch]);

  const addToCart = (product: LocalProduct, quantity = 1) => {
    // Unit products keep the historical merge-by-product semantics.
    dispatchPos({ type: 'ADD_TO_CART', payload: { product, quantity, lineId: product.id, merge: true } });
  };

  const addOptionedToCart = (product: LocalProduct, quantity: number, options: CartLineOptions) => {
    // Identical option combinations merge into one line; the signature is
    // order-stable because the dialog emits selections/add-ons in config order.
    const signature = JSON.stringify({
      s: options.selections.map(sel => sel.option),
      a: options.addOns.map(a => a.name),
      n: options.notes,
    });
    let hash = 0;
    for (let i = 0; i < signature.length; i++) hash = (hash * 31 + signature.charCodeAt(i)) | 0;
    const lineId = `${product.id}::opt${hash}`;
    dispatchPos({ type: 'ADD_TO_CART', payload: { product, quantity, lineId, merge: true, options } });
  };

  const weighedLineSeq = useRef(0);
  const addWeighedToCart = (product: LocalProduct, weightKg: number) => {
    if (!(weightKg > 0)) return;
    weighedLineSeq.current += 1;
    const lineId = `${product.id}::w${Date.now()}-${weighedLineSeq.current}`;
    dispatchPos({ type: 'ADD_TO_CART', payload: { product, quantity: weightKg, lineId, merge: false } });
  };

  const removeFromCart = (lineId: string) => {
    dispatchPos({ type: 'REMOVE_FROM_CART', payload: lineId });
  };

  const updateQuantity = (lineId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(lineId);
    } else {
      dispatchPos({ type: 'UPDATE_QUANTITY', payload: { lineId, quantity } });
    }
  };

  const applyDiscount = (lineId: string, discount: number) => {
    dispatchPos({ type: 'APPLY_DISCOUNT', payload: { lineId, discount } });
  };

  const clearCart = () => {
    dispatchPos({ type: 'CLEAR_CART' });
  };

  const restoreCart = useCallback((cart: CartLine[], customer: LocalCustomer | null) => {
    dispatchPos({ type: 'RESTORE_CART', payload: { cart, customer } });
  }, [dispatchPos]);

  const setActiveTableOrder = useCallback((order: ActiveTableOrder) => {
    dispatchPos({ type: 'SET_ACTIVE_TABLE_ORDER', payload: order });
  }, [dispatchPos]);

  const clearActiveTableOrder = useCallback(() => {
    dispatchPos({ type: 'SET_ACTIVE_TABLE_ORDER', payload: null });
  }, [dispatchPos]);

  const selectCustomer = (customer: LocalCustomer | null) => {
    dispatchPos({ type: 'SELECT_CUSTOMER', payload: customer });
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
    dispatchPos({ type: 'OPEN_DRAWER', payload: drawer });
  };

  const closeDrawer = (finalCount: number) => {
    dispatchPos({ type: 'CLOSE_DRAWER', payload: { finalCount } });
  };

  const processTransaction = async (
    paymentData: {
      paymentMethod: 'cash' | 'card' | 'mixed';
      amountPaid?: number;
      employeeId: string;
      employeeName: string;
      employeeNumber?: string;
    },
    onTransactionComplete?: () => void,
    globalDiscount?: { type: 'none' | 'percentage' | 'fixed'; value: number; amount: number },
    fiscalContext?: {
      settings: SystemSettings;
      updateSettings: (patch: DeepPartial<SystemSettings>) => void;
    },
    loyaltyContext?: {
      enabled: boolean;
      pointsPerEuroEarned: number;
      pointsRedeemed?: number;
      customerId?: string;
    },
    overrides?: {
      cart: FiscalCartLine[];
      customer: LocalCustomer | null;
    },
    lifecycle?: {
      onFiscalDocumentPersisted?: (fiscal: FiscalCheckoutResult) => void | Promise<void>;
    },
    nonFiscalFallback?: NonFiscalFallbackDecision
  ): Promise<{ receiptNumber: string; transactionId?: string; fiscal?: FiscalCheckoutResult }> => {
    try {
      if (fiscalContext) {
        // A custom invoice supplies its own line items (synthetic products) and
        // customer instead of using the live POS cart/selection.
        const cartForSale: FiscalCartLine[] = overrides
          ? overrides.cart
          : stateRef.current.cart.map(ci => ({
              // Optioned lines snapshot the product with the deltas folded into
              // the price and the selection appended to the name, so every
              // fiscal issuer (AT chain, Vendus, fiskaly…) prices and prints
              // the configured item without knowing about options.
              product: ci.options
                ? {
                    ...ci.product,
                    price: cartLineUnitPrice(ci),
                    name: `${ci.product.name} (${cartLineOptionsSummary(ci.options)})`,
                  }
                : ci.product,
              quantity: ci.quantity,
              discount: ci.discount,
            }));
        const customerSnapshot = overrides ? overrides.customer : stateRef.current.selectedCustomer;
        const fiscalRes = nonFiscalFallback
          ? await runNonFiscalFallbackSale({
              settings: fiscalContext.settings,
              cart: cartForSale,
              selectedCustomer: customerSnapshot,
              payment: paymentData,
              globalDiscount,
              decision: nonFiscalFallback,
            })
          : await runFiscalCheckout({
              settings: fiscalContext.settings,
              cart: cartForSale,
              selectedCustomer: customerSnapshot,
              payment: paymentData,
              globalDiscount,
            });

        // Consumers that carry non-fiscal workflow state (for example a
        // restaurant table) can lock it down as soon as the immutable
        // fiscal document exists, before any best-effort stock/sync work.
        await lifecycle?.onFiscalDocumentPersisted?.(fiscalRes);

        // A non-fiscal slip took no number from any série, so the counter must
        // not move: advancing it here would reserve a fatura number against a
        // document that does not exist and never will.
        if (!fiscalRes.nonFiscal && (fiscalRes.invoiceTypeSaft === 'FS' || fiscalRes.invoiceTypeSaft === 'FT')) {
          fiscalContext.updateSettings({
            receipt: {
              seriesProfiles: {
                [fiscalRes.invoiceTypeSaft]: {
                  lastSeriesKey: fiscalRes.seriesKey,
                  currentNumber: fiscalRes.sequentialNumber,
                },
              },
            },
          });
        }

        const loaded = await transactionLocalService.getTransactionById(fiscalRes.transactionId);
        if (loaded?.items?.length) {
          await transactionLocalService.updateProductStock(loaded.items);
          // Fiche technique: deduct raw-material stock for any sold product that
          // has a recipe (products without one are untouched here). Best-effort —
          // the sale is already committed, so an inventory hiccup must not throw.
          try {
            await recipeService.deductForSoldItems(
              loaded.items.map(item => ({ product_id: item.product_id, quantity: item.quantity }))
            );
          } catch (deductError) {
            console.error('POS: raw-material deduction failed after sale', deductError);
          }
        }

        const connectionState = connectionStatus.getStatus();
        if (connectionState.isOnline && connectionState.isSupabaseOnline && loaded) {
          try {
            try {
              const { productSyncService } = await import('../services/productService');
              await productSyncService.fullSync();
            } catch (syncError) {
              console.warn('POS: Product sync failed before server push:', syncError);
            }

            let serverEmployeeId = paymentData.employeeId;
            if (paymentData.employeeNumber) {
              try {
                const { data: empRow } = await supabase
                  .from('employees')
                  .select('id')
                  .eq('employee_number', paymentData.employeeNumber)
                  .single();
                if (empRow?.id) serverEmployeeId = empRow.id;
              } catch {
                /* keep cashier id */
              }
            }

            const dataIns = localTransactionToServerInsert(loaded, serverEmployeeId);
            const itemsIns = localTransactionItemsToServerInsert(loaded.items);
            await transactionService.createTransaction(dataIns, itemsIns);
            await transactionLocalService.markTransactionSyncedFromServer(fiscalRes.transactionId);
          } catch (error) {
            console.warn('POS: Server push after fiscal checkout failed', error);
          }
        }

        // Loyalty only applies to a real, persisted POS customer — skip it for
        // custom invoices, whose customer (if any) is an ephemeral NIF holder.
        const customerAfterFiscal = overrides ? null : stateRef.current.selectedCustomer;
        if (customerAfterFiscal) {
          const pointsRedeemed =
            loyaltyContext?.customerId === customerAfterFiscal.id
              ? Math.max(0, loyaltyContext.pointsRedeemed || 0)
              : 0;
          const pointsEarned = loyaltyContext?.enabled
            ? Math.floor(Math.max(0, fiscalRes.grossTotal) * loyaltyContext.pointsPerEuroEarned)
            : 0;
          await customerLocalService.updateCustomer(customerAfterFiscal.id, {
            total_spent: (customerAfterFiscal.total_spent || 0) + fiscalRes.grossTotal,
            transaction_count: (customerAfterFiscal.transaction_count || 0) + 1,
            loyalty_points: Math.max(
              0,
              (customerAfterFiscal.loyalty_points || 0) - pointsRedeemed + pointsEarned
            ),
          });
        }

        // Don't wipe the live POS cart when issuing a custom invoice from elsewhere.
        if (!overrides) clearCart();
        onTransactionComplete?.();

        return {
          receiptNumber: fiscalRes.invoiceNo,
          transactionId: fiscalRes.transactionId,
          fiscal: fiscalRes,
        };
      }

      // Calculate transaction totals
      // Subtotal should be the original amount before ANY discounts (individual or global)
      const originalSubtotal = stateRef.current.cart.reduce((sum, item) => {
        const itemTotal = cartLineUnitPrice(item) * item.quantity;
        return sum + itemTotal;
      }, 0);

      // Calculate after individual item discounts but before global discount
      const subtotalAfterItemDiscounts = stateRef.current.cart.reduce((sum, item) => {
        const itemTotal = cartLineUnitPrice(item) * item.quantity;
        const discountAmount = (itemTotal * item.discount) / 100;
        return sum + (itemTotal - discountAmount);
      }, 0);

      const totalTax = stateRef.current.cart.reduce((sum, item) => {
        const itemTotal = cartLineUnitPrice(item) * item.quantity;
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
        customer_id: stateRef.current.selectedCustomer?.id || null,
        customer_name: stateRef.current.selectedCustomer?.name || null,
        transaction_date: transactionDate,
        transaction_time: transactionTime,
        subtotal: originalSubtotal,
        discount: totalDiscountAmount,
        discount_type: ((globalDiscount && globalDiscount.type !== 'none') ? globalDiscount.type : (stateRef.current.cart.some(i => i.discount > 0) ? 'percentage' : 'none')) as 'none' | 'percentage' | 'fixed',
        discount_percentage: (globalDiscount && globalDiscount.type === 'percentage')
          ? Number(globalDiscount.value)
          : (stateRef.current.cart.every(i => i.discount === stateRef.current.cart[0]?.discount) ? Number(stateRef.current.cart[0]?.discount || 0) : 0),
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
      const transactionItems = stateRef.current.cart.map(item => {
        const unitPrice = cartLineUnitPrice(item);
        const itemTotal = unitPrice * item.quantity;
        const discountAmount = (itemTotal * item.discount) / 100;
        const discountedTotal = itemTotal - discountAmount;
        const taxAmount = calculateTaxAmount(discountedTotal, item.product.iva_rate);
        const basePrice = calculatePriceWithoutTax(unitPrice, item.product.iva_rate);
        const profitAmount = (basePrice - item.product.cost) * item.quantity;

        return {
          product_id: item.product.id,
          product_name: item.options ? `${item.product.name} (${cartLineOptionsSummary(item.options)})` : item.product.name,
          product_sku: item.product.sku,
          category_id: item.product.category_id,
          category_name: item.product.category_name,
          quantity: item.quantity,
          unit: item.product.sold_by_weight ? ('kg' as const) : ('un' as const),
          unit_price: unitPrice,
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
      let completedTransactionId: string | undefined;
      let localTransactionItems: any[] = [];

      if (connectionState.isOnline && connectionState.isSupabaseOnline) {
        try {
          console.log('POS: Processing transaction online...');
          console.log('POS: Transaction data:', transactionData);
          console.log('POS: Transaction items:', transactionItems);
          console.log('POS: Cart state:', stateRef.current.cart);

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
          completedTransactionId = result.transaction.id;
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

          completedTransactionId = await transactionLocalService.createTransaction(transactionData, localTransactionItems);
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

        completedTransactionId = await transactionLocalService.createTransaction(transactionData, localTransactionItems);
      }

      // Update product stock levels locally - use transactionItems for online, localTransactionItems for offline
      const itemsForStockUpdate = connectionState.isOnline && connectionState.isSupabaseOnline ? transactionItems : localTransactionItems;
      await transactionLocalService.updateProductStock(itemsForStockUpdate);
      try {
        await recipeService.deductForSoldItems(
          itemsForStockUpdate.map(item => ({ product_id: item.product_id, quantity: item.quantity }))
        );
      } catch (deductError) {
        console.error('POS: raw-material deduction failed after sale', deductError);
      }

      // Update customer totals if customer selected
      const customerForTotals = stateRef.current.selectedCustomer;
      if (customerForTotals) {
        const pointsRedeemed =
          loyaltyContext?.customerId === customerForTotals.id
            ? Math.max(0, loyaltyContext.pointsRedeemed || 0)
            : 0;
        const pointsEarned = loyaltyContext?.enabled
          ? Math.floor(Math.max(0, total) * loyaltyContext.pointsPerEuroEarned)
          : 0;
        await customerLocalService.updateCustomer(customerForTotals.id, {
          total_spent: (customerForTotals.total_spent || 0) + total,
          transaction_count: (customerForTotals.transaction_count || 0) + 1,
          loyalty_points: Math.max(
            0,
            (customerForTotals.loyalty_points || 0) - pointsRedeemed + pointsEarned
          ),
        });
      }

      // Clear cart and reset discount after successful transaction
      clearCart();

      // Call the completion callback to reset discount in POS
      if (onTransactionComplete) {
        onTransactionComplete();
      }

      console.log(`POS: Transaction ${transactionNumber} processed successfully`);
      return { receiptNumber, transactionId: completedTransactionId };

    } catch (error) {
      console.error('POS: Transaction processing failed:', error);
      // A classified fiscal failure must reach the caller INTACT. Wrapping it in
      // a plain Error erases the type, and the POS page then cannot tell an
      // outage from a config fault — so the non-fiscal fallback is never
      // offered and the operator just sees "Transaction failed: …".
      if (classifyFiscalIssueFailure(error)) {
        throw error;
      }
      throw new Error(i18n.t('pos.transactionFailed', { error: error instanceof Error ? error.message : i18n.t('common.unknownError') }));
    }
  };

  return (
    <POSContext.Provider value={{
      ...state,
      addToCart,
      addOptionedToCart,
      addWeighedToCart,
      removeFromCart,
      updateQuantity,
      applyDiscount,
      clearCart,
      restoreCart,
      setActiveTableOrder,
      clearActiveTableOrder,
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
