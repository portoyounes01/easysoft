import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateQRCodeImage } from '../utils/qrCode';
import {
  Grid,
  Coffee,
  Milk,
  Cake,
  Candy,
  UserCircle,
  Search,
  AlertCircle,
  Clock,
  Loader2,
  Package,
  RefreshCw,
  Menu,
} from 'lucide-react';
import { usePOS, cartLineUnitPrice, cartLineOptionsSummary, type CartLineOptions } from '../contexts/POSContext';
import { syncManager } from '../services/syncManager';
import { queueTicketService } from '../services/queueTicketService';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useProducts } from '../contexts/ProductsContext';
import OrderSummaryPanel, { type ServiceType } from '../components/OrderSummaryPanel';
import DiscountDialog from '../components/DiscountDialog';
import WeighDialog from '../components/WeighDialog';
import ProductOptionsDialog from '../components/ProductOptionsDialog';
import ScaleStatusIndicator from '../components/ScaleStatusIndicator';
import UpdateStatusIndicator from '../components/UpdateStatusIndicator';
import scaleService from '../services/scaleService';
import { LocalProduct, LocalCustomer } from '../types/supabase';
import { useTranslation } from 'react-i18next';
// import { transactionService } from '../services/transactionService';
import { isSupabaseConfigured, checkSupabaseConnection } from '../lib/supabase';
import { customerLocalService, initializeLocalDatabase, transactionLocalService } from '../lib/localDatabase';
import { buildChainScope, computeSeriesKey } from '../fiscal/seriesUtils';
import { receiptProfileForDefaultDocumentType } from '../fiscal/receiptSeriesProfile';
import { saftTypeToReceiptDocumentType } from '../fiscal/saleDocumentType';
import { buildReceiptCustomerProps } from '../fiscal/fiscalCustomer';
import { ReceiptProps } from '../components/ThermalReceipt';
import { getReceiptT } from '../utils/receiptLanguage';
import { uiLocale } from '../utils/locale';
import { logPostSaleReceiptPrinted, type PostSalePrintAuditContext } from '../fiscal/fiscalAuditLog';
import { usePrinterConfig } from '../hooks/usePrinterConfig';
import {
  isFiscalResultPrintable,
  printReceiptThermally,
  resolveReceiptPrinterName,
  type ThermalPrintResult,
} from '../services/receiptPrinting';
import type { PaymentConfirmation } from '../components/PaymentDialog';
// import ReceiptHistorySelector from '../components/ReceiptHistorySelector'; // AGENTS: do not delete — 2.ª via picker (commented until implemented)
import { CustomerDialog } from '../components/CustomerDialog';
import PaymentDialog from '../components/PaymentDialog';
import CashDrawerDialog from '../components/CashDrawerDialog';
import ReceiptDialog from '../components/ReceiptDialog';
import NonFiscalFallbackDialog from '../components/NonFiscalFallbackDialog';
import { classifyFiscalIssueFailure, type FiscalIssueFailure } from '../fiscal/fiscalFailure';
import { isNonFiscalFallbackProvider, type NonFiscalFallbackDecision } from '../fiscal/nonFiscalFallback';
import { CategoryFilterButton } from '../components/ui/CategoryFilterButton';
import { ProductCard } from '../components/ui/ProductCard';
import { useDesignSystem2Customization } from '../contexts/DesignSystem2CustomizationContext';
import { useLayoutNav } from '../contexts/LayoutNavContext';
import { OPEN_MY_PROFILE_EVENT } from '../components/HR/MyProfileDialog';
import { cashDrawerAuditService } from '../services/cashDrawerAuditService';
import { dialogButtonClasses, useAppliedDialogStyle } from '../theme/dialogStyle';
import { recipeService } from '../services/recipeService';
import { tableOrderService } from '../services/tableOrderService';
import '../styles/design-system-2-scope.css';

// Icon mapping for categories
const iconMap = {
  grid: Grid,
  coffee: Coffee,
  milk: Milk,
  cake: Cake,
  candy: Candy,
};


const POSInner: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const appliedDialogStyle = useAppliedDialogStyle();
  const shellButtons = appliedDialogStyle ? dialogButtonClasses(appliedDialogStyle) : null;
  const { toggleNavSidebar } = useLayoutNav();
  const { visualStyle, prefs } = useDesignSystem2Customization();
  const {
    cart,
    addToCart,
    addOptionedToCart,
    addWeighedToCart,
    clearCart,
    updateQuantity,
    selectedCustomer,
    selectCustomer,
    processTransaction,
    activeTableOrder,
    restoreCart,
    clearActiveTableOrder,
  } = usePOS();
  const { employee, signOut } = useSupabaseAuth();
  const { settings, updateSettings } = useSettings();
  const {
    categories: allCategories,
    getProductsByCategory,
    getActiveProducts,
    isLoading,
    error,
    syncError,
    syncData,
    refreshData,
    clearSyncError
  } = useProducts();

  // Customer state management
  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
  const [showCustomerModal, setShowCustomerModal] = useState(false);

  // Receipt preview modal state
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const [receiptPreviewData, setReceiptPreviewData] = useState<ReceiptProps | null>(null);
  /* AGENTS: Do not delete — 2.ª via / receipt history state (commented until Mesas + 2.ª via POS flow is implemented).
  const [lastCompletedReceipt, setLastCompletedReceipt] = useState<ReceiptProps | null>(null);
  const [recentReceipts, setRecentReceipts] = useState<ReceiptProps[]>([]);
  const [showReceiptHistory, setShowReceiptHistory] = useState(false);
  */
  const [nextReceiptAfterClose, setNextReceiptAfterClose] = useState<ReceiptProps | null>(null);
  /** Outcome of a post-sale auto-print that did not cleanly succeed, handed to
   *  the receipt dialog so it opens explaining itself. */
  const [printNotice, setPrintNotice] = useState<{ state: 'unknown' | 'failed'; error?: string } | null>(null);
  const [postSalePrintAudit, setPostSalePrintAudit] = useState<PostSalePrintAuditContext | null>(null);
  const [lastFiscalInvoiceNo, setLastFiscalInvoiceNo] = useState<string | null>(null);

  // Products that have a recipe (fiche technique). They are always sellable: a
  // dish carries no meaningful product stock of its own — its raw ingredients
  // are deducted (and clamped at zero) when sold.
  const [recipeProductIds, setRecipeProductIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    void recipeService.getProductIdsWithRecipe().then(setRecipeProductIds).catch(() => { });
  }, []);

  // Weigh-item dialog (sold-by-weight products)
  const [weighProduct, setWeighProduct] = useState<LocalProduct | null>(null);
  const [optionsProduct, setOptionsProduct] = useState<LocalProduct | null>(null);

  // Till-scoped scale session: the scale is per-till hardware (like the
  // printer), so detection/polling runs from POS mount onward — NOT per
  // weigh-dialog open, which made every tap pay for a port scan and made the
  // dialog flap between "waiting" and "unavailable". Deliberately no stop on
  // unmount: navigating to Settings and back must not churn the serial port.
  useEffect(() => {
    if (!scaleService.isAvailable()) return;
    void scaleService.getConfig().then((r) => {
      if (r.success && r.config?.enabled) void scaleService.start();
    });
  }, []);

  // Total quantity of a product across cart lines (weighed products can span
  // several lines — one per weighing).
  const cartQuantityForProduct = useCallback(
    (productId: string) =>
      cart.reduce((sum, item) => (item.product.id === productId ? sum + item.quantity : sum), 0),
    [cart]
  );

  // Stock validation helper function
  const canAddToCart = (product: LocalProduct, requestedQuantity = 1): boolean => {
    if (recipeProductIds.has(product.id)) {
      return true;
    }
    if (!settings.pos.trackInventory || !product.track_stock) {
      return true;
    }
    // If negative stock is allowed, always allow
    if (settings.pos.allowNegativeStock) {
      return true;
    }

    const currentCartQuantity = cartQuantityForProduct(product.id);
    if (product.sold_by_weight) {
      // Weight is unknown until the item is on the scale; the grid gate only
      // requires some remaining capacity (3dp-rounded: weighings are exact
      // 0.001 multiples, so raw float sums would leave phantom ~1e-16 capacity).
      // The exact weight is re-checked at weigh-confirm via maxWeightKg.
      return Number((product.stock - currentCartQuantity).toFixed(3)) > 0;
    }
    const totalRequestedQuantity = currentCartQuantity + requestedQuantity;

    // Check if total would exceed available stock
    return totalRequestedQuantity <= product.stock;
  };

  // Remaining sellable kg for the weigh dialog (undefined = unlimited).
  const maxWeightForProduct = (product: LocalProduct): number | undefined => {
    if (
      recipeProductIds.has(product.id) ||
      !settings.pos.trackInventory ||
      !product.track_stock ||
      settings.pos.allowNegativeStock
    ) {
      return undefined;
    }
    return Math.max(0, Number((product.stock - cartQuantityForProduct(product.id)).toFixed(3)));
  };

  /** Variants with at least one enabled option, or enabled add-ons, route
   *  the tap through the item-options dialog instead of a direct add. */
  const productHasOptions = (product: LocalProduct): boolean =>
    (product.variants ?? []).some(attr => attr.enabled && attr.options.some(o => o.enabled)) ||
    (product.modifiers ?? []).some(m => m.enabled);

  // Enhanced addToCart with stock validation
  const handleAddToCart = (product: LocalProduct, quantity = 1) => {
    // Weighed products go through the scale dialog instead of quantity 1.
    if (product.sold_by_weight) {
      if (canAddToCart(product)) {
        setWeighProduct(product);
      }
      return;
    }
    if (productHasOptions(product)) {
      if (canAddToCart(product, quantity)) {
        setOptionsProduct(product);
      }
      return;
    }
    // Only allow adding if stock validation passes
    // UI prevents clicks on out-of-stock items, but this is a safety check
    if (canAddToCart(product, quantity)) {
      addToCart(product, quantity);
    }
  };

  const handleWeighConfirm = (weightKg: number) => {
    if (!weighProduct) return;
    const max = maxWeightForProduct(weighProduct);
    if (max !== undefined && weightKg > max + 1e-9) {
      return; // dialog disables Add beyond max; safety check
    }
    addWeighedToCart(weighProduct, weightKg);
    setWeighProduct(null);
  };

  const handleIncrementCartLine = useCallback(
    (lineId: string) => {
      const line = cart.find(item => item.lineId === lineId);
      if (!line || line.product.sold_by_weight) return; // weighed lines have a fixed weight
      if (recipeProductIds.has(line.product.id) || !settings.pos.trackInventory || !line.product.track_stock) {
        addToCart(line.product, 1);
        return;
      }
      if (!settings.pos.allowNegativeStock && line.quantity >= line.product.stock) {
        return;
      }
      addToCart(line.product, 1);
    },
    [cart, addToCart, settings.pos.allowNegativeStock, settings.pos.trackInventory, recipeProductIds]
  );

  const handleDecrementCartLine = useCallback(
    (lineId: string) => {
      const line = cart.find(item => item.lineId === lineId);
      if (!line) return;
      // Tapping − on a weighed line removes the whole weighing.
      updateQuantity(lineId, line.product.sold_by_weight ? 0 : line.quantity - 1);
    },
    [cart, updateQuantity]
  );

  // Quantity increases from product grid; order panel line tap removes one unit
  const [showPayment, setShowPayment] = useState(false);
  // Set when a fiscal issuance failed and the sale may be completed on a
  // non-fiscal slip instead. Holds the confirmation so the identical sale can be
  // re-entered once the operator decides.
  const [fallbackPrompt, setFallbackPrompt] = useState<{
    confirmation: PaymentConfirmation;
    failure: FiscalIssueFailure;
  } | null>(null);
  const [fallbackBusy, setFallbackBusy] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [serviceType, setServiceType] = useState<ServiceType>('dine-in');
  const [discount, setDiscount] = useState({ type: 'none' as 'none' | 'percentage' | 'fixed', value: 0 });
  const [pointsRedemption, setPointsRedemption] = useState<{
    customerId: string;
    points: number;
  } | null>(null);
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);
  const [tableOrderReady, setTableOrderReady] = useState(false);
  const settlingTableOrderId = useRef<string | null>(null);
  const activeTableOrderRef = useRef(activeTableOrder);
  const tableOrderReadyRef = useRef(tableOrderReady);
  const tableOrderSnapshotRef = useRef({
    lines: cart,
    customer: selectedCustomer,
    globalDiscount: discount,
    pointsRedemption,
  });

  const [cashReceived, setCashReceived] = useState(0);
  const printerConfig = usePrinterConfig();
  const [showCashDrawer, setShowCashDrawer] = useState(false);

  // Rehydrate a table order whenever this POS screen is entered with an
  // active table session. The stored product snapshots retain the exact
  // price/VAT/weight data that was present when the order was parked.
  useEffect(() => {
    let cancelled = false;
    const tableOrderId = activeTableOrder?.id;

    if (!tableOrderId) {
      setTableOrderReady(false);
      return () => {
        cancelled = true;
      };
    }

    setTableOrderReady(false);
    void tableOrderService.getById(tableOrderId)
      .then(order => {
        if (cancelled) return;
        if (!order || order.status !== 'open') {
          clearActiveTableOrder();
          return;
        }

        restoreCart(order.lines, order.customer);
        setDiscount(order.global_discount);
        setPointsRedemption(order.points_redemption);
        setServiceType('dine-in');
        setTableOrderReady(true);
      })
      .catch(error => {
        console.error('Could not restore the active table order', error);
        if (!cancelled) clearActiveTableOrder();
      });

    return () => {
      cancelled = true;
    };
  }, [activeTableOrder?.id, clearActiveTableOrder, restoreCart]);

  // Persist a parked order after cart, customer or sale modifiers change.
  // A short debounce keeps product-grid taps responsive while still making
  // navigation away from the POS safe (the navigation handler flushes too).
  useEffect(() => {
    const tableOrderId = activeTableOrder?.id;
    if (!tableOrderId || !tableOrderReady || settlingTableOrderId.current === tableOrderId) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      void tableOrderService.updateOpenOrder(tableOrderId, {
        lines: cart,
        customer: selectedCustomer,
        globalDiscount: discount,
        pointsRedemption,
      }).catch(error => {
        // Do not clear the live cart if persistence fails; the operator can
        // retry from Tables and no fiscal transaction has been touched.
        console.error('Could not save the table order', error);
      });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [activeTableOrder?.id, cart, discount, pointsRedemption, selectedCustomer, tableOrderReady]);

  // The table action flushes explicitly, but sidebar navigation and logout can
  // unmount this page directly. Preserve the latest parked snapshot in those
  // cases as well; a failed write leaves the existing saved order untouched.
  useEffect(() => {
    activeTableOrderRef.current = activeTableOrder;
    tableOrderReadyRef.current = tableOrderReady;
    tableOrderSnapshotRef.current = {
      lines: cart,
      customer: selectedCustomer,
      globalDiscount: discount,
      pointsRedemption,
    };
  }, [activeTableOrder, cart, discount, pointsRedemption, selectedCustomer, tableOrderReady]);

  useEffect(() => () => {
    const tableOrder = activeTableOrderRef.current;
    if (!tableOrder || !tableOrderReadyRef.current || settlingTableOrderId.current === tableOrder.id) {
      return;
    }
    void tableOrderService.updateOpenOrder(tableOrder.id, tableOrderSnapshotRef.current).catch(error => {
      console.error('Could not save the table order while leaving the POS', error);
    });
  }, []);

  const handleOpenTables = async () => {
    setServiceType('dine-in');
    const tableOrderId = activeTableOrder?.id;
    if (tableOrderId && tableOrderReady && settlingTableOrderId.current !== tableOrderId) {
      try {
        await tableOrderService.updateOpenOrder(tableOrderId, {
          lines: cart,
          customer: selectedCustomer,
          globalDiscount: discount,
          pointsRedemption,
        });
      } catch (error) {
        console.error('Could not save the table order before opening Tables', error);
        alert(t('pos.tableOrder.saveFailed'));
        return;
      }
    }
    navigate('/tables', {
      state: {
        tableOrderSnapshot: {
          globalDiscount: discount,
          pointsRedemption,
        },
      },
    });
  };

  // Auto-logout states
  const [showAutoLogoutWarning, setShowAutoLogoutWarning] = useState(false);
  const [autoLogoutCountdown, setAutoLogoutCountdown] = useState(settings.autoLogout.warningSeconds);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  // Helper getters for auto-logout timings (milliseconds)
  const getAutoLogoutTime = () => settings.autoLogout.timeoutMinutes * 60 * 1000;
  const getWarningTime = () => settings.autoLogout.warningSeconds * 1000;
  const [timeUntilAutoLogout, setTimeUntilAutoLogout] = useState(getAutoLogoutTime());
  const [lastCartActivity, setLastCartActivity] = useState<number>(Date.now());
  const [cartClearCountdown, setCartClearCountdown] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await initializeLocalDatabase();
        const now = new Date();
        const prof = receiptProfileForDefaultDocumentType(settings.receipt);
        const sk = computeSeriesKey(prof, now);
        const at = prof.atValidationCode.trim();
        if (!at) {
          if (!cancelled) setLastFiscalInvoiceNo(null);
          return;
        }
        const cs = buildChainScope(at, sk);
        const last = await transactionLocalService.getLastFiscalDocumentInChain(cs);
        if (!cancelled) setLastFiscalInvoiceNo(last?.invoice_no ?? null);
      } catch {
        if (!cancelled) setLastFiscalInvoiceNo(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settings.receipt]);

  // Activity tracking for auto-logout
  useEffect(() => {
    const updateActivity = () => {
      setLastActivity(Date.now());
      setLastCartActivity(Date.now()); // Reset cart activity timer too
      if (settings.autoLogout.enabled) {
        setTimeUntilAutoLogout(getAutoLogoutTime());
      }
      if (showAutoLogoutWarning) {
        setShowAutoLogoutWarning(false);
        setAutoLogoutCountdown(settings.autoLogout.warningSeconds);
      }
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    // Add event listeners for activity tracking
    events.forEach(event => {
      document.addEventListener(event, updateActivity, true);
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity, true);
      });
    };
  }, [showAutoLogoutWarning, settings.autoLogout.enabled]);

  // Auto-logout timer management
  useEffect(() => {
    // Skip auto-logout if disabled
    if (!settings.autoLogout.enabled) {
      return;
    }

    const checkAutoLogout = () => {
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivity;
      const autoLogoutTime = getAutoLogoutTime();
      const warningTime = getWarningTime();
      setTimeUntilAutoLogout(Math.max(0, autoLogoutTime - timeSinceLastActivity));

      // Check if we should show warning
      if (timeSinceLastActivity >= autoLogoutTime - warningTime && !showAutoLogoutWarning) {
        // Check cart protection setting
        const shouldProtect = settings.autoLogout.protectWhenCartHasItems && cart.length > 0;
        if (!shouldProtect) {
          setShowAutoLogoutWarning(true);
          setAutoLogoutCountdown(settings.autoLogout.warningSeconds);
        }
      }

      // Check if we should auto-logout
      if (timeSinceLastActivity >= autoLogoutTime) {
        const shouldProtect = settings.autoLogout.protectWhenCartHasItems && cart.length > 0;
        if (!shouldProtect) {
          handleAutoLogout();
        }
      }
    };

    const interval = setInterval(checkAutoLogout, 1000); // Check every second

    return () => clearInterval(interval);
  }, [lastActivity, cart.length, showAutoLogoutWarning, settings.autoLogout]);

  // Auto-logout warning countdown
  useEffect(() => {
    if (showAutoLogoutWarning && autoLogoutCountdown > 0) {
      const countdown = setTimeout(() => {
        setAutoLogoutCountdown(prev => prev - 1);
      }, 1000);

      return () => clearTimeout(countdown);
    } else if (showAutoLogoutWarning && autoLogoutCountdown === 0) {
      handleAutoLogout();
    }
  }, [showAutoLogoutWarning, autoLogoutCountdown]);

  // Auto-logout handler
  const handleAutoLogout = () => {
    const shouldProtect = settings.autoLogout.protectWhenCartHasItems && cart.length > 0;
    if (!shouldProtect) {
      setShowAutoLogoutWarning(false);
      signOut();
    }
  };

  // Extend session handler
  const handleExtendSession = () => {
    setLastActivity(Date.now());
    setShowAutoLogoutWarning(false);
    setAutoLogoutCountdown(settings.autoLogout.warningSeconds);
    setTimeUntilAutoLogout(getAutoLogoutTime());
  };

  // Filter products based on category only
  const filteredProducts = selectedCategoryId ? getProductsByCategory(selectedCategoryId) : [];



  const subtotal = cart.reduce((sum, item) => sum + (cartLineUnitPrice(item) * item.quantity), 0);
  const requestedDiscountAmount = discount.type === 'percentage'
    ? (subtotal * discount.value / 100)
    : discount.type === 'fixed'
      ? discount.value
      : 0;
  const discountAmount = Math.min(subtotal, Math.max(0, requestedDiscountAmount));

  const discountedSubtotal = subtotal - discountAmount;

  // Calculate tax extracted from tax-inclusive prices (European style)
  const tax = cart.reduce((sum, item) => {
    const itemTotal = cartLineUnitPrice(item) * item.quantity;
    const taxAmount = itemTotal - (itemTotal / (1 + item.product.iva_rate));
    return sum + taxAmount;
  }, 0);

  // Apply discount to tax as well (proportionally)
  const discountedTax = tax * (discountedSubtotal / subtotal);
  const finalTaxAfterDiscount = isNaN(discountedTax) ? 0 : discountedTax;

  // Apply customer discount to total (no customer-specific discount field in LocalCustomer)
  const customerDiscount = 0;
  const customerDiscountAmount = discountedSubtotal * customerDiscount / 100;
  const finalSubtotal = discountedSubtotal - customerDiscountAmount;

  // In European style, total = subtotal (since tax is already included in prices)
  // But we need to adjust tax proportionally with discounts
  const finalTax = finalTaxAfterDiscount * (finalSubtotal / discountedSubtotal);
  const adjustedFinalTax = isNaN(finalTax) ? 0 : finalTax;
  const finalTotal = finalSubtotal;
  const actualPointsRedeemed = pointsRedemption
    ? Math.min(
        pointsRedemption.points,
        Math.floor(discountAmount * settings.loyalty.pointsPerEuroRedeemed)
      )
    : 0;

  // (category selection handled inline where used)

  const handleDiscountClick = () => {
    setShowDiscountDialog(true);
  };

  const handleClearAll = () => {
    clearCart();
    setDiscount({ type: 'none', value: 0 });
    setPointsRedemption(null);
  };

  const handleCustomerSelect = (customer: LocalCustomer) => {
    selectCustomer(customer);
    setShowCustomerModal(false);
  };

  // Auto-clear cart timer management
  useEffect(() => {
    // Skip auto-clear if disabled or timeout is 0 (NEVER)
    // An active table has its own persisted order and must never be silently
    // emptied by the temporary walk-in-cart timer.
    if (
      activeTableOrder ||
      !settings.pos.autoClearCart.enabled ||
      settings.pos.autoClearCart.timeoutMinutes === 0 ||
      cart.length === 0
    ) {
      setCartClearCountdown(0);
      return;
    }

    const checkAutoClearCart = () => {
      const now = Date.now();
      const timeSinceLastCartActivity = now - lastCartActivity;
      const autoClearTime = settings.pos.autoClearCart.timeoutMinutes * 60 * 1000;

      const remainingTime = Math.max(0, autoClearTime - timeSinceLastCartActivity);
      setCartClearCountdown(remainingTime);

      // Auto-clear cart when time is up
      if (timeSinceLastCartActivity >= autoClearTime) {
        clearCart();
        setLastCartActivity(Date.now()); // Reset timer after clearing
      }
    };

    const interval = setInterval(checkAutoClearCart, 1000); // Check every second

    return () => clearInterval(interval);
  }, [activeTableOrder, lastCartActivity, cart.length, settings.pos.autoClearCart, clearCart]);

  // Track cart activity when cart is modified
  useEffect(() => {
    if (cart.length > 0) {
      setLastCartActivity(Date.now());
    }
  }, [cart]);

  // Load customers from database
  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const dbCustomers = await customerLocalService.getAllCustomers();
        setCustomers(dbCustomers);
      } catch (error) {
        console.error('Failed to load customers:', error);
        setCustomers([]); // Fallback to empty array
      }
    };

    loadCustomers();
  }, []);

  // Handle retry/refresh data
  const handleRetryData = async () => {
    try {
      await refreshData();
      console.log('POS: Data refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh data:', error);
    }
  };

  // Handle sync data
  const handleSyncData = async () => {
    try {
      await syncData();
      console.log('POS: Data synced successfully');
    } catch (error) {
      console.error('Failed to sync data:', error);
    }
  };

  // Auto-refresh data when coming back to POS after adding products
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('POS: Page became visible, refreshing data...');
        refreshData().catch(error => {
          console.error('Failed to refresh data on visibility change:', error);
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshData]);

  /**
   * Complete a sale. Extracted from the PaymentDialog callback so the same
   * path can be re-entered with `nonFiscalFallback` after the operator
   * confirms the fallback — the post-sale work (queue ticket, drawer,
   * receipt, printing) is identical whether a fatura or a slip was issued.
   */
  const handlePaymentConfirmed = async (
    confirmation: PaymentConfirmation,
    nonFiscalFallback?: NonFiscalFallbackDecision
  ): Promise<boolean> => {
    const cartSnapshot = cart.map((ci) => ({ ...ci }));
    // The operator's actual choice, not an inference from the amount:
    // a cash sale tendered exactly leaves the field empty, and
    // `cashReceived > 0` used to record those as card (wrong payment
    // method on the fiscal record, and no drawer kick).
    const paymentMethod = confirmation.method;
    const tenderedCash = confirmation.cashReceived;
    const changeGiven = confirmation.change;
    const employeeId = employee?.id || 'unknown-employee';
    const employeeName = employee?.name || 'Employee';
    const tableOrderId = activeTableOrder?.id;
    let fiscalSaleWasIssued = false;
    let tableSettlementNeedsReview = false;

    try {
      if (tableOrderId && !tableOrderReady) {
        throw new Error(t('pos.tableOrder.stillLoading'));
      }

      if (tableOrderId) {
        // Persist the safety state before fiscal issuance. A crash in
        // the narrow window after issuance cannot make the table
        // payable again; it stays blocked for reconciliation instead.
        settlingTableOrderId.current = tableOrderId;
        await tableOrderService.beginSettlement(tableOrderId);
      }

      const { fiscal, receiptNumber, transactionId } = await processTransaction(
        {
          paymentMethod,
          amountPaid: paymentMethod === 'cash' ? tenderedCash : undefined,
          employeeId,
          employeeName,
          employeeNumber: employee?.employee_number,
        },
        () => {
          setDiscount({ type: 'none', value: 0 });
          setPointsRedemption(null);
        },
        {
          type: discount.type,
          value: discount.value,
          amount: discountAmount + customerDiscountAmount,
        },
        { settings, updateSettings },
        {
          enabled: settings.loyalty.enabled,
          pointsPerEuroEarned: settings.loyalty.pointsPerEuroEarned,
          pointsRedeemed: actualPointsRedeemed,
          customerId: pointsRedemption?.customerId,
        },
        undefined,
        tableOrderId
          ? {
            onFiscalDocumentPersisted: async issuedFiscal => {
              fiscalSaleWasIssued = true;
              try {
                await tableOrderService.markSettled(tableOrderId, issuedFiscal.transactionId);
                clearActiveTableOrder();
              } catch (settlementError) {
                // Never reopen a table after fiscal issuance. The order
                // remains "payment in progress" until it is reconciled.
                tableSettlementNeedsReview = true;
                clearActiveTableOrder();
                console.error('Fiscal sale completed, but table settlement could not be recorded', settlementError);
              } finally {
                settlingTableOrderId.current = null;
              }
            },
          }
          : undefined,
        nonFiscalFallback
      );

      if (paymentMethod === 'cash' && employee) {
        try {
          const drawerEvent = await cashDrawerAuditService.openForSale({
            operator: {
              id: employee.id,
              name: employee.name,
              employeeNumber: employee.employee_number,
            },
            terminal: { label: settings.receipt.counterLabel },
            transactionId: fiscal?.transactionId || transactionId,
            transactionReference: fiscal?.invoiceNo || receiptNumber,
            saleAmount: finalTotal,
          });
          if (!drawerEvent.success) {
            console.warn('Cash sale completed, but the drawer open command failed:', drawerEvent.error_message);
          }
        } catch (drawerError) {
          console.error('Cash sale completed, but the drawer action could not be logged:', drawerError);
        }
      }

      let queueTicketNumber: string | undefined;
      if (settings.orderQueue.enabled) {
        try {
          const queueTicket = await queueTicketService.issueTicket(
            fiscal?.invoiceNo || receiptNumber,
            {
              prefix: settings.orderQueue.prefix,
              startNumber: settings.orderQueue.startNumber,
              padding: settings.orderQueue.padding,
            }
          );
          queueTicketNumber = queueTicket.display_number;
        } catch (queueError) {
          console.error('Sale completed, but the order ticket could not be created', queueError);
        }
      }

      if (isSupabaseConfigured() && await checkSupabaseConnection()) {
        try {
          syncManager.forceSync().catch(() => { });
        } catch {
          /* ignore */
        }
      }

      // A non-fiscal slip carries no QR by construction; generating one from an
      // empty payload would put a scannable-looking square on a document the AT
      // cannot validate.
      const qrCodeImage = fiscal && !fiscal.nonFiscal
        ? await generateQRCodeImage(fiscal.qrPayload)
        : undefined;

      const receiptData: ReceiptProps = {
        documentType: fiscal?.nonFiscal
          ? 'TALAO_NAO_FISCAL'
          : fiscal
            ? saftTypeToReceiptDocumentType(fiscal.invoiceTypeSaft)
            : 'FATURA',
        date: new Date(),
        counter: settings.receipt.counterLabel,
        ticketNumber: queueTicketNumber,
        verificationCode: fiscal?.atcudBody || '',
        verifactuLegend: fiscal?.verifactuLegend,
        documentNumber: fiscal?.invoiceNo || '',
        documentHash: fiscal?.hashBase64,
        hashFourChars: fiscal?.hashFourChars,
        qrCodeData: fiscal?.qrPayload,
        qrCodeImage,
        trainingMode: fiscal ? fiscal.certificationMode === 'training' : settings.fiscal.trainingMode,
        officialOutput: fiscal?.officialOutput,
        documentLabel: getReceiptT(settings.receipt.receiptLanguage)('thermalReceipt.original'),
        emitterName: employeeName,
        company: {
          name: settings.company.name,
          address: settings.company.address,
          postalCode: settings.company.postalCode,
          city: settings.company.city,
          taxNumber: settings.company.taxNumber,
          phone: settings.company.phone || undefined,
          email: settings.company.email || undefined,
        },
        customer: buildReceiptCustomerProps(selectedCustomer),
        items: cartSnapshot.map((ci) => ({
          id: ci.lineId,
          description: ci.options ? `${ci.product.name} (${cartLineOptionsSummary(ci.options)})` : ci.product.name,
          quantity: ci.quantity,
          unit: ci.product.sold_by_weight ? ('kg' as const) : ('un' as const),
          unitPrice: cartLineUnitPrice(ci),
          vatRate: Math.round((ci.product.iva_rate || 0) * 100),
          total: Number((cartLineUnitPrice(ci) * ci.quantity).toFixed(2)),
        })),
        totals: {
          subtotal: Number(subtotal.toFixed(2)),
          discount: Number((discountAmount + customerDiscountAmount).toFixed(2)),
          discountPercentage: discount.type === 'percentage' ? discount.value : 0,
          net: Number(finalSubtotal.toFixed(2)),
          vat: Number(adjustedFinalTax.toFixed(2)),
          total: Number(finalTotal.toFixed(2)),
        },
        payment: {
          method: paymentMethod === 'cash'
            ? getReceiptT(settings.receipt.receiptLanguage)('transactions.receipt.paymentCash')
            : getReceiptT(settings.receipt.receiptLanguage)('transactions.receipt.paymentCard'),
          amountGiven: Number(tenderedCash.toFixed(2)),
          change: Number(changeGiven.toFixed(2)),
        },
        slogan: settings.company.slogan || undefined,
        softwareInfo: settings.company.softwareInfo || undefined,
        certificationNumber: settings.company.certificationNumber || undefined,
      };

      // Hand the receipt straight to the thermal head and skip the
      // preview — but only when the fiscal issuance is complete enough
      // to give a customer unseen (ATCUD + QR for PT, Veri*factu legend
      // + QR for ES). Anything less, or any outcome other than a clean
      // success, falls back to the dialog so the operator sees it.
      const auditContext: PostSalePrintAuditContext = {
        documentNumber: fiscal?.invoiceNo || receiptData.documentNumber || '',
        transactionId: fiscal?.transactionId,
        fiscalDocumentId: fiscal?.fiscalId,
      };
      // Own try/catch: the sale is already committed here, so a
      // printing problem must never surface as "checkout failed" via
      // the enclosing handler.
      let autoPrint: ThermalPrintResult = { status: 'unavailable' };
      try {
        if (isFiscalResultPrintable(fiscal, {
          spain: Boolean(fiscal?.verifactuLegend?.trim()) || settings.fiscal.issuer === 'sign_es',
        })) {
          autoPrint = await printReceiptThermally(receiptData, {
            printerName: await resolveReceiptPrinterName(printerConfig?.receiptPrinter),
            language: settings.receipt.receiptLanguage,
          });
        }
      } catch (printError) {
        console.error('Sale completed, but the receipt could not be auto-printed', printError);
        autoPrint = {
          status: 'failed',
          error: printError instanceof Error ? printError.message : String(printError),
        };
      }

      setShowPayment(false);
      setReceiptPreviewData(receiptData);
      // setLastCompletedReceipt(receiptData);
      // setRecentReceipts((prev) => [receiptData, ...prev].slice(0, 20));
      setNextReceiptAfterClose(null);
      if (fiscal?.invoiceNo) {
        setLastFiscalInvoiceNo(fiscal.invoiceNo);
      }

      if (autoPrint.status === 'printed') {
        // No dialog will mount, so the fiscal audit event is logged
        // here and the context left null — nothing to resolve later.
        setPostSalePrintAudit(null);
        setPrintNotice(null);
        setShowReceiptPreview(false);
        void logPostSaleReceiptPrinted(auditContext, employee?.id);
      } else {
        setPostSalePrintAudit(auditContext);
        setPrintNotice(
          autoPrint.status === 'unknown' || autoPrint.status === 'failed'
            ? { state: autoPrint.status, error: autoPrint.error }
            : null
        );
        setShowReceiptPreview(true);
      }
    } catch (e) {
      if (tableOrderId && !fiscalSaleWasIssued) {
        try {
          await tableOrderService.restoreOpen(tableOrderId);
        } catch (restoreError) {
          console.error('Could not reopen the table order after a failed checkout', restoreError);
        }
        settlingTableOrderId.current = null;
      }
      console.error('Checkout failed', e);

      // The fiscal backend could not issue. Offer to complete the sale on a
      // non-fiscal slip against a handwritten invoice — but only offer it, and
      // only once: a fallback that itself failed is a plain error.
      const issueFailure = nonFiscalFallback ? null : classifyFiscalIssueFailure(e);
      if (issueFailure && isNonFiscalFallbackProvider(issueFailure.provider)) {
        setFallbackPrompt({ confirmation, failure: issueFailure });
        return false;
      }

      alert(e instanceof Error ? e.message : t('pos.checkoutFailed'));
      return false;
    }

    if (tableSettlementNeedsReview) {
      alert(t('pos.tableOrder.settlementNeedsReview'));
    }
    return true;
  };

  return (
    <div
      className="ds2-visual-scope flex h-full min-h-0 w-full bg-neutral-50"
      style={visualStyle}
      data-ds2-neutral={prefs.neutralFamilyId}
    >
      {/* Main Content Area - takes most space */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Top Header - search over categories + products (not cart) */}
        <div className="flex-none bg-white shadow-sm border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleNavSidebar}
              className="flex min-h-touch-xs min-w-[2.75rem] shrink-0 items-center justify-center rounded-2xl text-gray-700 transition-colors duration-200 hover:bg-gray-100"
              aria-label={t('pos.openMenu')}
            >
              <Menu className="h-[20px] w-[20px]" aria-hidden />
            </button>
            <div className="flex min-w-0 flex-1 justify-center">
              <div className="relative w-full max-w-md">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400" aria-hidden />
                <input
                  type="text"
                  placeholder={t('pos.searchProductPlaceholder')}
                  className="w-full rounded-lg border border-gray-300 bg-neutral-50 py-2 pl-10 pr-4 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content Area - Left sidebar + Center products */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Categories Sidebar - uses vw units to match CategoryFilterButton */}
          <div className="bg-neutral-100 flex flex-col" style={{ width: '8vw', paddingLeft: '0.5vw', paddingTop: '1.5vw' }}>
            {/* All Categories (including All Menu) — scrollable, no scrollbar shown
                (native one hidden: Windows renders hard-cornered gray bars) */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain hide-native-scrollbar" style={{ padding: '0 0.5vw', gap: '0.5vw', display: 'flex', flexDirection: 'column' }}>
              {/* All Menu Option */}
              <CategoryFilterButton
                label={t('pos.allMenu')}
                icon={Grid}
                isSelected={!selectedCategoryId}
                onClick={() => setSelectedCategoryId('')}
              />

              {/* Category Options */}
              {allCategories.map((category) => {
                const Icon = iconMap[category.icon as keyof typeof iconMap] || Grid;
                return (
                  <CategoryFilterButton
                    key={category.id}
                    label={category.name}
                    icon={Icon}
                    isSelected={selectedCategoryId === category.id}
                    onClick={() => setSelectedCategoryId(category.id)}
                  />
                );
              })}

              {/* Show empty state if no categories */}
              {allCategories.length === 0 && (
                <div className="text-center py-8">
                  <Grid className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-neutral-500">{t('pos.noCategoriesAvailable')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Center Products Area */}
          <div className="flex-1 bg-neutral-100 overflow-hidden">
            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">{t('pos.loadingCatalogTitle')}</h2>
                  <p className="text-gray-600">{t('pos.loadingCatalogSubtitle')}</p>
                </div>
              </div>
            )}

            {/* Error State */}
            {error && !isLoading && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md">
                  <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">{t('pos.errorLoadingData')}</h2>
                  <p className="text-gray-600 mb-6">{error}</p>
                  <div className="flex space-x-3 justify-center">
                    <button
                      onClick={handleRetryData}
                      className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-neutral-50 px-6 py-3 rounded-2xl font-medium flex items-center space-x-2 transition-all"
                    >
                      <RefreshCw className="w-5 h-5" />
                      <span>{t('pos.retry')}</span>
                    </button>
                    <button
                      onClick={handleSyncData}
                      className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-neutral-50 px-6 py-3 rounded-2xl font-medium flex items-center space-x-2 transition-all"
                    >
                      <RefreshCw className="w-5 h-5" />
                      <span>{t('pos.syncData')}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Products Content: local catalog errors block; sync-only issues use banner above */}
            {!isLoading && !error && (
              <div className="h-full overflow-y-auto flex flex-col" style={{ padding: '1.5vw' }}>
                {syncError && (
                  <div
                    className="mb-4 flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border-2 border-orange-300 bg-orange-50 p-4 shrink-0"
                    role="status"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-semibold text-gray-900">{t('pos.syncDegradedTitle')}</p>
                      <p className="text-base text-gray-700 mt-1">{t('pos.syncDegradedBody')}</p>
                      <p className="text-sm text-gray-600 mt-2 break-words">{syncError}</p>
                    </div>
                    <div className="flex flex-wrap gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleSyncData()}
                        className="min-h-touch px-6 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-neutral-50 font-medium text-lg transition-all duration-200"
                      >
                        {t('pos.syncDegradedRetry')}
                      </button>
                      <button
                        type="button"
                        onClick={() => clearSyncError()}
                        className="min-h-touch px-6 rounded-2xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 text-lg transition-colors duration-200"
                      >
                        {t('pos.syncDegradedDismiss')}
                      </button>
                    </div>
                  </div>
                )}
                {/* Scrollable, no scrollbar shown (native one hidden: Windows renders
                    hard-cornered gray bars) */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain hide-native-scrollbar">
                  {/* Show products for selected category OR all products if no category selected */}
                  {(() => {
                    const productsToShow = selectedCategoryId ? filteredProducts : getActiveProducts();

                    return (
                      <>
                        {/* Products Grid - uses flexbox with vw-based gap to match ProductCard sizing */}
                        {productsToShow.length > 0 ? (
                          <div className="flex flex-wrap" style={{ gap: '1vw' }}>
                            {productsToShow.map((product) => {
                              const canAdd = canAddToCart(product, 1);
                              const isOutOfStock = !canAdd && !settings.pos.allowNegativeStock;
                              const cartQuantity = cartQuantityForProduct(product.id);
                              const remainingStock = product.stock - cartQuantity;

                              return (
                                <ProductCard
                                  key={product.id}
                                  name={product.name}
                                  price={product.price}
                                  soldByWeight={product.sold_by_weight ?? false}
                                  stock={product.stock}
                                  imageUrl={product.image_url || undefined}
                                  cartQuantity={cartQuantity}
                                  remainingStock={remainingStock}
                                  isOutOfStock={isOutOfStock}
                                  canAdd={canAdd}
                                  onClick={() => handleAddToCart(product)}
                                  outOfStockLabel={t('pos.outOfStock')}
                                />
                              );
                            })}
                          </div>
                        ) : (
                          /* Empty Products State */
                          <div className="text-center py-20">
                            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-gray-500 mb-2">
                              {selectedCategoryId ? t('pos.noProductsFoundTitle') : t('pos.noCatalogProductsTitle')}
                            </h3>
                            <p className="text-gray-400">
                              {selectedCategoryId ? t('pos.noProductsFoundMessage') : t('pos.noCatalogProductsMessage')}
                            </p>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom User Status Bar — spans categories + products, not cart */}
        <div id="pos-status-bar" className="flex-none bg-white border-t border-gray-200 px-3 py-1">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event(OPEN_MY_PROFILE_EVENT))}
                className="min-h-touch-xs rounded-2xl px-2 text-left text-xs font-medium text-gray-900 transition-colors hover:bg-gray-100"
              >
                {employee?.name} • <span className="capitalize text-gray-600">{employee?.role}</span>
                <span className="ml-2 text-emerald-700">{t('pos.myProfile')}</span>
              </button>
              {cart.length > 0 && settings.autoLogout.protectWhenCartHasItems && (
                <span className="text-green-600 text-xs font-medium">
                  {t('pos.saleInProgress')}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-3 text-xs text-gray-500">
              {settings.autoLogout.enabled && (
                <span>
                  {Math.floor(timeUntilAutoLogout / 60000)}:{String(Math.floor((timeUntilAutoLogout % 60000) / 1000)).padStart(2, '0')}
                </span>
              )}
              {settings.pos.autoClearCart.enabled && settings.pos.autoClearCart.timeoutMinutes > 0 && cart.length > 0 && (
                <span className="text-orange-600">
                  {t('pos.cartTimerLabel')} {Math.floor(cartClearCountdown / 60000)}:{String(Math.floor((cartClearCountdown % 60000) / 1000)).padStart(2, '0')}
                </span>
              )}
              <ScaleStatusIndicator />
              <UpdateStatusIndicator />
              <span>{t('pos.terminalLabel')} • {new Date().toLocaleDateString(uiLocale(i18n.language))}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Order Summary Panel (DEBUG 30/40/30) */}
      <OrderSummaryPanel
        items={cart.map(item => ({
          lineId: item.lineId,
          product: item.product,
          quantity: item.quantity,
          unitPrice: cartLineUnitPrice(item),
          optionsSummary: item.options ? cartLineOptionsSummary(item.options) : undefined,
          notes: item.options?.notes ?? null,
          unit: item.product.sold_by_weight ? ('kg' as const) : ('un' as const),
          canIncrement:
            !item.product.sold_by_weight &&
            (recipeProductIds.has(item.product.id) ||
              !settings.pos.trackInventory ||
              !item.product.track_stock ||
              settings.pos.allowNegativeStock ||
              cartQuantityForProduct(item.product.id) < item.product.stock),
        }))}
        onClearAll={handleClearAll}
        onDecrementCartLine={handleDecrementCartLine}
        onIncrementCartLine={handleIncrementCartLine}
        customerSummary={
          selectedCustomer
            ? { name: selectedCustomer.name, taxNumber: selectedCustomer.tax_number }
            : undefined
        }
        onProfile={() => window.dispatchEvent(new Event(OPEN_MY_PROFILE_EVENT))}
        onTables={handleOpenTables}
        onCashDrawer={() => setShowCashDrawer(true)}
        onProcess={() => setShowPayment(true)}
        serviceType={serviceType}
        onServiceTypeChange={setServiceType}
        tableName={activeTableOrder?.tableName}
        totalsOverride={{
          subtotal: Number(subtotal.toFixed(2)),
          tax: Number(adjustedFinalTax.toFixed(2)),
          discount: Number((discountAmount + customerDiscountAmount).toFixed(2)),
          total: Number(finalTotal.toFixed(2))
        }}
        discountInfo={{
          type: discount.type,
          value: discount.value,
          amount: discountAmount + customerDiscountAmount
        }}
        fiscalChainHint={lastFiscalInvoiceNo ?? undefined}
      />

      {optionsProduct && (
        <ProductOptionsDialog
          product={optionsProduct}
          onClose={() => setOptionsProduct(null)}
          onAdd={(quantity: number, options: CartLineOptions) => addOptionedToCart(optionsProduct, quantity, options)}
        />
      )}

      <WeighDialog
        product={weighProduct}
        maxWeightKg={weighProduct ? maxWeightForProduct(weighProduct) : undefined}
        cashier={employee ? { id: employee.id, name: employee.name } : null}
        onConfirm={handleWeighConfirm}
        onClose={() => setWeighProduct(null)}
      />

      <DiscountDialog
        open={showDiscountDialog}
        onClose={() => setShowDiscountDialog(false)}
        customers={customers}
        loyalty={settings.loyalty}
        saleTotal={subtotal}
        presets={[
          { id: 'p10', name: 'Promo 10%', type: 'percentage', value: 10, description: t('pos.discountDialog.presets.seasonal') },
          { id: 'p15', name: 'Promo 15%', type: 'percentage', value: 15 },
          { id: 'f2', name: t('pos.discountDialog.presets.off2'), type: 'fixed', value: 2 },
          { id: 'f5', name: t('pos.discountDialog.presets.off5'), type: 'fixed', value: 5, description: t('pos.discountDialog.presets.limitedTime') }
        ]}
        onApply={(res) => {
          setDiscount({ type: res.type, value: res.value });
          if (res.source === 'loyalty' && res.customer && res.pointsRedeemed) {
            selectCustomer(res.customer);
            setPointsRedemption({
              customerId: res.customer.id,
              points: res.pointsRedeemed,
            });
          } else {
            setPointsRedemption(null);
          }
          setShowDiscountDialog(false);
        }}
      />

      <CustomerDialog
        open={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        customers={customers}
        onSelect={handleCustomerSelect}
        onRegisterCustomer={async (customerData) => {
          try {
            const customerId = await customerLocalService.createCustomer(customerData);
            const dbCustomers = await customerLocalService.getAllCustomers();
            setCustomers(dbCustomers);
            const createdCustomer = dbCustomers.find(c => c.id === customerId);
            if (createdCustomer) {
              selectCustomer(createdCustomer);
            }
            setShowCustomerModal(false);
          } catch (error) {
            if (error instanceof Error && error.message === 'DUPLICATE_TAX_NUMBER') {
              throw error;
            }
            console.error('Failed to create customer:', error);
          }
        }}
      />

      {/* Payment Modal */}
      {showPayment && (
        <PaymentDialog
          open={showPayment}
          total={finalTotal}
          cashReceived={cashReceived}
          onChangeCash={(n) => setCashReceived(isNaN(n) ? 0 : n)}
          onDiscount={handleDiscountClick}
          onNif={() => setShowCustomerModal(true)}
          discountAmount={discountAmount + customerDiscountAmount}
          nif={selectedCustomer?.tax_number || undefined}
          onClose={() => {
            setShowPayment(false);
            setCashReceived(0);
          }}
          onConfirm={handlePaymentConfirmed}
        />
      )}

      {/* Fiscal issuance failed — offer the handwritten-invoice fallback. */}
      {fallbackPrompt && (
        <NonFiscalFallbackDialog
          failure={fallbackPrompt.failure}
          busy={fallbackBusy}
          onCancel={() => setFallbackPrompt(null)}
          onRetry={async () => {
            const pending = fallbackPrompt;
            // Cleared first so a second failure can raise its own prompt. Note
            // the retry is not free: if the connection came back and THIS
            // attempt times out, the failure escalates from not-dispatched to
            // unresolved, and the slip then needs the operator's attestation.
            setFallbackPrompt(null);
            setFallbackBusy(true);
            try {
              await handlePaymentConfirmed(pending.confirmation);
            } finally {
              setFallbackBusy(false);
            }
          }}
          onIssueSlip={async decision => {
            const pending = fallbackPrompt;
            setFallbackBusy(true);
            try {
              // Dismiss only once the slip actually exists. If issuing it fails
              // the operator keeps the dialog — and the sale — instead of being
              // dropped back to an empty till with nothing recorded anywhere.
              if (await handlePaymentConfirmed(pending.confirmation, decision)) {
                setFallbackPrompt(null);
              }
            } finally {
              setFallbackBusy(false);
            }
          }}
        />
      )}

      {employee && (
        <CashDrawerDialog
          open={showCashDrawer}
          employee={{
            id: employee.id,
            name: employee.name,
            employeeNumber: employee.employee_number,
          }}
          terminalLabel={settings.receipt.counterLabel}
          onClose={() => setShowCashDrawer(false)}
        />
      )}

      {/* Receipt Preview Modal */}
      {/* Receipt Preview Modal */}
      {receiptPreviewData && (
        <ReceiptDialog
          open={showReceiptPreview}
          onClose={() => {
            setShowReceiptPreview(false);
            setPostSalePrintAudit(null);
            setPrintNotice(null);
            if (nextReceiptAfterClose) {
              const next = nextReceiptAfterClose;
              setNextReceiptAfterClose(null);
              setReceiptPreviewData(next);
              setShowReceiptPreview(true);
            }
          }}
          receipt={receiptPreviewData}
          postSalePrintAudit={postSalePrintAudit}
          initialPrintNotice={printNotice}
        />
      )}

      {/*
        AGENTS: Do not delete — 2.ª via receipt history picker (commented until implemented). Remove only if explicitly requested by a human.
      <ReceiptHistorySelector
        open={showReceiptHistory}
        receipts={recentReceipts}
        onClose={() => setShowReceiptHistory(false)}
        onSelect={(r) => {
          setShowReceiptHistory(false);
          setPostSalePrintAudit(null);
          setReceiptPreviewData({ ...r, documentLabel: t('thermalReceipt.secondCopy') });
          setShowReceiptPreview(true);
        }}
      />
      */}

      {/* Auto-Logout Warning Modal */}
      {showAutoLogoutWarning && settings.autoLogout.enabled && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 w-[450px] max-w-md shadow-2xl border-4 border-yellow-400">
            <div className="text-center">
              <div className="bg-gradient-to-r from-yellow-500 to-orange-500 p-4 rounded-full inline-block mb-6">
                <Clock className="w-12 h-12 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-4">{t('pos.sessionTimeoutWarning')}</h3>
              <p className="text-lg text-gray-600 mb-2">
                {t('pos.autoLogoutMessage')}
              </p>
              <div className="text-4xl font-bold text-red-600 mb-6">
                {autoLogoutCountdown}s
              </div>
              <p className="text-sm text-gray-500 mb-8">
                {t('pos.securityNotice')}
              </p>

              <div className="flex space-x-4">
                <button
                  onClick={handleAutoLogout}
                  className={
                    shellButtons
                      ? `${shellButtons.danger} flex-1`
                      : 'flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-4 rounded-2xl min-h-touch transition-colors'
                  }
                >
                  {t('pos.logoutNow')}
                </button>
                <button
                  onClick={handleExtendSession}
                  className={
                    shellButtons
                      ? `${shellButtons.primary} flex-1 flex items-center justify-center space-x-2`
                      : 'flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-4 rounded-2xl min-h-touch transition-colors flex items-center justify-center space-x-2'
                  }
                >
                  <UserCircle className="w-5 h-5" />
                  <span>{t('pos.stayLoggedIn')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const POS: React.FC = () => <POSInner />;

export default POS;
