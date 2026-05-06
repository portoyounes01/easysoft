import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { generateQRCodeImage } from '../utils/qrCode';
import { NavLink } from 'react-router-dom';
import {
  ShoppingCart,
  X,
  CreditCard,
  Grid,
  Coffee,
  Milk,
  Cake,
  Candy,
  LogOut,
  UserCircle,
  Search,
  Phone,
  Mail,
  Users,
  Save,
  CreditCard as TaxIcon,
  Check,
  AlertCircle,
  Clock,
  Loader2,
  Package,
  RefreshCw,
  Menu,
  LayoutDashboard,
  BarChart3,
  Settings,
  FileText
} from 'lucide-react';
import { usePOS } from '../contexts/POSContext';
import { syncManager } from '../services/syncManager';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useProducts } from '../contexts/ProductsContext';
import OrderSummaryPanel from '../components/OrderSummaryPanel';
import DiscountDialog from '../components/DiscountDialog';
import { LocalProduct, LocalCustomer } from '../types/supabase';
import { useTranslation } from 'react-i18next';
// import { transactionService } from '../services/transactionService';
import { isSupabaseConfigured, checkSupabaseConnection } from '../lib/supabase';
import { customerLocalService, initializeLocalDatabase, transactionLocalService } from '../lib/localDatabase';
import { buildChainScope, computeSeriesKey } from '../fiscal/seriesUtils';
import { saftTypeToReceiptDocumentType } from '../fiscal/saleDocumentType';
import { ReceiptProps } from '../components/ThermalReceipt';
import ReceiptHistorySelector from '../components/ReceiptHistorySelector';
import { CustomerDialog } from '../components/CustomerDialog';
import PaymentDialog from '../components/PaymentDialog';
import ReceiptDialog from '../components/ReceiptDialog';
import { CategoryFilterButton } from '../components/ui/CategoryFilterButton';
import { ProductCard } from '../components/ui/ProductCard';

// Icon mapping for categories
const iconMap = {
  grid: Grid,
  coffee: Coffee,
  milk: Milk,
  cake: Cake,
  candy: Candy,
};


const POS: React.FC = () => {
  const { t } = useTranslation();
  const { cart, addToCart, clearCart, updateQuantity, selectedCustomer, selectCustomer, processTransaction } = usePOS();
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
  const [lastCompletedReceipt, setLastCompletedReceipt] = useState<ReceiptProps | null>(null);
  const [recentReceipts, setRecentReceipts] = useState<ReceiptProps[]>([]);
  const [showReceiptHistory, setShowReceiptHistory] = useState(false);
  const [nextReceiptAfterClose, setNextReceiptAfterClose] = useState<ReceiptProps | null>(null);
  const [lastFiscalInvoiceNo, setLastFiscalInvoiceNo] = useState<string | null>(null);

  const atValidationWarn = useMemo(() => {
    const raw = settings.receipt.atValidationCodeIssuedAt?.trim();
    if (!raw) return false;
    const t = new Date(raw).getTime();
    if (Number.isNaN(t)) return false;
    const days = (Date.now() - t) / (86400 * 1000);
    return days > 1000;
  }, [settings.receipt.atValidationCodeIssuedAt]);

  // Stock validation helper function
  const canAddToCart = (product: LocalProduct, requestedQuantity = 1): boolean => {
    // If negative stock is allowed, always allow
    if (settings.pos.allowNegativeStock) {
      return true;
    }

    // Find current quantity in cart
    const cartItem = cart.find(item => item.product.id === product.id);
    const currentCartQuantity = cartItem ? cartItem.quantity : 0;
    const totalRequestedQuantity = currentCartQuantity + requestedQuantity;

    // Check if total would exceed available stock
    return totalRequestedQuantity <= product.stock;
  };

  // Enhanced addToCart with stock validation
  const handleAddToCart = (product: LocalProduct, quantity = 1) => {
    // Only allow adding if stock validation passes
    // UI prevents clicks on out-of-stock items, but this is a safety check
    if (canAddToCart(product, quantity)) {
      addToCart(product, quantity);
    }
  };

  const handleDecrementCartLine = useCallback(
    (productId: string) => {
      const line = cart.find(item => item.product.id === productId);
      if (!line) return;
      updateQuantity(productId, line.quantity - 1);
    },
    [cart, updateQuantity]
  );

  // Quantity increases from product grid; order panel line tap removes one unit
  const [showPayment, setShowPayment] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  // POS uses a temporary navigation overlay instead of a persistent sidebar
  const [showNavigation, setShowNavigation] = useState(false);
  const [discount, setDiscount] = useState({ type: 'none' as 'none' | 'percentage' | 'fixed', value: 0 });
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);

  // Toggle sidebar and persist state
  // Collapsed state preserved; toggled via showNavigation overlay only in POS

  // Toggle navigation overlay
  const toggleNavigation = () => {
    setShowNavigation(!showNavigation);
  };

  const [cashReceived, setCashReceived] = useState(0);

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
        const sk = computeSeriesKey(settings.receipt, now);
        const at = settings.receipt.atValidationCode.trim();
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
  }, [
    settings.receipt.atValidationCode,
    settings.receipt.seriesPrefix,
    settings.receipt.resetPolicy,
    settings.receipt.numericWidth,
  ]);

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



  const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const discountAmount = discount.type === 'percentage'
    ? (subtotal * discount.value / 100)
    : discount.type === 'fixed'
      ? discount.value
      : 0;

  const discountedSubtotal = subtotal - discountAmount;

  // Calculate tax extracted from tax-inclusive prices (European style)
  const tax = cart.reduce((sum, item) => {
    const itemTotal = item.product.price * item.quantity;
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
  const changeAmount = cashReceived > finalTotal ? cashReceived - finalTotal : 0;

  // (category selection handled inline where used)

  const handleDiscountClick = () => {
    setShowDiscountDialog(true);
  };

  const handleClearAll = () => {
    clearCart();
    setDiscount({ type: 'none', value: 0 });
  };

  const handleLogout = () => {
    signOut();
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'from-red-500 to-pink-600';
      case 'manager':
        return 'from-orange-500 to-amber-600';
      case 'cashier':
        return 'from-blue-500 to-purple-600';
      default:
        return 'from-gray-500 to-slate-600';
    }
  };

  const renderCategoryIcon = (iconName: string) => {
    const IconComponent = iconMap[iconName as keyof typeof iconMap] || Grid;
    return <IconComponent className="w-4 h-4" />;
  };

  const handleCustomerSelect = (customer: LocalCustomer) => {
    selectCustomer(customer);
    setShowCustomerModal(false);
  };

  // Auto-clear cart timer management
  useEffect(() => {
    // Skip auto-clear if disabled or timeout is 0 (NEVER)
    if (!settings.pos.autoClearCart.enabled || settings.pos.autoClearCart.timeoutMinutes === 0 || cart.length === 0) {
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
  }, [lastCartActivity, cart.length, settings.pos.autoClearCart, clearCart]);

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

  return (
    <div className="h-screen flex bg-neutral-50">
      {/* Main Content Area - takes most space */}
      <div className="flex-1 flex flex-col">
        {settings.fiscal.trainingMode && (
          <div className="flex-none bg-orange-500 text-white text-center text-xl font-bold py-3 px-4">
            MODO DE FORMAÇÃO — documentos sem valor fiscal
          </div>
        )}
        {settings.receipt.seriesDiscontinued && (
          <div className="flex-none bg-amber-100 text-amber-950 text-center text-lg font-semibold py-2 px-4 border-b border-amber-300">
            Série fiscal descontinuada — confirme junto da AT antes de faturar.
          </div>
        )}
        {atValidationWarn && (
          <div className="flex-none bg-red-100 text-red-900 text-center text-lg font-semibold py-2 px-4 border-b border-red-200">
            Código de validação AT antigo — verifique renovação no Portal das Finanças.
          </div>
        )}
        {/* Top Header - only over left sidebar + center, not cart */}
        <div className="flex-none bg-white shadow-sm border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Left - Hamburger Menu only */}
            <div className="flex items-center">
              <button
                onClick={toggleNavigation}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title={t('pos.toggleNav')}
              >
                <Menu className="w-6 h-6 text-gray-600" />
              </button>
            </div>

            {/* Center - Search Bar */}
            <div className="flex-1 max-w-md mx-8">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('pos.searchProductPlaceholder')}
                  className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>


          </div>
        </div>

        {/* Navigation Overlay */}
        {showNavigation && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black bg-opacity-30 z-40"
              onClick={() => setShowNavigation(false)}
            />

            {/* Navigation Sidebar */}
            <div className="fixed top-0 left-0 h-full w-80 bg-gradient-to-b from-slate-900 to-slate-800 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col">
              <div className="p-6 border-b border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-2 rounded-lg flex-shrink-0">
                      <FileText className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h1 className="text-xl font-bold">{t('pos.brandTitle')}</h1>
                      <p className="text-slate-400 text-sm">{t('pos.brandSubtitle')}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowNavigation(false)}
                    className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <nav className="flex-1 p-4">
                <ul className="space-y-2">
                  {[
                    { path: '/', icon: LayoutDashboard, label: 'Dashboard', permission: 'dashboard' },
                    { path: '/pos', icon: ShoppingCart, label: 'Point of Sale', permission: 'sales' },
                    { path: '/products', icon: Package, label: 'Products', permission: 'inventory' },
                    { path: '/employees', icon: Users, label: 'Employees', permission: 'employees' },
                    { path: '/reports', icon: BarChart3, label: 'Reports', permission: 'reports' },
                    { path: '/transactions', icon: CreditCard, label: 'Transactions', permission: 'transactions' },
                    { path: '/settings', icon: Settings, label: 'Settings', permission: 'settings' }
                  ].map((item) => {
                    if (!employee) return null;
                    if (employee.role !== 'admin' && !employee.access_levels.includes(item.permission) && !employee.access_levels.includes('all')) return null;

                    const Icon = item.icon;
                    return (
                      <li key={item.path}>
                        <NavLink
                          to={item.path}
                          onClick={() => setShowNavigation(false)}
                          className={({ isActive }) =>
                            `flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 group relative ${isActive
                              ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg transform scale-105'
                              : 'text-slate-300 hover:bg-slate-700 hover:text-white hover:transform hover:scale-105'
                            }`
                          }
                        >
                          <Icon className="w-5 h-5 flex-shrink-0" />
                          <span className="font-medium">{item.label}</span>
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              <div className="p-4 border-t border-slate-700">
                <div className="flex items-center p-3 bg-slate-800 rounded-lg mb-3 space-x-3">
                  <div className={`bg-gradient-to-r ${getRoleColor(employee?.role || '')} p-2 rounded-full flex-shrink-0`}>
                    <UserCircle className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{employee?.name}</p>
                    <p className="text-slate-400 text-xs">{employee?.role.toUpperCase()}</p>
                  </div>
                </div>

                <button
                  onClick={() => setShowLogoutConfirm(true)}
                  className="w-full flex items-center px-4 py-3 text-slate-300 hover:bg-red-600 hover:text-white rounded-lg transition-all duration-200 hover:transform hover:scale-105 space-x-3"
                >
                  <LogOut className="w-5 h-5 group-hover:animate-pulse flex-shrink-0" />
                  <span className="font-medium">{t('common.logout')}</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* Content Area - Left sidebar + Center products */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Categories Sidebar - uses vw units to match CategoryFilterButton */}
          <div className="bg-neutral-100 flex flex-col" style={{ width: '8vw', paddingLeft: '0.5vw', paddingTop: '1.5vw' }}>
            {/* All Categories (including All Menu) */}
            <div className="flex-1 overflow-y-auto" style={{ padding: '0 0.5vw', gap: '0.5vw', display: 'flex', flexDirection: 'column' }}>
              {/* All Menu Option */}
              <CategoryFilterButton
                label="All Menu"
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
                      className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-2xl font-semibold flex items-center space-x-2 transition-colors"
                    >
                      <RefreshCw className="w-5 h-5" />
                      <span>{t('pos.retry')}</span>
                    </button>
                    <button
                      onClick={handleSyncData}
                      className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-2xl font-semibold flex items-center space-x-2 transition-colors"
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
                        className="min-h-touch px-6 rounded-2xl bg-green-500 hover:bg-green-600 text-white font-semibold text-lg transition-colors duration-200"
                      >
                        {t('pos.syncDegradedRetry')}
                      </button>
                      <button
                        type="button"
                        onClick={() => clearSyncError()}
                        className="min-h-touch px-6 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-lg transition-colors duration-200"
                      >
                        {t('pos.syncDegradedDismiss')}
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex-1 min-h-0 overflow-y-auto">
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
                            const cartItem = cart.find(item => item.product.id === product.id);
                            const cartQuantity = cartItem ? cartItem.quantity : 0;
                            const remainingStock = product.stock - cartQuantity;

                            return (
                              <ProductCard
                                key={product.id}
                                name={product.name}
                                price={product.price}
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
      </div>

      {/* Right Order Summary Panel (DEBUG 30/40/30) */}
      <OrderSummaryPanel
        items={cart.map(item => ({ product: item.product, quantity: item.quantity }))}
        onClearAll={handleClearAll}
        onDecrementCartLine={handleDecrementCartLine}
        customerSummary={
          selectedCustomer
            ? { name: selectedCustomer.name, taxNumber: selectedCustomer.tax_number }
            : undefined
        }
        onCustomer={() => setShowCustomerModal(true)}
        onTables={() => { }}
        onDiscount={handleDiscountClick}
        onSaveBill={() => {
          if (!lastCompletedReceipt) return;
          setShowReceiptHistory(true);
        }}
        canSaveBill={Boolean(lastCompletedReceipt)}
        onProcess={() => setShowPayment(true)}
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

      <DiscountDialog
        open={showDiscountDialog}
        onClose={() => setShowDiscountDialog(false)}
        presets={[
          { id: 'p10', name: 'Promo 10%', type: 'percentage', value: 10, description: 'Seasonal discount' },
          { id: 'p15', name: 'Promo 15%', type: 'percentage', value: 15 },
          { id: 'f2', name: '€2 Off', type: 'fixed', value: 2 },
          { id: 'f5', name: '€5 Off', type: 'fixed', value: 5, description: 'Limited time' }
        ]}
        onApply={(res) => {
          setDiscount({ type: res.type, value: res.value });
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
          onClose={() => {
            setShowPayment(false);
            setCashReceived(0);
          }}
          onConfirm={async () => {
            const cartSnapshot = cart.map((ci) => ({ ...ci }));
            const paymentMethod = cashReceived > 0 ? 'cash' : 'card' as const;
            const employeeId = employee?.id || 'unknown-employee';
            const employeeName = employee?.name || 'Employee';

            try {
              const { fiscal } = await processTransaction(
                {
                  paymentMethod,
                  amountPaid: cashReceived > 0 ? cashReceived : undefined,
                  employeeId,
                  employeeName,
                  employeeNumber: employee?.employee_number,
                },
                () => {
                  setDiscount({ type: 'none', value: 0 });
                },
                {
                  type: discount.type,
                  value: discount.value,
                  amount: discountAmount + customerDiscountAmount,
                },
                { settings, updateSettings }
              );

              if (isSupabaseConfigured() && await checkSupabaseConnection()) {
                try {
                  syncManager.forceSync().catch(() => { });
                } catch {
                  /* ignore */
                }
              }

              const qrCodeImage = fiscal
                ? await generateQRCodeImage(fiscal.qrPayload)
                : undefined;

              const receiptData: ReceiptProps = {
                documentType: fiscal
                  ? saftTypeToReceiptDocumentType(fiscal.invoiceTypeSaft)
                  : (settings.receipt.defaultDocumentType as 'FATURA' | 'FATURA_SIMPLIFICADA'),
                date: new Date(),
                counter: settings.receipt.counterLabel,
                verificationCode: fiscal?.atcudBody || '',
                documentNumber: fiscal?.invoiceNo || '',
                documentHash: fiscal?.hashBase64,
                hashFourChars: fiscal?.hashFourChars,
                qrCodeData: fiscal?.qrPayload,
                qrCodeImage,
                trainingMode: settings.fiscal.trainingMode,
                documentLabel: 'Original',
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
                customer: selectedCustomer
                  ? (() => {
                      const c = selectedCustomer;
                      const morada = [
                        c.address?.trim(),
                        [c.postal_code?.trim(), c.city?.trim()]
                          .filter(Boolean)
                          .join(' '),
                      ]
                        .filter(Boolean)
                        .join(', ');
                      return {
                        name: c.name,
                        taxNumber: c.tax_number?.trim() || undefined,
                        address: morada || undefined,
                      };
                    })()
                  : undefined,
                items: cartSnapshot.map((ci) => ({
                  id: ci.product.id,
                  description: ci.product.name,
                  quantity: ci.quantity,
                  unitPrice: ci.product.price,
                  vatRate: Math.round((ci.product.iva_rate || 0) * 100),
                  total: Number((ci.product.price * ci.quantity).toFixed(2)),
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
                  method: cashReceived > 0 ? 'Numerário' : 'Multibanco',
                  amountGiven: Number(cashReceived.toFixed(2)),
                  change: Number(changeAmount.toFixed(2)),
                },
                slogan: settings.company.slogan || undefined,
                softwareInfo: settings.company.softwareInfo || undefined,
                certificationNumber: settings.company.certificationNumber || undefined,
              };

              setShowPayment(false);
              setReceiptPreviewData(receiptData);
              setLastCompletedReceipt(receiptData);
              setRecentReceipts((prev) => [receiptData, ...prev].slice(0, 20));
              setNextReceiptAfterClose(
                settings.receipt.printDuplicateOnIssue !== false
                  ? { ...receiptData, documentLabel: 'Duplicado' }
                  : null
              );
              if (fiscal?.invoiceNo) {
                setLastFiscalInvoiceNo(fiscal.invoiceNo);
              }
              setShowReceiptPreview(true);
            } catch (e) {
              console.error('Checkout failed', e);
              alert(e instanceof Error ? e.message : 'Pagamento falhou');
            }
          }}
        />
      )}

      {/* Receipt Preview Modal */}
      {/* Receipt Preview Modal */}
      {receiptPreviewData && (
        <ReceiptDialog
          open={showReceiptPreview}
          onClose={() => {
            setShowReceiptPreview(false);
            if (nextReceiptAfterClose) {
              const next = nextReceiptAfterClose;
              setNextReceiptAfterClose(null);
              setReceiptPreviewData(next);
              setShowReceiptPreview(true);
            }
          }}
          receipt={receiptPreviewData}
        />
      )}

      {/* Receipt History Selector for Duplicado (2.ª via) */}
      <ReceiptHistorySelector
        open={showReceiptHistory}
        receipts={recentReceipts}
        onClose={() => setShowReceiptHistory(false)}
        onSelect={(r) => {
          setShowReceiptHistory(false);
          setReceiptPreviewData({ ...r, documentLabel: 'Duplicado' });
          setShowReceiptPreview(true);
        }}
      />

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 w-[400px] max-w-md shadow-2xl">
            <div className="text-center">
              <div className={`bg-gradient-to-r ${getRoleColor(employee?.role || '')} p-4 rounded-full inline-block mb-6`}>
                <UserCircle className="w-12 h-12 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-4">{t('pos.confirmLogoutTitle')}</h3>
              <p className="text-lg text-gray-600 mb-2">
                {t('pos.confirmLogoutQuestion')}, <strong>{employee?.name}</strong>?
              </p>
              <p className="text-sm text-gray-500 mb-8">
                {t('pos.unsavedWork')}
              </p>

              <div className="flex space-x-4">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-4 rounded-2xl min-h-touch transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold py-4 rounded-2xl min-h-touch transition-colors flex items-center justify-center space-x-2"
                >
                  <LogOut className="w-5 h-5" />
                  <span>{t('common.logout')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Logout Warning Modal */}
      {showAutoLogoutWarning && settings.autoLogout.enabled && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
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
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-4 rounded-2xl min-h-touch transition-colors"
                >
                  {t('pos.logoutNow')}
                </button>
                <button
                  onClick={handleExtendSession}
                  className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-4 rounded-2xl min-h-touch transition-colors flex items-center justify-center space-x-2"
                >
                  <UserCircle className="w-5 h-5" />
                  <span>{t('pos.stayLoggedIn')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}



      {/* Bottom User Status Bar */}
      <div id="pos-status-bar" className="fixed bottom-0 left-0 bg-white border-t border-gray-200 px-3 py-1 z-10" style={{ right: '24.5vw' }}>
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center space-x-3">
            <p className="text-xs font-medium text-gray-800">{employee?.name} • <span className="capitalize text-gray-600">{employee?.role}</span></p>
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
                Cart: {Math.floor(cartClearCountdown / 60000)}:{String(Math.floor((cartClearCountdown % 60000) / 1000)).padStart(2, '0')}
              </span>
            )}
            <span>POS Terminal • {new Date().toLocaleDateString('pt-PT')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default POS;